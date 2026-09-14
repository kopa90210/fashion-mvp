from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """AI service configuration loaded from environment / .env files."""

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Groq
    groq_api_key: str = ""
    groq_model: str = "qwen/qwen3.6-27b"
    temperature: float = 0.2

    # Retry behaviour
    max_retries: int = 2
    backoff_seconds: float = 0.25

    # Service metadata
    service_version: str = "0.1.0"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance (one per process)."""
    return Settings()
