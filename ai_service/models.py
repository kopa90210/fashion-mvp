from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class WardrobeItem(BaseModel):
    """A single item from the caller's wardrobe."""

    id: str
    display_name: str
    image_url: str | None = None
    layer_role: str
    style_tags: dict[str, float] = Field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        """Return a plain dict compatible with the scoring engine."""
        return self.model_dump()


class OutfitRequest(BaseModel):
    """Payload for POST /generate-outfit."""

    user_id: str
    fashion_dna: dict[str, float] = Field(
        default_factory=dict,
        description="Cosine-space style vector keyed by dimension name.",
    )
    wardrobe_items: list[WardrobeItem] = Field(
        min_length=1,
        description="Full wardrobe pool for the user. Must include items covering all required roles.",
    )


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class OutfitResponse(BaseModel):
    """Structured outfit returned by the service."""

    item_ids: list[str]
    reasoning: list[str]
    styling_tip: str | None = None
    confidence: float
    source: str = Field(
        description="'daily_ai' when the AI produced the outfit, 'daily_fallback' when the deterministic fallback was used.",
    )


class HealthResponse(BaseModel):
    """Response for GET /health."""

    status: str = "ok"
    version: str
