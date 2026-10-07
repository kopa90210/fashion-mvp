from __future__ import annotations

import base64
import hashlib
import io
import logging
import random
import time
import uuid
from typing import Any

from google import genai
from PIL import Image

from ai_service.config import Settings
from ai_service.outfit_photo_observability import (
    OutfitPhotoObservation, current_observation, elapsed_ms, log_event, observe_outfit_photo,
)
from ai_service.outfit_photo_worker import (
    InvalidProviderOutput,
    RemoteProviderUnavailable,
)

from ai_service.providers.outfit.gemini_mask import (
    render_segmented_garment,
)

from ai_service.providers.outfit.gemini_normalizer import (
    normalize_category,
    normalize_confidence,
    normalize_fit,
    normalize_pattern,
    normalize_style_tags,
    normalized_box,
)

from ai_service.providers.outfit.gemini_schema import (
    GeminiGarment,
    GeminiOutfitResponse,
)


logger = logging.getLogger(__name__)


PROMPT = """
Analyze the outfit worn by the main person.

Identify only visible garments that would be useful as wardrobe items.

Return at most 8 logical wardrobe pieces.

IMPORTANT:
- A pair of shoes is ONE footwear item.
- Do not return body parts.
- Do not return background objects.
- Do not invent brands.
- Do not invent materials that cannot be visually determined.
- Prefer fewer high-quality garments over uncertain detections.

For every garment return:

category:
One of exactly:
- top
- bottom
- one_piece
- footwear
- outerwear
- accessory

subcategory:
A concise fashion type such as:
button-up shirt, t-shirt, jeans, trousers, dress, jumpsuit,
sneakers, jacket, sunglasses, watch.

display_name:
A natural wardrobe-friendly name.

color_primary:
Main visible color.

pattern:
One of:
solid, striped, checked, graphic, floral,
other, unknown.

fit:
One of:
slim, regular, relaxed, oversized, unknown.

style_tags:
Up to 5 concise style descriptions.

formality_score:
Number between 0 and 1.

confidence:
Number between 0 and 1 describing confidence that
the garment and basic classification are correct.

Also return:
- box_2d as [ymin, xmin, ymax, xmax]
  normalized 0-1000
- segmentation mask polygon normalized 0-1000

Do not include hidden or uncertain garment details.
"""


class GeminiOutfitProvider:
    name = "google-gemini"
    prompt_version = "gemini-outfit-v1"
    schema_version = "outfit-v1"

    def __init__(
        self,
        settings: Settings,
        client: Any | None = None,
    ) -> None:
        if not settings.gemini_api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is required "
                "when OUTFIT_PROVIDER=gemini"
            )

        self._settings = settings

        self.model = (
            settings.gemini_outfit_model
        )

        self._client = (
            client
            if client is not None
            else genai.Client(
                api_key=settings.gemini_api_key
            )
        )


    def _call_gemini(
        self,
        image: bytes,
        mime_type: str,
    ) -> GeminiOutfitResponse:

        encoded = base64.b64encode(
            image
        ).decode("utf-8")

        max_attempts = 4
        last_error: Exception | None = None
        request_started = time.monotonic()

        for attempt in range(
            1,
            max_attempts + 1,
        ):
            log_event(logger, "provider_request_started", model=self.model, attempt=attempt)
            try:
                interaction = (
                    self._client
                    .interactions
                    .create(
                        model=self.model,
                        input=[
                            {
                                "type": "text",
                                "text": PROMPT,
                            },
                            {
                                "type": "image",
                                "data": encoded,
                                "mime_type": mime_type,
                            },
                        ],
                        response_format={
                            "type": "text",
                            "mime_type":
                                "application/json",
                            "schema":
                                GeminiOutfitResponse
                                .model_json_schema(),
                        },
                        generation_config={
                            "thinking_level": "low",
                        },
                    )
                )

                try:
                    result = (
                        GeminiOutfitResponse
                        .model_validate_json(
                            interaction.output_text
                        )
                    )
                except Exception as exc:
                    raise InvalidProviderOutput(
                        "Gemini response failed "
                        "schema validation"
                    ) from exc

                if (
                    len(result.boxes)
                    > self._settings.outfit_max_garments
                ):
                    raise InvalidProviderOutput(
                        "Gemini returned too many garments"
                    )

                log_event(logger, "provider_request_completed", duration_ms=elapsed_ms(request_started),
                          garment_count=len(result.boxes), model=self.model)
                return result

            except InvalidProviderOutput:
                raise

            except Exception as exc:
                last_error = exc

                message = str(exc).lower()

                transient = any(
                    value in message
                    for value in (
                        "503",
                        "service_unavailable",
                        "high demand",
                        "429",
                        "rate limit",
                        "timeout",
                    )
                )

                if (
                    not transient
                    or attempt == max_attempts
                ):
                    raise RemoteProviderUnavailable(
                        "Gemini outfit provider unavailable"
                    ) from exc

                delay = min(
                    2 ** attempt
                    + random.uniform(0, 1),
                    15,
                )

                failure_category = (
                    "503" if any(value in message for value in ("503", "service_unavailable", "high demand"))
                    else "429" if any(value in message for value in ("429", "rate limit"))
                    else "timeout"
                )
                log_event(logger, "provider_request_retry", level=logging.WARNING,
                          attempt=attempt, failure_category=failure_category,
                          retry_delay_ms=round(delay * 1000), model=self.model)
                time.sleep(delay)

        raise RemoteProviderUnavailable(
            "Gemini outfit provider unavailable"
        ) from last_error        


    def _normalize(
        self,
        garment: GeminiGarment,
    ) -> dict[str, Any] | None:

        category = normalize_category(
            garment.category,
            garment.subcategory,
        )

        confidence = normalize_confidence(
            garment.confidence
        )

        # Core garments can tolerate slightly
        # lower confidence than tiny accessories.
        minimum_confidence = (
            0.85
            if category == "accessory"
            else 0.70
        )

        if confidence < minimum_confidence:
            return None

        subcategory = (
            garment.subcategory.strip()[:80]
            or category
        )

        display_name = (
            garment.display_name.strip()[:120]
            or subcategory.title()
        )

        color = (
            garment.color_primary.strip()[:80]
            or "Unknown"
        )

        return {
            "category": category,

            "subcategory": subcategory,

            "display_name": display_name,

            "color": {
                "primary": color,
            },

            # Do not hallucinate material yet.
            "material": {
                "primary": "",
                "weights": {},
            },

            "fit": {
                "weights": normalize_fit(
                    category,
                    garment.fit,
                ),
            },

            "pattern": normalize_pattern(
                garment.pattern
            ),

            "style_tags": normalize_style_tags(
                garment.style_tags
            ),

            "season_weights": {},

            "formality_score":
                normalize_confidence(
                    garment.formality_score
                ),

            "confidence": confidence,

            "box": normalized_box(
                garment.box_2d
            ),
        }
    def _upload_crop(
        self,
        db: Any,
        user_id: str,
        crop: Image.Image,
    ) -> dict[str, Any]:

        buffer = io.BytesIO()

        crop.save(
            buffer,
            format="PNG",
        )

        data = buffer.getvalue()

        path = (
            f"{user_id}/"
            f"{uuid.uuid4()}.png"
        )

        observation = current_observation.get()
        if observation:
            observation.stage = "storage_upload"
        upload_started = time.monotonic()
        try:
            db.upload_private_png(
                user_id,
                path,
                data,
            )
        finally:
            if observation:
                observation.storage_upload_seconds += time.monotonic() - upload_started
        if observation:
            observation.stage = "garment_processing"

        width, height = crop.size

        return {
            "object_path": path,
            "byte_size": len(data),
            "sha256": hashlib.sha256(
                data
            ).hexdigest(),
            "width": width,
            "height": height,
        }

    def extract(
        self,
        db: Any,
        job: dict[str, Any],
    ) -> list[dict[str, Any]]:
        observation = current_observation.get() or OutfitPhotoObservation(job.get("id"))
        with observe_outfit_photo(observation):
            return self._extract(db, job)

    def _extract(
        self,
        db: Any,
        job: dict[str, Any],
        ) -> list[dict[str, Any]]:

        user_id = job["user_id"]
        observation = current_observation.get()
        if observation:
            observation.stage = "source_fetch"
        source_started = time.monotonic()
        log_event(logger, "source_fetch_started")

        source_photo_id = (
            job.get("source_photo_id")
        )

        photos = db.rows(
            "source_photos",
            {
                "id":
                    f"eq.{source_photo_id}",
                "user_id":
                    f"eq.{user_id}",
                "select":
                    "id,media_asset_id,status",
                "limit":
                    "1",
            },
        )

        if (
            not photos
            or photos[0]["status"] != "detecting"
            or not photos[0].get(
                "media_asset_id"
            )
        ):
            raise InvalidProviderOutput(
                "Source photo unavailable"
            )

        media_asset_id = (
            photos[0]["media_asset_id"]
        )

        assets = db.rows(
            "media_assets",
            {
                "id":
                    f"eq.{media_asset_id}",
                "owner_id":
                    f"eq.{user_id}",
                "select":
                    (
                        "bucket_id,"
                        "object_path,"
                        "kind,"
                        "status"
                    ),
                "limit":
                    "1",
            },
        )

        if (
            not assets
            or assets[0]["kind"]
                != "source_photo"
            or assets[0]["status"]
                != "active"
            or not assets[0][
                "object_path"
            ].startswith(
                f"{user_id}/"
            )
        ):
            raise InvalidProviderOutput(
                "Private source photo unavailable"
            )

        image_bytes, mime_type = (
            db.private_image(
                assets[0]["bucket_id"],
                assets[0]["object_path"],
            )
        )

        log_event(logger, "source_fetch_completed", duration_ms=elapsed_ms(source_started),
                  byte_size=len(image_bytes), mime_type=mime_type)
        if observation:
            observation.stage = "provider_request"
        provider_started = time.monotonic()
        try:
            response = self._call_gemini(
                image_bytes,
                mime_type,
            )
        finally:
            if observation:
                observation.provider_latency_ms = elapsed_ms(provider_started)

        uploaded_paths: list[str] = []

        results: list[
            dict[str, Any]
        ] = []

        if observation:
            observation.stage = "garment_processing"
        processing_started = time.monotonic()
        upload_seconds_before = observation.storage_upload_seconds if observation else 0.0
        try:
            with Image.open(
                io.BytesIO(image_bytes)
            ) as opened:

                source = opened.convert("RGB")

                for garment in response.boxes:

                    normalized = (
                        self._normalize(
                            garment
                        )
                    )

                    if normalized is None:
                        continue

                    try:
                        crop, decoded = (
                            render_segmented_garment(
                                source,
                                garment.box_2d,
                                garment.mask,
                            )
                        )
                    except Exception as exc:
                        raise InvalidProviderOutput(
                            "Gemini mask could not "
                            "be rendered"
                        ) from exc

                    original_asset = (
                        self._upload_crop(
                            db,
                            user_id,
                            crop,
                        )
                    )

                    uploaded_paths.append(
                        original_asset[
                            "object_path"
                        ]
                    )

                    results.append({
                        **normalized,

                        "original":
                            original_asset,

                        # Track A:
                        # no prettifier yet.
                        "reconstructed":
                            None,
                    })

        except Exception:
            for path in uploaded_paths:
                try:
                    db.delete_private_image(
                        user_id,
                        path,
                    )
                except Exception:
                    pass

            raise

        upload_seconds = (observation.storage_upload_seconds - upload_seconds_before) if observation else 0.0
        log_event(logger, "garment_processing_completed", garment_count=len(results),
                  duration_ms=max(0, round((time.monotonic() - processing_started - upload_seconds) * 1000)))
        log_event(logger, "storage_upload_completed", garment_count=len(results),
                  total_bytes=sum(item["original"]["byte_size"] for item in results),
                  duration_ms=max(0, round(upload_seconds * 1000)))
        return results
