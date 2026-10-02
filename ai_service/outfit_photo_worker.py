"""Validate notebook inference and store generated garment images privately.

No database row is written here. The caller commits the validated artifacts in
one completion RPC after all Storage uploads succeed.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
import json
import math
import uuid
from typing import Any
from urllib.parse import urlparse

import httpx
from PIL import Image, UnidentifiedImageError


class InvalidProviderOutput(Exception):
    """Malformed or unsafe notebook result; never log its raw payload."""


class RemoteProviderUnavailable(Exception):
    """The configured notebook endpoint is unavailable."""


LABEL_CATEGORY = {
    "shirt, blouse": "top", "top, t-shirt, sweatshirt": "top",
    "sweater": "top", "cardigan": "top", "jacket": "outerwear",
    "vest": "outerwear", "coat": "outerwear", "cape": "outerwear",
    "pants": "bottom", "shorts": "bottom", "skirt": "bottom",
    "dress": "top", "jumpsuit": "top", "shoe": "footwear",
    "sock": "accessory", "tights, stockings": "accessory",
    "leg warmer": "accessory", "hat": "accessory",
    "headband, head covering, Cap": "accessory", "bag, wallet": "accessory",
    "scarf": "accessory", "belt": "accessory", "watch": "accessory",
    "glasses": "accessory", "tie": "accessory", "glove": "accessory",
}
CATEGORIES = {"top", "bottom", "footwear", "outerwear", "accessory"}
MAX_RESPONSE_BYTES = 100 * 1024 * 1024
MAX_PNG_BYTES = 4 * 1024 * 1024


def _bounded_text(value: Any, maximum: int, fallback: str = "") -> str:
    if not isinstance(value, str):
        return fallback
    value = value.strip()
    return value[:maximum] if value else fallback


def _unit_number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return float(value) if 0 <= value <= 1 else None


def _weights(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    result = {}
    for key, weight in list(value.items())[:20]:
        parsed = _unit_number(weight)
        if isinstance(key, str) and len(key) <= 40 and parsed is not None:
            result[key] = parsed
    return result


def _png(value: Any) -> tuple[bytes, int, int]:
    if not isinstance(value, str) or len(value) > MAX_PNG_BYTES * 2:
        raise InvalidProviderOutput("Invalid PNG artifact")
    try:
        data = base64.b64decode(value, validate=True)
        if not 0 < len(data) <= MAX_PNG_BYTES:
            raise ValueError("Invalid PNG size")
        with Image.open(io.BytesIO(data)) as opened:
            if opened.format != "PNG" or not (0 < opened.width <= 1024 and 0 < opened.height <= 1024):
                raise ValueError("Invalid PNG dimensions")
            opened.load()
            return data, opened.width, opened.height
    except (binascii.Error, UnidentifiedImageError, OSError, ValueError) as exc:
        raise InvalidProviderOutput("Invalid PNG artifact") from exc


def _box(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        raise InvalidProviderOutput("Invalid garment box")
    values = {key: _unit_number(value.get(key)) for key in ("x", "y", "width", "height")}
    if any(v is None for v in values.values()) or not values["width"] or not values["height"] \
      or values["x"] + values["width"] > 1 \
      or values["y"] + values["height"] > 1:
        raise InvalidProviderOutput("Invalid garment box")
    return values


def _normalize_garment(row: Any) -> tuple[dict[str, Any], tuple[bytes, int, int], tuple[bytes, int, int] | None]:
    if not isinstance(row, dict):
        raise InvalidProviderOutput("Invalid garment")
    label = _bounded_text(row.get("label"), 80, "Garment")
    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    proposed_category = metadata.get("category")
    category = proposed_category if isinstance(proposed_category, str) and proposed_category in CATEGORIES else LABEL_CATEGORY.get(label)
    if category not in CATEGORIES:
        raise InvalidProviderOutput("Unmapped garment category")
    confidence = _unit_number(row.get("confidence"))
    if confidence is None:
        raise InvalidProviderOutput("Invalid detection confidence")
    model_confidence = _unit_number(metadata.get("model_confidence"))
    primary = _bounded_text((metadata.get("color") or {}).get("primary") if isinstance(metadata.get("color"), dict) else None, 80, "Unknown")
    original = _png(row.get("segmented_image_base64"))
    reconstruction = None
    if row.get("reconstructed_image_base64") is not None:
        try:
            reconstruction = _png(row["reconstructed_image_base64"])
        except InvalidProviderOutput:
            reconstruction = None
    material = metadata.get("material") if isinstance(metadata.get("material"), dict) else {}
    fit = metadata.get("fit") if isinstance(metadata.get("fit"), dict) else {}
    season = metadata.get("season_weights") if isinstance(metadata.get("season_weights"), dict) else {}
    normalized = {
        "category": category,
        "subcategory": _bounded_text(metadata.get("subcategory"), 80) or label[:80],
        "display_name": _bounded_text(metadata.get("display_name"), 120, label.title()),
        "color": {"primary": primary},
        "material": {"primary": _bounded_text(material.get("primary"), 80), "weights": _weights(material.get("weights"))},
        "fit": {"weights": _weights(fit.get("weights"))},
        "pattern": _bounded_text(metadata.get("pattern"), 40) or None,
        "style_tags": _weights(metadata.get("style_tags")),
        "season_weights": _weights(season),
        "formality_score": _unit_number(metadata.get("formality_score")),
        "confidence": min(confidence, model_confidence) if model_confidence is not None else confidence,
        "box": _box(row.get("box")),
    }
    return normalized, original, reconstruction


def _upload(db: Any, user_id: str, artifact: tuple[bytes, int, int]) -> dict[str, Any]:
    data, width, height = artifact
    path = f"{user_id}/{uuid.uuid4()}.png"
    db.upload_private_png(user_id, path, data)
    return {"object_path": path, "byte_size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "width": width, "height": height}


def extract_outfit_photo(
    db: Any, job: dict[str, Any], endpoint_url: str, token: str,
    client: httpx.Client | None = None,
) -> list[dict[str, Any]]:
    parsed_url = urlparse(endpoint_url)
    if parsed_url.scheme != "https" or not parsed_url.netloc or parsed_url.username or parsed_url.password \
      or parsed_url.query or parsed_url.fragment or len(token) < 24:
        raise RemoteProviderUnavailable("Remote pipeline is not configured")
    user_id = job["user_id"]
    photos = db.rows("source_photos", {"id": f"eq.{job.get('source_photo_id')}",
        "user_id": f"eq.{user_id}", "select": "id,media_asset_id,status", "limit": "1"})
    if not photos or photos[0]["status"] != "detecting" or not photos[0].get("media_asset_id"):
        raise InvalidProviderOutput("Source photo unavailable")
    assets = db.rows("media_assets", {"id": f"eq.{photos[0]['media_asset_id']}",
        "owner_id": f"eq.{user_id}", "select": "bucket_id,object_path,kind,status", "limit": "1"})
    if not assets or assets[0]["kind"] != "source_photo" or assets[0]["status"] != "active" \
      or not assets[0]["object_path"].startswith(f"{user_id}/"):
        raise InvalidProviderOutput("Private source photo unavailable")
    image, mime = db.private_image(assets[0]["bucket_id"], assets[0]["object_path"])
    owns_client = client is None
    client = client or httpx.Client(timeout=600, follow_redirects=False)
    try:
        with client.stream(
    "POST",
    endpoint_url.rstrip("/") + "/v1/outfit-extract",
    headers={
        "X-Internal-Token": token,
        "ngrok-skip-browser-warning": "true",
    },
    files={
        "file": (
            "outfit",
            image,
            mime,
        )
    },
) as response:
            if response.status_code != 200:
                raise RemoteProviderUnavailable("Remote pipeline request failed")
            body = bytearray()
            for chunk in response.iter_bytes():
                body.extend(chunk)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise InvalidProviderOutput("Remote response exceeds limit")
        try:
            payload = json.loads(body)
        except ValueError as exc:
            raise InvalidProviderOutput("Remote response is not JSON") from exc
    except httpx.HTTPError as exc:
        raise RemoteProviderUnavailable("Remote pipeline unavailable") from exc
    finally:
        if owns_client:
            client.close()
    if not isinstance(payload, dict) or payload.get("version") != "outfit-v1" \
      or not isinstance(payload.get("garments"), list) or len(payload["garments"]) > 8:
        raise InvalidProviderOutput("Remote response contract mismatch")
    normalized = [_normalize_garment(row) for row in payload["garments"]]
    uploaded_paths: list[str] = []
    results = []
    try:
        for data, original, reconstruction in normalized:
            original_asset = _upload(db, user_id, original)
            uploaded_paths.append(original_asset["object_path"])
            reconstructed_asset = _upload(db, user_id, reconstruction) if reconstruction else None
            if reconstructed_asset:
                uploaded_paths.append(reconstructed_asset["object_path"])
            results.append({**data, "original": original_asset, "reconstructed": reconstructed_asset})
    except Exception:
        # No completion RPC was attempted, so these paths cannot be referenced by a draft.
        for path in uploaded_paths:
            try:
                db.delete_private_image(user_id, path)
            except Exception:
                pass
        raise
    return results
