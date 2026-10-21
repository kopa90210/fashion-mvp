"""Authenticated, versioned HTTP wrapper around the notebook's GPU functions.

Import this module in Colab after loading the notebook models. The notebook
functions are injected, so this module can be tested without a GPU.
"""

from __future__ import annotations

import base64
import hmac
import io
import json
import math
import threading
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
MAX_GARMENTS = 8
MAX_ARTIFACT_BYTES = 4 * 1024 * 1024


def _png_base64(image: Image.Image) -> str:
    image = image.copy()
    image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    data = buffer.getvalue()
    if not data or len(data) > MAX_ARTIFACT_BYTES:
        raise ValueError("Artifact exceeds limit")
    return base64.b64encode(data).decode("ascii")


def _metadata(value: Any) -> dict[str, Any] | None:
    # Qwen's notebook helper returns a one-element list of JSON strings.
    if isinstance(value, list):
        value = value[0] if len(value) == 1 else None
    if isinstance(value, str):
        try:
            cleaned = value.strip()
            if cleaned.startswith("```") and cleaned.endswith("```"):
                cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            value = json.loads(cleaned)
        except json.JSONDecodeError:
            return None
    if not isinstance(value, dict):
        return None
    try:
        if len(json.dumps(value)) > 16_384:
            return None
    except (TypeError, ValueError):
        return None
    return value


def _box(raw: Any, width: int, height: int) -> dict[str, float]:
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        raise ValueError("Invalid detection box")
    x1, y1, x2, y2 = raw
    if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v)
           for v in raw) or not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
        raise ValueError("Invalid detection box")
    return {"x": x1 / width, "y": y1 / height,
            "width": (x2 - x1) / width, "height": (y2 - y1) / height}


def create_app(
    *,
    token: str,
    segmenter: Callable[[Image.Image], list[dict[str, Any]]],
    reconstructor: Callable[[Image.Image], Image.Image],
    metadata_extractor: Callable[[Image.Image], Any],
) -> FastAPI:
    if len(token) < 24:
        raise ValueError("An internal token of at least 24 characters is required")
    app = FastAPI(title="StyleGraph outfit inference bridge", version="1")
    inference_lock = threading.Lock()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ready", "contract": "outfit-v1"}

    @app.post("/v1/outfit-extract")
    def extract(
        file: UploadFile = File(...),
        x_internal_token: str = Header(default=""),
    ) -> dict[str, Any]:
        if not hmac.compare_digest(x_internal_token, token):
            raise HTTPException(status_code=401, detail="Unauthorized")
        data = file.file.read(MAX_UPLOAD_BYTES + 1)
        if not 0 < len(data) <= MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Image size is invalid")
        try:
            with Image.open(io.BytesIO(data)) as opened:
                if opened.format not in ("JPEG", "PNG", "WEBP"):
                    raise ValueError("Unsupported image format")
                if opened.width * opened.height > MAX_PIXELS:
                    raise ValueError("Image dimensions exceed limit")
                image = ImageOps.exif_transpose(opened).convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="Invalid image") from exc
        if not inference_lock.acquire(blocking=False):
            raise HTTPException(status_code=503, detail="Inference is busy")
        try:
            detections = segmenter(image)
            if not isinstance(detections, list) or len(detections) > MAX_GARMENTS:
                raise ValueError("Invalid garment count")
            garments = []
            for index, detection in enumerate(detections):
                crop = detection["image"]
                if not isinstance(crop, Image.Image):
                    raise ValueError("Invalid garment crop")
                box = _box(detection.get("crop_box", detection["box"]), image.width, image.height)
                score = detection["score"]
                if not isinstance(score, (int, float)) or isinstance(score, bool) \
                        or not math.isfinite(score) or not 0 <= score <= 1:
                    raise ValueError("Invalid detection confidence")
                reconstructed = None
                reconstruction_status = "failed"
                try:
                    reconstructed = reconstructor(crop)
                    if not isinstance(reconstructed, Image.Image):
                        raise ValueError("Invalid reconstruction")
                    reconstructed_png = _png_base64(reconstructed)
                    reconstruction_status = "done"
                except Exception:
                    reconstructed_png = None
                    reconstructed = None
                try:
                    extracted = _metadata(metadata_extractor(reconstructed or crop))
                except Exception:
                    extracted = None
                garments.append({
                    "id": str(index), "label": str(detection["label"])[:80],
                    "confidence": float(score), "box": box,
                    "segmented_image_base64": _png_base64(crop),
                    "reconstructed_image_base64": reconstructed_png,
                    "reconstruction_status": reconstruction_status,
                    "metadata": extracted,
                    "metadata_status": "valid" if extracted is not None else "invalid",
                })
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="Inference output is invalid") from exc
        finally:
            inference_lock.release()
        return {"version": "outfit-v1", "garments": garments}

    return app
