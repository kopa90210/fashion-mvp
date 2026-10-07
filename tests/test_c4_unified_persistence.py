from pathlib import Path
import io

from PIL import Image

from curated_pipeline.batch_processor import persist_validated_artifact
from curated_pipeline.cache import DatasetLayout, file_sha256, load_valid_cache
from curated_pipeline.contracts import validate_remote_response

import base64


def _transparent_png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", (3, 4), (255, 0, 0, 0)).save(buffer, format="PNG")
    return buffer.getvalue()


def _payload() -> dict:
    png = _transparent_png()
    return {
        "schema_version": "curated-v1",
        "attributes": {
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
        },
        "cutout": {
            "mime_type": "image/png",
            "width": 3,
            "height": 4,
            "png_base64": base64.b64encode(png).decode("ascii"),
        },
    }


def test_shared_persistence_uses_current_cache_contract(tmp_path: Path) -> None:
    layout = DatasetLayout(tmp_path / "dataset")
    source = layout.raw / "feminine" / "tops" / "shirt.jpg"
    source.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (4, 4), "white").save(source)

    relative = layout.relative_source(source)
    digest = file_sha256(source)
    validated = validate_remote_response(_payload(), 0.6)

    manifest = persist_validated_artifact(
        layout,
        relative,
        digest,
        "feminine",
        "top",
        validated,
    )

    cached_manifest, cached_png = load_valid_cache(
        layout,
        relative,
        digest,
        0.6,
    )

    assert manifest["source_relative_path"] == "feminine/tops/shirt.jpg"
    assert cached_manifest["photo_sha256"] == digest
    assert cached_png == layout.processed_path(relative)
