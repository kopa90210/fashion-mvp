"""Groq API wrapper for outfit generation.

Encapsulates prompt construction, API calls, retry logic, and JSON parsing.
All logic is ported from generate_daily_outfit.py (lines 223–334) so that
the AI behaviour is identical.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any

from groq import Groq

from ai_service.scoring.engine import validate_ai_response

logger = logging.getLogger(__name__)


class GroqProvider:
    """Thin wrapper around the Groq SDK for outfit generation."""

    def __init__(
        self,
        api_key: str,
        model: str,
        temperature: float = 0.2,
        max_retries: int = 2,
        backoff_seconds: float = 0.25,
    ) -> None:
        self._client = Groq(api_key=api_key)
        self.model = model
        self.temperature = temperature
        self.max_retries = max_retries
        self.backoff_seconds = backoff_seconds

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_outfit(
        self,
        items: list[dict[str, Any]],
        dna: dict[str, float],
    ) -> dict[str, Any] | None:
        """Try to generate a valid outfit via Groq, with retry on failure.

        Args:
            items: Wardrobe items as plain dicts (id, display_name, layer_role, style_tags …).
            dna: User's fashion DNA vector.

        Returns:
            A validated outfit dict, or ``None`` if all attempts fail.
        """
        for attempt in range(self.max_retries):
            try:
                result = self._call_once(items, dna)
                if result is not None:
                    return result
            except Exception as exc:
                if attempt < self.max_retries - 1:
                    logger.warning("Groq request failed (attempt %d), retrying: %s", attempt + 1, exc)
                    time.sleep(self.backoff_seconds)
                else:
                    logger.error("Groq request failed after %d attempts: %s", self.max_retries, exc)
        return None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_messages(
        self,
        items: list[dict[str, Any]],
        dna: dict[str, float],
    ) -> list[dict[str, str]]:
        """Build the chat messages for the Groq API call (extracted for testability)."""
        return [
            {
                "role": "system",
                "content": (
                    "Return only JSON with item_ids, reasoning, styling_tip, confidence. "
                    "Pick a valid daily outfit from supplied wardrobe ids."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({"fashion_dna": dna, "wardrobe_items": items}),
            },
        ]

    def _parse_content(self, content: str) -> dict[str, Any] | None:
        """Attempt to parse a JSON string; return ``None`` on failure."""
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return None

    def _call_once(
        self,
        items: list[dict[str, Any]],
        dna: dict[str, float],
    ) -> dict[str, Any] | None:
        """Single Groq API call with JSON fallback identical to the original script."""
        messages = self._build_messages(items, dna)

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                response_format={"type": "json_object"},
                messages=messages,
            )
        except Exception as exc:
            text_exc = str(exc)
            logger.error("Groq API error: %s", exc, exc_info=True)

            # If the model failed JSON validation, retry without response_format
            # and attempt to parse the raw text locally.
            if "json_validate_failed" in text_exc or "Failed to validate JSON" in text_exc:
                return self._call_without_format(messages, items)

            raise  # re-raise so the retry loop in generate_outfit can handle it

        content = self._extract_content(response)
        if not content:
            return None

        parsed = self._parse_content(content)
        if parsed is None:
            logger.error("Failed to parse Groq content as JSON. Raw content: %s", content)
            self._write_debug_file(content)
            return None

        return validate_ai_response(parsed, items)

    def _call_without_format(
        self,
        messages: list[dict[str, str]],
        items: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        """Fallback call that omits response_format — identical to original lines 261–291."""
        try:
            fallback_resp = self._client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                messages=messages,
            )
        except Exception as exc2:
            logger.error("Groq fallback request also failed: %s", exc2)
            return None

        content = self._extract_content(fallback_resp)
        if not content:
            return None

        parsed = self._parse_content(content)
        if parsed is None:
            logger.error("Failed to parse Groq fallback content as JSON. Raw content: %s", content)
            self._write_debug_file(content)
            return None

        return validate_ai_response(parsed, items)

    @staticmethod
    def _extract_content(response: Any) -> str | None:
        """Safely extract message content from a Groq completion response."""
        try:
            content = response.choices[0].message.content
        except Exception:
            logger.error("Groq response missing expected structure: %s", response)
            return None

        if not content:
            logger.error("Groq returned empty content. Full response: %s", response)
            return None

        return content

    @staticmethod
    def _write_debug_file(content: str) -> None:
        """Write unparseable content to a debug file (best-effort)."""
        try:
            with open(".last_groq_response.json", "w", encoding="utf-8") as fh:
                fh.write(content)
        except Exception as exc:
            print(f"Failed to write debug file: {exc}", file=sys.stderr)
