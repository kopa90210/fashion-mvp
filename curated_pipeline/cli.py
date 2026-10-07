from __future__ import annotations

import argparse
from dataclasses import dataclass
from difflib import SequenceMatcher
import json
import os
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from dotenv import load_dotenv
from supabase import create_client

from .cache import DatasetLayout, derive_hints, file_sha256, load_valid_cache
from .batch_processor import persist_validated_artifact
from .contracts import ContractError, REQUIRED_FIELDS, validate_remote_response
from .provider import ColabCuratedProvider, CuratedProvider, CuratedProviderError


BUCKET_NAME = "wardrobe-images"
MIGRATION_PATH = "supabase/migrations/0002_wardrobe_extraction_pipeline.sql"
LOCAL_SUPABASE_HOSTS = {"localhost", "127.0.0.1", "::1", "host.docker.internal"}
_CATEGORY_ITEMS_CACHE: dict[str, list[dict[str, Any]]] = {}


@dataclass
class Summary:
    processed: int = 0
    accepted: int = 0
    rejected: int = 0
    skipped: int = 0

    def display(self) -> str:
        return (
            "Final summary: "
            f"processed={self.processed}, accepted={self.accepted}, "
            f"rejected={self.rejected}, skipped={self.skipped}"
        )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Process curated images remotely, then upload validated cached results locally."
    )
    parser.add_argument("--dataset-root", default="datasets", help="Root containing raw/, processed/, and manifests/.")
    parser.add_argument("--min-confidence", type=float, default=0.6)
    commands = parser.add_subparsers(dest="command", required=True)
    process = commands.add_parser("process", help="Create local PNG and manifest cache artifacts.")
    process.add_argument("--force", action="store_true")
    process.add_argument("--timeout-seconds", type=float, default=None)
    upload = commands.add_parser("upload", help="Upload validated cache artifacts to local Supabase.")
    upload.add_argument("--force-duplicates", action="store_true")
    upload.add_argument("--allow-duplicates", action="store_true")
    return parser.parse_args(argv)


def load_dotenv_files() -> None:
    load_dotenv(".env")
    load_dotenv(".env.local", override=False)


def build_remote_provider(timeout_override: float | None = None) -> ColabCuratedProvider:
    url = os.getenv("CURATED_PIPELINE_URL", "")
    token = os.getenv("CURATED_PIPELINE_TOKEN", "")
    missing = [name for name, value in (("CURATED_PIPELINE_URL", url), ("CURATED_PIPELINE_TOKEN", token)) if not value]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
    try:
        timeout = timeout_override if timeout_override is not None else float(os.getenv("CURATED_PIPELINE_TIMEOUT_SECONDS", "120"))
    except ValueError as exc:
        raise RuntimeError("CURATED_PIPELINE_TIMEOUT_SECONDS must be numeric") from exc
    if timeout <= 0:
        raise RuntimeError("Curated pipeline timeout must be greater than zero")
    return ColabCuratedProvider(url, token, timeout_seconds=timeout)


def local_supabase_credentials() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_KEY") or ""
    if not url or not key:
        raise RuntimeError("Local SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_KEY are required")
    if (urlparse(url).hostname or "").lower() not in LOCAL_SUPABASE_HOSTS:
        raise RuntimeError("Upload mode only permits a local Supabase URL")
    return url, key


def process_dataset(
    layout: DatasetLayout,
    provider: CuratedProvider,
    min_confidence: float = 0.6,
    force: bool = False,
) -> Summary:
    layout.ensure()
    summary = Summary()
    for photo in layout.photos():
        relative_source = layout.relative_source(photo)
        digest = file_sha256(photo)
        if not force:
            try:
                load_valid_cache(layout, relative_source, digest, min_confidence)
                summary.skipped += 1
                print(f"{relative_source.as_posix()} -> skipped (valid cache for photo hash)")
                continue
            except ContractError:
                pass

        profile, expected_category = derive_hints(relative_source)
        try:
            validated = validate_remote_response(
                provider.process(photo, profile, expected_category),
                min_confidence,
            )
            persist_validated_artifact(
                layout,
                relative_source,
                digest,
                profile,
                expected_category,
                validated,
            )
            summary.processed += 1
            print(f"{relative_source.as_posix()} -> processed")
        except (ContractError, CuratedProviderError) as exc:
            summary.rejected += 1
            print(f"{relative_source.as_posix()} -> rejected ({exc})")
        except Exception:
            summary.rejected += 1
            print(f"{relative_source.as_posix()} -> rejected (local processing error)")
    return summary


def existing_hash_status_counts(supabase: Any, digest: str) -> dict[str, int]:
    response = supabase.table("extraction_log").select("status").eq("photo_hash", digest).execute()
    counts = {"accepted": 0, "rejected": 0}
    for row in response.data or []:
        if row.get("status") in counts:
            counts[row["status"]] += 1
    return counts


def log_extraction(
    supabase: Any,
    source_relative_path: str,
    digest: str,
    manifest: Any,
    status: str,
    problems: list[str] | None = None,
) -> None:
    supabase.table("extraction_log").insert(
        {
            "photo_filename": Path(source_relative_path).name,
            "photo_hash": digest,
            "raw_response": manifest,
            "status": status,
            "problems": problems or [],
        }
    ).execute()


def ensure_bucket(supabase: Any) -> None:
    try:
        supabase.storage.create_bucket(BUCKET_NAME, options={"public": True})
    except Exception as exc:
        message = str(exc).lower()
        if "already exists" not in message and "duplicate" not in message:
            raise


def ensure_required_tables(supabase: Any) -> None:
    missing: list[str] = []
    for table_name in ("wardrobe_items", "extraction_log"):
        try:
            supabase.table(table_name).select("id").limit(1).execute()
        except Exception as exc:
            message = str(exc)
            if "PGRST205" in message or "Could not find the table" in message:
                missing.append(table_name)
            else:
                raise
    if missing:
        raise RuntimeError(
            f"Local Supabase is missing {', '.join(missing)}. Apply {MIGRATION_PATH} locally."
        )


def upload_png(supabase: Any, png_path: Path, item_id: str) -> str:
    storage_path = f"{item_id}.png"
    with png_path.open("rb") as image:
        supabase.storage.from_(BUCKET_NAME).upload(
            storage_path,
            image,
            file_options={"content-type": "image/png", "upsert": "false"},
        )
    return supabase.storage.from_(BUCKET_NAME).get_public_url(storage_path)


def insert_wardrobe_item(supabase: Any, item_id: str, image_url: str, attributes: dict[str, Any]) -> None:
    row = {
        "id": item_id,
        "image_url": image_url,
        "source": "curated",
        **{field: attributes[field] for field in REQUIRED_FIELDS if field in attributes},
    }
    supabase.table("wardrobe_items").insert(row).execute()
    category = attributes.get("category")
    if category in _CATEGORY_ITEMS_CACHE:
        _CATEGORY_ITEMS_CACHE[category].append(
            {"display_name": attributes.get("display_name"), "color": attributes.get("color"), "material": attributes.get("material")}
        )


def find_duplicate_display_name(
    supabase: Any,
    category: str,
    new_display_name: str,
    color_primary: str | None = None,
    material_primary: str | None = None,
    threshold: float = 0.85,
) -> tuple[str | None, float]:
    if not new_display_name or not category:
        return None, 0.0
    if category in _CATEGORY_ITEMS_CACHE:
        rows = _CATEGORY_ITEMS_CACHE[category]
    else:
        try:
            response = supabase.table("wardrobe_items").select("display_name, color, material").eq("category", category).execute()
            rows = response.data or []
            _CATEGORY_ITEMS_CACHE[category] = rows
        except Exception:
            return None, 0.0
    new_name = new_display_name.strip().lower()
    for row in rows:
        existing_name = row.get("display_name")
        if not existing_name:
            continue
        # Exact image duplicates are already blocked by photo_hash before this
        # function is called. Do not treat same color + material as an automatic
        # duplicate: "black leather boots" and "black leather pumps" are distinct
        # catalog items.
        similarity = SequenceMatcher(
            None,
            new_name,
            existing_name.strip().lower(),
        ).ratio()

        if similarity > threshold:
            return existing_name, similarity
    return None, 0.0


def upload_cached_item(
    supabase: Any,
    manifest: dict[str, Any],
    png_path: Path,
    force_duplicates: bool,
    allow_duplicates: bool,
) -> str:
    digest = str(manifest["photo_sha256"])
    source_path = str(manifest["source_relative_path"])
    if existing_hash_status_counts(supabase, digest)["accepted"] and not force_duplicates:
        print(f"{source_path} -> skipped (already accepted)")
        return "skipped"
    attributes = manifest["attributes"]
    duplicate_name, similarity = find_duplicate_display_name(
        supabase,
        attributes.get("category", ""),
        attributes.get("display_name", ""),
        (attributes.get("color") or {}).get("primary"),
        (attributes.get("material") or {}).get("primary"),
    )
    if duplicate_name and not allow_duplicates:
        problem = f"possible duplicate of {duplicate_name}"
        log_extraction(supabase, source_path, digest, manifest, "rejected", [problem])
        print(f"{source_path} -> rejected ({problem}; similarity={similarity:.2f})")
        return "rejected"
    item_id = str(uuid4())
    image_url = upload_png(supabase, png_path, item_id)
    insert_wardrobe_item(supabase, item_id, image_url, attributes)
    log_extraction(supabase, source_path, digest, manifest, "accepted")
    print(f"{source_path} -> accepted")
    return "accepted"


def upload_dataset(
    layout: DatasetLayout,
    supabase: Any,
    min_confidence: float = 0.6,
    force_duplicates: bool = False,
    allow_duplicates: bool = False,
) -> Summary:
    if not layout.manifests.exists():
        raise FileNotFoundError(f"Manifest folder does not exist: {layout.manifests}")
    summary = Summary()
    _CATEGORY_ITEMS_CACHE.clear()
    for manifest_path in sorted(layout.manifests.rglob("*.json")):
        label = manifest_path.relative_to(layout.manifests).as_posix()
        try:
            candidate = json.loads(manifest_path.read_text(encoding="utf-8"))
            if not isinstance(candidate, dict) or not isinstance(candidate.get("source_relative_path"), str):
                raise ContractError("manifest source_relative_path is required")
            relative_source = Path(candidate["source_relative_path"])
            label = relative_source.as_posix()
            manifest, png_path = load_valid_cache(layout, relative_source, None, min_confidence)
            status = upload_cached_item(supabase, manifest, png_path, force_duplicates, allow_duplicates)
            setattr(summary, status, getattr(summary, status) + 1)
        except ContractError as exc:
            summary.rejected += 1
            print(f"{label} -> rejected ({exc})")
        except Exception:
            summary.rejected += 1
            print(f"{label} -> rejected (local upload failed)")
    return summary


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        load_dotenv_files()
        layout = DatasetLayout(Path(args.dataset_root))
        if args.command == "process":
            summary = process_dataset(layout, build_remote_provider(args.timeout_seconds), args.min_confidence, args.force)
        else:
            url, key = local_supabase_credentials()
            supabase = create_client(url, key)
            ensure_required_tables(supabase)
            ensure_bucket(supabase)
            summary = upload_dataset(layout, supabase, args.min_confidence, args.force_duplicates, args.allow_duplicates)
        print(summary.display())
        return 0
    except (RuntimeError, FileNotFoundError, NotADirectoryError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except Exception:
        print("Error: curated ingestion command failed", file=sys.stderr)
        return 1
