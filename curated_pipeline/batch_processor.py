"""Offline Colab batch processing for the curated catalog.

This module deliberately stops at local cache artifacts.  It has no database,
storage, or application credentials and can therefore be run safely in Colab.
"""
from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import time
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Protocol

from PIL import Image

from .cache import DatasetLayout, build_manifest, derive_hints, file_sha256, load_valid_cache, write_cache
from .contracts import ContractError, validate_remote_response


class BatchProvider(Protocol):
    def infer(self, image_bytes: bytes, mime_type: str, *, presentation_profile: str, expected_category: str) -> dict[str, Any]: ...


class BatchContractError(ValueError):
    """A safe, user-actionable batch validation failure."""


def persist_validated_artifact(
    layout: DatasetLayout,
    relative_path: Path,
    source_hash: str,
    presentation_profile: str,
    expected_category: str,
    validated: Any,
) -> dict[str, Any]:
    """Persist one validated curated artifact using the canonical cache contract."""
    manifest = build_manifest(
        relative_path,
        source_hash,
        presentation_profile,
        expected_category,
        validated.attributes,
        validated.png_bytes,
        validated.width,
        validated.height,
    )

    write_cache(
        layout.processed_path(relative_path),
        layout.manifest_path(relative_path),
        validated.png_bytes,
        manifest,
    )
    return manifest


def _mime(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def transparent_png(image: Image.Image, *, padding: int = 4) -> bytes:
    """Trim transparent borders while retaining a small visual margin."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise BatchContractError("empty_foreground")
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(rgba.width, right + padding)
    bottom = min(rgba.height, bottom + padding)
    cropped = rgba.crop((left, top, right, bottom))
    if cropped.getchannel("A").getbbox() is None:
        raise BatchContractError("empty_foreground")
    from io import BytesIO
    out = BytesIO()
    cropped.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _safe_error(exc: Exception) -> str:
    if isinstance(exc, BatchContractError):
        return str(exc)
    if isinstance(exc, ContractError):
        return "invalid_response"
    name = type(exc).__name__.lower()
    if "timeout" in name:
        return "timeout"
    if "auth" in name or "permission" in name:
        return "unauthorized"
    return "processing_failed"


@dataclass(frozen=True)
class BatchSummary:
    total: int
    processed: int
    skipped: int
    failed: int
    category_counts: dict[str, int]
    presentation_counts: dict[str, int]

    def as_dict(self) -> dict[str, Any]:
        return {"total": self.total, "processed": self.processed, "skipped": self.skipped,
                "failed": self.failed, "category_counts": self.category_counts,
                "presentation_counts": self.presentation_counts}


class BatchProcessor:
    def __init__(self, layout: DatasetLayout, provider: BatchProvider,
                 *, background_remover: Callable[[bytes, str], Image.Image | bytes],
                 force_reprocess: bool = False, min_confidence: float = 0.6,
                 reports_root: Path | None = None):
        self.layout = layout
        self.provider = provider
        self.background_remover = background_remover
        self.force_reprocess = force_reprocess
        self.min_confidence = min_confidence
        self.reports_root = reports_root or layout.reports_root

    def _record_from_manifest(self, source: Path, manifest: dict[str, Any], status: str) -> dict[str, Any]:
        attrs = manifest["attributes"]
        return {"source_relative_path": manifest["source_relative_path"],
                "presentation_profile": manifest["presentation_profile"],
                "expected_category": manifest["expected_category"],
                "category": attrs["category"], "subcategory": attrs["subcategory"],
                "display_name": attrs["display_name"],
                "model_confidence": attrs["model_confidence"], "status": status}

    def process_one(self, source: Path) -> tuple[str, dict[str, Any]]:
        relative_path = source.relative_to(self.layout.raw_root)
        profile, expected = derive_hints(relative_path)
        source_hash = file_sha256(source)

        try:
            if not self.force_reprocess:
                processed_candidate = self.layout.processed_path(relative_path)
                manifest_candidate = self.layout.manifest_path(relative_path)

                if not processed_candidate.exists() and not manifest_candidate.exists():
                    cached = None
                else:
                    cached = load_valid_cache(
                        self.layout,
                        relative_path,
                        source_hash,
                        min_confidence=self.min_confidence,
                    )

                if cached:
                    cached_manifest = cached[0] if isinstance(cached, tuple) else cached
                    return "skipped", self._record_from_manifest(
                        source,
                        cached_manifest,
                        "skipped",
                    )

            original = source.read_bytes()
            mime = _mime(source)

            removed = self.background_remover(original, mime)
            cutout_bytes = removed if isinstance(removed, bytes) else transparent_png(removed)

            with Image.open(source) as original_image:
                original_image.verify()

            with Image.open(__import__("io").BytesIO(cutout_bytes)) as cutout:
                cutout.load()
                cutout_width, cutout_height = cutout.size

            attributes = self.provider.infer(
                original,
                mime,
                presentation_profile=profile,
                expected_category=expected,
            )

            encoded = base64.b64encode(cutout_bytes).decode("ascii")
            payload = {
                "schema_version": "curated-v1",
                "attributes": attributes,
                "cutout": {
                    "mime_type": "image/png",
                    "width": cutout_width,
                    "height": cutout_height,
                    "png_base64": encoded,
                },
            }

            validated = validate_remote_response(
                payload,
                min_confidence=self.min_confidence,
            )

            manifest = persist_validated_artifact(
                self.layout,
                relative_path,
                source_hash,
                profile,
                expected,
                validated,
            )

            return "processed", self._record_from_manifest(
                source,
                manifest,
                "processed",
            )

        except Exception as exc:
            return "failed", {
                "source_relative_path": relative_path.as_posix(),
                "presentation_profile": profile,
                "expected_category": expected,
                "status": "failed",
                "error_code": _safe_error(exc),
            }

    def run(self) -> tuple[BatchSummary, list[dict[str, Any]], list[dict[str, Any]]]:
        started = time.monotonic()
        records: list[dict[str, Any]] = []
        failures: list[dict[str, Any]] = []
        counts = Counter(); presentations = Counter()
        sources = list(self.layout.photos())
        for source in sources:
            status, record = self.process_one(source)
            records.append(record)
            if status == "failed":
                failures.append(record)
            else:
                counts[record["category"]] += 1
                presentations[record["presentation_profile"]] += 1
        self.reports_root.mkdir(parents=True, exist_ok=True)
        summary = BatchSummary(len(sources), sum(r["status"] == "processed" for r in records),
                               sum(r["status"] == "skipped" for r in records), len(failures),
                               dict(sorted(counts.items())), dict(sorted(presentations.items())))
        report = {"summary": summary.as_dict(), "duration_ms": round((time.monotonic() - started) * 1000, 2),
                  "results": records}
        (self.reports_root / "results.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        (self.reports_root / "failed.json").write_text(json.dumps(failures, indent=2) + "\n", encoding="utf-8")
        return summary, records, failures


class GeminiCuratedMetadataProvider:
    """Official Google GenAI structured-output adapter; imports SDK lazily."""
    def __init__(self, *, api_key: str | None = None, model: str | None = None, client: Any = None):
        self.model = model or __import__("os").environ.get("GEMINI_CURATED_MODEL", "gemini-2.5-flash")
        if client is None:
            from google import genai
            client = genai.Client(api_key=api_key or __import__("os").environ["GEMINI_API_KEY"])
        self.client = client

    def infer(self, image_bytes: bytes, mime_type: str, *, presentation_profile: str, expected_category: str) -> dict[str, Any]:
        from google.genai import types
        prompt = ("Extract one curated catalog garment. Return only the curated-v1 attributes schema. "
                  f"Folder hints are presentation_profile={presentation_profile}, expected_category={expected_category}; "
                  "use them only as contextual hints and never invent a field.")
        response = self.client.models.generate_content(
            model=self.model,
            contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        parsed = getattr(response, "parsed", None)
        if parsed is None:
            parsed = json.loads(getattr(response, "text", ""))
        if hasattr(parsed, "model_dump"):
            parsed = parsed.model_dump()
        if not isinstance(parsed, dict):
            raise BatchContractError("invalid_response")
        return parsed


def export_processed_zip(root: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for dirname in ("processed", "manifests", "reports"):
            folder = root / dirname
            if folder.exists():
                for path in folder.rglob("*"):
                    if path.is_file():
                        archive.write(path, path.relative_to(root).as_posix())
    return destination
