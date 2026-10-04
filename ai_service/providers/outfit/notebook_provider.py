from __future__ import annotations

from typing import Any

from ai_service.config import Settings
from ai_service.outfit_photo_worker import extract_outfit_photo


class NotebookOutfitProvider:
    """Adapter around the V1 Colab/ngrok outfit pipeline."""

    name = "notebook-pipeline"
    prompt_version = "notebook-outfit-v1"
    schema_version = "outfit-v1"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.model = settings.outfit_pipeline_model

    def extract(
        self,
        db: Any,
        job: dict[str, Any],
    ) -> list[dict[str, Any]]:
        return extract_outfit_photo(
            db,
            job,
            self._settings.outfit_pipeline_url,
            self._settings.outfit_pipeline_token,
        )