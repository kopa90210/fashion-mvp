from __future__ import annotations

from pydantic import BaseModel, Field


class GeminiGarment(BaseModel):
    box_2d: list[int] = Field(
        min_length=4,
        max_length=4,
    )

    mask: list[list[int]] = Field(
        min_length=3,
    )

    category: str
    subcategory: str
    display_name: str

    color_primary: str

    pattern: str = "unknown"
    fit: str = "unknown"

    style_tags: list[str] = Field(
        default_factory=list
    )

    formality_score: float = Field(
        default=0.5,
        ge=0,
        le=1,
    )

    confidence: float = Field(
        ge=0,
        le=1,
    )


class GeminiOutfitResponse(BaseModel):
    boxes: list[GeminiGarment]