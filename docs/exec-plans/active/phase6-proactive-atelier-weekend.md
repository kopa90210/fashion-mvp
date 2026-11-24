# Phase 6 — StyleGraph Atelier Proactive Stylist (weekend delivery plan)

**Status:** Execution plan only; all implementation tasks open until tested.  
**Planning date:** 2026-11-24 (Tue, Africa/Cairo)  
**Target:** Sunday 2026-11-29 end-of-day, Cairo time — **private, production-like demonstration**; public launch requires separate production gate.  
**Owner roles:** Founder/CTO, Full-stack, AI/QA; assign actual people as available.  
**Base commit:** `main` at `52a764f9ef18de7ed8114eeede3a7927cbfb006d`.  
**Existing experimental branch:** `feat/stylist-gemini-search` (1 ahead, 0 behind, 11 changes at review).  
**Execution branch suggestion:** `feat/phase6-proactive-atelier` cut from latest `main` and selectively port tested stylist code; never develop directly on `main`.

## 1. Product promise and scope

**Promise:** "Every day, see a useful outfit from clothes you own; discover one high-value piece when appropriate; and explore a gradual style change such as Classic → Old Money."

This is a **proactive, permissioned wardrobe agent**, not unrestricted autonomous purchasing. It may assemble recommendations without a typed question; the customer controls notifications and purchases. Never claim a curated onboarding selection is physically owned without owner confirmation.

### By Sunday: definition of DONE (P0)
1. **Daily Edit:** In a real signed-in account with a complete confirmed wardrobe, a complete outfit appears for the user's Cairo-local date **without the user composing a prompt**. Persist one canonical plan per user/date/source-version; repeat page loads do not create duplicates. The app shows what is actually owned versus curated inspiration.
2. **Wardrobe Opportunity:** The UI may display at most **one optional purchase opportunity** from a manually reviewed allowlisted Egypt catalog (initially 10–20 approved product/variant offers), only when price/stock/URL are verified recently and the candidate can unlock **at least two distinct valid outfits** composed of confirmed owned items plus the proposed product. If no match, explicitly say "No purchase needed / no verified match."
3. **Style Evolution:** A user can choose **Classic → Old Money** and preview (a) a currently feasible owned-only outfit and (b) a category-level next step or one approved product; show progress as a tangible count of qualifying looks, never a made-up "% transformed." Support cancel/reset. User intent must never silently alter their main Fashion DNA.
4. **In-app notifications:** User-controlled **in-app inbox**, one daily ready event and no more than one weekly shopping insight, deduplicated with read/dismiss controls. No browser push/email required by Sunday. Default commerce alerts OFF. An event fires only after successfully persisted recommendation.
5. **Luxury UI:** Mobile-first editorial Daily Edit + Opportunity + Style Evolution, actual signed owned-item images, fallback states and clear sponsor/source distinctions. Support English and Arabic labels/RTL for the core journey.
6. **Demo safety:** Feature flags OFF by default; isolated staging Supabase; zero observed cross-user disclosure/budget violations; no invented retailer links, prices, ownership, garment-quality ratings or "trending" claims; clean tests/build, monitoring and rollback.

### Explicitly AFTER the weekend (P1/P2)
- Autonomous live web searching, retailer APIs/partner integrations, trend crawler and regional trend scoring.
- Production web push and email; user timezone scheduling at global scale.
- Multi-style transformation engine, fit/size confidence beyond known catalog attributes, material-quality certification.
- Affiliate attribution contracts, autonomous checkout, virtual try-on and unconstrained LLM agents.
- Full batch push to all active users or public launch until worker/cron reliability is demonstrated.

## 2. Current repository architecture — verified dependencies

| Present in `main` | Reuse / caveat |
| --- | --- |
| `src/lib/outfit/engine.ts` | Pure deterministic outfit generation; no DB or model call. Extend via adapters, not rewrite. |
| `src/app/actions/outfit.ts` | `getDailyOutfit()` gets local-date outfit, uses deterministic immediate candidate and may enqueue `ai_jobs` when `ENABLE_AI_DAILY_OUTFITS` enabled. |
| `ai_service/worker.py` | Existing job consumer and lease/completion. Keep provider-specific cost isolation. |
| `src/app/(app)/outfits/DailyOutfitScreen.tsx` | Existing editorial canvas, save/like/not-today/worn interactions. Preserve. |
| `src/lib/media/private-media.ts` | Owner-validated, short-lived signed previews. Reuse; never expose storage service key. |
| `.github/workflows/daily-outfit-generation.yml` | **Broken/obsolete candidate:** runs legacy script `--all-users` without `--dry-run`; the script rejects non-dry-run. Must not advertise as working proactive scheduling. |
| Curated selection + `user_wardrobe_items` | **Critical distinction:** selected curated proxy items are not proof of physical ownership, even if status is confirmed. Tag source separately. |

### Experimental branch to cherry-pick selectively
`src/app/api/stylist/route.ts`, `src/lib/stylist/{intent,gemini,catalog,recommend,wardrobe}.ts`, `src/app/(app)/search/*`, tests. Keep its 5-second model timeout and rules fallback, budget enforcement, host allowlist and two-look invariant. Its product index is an env JSON fixture (<=250 entries, reviewed <=48h) **not live inventory**, and its UI is text-based. Do not assume its tests prove production readiness.

## 3. Architecture: modular monolith first, scalable boundaries

```text
Daily schedule / on-demand refresh
  -> authorized orchestration (bounded user batches; not public request handler)
  -> wardrobe context (RLS/ownership + source provenance + Fashion DNA + target-style goal)
  -> deterministic outfit engine
  -> optional verified product retrieval & incremental outfit-utility ranking
  -> persist via idempotent DB operation
  -> notification outbox (only committed results)
  -> UI: Daily Edit / One Opportunity / Style Evolution / Inbox
```

- **Next.js API/server actions:** auth, UI-facing reads/mutations, request validation, quotas. No long-running global scan in Vercel request.
- **Supabase:** row-level authorization for user goals, inbox and generated insights. Separate verified retailer offers from user wardrobe. Fixed schema migrations via additive SQL; validate staging first.
- **Railway worker:** reuse existing durable queue and observability. For weekend, implement a **bounded staging cohort scheduler** only if the existing queue can be safely triggered for users in batches; otherwise show explicitly labeled on-open/preview-generated Daily Edit and leave "morning proactive" gate FAILED (never fake scheduled execution).
- **Gemini:** optional one-shot structured intent / goal parsing. Fixed goal "classic-to-old-money" can be deterministic for first release. No Gemini call per user per morning, no live Gemini web search.
- **Catalog:** 10–20 retailer offer fixtures, **real only when verified**; synthetic records only in separately labeled demo mode and must not render as purchasable product cards.
- **Scheduling:** idempotency `(user_id, local_date, recommendation_type, algorithm_version)`; use a DB unique index or transactional RPC. Scheduler cursor, lease, retry bounds, and no duplicate outbox events.
- **Feature flags:** `ENABLE_ATELIER`, `ENABLE_ATELIER_SHOPPING`, `ENABLE_ATELIER_SCHEDULER`, `ENABLE_ATELIER_INBOX`, all OFF by default.

## 4. Minimal data contract (staging only)

- `style_goals`: `user_id`, `source_style`, `target_style`, `status`, `created_at`, `updated_at`. Unique active goal per user; user-scoped RLS.
- `wardrobe_opportunities`: `user_id`, `local_date`, `algorithm_version`, `candidate_offer_id nullable`, `outfit_unlock_count`, `proof_item_ids`, `status`, `expires_at`. One per user/day/version; auditable source.
- `notification_preferences`: `user_id`, `in_app_daily_enabled`, `shopping_enabled default false`, `style_goal_enabled`, `timezone`.
- `notification_outbox`: `user_id`, `event_key unique per user`, `type`, `payload jsonb`, `status`, `read_at`, `created_at`. Do not store private media URLs.
- `retailer_offers` (pilot only, unless existing equivalents found): `product_id`, `brand`, `title`, `role`, `style_tags`, `collection`, `price_egp`, `stock`, `size_info`, `url`, `source`, `checked_at`, `expires_at`, `image_permission`.
- Prefer proven existing `outfits` and `ai_jobs` RPCs; do not duplicate daily outfit tables for generated outfits.
- Apply RLS and indexes; add migrations only after checking existing DB schema and remote migration ledger. Never blindly `db push` to production.

## 5. Opportunity score and style transition

**Two stage selection:**
1. **Hard eligibility:** real verified product; brand allowlisted; correct currency EGP; <= hard budget if present; approved product URL; fresh available offer; known compatible attributes and collection.
2. **Utility:** compute distinct complete outfits that pass the deterministic engine and styling constraints **with** product, less valid existing outfits **without** product. Deduplicate by meaningful outfit core and occasion. For pilot require at least two distinct candidate-anchored looks. If only proxy curated items, label as style inspiration and do not assert owned-based unlock count.

Suggested explainable order: (a) unique validated outfits unlocked, (b) user target-style alignment, (c) material/quality evidence confidence, (d) lower price as tiebreak. Never invent quality ratings or unlock counts.

**Style evolution MVP:** treat "Old Money" as editable preset (neutral colors, tailored or relaxed tailoring, classic materials, controlled silhouettes), not a universal truth. Analyze existing items first. Save target goal separately from quiz DNA. Show `eligible_owned_looks_count`, `missing_categories`, and optionally one verified candidate. A goal can be deactivated without losing prior Fashion DNA.

## 6. Tuesday–Sunday sprint (proposed role allocations)

| Day (Cairo) | Owner role | P0 delivery | End-of-day evidence |
| --- | --- | --- | --- |
| Tue 24 Nov | CTO + full-stack | Pin SHAs; compare branches; read live migrations; define RLS/source provenance; baseline typecheck/lint/tests/build; feature flags | G0 matrix, no prod changes |
| Wed 25 Nov | Full-stack + backend | Port intent and guardrails; typed wardrobe source; persist per-local-date daily edit with idempotent behavior; visible premium owned canvas | Daily Edit tests + screenshots |
| Thu 26 Nov | Backend + AI | Style goal preset, owned-look count, pilot approved offers, hard filters, two-looks test; "No buy needed" | 10 deterministic evaluation cases |
| Fri 27 Nov | Full-stack + backend | Inbox preferences and outbox transaction; opt-in behavior; implement cohort-only scheduler if durable queue feasible; rate limits | Dedup/timezone/no-spam tests |
| Sat 28 Nov | Full-stack + QA | Mobile editorial polish, Arabic/RTL, full journey with sparse/complete/curated-only wardrobes, 20 realistic prompts | Staging test run + bug triage |
| Sun 29 Nov | CTO + founder | Full clean CI/build + RLS tests; rollback rehearsal; private demo; gate decision | Demonstration link and signed checklist, OR precise blockers |

**Hard cutline Friday 27 Nov:** If queued scheduling cannot be made safe, reduce Sunday deliverable to the on-open **Daily Edit Preview** and record that genuine proactive generation is not done. Never substitute an on-demand flow while claiming daily scheduled agent works.

## 7. Acceptance test matrix / launch gates

| Gate | Required proof |
| --- | --- |
| G0 Baseline | Clean install + typecheck + lint + unit tests + production build, baseline deltas recorded |
| G1 Data/security | Correct owner isolation; curated proxy items labeled as inspiration; no private media leakage; migration/RLS reviewed |
| G2 Agent correctness | Cairo-local dates, no duplicate daily/outbox rows; deterministic completed outfit; safe sparse wardrobe; graceful fallback |
| G3 Commerce correctness | Never invent prices/URLs/quality; budget cap enforced; expiry/stock exclusion; two genuinely distinct looks or abstain |
| G4 UX | Daily / opportunity / goal / inbox mobile at 360 and 390 px; Arabic RTL and English; notification opt-in & disable |
| G5 Operational | Shared quota, cost logging, bounded retries, scheduler health, rollbacks and cleanup documented |
| G6 Weekend demo | All P0 completed for **private staging**, no unverified claims; public shipping deferred until real partner/production proof |

### Test cases to write
- Same user opens Daily Edit ten times -> one local-date canonical plan.
- Two users query concurrently -> no cross-user wardrobe, style goal or private image leakage.
- Curated-only closet -> inspiration, never "your owned outfit."
- Empty/sparse wardrobe -> next action and no invented purchase.
- Cairo midnight boundary / DST-safe timezone -> no second wrong-day notification.
- Explicit 1,500 EGP ceiling vs Gemini 2,000 -> never display >1,500.
- Stale/unknown-stock/off-domain offer -> excluded.
- Goal Classic → Old Money -> preserves DNA, can reset, returns owned-first.
- Shopping inbox OFF -> zero shopping events.
- Repeated worker delivery -> one notification; failed outfit -> no "ready" event.
- Gemini timeout/429 -> rules fallback, bounded cost.
- Brand images without usage rights -> do not render unauthorized images.

## 8. Metrics and rollout controls

Pilot KPIs: daily completed outfit rate, daily unique plans/user, in-app read rate, goal plan opens, verified offers accepted, outfit unlock evidence, budget/ownership violations (zero), p95 latency, queue age, cost per useful decision. Hard cap per-user AI calls; avoid per-user trend research.

**Not in weekend launch:** generic trend crawling, live web shopping search, public push, autonomous checkout, inventory synchronization at scale, a multi-agent framework. Future stages can implement **weekly shared trend research** (one regional batch) and deterministic matching to opted-in users, then partner catalogs and verified product feeds.

## 9. Weekend go/no-go decision

**GO for private staging demo** only when G0–G5 pass with test evidence, and real-source provenance is not misrepresented.  
**NO-GO** on genuine morning agent claims if daily scheduling remains unproven; provide an explicit limited preview instead.  
**NO-GO for public launch** until monitoring, opt-in, retailer permissions, catalog freshness and worker supervision are verified.  
No pushes to production, merges into `main`, staging DB migrations or deployments are authorized by this plan alone.

## 10. First action

1. Create implementation branch from fresh `main`; pin SHAs.
2. Inventory existing DB migrations and deployment status; resolve historical migration-ledger surprises first.
3. Run `npm ci && npx tsc --noEmit && npm run lint && npm test && npm run build`.
4. Selectively port the stylist branch behind the feature flag; preserve `getDailyOutfit()`, ownership provenance and the worker's existing durable job contract.

## Traceability

- [Current main](https://github.com/kopa90210/fashion-mvp/tree/main)
- [Existing stylist experiment](https://github.com/kopa90210/fashion-mvp/tree/feat/stylist-gemini-search)
- [Repository comparison](https://github.com/kopa90210/fashion-mvp/compare/main...feat/stylist-gemini-search)
- `AI_DAILY_OUTFIT_IMPLEMENTATION_PLAN.md`
- `src/app/actions/outfit.ts`, `ai_service/worker.py`, `.github/workflows/daily-outfit-generation.yml`
- `src/app/(app)/outfits/DailyOutfitScreen.tsx`, `src/lib/outfit/engine.ts`

**Change policy:** This plan is a controlled slice of the larger Phase 6 vision. Expand capability only after the weekend gates pass.