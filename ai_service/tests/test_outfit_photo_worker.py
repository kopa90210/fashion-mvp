import base64
import io

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from ai_service.notebook_outfit_bridge import create_app
from ai_service.outfit_photo_worker import InvalidProviderOutput, extract_outfit_photo
import ai_service.outfit_photo_worker as outfit_worker
from ai_service.worker import classify_failure


USER_ID = "11111111-1111-4111-8111-111111111111"


def png_b64():
    buffer = io.BytesIO()
    Image.new("RGB", (24, 30), "navy").save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


class FakeDb:
    def __init__(self, path=None):
        self.path = path or f"{USER_ID}/source.png"
        self.uploads = []

    def rows(self, table, params):
        if table == "source_photos":
            return [{"id": "photo", "media_asset_id": "asset", "status": "detecting"}]
        return [{"bucket_id": "private-wardrobe-media", "object_path": self.path,
                 "kind": "source_photo", "status": "active"}]

    def private_image(self, bucket, path):
        assert path == self.path
        return base64.b64decode(png_b64()), "image/png"

    def upload_private_png(self, user_id, path, data):
        assert user_id == USER_ID and path.startswith(f"{USER_ID}/")
        assert data.startswith(b"\x89PNG")
        self.uploads.append(path)


def transport(payload):
    return httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json=payload)))


def test_valid_outfit_creates_private_artifact_inputs_for_completion():
    payload = {"version": "outfit-v1", "garments": [{
        "label": "pants", "confidence": 0.9,
        "box": {"x": 0.1, "y": 0.2, "width": 0.4, "height": 0.7},
        "segmented_image_base64": png_b64(), "reconstructed_image_base64": png_b64(),
        "metadata": {"category": "bottom", "display_name": "Navy trousers",
                     "color": {"primary": "navy"}, "model_confidence": 0.8},
    }]}
    db = FakeDb()
    with transport(payload) as client:
        results = extract_outfit_photo(db, {"user_id": USER_ID, "source_photo_id": "photo"},
            "https://example.ngrok.app", "test-internal-token-long-enough", client)
    assert len(db.uploads) == 2
    assert results[0]["category"] == "bottom"
    assert results[0]["confidence"] == 0.8
    assert results[0]["original"]["object_path"] != results[0]["reconstructed"]["object_path"]
    assert len(results[0]["original"]["sha256"]) == 64


def test_cross_user_source_path_is_rejected_before_remote_call():
    db = FakeDb("another-user/source.png")
    with transport({"version": "outfit-v1", "garments": []}) as client:
        with pytest.raises(InvalidProviderOutput):
            extract_outfit_photo(db, {"user_id": USER_ID, "source_photo_id": "photo"},
                "https://example.ngrok.app", "test-internal-token-long-enough", client)
    assert db.uploads == []


def test_invalid_provider_artifact_is_permanent_and_never_uploaded():
    payload = {"version": "outfit-v1", "garments": [{
        "label": "pants", "confidence": 0.9,
        "box": {"x": 0.1, "y": 0.2, "width": 0.4, "height": 0.7},
        "segmented_image_base64": "not base64", "metadata": None,
    }]}
    db = FakeDb()
    with transport(payload) as client:
        with pytest.raises(InvalidProviderOutput) as error:
            extract_outfit_photo(db, {"user_id": USER_ID, "source_photo_id": "photo"},
                "https://example.ngrok.app", "test-internal-token-long-enough", client)
    assert classify_failure(error.value) == ("permanent_error", "PROVIDER_INVALID", "invalid")
    assert db.uploads == []


def test_oversized_provider_response_is_rejected_before_json_parse(monkeypatch):
    monkeypatch.setattr(outfit_worker, "MAX_RESPONSE_BYTES", 12)
    db = FakeDb()
    with transport({"version": "outfit-v1", "garments": []}) as client:
        with pytest.raises(InvalidProviderOutput, match="exceeds limit"):
            extract_outfit_photo(db, {"user_id": USER_ID, "source_photo_id": "photo"},
                "https://example.ngrok.app", "test-internal-token-long-enough", client)
    assert db.uploads == []


def test_bad_reconstruction_does_not_block_original_crop():
    payload = {"version": "outfit-v1", "garments": [{
        "label": "pants", "confidence": 0.9,
        "box": {"x": 0.1, "y": 0.2, "width": 0.4, "height": 0.7},
        "segmented_image_base64": png_b64(), "reconstructed_image_base64": "invalid",
    }]}
    db = FakeDb()
    with transport(payload) as client:
        results = extract_outfit_photo(db, {"user_id": USER_ID, "source_photo_id": "photo"},
            "https://example.ngrok.app", "test-internal-token-long-enough", client)
    assert len(db.uploads) == 1
    assert results[0]["reconstructed"] is None


def test_bridge_response_flows_through_worker_validation_without_gpu():
    app = create_app(
        token="test-internal-token-long-enough",
        segmenter=lambda image: [{"image": image.crop((2, 3, 20, 25)),
                                  "box": (2, 3, 20, 25), "crop_box": (1, 2, 21, 26),
                                  "label": "pants", "score": 0.92}],
        reconstructor=lambda image: image,
        metadata_extractor=lambda image: ['{"category":"bottom","display_name":"Blue trousers","color":{"primary":"blue"}}'],
    )
    with TestClient(app) as bridge_client:
        response = bridge_client.post("/v1/outfit-extract",
            headers={"X-Internal-Token": "test-internal-token-long-enough"},
            files={"file": ("outfit.png", base64.b64decode(png_b64()), "image/png")})
    assert response.status_code == 200
    db = FakeDb()
    with transport(response.json()) as client:
        results = extract_outfit_photo(db, {"user_id": USER_ID, "source_photo_id": "photo"},
            "https://example.ngrok.app", "test-internal-token-long-enough", client)
    assert len(results) == 1
    assert len(db.uploads) == 2
    assert results[0]["display_name"] == "Blue trousers"
    assert results[0]["box"] == {"x": 1 / 24, "y": 2 / 30, "width": 20 / 24, "height": 24 / 30}
