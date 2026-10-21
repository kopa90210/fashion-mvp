from pathlib import Path
import base64
import io
import json

from PIL import Image

from curated_pipeline.batch_processor import BatchProcessor, BatchContractError, export_processed_zip, transparent_png
from curated_pipeline.cache import DatasetLayout


def _image(path: Path, *, empty: bool = False):
    image = Image.new("RGBA", (40, 30), (0, 0, 0, 0))
    if not empty:
        for x in range(10, 30):
            for y in range(7, 24):
                image.putpixel((x, y), (220, 40, 60, 255))
    image.convert("RGB").save(path, format="JPEG")


class FakeProvider:
    def __init__(self):
        self.calls = 0

    def infer(
        self,
        image_bytes,
        mime_type,
        *,
        presentation_profile,
        expected_category,
    ):
        self.calls += 1

        category = expected_category or "top"

        role_map = {
            "top": "base_layer",
            "bottom": "bottom",
            "one_piece": "one_piece",
            "outerwear": "outerwear",
            "footwear": "footwear",
            "accessory": "accessory",
        }

        return {
            "category": category,
            "subcategory": "dress" if category == "one_piece" else "shirt",
            "display_name": "Red dress" if category == "one_piece" else "Red shirt",

            "color": {
                "primary": "red",
                "secondary": None,
                "family_weights": {
                    "neutral": 0.0,
                    "earth": 0.0,
                    "bright": 0.8,
                    "dark": 0.1,
                    "pastel": 0.1,
                },
            },

            "material": {
                "primary": "cotton",
                "weights": {
                    "cotton": 1.0,
                },
            },

            "fit": {
                "weights": {
                    "slim": 0.1,
                    "regular": 0.7,
                    "relaxed": 0.2,
                    "oversized": 0.0,
                },
            },

            "pattern": "solid",

            "style_tags": {
                "minimal": 0.3,
                "streetwear": 0.0,
                "formal": 0.1,
                "bohemian": 0.0,
                "edgy": 0.0,
                "earth_tones": 0.0,
                "smart_casual": 0.3,
                "sporty": 0.0,
            },

            "formality_score": 0.4,

            "season_weights": {
                "spring": 0.3,
                "summer": 0.3,
                "fall": 0.3,
                "winter": 0.1,
            },

            "layer_role": role_map[category],
            "model_confidence": 0.95,
        }


def _remover(data, mime):
    with Image.open(io.BytesIO(data)) as image:
        return image.convert("RGBA")


def test_batch_process_manifest_and_resume(tmp_path):
    layout = DatasetLayout(tmp_path / "dataset")
    source = layout.raw_root / "feminine" / "one_piece" / "nested" / "dress.jpg"
    source.parent.mkdir(parents=True)
    _image(source)
    provider = FakeProvider()
    first = BatchProcessor(layout, provider, background_remover=_remover).run()[0]
    assert first.processed == 1
    assert (layout.manifests_root / "feminine" / "one_piece" / "nested" / "dress.json").exists()
    second = BatchProcessor(layout, provider, background_remover=_remover).run()[0]
    assert second.skipped == 1 and provider.calls == 1
    forced = BatchProcessor(layout, provider, background_remover=_remover, force_reprocess=True).run()[0]
    assert forced.processed == 1 and provider.calls == 2


def test_transparent_png_rejects_empty_foreground():
    image = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
    try:
        transparent_png(image)
    except BatchContractError as exc:
        assert str(exc) == "empty_foreground"
    else:
        raise AssertionError("expected empty foreground rejection")


def test_batch_failure_isolated_and_reports_safe_fields(tmp_path):
    layout = DatasetLayout(tmp_path / "dataset")
    good = layout.raw_root / "masculine" / "tops" / "good.jpg"
    bad = layout.raw_root / "neutral" / "bottoms" / "bad.jpg"
    good.parent.mkdir(parents=True); bad.parent.mkdir(parents=True)
    _image(good); bad.write_bytes(b"not an image")
    summary, records, failures = BatchProcessor(layout, FakeProvider(), background_remover=_remover).run()
    assert summary.total == 2 and summary.processed == 1 and summary.failed == 1
    assert failures[0]["error_code"] in {"processing_failed", "invalid_response"}
    assert "GEMINI" not in json.dumps(failures)


def test_export_contains_only_cache_artifacts(tmp_path):
    for folder in ("processed", "manifests", "reports", "raw"):
        (tmp_path / folder).mkdir()
        (tmp_path / folder / "x.txt").write_text(folder)
    destination = export_processed_zip(tmp_path, tmp_path / "out.zip")
    import zipfile
    with zipfile.ZipFile(destination) as archive:
        names = archive.namelist()
    assert all(not name.startswith("raw/") for name in names)
    assert {"processed/x.txt", "manifests/x.txt", "reports/x.txt"} <= set(names)
