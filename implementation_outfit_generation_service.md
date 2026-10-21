# AI Service Refactor — Standalone FastAPI Outfit Service

Extract `generate_daily_outfit.py` into a clean, modular FastAPI AI service with proper separation of concerns. The original CLI script is preserved untouched. No integration into Next.js. No production queues.

---

## Current State Analysis

[`generate_daily_outfit.py`](file:///f:/project/autofashion/generate_daily_outfit.py) is a 431-line monolith that mixes **7 distinct concerns**:

| Concern | Lines | Coupling |
| :--- | :--- | :--- |
| Environment config | L20–39 | `.env` files, `os.environ` |
| Supabase data access | L143–220 | `create_client`, table names |
| Fashion DNA scoring | L42–80 | `math`, cosine similarity |
| AI provider calls | L223–334 | `groq` SDK, model names |
| Response validation | L82–111 | Role constants, pool lookup |
| Deterministic fallback | L114–140 | Scoring + role constraints |
| Outfit persistence + CLI | L337–431 | `argparse`, `persist_outfit` |

The refactored service will separate these into distinct modules with clean boundaries.

---

## Architecture

```
ai_service/
├── main.py                  ← FastAPI app, /generate-outfit endpoint
├── config.py                ← Pydantic Settings (env vars)
├── models.py                ← Pydantic request/response schemas
├── services/
│   └── outfit_service.py    ← Orchestrator: validate → score → generate → validate response
├── providers/
│   └── groq_provider.py     ← Groq API wrapper (prompt, call, parse)
├── scoring/
│   └── engine.py            ← score_item, score_outfit, deterministic_fallback (pure functions)
└── tests/
    ├── test_scoring.py      ← Unit tests for scoring engine
    ├── test_validation.py   ← Unit tests for response validation
    └── test_outfit_service.py ← Integration tests for the service layer
```

### Data Flow

```
POST /generate-outfit
  { user_id, fashion_dna, wardrobe_items }
        │
        ▼
  FastAPI (main.py) → validates request via Pydantic
        │
        ▼
  OutfitService.generate()
        │
        ├──► ScoringEngine.score_items()     ← pure math, no I/O
        ├──► GroqProvider.generate_outfit()   ← AI call + retry
        ├──► ResponseValidator.validate()     ← structural + role checks
        │
        ├── [if AI fails] ──► ScoringEngine.deterministic_fallback()
        │
        ▼
  OutfitResponse (Pydantic)
        │
        ▼
  HTTP 200 JSON
```

> [!IMPORTANT]
> The API receives `fashion_dna` and `wardrobe_items` **in the request body**. It does NOT access Supabase. The caller (Next.js backend or the original CLI script) is responsible for fetching data from Supabase and calling this service.

---

## User Review Required

> [!IMPORTANT]
> **No changes to `generate_daily_outfit.py`** — the original script is preserved as-is. The new service is additive only.

> [!IMPORTANT]
> **No Supabase dependency in the AI service** — data fetching and persistence remain the caller's responsibility. This keeps the AI service stateless and independently testable.

---

## Open Questions

> [!IMPORTANT]
> **1. Port number**: Default `8000` for local dev. Any preference?

> [!IMPORTANT]
> **2. Groq model default**: Currently `qwen/qwen3.6-27b` in `.env.example`. The service will use `AI_PROVIDER_MODEL` env var with this default. OK?

> [!IMPORTANT]
> **3. CORS**: Should the FastAPI service allow cross-origin requests (for potential future browser-side calls), or lock it to server-to-server only?

---

## Proposed Changes

### 1. Configuration (`ai_service/config.py`)

#### [NEW] [`config.py`](file:///f:/project/autofashion/ai_service/config.py)
- Pydantic `BaseSettings` class loading from `.env` / environment
- Fields: `groq_api_key`, `groq_model`, `temperature`, `max_retries`, `backoff_seconds`
- No Supabase config — the AI service doesn't access the database

---

### 2. Data Models (`ai_service/models.py`)

#### [NEW] [`models.py`](file:///f:/project/autofashion/ai_service/models.py)
- `WardrobeItem`: Pydantic model for `{ id, display_name, image_url, layer_role, style_tags }`
- `OutfitRequest`: `{ user_id, fashion_dna: dict[str, float], wardrobe_items: list[WardrobeItem] }`
- `OutfitResponse`: `{ item_ids: list[str], reasoning: list[str], styling_tip: str | None, confidence: float, source: str }`
- `HealthResponse`: `{ status: str, version: str }`

---

### 3. Scoring Engine (`ai_service/scoring/engine.py`)

#### [NEW] [`engine.py`](file:///f:/project/autofashion/ai_service/scoring/engine.py)
- **Pure functions** extracted from `generate_daily_outfit.py` lines 42–140
- `score_item(item, dna, dna_mag)` — cosine similarity
- `score_outfit(items, dna)` — mean of item scores
- `validate_ai_response(response, item_pool)` — structural + role checks
- `deterministic_fallback(item_pool, dna)` — top-1 per required role + optional
- Constants: `REQUIRED_ROLES`, `OPTIONAL_ROLES`, `VALID_ROLES`
- **Zero I/O, zero side effects** — fully unit-testable

---

### 4. Groq Provider (`ai_service/providers/groq_provider.py`)

#### [NEW] [`groq_provider.py`](file:///f:/project/autofashion/ai_service/providers/groq_provider.py)
- `GroqProvider` class wrapping the Groq SDK
- `__init__(api_key, model, temperature)` — creates `Groq` client
- `generate_outfit(items, dna) → dict | None` — builds prompt, calls API, parses JSON response
- Retry logic (configurable attempts + backoff)
- JSON parse fallback (same as original lines 259–292)
- Extracts prompt construction into a testable method

---

### 5. Outfit Service Orchestrator (`ai_service/services/outfit_service.py`)

#### [NEW] [`outfit_service.py`](file:///f:/project/autofashion/ai_service/services/outfit_service.py)
- `OutfitService(groq_provider, config)` — dependency injection
- `generate(request: OutfitRequest) → OutfitResponse`
  1. Call `GroqProvider.generate_outfit()`
  2. Validate response via `validate_ai_response()`
  3. If AI fails → `deterministic_fallback()`
  4. If both fail → raise `HTTPException(422)`
  5. Return `OutfitResponse` with `source = "daily_ai" | "daily_fallback"`

---

### 6. FastAPI Application (`ai_service/main.py`)

#### [NEW] [`main.py`](file:///f:/project/autofashion/ai_service/main.py)
- `POST /generate-outfit` → accepts `OutfitRequest`, returns `OutfitResponse`
- `GET /health` → returns `{ status: "ok", version: "0.1.0" }`
- Lifespan handler: create `GroqProvider` + `OutfitService` on startup
- Structured JSON logging for latency (`total_ms`, `ai_ms`, `scoring_ms`)
- Error handling with proper HTTP status codes

---

### 7. Tests (`ai_service/tests/`)

#### [NEW] [`test_scoring.py`](file:///f:/project/autofashion/ai_service/tests/test_scoring.py)
- Unit tests for `score_item`, `score_outfit`, `validate_ai_response`, `deterministic_fallback`
- Mirrors existing tests from [`test_generate_daily_outfit.py`](file:///f:/project/autofashion/tests/test_generate_daily_outfit.py)

#### [NEW] [`test_validation.py`](file:///f:/project/autofashion/ai_service/tests/test_validation.py)
- Edge cases for request validation (empty wardrobe, missing required roles, invalid DNA)

#### [NEW] [`test_outfit_service.py`](file:///f:/project/autofashion/ai_service/tests/test_outfit_service.py)
- Service-level tests with mocked `GroqProvider`
- Tests AI success path, AI failure → fallback path, both-fail → 422 path

---

### 8. Project Files

#### [NEW] [`ai_service/requirements.txt`](file:///f:/project/autofashion/ai_service/requirements.txt)
- `fastapi>=0.115.0`, `uvicorn[standard]>=0.30.0`, `groq>=0.9.0`, `pydantic-settings>=2.0.0`, `pytest>=8.0.0`, `httpx>=0.27.0` (for `TestClient`)

#### [NEW] [`ai_service/__init__.py`](file:///f:/project/autofashion/ai_service/__init__.py)
- Empty package marker

#### [NEW] [`ai_service/services/__init__.py`](file:///f:/project/autofashion/ai_service/services/__init__.py), [`ai_service/providers/__init__.py`](file:///f:/project/autofashion/ai_service/providers/__init__.py), [`ai_service/scoring/__init__.py`](file:///f:/project/autofashion/ai_service/scoring/__init__.py), [`ai_service/tests/__init__.py`](file:///f:/project/autofashion/ai_service/tests/__init__.py)
- Empty package markers

---

## Verification Plan

### Automated Tests
```bash
# Install dependencies
pip install -r ai_service/requirements.txt

# Run all AI service tests
python -m pytest ai_service/tests/ -v

# Verify original tests still pass
python -m pytest tests/test_generate_daily_outfit.py -v
```

### Manual Verification
1. **Start the service**: `uvicorn ai_service.main:app --reload --port 8000`
2. **Health check**: `curl http://localhost:8000/health`
3. **Generate outfit**: POST to `/generate-outfit` with sample `user_id`, `fashion_dna`, and `wardrobe_items`
4. **Verify original script untouched**: `python generate_daily_outfit.py --help` still works

### Correctness Invariant
- Given identical `fashion_dna` + `wardrobe_items` + mocked Groq response → the FastAPI service and the original `generate_daily_outfit.py` must produce **identical** `item_ids`, `reasoning`, `confidence`, and `source`.
