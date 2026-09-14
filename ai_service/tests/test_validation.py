"""Edge-case tests for the OutfitRequest Pydantic model validation.

These tests ensure that the API layer rejects malformed payloads before they
reach the service layer.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_service.models import OutfitRequest, WardrobeItem


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _valid_item(**overrides) -> dict:
    base = {
        "id": "tee",
        "display_name": "Tee",
        "layer_role": "base_layer",
        "style_tags": {"minimal": 1.0},
    }
    base.update(overrides)
    return base


def _valid_request(**overrides) -> dict:
    base = {
        "user_id": "user-123",
        "fashion_dna": {"minimal": 1.0},
        "wardrobe_items": [
            _valid_item(id="tee", layer_role="base_layer"),
            _valid_item(id="pants", layer_role="bottom"),
            _valid_item(id="shoes", layer_role="footwear"),
        ],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# WardrobeItem validation
# ---------------------------------------------------------------------------

class TestWardrobeItem:
    def test_valid_item_parses(self):
        item = WardrobeItem(**_valid_item())
        assert item.id == "tee"
        assert item.layer_role == "base_layer"

    def test_image_url_is_optional(self):
        item = WardrobeItem(**_valid_item())
        assert item.image_url is None

    def test_style_tags_defaults_to_empty_dict(self):
        data = _valid_item()
        del data["style_tags"]
        item = WardrobeItem(**data)
        assert item.style_tags == {}

    def test_missing_required_field_raises(self):
        data = _valid_item()
        del data["layer_role"]
        with pytest.raises(ValidationError):
            WardrobeItem(**data)

    def test_as_dict_returns_plain_dict(self):
        item = WardrobeItem(**_valid_item())
        d = item.as_dict()
        assert isinstance(d, dict)
        assert d["id"] == "tee"
        assert d["style_tags"] == {"minimal": 1.0}


# ---------------------------------------------------------------------------
# OutfitRequest validation
# ---------------------------------------------------------------------------

class TestOutfitRequest:
    def test_valid_request_parses(self):
        req = OutfitRequest(**_valid_request())
        assert req.user_id == "user-123"
        assert len(req.wardrobe_items) == 3

    def test_empty_wardrobe_raises(self):
        with pytest.raises(ValidationError):
            OutfitRequest(**_valid_request(wardrobe_items=[]))

    def test_missing_user_id_raises(self):
        data = _valid_request()
        del data["user_id"]
        with pytest.raises(ValidationError):
            OutfitRequest(**data)

    def test_fashion_dna_defaults_to_empty_dict(self):
        data = _valid_request()
        del data["fashion_dna"]
        req = OutfitRequest(**data)
        assert req.fashion_dna == {}

    def test_wardrobe_items_are_wardrobe_item_instances(self):
        req = OutfitRequest(**_valid_request())
        assert all(isinstance(item, WardrobeItem) for item in req.wardrobe_items)

    def test_as_dict_from_item_within_request(self):
        req = OutfitRequest(**_valid_request())
        d = req.wardrobe_items[0].as_dict()
        assert d["layer_role"] == "base_layer"

    def test_single_item_wardrobe_is_valid(self):
        """A single-item wardrobe should pass model validation (missing roles caught by service layer)."""
        req = OutfitRequest(**_valid_request(wardrobe_items=[_valid_item()]))
        assert len(req.wardrobe_items) == 1
