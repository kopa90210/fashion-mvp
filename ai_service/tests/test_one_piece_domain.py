from ai_service.outfit_photo_worker import LABEL_CATEGORY, _normalize_garment
from ai_service.providers.outfit.gemini_normalizer import normalize_category
from ai_service.scoring.engine import deterministic_fallback, is_valid_outfit_structure, validate_ai_response

from ai_service.tests.test_outfit_photo_worker import png_b64


def item(item_id: str, role: str, score: float = 0.8) -> dict:
    return {"id": item_id, "display_name": item_id, "layer_role": role, "style_tags": {"minimal": score}}


def test_one_piece_structure_and_fallback() -> None:
    dress, shoes = item("dress", "one_piece"), item("shoes", "footwear")
    assert is_valid_outfit_structure([dress, shoes])
    assert not is_valid_outfit_structure([dress])
    assert not is_valid_outfit_structure([dress, shoes, item("skirt", "bottom")])
    result = deterministic_fallback([dress, shoes], {"minimal": 1.0})
    assert result is not None
    assert result["item_ids"] == ["dress", "shoes"]


def test_ai_response_accepts_one_piece_archetype() -> None:
    pool = [item("dress", "one_piece"), item("shoes", "footwear")]
    response = {"item_ids": ["dress", "shoes"], "reasoning": ["Balanced look"], "confidence": 0.8}
    assert validate_ai_response(response, pool) is not None


def test_gemini_and_notebook_normalizers_preserve_one_piece() -> None:
    assert normalize_category("dress", "midi dress") == "one_piece"
    assert LABEL_CATEGORY["dress"] == "one_piece"
    normalized, _, _ = _normalize_garment({
        "label": "dress",
        "confidence": 0.9,
        "box": {"x": 0.1, "y": 0.1, "width": 0.5, "height": 0.7},
        "segmented_image_base64": png_b64(),
        "metadata": {"category": "one_piece", "subcategory": "midi dress", "display_name": "Midi dress", "color": {"primary": "blue"}},
    })
    assert normalized["category"] == "one_piece"
