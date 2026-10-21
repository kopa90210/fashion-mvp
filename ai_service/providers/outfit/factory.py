from __future__ import annotations

from ai_service.config import Settings
from ai_service.providers.outfit.base import OutfitPhotoProvider
from ai_service.providers.outfit.notebook_provider import NotebookOutfitProvider
from ai_service.providers.outfit.gemini_provider import (
    GeminiOutfitProvider,
)


def build_outfit_provider(
    settings: Settings,
) -> OutfitPhotoProvider:

    if settings.outfit_provider == "notebook":
        return NotebookOutfitProvider(settings)

    if settings.outfit_provider == "gemini":
       return GeminiOutfitProvider(
        settings
    )

    raise RuntimeError(
        f"Unsupported outfit provider: {settings.outfit_provider}"
    )