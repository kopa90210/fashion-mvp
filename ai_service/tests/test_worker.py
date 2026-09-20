"""Unit checks for the Gate 5 CLI worker; database locking needs disposable Postgres."""

from types import SimpleNamespace

import httpx

import pytest

from ai_service.worker import InvalidJobInput, _extract_garment, classify_failure, process_one, safe_usage


class FakeDb:
    def __init__(self, job=None):
        self.job = job
        self.calls = []

    def rpc(self, name, payload):
        self.calls.append((name, payload))
        if name == "claim_ai_jobs":
            return [self.job] if self.job else []
        return None

    def rows(self, table, params):
        if table == "fashion_dna":
            return [{"vector": {"minimal": 0.8}}]
        if table == "user_wardrobe_items":
            return [{"wardrobe_items": {"id": item_id, "display_name": item_id,
                    "layer_role": role, "style_tags": {"minimal": 0.8}, "status": "confirmed"}}
                    for item_id, role in (("tee", "base_layer"), ("pants", "bottom"),
                                          ("shoes", "footwear"))]
        raise AssertionError(f"Unexpected table {table}")


def test_worker_does_not_call_provider_without_a_claim():
    db = FakeDb()
    service = SimpleNamespace(_groq=SimpleNamespace(model="test-model"))
    assert process_one(db, "worker-a", service, object(), "vision-model") is False
    assert [name for name, _ in db.calls] == ["claim_ai_jobs"]


def test_daily_fallback_keeps_source_and_provenance():
    job = {"id": "job-1", "user_id": "user-1", "job_type": "daily_outfit",
           "total_attempts": 2}
    db = FakeDb(job)

    def generate(request):
        assert {item.id for item in request.wardrobe_items} == {"tee", "pants", "shoes"}
        return SimpleNamespace(model_dump=lambda: {
            "item_ids": ["tee", "pants", "shoes"], "reasoning": ["Works together"],
            "styling_tip": None, "confidence": 0.8, "source": "daily_fallback",
        })

    service = SimpleNamespace(_groq=SimpleNamespace(model="test-model"), generate=generate)
    assert process_one(db, "worker-a", service, object(), "vision-model") is True
    name, completion = db.calls[-1]
    assert name == "complete_ai_job"
    assert completion["p_result"]["source"] == "daily_fallback"
    assert completion["p_outcome"] == "succeeded"
    assert completion["p_attempt"] == 2
    assert completion["p_model"] == "test-model"
    assert completion["p_prompt_version"] and completion["p_schema_version"]


def test_bad_input_is_permanent_and_timeout_is_retryable():
    assert classify_failure(InvalidJobInput()) == ("permanent_error", "INVALID_INPUT", "invalid")
    assert classify_failure(httpx.ReadTimeout("timeout")) == (
        "retryable_error", "PROVIDER_TIMEOUT", "not_run")


def test_usage_keeps_only_nonnegative_token_counts():
    response = SimpleNamespace(usage=SimpleNamespace(
        prompt_tokens=12, completion_tokens=True, total_tokens=-1, secret="do-not-store"))
    assert safe_usage(response) == {"prompt_tokens": 12}


def test_extraction_never_fetches_another_users_private_path():
    class CrossOwnerDb:
        def rows(self, table, params):
            if table == "wardrobe_items":
                return [{"id": "item-1", "status": "draft", "media_asset_id": "asset-1"}]
            return [{"bucket_id": "private-wardrobe-media", "object_path": "other-user/image.jpg",
                     "status": "active"}]

        def private_image(self, bucket, path):
            raise AssertionError("Cross-user object was fetched")

    with pytest.raises(InvalidJobInput):
        _extract_garment(CrossOwnerDb(), {"wardrobe_item_id": "item-1", "user_id": "owner"},
                         object(), "vision-model")


def test_invalid_daily_job_records_safe_code_without_raw_error(caplog):
    job = {"id": "job-1", "user_id": "user-1", "job_type": "daily_outfit",
           "total_attempts": 1}
    db = FakeDb(job)
    db.rows = lambda table, params: []
    service = SimpleNamespace(_groq=SimpleNamespace(model="test-model"))
    assert process_one(db, "worker-a", service, object(), "vision-model") is True
    completion = db.calls[-1][1]
    assert completion["p_outcome"] == "permanent_error"
    assert completion["p_safe_error_code"] == "INVALID_INPUT"
    assert completion["p_result"] is None
    assert "Fashion DNA missing" not in caplog.text


def test_outfit_photo_uses_atomic_multi_garment_completion(monkeypatch):
    job = {"id": "job-1", "user_id": "user-1", "job_type": "outfit_photo",
           "source_photo_id": "photo-1", "total_attempts": 1}
    db = FakeDb(job)
    monkeypatch.setattr("ai_service.worker.extract_outfit_photo",
        lambda *args: [{"category": "bottom", "original": {"object_path": "user-1/crop.png"}}])
    service = SimpleNamespace(_groq=SimpleNamespace(model="daily-model"))
    assert process_one(db, "worker-a", service, object(), "vision-model",
        "https://example.ngrok.app", "test-internal-token-long-enough") is True
    assert [name for name, _ in db.calls] == ["claim_ai_jobs", "complete_outfit_photo_job"]
    assert db.calls[-1][1]["p_garments"][0]["category"] == "bottom"
