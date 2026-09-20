import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from ai_service.notebook_outfit_bridge import create_app


TOKEN = "test-internal-token-long-enough"


def image_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (80, 100), "navy").save(buffer, format="PNG")
    return buffer.getvalue()


def bridge(reconstruct=True):
    def segment(image):
        return [{"image": image.crop((10, 20, 50, 90)), "box": (10, 20, 50, 90),
                 "label": "pants", "score": 0.91}]

    def reconstruct_image(crop):
        if not reconstruct:
            raise RuntimeError("GPU unavailable")
        return crop

    return TestClient(create_app(token=TOKEN, segmenter=segment,
                                 reconstructor=reconstruct_image,
                                 metadata_extractor=lambda image: ['{"category":"bottom","display_name":"Navy trousers"}']))


def test_requires_server_token_before_inference():
    with bridge() as client:
        response = client.post("/v1/outfit-extract", files={"file": ("outfit.png", image_bytes(), "image/png")})
    assert response.status_code == 401


def test_returns_separate_crop_box_metadata_and_optional_reconstruction():
    with bridge() as client:
        response = client.post("/v1/outfit-extract", headers={"X-Internal-Token": TOKEN},
                               files={"file": ("outfit.png", image_bytes(), "image/png")})
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == "outfit-v1"
    garment = body["garments"][0]
    assert garment["box"] == {"x": 0.125, "y": 0.2, "width": 0.5, "height": 0.7}
    assert garment["metadata"]["category"] == "bottom"
    assert garment["metadata_status"] == "valid"
    assert garment["reconstruction_status"] == "done"
    assert base64.b64decode(garment["segmented_image_base64"]).startswith(b"\x89PNG")


def test_reconstruction_failure_keeps_segmented_crop():
    with bridge(reconstruct=False) as client:
        response = client.post("/v1/outfit-extract", headers={"X-Internal-Token": TOKEN},
                               files={"file": ("outfit.png", image_bytes(), "image/png")})
    assert response.status_code == 200
    garment = response.json()["garments"][0]
    assert garment["reconstructed_image_base64"] is None
    assert garment["reconstruction_status"] == "failed"
    assert garment["segmented_image_base64"]


def test_invalid_metadata_still_returns_reviewable_crop():
    client = TestClient(create_app(token=TOKEN,
        segmenter=lambda image: [{"image": image, "box": (0, 0, 80, 100),
                                  "label": "pants", "score": 0.9}],
        reconstructor=lambda image: image,
        metadata_extractor=lambda image: ["truncated JSON {"]))
    with client:
        response = client.post("/v1/outfit-extract", headers={"X-Internal-Token": TOKEN},
            files={"file": ("outfit.png", image_bytes(), "image/png")})
    assert response.status_code == 200
    garment = response.json()["garments"][0]
    assert garment["metadata_status"] == "invalid"
    assert garment["metadata"] is None
    assert garment["segmented_image_base64"]
