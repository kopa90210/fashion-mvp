from __future__ import annotations

import base64
import binascii
import io
from dataclasses import dataclass
from typing import Any

from PIL import Image


SCHEMA_VERSION = "curated-v1"
MANIFEST_VERSION = "curated-cache-v1"
MAX_CUTOUT_BYTES = 25 * 1024 * 1024

FORBIDDEN_KEYS = {
    "brand",
    "brand_name",
    "product_name",
    "sku",
    "price",
    "retailer",
    "logo",
}
REQUIRED_FIELDS = {
    "category",
    "subcategory",
    "display_name",
    "color",
    "material",
    "fit",
    "pattern",
    "style_tags",
    "formality_score",
    "season_weights",
    "layer_role",
    "model_confidence",
}
VALID_CATEGORIES = {"top", "bottom", "one_piece", "outerwear", "footwear", "accessory"}
VALID_LAYER_ROLES = {
    "base_layer",
    "mid_layer",
    "outerwear",
    "bottom",
    "one_piece",
    "footwear",
    "accessory",
}


class ContractError(ValueError):
    """A remote response or cached artifact does not satisfy the contract."""


@dataclass(frozen=True)
class ValidatedRemoteResult:
    schema_version: str
    attributes: dict[str, Any]
    png_bytes: bytes
    width: int
    height: int


def strip_forbidden_keys(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: strip_forbidden_keys(child)
            for key, child in value.items()
            if key.lower() not in FORBIDDEN_KEYS
        }
    if isinstance(value, list):
        return [strip_forbidden_keys(item) for item in value]
    return value


def normalize_attributes(attributes: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(attributes)
    category = str(attributes.get("category", "")).strip().lower()
    if category in VALID_CATEGORIES:
        normalized["category"] = category
    else:
        lowered = category.replace("-", " ").replace("_", " ")
        if any(word in lowered for word in ("dress", "jumpsuit", "romper", "gown")):
            normalized["category"] = "one_piece"
        elif any(word in lowered for word in ("shoe", "sneaker", "boot", "loafer")):
            normalized["category"] = "footwear"
        elif any(word in lowered for word in ("coat", "outerwear", "blazer")):
            normalized["category"] = "outerwear"
        elif any(word in lowered for word in ("shirt", "top", "blouse", "tee", "sweater", "jacket")):
            normalized["category"] = "top"
        elif any(word in lowered for word in ("pant", "trouser", "jean", "skirt", "short", "bottom")):
            normalized["category"] = "bottom"
        elif any(word in lowered for word in ("accessory", "bag", "belt", "hat", "jewelry")):
            normalized["category"] = "accessory"
        else:
            normalized["category"] = category or "accessory"

    layer_role = str(attributes.get("layer_role", "")).strip().lower()
    if layer_role == "outer_layer":
        layer_role = "outerwear"
    if layer_role in VALID_LAYER_ROLES:
        normalized["layer_role"] = layer_role
    else:
        normalized["layer_role"] = {
            "top": "base_layer",
            "bottom": "bottom",
            "one_piece": "one_piece",
            "outerwear": "outerwear",
            "footwear": "footwear",
        }.get(str(normalized.get("category")), "accessory")
    return normalized


def validate_attributes(attributes: dict[str, Any], min_confidence: float) -> list[str]:
    problems: list[str] = []
    missing = sorted(field for field in REQUIRED_FIELDS if field not in attributes)
    if missing:
        problems.append(f"missing required fields: {', '.join(missing)}")

    category = str(attributes.get("category", "")).strip().lower()
    if category not in VALID_CATEGORIES:
        problems.append(f"category must be one of {sorted(VALID_CATEGORIES)}, got {attributes.get('category')!r}")
    layer_role = str(attributes.get("layer_role", "")).strip().lower()
    if layer_role not in VALID_LAYER_ROLES:
        problems.append(f"layer_role must be one of {sorted(VALID_LAYER_ROLES)}, got {attributes.get('layer_role')!r}")

    confidence = attributes.get("model_confidence")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        problems.append("model_confidence is missing or not numeric")
    elif not 0 <= float(confidence) <= 1:
        problems.append("model_confidence must be between 0 and 1")
    elif confidence < min_confidence:
        problems.append(f"model_confidence {confidence} is below minimum {min_confidence}")

    for field in ("color", "material", "fit", "style_tags", "season_weights"):
        if field in attributes and not isinstance(attributes[field], dict):
            problems.append(f"{field} must be a JSON object")
    for field in ("subcategory", "display_name", "pattern"):
        if field in attributes and (not isinstance(attributes[field], str) or not attributes[field].strip()):
            problems.append(f"{field} must be a non-empty string")
    formality = attributes.get("formality_score")
    if "formality_score" in attributes and (
        isinstance(formality, bool) or not isinstance(formality, (int, float)) or not 0 <= float(formality) <= 1
    ):
        problems.append("formality_score must be between 0 and 1")
    return problems


def _decode_and_verify_png(cutout: Any) -> tuple[bytes, int, int]:
    if not isinstance(cutout, dict):
        raise ContractError("cutout must be a JSON object")
    if cutout.get("mime_type") != "image/png":
        raise ContractError("cutout.mime_type must be image/png")
    width, height = cutout.get("width"), cutout.get("height")
    if isinstance(width, bool) or not isinstance(width, int) or width <= 0:
        raise ContractError("cutout.width must be a positive integer")
    if isinstance(height, bool) or not isinstance(height, int) or height <= 0:
        raise ContractError("cutout.height must be a positive integer")
    encoded = cutout.get("png_base64")
    if not isinstance(encoded, str) or not encoded:
        raise ContractError("cutout.png_base64 must be a non-empty string")
    try:
        png_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ContractError("cutout.png_base64 is invalid") from exc
    if len(png_bytes) > MAX_CUTOUT_BYTES:
        raise ContractError("decoded cutout exceeds the size limit")
    try:
        with Image.open(io.BytesIO(png_bytes)) as image:
            image.verify()
        with Image.open(io.BytesIO(png_bytes)) as image:
            actual_width, actual_height = image.size
            has_alpha = image.mode in {"RGBA", "LA"} or "transparency" in image.info
            image_format = image.format
    except Exception as exc:
        raise ContractError("decoded cutout is not a valid PNG") from exc
    if image_format != "PNG":
        raise ContractError("decoded cutout is not a PNG")
    if (actual_width, actual_height) != (width, height):
        raise ContractError("cutout dimensions do not match the PNG")
    if not has_alpha:
        raise ContractError("cutout PNG must support transparency")
    return png_bytes, width, height


def validate_remote_response(payload: Any, min_confidence: float) -> ValidatedRemoteResult:
    if not isinstance(payload, dict):
        raise ContractError("response must be a JSON object")
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise ContractError(f"schema_version must be {SCHEMA_VERSION}")
    raw_attributes = payload.get("attributes")
    if not isinstance(raw_attributes, dict):
        raise ContractError("attributes must be a JSON object")
    attributes = normalize_attributes(strip_forbidden_keys(raw_attributes))
    problems = validate_attributes(attributes, min_confidence)
    if problems:
        raise ContractError("; ".join(problems))
    png_bytes, width, height = _decode_and_verify_png(payload.get("cutout"))
    return ValidatedRemoteResult(SCHEMA_VERSION, attributes, png_bytes, width, height)
