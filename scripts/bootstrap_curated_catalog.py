#!/usr/bin/env python3
"""Validate and import the repository's curated cache into local Supabase only."""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlparse
from uuid import UUID, uuid5

from dotenv import load_dotenv

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from curated_pipeline.cache import DatasetLayout, load_valid_cache  # noqa: E402
from curated_pipeline.contracts import ContractError  # noqa: E402


DEFAULT_DATASET_ROOT = REPOSITORY_ROOT / "stylegraph_qwen_curated_processed (3)"
PUBLIC_BUCKET = "wardrobe-images"
LOCAL_SUPABASE_HOSTS = {"localhost", "127.0.0.1", "::1", "host.docker.internal"}
SOURCE_NAMESPACE = UUID("7e3f5aa4-6b29-4c0c-9f2a-e4d762b9a76b")

STYLE_DIMENSIONS = {
    "minimal",
    "casual",
    "smart_casual",
    "streetwear",
    "classic",
    "old_money",
    "sporty",
    "relaxed",
    "vintage",
    "trend_forward",
    "formal",
    "edgy",
}

CATEGORY_ALIASES = {
    "top": "top",
    "tops": "top",
    "bottom": "bottom",
    "bottoms": "bottom",
    "one_piece": "one_piece",
    "one-piece": "one_piece",
    "footwear": "footwear",
    "shoes": "footwear",
    "outerwear": "outerwear",
    "accessory": "accessory",
    "accessories": "accessory",
}

CATEGORY_LAYER_ROLE = {
    "top": "base_layer",
    "bottom": "bottom",
    "one_piece": "one_piece",
    "footwear": "footwear",
    "outerwear": "outerwear",
    "accessory": "accessory",
}


class BootstrapError(RuntimeError):
    """A safe, actionable bootstrap failure."""


@dataclass(frozen=True)
class CatalogCandidate:
    item_id: str
    source_identity: str
    source_relative_path: str
    processed_path: Path
    presentation_profile: str
    attributes: dict[str, Any]
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class RejectedCandidate:
    manifest_path: str
    reason: str


@dataclass(frozen=True)
class Inventory:
    valid: tuple[CatalogCandidate, ...]
    rejected: tuple[RejectedCandidate, ...]

    @property
    def category_counts(self) -> dict[str, int]:
        return dict(sorted(Counter(item.attributes["category"] for item in self.valid).items()))

    @property
    def presentation_counts(self) -> dict[str, int]:
        return dict(sorted(Counter(item.presentation_profile for item in self.valid).items()))

    @property
    def warning_counts(self) -> dict[str, int]:
        return dict(sorted(Counter(warning for item in self.valid for warning in item.warnings).items()))


@dataclass(frozen=True)
class ImportResult:
    inserted: int
    skipped: int
    category_counts: dict[str, int]
    curated_ownership_rows: int


def deterministic_source_identity(photo_sha256: str) -> str:
    digest = str(photo_sha256).strip().lower()
    if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
        raise BootstrapError("photo_sha256 must be a 64-character hexadecimal digest")
    return f"curated-cache-v1:sha256:{digest}"


def deterministic_item_id(photo_sha256: str) -> str:
    return str(uuid5(SOURCE_NAMESPACE, deterministic_source_identity(photo_sha256)))


def normalize_category(value: Any) -> tuple[str, str]:
    key = str(value or "").strip().lower().replace(" ", "_")
    category = CATEGORY_ALIASES.get(key)
    if category is None:
        raise BootstrapError(f"unsupported category: {value!r}")
    return category, CATEGORY_LAYER_ROLE[category]


def normalize_style_tags(value: Any) -> tuple[dict[str, float], tuple[str, ...]]:
    if not isinstance(value, dict) or not value:
        raise BootstrapError("style_tags must be a non-empty object")

    normalized: dict[str, float] = {}
    unsupported: list[str] = []
    for raw_key, raw_weight in value.items():
        key = str(raw_key).strip().lower().replace("-", "_").replace(" ", "_")
        if isinstance(raw_weight, bool) or not isinstance(raw_weight, (int, float)):
            raise BootstrapError(f"style_tags.{key or '<empty>'} must be numeric")
        weight = float(raw_weight)
        if not math.isfinite(weight) or not 0 <= weight <= 1:
            raise BootstrapError(f"style_tags.{key or '<empty>'} must be between 0 and 1")
        if key in STYLE_DIMENSIONS:
            normalized[key] = weight
        else:
            unsupported.append(key or "<empty>")

    if not normalized or not any(weight > 0 for weight in normalized.values()):
        raise BootstrapError("style_tags has no usable StyleGraph ranking dimensions")

    warnings = tuple(f"unsupported_style_tag:{key}" for key in sorted(set(unsupported)))
    return normalized, warnings


def onboarding_coverage(category_counts: dict[str, int]) -> dict[str, bool]:
    footwear = category_counts.get("footwear", 0) >= 2
    separates = category_counts.get("top", 0) >= 2 and category_counts.get("bottom", 0) >= 2
    one_piece = category_counts.get("one_piece", 0) >= 2
    return {
        "footwear": footwear,
        "separates_path": footwear and separates,
        "one_piece_path": footwear and one_piece,
        "eligible": footwear and (separates or one_piece),
    }


def _validate_manifest(layout: DatasetLayout, manifest_path: Path, min_confidence: float) -> CatalogCandidate:
    try:
        raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BootstrapError("manifest is not valid JSON") from exc
    if not isinstance(raw_manifest, dict):
        raise BootstrapError("manifest must be a JSON object")

    source_relative_path = raw_manifest.get("source_relative_path")
    if not isinstance(source_relative_path, str) or not source_relative_path.strip():
        raise BootstrapError("manifest source_relative_path is required")

    try:
        manifest, processed_path = load_valid_cache(
            layout,
            Path(source_relative_path),
            None,
            min_confidence,
        )
    except ContractError as exc:
        raise BootstrapError(str(exc)) from exc

    attributes = dict(manifest["attributes"])
    category, layer_role = normalize_category(attributes.get("category"))
    style_tags, warnings = normalize_style_tags(attributes.get("style_tags"))
    attributes["category"] = category
    attributes["layer_role"] = layer_role
    attributes["style_tags"] = style_tags

    for field in ("display_name", "subcategory"):
        if not isinstance(attributes.get(field), str) or not attributes[field].strip():
            raise BootstrapError(f"{field} must be a non-empty string")

    photo_sha256 = manifest.get("photo_sha256")
    source_identity = deterministic_source_identity(str(photo_sha256 or ""))
    profile = str(manifest.get("presentation_profile") or "unspecified").strip().lower()
    return CatalogCandidate(
        item_id=deterministic_item_id(str(photo_sha256)),
        source_identity=source_identity,
        source_relative_path=source_relative_path,
        processed_path=processed_path,
        presentation_profile=profile,
        attributes=attributes,
        warnings=warnings,
    )


def inventory_dataset(dataset_root: Path, min_confidence: float = 0.6) -> Inventory:
    layout = DatasetLayout(dataset_root)
    if not layout.manifests_root.is_dir():
        raise BootstrapError(f"manifest folder does not exist: {layout.manifests_root}")

    valid: list[CatalogCandidate] = []
    rejected: list[RejectedCandidate] = []
    for manifest_path in sorted(layout.manifests_root.rglob("*.json")):
        label = manifest_path.relative_to(layout.manifests_root).as_posix()
        try:
            valid.append(_validate_manifest(layout, manifest_path, min_confidence))
        except BootstrapError as exc:
            rejected.append(RejectedCandidate(label, str(exc)))
    return Inventory(tuple(valid), tuple(rejected))


def _load_local_credentials() -> tuple[str, str]:
    load_dotenv(REPOSITORY_ROOT / ".env")
    load_dotenv(REPOSITORY_ROOT / ".env.local", override=False)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_KEY") or ""
    if not url or not key:
        raise BootstrapError("local SUPABASE_URL and SUPABASE_SECRET_KEY are required")
    hostname = (urlparse(url).hostname or "").lower()
    if hostname not in LOCAL_SUPABASE_HOSTS:
        raise BootstrapError("refusing non-local Supabase URL")
    return url, key


def _ensure_public_bucket(supabase: Any) -> None:
    try:
        supabase.storage.create_bucket(PUBLIC_BUCKET, options={"public": True})
    except Exception as exc:
        message = str(exc).lower()
        if "already exists" not in message and "duplicate" not in message:
            raise BootstrapError("could not create or verify local curated image bucket") from exc


def _public_url(bucket: Any, object_path: str) -> str:
    result = bucket.get_public_url(object_path)
    if isinstance(result, str) and result:
        return result
    if isinstance(result, dict):
        data = result.get("data") if isinstance(result.get("data"), dict) else result
        value = data.get("publicUrl") or data.get("public_url")
        if isinstance(value, str) and value:
            return value
    raise BootstrapError("local Storage did not return a public image URL")


def _catalog_row(candidate: CatalogCandidate, image_url: str) -> dict[str, Any]:
    attributes = candidate.attributes
    return {
        "id": candidate.item_id,
        "image_url": image_url,
        "source": "curated",
        "status": "confirmed",
        "category": attributes["category"],
        "subcategory": attributes["subcategory"],
        "display_name": attributes["display_name"],
        "color": attributes["color"],
        "material": attributes["material"],
        "fit": attributes["fit"],
        "pattern": attributes["pattern"],
        "style_tags": attributes["style_tags"],
        "formality_score": attributes["formality_score"],
        "season_weights": attributes["season_weights"],
        "layer_role": attributes["layer_role"],
        "model_confidence": attributes["model_confidence"],
    }


def import_candidates(supabase: Any, candidates: tuple[CatalogCandidate, ...]) -> tuple[int, int]:
    """Import catalog rows only. This function never touches ownership tables."""
    _ensure_public_bucket(supabase)
    inserted = 0
    skipped = 0
    for candidate in candidates:
        existing_response = (
            supabase.table("wardrobe_items")
            .select("id,source,status")
            .eq("id", candidate.item_id)
            .limit(1)
            .execute()
        )
        existing = (existing_response.data or [None])[0]
        if existing is not None:
            if existing.get("source") != "curated" or existing.get("status") != "confirmed":
                raise BootstrapError(f"deterministic ID collision for {candidate.source_relative_path}")
            skipped += 1
            continue

        object_path = f"curated/{candidate.item_id}.png"
        bucket = supabase.storage.from_(PUBLIC_BUCKET)
        try:
            with candidate.processed_path.open("rb") as image:
                bucket.upload(
                    object_path,
                    image,
                    file_options={"content-type": "image/png", "upsert": "false"},
                )
            image_url = _public_url(bucket, object_path)
            supabase.table("wardrobe_items").insert(_catalog_row(candidate, image_url)).execute()
        except Exception as exc:
            try:
                bucket.remove([object_path])
            except Exception:
                pass
            if isinstance(exc, BootstrapError):
                raise
            raise BootstrapError(f"local import failed for {candidate.source_relative_path}") from exc
        inserted += 1
    return inserted, skipped


def verify_local_catalog(supabase: Any) -> tuple[dict[str, int], int]:
    catalog_response = (
        supabase.table("wardrobe_items")
        .select("category")
        .eq("source", "curated")
        .eq("status", "confirmed")
        .execute()
    )
    counts = dict(sorted(Counter(row.get("category") for row in (catalog_response.data or [])).items()))
    ownership_response = (
        supabase.table("user_wardrobe_items")
        .select("item_id,wardrobe_items!inner(source)", count="exact")
        .eq("wardrobe_items.source", "curated")
        .execute()
    )
    ownership_count = int(ownership_response.count or 0)
    return counts, ownership_count


def _inventory_payload(inventory: Inventory) -> dict[str, Any]:
    return {
        "valid": len(inventory.valid),
        "rejected": len(inventory.rejected),
        "category_counts": inventory.category_counts,
        "presentation_counts": inventory.presentation_counts,
        "warnings": inventory.warning_counts,
        "onboarding_coverage": onboarding_coverage(inventory.category_counts),
        "rejected_items": [rejected.__dict__ for rejected in inventory.rejected],
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Validate and report with zero database writes.")
    mode.add_argument("--local", action="store_true", help="Import into a loopback Supabase project only.")
    parser.add_argument("--confirm-local", action="store_true", help="Required acknowledgement for --local writes.")
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument("--min-confidence", type=float, default=0.6)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        inventory = inventory_dataset(args.dataset_root.resolve(), args.min_confidence)
        print(json.dumps(_inventory_payload(inventory), indent=2, sort_keys=True))
        if not inventory.valid:
            raise BootstrapError("no valid curated items were found")
        if args.dry_run:
            return 0
        if not args.confirm_local:
            raise BootstrapError("--local requires --confirm-local")

        url, key = _load_local_credentials()
        from supabase import create_client

        supabase = create_client(url, key)
        inserted, skipped = import_candidates(supabase, inventory.valid)
        category_counts, ownership_count = verify_local_catalog(supabase)
        result = ImportResult(inserted, skipped, category_counts, ownership_count)
        print(json.dumps(result.__dict__, indent=2, sort_keys=True))
        if ownership_count != 0:
            raise BootstrapError("curated ownership invariant failed")
        return 0
    except BootstrapError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
