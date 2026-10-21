"""Job-local timing and allowlisted logs; never holds wardrobe/request data."""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import logging
import time
from typing import Iterator


@dataclass
class OutfitPhotoObservation:
    job_id: str | None
    stage: str = "provider_extract"
    queue_wait_ms: int = 0
    source_download_ms: int = 0
    provider_ms: int = 0
    provider_attempts: int = 0
    response_validation_ms: int = 0
    garment_processing_ms: int = 0
    storage_upload_ms: int = 0
    completion_rpc_ms: int = 0
    worker_total_ms: int = 0
    garment_count: int = 0
    provider: str = "unknown"
    model: str = "unknown"
    outcome: str = "unknown"
    error_classification: str | None = None
    storage_upload_seconds: float = 0.0

    @property
    def provider_latency_ms(self) -> int:
        return self.provider_ms

    @provider_latency_ms.setter
    def provider_latency_ms(self, value: int | None) -> None:
        self.provider_ms = max(0, value or 0)


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
    return max(0, round((time.perf_counter() - started) * 1000))


def queue_wait_ms(created_at: object) -> int:
    if not isinstance(created_at, str):
        return 0
    try:
        created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return max(0, round((datetime.now(timezone.utc) - created).total_seconds() * 1000))
    except ValueError:
        return 0


def log_timing_summary(logger: logging.Logger, timing: OutfitPhotoObservation) -> None:
    fields = {key: value for key, value in asdict(timing).items()
              if key not in {"stage", "storage_upload_seconds"}}
    logger.info("OUTFIT_PIPELINE_TIMING %s", json.dumps(fields, sort_keys=True),
                extra={"event": "OUTFIT_PIPELINE_TIMING", **fields})


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
