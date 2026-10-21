"""HTTP-triggered StyleGraph AI worker for free web-service hosting.

This module does not replace the normal polling worker.

Background-worker hosting:
    python -m ai_service.worker

Render Free Web Service:
    uvicorn ai_service.worker_server:app --host 0.0.0.0 --port $PORT

The HTTP service only wakes the existing queue processor.
Jobs are still claimed atomically from ai_jobs.
"""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager
import logging
import os
import threading
from typing import Any

from fastapi import FastAPI, Header, HTTPException, status
from groq import Groq

from ai_service.config import get_settings
from ai_service.providers.groq_provider import GroqProvider
from ai_service.providers.outfit import build_outfit_provider
from ai_service.services.outfit_service import OutfitService
from ai_service.worker import (
    SupabaseRest,
    WorkerConfigurationError,
    WorkerHealth,
    build_worker_id,
    configure_worker_logging,
    log_worker_event,
    process_one,
    utc_now,
    validate_worker_settings,
)

logger = logging.getLogger(__name__)


class WorkerServerRuntime:
    """Own long-lived clients and execute at most one queue job at a time."""

    def __init__(self) -> None:
        settings = get_settings()
        validate_worker_settings(settings)

        trigger_token = os.getenv("WORKER_TRIGGER_TOKEN", "").strip()
        if not trigger_token:
            raise WorkerConfigurationError(
                "Missing required worker-server configuration: WORKER_TRIGGER_TOKEN"
            )

        self.settings = settings
        self.trigger_token = trigger_token

        self.db = SupabaseRest(
            settings.supabase_url,
            settings.supabase_server_key,
        )

        groq_provider = GroqProvider(
            settings.groq_api_key,
            settings.groq_model,
            settings.temperature,
            settings.max_retries,
            settings.backoff_seconds,
        )

        self.outfit_service = OutfitService(groq_provider)
        self.vision_client = Groq(api_key=settings.groq_api_key)
        self.vision_model = settings.groq_vision_model
        self.outfit_provider = build_outfit_provider(settings)

        self.worker_id = build_worker_id()
        self.health = WorkerHealth(
            worker_id=self.worker_id,
            started_at=utc_now(),
        )

        # One execution slot per Render instance.
        # Queue claiming is also protected in PostgreSQL, but this avoids
        # unnecessary parallel AI work inside a 512 MB free container.
        self.executor = ThreadPoolExecutor(
            max_workers=1,
            thread_name_prefix="stylegraph-worker",
        )

        self._state_lock = threading.Lock()
        self._future: Future[bool] | None = None

    def is_busy(self) -> bool:
        with self._state_lock:
            return self._future is not None and not self._future.done()

    def _mark_claim(self) -> None:
        self.health.last_claim_at = utc_now()

    def _mark_success(self) -> None:
        self.health.last_success_at = utc_now()

    def _run_once(self) -> bool:
        try:
            return process_one(
                self.db,
                self.worker_id,
                self.outfit_service,
                self.vision_client,
                self.vision_model,
                self.settings,
                self.outfit_provider,
                on_claim=self._mark_claim,
                on_success=self._mark_success,
            )
        except Exception:
            logger.exception(
                "HTTP_WORKER_JOB_FAILED worker_id=%s",
                self.worker_id,
            )
            return False

    def trigger(self) -> str:
        with self._state_lock:
            if self._future is not None and not self._future.done():
                return "busy"

            self._future = self.executor.submit(self._run_once)
            return "accepted"

    def close(self) -> None:
        # Let an in-flight synchronous job finish before closing its DB client.
        self.executor.shutdown(wait=True, cancel_futures=False)
        self.db.close()


runtime: WorkerServerRuntime | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global runtime

    configure_worker_logging()

    try:
        runtime = WorkerServerRuntime()
    except WorkerConfigurationError as exc:
        logger.error("WORKER_SERVER_STARTUP_FAILED %s", exc)
        raise

    log_worker_event(
        "WORKER_SERVER_STARTED",
        worker_id=runtime.worker_id,
        provider=runtime.outfit_provider.name,
    )

    try:
        yield
    finally:
        runtime.close()
        log_worker_event(
            "WORKER_SERVER_STOPPED",
            worker_id=runtime.worker_id,
        )
        runtime = None


app = FastAPI(
    title="StyleGraph AI Worker",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


def get_runtime() -> WorkerServerRuntime:
    if runtime is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="worker not ready",
        )

    return runtime


@app.get("/health")
def health() -> dict[str, Any]:
    current = get_runtime()

    return {
        "status": "ok",
        "busy": current.is_busy(),
        "worker_id": current.worker_id,
        "started_at": current.health.started_at,
        "last_claim_at": current.health.last_claim_at,
        "last_success_at": current.health.last_success_at,
    }


@app.post(
    "/internal/process-next-job",
    status_code=status.HTTP_202_ACCEPTED,
)
def process_next_job(
    x_worker_token: str | None = Header(default=None),
) -> dict[str, str]:
    current = get_runtime()

    if not x_worker_token or x_worker_token != current.trigger_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="unauthorized",
        )

    state = current.trigger()

    return {
        "status": state,
    }