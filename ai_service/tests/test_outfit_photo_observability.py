"""Observe the real Gemini/worker path using mocked I/O and a monotonic clock."""

import base64
import json
import logging
from types import SimpleNamespace

import httpx
import pytest

from ai_service.outfit_photo_observability import (
    OutfitPhotoObservation, current_observation, log_event,
)
from ai_service.providers.outfit import gemini_provider as gemini
from ai_service.tests.test_gemini_outfit_provider import FakeDb, FakeGeminiClient, USER_ID
from ai_service.worker import process_one


PRIVATE_ERROR = "private-exception Gemini-key secret-service-key Authorization: Bearer private-token https://private.test/sign/source?token=private-token"


class Clock:
    def __init__(self):
        self.now = 100.0

    def advance(self, seconds):
        self.now += seconds

    def monotonic(self):
        return self.now


class ObservedDb(FakeDb):
    def __init__(self, clock, failure=None, job_id="job-observed"):
        super().__init__(fail_on_upload=2 if failure == "storage_upload" else None)
        self.clock = clock
        self.failure = failure
        self.calls = []
        self.job = {"id": job_id, "job_type": "outfit_photo", "user_id": USER_ID,
                    "source_photo_id": "photo-1", "total_attempts": 2}

    def private_image(self, bucket, path):
        self.clock.advance(0.012)
        if self.failure == "source_fetch":
            raise httpx.ReadTimeout(PRIVATE_ERROR)
        return super().private_image(bucket, path)

    def upload_private_png(self, user_id, path, data):
        self.clock.advance(0.007)
        super().upload_private_png(user_id, path, data)

    def rpc(self, name, payload):
        self.calls.append((name, payload))
        if name == "claim_ai_jobs":
            return [self.job]
        self.clock.advance(0.020)
        if self.failure == "completion_rpc":
            raise httpx.ReadTimeout(PRIVATE_ERROR)
        if self.failure == "unexpected_completion":
            raise RuntimeError(PRIVATE_ERROR)
        return None


class ObservedClient(FakeGeminiClient):
    def __init__(self, clock, *responses):
        super().__init__(*responses)
        self.clock = clock

    def create(self, **kwargs):
        self.clock.advance(0.120)
        return super().create(**kwargs)


@pytest.fixture
def observed_pipeline(monkeypatch, caplog):
    clock = Clock()
    monkeypatch.setattr(gemini.time, "monotonic", clock.monotonic)
    monkeypatch.setattr(gemini.time, "sleep", clock.advance)
    monkeypatch.setattr(gemini.random, "uniform", lambda *_: 0)
    caplog.set_level(logging.INFO)
    settings = SimpleNamespace(gemini_api_key="Gemini-key", gemini_outfit_model="test-model",
                               outfit_max_garments=8)
    boxes = [{"category": category, "subcategory": category, "display_name": "Private name",
              "color_primary": "navy", "confidence": confidence, "fit": "regular",
              "pattern": "solid", "style_tags": ["casual"], "formality_score": 0.6,
              "box_2d": [100, 200, 700, 800],
              "mask": [[200, 100], [800, 100], [200, 700]]}
             for category, confidence in (("top", 0.94), ("bottom", 0.91), ("accessory", 0.84))]
    output = json.dumps({"boxes": boxes})
    original_render = gemini.render_segmented_garment
    original_normalize = gemini.GeminiOutfitProvider._normalize

    def render(*args):
        clock.advance(0.004)
        return original_render(*args)

    def normalize(self, garment):
        clock.advance(0.002)
        return original_normalize(self, garment)

    monkeypatch.setattr(gemini, "render_segmented_garment", render)
    monkeypatch.setattr(gemini.GeminiOutfitProvider, "_normalize", normalize)
    return clock, settings, output


def run_worker(db, provider, settings):
    return process_one(db, "worker-observed", object(), object(), "vision-model",
                       settings=settings, outfit_provider=provider)


def events(caplog):
    return [record for record in caplog.records if hasattr(record, "event")]


def assert_private_data_absent(caplog, db, output):
    forbidden = [USER_ID, f"{USER_ID}/source.png", PRIVATE_ERROR, "Gemini-key",
                 "secret-service-key", "private-token", "Private name", output,
                 base64.b64encode(db.image_bytes).decode(), gemini.PROMPT]
    forbidden.extend(path for _, path, _ in db.uploads)
    for value in forbidden:
        assert value not in caplog.text
    assert all(record.exc_info is None and record.stack_info is None for record in events(caplog))


def test_success_events_correlate_all_stages_and_measure_aggregate_timings(observed_pipeline, caplog):
    clock, settings, output = observed_pipeline
    db = ObservedDb(clock)
    client = ObservedClient(clock, output)
    provider = gemini.GeminiOutfitProvider(settings, client=client)
    assert run_worker(db, provider, settings) is True
    records = events(caplog)
    assert [r.event for r in records] == [
        "job_claimed", "source_fetch_started", "source_fetch_completed",
        "provider_request_started", "provider_request_completed",
        "garment_processing_completed", "storage_upload_completed",
        "completion_rpc_started", "completion_rpc_completed", "job_completed",
    ]
    assert {r.job_id for r in records} == {db.job["id"]}
    by_event = {r.event: r for r in records}
    claimed = by_event["job_claimed"]
    assert (claimed.job_type, claimed.attempt, claimed.provider, claimed.model) == (
        "outfit_photo", 2, "google-gemini", "test-model")
    source = by_event["source_fetch_completed"]
    assert (source.duration_ms, source.byte_size, source.mime_type) == (12, len(db.image_bytes), "image/png")
    requested = by_event["provider_request_started"]
    assert (requested.attempt, requested.model) == (1, "test-model")
    response = by_event["provider_request_completed"]
    assert (response.duration_ms, response.garment_count, response.model) == (120, 3, "test-model")
    processing = by_event["garment_processing_completed"]
    assert (processing.garment_count, processing.duration_ms) == (2, 14)
    upload = by_event["storage_upload_completed"]
    assert (upload.garment_count, upload.duration_ms) == (2, 14)
    assert upload.total_bytes == sum(len(data) for _, _, data in db.uploads)
    assert by_event["completion_rpc_started"].rpc == "complete_outfit_photo_job"
    assert by_event["completion_rpc_completed"].duration_ms == 20
    completed = by_event["job_completed"]
    assert (completed.status, completed.total_latency_ms, completed.provider_latency_ms,
            completed.persistence_latency_ms, completed.garment_count) == ("succeeded", 180, 120, 34, 2)
    # Persistent latency still excludes the completion RPC; payloads contain no new fields.
    assert [name for name, _ in db.calls] == ["claim_ai_jobs", "complete_outfit_photo_job"]
    assert db.calls[-1][1]["p_latency_ms"] == 160
    assert set(db.calls[-1][1]) == {"p_job_id", "p_worker_id", "p_attempt", "p_provider", "p_model",
        "p_prompt_version", "p_schema_version", "p_latency_ms", "p_usage", "p_garments"}
    assert len(db.calls[-1][1]["p_garments"]) == 2
    assert current_observation.get() is None
    assert_private_data_absent(caplog, db, output)


@pytest.mark.parametrize("message,category", [
    ("503", "503"), ("high demand", "503"), ("429 rate limit", "429"), ("timeout", "timeout"),
])
def test_retry_logs_safe_categories_without_changing_attempts_or_delay(
    observed_pipeline, caplog, message, category,
):
    clock, settings, output = observed_pipeline
    db = ObservedDb(clock)
    client = ObservedClient(clock, RuntimeError(message + " " + PRIVATE_ERROR), output)
    provider = gemini.GeminiOutfitProvider(settings, client=client)
    assert run_worker(db, provider, settings) is True
    records = events(caplog)
    requests = [r for r in records if r.event == "provider_request_started"]
    retries = [r for r in records if r.event == "provider_request_retry"]
    assert [r.attempt for r in requests] == [1, 2]
    assert len(retries) == 1
    assert (retries[0].attempt, retries[0].failure_category, retries[0].retry_delay_ms) == (1, category, 2000)
    assert len(client.calls) == 2 and client.calls[0] == client.calls[1]
    completed = next(r for r in records if r.event == "job_completed")
    assert completed.provider_latency_ms == 2240
    assert completed.total_latency_ms == 2300
    assert {r.job_id for r in records} == {db.job["id"]}
    assert_private_data_absent(caplog, db, output)


@pytest.mark.parametrize("failure,stage,code", [
    ("source_fetch", "source_fetch", "PROVIDER_TIMEOUT"),
    ("provider_request", "provider_request", "PROVIDER_UNAVAILABLE"),
    ("invalid_output", "provider_request", "PROVIDER_INVALID"),
    ("garment_processing", "garment_processing", "PROVIDER_INVALID"),
    ("storage_upload", "storage_upload", "PROVIDER_UNAVAILABLE"),
    ("completion_rpc", "completion_rpc", "PERSISTENCE_FAILED"),
])
def test_failures_report_stage_and_preserve_existing_outcomes_and_cleanup(
    observed_pipeline, caplog, monkeypatch, failure, stage, code,
):
    clock, settings, output = observed_pipeline
    db = ObservedDb(clock, failure=failure)
    response = RuntimeError(PRIVATE_ERROR) if failure == "provider_request" else output
    if failure == "invalid_output":
        response = PRIVATE_ERROR
    if failure == "garment_processing":
        def fail_render(*args):
            raise ValueError(PRIVATE_ERROR)
        monkeypatch.setattr(gemini, "render_segmented_garment", fail_render)
    provider = gemini.GeminiOutfitProvider(settings, client=ObservedClient(clock, response))
    assert run_worker(db, provider, settings) is True
    records = events(caplog)
    failed = [r for r in records if r.event == "job_failed"]
    assert len(failed) == 1
    assert (failed[0].job_id, failed[0].safe_error_code, failed[0].stage) == (db.job["id"], code, stage)
    assert failed[0].total_latency_ms >= 0
    assert not any(r.event == "job_completed" for r in records)
    if failure == "completion_rpc":
        assert db.calls[-1][0] == "complete_outfit_photo_job"
        assert not any(r.event == "completion_rpc_completed" for r in records)
    else:
        assert db.calls[-1][0] == "complete_ai_job"
        assert db.calls[-1][1]["p_safe_error_code"] == code
        expected = "permanent_error" if code == "PROVIDER_INVALID" else "retryable_error"
        assert db.calls[-1][1]["p_outcome"] == expected
    if failure == "storage_upload":
        assert db.upload_attempts == 2 and len(db.uploads) == 1
        assert db.deletes == [(USER_ID, db.uploads[0][1])]
    assert current_observation.get() is None
    assert_private_data_absent(caplog, db, output)


def test_exhausted_retries_keep_four_attempts_and_existing_safe_error(observed_pipeline, caplog):
    clock, settings, output = observed_pipeline
    db = ObservedDb(clock)
    client = ObservedClient(clock, *(RuntimeError("503 " + PRIVATE_ERROR) for _ in range(4)))
    provider = gemini.GeminiOutfitProvider(settings, client=client)
    assert run_worker(db, provider, settings) is True
    assert len(client.calls) == 4
    retries = [r for r in events(caplog) if r.event == "provider_request_retry"]
    assert [(r.attempt, r.retry_delay_ms) for r in retries] == [(1, 2000), (2, 4000), (3, 8000)]
    assert db.calls[-1][1]["p_safe_error_code"] == "PROVIDER_UNAVAILABLE"
    failed = next(r for r in events(caplog) if r.event == "job_failed")
    assert (failed.stage, failed.total_latency_ms) == ("provider_request", 14492)
    assert_private_data_absent(caplog, db, output)


def test_unexpected_completion_exception_still_propagates_with_safe_failure_log(observed_pipeline, caplog):
    clock, settings, output = observed_pipeline
    db = ObservedDb(clock, failure="unexpected_completion")
    provider = gemini.GeminiOutfitProvider(settings, client=ObservedClient(clock, output))
    with pytest.raises(RuntimeError, match="private-exception"):
        run_worker(db, provider, settings)
    failed = next(r for r in events(caplog) if r.event == "job_failed")
    assert (failed.safe_error_code, failed.stage) == ("PERSISTENCE_FAILED", "completion_rpc")
    assert not any(r.event == "job_completed" for r in events(caplog))
    assert_private_data_absent(caplog, db, output)


def test_direct_provider_calls_are_correlated_and_do_not_leak_between_jobs(observed_pipeline, caplog):
    clock, settings, output = observed_pipeline
    provider = gemini.GeminiOutfitProvider(settings, client=ObservedClient(clock, output, output))
    for job_id in ("job-first", "job-second"):
        caplog.clear()
        db = ObservedDb(clock, job_id=job_id)
        assert len(provider.extract(db, db.job)) == 2
        assert {r.job_id for r in events(caplog)} == {job_id}
        assert next(r for r in events(caplog) if r.event == "storage_upload_completed").duration_ms == 14
        assert current_observation.get() is None


def test_log_allowlist_drops_private_fields(caplog):
    caplog.set_level(logging.INFO)
    log_event(logging.getLogger("ai_service.outfit_photo_observability"), "job_claimed",
              OutfitPhotoObservation("job-safe"), model="test-model", api_key=PRIVATE_ERROR,
              authorization=PRIVATE_ERROR, user_id=USER_ID, object_path=f"{USER_ID}/source.png",
              signed_url=PRIVATE_ERROR, raw_response=PRIVATE_ERROR, image_base64=PRIVATE_ERROR)
    record = events(caplog)[0]
    assert record.job_id == "job-safe" and record.model == "test-model"
    assert PRIVATE_ERROR not in caplog.text and USER_ID not in caplog.text
    assert not hasattr(record, "api_key") and not hasattr(record, "object_path")
