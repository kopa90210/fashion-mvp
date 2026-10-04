import base64
import hashlib
import io
import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from PIL import Image

from ai_service.outfit_photo_worker import InvalidProviderOutput
from ai_service.providers.outfit.gemini_provider import GeminiOutfitProvider


USER_ID = "11111111-1111-4111-8111-111111111111"
JOB = {"user_id": USER_ID, "source_photo_id": "photo-1"}


class FakeGeminiClient:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.calls = []
        self.interactions = SimpleNamespace(create=self.create)

    def create(self, **kwargs):
        self.calls.append(kwargs)
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return SimpleNamespace(output_text=response)


class FakeDb:
    def __init__(self, fail_on_upload=None):
        buffer = io.BytesIO()
        Image.new("RGB", (100, 120), "navy").save(buffer, format="PNG")
        self.image_bytes = buffer.getvalue()
        self.uploads = []
        self.deletes = []
        self.upload_attempts = 0
        self.fail_on_upload = fail_on_upload

    def rows(self, table, params):
        if table == "source_photos":
            assert params["id"] == "eq.photo-1"
            assert params["user_id"] == f"eq.{USER_ID}"
            return [{"id": "photo-1", "media_asset_id": "asset-1", "status": "detecting"}]
        if table == "media_assets":
            assert params["id"] == "eq.asset-1"
            assert params["owner_id"] == f"eq.{USER_ID}"
            return [{"bucket_id": "private-wardrobe-media",
                     "object_path": f"{USER_ID}/source.png",
                     "kind": "source_photo", "status": "active"}]
        raise AssertionError(f"Unexpected table: {table}")

    def private_image(self, bucket, path):
        assert bucket == "private-wardrobe-media"
        assert path == f"{USER_ID}/source.png"
        return self.image_bytes, "image/png"

    def upload_private_png(self, user_id, path, data):
        assert user_id == USER_ID
        assert path.startswith(f"{USER_ID}/") and path.endswith(".png")
        self.upload_attempts += 1
        if self.upload_attempts == self.fail_on_upload:
            raise RuntimeError("Test upload failed")
        self.uploads.append((user_id, path, data))

    def delete_private_image(self, user_id, path):
        self.deletes.append((user_id, path))


@pytest.fixture
def settings():
    # Only the fields used by this provider; no environment or secret loading.
    return SimpleNamespace(gemini_api_key="test-key", gemini_outfit_model="test-model",
                           outfit_max_garments=8)


@pytest.fixture
def garments():
    return [
        {"category": category, "subcategory": subcategory, "display_name": name,
         "color_primary": color, "confidence": confidence, "fit": "regular",
         "pattern": "solid", "style_tags": ["Smart Casual"], "formality_score": 0.6,
         "box_2d": [100, 200, 700, 800],
         "mask": [[200, 100], [800, 100], [200, 700]]}
        for category, subcategory, name, color, confidence in (
            ("top", "button-up shirt", "Blue button-up shirt", "blue", 0.94),
            ("bottom", "trousers", "Navy trousers", "navy", 0.91),
            ("footwear", "sneakers", "White sneakers", "white", 0.88),
            ("accessory", "sunglasses", "Black sunglasses", "black", 0.86),
        )
    ]


def test_valid_outfit_normalizes_and_uploads_segmented_artifacts(settings, garments):
    client = FakeGeminiClient(json.dumps({"boxes": garments}))
    db = FakeDb()
    results = GeminiOutfitProvider(settings, client=client).extract(db, JOB)

    assert [result["category"] for result in results] == ["top", "bottom", "footwear", "accessory"]
    assert len(db.uploads) == 4
    assert len({path for _, path, _ in db.uploads}) == 4
    assert db.deletes == []
    assert len(client.calls) == 1
    request = client.calls[0]
    assert request["model"] == "test-model"
    assert request["response_format"]["mime_type"] == "application/json"
    assert "boxes" in request["response_format"]["schema"]["properties"]
    assert request["input"][1]["mime_type"] == "image/png"
    assert base64.b64decode(request["input"][1]["data"]) == db.image_bytes

    for result, garment, (_, path, data) in zip(results, garments, db.uploads):
        assert result["subcategory"] == garment["subcategory"]
        assert result["display_name"] == garment["display_name"]
        assert result["color"] == {"primary": garment["color_primary"]}
        assert result["confidence"] == garment["confidence"]
        assert result["formality_score"] == garment["formality_score"]
        assert result["fit"] == {"weights": {} if result["category"] in
                                 {"footwear", "accessory"} else {"regular": 1.0}}
        assert result["pattern"] == "solid"
        assert result["style_tags"] == {"smart-casual": 1.0}
        assert result["reconstructed"] is None
        assert result["box"] == pytest.approx({"x": 0.2, "y": 0.1, "width": 0.6, "height": 0.6})
        assert all(0 <= value <= 1 for value in result["box"].values())
        assert result["original"] == {
            "object_path": path, "byte_size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "width": 60, "height": 72,
        }
        with Image.open(io.BytesIO(data)) as crop:
            assert crop.format == "PNG"
            assert crop.mode == "RGBA"
            assert crop.size == (60, 72)
            assert crop.getchannel("A").getextrema() == (0, 255)


def test_low_confidence_accessory_is_filtered_without_losing_outfit(settings, garments):
    garments[-1]["confidence"] = 0.84
    client = FakeGeminiClient(json.dumps({"boxes": garments}))
    db = FakeDb()

    results = GeminiOutfitProvider(settings, client=client).extract(db, JOB)

    assert [result["category"] for result in results] == ["top", "bottom", "footwear"]
    assert [result["confidence"] for result in results] == [0.94, 0.91, 0.88]
    assert len(db.uploads) == 3
    assert db.deletes == []


@pytest.mark.parametrize("output_text", ["not JSON", '{"boxes": [{}]}', '{"boxes": "invalid"}'])
def test_malformed_structured_output_is_rejected(settings, output_text):
    client = FakeGeminiClient(output_text)
    db = FakeDb()

    with pytest.raises(InvalidProviderOutput, match="schema validation"):
        GeminiOutfitProvider(settings, client=client).extract(db, JOB)

    assert len(client.calls) == 1
    assert db.uploads == []
    assert db.deletes == []


def test_transient_failure_retries_then_succeeds(settings, garments, monkeypatch):
    sleep = Mock()
    monkeypatch.setattr("ai_service.providers.outfit.gemini_provider.time.sleep", sleep)
    monkeypatch.setattr("ai_service.providers.outfit.gemini_provider.random.uniform", lambda *args: 0)
    client = FakeGeminiClient(RuntimeError("503 service_unavailable: high demand"),
                              json.dumps({"boxes": garments}))
    db = FakeDb()

    results = GeminiOutfitProvider(settings, client=client).extract(db, JOB)

    assert len(client.calls) == 2
    assert client.calls[0] == client.calls[1]
    sleep.assert_called_once_with(2)
    assert len(results) == 4
    assert len(db.uploads) == 4


def test_later_upload_failure_cleans_up_completed_uploads(settings, garments):
    client = FakeGeminiClient(json.dumps({"boxes": garments}))
    db = FakeDb(fail_on_upload=2)

    with pytest.raises(RuntimeError, match="Test upload failed"):
        GeminiOutfitProvider(settings, client=client).extract(db, JOB)

    assert db.upload_attempts == 2
    assert len(db.uploads) == 1
    assert db.deletes == [(USER_ID, db.uploads[0][1])]
