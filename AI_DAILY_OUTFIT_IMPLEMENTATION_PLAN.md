# AI Daily Outfit Generation - Product Purpose and Current Architecture

Documentation review: 2026-10-05, branch `feat/outfit-gemini-v2`.
This describes the checked repository implementation, not a deployment audit.
It supersedes this file's older scheduled-script/direct-persistence plan.

## Product purpose: cold-start style learning

StyleGraph deliberately learns useful style preferences before a user has
uploaded a large real wardrobe. The intended funnel is:

1. Complete the style quiz to initialize Fashion DNA.
2. Select curated pieces that approximate what the user would realistically
   wear or own.
3. Use those selections as a bootstrap/proxy wardrobe.
4. Generate calibration outfits from that proxy wardrobe.
5. Use reactions to refine Fashion DNA.
6. Upload and confirm the user's actual clothing.
7. Progressively base daily recommendations on confirmed owned pieces while
   retaining the preferences learned during calibration.

Curated calibration is an active product capability. The move to a durable
queue retires an old persistence mechanism, not cold-start learning, daily
outfit generation, or calibration functionality. Keep `generate_daily_outfit.py`
and the calibration flow; neither is made obsolete by real-wardrobe uploads.

## Calibration mode: curated/proxy wardrobe plus feedback

The quiz UI computes a style vector and calls `submitStyleQuiz()` in
`src/app/(app)/quiz/actions.ts`. Its `submit_style_quiz` RPC persists the quiz
results and a Fashion DNA version. `/quiz?done=true` shows
`PieceSelectionScreen.tsx`.

`getRankedPieces()` in `src/app/actions/wardrobe.ts` ranks `source='curated'`
pieces against the user's DNA. `saveWardrobeSelection()` saves selected item
IDs as user-associated entries in `user_wardrobe_items`, then the selection
screen navigates to `/outfits`.

`shouldShowOutfitCalibration()` redirects an eligible user who has not
completed calibration to `/outfits/calibration`. `getCalibrationOutfits()`
uses the deterministic `recommendOutfits()` engine and saves up to three
candidates via `create_outfit_with_items`, with outfit `source='engine'`.
It does not enqueue a daily AI job or call an AI provider.

`submitCalibrationFeedback()` calls `submit_outfit_feedback` with
`p_feedback_source='calibration'` and an idempotency key. The database records
feedback/preference events and updates/version-controls Fashion DNA. The
action can select a further diverse candidate using the updated vector.
Completing or skipping calibration sets `has_completed_calibration`.

## Personal wardrobe mode: confirmed owned pieces

| Item concept | Repository representation | Product meaning |
| --- | --- | --- |
| Selected curated piece | `wardrobe_items.source='curated'`, linked in `user_wardrobe_items` | Preference/bootstrap data; selection does not prove physical ownership. |
| Uploaded draft | `source='user_upload'`, `status='draft'` | Awaiting review/confirmation; excluded from outfit pools. |
| Confirmed uploaded piece | `source='user_upload'`, `status='confirmed'`, active user membership | Actual user-owned clothing available for personal wardrobe recommendations. |

`user_wardrobe_items` is the canonical user association/authorization relation
for both selected curated pieces and uploaded pieces. Sharing this relation
does not make the two product concepts equivalent. Likewise,
`status='confirmed'` is an eligibility state; on its own it does not mean an
item is physically owned. Interpret it together with the item's origin.

Outfit `source` describes the generator (`engine`, `daily_ai`,
`daily_fallback`), not whether the clothing is curated or uploaded.
Feedback `source` separately distinguishes `calibration` from `daily`.

## Transition: preferences persist as the item pool changes

Calibration and daily recommendation paths read the same current
`fashion_dna.vector`. Adding and confirming uploaded garments makes them
eligible without resetting that learned vector. Daily feedback continues to
refine it through the same transactional feedback RPC.

The intended transition is from a proxy wardrobe toward actual confirmed
ownership. **The current code does not implement a distinct uploaded-only
mode, a source-based switch, an upload-count threshold, or automatic retirement
of curated selections.** Both `fetchWardrobeItems()` in
`src/app/actions/outfit.ts` and `_daily_outfit()` in `ai_service/worker.py`
read active user memberships and confirmed items; neither filters that pool
to `source='user_upload'`. Curated selections therefore remain eligible
alongside confirmed uploads. These are product modes, not new persisted
runtime enums. A later transition policy must preserve calibration signals
and distinguish proxy selection from actual ownership.

## Current daily-outfit runtime: durable queue and worker

1. `getDailyOutfit()` authenticates the user and loads the current DNA,
   eligible user-associated items, and user timezone.
2. When `ENABLE_AI_DAILY_OUTFITS === 'true'`, it first looks for a generated
   `daily_ai`/`daily_fallback` outfit whose `scheduled_for` matches the user's
   local calendar date. It resolves relational `outfit_items` in position
   order, with legacy `item_ids` fallback. Unresolvable item references count
   as a miss; valid stored reasoning is returned rather than regenerated.
3. On a miss it runs `recommendOutfits()`. If no candidate is possible, it
   returns `null` before enqueueing. Otherwise, with the flag enabled, it
   calls `enqueue_daily_outfit_job`, which creates/reuses an idempotent
   `ai_jobs` record for the authenticated user and local date.
4. The request immediately saves and returns the deterministic candidate
   through `create_outfit_with_items`, with `source='engine'`. Successful
   enqueueing adds job linkage and `fallback_reason='ai_queued'` to the
   context snapshot. Enqueue failure still allows the engine result.
5. A separately running `python -m ai_service.worker` claims queued work via
   `claim_ai_jobs`. For `job_type='daily_outfit'`, `_daily_outfit()` reloads
   the current DNA and eligible pool and invokes `OutfitService`/`GroqProvider`.
   It calls the service implementation inside the worker process, not the
   FastAPI HTTP endpoint and not Gemini's outfit-photo extraction provider.
6. `OutfitService` returns validated AI output as `daily_ai`, or its
   deterministic fallback as `daily_fallback`. If neither can produce a valid
   outfit, the worker reports the existing classified failure.
7. The worker calls `complete_ai_job`. That RPC validates the current lease
   and result, records `ai_runs`, persists the outfit and relational items
   atomically on success, and updates job lifecycle/retry state. A later
   request can read the completed daily result.

With the flag false/unset, the daily action uses the deterministic engine
without the stored daily-AI lookup or enqueue. Calibration remains a
separate deterministic flow regardless of this flag. Groq generation stays
off the Next.js request path; application persistence remains behind RPCs.
Database authorization/eligibility validation also applies to curated proxy
items and must not be described as proof of physical ownership.

## Historical script and scheduling descriptions

| Older statement in this plan | Verified current implementation |
| --- | --- |
| The scheduled Python script writes one outfit row per user/day. | `generate_daily_outfit.py` rejects non-dry-run execution, and `persist_outfit()` raises; queued results are completed via `complete_ai_job`. |
| Read today's AI outfit using a `created_at` start-of-day filter. | The application reads `scheduled_for` in the user's timezone and `status='generated'`; the legacy script's date check still uses UTC `created_at`. |
| Save outfits with a direct table insert. | Application engine/calibration persistence uses `create_outfit_with_items`; daily worker persistence uses `complete_ai_job`. |
| Every displayed item must be an individually user-owned row. | Items must be traceable to eligible user-associated membership; curated proxy selections are authorized inputs without asserting actual ownership. |
| Any generation failure is silently handled at every layer. | The request has an engine path, the service has a deterministic fallback, and unrecoverable worker failures use durable job failure/retry state. Invalid configuration, insufficient items, and persistence failures are not universal silent-success cases. |

`generate_daily_outfit.py` remains a legacy diagnostic/dry-run generator;
its generation helpers and bootstrap purpose are retained. Its CLI requires
`--dry-run`; it is not the current production writer. Do not describe dry-run
as entirely read-only: `ensure_fashion_dna()` can seed a missing DNA row.

The repository still contains `.github/workflows/daily-outfit-generation.yml`
with a cron/manual trigger calling `python generate_daily_outfit.py --all-users`
without `--dry-run`. That command conflicts with the script's current guard
and cannot deliver the queued daily runtime as written. Worker supervision
and scheduling rollout must be verified separately; this documentation does
not claim that workflow or a deployed worker has been repaired.

## Scope and evidence

This clarification changes documentation only. It introduces no new mode
switch, queue behavior, schema change, recommendation policy, or deployment
configuration. The old phase checklist is superseded as a current-runtime
instruction; its historical text remains available in Git history.

Reviewed implementation:

- `generate_daily_outfit.py`
- `src/app/actions/outfit.ts`
- `src/app/actions/wardrobe.ts`
- `src/app/(app)/quiz/actions.ts`, `page.tsx`, `StyleQuiz.tsx`, `PieceSelectionScreen.tsx`
- `src/app/(app)/outfits/page.tsx`
- `ai_service/worker.py`, `ai_service/services/outfit_service.py`
- `supabase/migrations/20260919100000_gate4_preference_events_dna_versions.sql`
- `supabase/migrations/20260919120000_gate5_ai_jobs_runs.sql`
- `.github/workflows/daily-outfit-generation.yml`
