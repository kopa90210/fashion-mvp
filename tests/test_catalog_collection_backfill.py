import json

import pytest

from scripts.bootstrap_curated_catalog import BootstrapError, catalog_collection, deterministic_item_id
from scripts.build_catalog_collection_backfill import backfill_sql, manifest_mapping


@pytest.mark.parametrize(("source", "profile", "expected"), [
    ("masculine/tops/shirt.png", "masculine", "masculine"),
    ("feminine/tops/shirt.png", "feminine", "feminine"),
    ("unisex/tops/shirt.png", "neutral", "shared"),
    ("men/tops/shirt.png", "neutral", "masculine"),
    ("musculine/tops/shirt.png", "neutral", "masculine"),
    ("tops/shirt.png", "musculine", "masculine"),
])
def test_collection_from_import_provenance(source, profile, expected):
    assert catalog_collection(source, profile) == expected


@pytest.mark.parametrize(("source", "profile"), [
    ("tops/shirt.png", "neutral"),
    ("feminine/tops/shirt.png", "masculine"),
    ("masculine/feminine/tops/shirt.png", ""),
    ("musculine/tops/shirt.png", "feminine"),
])
def test_unknown_or_conflicting_collection_is_never_shared(source, profile):
    with pytest.raises(BootstrapError):
        catalog_collection(source, profile)


def test_backfill_uses_original_ids_and_rolls_back_by_default(tmp_path):
    manifests = tmp_path / "manifests"
    manifests.mkdir()
    digest = "a" * 64
    (manifests / "shirt.json").write_text(json.dumps({
        "source_relative_path": "masculine/tops/shirt.png",
        "photo_sha256": digest,
        "presentation_profile": "masculine",
    }))
    mapping = manifest_mapping([tmp_path])
    assert mapping == {deterministic_item_id(digest): "masculine"}
    assert backfill_sql(mapping, apply=False).endswith("rollback;\n")

    (manifests / "second.json").write_text(json.dumps({
        "source_relative_path": "feminine/tops/shirt.png",
        "photo_sha256": digest,
    }))
    with pytest.raises(BootstrapError, match="Conflicting collections"):
        manifest_mapping([tmp_path])
