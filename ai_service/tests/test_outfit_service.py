"""Service-level integration tests for OutfitService.

All Groq API calls are mocked so these tests run without network access
or a real API key.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from ai_service.models import OutfitRequest, WardrobeItem
from ai_service.providers.groq_provider import GroqProvider
from ai_service.services.outfit_service import OutfitService


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

DNA = {"minimal": 1.0, "streetwear": 0.0}


def _wardrobe_items() -> list[WardrobeItem]:
    return [
        WardrobeItem(id="tee", display_name="Tee", layer_role="base_layer", style_tags={"minimal": 1.0}),
        WardrobeItem(id="pants", display_name="Pants", layer_role="bottom", style_tags={"minimal": 0.8}),
        WardrobeItem(id="shoes", display_name="Shoes", layer_role="footwear", style_tags={"minimal": 0.6}),
    ]


def _build_request(**overrides) -> OutfitRequest:
    base = {
        "user_id": "user-123",
        "fashion_dna": DNA,
        "wardrobe_items": _wardrobe_items(),
    }
    base.update(overrides)
    return OutfitRequest(**base)


def _mock_provider(outfit: dict | None) -> GroqProvider:
    """Create a GroqProvider whose generate_outfit always returns *outfit*."""
    provider = MagicMock(spec=GroqProvider)
    provider.generate_outfit.return_value = outfit
    return provider


_AI_OUTFIT = {
    "item_ids": ["tee", "pants", "shoes"],
    "reasoning": ["Clean minimal look"],
    "styling_tip": "Tuck the tee.",
    "confidence": 0.92,
}


# ---------------------------------------------------------------------------
# OutfitService unit tests
# ---------------------------------------------------------------------------

class TestOutfitService:
    def test_ai_success_path(self):
        """AI returns a valid outfit → source='daily_ai'."""
        service = OutfitService(_mock_provider(_AI_OUTFIT))
        response = service.generate(_build_request())
        assert response.source == "daily_ai"
        assert response.item_ids == ["tee", "pants", "shoes"]
        assert response.confidence == pytest.approx(0.92)
        assert response.styling_tip == "Tuck the tee."

    def test_ai_failure_falls_back_to_deterministic(self):
        """AI returns None → deterministic fallback produces 'daily_fallback'."""
        service = OutfitService(_mock_provider(None))
        response = service.generate(_build_request())
        assert response.source == "daily_fallback"
        assert set(response.item_ids) == {"tee", "pants", "shoes"}
        assert response.confidence >= 0.0

    def test_both_fail_raises_422(self):
        """AI fails + wardrobe missing required role → HTTPException 422."""
        # Provide only base_layer items → deterministic fallback will return None
        items = [
            WardrobeItem(id="tee1", display_name="Tee1", layer_role="base_layer", style_tags={"minimal": 1.0}),
            WardrobeItem(id="tee2", display_name="Tee2", layer_role="base_layer", style_tags={"minimal": 0.8}),
        ]
        service = OutfitService(_mock_provider(None))
        with pytest.raises(HTTPException) as exc_info:
            service.generate(_build_request(wardrobe_items=items))
        assert exc_info.value.status_code == 422

    def test_ai_called_with_correct_item_pool(self):
        """generate_outfit is called with plain dicts, not WardrobeItem instances."""
        provider = _mock_provider(_AI_OUTFIT)
        service = OutfitService(provider)
        service.generate(_build_request())

        call_args = provider.generate_outfit.call_args
        items_arg = call_args[0][0]
        assert all(isinstance(item, dict) for item in items_arg)

    def test_response_contains_all_required_fields(self):
        service = OutfitService(_mock_provider(_AI_OUTFIT))
        response = service.generate(_build_request())
        # All OutfitResponse fields should be present
        assert hasattr(response, "item_ids")
        assert hasattr(response, "reasoning")
        assert hasattr(response, "confidence")
        assert hasattr(response, "source")

    def test_fallback_reasoning_is_nonempty_list(self):
        service = OutfitService(_mock_provider(None))
        response = service.generate(_build_request())
        assert isinstance(response.reasoning, list)
        assert len(response.reasoning) > 0

    def test_ai_called_once_on_success(self):
        provider = _mock_provider(_AI_OUTFIT)
        service = OutfitService(provider)
        service.generate(_build_request())
        provider.generate_outfit.assert_called_once()

    def test_empty_dna_uses_fallback(self):
        """With all-zero DNA the AI mock returns None; fallback should still attempt."""
        service = OutfitService(_mock_provider(None))
        # score_item returns 0 for all items → fallback picks first of each role
        response = service.generate(_build_request(fashion_dna={}))
        # Should still produce a result (confidence may be 0.0)
        assert response.source == "daily_fallback"


# ---------------------------------------------------------------------------
# HTTP integration tests via TestClient
# ---------------------------------------------------------------------------

@pytest.fixture()
def client_with_ai_success():
    """Return a TestClient with OutfitService wired to always succeed via AI."""
    from ai_service.main import app, _state

    mock_service = MagicMock(spec=OutfitService)
    from ai_service.models import OutfitResponse

    mock_service.generate.return_value = OutfitResponse(
        item_ids=["tee", "pants", "shoes"],
        reasoning=["Minimal clean look"],
        styling_tip="Keep it simple.",
        confidence=0.88,
        source="daily_ai",
    )
    original = getattr(_state, "outfit_service", None)
    _state.outfit_service = mock_service
    yield TestClient(app)
    if original is not None:
        _state.outfit_service = original


class TestHttpEndpoints:
    def test_health_returns_200(self):
        from ai_service.main import app

        with TestClient(app) as client:
            resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert "version" in body

    def test_generate_outfit_success(self, client_with_ai_success):
        payload = {
            "user_id": "user-123",
            "fashion_dna": {"minimal": 1.0},
            "wardrobe_items": [
                {"id": "tee", "display_name": "Tee", "layer_role": "base_layer", "style_tags": {"minimal": 1.0}},
                {"id": "pants", "display_name": "Pants", "layer_role": "bottom", "style_tags": {"minimal": 0.8}},
                {"id": "shoes", "display_name": "Shoes", "layer_role": "footwear", "style_tags": {"minimal": 0.6}},
            ],
        }
        resp = client_with_ai_success.post("/generate-outfit", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "daily_ai"
        assert body["item_ids"] == ["tee", "pants", "shoes"]
        assert body["confidence"] == pytest.approx(0.88)

    def test_generate_outfit_empty_wardrobe_returns_422(self):
        from ai_service.main import app

        with TestClient(app) as client:
            resp = client.post(
                "/generate-outfit",
                json={
                    "user_id": "u",
                    "fashion_dna": {},
                    "wardrobe_items": [],
                },
            )
        # Pydantic min_length=1 constraint → FastAPI returns 422
        assert resp.status_code == 422

    def test_generate_outfit_missing_user_id_returns_422(self):
        from ai_service.main import app

        with TestClient(app) as client:
            resp = client.post(
                "/generate-outfit",
                json={
                    "fashion_dna": {},
                    "wardrobe_items": [
                        {"id": "t", "display_name": "T", "layer_role": "base_layer"},
                    ],
                },
            )
        assert resp.status_code == 422
