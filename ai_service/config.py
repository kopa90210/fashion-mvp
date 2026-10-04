from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Server-side AI worker configuration."""

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---------------------------------------------------------
    # Supabase
    # ---------------------------------------------------------

    supabase_url: str = ""
    supabase_secret_key: str = ""
    supabase_service_key: str = ""

    # ---------------------------------------------------------
    # Groq / existing AI services
    # ---------------------------------------------------------

    groq_api_key: str = ""
    groq_model: str = "qwen/qwen3.6-27b"
    groq_vision_model: str = "unused-for-outfit-photo-test"

    temperature: float = 0.2

    # ---------------------------------------------------------
    # Outfit extraction provider
    # ---------------------------------------------------------

    outfit_provider: Literal["notebook", "gemini"] = "notebook"

    # V1 notebook / Colab provider
    outfit_pipeline_url: str = ""
    outfit_pipeline_token: str = ""
    outfit_pipeline_model: str = "yolos-sam2-qwen3vl"

    # V2 Gemini provider
    gemini_api_key: str = ""
    gemini_outfit_model: str = "gemini-3.8-flash"
    gemini_outfit_fallback_model: str = "gemini-3.5-flash-lite"
    gemini_outfit_thinking_level: str = "low"

    # ---------------------------------------------------------
    # Limits / reliability
    # ---------------------------------------------------------

    outfit_max_garments: int = 8
    outfit_provider_timeout_seconds: int = 90

    max_retries: int = 2
    backoff_seconds: float = 0.25

    # ---------------------------------------------------------
    # Service metadata
    # ---------------------------------------------------------

    service_version: str = "0.2.0"

    @property
    def supabase_server_key(self) -> str:
        """Prefer the modern secret key, then legacy service-role JWT."""
        return self.supabase_secret_key or self.supabase_service_key


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one cached Settings instance per process."""
    return Settings()