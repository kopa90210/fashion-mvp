from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

import scripts.bootstrap_curated_catalog as bootstrap
from scripts.bootstrap_curated_catalog import (
    BootstrapError,
    CatalogCandidate,
    DEFAULT_DATASET_ROOT,
    deterministic_item_id,
    deterministic_source_identity,
    import_candidates,
    inventory_dataset,
    normalize_category,
    normalize_style_tags,
    onboarding_coverage,
)


DIGEST = "a" * 64


def candidate(image: Path) -> CatalogCandidate:
    return CatalogCandidate(
        item_id=deterministic_item_id(DIGEST),
        source_identity=deterministic_source_identity(DIGEST),
        source_relative_path="feminine/tops/example.png",
        processed_path=image,
        presentation_profile="feminine",
        attributes={
            "category": "top",
            "subcategory": "shirt",
            "display_name": "White Shirt",
            "color": {"primary": "white"},
            "material": {"primary": "cotton"},
            "fit": {"primary": "regular"},
            "pattern": "solid",
            "style_tags": {"minimal": 1.0},
            "formality_score": 0.5,
            "season_weights": {"spring": 1.0},
            "layer_role": "base_layer",
            "model_confidence": 0.9,
        },
        warnings=(),
    )


class FakeQuery:
    def __init__(self, database: "FakeSupabase", table: str):
        self.database = database
        self.table = table
        self.action = "select"
        self.payload = None
        self.filters: list[tuple[str, object]] = []

    def select(self, *_args, **_kwargs):
        self.action = "select"
        return self

    def insert(self, payload):
        self.action = "insert"
        self.payload = payload
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def limit(self, _count):
        return self

    def execute(self):
        self.database.table_accesses.append(self.table)
        if self.action == "insert":
            self.database.rows[self.table].append(dict(self.payload))
            return SimpleNamespace(data=[self.payload])
        rows = self.database.rows[self.table]
        for key, value in self.filters:
            rows = [row for row in rows if row.get(key) == value]
        return SimpleNamespace(data=rows)


class FakeBucket:
    def __init__(self, database: "FakeSupabase"):
        self.database = database

    def upload(self, path, file, file_options):
        self.database.uploads[path] = (file.read(), file_options)

    def get_public_url(self, path):
        return f"http://127.0.0.1:54321/storage/v1/object/public/wardrobe-images/{path}"

    def remove(self, paths):
        for path in paths:
            self.database.uploads.pop(path, None)


class FakeStorage:
    def __init__(self, database: "FakeSupabase"):
        self.database = database

    def create_bucket(self, name, options):
        self.database.buckets[name] = options

    def from_(self, _name):
        return FakeBucket(self.database)


class FakeSupabase:
    def __init__(self):
        self.rows = {"wardrobe_items": [], "user_wardrobe_items": []}
        self.uploads: dict[str, tuple[bytes, dict]] = {}
        self.buckets: dict[str, dict] = {}
        self.table_accesses: list[str] = []
        self.storage = FakeStorage(self)

    def table(self, name):
        return FakeQuery(self, name)


def test_source_identity_is_deterministic_and_content_based() -> None:
    assert deterministic_item_id(DIGEST) == deterministic_item_id(DIGEST.upper())
    assert deterministic_item_id(DIGEST) != deterministic_item_id("b" * 64)
    assert deterministic_source_identity(DIGEST).endswith(DIGEST)


def test_category_normalization_uses_canonical_role_mapping() -> None:
    assert normalize_category("tops") == ("top", "base_layer")
    assert normalize_category("one-piece") == ("one_piece", "one_piece")
    assert normalize_category("accessories") == ("accessory", "accessory")
    with pytest.raises(BootstrapError, match="unsupported category"):
        normalize_category("costume")


@pytest.mark.parametrize(
    "style_tags, message",
    [
        ({}, "non-empty"),
        ({"minimal": "high"}, "numeric"),
        ({"minimal": 1.2}, "between 0 and 1"),
        ({"bohemian": 1.0}, "no usable"),
    ],
)
def test_invalid_style_metadata_is_rejected(style_tags, message) -> None:
    with pytest.raises(BootstrapError, match=message):
        normalize_style_tags(style_tags)


def test_style_tags_keep_ranking_dimensions_and_flag_unsupported_tags() -> None:
    tags, warnings = normalize_style_tags({"minimal": 0.8, "bohemian": 0.5})
    assert tags == {"minimal": 0.8}
    assert warnings == ("unsupported_style_tag:bohemian",)


def test_import_writes_catalog_only_and_is_idempotent(tmp_path: Path) -> None:
    image = tmp_path / "item.png"
    image.write_bytes(b"validated-png")
    database = FakeSupabase()
    items = (candidate(image),)

    assert import_candidates(database, items) == (1, 0)
    assert import_candidates(database, items) == (0, 1)
    assert len(database.rows["wardrobe_items"]) == 1
    row = database.rows["wardrobe_items"][0]
    assert row["source"] == "curated"
    assert row["status"] == "confirmed"
    assert row["layer_role"] == "base_layer"
    assert "user_wardrobe_items" not in database.table_accesses
    assert database.rows["user_wardrobe_items"] == []
    assert len(database.uploads) == 1


def test_onboarding_coverage_supports_separates_or_one_piece() -> None:
    assert onboarding_coverage({"footwear": 2, "top": 2, "bottom": 2})["eligible"]
    assert onboarding_coverage({"footwear": 2, "one_piece": 2})["eligible"]
    assert not onboarding_coverage({"footwear": 2, "top": 2})["eligible"]


def test_repository_canonical_dataset_is_valid_and_onboarding_eligible() -> None:
    inventory = inventory_dataset(DEFAULT_DATASET_ROOT)
    assert len(inventory.valid) == 29
    assert inventory.rejected == ()
    assert inventory.category_counts == {
        "accessory": 4,
        "bottom": 5,
        "footwear": 7,
        "one_piece": 4,
        "outerwear": 2,
        "top": 7,
    }
    assert onboarding_coverage(inventory.category_counts)["one_piece_path"]
    assert onboarding_coverage(inventory.category_counts)["separates_path"]


def test_dry_run_does_not_load_database_credentials(monkeypatch, capsys) -> None:
    monkeypatch.setattr(
        bootstrap,
        "_load_local_credentials",
        lambda: (_ for _ in ()).throw(AssertionError("dry-run attempted database access")),
    )
    assert bootstrap.main(["--dry-run", "--dataset-root", str(DEFAULT_DATASET_ROOT)]) == 0
    assert '"valid": 29' in capsys.readouterr().out


def test_local_credentials_reject_hosted_supabase(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://remote-project.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-only-key")
    with pytest.raises(BootstrapError, match="refusing non-local"):
        bootstrap._load_local_credentials()
