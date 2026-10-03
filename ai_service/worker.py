"""Bounded CLI worker for queued StyleGraph AI work.

Run as ``python -m ai_service.worker --once`` or under a process supervisor.
Only this process holds the Supabase service key and Groq API key.
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import math
import os
import time
import uuid
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from groq import Groq
from ai_service.config import Settings, get_settings
from ai_service.config import Settings, get_settings
from ai_service.models import OutfitRequest, WardrobeItem
from ai_service.outfit_photo_worker import InvalidProviderOutput, RemoteProviderUnavailable, extract_outfit_photo
from ai_service.providers.groq_provider import GroqProvider
from ai_service.services.outfit_service import OutfitService

logger = logging.getLogger(__name__)
DAILY_PROMPT_VERSION = "daily-outfit-v1"
DAILY_SCHEMA_VERSION = "outfit-response-v1"
EXTRACTION_PROMPT_VERSION = "single-garment-v1"
EXTRACTION_SCHEMA_VERSION = "garment-draft-v1"


class InvalidJobInput(Exception):
    """A permanent input/validation problem, never logged with user data."""


class ProviderUnavailable(Exception):
    """A transient provider failure."""


def safe_usage(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None)
    values = {}
    for field in ("prompt_tokens", "completion_tokens", "total_tokens"):
        count = getattr(usage, field, None)
        if isinstance(count, int) and not isinstance(count, bool) and count >= 0:
            values[field] = count
    return values


class SupabaseRest:
    def __init__(
        self,
        url: str,
        service_key: str,
    ) -> None:

        if not url or not service_key:
            raise RuntimeError(
                "Supabase worker configuration is missing"
            )

        self._base = url.rstrip("/")

        headers = {
            "apikey": service_key,
            "Content-Type": "application/json",
        }

        # Legacy Supabase service-role JWT.
        if service_key.startswith("eyJ"):
            headers["Authorization"] = (
                f"Bearer {service_key}"
            )

        self._client = httpx.Client(
            timeout=30,
            headers=headers,
        )

    def close(self) -> None:
        self._client.close()

    def rpc(self, name: str, payload: dict[str, Any]) -> Any:
        response = self._client.post(f"{self._base}/rest/v1/rpc/{name}", json=payload)
        response.raise_for_status()
        return response.json() if response.content else None

    def rows(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        response = self._client.get(f"{self._base}/rest/v1/{table}", params=params)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise InvalidJobInput("Unexpected database result")
        return data

    def private_image(self, bucket: str, path: str) -> tuple[bytes, str]:
        if bucket != "private-wardrobe-media" or not path or ".." in path:
            raise InvalidJobInput("Invalid private media reference")
        url = f"{self._base}/storage/v1/object/authenticated/{quote(bucket)}/{quote(path, safe='/')}"
        response = self._client.get(url)
        response.raise_for_status()
        data = response.content
        mime = response.headers.get("content-type", "").split(";", 1)[0]
        if mime not in ("image/jpeg", "image/png", "image/webp") or not 0 < len(data) <= 10_485_760:
            raise InvalidJobInput("Invalid private image")
        return data, mime

    def upload_private_png(self, user_id: str, path: str, data: bytes) -> None:
        if not path.startswith(f"{user_id}/") or not path.endswith(".png"):
            raise InvalidJobInput("Invalid generated image path")
        response = self._client.post(
            f"{self._base}/storage/v1/object/private-wardrobe-media/{quote(path, safe='/')}",
            content=data, headers={"Content-Type": "image/png", "x-upsert": "false"})
        response.raise_for_status()

    def delete_private_image(self, user_id: str, path: str) -> None:
        if not path.startswith(f"{user_id}/") or not path.endswith(".png"):
            raise InvalidJobInput("Invalid generated image path")
        response = self._client.request("DELETE",
            f"{self._base}/storage/v1/object/private-wardrobe-media",
            json={"prefixes": [path]})
        response.raise_for_status()


def classify_failure(exc: Exception) -> tuple[str, str, str]:
    if isinstance(exc, InvalidProviderOutput):
        return "permanent_error", "PROVIDER_INVALID", "invalid"
    if isinstance(exc, RemoteProviderUnavailable):
        return "retryable_error", "PROVIDER_UNAVAILABLE", "not_run"
    if isinstance(exc, (InvalidJobInput, HTTPException, ValueError)):
        return "permanent_error", "INVALID_INPUT", "invalid"
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        return "retryable_error", "PROVIDER_TIMEOUT", "not_run"
    if isinstance(exc, httpx.HTTPError):
        return "retryable_error", "PERSISTENCE_FAILED", "not_run"
    return "retryable_error", "PROVIDER_UNAVAILABLE", "not_run"


def _daily_outfit(db: SupabaseRest, job: dict[str, Any], outfit_service: OutfitService) -> dict[str, Any]:
    user_id = job["user_id"]
    dna_rows = db.rows("fashion_dna", {"user_id": f"eq.{user_id}", "select": "vector", "limit": "1"})
    membership = db.rows("user_wardrobe_items", {
        "user_id": f"eq.{user_id}", "retired_at": "is.null",
        "select": "wardrobe_items(id,display_name,layer_role,style_tags,status)",
    })
    if not dna_rows:
        raise InvalidJobInput("Fashion DNA missing")
    items = []
    for row in membership:
        item = row.get("wardrobe_items")
        if isinstance(item, dict) and item.get("status") == "confirmed" and item.get("layer_role") in (
            "base_layer", "bottom", "footwear", "outerwear", "accessory"
        ):
            items.append(WardrobeItem(
                id=item["id"], display_name=item.get("display_name") or "Garment",
                image_url=None, layer_role=item["layer_role"], style_tags=item.get("style_tags") or {},
            ))
    if not items:
        raise InvalidJobInput("No eligible wardrobe items")
    request = OutfitRequest(user_id=user_id, fashion_dna=dna_rows[0]["vector"], wardrobe_items=items)
    return outfit_service.generate(request).model_dump()


def _extract_garment(db: SupabaseRest, job: dict[str, Any], vision_client: Groq, vision_model: str) -> tuple[dict[str, Any], dict[str, int]]:
    if not vision_model:
        raise InvalidJobInput("Vision model is not configured")
    item_id = job.get("wardrobe_item_id")
    items = db.rows("wardrobe_items", {"id": f"eq.{item_id}", "select": "id,media_asset_id,status", "limit": "1"})
    if not items or items[0].get("status") != "draft" or not items[0].get("media_asset_id"):
        raise InvalidJobInput("Draft item is unavailable")
    asset_id = items[0]["media_asset_id"]
    assets = db.rows("media_assets", {"id": f"eq.{asset_id}", "owner_id": f"eq.{job['user_id']}",
        "select": "bucket_id,object_path,status", "limit": "1"})
    if not assets or assets[0]["status"] != "active":
        raise InvalidJobInput("Private media is unavailable")
    if not assets[0]["object_path"].startswith(f"{job['user_id']}/"):
        raise InvalidJobInput("Private media owner path mismatch")
    image, mime = db.private_image(assets[0]["bucket_id"], assets[0]["object_path"])
    data_url = f"data:{mime};base64,{base64.b64encode(image).decode('ascii')}"
    try:
        response = vision_client.chat.completions.create(
            model=vision_model, response_format={"type": "json_object"}, temperature=0.1,
            messages=[{"role": "system", "content": (
                "Describe only the main visible garment. Return JSON with category "
                "(top,bottom,footwear,outerwear,accessory), display_name, color_primary, "
                "and confidence from 0 to 1. Do not invent brand, material, or hidden details."
            )}, {"role": "user", "content": [{"type": "text", "text": "Classify this garment."},
                {"type": "image_url", "image_url": {"url": data_url}}]}],
        )
    except Exception as exc:
        raise ProviderUnavailable from exc
    try:
        content = response.choices[0].message.content
        result = json.loads(content)
    except (AttributeError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise InvalidJobInput("Vision result was not valid JSON") from exc
    if not isinstance(result, dict) or result.get("category") not in (
        "top", "bottom", "footwear", "outerwear", "accessory"
    ) or not isinstance(result.get("display_name"), str) or not 0 < len(result["display_name"].strip()) <= 120 \
      or not isinstance(result.get("color_primary"), str) or not 0 < len(result["color_primary"].strip()) <= 80 \
      or not isinstance(result.get("confidence"), (float, int)) or isinstance(result.get("confidence"), bool) \
      or not math.isfinite(result["confidence"]) or not 0 <= result["confidence"] <= 1:
        raise InvalidJobInput("Vision result failed validation")
    return ({key: result[key] for key in ("category", "display_name", "color_primary", "confidence")},
            safe_usage(response))


def process_one(
    db: SupabaseRest,
    worker_id: str,
    outfit_service: OutfitService,
    vision_client: Groq,
    vision_model: str,
    settings: Settings,
) -> bool:
    jobs = db.rpc("claim_ai_jobs", {"p_worker_id": worker_id, "p_limit": 1, "p_lease_seconds": 900})
    if not jobs:
        return False
    job = jobs[0]
    started = time.monotonic()
    if job["job_type"] == "daily_outfit":
        prompt_version, schema_version = DAILY_PROMPT_VERSION, DAILY_SCHEMA_VERSION
        model = outfit_service._groq.model
    elif job["job_type"] == "outfit_photo":
        prompt_version, schema_version = "notebook-outfit-v1", "outfit-v1"
        model = settings.outfit_pipeline_model
    else:
        prompt_version, schema_version = EXTRACTION_PROMPT_VERSION, EXTRACTION_SCHEMA_VERSION
        model = vision_model or "unconfigured"
    result: dict[str, Any] | None = None
    garments: list[dict[str, Any]] | None = None
    usage: dict[str, int] = {}
    outcome, error_code, validation = "succeeded", None, "valid"
    try:
        if job["job_type"] == "daily_outfit":
            result = _daily_outfit(db, job, outfit_service)
            usage = getattr(outfit_service._groq, "last_usage", {})
        elif job["job_type"] == "wardrobe_extraction":
            result, usage = _extract_garment(db, job, vision_client, vision_model)
        elif job["job_type"] == "outfit_photo":
            garments = extract_outfit_photo(
    db,
    job,
    settings.outfit_pipeline_url,
    settings.outfit_pipeline_token,
)
        else:
            raise InvalidJobInput("Unknown job type")
    except Exception as exc:
        outcome, error_code, validation = classify_failure(exc)
        logger.warning("job_id=%s outcome=%s code=%s", job["id"], outcome, error_code)
    metadata = {
        "p_job_id": job["id"], "p_worker_id": worker_id, "p_attempt": job["total_attempts"],
        "p_outcome": outcome,
        "p_provider": "notebook-pipeline" if job["job_type"] == "outfit_photo" else "groq",
        "p_model": model,
        "p_prompt_version": prompt_version, "p_schema_version": schema_version,
        "p_validation_status": validation, "p_latency_ms": round((time.monotonic() - started) * 1000),
        "p_usage": usage, "p_safe_error_code": error_code, "p_result": result,
    }
    try:
        if job["job_type"] == "outfit_photo" and outcome == "succeeded":
            db.rpc("complete_outfit_photo_job", {
                "p_job_id": job["id"], "p_worker_id": worker_id,
                "p_attempt": job["total_attempts"], "p_provider": "notebook-pipeline",
                "p_model": model, "p_prompt_version": prompt_version,
                "p_schema_version": schema_version, "p_latency_ms": metadata["p_latency_ms"],
                "p_usage": usage, "p_garments": garments,
            })
        else:
            db.rpc("complete_ai_job", metadata)
    except httpx.HTTPError:
        # The lease will expire and the database will retry or dead-letter it.
        logger.error("job_id=%s completion_failed", job["id"])
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Run bounded StyleGraph AI jobs")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--poll-seconds", type=float, default=5.0)
    args = parser.parse_args()
    if not 1 <= args.poll_seconds <= 60:
        parser.error("--poll-seconds must be between 1 and 60")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    
    settings = get_settings()

    if not settings.groq_api_key:
      raise RuntimeError("GROQ_API_KEY is required")

    if not settings.supabase_url:
      raise RuntimeError("SUPABASE_URL is required")

    if not settings.supabase_server_key:
      raise RuntimeError(
        "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_KEY is required"
    )

    vision_model = settings.groq_vision_model

    db = SupabaseRest(
    settings.supabase_url,
    settings.supabase_server_key,
)
    provider = GroqProvider(settings.groq_api_key, settings.groq_model, settings.temperature,
                            settings.max_retries, settings.backoff_seconds)
    service = OutfitService(provider)
    worker_id = str(uuid.uuid4())
    vision_client = Groq(api_key=settings.groq_api_key)
    try:
        while True:
            processed = process_one(db, worker_id, service, vision_client, vision_model, settings)
            if args.once:
                break
            if not processed:
                time.sleep(args.poll_seconds)
    finally:
        db.close()


if __name__ == "__main__":
    main()
