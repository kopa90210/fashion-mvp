#!/usr/bin/env python3
"""StyleGraph hosted curated catalog importer.

Default mode is strictly local dry-run. Hosted writes require --apply, an exact
project-ref confirmation, a second exact approval phrase, and separate credentials.
Use --preflight for read-only hosted bucket and duplicate checks.
Import only; rollback actions are intentionally manual and audited.
Run this script from within the StyleGraph repo as scripts/hosted_curated_import.py.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlparse
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.bootstrap_curated_catalog import (  # noqa: E402
    BootstrapError,
    _catalog_row,
    inventory_dataset,
    onboarding_coverage,
)

EXPECTED_BUCKET = "wardrobe-images"
PROJECT_REF_RE = re.compile(r"^[a-z0-9]{20}$")


class HostedRequestError(BootstrapError):
    """Safe diagnostic containing no upstream response or credential data."""


def create_hosted_client(url: str, key: str, *, transport=None):
    """Keep opaque secret keys out of Authorization, including SDK subclients."""
    import httpx
    from supabase import ClientOptions, create_client

    def prepare_request(request):
        if request.url.host != urlparse(url).hostname or request.url.scheme != "https":
            raise HostedRequestError("hosted request destination rejected; HTTP status unavailable")
        request.headers["apikey"] = key
        if key.startswith("sb_secret_"):
            request.headers.pop("authorization", None)

    def check_response(response):
        if not response.is_success:
            path = response.request.url.path
            if path.startswith("/storage/v1/bucket/"):
                operation = "storage bucket lookup"
            elif path.startswith("/storage/v1/object/list/"):
                operation = "storage duplicate lookup"
            elif path.startswith("/storage/v1/object/"):
                operation = "storage upload"
            elif path.startswith("/rest/v1/wardrobe_items"):
                operation = "wardrobe row " + ("lookup" if response.request.method == "GET" else "insert")
            else:
                operation = "hosted request"
            raise HostedRequestError(f"{operation} failed; HTTP status {response.status_code}")

    # Hooks run after the SDK builds headers for both Storage and PostgREST.
    # Disabling session persistence/refresh prevents an Auth session replacing the key.
    http = httpx.Client(
        timeout=30, follow_redirects=False, transport=transport,
        event_hooks={"request": [prepare_request], "response": [check_response]},
    )
    try:
        client = create_client(url, key, options=ClientOptions(
            auto_refresh_token=False, persist_session=False, httpx_client=http,
        ))
    except Exception:
        http.close()
        raise HostedRequestError("hosted client setup failed; HTTP status unavailable") from None
    return client, http


def save_json_exclusive(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        json.dump(payload, stream, indent=2, sort_keys=True)
        stream.write("\n")


def save_json_atomic(path: Path, payload: dict) -> None:
    temp = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        with temp.open("x", encoding="utf-8") as stream:
            json.dump(payload, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def require_project_url(project_ref: str) -> tuple[str, str]:
    if not PROJECT_REF_RE.fullmatch(project_ref):
        raise BootstrapError("target project ref must be 20 lowercase letters/digits")
    url = os.environ.get("STYLEGRAPH_HOSTED_SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("STYLEGRAPH_HOSTED_SUPABASE_SERVICE_KEY", "").strip()
    parsed = urlparse(url)
    if (parsed.scheme != "https" or parsed.username or parsed.password or parsed.port
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment
            or parsed.hostname != f"{project_ref}.supabase.co"):
        raise BootstrapError("hosted URL must exactly match https://<target-project-ref>.supabase.co")
    if not key:
        raise BootstrapError("STYLEGRAPH_HOSTED_SUPABASE_SERVICE_KEY is missing")
    if key.startswith("sb_publishable_"):
        raise BootstrapError("hosted importer requires a secret or legacy service-role key")
    return url, key


def exact_existing_rows(supabase, candidate):
    result = (supabase.table("wardrobe_items")
              .select("id,source,status,image_url")
              .eq("id", candidate.item_id).limit(1).execute())
    return result.data or []


def storage_object_exists(bucket, object_path: str) -> bool:
    # Search only the single deterministic basename and compare the exact returned name.
    folder, filename = object_path.rsplit("/", 1)
    objects = bucket.list(folder, {"search": filename, "limit": 1000})
    return any(item.get("name") == filename for item in objects)


DEFAULT_DATASET_ROOT = (
    ROOT / "stylegraph_qwen_curated_processed (3)"
    if (ROOT / "stylegraph_qwen_curated_processed (3)").exists()
    else ROOT / "datasets"
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument("--min-confidence", type=float, default=0.6)
    parser.add_argument("--plan-output", type=Path, default=None)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true", help="Explicitly run local validation without hosted writes (default)")
    modes.add_argument("--preflight", action="store_true", help="Read hosted bucket and check duplicates; never write hosted data")
    modes.add_argument("--apply", action="store_true", help="Enable hosted writes after explicit approval")
    parser.add_argument("--target-project-ref", default="")
    parser.add_argument("--confirm-project-ref", default="")
    parser.add_argument("--confirm-phrase", default="")
    parser.add_argument("--rollback-manifest", type=Path, default=None)
    args = parser.parse_args()

    operation = "local validation"
    http = None
    try:
        ref = args.target_project_ref.strip().lower()
        if ref and not PROJECT_REF_RE.fullmatch(ref):
            raise BootstrapError("target project ref must be 20 lowercase letters/digits")

        inventory = inventory_dataset(args.dataset_root.resolve(), args.min_confidence)
        if inventory.rejected:
            raise BootstrapError(f"refusing import: {len(inventory.rejected)} rejected manifests")
        if not inventory.valid:
            raise BootstrapError("no valid curated candidates")
        ids = [x.item_id for x in inventory.valid]
        if len(ids) != len(set(ids)):
            raise BootstrapError("duplicate deterministic IDs within the dataset")

        candidates = sorted(inventory.valid, key=lambda x: x.item_id)
        from collections import Counter
        counts = dict(sorted(Counter(x.attributes["category"] for x in candidates).items()))

        # Verify physical images exist and compute missing image count
        missing_images = [
            x.source_relative_path for x in candidates if not x.processed_path.is_file()
        ]

        intended_writes = {
            "storage_bucket": EXPECTED_BUCKET,
            "storage_objects": len(candidates) - len(missing_images),
            "storage_path_pattern": f"{EXPECTED_BUCKET}/curated/<item-id>.png",
            "wardrobe_items_rows": len(candidates) - len(missing_images),
            "user_ownership_rows": 0,
        }

        plan = {
            "mode": "apply" if args.apply else "preflight-read-only" if args.preflight else "dry-run-local-only",
            "target_project_ref": ref or None,
            "dataset_root": str(args.dataset_root.resolve()),
            "valid": len(candidates),
            "rejected": len(inventory.rejected),
            "missing_images": len(missing_images),
            "missing_image_paths": missing_images,
            "category_counts": counts,
            "coverage": onboarding_coverage(counts),
            "intended_writes": intended_writes,
            "items": [{"id": x.item_id, "category": x.attributes["category"], "display_name": x.attributes["display_name"],
                       "source": x.source_relative_path, "object_path": f"curated/{x.item_id}.png"} for x in candidates],
        }
        if args.plan_output:
            save_json_exclusive(args.plan_output.resolve(), plan)
        print(json.dumps(plan, indent=2))
        if not args.apply and not args.preflight:
            print("DRY RUN ONLY: no network requests and no hosted writes.")
            return 0

        ref = args.target_project_ref
        if args.apply and (args.confirm_project_ref != ref or not PROJECT_REF_RE.fullmatch(ref)):
            raise BootstrapError("project confirmation mismatch")
        if args.apply and args.confirm_phrase != f"IMPORT_CURATED_TO_{ref}":
            raise BootstrapError("explicit import confirmation phrase mismatch")
        if args.apply and args.rollback_manifest is None:
            raise BootstrapError("--rollback-manifest must be supplied for --apply")
        manifest_path = args.rollback_manifest.resolve() if args.apply else None
        if manifest_path is not None and manifest_path.exists():
            raise BootstrapError("rollback manifest already exists; use a NEW path")
        if manifest_path is not None and manifest_path.is_relative_to(args.dataset_root.resolve()):
            raise BootstrapError("rollback manifest must be outside the dataset directory")
        operation = "hosted project and credential validation"
        url, key = require_project_url(ref)

        # Import only when explicitly armed; NEVER load project .env files here.
        operation = "hosted client setup"
        supabase, http = create_hosted_client(url, key)
        operation = "storage bucket lookup"
        bucket_metadata = supabase.storage.get_bucket(EXPECTED_BUCKET)
        is_public = (bucket_metadata.get("public") if isinstance(bucket_metadata, dict)
                     else getattr(bucket_metadata, "public", None))
        if is_public is not True:
            raise BootstrapError("existing wardrobe-images bucket must be public")
        bucket = supabase.storage.from_(EXPECTED_BUCKET)

        # Check every item and its storage object BEFORE the first write.
        actions = []
        for candidate in candidates:
            path = f"curated/{candidate.item_id}.png"
            operation = "wardrobe row lookup"
            rows = exact_existing_rows(supabase, candidate)
            operation = "storage duplicate lookup"
            exists = storage_object_exists(bucket, path)
            operation = "duplicate consistency validation"
            if rows:
                row = rows[0]
                if row["source"] != "curated" or row["status"] != "confirmed":
                    raise BootstrapError(f"ID collision: {candidate.item_id}")
                if not exists or not str(row.get("image_url", "")).endswith(path):
                    raise BootstrapError(f"existing row/storage mismatch: {candidate.item_id}")
                action = "skip"
            else:
                if exists:
                    raise BootstrapError(f"orphan preexisting image: {path}; manual reconciliation required")
                action = "insert"
            actions.append((candidate, path, action))

        if args.preflight:
            print(f"PREFLIGHT PASSED: {len(actions)} candidates; "
                  f"{sum(action == 'skip' for _, _, action in actions)} existing; "
                  "no hosted writes or rollback manifest created.")
            return 0

        record = {
            "schema": "stylegraph-curated-import-rollback-v1",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "target_project_ref": ref,
            "bucket": EXPECTED_BUCKET,
            "status": "in_progress",
            "warning": "Manual rollback only. Never delete preexisting items or user ownership.",
            "operations": [{"id": c.item_id, "object_path": path, "action": act,
                            "state": "skipped_existing" if act == "skip" else "planned"}
                           for c, path, act in actions],
        }
        save_json_exclusive(manifest_path, record)
        print(f"Audit/rollback manifest: {manifest_path}")
        for i, (candidate, path, action) in enumerate(actions):
            if action == "skip":
                continue
            entry = record["operations"][i]
            entry["state"] = "upload_intent"
            save_json_atomic(manifest_path, record)
            with candidate.processed_path.open("rb") as stream:
                operation = "storage upload"
                bucket.upload(path, stream, {"content-type": "image/png", "upsert": "false"})
            entry["state"] = "uploaded"
            save_json_atomic(manifest_path, record)
            image_url = bucket.get_public_url(path)
            if not isinstance(image_url, str) or not image_url.startswith(f"{url}/storage/v1/object/public/{EXPECTED_BUCKET}/"):
                raise BootstrapError(f"unexpected public URL for {path}; inspect manifest")
            entry["state"] = "insert_intent"
            save_json_atomic(manifest_path, record)
            operation = "wardrobe row insert"
            supabase.table("wardrobe_items").insert(_catalog_row(candidate, image_url)).execute()
            entry["state"] = "inserted"
            save_json_atomic(manifest_path, record)
            print(f"Inserted {candidate.item_id}")
        record["status"] = "completed"
        save_json_atomic(manifest_path, record)
        print("Import completed. Verify the catalog via authenticated Preview before promotion.")
        return 0
    except Exception as exc:
        # Report error only: never display API keys, exception representations, or full response bodies.
        detail = str(exc) if isinstance(exc, HostedRequestError) else f"{operation} failed; HTTP status unavailable"
        print(f"IMPORT STOPPED: {detail}; check rollback manifest if created.", file=sys.stderr)
        return 1
    finally:
        if http is not None:
            http.close()


if __name__ == "__main__":
    raise SystemExit(main())
