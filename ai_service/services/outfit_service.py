"""Outfit generation orchestrator.

Wires together GroqProvider → validate_ai_response → deterministic_fallback
and translates the result into an OutfitResponse Pydantic model.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import HTTPException

from ai_service.models import OutfitRequest, OutfitResponse
from ai_service.providers.groq_provider import GroqProvider
from ai_service.scoring.engine import deterministic_fallback

logger = logging.getLogger(__name__)


class OutfitService:
    """Orchestrates outfit generation for a single user request."""

    def __init__(self, groq_provider: GroqProvider) -> None:
        self._groq = groq_provider

    def generate(self, request: OutfitRequest) -> OutfitResponse:
        """Generate a daily outfit from the request payload.

        Generation order:
        1. Call GroqProvider — if it returns a valid outfit, use it (source="daily_ai").
        2. If AI fails, run the deterministic fallback (source="daily_fallback").
        3. If both fail, raise HTTP 422.

        Args:
            request: Validated OutfitRequest from the API layer.

        Returns:
            OutfitResponse with the selected outfit.

        Raises:
            HTTPException(422): When neither AI nor fallback can produce a valid outfit.
        """
        item_pool: list[dict[str, Any]] = [item.as_dict() for item in request.wardrobe_items]
        dna = request.fashion_dna

        # --- AI path ---
        t_ai = time.perf_counter()
        ai_result = self._groq.generate_outfit(item_pool, dna)
        ai_ms = round((time.perf_counter() - t_ai) * 1000)

        if ai_result is not None:
            logger.info(
                "user_id=%s source=daily_ai ai_ms=%d confidence=%.4f",
                request.user_id,
                ai_ms,
                ai_result.get("confidence", 0),
            )
            return OutfitResponse(**ai_result, source="daily_ai")

        logger.warning("user_id=%s AI outfit generation failed; running deterministic fallback.", request.user_id)

        # --- Fallback path ---
        fallback_result = deterministic_fallback(item_pool, dna)

        if fallback_result is not None:
            logger.info(
                "user_id=%s source=daily_fallback confidence=%.4f",
                request.user_id,
                fallback_result.get("confidence", 0),
            )
            return OutfitResponse(**fallback_result, source="daily_fallback")

        logger.error(
            "user_id=%s Both AI and deterministic fallback failed to produce a valid outfit. "
            "Wardrobe may be missing required roles.",
            request.user_id,
        )
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not generate a valid outfit. Ensure the wardrobe covers all required "
                "roles: base_layer, bottom, footwear."
            ),
        )
