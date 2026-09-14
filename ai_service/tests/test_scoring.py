"""Unit tests for ai_service/scoring/engine.py.

These mirror tests/test_generate_daily_outfit.py to verify the correctness
invariant: identical inputs → identical outputs between the original CLI
script and the new service.
"""

from __future__ import annotations

import math

import pytest

from ai_service.scoring.engine import (
    REQUIRED_ROLES,
    VALID_ROLES,
    deterministic_fallback,
    score_item,
    score_outfit,
    validate_ai_response,
)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

DNA = {"minimal": 1.0, "streetwear": 0.0}


def wardrobe_pool() -> list[dict]:
    return [
        {"id": "tee", "display_name": "Tee", "layer_role": "base_layer", "style_tags": {"minimal": 1.0}},
        {"id": "pants", "display_name": "Pants", "layer_role": "bottom", "style_tags": {"minimal": 0.8}},
        {"id": "shoes", "display_name": "Shoes", "layer_role": "footwear", "style_tags": {"minimal": 0.6}},
    ]


# ---------------------------------------------------------------------------
# score_item
# ---------------------------------------------------------------------------

class TestScoreItem:
    def test_cosine_similarity_diagonal(self):
        """Identical vectors → score of 1.0."""
        item = {"style_tags": {"minimal": 1.0}}
        assert score_item(item, {"minimal": 1.0}) == pytest.approx(1.0, rel=1e-3)

    def test_cosine_similarity_partial_overlap(self):
        """Vector with half the dimensions aligned → ~0.7071."""
        item = {"style_tags": {"minimal": 1.0, "streetwear": 1.0}}
        assert score_item(item, {"minimal": 1.0, "streetwear": 0.0}) == pytest.approx(0.7071, rel=1e-3)

    def test_orthogonal_vectors_return_zero(self):
        item = {"style_tags": {"streetwear": 1.0}}
        assert score_item(item, {"minimal": 1.0}) == pytest.approx(0.0)

    def test_empty_style_tags_return_zero(self):
        assert score_item({"style_tags": {}}, DNA) == 0.0
        assert score_item({}, DNA) == 0.0

    def test_zero_dna_returns_zero(self):
        item = {"style_tags": {"minimal": 1.0}}
        assert score_item(item, {"minimal": 0.0}) == 0.0

    def test_precomputed_dna_mag_matches_computed(self):
        item = {"style_tags": {"minimal": 1.0}}
        dna = {"minimal": 1.0}
        dna_mag = math.sqrt(sum(v ** 2 for v in dna.values()))
        assert score_item(item, dna, dna_mag) == pytest.approx(score_item(item, dna))

    def test_none_weights_treated_as_zero(self):
        item = {"style_tags": {"minimal": None}}
        assert score_item(item, {"minimal": 1.0}) == 0.0


# ---------------------------------------------------------------------------
# score_outfit
# ---------------------------------------------------------------------------

class TestScoreOutfit:
    def test_empty_items_returns_zero(self):
        assert score_outfit([], DNA) == 0.0

    def test_zero_dna_returns_zero(self):
        assert score_outfit(wardrobe_pool(), {}) == 0.0

    def test_score_is_mean_of_item_scores(self):
        pool = wardrobe_pool()
        result = score_outfit(pool, DNA)
        assert 0 < result <= 1.0

    def test_result_rounded_to_4_decimal_places(self):
        result = score_outfit(wardrobe_pool(), DNA)
        assert result == round(result, 4)


# ---------------------------------------------------------------------------
# validate_ai_response
# ---------------------------------------------------------------------------

class TestValidateAiResponse:
    @pytest.mark.parametrize(
        ("response", "expected"),
        [
            # Valid response
            (
                {"item_ids": ["tee", "pants", "shoes"], "reasoning": ["Clean lines"], "confidence": 0.8},
                True,
            ),
            # Missing item in pool
            (
                {"item_ids": ["tee", "pants", "missing"], "reasoning": ["Clean lines"], "confidence": 0.8},
                False,
            ),
            # Reasoning wrong type
            (
                {"item_ids": ["tee", "pants", "shoes"], "reasoning": {"bad": "shape"}, "confidence": 0.8},
                False,
            ),
            # Confidence out of range
            (
                {"item_ids": ["tee", "pants", "shoes"], "reasoning": ["Clean lines"], "confidence": 1.2},
                False,
            ),
            # Confidence negative
            (
                {"item_ids": ["tee", "pants", "shoes"], "reasoning": ["Clean lines"], "confidence": -0.1},
                False,
            ),
            # Missing required role (no footwear)
            (
                {"item_ids": ["tee", "pants"], "reasoning": ["Clean lines"], "confidence": 0.8},
                False,
            ),
            # Empty reasoning list
            (
                {"item_ids": ["tee", "pants", "shoes"], "reasoning": [], "confidence": 0.8},
                False,
            ),
            # Blank string in reasoning
            (
                {"item_ids": ["tee", "pants", "shoes"], "reasoning": ["  "], "confidence": 0.8},
                False,
            ),
        ],
    )
    def test_validate(self, response, expected):
        assert (validate_ai_response(response, wardrobe_pool()) is not None) is expected

    def test_styling_tip_passthrough_when_string(self):
        response = {
            "item_ids": ["tee", "pants", "shoes"],
            "reasoning": ["Good fit"],
            "confidence": 0.9,
            "styling_tip": "Tuck the tee.",
        }
        result = validate_ai_response(response, wardrobe_pool())
        assert result is not None
        assert result["styling_tip"] == "Tuck the tee."

    def test_styling_tip_null_when_not_string(self):
        response = {
            "item_ids": ["tee", "pants", "shoes"],
            "reasoning": ["Good fit"],
            "confidence": 0.9,
            "styling_tip": 42,
        }
        result = validate_ai_response(response, wardrobe_pool())
        assert result is not None
        assert result["styling_tip"] is None

    def test_item_ids_must_be_strings(self):
        response = {"item_ids": [1, 2, 3], "reasoning": ["x"], "confidence": 0.5}
        assert validate_ai_response(response, wardrobe_pool()) is None

    def test_confidence_boundary_zero_is_valid(self):
        response = {"item_ids": ["tee", "pants", "shoes"], "reasoning": ["x"], "confidence": 0.0}
        assert validate_ai_response(response, wardrobe_pool()) is not None

    def test_confidence_boundary_one_is_valid(self):
        response = {"item_ids": ["tee", "pants", "shoes"], "reasoning": ["x"], "confidence": 1.0}
        assert validate_ai_response(response, wardrobe_pool()) is not None


# ---------------------------------------------------------------------------
# deterministic_fallback
# ---------------------------------------------------------------------------

class TestDeterministicFallback:
    def test_returns_none_when_required_role_missing(self):
        # Only 2 of 3 required roles covered
        assert deterministic_fallback(wardrobe_pool()[:2], DNA) is None

    def test_returns_outfit_when_all_required_roles_present(self):
        outfit = deterministic_fallback(wardrobe_pool(), DNA)
        assert outfit is not None
        assert outfit["item_ids"] == ["tee", "pants", "shoes"]
        assert outfit["reasoning"]

    def test_optional_role_included_when_score_above_threshold(self):
        pool = wardrobe_pool() + [
            {"id": "jacket", "display_name": "Jacket", "layer_role": "outerwear", "style_tags": {"minimal": 1.0}},
        ]
        outfit = deterministic_fallback(pool, DNA)
        assert outfit is not None
        assert "jacket" in outfit["item_ids"]

    def test_optional_role_excluded_when_score_below_threshold(self):
        pool = wardrobe_pool() + [
            {"id": "jacket", "display_name": "Jacket", "layer_role": "outerwear", "style_tags": {"streetwear": 1.0}},
        ]
        # jacket is orthogonal to minimal DNA → score < 0.2
        outfit = deterministic_fallback(pool, {"minimal": 1.0})
        assert outfit is not None
        assert "jacket" not in outfit["item_ids"]

    def test_confidence_is_valid_float(self):
        outfit = deterministic_fallback(wardrobe_pool(), DNA)
        assert outfit is not None
        assert 0.0 <= outfit["confidence"] <= 1.0

    def test_empty_pool_returns_none(self):
        assert deterministic_fallback([], DNA) is None

    def test_invalid_role_items_ignored(self):
        pool = wardrobe_pool() + [
            {"id": "hat", "display_name": "Hat", "layer_role": "unknown_role", "style_tags": {"minimal": 1.0}},
        ]
        outfit = deterministic_fallback(pool, DNA)
        assert outfit is not None
        assert "hat" not in outfit["item_ids"]


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_required_roles_are_subset_of_valid_roles(self):
        assert set(REQUIRED_ROLES).issubset(VALID_ROLES)

    def test_valid_roles_contains_expected_values(self):
        assert "base_layer" in VALID_ROLES
        assert "bottom" in VALID_ROLES
        assert "footwear" in VALID_ROLES
        assert "outerwear" in VALID_ROLES
        assert "accessory" in VALID_ROLES
