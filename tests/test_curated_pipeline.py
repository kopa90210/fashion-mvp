from __future__ import annotations

import base64
import io
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
from PIL import Image

from curated_pipeline.cache import DatasetLayout, derive_hints, file_sha256, load_valid_cache
from curated_pipeline.cli import find_duplicate_display_name, local_supabase_credentials, process_dataset, upload_dataset
from curated_pipeline.contracts import ContractError, validate_remote_response
from curated_pipeline.provider import ColabCuratedProvider, CuratedProviderError


def transparent_png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", (2, 3), (255, 0, 0, 0)).save(buffer, format="PNG")
    return buffer.getvalue()


def attributes() -> dict:
    return {
        "category": "top",
        "subcategory": "shirt",
        "display_name": "White Shirt",
        "color": {"primary": "white", "secondary": None, "family_weights": {"neutral": 1.0}},
        "material": {"primary": "cotton", "weights": {"cotton": 1.0}},
        "fit": {"weights": {"regular": 1.0}},
        "pattern": "solid",
        "style_tags": {"minimal": 1.0},
        "formality_score": 0.5,
        "season_weights": {"spring": 0.25, "summer": 0.25, "fall": 0.25, "winter": 0.25},
        "layer_role": "base_layer",
        "model_confidence": 0.9,
    }


def remote_payload() -> dict:
    png = transparent_png()
    return {
        "schema_version": "curated-v1",
        "attributes": attributes(),
        "cutout": {
            "mime_type": "image/png",
            "width": 2,
            "height": 3,
            "png_base64": base64.b64encode(png).decode("ascii"),
        },
    }


class FakeProvider:
    def __init__(self, payload: dict | None = None) -> None:
        self.payload = payload or remote_payload()
        self.calls: list[tuple[str, str]] = []

    def process(self, image_path: Path, presentation_profile: str, expected_category: str) -> dict:
        self.calls.append((presentation_profile, expected_category))
        return self.payload


def make_raw(layout: DatasetLayout, relative: str = "feminine/tops/shirt.jpg") -> Path:
    path = layout.raw / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (4, 4), "white").save(path)
    return path


def test_successful_response_is_validated() -> None:
    result = validate_remote_response(remote_payload(), 0.6)
    assert result.schema_version == "curated-v1"
    assert result.attributes["category"] == "top"
    assert result.png_bytes.startswith(b"\x89PNG")


def test_bad_schema_is_rejected() -> None:
    payload = remote_payload()
    payload["schema_version"] = "old"
    try:
        validate_remote_response(payload, 0.6)
    except ContractError as exc:
        assert "schema_version" in str(exc)
    else:
        raise AssertionError("bad schema was accepted")


def test_bad_base64_is_rejected() -> None:
    payload = remote_payload()
    payload["cutout"]["png_base64"] = "not-base64!!"
    try:
        validate_remote_response(payload, 0.6)
    except ContractError as exc:
        assert "base64" in str(exc)
    else:
        raise AssertionError("bad base64 was accepted")


def provider_with(handler) -> ColabCuratedProvider:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return ColabCuratedProvider("https://colab.example", "secret-token", 1, client)


def test_remote_request_sends_file_hints_and_bearer_token() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/curated/process"
        assert request.headers["authorization"] == "Bearer secret-token"
        body = request.read()
        assert b'form-data; name="presentation_profile"' in body
        assert b"feminine" in body
        assert b'form-data; name="expected_category"' in body
        assert b"top" in body
        return httpx.Response(200, json=remote_payload(), request=request)

    payload = provider_with(handler).process(Path(__file__), "feminine", "top")
    assert payload["schema_version"] == "curated-v1"


def test_remote_timeout_is_safe() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("private request detail", request=request)

    try:
        provider_with(handler).process(Path(__file__), "neutral", "top")
    except CuratedProviderError as exc:
        assert str(exc) == "Curated processing timed out"
        assert "secret-token" not in str(exc)
    else:
        raise AssertionError("timeout was accepted")


def test_remote_401_is_safe() -> None:
    provider = provider_with(lambda request: httpx.Response(401, request=request))
    try:
        provider.process(Path(__file__), "neutral", "top")
    except CuratedProviderError as exc:
        assert "HTTP 401" in str(exc)
        assert "secret-token" not in str(exc)
    else:
        raise AssertionError("401 was accepted")


def test_remote_500_is_safe() -> None:
    provider = provider_with(lambda request: httpx.Response(500, text="private body", request=request))
    try:
        provider.process(Path(__file__), "neutral", "top")
    except CuratedProviderError as exc:
        assert str(exc) == "Curated processing failed (HTTP 500)"
        assert "private body" not in str(exc)
    else:
        raise AssertionError("500 was accepted")


def test_resume_from_hash_matched_manifest(tmp_path: Path) -> None:
    layout = DatasetLayout(tmp_path / "datasets")
    photo = make_raw(layout)
    first = FakeProvider()
    assert process_dataset(layout, first).processed == 1
    second = FakeProvider()
    summary = process_dataset(layout, second)
    assert summary.skipped == 1
    assert second.calls == []
    manifest, _ = load_valid_cache(layout, layout.relative_source(photo), file_sha256(photo), 0.6)
    assert manifest["photo_sha256"] == file_sha256(photo)


def test_force_reprocesses_valid_cache(tmp_path: Path) -> None:
    layout = DatasetLayout(tmp_path / "datasets")
    make_raw(layout)
    process_dataset(layout, FakeProvider())
    provider = FakeProvider()
    summary = process_dataset(layout, provider, force=True)
    assert summary.processed == 1
    assert provider.calls == [("feminine", "top")]


def test_failed_image_does_not_stop_batch(tmp_path: Path) -> None:
    layout = DatasetLayout(tmp_path / "datasets")
    make_raw(layout, "feminine/tops/a.jpg")
    make_raw(layout, "feminine/tops/b.jpg")

    class OneFailureProvider(FakeProvider):
        def process(self, image_path: Path, presentation_profile: str, expected_category: str) -> dict:
            if image_path.name == "a.jpg":
                raise CuratedProviderError("Curated processing failed (HTTP 500)")
            return super().process(image_path, presentation_profile, expected_category)

    summary = process_dataset(layout, OneFailureProvider())
    assert summary.processed == 1
    assert summary.rejected == 1


def test_folder_hints_preserve_profile_and_category() -> None:
    assert derive_hints(Path("masculine/footwear/loafer.jpg")) == ("masculine", "footwear")
    assert derive_hints(Path("neutral/accessories/belt.png")) == ("neutral", "accessory")


def test_feminine_one_piece_hint_mapping() -> None:
    assert derive_hints(Path("feminine/one_piece/dress.jpg")) == ("feminine", "one_piece")


def test_feminine_one_piece_response_is_accepted_and_cached(tmp_path: Path) -> None:
    layout = DatasetLayout(tmp_path / "datasets")
    photo = make_raw(layout, "feminine/one_piece/dress.jpg")
    payload = remote_payload()
    payload["attributes"].update({
        "category": "one_piece",
        "subcategory": "midi dress",
        "display_name": "Blue Midi Dress",
        "layer_role": "one_piece",
    })
    summary = process_dataset(layout, FakeProvider(payload))
    assert summary.processed == 1
    manifest, _ = load_valid_cache(layout, layout.relative_source(photo), file_sha256(photo), 0.6)
    assert manifest["attributes"]["category"] == "one_piece"
    assert manifest["attributes"]["layer_role"] == "one_piece"


def test_upload_credentials_reject_remote_supabase(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://remote-project.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-only-key")
    try:
        local_supabase_credentials()
    except RuntimeError as exc:
        assert str(exc) == "Upload mode only permits a local Supabase URL"
    else:
        raise AssertionError("remote Supabase URL was accepted")


def test_upload_credentials_accept_loopback_supabase(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:54321")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-only-key")
    assert local_supabase_credentials() == ("http://127.0.0.1:54321", "test-only-key")


class FakeQuery:
    def __init__(self, database: "FakeSupabase", table: str) -> None:
        self.database = database
        self.table = table
        self.action = "select"
        self.payload = None
        self.filters: list[tuple[str, object]] = []

    def select(self, *_args):
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
        if self.action == "insert":
            self.database.rows[self.table].append(self.payload)
            return SimpleNamespace(data=[self.payload])
        rows = self.database.rows[self.table]
        for key, value in self.filters:
            rows = [row for row in rows if row.get(key) == value]
        return SimpleNamespace(data=rows)


class FakeBucket:
    def __init__(self, database: "FakeSupabase") -> None:
        self.database = database

    def upload(self, path, file, file_options):
        self.database.uploads.append((path, file.read(), file_options))

    def get_public_url(self, path):
        return f"http://127.0.0.1/storage/{path}"


class FakeStorage:
    def __init__(self, database: "FakeSupabase") -> None:
        self.database = database

    def from_(self, _bucket):
        return FakeBucket(self.database)


class FakeSupabase:
    def __init__(self) -> None:
        self.rows = {"extraction_log": [], "wardrobe_items": []}
        self.uploads: list[tuple] = []
        self.storage = FakeStorage(self)

    def table(self, name):
        return FakeQuery(self, name)


def test_same_color_and_material_do_not_make_distinct_footwear_duplicates() -> None:
    database = FakeSupabase()
    database.rows["wardrobe_items"].append(
        {
            "category": "footwear",
            "display_name": "Black Leather Boot",
            "color": {"primary": "black"},
            "material": {"primary": "leather"},
        }
    )

    duplicate_name, similarity = find_duplicate_display_name(
        database,
        category="footwear",
        new_display_name="Black Leather High-Heeled Pumps",
        color_primary="black",
        material_primary="leather",
    )

    assert duplicate_name is None
    assert similarity == 0.0


def test_local_upload_uses_cached_output_without_remote_call(tmp_path: Path) -> None:
    layout = DatasetLayout(tmp_path / "datasets")
    make_raw(layout)
    provider = FakeProvider()
    process_dataset(layout, provider)
    database = FakeSupabase()
    summary = upload_dataset(layout, database)
    assert summary.accepted == 1
    assert len(provider.calls) == 1
    assert database.uploads[0][2]["content-type"] == "image/png"
    assert database.rows["wardrobe_items"][0]["source"] == "curated"
    assert database.rows["extraction_log"][0]["status"] == "accepted"
    stored_manifest = database.rows["extraction_log"][0]["raw_response"]
    assert "png_base64" not in json.dumps(stored_manifest)
