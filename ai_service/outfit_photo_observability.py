"""Job-local timing and allowlisted logs; never holds wardrobe/request data."""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import json
import logging
import time
from typing import Iterator


@dataclass
class OutfitPhotoObservation:
    job_id: str | None
    stage: str = "provider_extract"
    provider_latency_ms: int | None = None
    storage_upload_seconds: float = 0.0


current_observation: ContextVar[OutfitPhotoObservation | None] = ContextVar(
    "outfit_photo_observation", default=None,
)


@contextmanager
def observe_outfit_photo(observation: OutfitPhotoObservation) -> Iterator[None]:
    token = current_observation.set(observation)
    try:
        yield
    finally:
        current_observation.reset(token)


def elapsed_ms(started: float) -> int:
    return max(0, round((time.monotonic() - started) * 1000))


_SAFE_FIELDS = frozenset({
    "job_type", "attempt", "provider", "model", "duration_ms", "byte_size",
    "mime_type", "failure_category", "retry_delay_ms", "garment_count",
    "total_bytes", "status", "total_latency_ms", "provider_latency_ms",
    "persistence_latency_ms", "safe_error_code", "stage", "rpc",
})


def log_event(
    logger: logging.Logger,
    event: str,
    observation: OutfitPhotoObservation | None = None,
    *,
    level: int = logging.INFO,
    **fields: str | int | None,
) -> None:
    observation = observation or current_observation.get()
    safe_fields = {key: value for key, value in fields.items() if key in _SAFE_FIELDS}
    safe_fields["job_id"] = observation.job_id if observation else None
    logger.log(level, "event=%s %s", event, json.dumps(safe_fields, sort_keys=True),
               extra={"event": event, **safe_fields})
