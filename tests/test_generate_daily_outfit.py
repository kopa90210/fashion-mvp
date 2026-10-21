import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

import generate_daily_outfit as daily


DNA = {"minimal": 1.0, "streetwear": 0.0}


def wardrobe_pool():
    return [
        {"id": "tee", "display_name": "Tee", "layer_role": "base_layer", "style_tags": {"minimal": 1.0}},
        {"id": "pants", "display_name": "Pants", "layer_role": "bottom", "style_tags": {"minimal": 0.8}},
        {"id": "shoes", "display_name": "Shoes", "layer_role": "footwear", "style_tags": {"minimal": 0.6}},
    ]


class FakeResponse:
    def __init__(self, data=None):
        self.data = data


class FakeQuery:
    def __init__(self, response):
        self.response = response
        self.insert_payloads = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def single(self):
        return self

    def insert(self, payload):
        self.insert_payloads.append(payload)
        return self

    def execute(self):
        return self.response


class FakeSupabase:
    def __init__(self, responses):
        self.responses = responses
        self.queries = []

    def table(self, name):
        query = FakeQuery(FakeResponse(self.responses.get(name)))
        self.queries.append((name, query))
        return query


def groq_with_content(content):
    message = SimpleNamespace(content=content)
    choice = SimpleNamespace(message=message)
    create = Mock(return_value=SimpleNamespace(choices=[choice]))
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


def test_score_item_uses_cosine_similarity():
    item = {"style_tags": {"minimal": 1.0, "streetwear": 1.0}}
    assert daily.score_item(item, {"minimal": 1.0, "streetwear": 0.0}) == pytest.approx(0.7071, rel=1e-3)


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        ({"item_ids": ["tee", "pants", "shoes"], "reasoning": ["Clean lines"], "confidence": 0.8}, True),
        ({"item_ids": ["tee", "pants", "missing"], "reasoning": ["Clean lines"], "confidence": 0.8}, False),
        ({"item_ids": ["tee", "pants", "shoes"], "reasoning": {"bad": "shape"}, "confidence": 0.8}, False),
        ({"item_ids": ["tee", "pants", "shoes"], "reasoning": ["Clean lines"], "confidence": 1.2}, False),
    ],
)
def test_validate_ai_response(response, expected):
    assert (daily.validate_ai_response(response, wardrobe_pool()) is not None) is expected


def test_deterministic_fallback_requires_all_required_categories():
    assert daily.deterministic_fallback(wardrobe_pool()[:2], DNA) is None

    outfit = daily.deterministic_fallback(wardrobe_pool(), DNA)
    assert outfit is not None
    assert outfit["item_ids"] == ["tee", "pants", "shoes"]
    assert outfit["reasoning"]


def test_has_outfit_today_true_and_false():
    assert daily.has_outfit_today(FakeSupabase({"outfits": [{"id": "outfit"}]}), "user") is True
    assert daily.has_outfit_today(FakeSupabase({"outfits": []}), "user") is False


def test_dry_run_never_persists(monkeypatch):
    supabase = FakeSupabase(
        {
            "outfits": [],
            "fashion_dna": {"vector": DNA},
            "user_wardrobe_items": [{"wardrobe_items": item} for item in wardrobe_pool()],
        }
    )
    persist = Mock()
    monkeypatch.setattr(daily, "persist_outfit", persist)

    result = daily.generate_for_user(supabase, groq_with_content(json.dumps({"item_ids": ["tee", "pants", "shoes"], "reasoning": ["Good"], "confidence": 0.9})), "user", dry_run=True)

    assert result["source"] == "daily_ai"
    persist.assert_not_called()


def test_groq_timeout_falls_back_to_daily_fallback(monkeypatch):
    supabase = FakeSupabase(
        {
            "outfits": [],
            "fashion_dna": {"vector": DNA},
            "user_wardrobe_items": [{"wardrobe_items": item} for item in wardrobe_pool()],
        }
    )
    persist = Mock()
    monkeypatch.setattr(daily, "persist_outfit", persist)
    monkeypatch.setattr(daily.time, "sleep", Mock())
    groq = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=Mock(side_effect=[TimeoutError("slow"), RuntimeError("500")]))
        )
    )

    result = daily.generate_for_user(supabase, groq, "user", dry_run=True)

    assert result["source"] == "daily_fallback"
    persist.assert_not_called()


def test_all_users_exits_zero_with_per_user_failure(monkeypatch, capsys):
    monkeypatch.setenv("GROQ_API_KEY", "g")
    monkeypatch.setenv("SUPABASE_URL", "s")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "k")
    monkeypatch.setattr(daily, "create_client", Mock(return_value=object()))
    monkeypatch.setattr(daily, "Groq", Mock(return_value=object()))
    monkeypatch.setattr(daily, "verify_database", Mock())
    monkeypatch.setattr(daily, "fetch_user_ids", Mock(return_value=["ok", "bad"]))
    monkeypatch.setattr(daily, "generate_for_user", Mock(side_effect=[{}, RuntimeError("boom")]))
    monkeypatch.setattr(daily.time, "sleep", Mock())

    assert daily.main(["--all-users", "--user-delay", "0", "--dry-run"]) == 0
    assert "failed=1" in capsys.readouterr().out


def test_missing_env_exits_nonzero(monkeypatch):
    monkeypatch.setattr(daily, "load_environment", Mock())
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)

    assert daily.main(["--user-id", "user", "--dry-run"]) != 0
