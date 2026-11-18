import json
from types import SimpleNamespace

import httpx
import pytest

from scripts import hosted_curated_import as hosted


REF = "wwmumdmpruqwralxniwk"
URL = f"https://{REF}.supabase.co"
BUCKET = {"id": "wardrobe-images", "name": "wardrobe-images", "public": True,
          "owner": "", "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
          "file_size_limit": None, "allowed_mime_types": None}


@pytest.mark.parametrize("key", ["sb_secret_test-only", "legacy.jwt.test"])
def test_sdk_wire_auth_for_storage_and_database(key):
    requests = []

    def respond(request):
        requests.append(request)
        assert request.headers["apikey"] == key
        if key.startswith("sb_secret_"):
            assert "authorization" not in request.headers
        else:
            assert request.headers["authorization"] == f"Bearer {key}"
        if "/bucket/" in request.url.path:
            return httpx.Response(200, json=BUCKET)
        if "/object/wardrobe-images/" in request.url.path:
            return httpx.Response(200, json={"Key": "wardrobe-images/curated/test.png", "Id": "test"})
        return httpx.Response(200, json=[])

    client, http = hosted.create_hosted_client(URL, key, transport=httpx.MockTransport(respond))
    try:
        client.storage.get_bucket(hosted.EXPECTED_BUCKET)
        bucket = client.storage.from_(hosted.EXPECTED_BUCKET)
        assert not hosted.storage_object_exists(bucket, "curated/test.png")
        assert hosted.exact_existing_rows(client, SimpleNamespace(item_id="test")) == []
        bucket.upload("curated/test.png", b"test", {"content-type": "image/png", "upsert": "false"})
        client.table("wardrobe_items").insert({"id": "test"}).execute()
        assert len(requests) == 5
    finally:
        http.close()


@pytest.mark.parametrize("status", [401, 403, 500])
def test_http_errors_expose_operation_and_status_only(status):
    secret = "sb_secret_never-print"
    client, http = hosted.create_hosted_client(URL, secret, transport=httpx.MockTransport(
        lambda request: httpx.Response(status, json={"message": secret, "headers": "private"})
    ))
    try:
        with pytest.raises(hosted.HostedRequestError) as caught:
            client.storage.get_bucket(hosted.EXPECTED_BUCKET)
        assert str(caught.value) == f"storage bucket lookup failed; HTTP status {status}"
        assert secret not in str(caught.value)
    finally:
        http.close()


def test_project_guard_and_publishable_rejection(monkeypatch):
    monkeypatch.setenv("STYLEGRAPH_HOSTED_SUPABASE_URL", URL)
    monkeypatch.setenv("STYLEGRAPH_HOSTED_SUPABASE_SERVICE_KEY", "sb_secret_test")
    assert hosted.require_project_url(REF) == (URL, "sb_secret_test")
    with pytest.raises(hosted.BootstrapError):
        hosted.require_project_url("a" * 20)
    monkeypatch.setenv("STYLEGRAPH_HOSTED_SUPABASE_SERVICE_KEY", "sb_publishable_test")
    with pytest.raises(hosted.BootstrapError):
        hosted.require_project_url(REF)


@pytest.mark.parametrize("existing,orphan,expected", [(False, False, 0), (True, False, 0), (False, True, 1)])
def test_preflight_runs_duplicate_checks_without_writes(monkeypatch, tmp_path, capsys, existing, orphan, expected):
    image = tmp_path / "test.png"
    image.write_bytes(b"test")
    candidate = SimpleNamespace(item_id="test", processed_path=image, source_relative_path="muscline/test.png", presentation_profile="neutral",
                                attributes={"category": "top", "display_name": "Shirt"})
    monkeypatch.setattr(hosted, "inventory_dataset", lambda *_: SimpleNamespace(valid=[candidate], rejected=[]))
    monkeypatch.setenv("STYLEGRAPH_HOSTED_SUPABASE_URL", URL)
    monkeypatch.setenv("STYLEGRAPH_HOSTED_SUPABASE_SERVICE_KEY", "sb_secret_test")
    requests = []

    def respond(request):
        requests.append((request.method, request.url.path))
        assert "authorization" not in request.headers
        if "/bucket/" in request.url.path:
            return httpx.Response(200, json=BUCKET)
        if "/object/list/" in request.url.path:
            return httpx.Response(200, json=[{"name": "test.png"}] if existing or orphan else [])
        assert request.method == "GET"
        return httpx.Response(200, json=[{"id": "test", "source": "curated", "status": "confirmed", "catalog_collection": "masculine",
                                        "image_url": f"{URL}/storage/v1/object/public/wardrobe-images/curated/test.png"}] if existing else [])

    factory = hosted.create_hosted_client
    monkeypatch.setattr(hosted, "create_hosted_client", lambda url, key: factory(url, key, transport=httpx.MockTransport(respond)))
    monkeypatch.setattr(hosted, "save_json_exclusive", lambda *_: pytest.fail("preflight created a manifest"))
    monkeypatch.setattr("sys.argv", ["importer", "--preflight", "--target-project-ref", REF])
    assert hosted.main() == expected
    assert requests == [("GET", "/storage/v1/bucket/wardrobe-images"),
                        ("GET", "/rest/v1/wardrobe_items"), ("POST", "/storage/v1/object/list/wardrobe-images")]
    output = capsys.readouterr()
    assert "sb_secret_" not in output.out + output.err


@pytest.mark.parametrize(("folder", "expected"), [
    ("muscline", "masculine"), ("musculine", "masculine"), ("femine", "feminine"),
    ("shared", "shared"),
])
def test_legacy_folder_is_authoritative_even_when_older_manifest_defaulted_to_neutral(folder, expected):
    candidate = SimpleNamespace(source_relative_path=f"{folder}/shirt.png", presentation_profile="neutral")
    assert hosted.hosted_collection(candidate) == expected


def test_unknown_or_conflicting_collection_is_rejected():
    for path, profile in (("tops/shirt.png", "neutral"), ("femine/shirt.png", "masculine")):
        candidate = SimpleNamespace(source_relative_path=path, presentation_profile=profile)
        with pytest.raises(hosted.BootstrapError, match="missing or conflicting collection"):
            hosted.hosted_collection(candidate)


def test_hosted_apply_persists_collection_and_never_writes_ownership(monkeypatch, tmp_path):
    image = tmp_path / "shirt.png"
    image.write_bytes(b"image bytes")
    candidate = SimpleNamespace(
        item_id="test", processed_path=image, source_relative_path="muscline/shirt.png",
        presentation_profile="neutral", attributes={
            "category": "top", "subcategory": "shirt", "display_name": "Shirt", "color": {},
            "material": {}, "fit": {}, "pattern": "solid", "style_tags": {"minimal": 1},
            "formality_score": 0, "season_weights": {}, "layer_role": "base_layer", "model_confidence": 1,
        },
    )
    monkeypatch.setenv("STYLEGRAPH_HOSTED_SUPABASE_URL", URL)
    monkeypatch.setenv("STYLEGRAPH_HOSTED_SUPABASE_SERVICE_KEY", "sb_secret_fixture")
    monkeypatch.setattr(hosted, "inventory_dataset", lambda *_: SimpleNamespace(valid=[candidate], rejected=[]))
    writes = []

    def respond(request):
        path = request.url.path
        if "/bucket/" in path:
            return httpx.Response(200, json=BUCKET)
        if "/object/list/" in path or request.method == "GET":
            return httpx.Response(200, json=[])
        writes.append(path)
        if path == "/rest/v1/wardrobe_items":
            assert json.loads(request.content)["catalog_collection"] == "masculine"
            return httpx.Response(201, json=[{"id": "test"}])
        assert path == "/storage/v1/object/wardrobe-images/curated/test.png"
        return httpx.Response(200, json={"Key": "wardrobe-images/curated/test.png", "Id": "test"})

    factory = hosted.create_hosted_client
    monkeypatch.setattr(hosted, "create_hosted_client",
                        lambda url, key: factory(url, key, transport=httpx.MockTransport(respond)))
    rollback = tmp_path / "rollback.json"
    monkeypatch.setattr("sys.argv", ["importer", "--apply", "--target-project-ref", REF,
                                    "--confirm-project-ref", REF, "--confirm-phrase", f"IMPORT_CURATED_TO_{REF}",
                                    "--rollback-manifest", str(rollback)])
    assert hosted.main() == 0
    assert writes == ["/storage/v1/object/wardrobe-images/curated/test.png", "/rest/v1/wardrobe_items"]
    assert json.loads(rollback.read_text())["status"] == "completed"
