#!/usr/bin/env python3
"""Generate reviewed SQL to label existing curated rows from original manifests."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path

from scripts.bootstrap_curated_catalog import BootstrapError, catalog_collection, deterministic_item_id


def manifest_mapping(dataset_roots: list[Path]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for root in dataset_roots:
        paths = sorted((root / "manifests").rglob("*.json"))
        if not paths:
            raise BootstrapError(f"No manifests found under {root}")
        for path in paths:
            try:
                manifest = json.loads(path.read_text(encoding="utf-8"))
                item_id = deterministic_item_id(manifest["photo_sha256"])
                collection = catalog_collection(
                    manifest["source_relative_path"], manifest.get("presentation_profile") or "",
                )
            except (AttributeError, KeyError, OSError, TypeError, ValueError, BootstrapError) as exc:
                raise BootstrapError(f"Cannot classify {path}: {exc}") from exc
            if item_id in mapping and mapping[item_id] != collection:
                raise BootstrapError(f"Conflicting collections for the same image: {path}")
            mapping[item_id] = collection
    return mapping


def backfill_sql(mapping: dict[str, str], *, apply: bool) -> str:
    values = ",\n".join(f"  ('{item_id}'::uuid, '{collection}')" for item_id, collection in sorted(mapping.items()))
    catalog_match = """w.source = 'curated'
  and w.status = 'confirmed'
  and split_part(w.image_url, '?', 1) like '%/wardrobe-images/curated/' || w.id || '.png'"""
    return f"""begin;

create temporary table collection_manifest (id uuid primary key, collection text not null) on commit drop;
insert into collection_manifest values
{values};

-- Only exact existing curated imports are eligible. Never change ownership or Storage.
do $$
begin
  if exists (
    select 1 from public.wardrobe_items w join collection_manifest m on m.id = w.id
    where {catalog_match}
      and w.catalog_collection is not null and w.catalog_collection <> m.collection
  ) then
    raise exception 'An existing curated row has a different collection; review the manifests before proceeding.';
  end if;
end $$;

with labeled as (
  update public.wardrobe_items w set catalog_collection = m.collection
  from collection_manifest m
  where w.id = m.id and w.catalog_collection is null and {catalog_match}
  returning w.catalog_collection
)
select catalog_collection, count(*) as newly_labeled from labeled group by catalog_collection;

select catalog_collection, count(*) as total
from public.wardrobe_items
where source = 'curated' and status = 'confirmed'
group by catalog_collection order by catalog_collection;

{"commit" if apply else "rollback"};
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset_roots", type=Path, nargs="+")
    parser.add_argument("--out", type=Path, required=True, help="New SQL file")
    parser.add_argument("--apply", action="store_true", help="Generate COMMIT instead of ROLLBACK")
    args = parser.parse_args()
    try:
        mapping = manifest_mapping(args.dataset_roots)
        with args.out.open("x", encoding="utf-8") as output:
            output.write(backfill_sql(mapping, apply=args.apply))
    except (BootstrapError, OSError) as exc:
        parser.error(str(exc))
    print(f"Generated {'apply' if args.apply else 'rollback-only'} SQL for {dict(Counter(mapping.values()))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
