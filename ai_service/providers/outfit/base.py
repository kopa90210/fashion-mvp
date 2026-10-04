from __future__ import annotations

from typing import Any, Protocol


class OutfitPhotoProvider(Protocol):
    """Contract implemented by every outfit-photo AI provider."""

    name: str
    model: str
    prompt_version: str
    schema_version: str

    def extract(
        self,
        db: Any,
        job: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Return garments ready for complete_outfit_photo_job."""
        ...