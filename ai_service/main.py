"""FastAPI application entry point for the AI Outfit Generation Service."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ai_service.config import get_settings
from ai_service.models import HealthResponse, OutfitRequest, OutfitResponse
from ai_service.providers.groq_provider import GroqProvider
from ai_service.services.outfit_service import OutfitService

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Application state container
# ---------------------------------------------------------------------------

class _AppState:
    outfit_service: OutfitService


_state = _AppState()


# ---------------------------------------------------------------------------
# Lifespan — create heavyweight objects once at startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    groq_provider = GroqProvider(
        api_key=settings.groq_api_key,
        model=settings.groq_model,
        temperature=settings.temperature,
        max_retries=settings.max_retries,
        backoff_seconds=settings.backoff_seconds,
    )
    _state.outfit_service = OutfitService(groq_provider)
    logger.info(
        "AI Outfit Service v%s started — model=%s max_retries=%d",
        settings.service_version,
        settings.groq_model,
        settings.max_retries,
    )
    yield
    logger.info("AI Outfit Service shutting down.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

settings = get_settings()

app = FastAPI(
    title="AutoFashion AI Outfit Service",
    description=(
        "Stateless FastAPI service that generates daily outfits from a user's "
        "fashion DNA and wardrobe pool. Callers are responsible for Supabase data "
        "fetching and persistence."
    ),
    version=settings.service_version,
    lifespan=lifespan,
)

# Server-to-server only by default — no wildcard origins.
# Extend allow_origins here if browser-side calls are needed in the future.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],  # empty = no cross-origin requests allowed
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------------
# Middleware — request latency logging
# ---------------------------------------------------------------------------

@app.middleware("http")
async def log_requests(request: Request, call_next: Any) -> Any:
    t_start = time.perf_counter()
    response = await call_next(request)
    total_ms = round((time.perf_counter() - t_start) * 1000)
    logger.info(
        "method=%s path=%s status=%d total_ms=%d",
        request.method,
        request.url.path,
        response.status_code,
        total_ms,
    )
    return response


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    tags=["meta"],
)
async def health() -> HealthResponse:
    """Return service health status and version."""
    return HealthResponse(version=get_settings().service_version)


@app.post(
    "/generate-outfit",
    response_model=OutfitResponse,
    summary="Generate a daily outfit",
    tags=["outfit"],
    responses={
        422: {"description": "Wardrobe covers insufficient roles for a valid outfit."},
    },
)
async def generate_outfit(request: OutfitRequest) -> OutfitResponse:
    """Generate a daily outfit from the caller-supplied fashion DNA and wardrobe items.

    The service does **not** access Supabase. The caller (Next.js backend or a
    CLI script) is responsible for fetching user data and persisting the result.
    """
    return _state.outfit_service.generate(request)
