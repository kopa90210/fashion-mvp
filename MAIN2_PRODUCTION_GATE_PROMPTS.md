# Main2 Production Gate Prompts

Use these prompts one at a time, in order. Do not send the next gate prompt until the current gate has passed and you have approved its report.

These prompts assume the verified baseline is branch `main2` at commit:

```text
f976b4a4c3ed7ccadcac90e35947bb81eda6882d
```

## Shared rules for every gate

Include this block with every gate prompt:

```text
Repository: kopa90210/fashion-mvp
Baseline branch: main2
Verified baseline commit: f976b4a4c3ed7ccadcac90e35947bb81eda6882d

Work locally only. Read AGENTS.md and every applicable repository instruction before acting.

Do not push, open a pull request, merge, deploy, modify production Supabase, configure repository secrets, or expose secret values.

Preserve unrelated and pre-existing working-tree changes. Use the isolated local worktree and branch created in Gate 0. Do not use destructive Git commands.

Use forward-only migrations. Do not edit, rename, reorder, or delete a historical migration unless I explicitly approve a migration-ledger repair after reviewing evidence that it was never applied.

Implement only this gate. Do not begin a later gate. Keep the deterministic outfit recommendation engine available as the fallback. Keep external AI calls outside the interactive Next.js request path.

Before editing:
1. Confirm the current branch, HEAD SHA, and working-tree status.
2. Read the exact files and database objects affected by this gate.
3. Restate the gate acceptance criteria.
4. List the exact files you expect to create or change.
5. Report any contradiction that could create data loss, weaken authorization, or invalidate the plan. Stop on a P0 contradiction.

During implementation:
- Make the smallest coherent change.
- Add meaningful invariant and failure-path tests.
- Never claim a test or migration passed unless you ran it and show its real result.
- Never print or request secret values. Refer only to environment-variable names.

At the end, report:
- changed files;
- schema and migration effects;
- backfill/anomaly results;
- commands actually run with pass/fail counts;
- existing failures separated from regressions;
- remaining risks;
- manual owner actions.

Do not commit or push. Stop after the gate report and wait for my explicit approval.
```

---

## Gate 0 prompt — Verified local baseline

```text
[Paste the Shared rules for every gate here]

Implement Gate 0 only: establish a reproducible local baseline without changing product behavior.

The existing local main2 checkout may contain unrelated modified and untracked files, and its origin URL may contain the misspelled repository name `fahsion-mvp`. Do not discard, stash, overwrite, or carry those changes into the production-foundation work.

Tasks:
1. Verify the GitHub branch main2 still points to `f976b4a4c3ed7ccadcac90e35947bb81eda6882d`. If it moved, stop and report both SHAs.
2. Create an isolated Git worktree and local branch named `chore/main2-production-foundation` from that exact commit. Do not push it.
3. Verify the worktree is clean and contains only tracked main2 content.
4. Record runtime and tool versions: Node, npm, Python, pip, Git, and Supabase CLI if available.
5. Run the repository-supported baseline commands:
   - `npm ci`
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npx tsc --noEmit`
   - `pytest`
6. Inspect the latest GitHub Actions CI and scheduled-job runs read-only. If a scheduled job is missing secrets, report only the missing secret names.
7. Inspect migration discovery without applying anything to production. Determine whether the duplicate `0014` versions and `altamigrition.sql` prevent a clean local migration replay.
8. Produce a baseline report that distinguishes existing failures from any setup problem. Do not fix failures in this gate.

Acceptance criteria:
- The isolated branch starts at the exact approved SHA.
- The original dirty checkout is unchanged.
- Every supported validation command has a recorded result.
- Migration-history blockers are documented from actual tool output.
- No production data, secrets, remote branches, or GitHub settings changed.

Stop after the report. Do not commit or push.
```

---

## Gate 1 prompt — Canonical migration and ownership model

```text
[Paste the Shared rules for every gate here]

Gate 0 is approved. Implement Gate 1 only: make `user_wardrobe_items` the sole authoritative ownership/membership model and make future migrations deterministic.

Start by reviewing the Gate 0 migration-ledger evidence. If the remote/local ledger cannot prove which duplicate `0014` migration was applied, do not rename historical files. Stop and propose the least-risk repair with exact evidence.

Use a new forward-only timestamped migration, provisionally:
`supabase/migrations/20260916000100_canonical_ownership.sql`

Tasks:
1. Inventory every read, write, policy, RPC, and test that uses `wardrobe_items.owner_id` or `user_wardrobe_items`.
2. Backfill missing `user_wardrobe_items` links only where `owner_id` identifies one safe owner.
3. Detect and report conflicting, ambiguous, and orphaned uploaded rows. Never silently choose an owner.
4. Make RLS use `user_wardrobe_items` consistently:
   - authenticated users read curated rows;
   - users read/update only their linked private uploads;
   - users cannot mutate curated rows;
   - direct creation cannot leave an unowned item.
5. Keep draft item creation atomic through `create_draft_wardrobe_item`.
6. Give every `SECURITY DEFINER` function a fixed safe `search_path`.
7. Revoke public/anonymous execution and grant only required roles.
8. Add indexes supporting ownership lookups.
9. Remove application dependence on `owner_id`. Drop the column only if the disposable migration/backfill proves there are no unresolved rows; otherwise leave it deprecated and report the blocking rows.
10. Add local disposable-Supabase/PostgreSQL integration tests.

Required tests:
- User A reads curated items.
- User A creates a private draft through the RPC and receives its ownership link atomically.
- User A reads and updates the draft.
- User B cannot read or update User A's draft.
- User A cannot update a curated item.
- Anonymous access is denied where required.
- A forced failure during draft creation leaves neither an item nor a link.
- Orphan reporting returns only actual orphan rows.
- Fresh migration and representative upgrade migration both succeed locally.

Acceptance criteria:
- All supported application paths use one ownership source.
- Cross-user RLS tests pass locally.
- No new orphan can be created through a supported path.
- Historical migrations remain untouched unless separately approved.

Stop after the report. Do not commit or push.
```

---

## Gate 2 prompt — Private media and safe upload

```text
[Paste the Shared rules for every gate here]

Gates 0 and 1 are approved. Implement Gate 2 only: protect user media and make upload failures recoverable.

Use a new forward-only migration, provisionally:
`supabase/migrations/20260916000200_private_media_assets.sql`

Implement the approved `media_assets` model with owner, bucket, stable object path, media kind, MIME type, byte size, optional SHA-256/dimensions, lifecycle status, timestamps, uniqueness, index, and RLS.

Tasks:
1. Keep curated/public assets separate from private user assets.
2. Create a non-public bucket for private wardrobe media.
3. Store stable bucket/object paths in the database. Generate short-lived signed URLs only after ownership checks.
4. Validate actual content bytes, permitted MIME types/extensions, maximum size, non-empty content, and image decode. Do not trust only `File.name` or `File.type`.
5. Generate server-side object names.
6. Track every private upload in `media_assets` independently of wardrobe classification.
7. Delete newly uploaded objects if the database transaction fails.
8. Preserve legacy public URL reads during a controlled compatibility period.
9. Build a restartable legacy-media inventory/backfill that reports unparseable or missing objects without deleting anything.
10. Update wardrobe upload, photo replacement, wishlist upload if it contains private user media, image resolution, and related tests.

Required tests:
- Anonymous access to a private object fails.
- User A obtains a signed URL for User A's object.
- User B cannot obtain a signed URL or read User A's object.
- Invalid signatures, MIME/extension mismatches, empty files, oversized files, and corrupt images are rejected before processing.
- A database failure deletes the new object and leaves no `media_assets` row.
- A storage failure leaves no database row.
- Existing curated images remain readable.
- Legacy URLs remain readable through the compatibility path.

Acceptance criteria:
- Private uploads are inaccessible without authorization or a valid signed URL.
- New uploads never persist permanent public URLs.
- Failure paths do not leave untracked new objects.
- The backfill produces counts for migrated, missing, ambiguous, and failed assets.

Stop after the report. Do not commit or push.
```

---

## Gate 3 prompt — Relational outfits and idempotent daily generation

```text
[Paste the Shared rules for every gate here]

Gates 0–2 are approved. Implement Gate 3 only: normalize outfit membership and enforce one daily outfit per user/local date.

Use a new forward-only migration, provisionally:
`supabase/migrations/20260916000300_relational_outfits.sql`

Tasks:
1. Evolve `outfits` with `scheduled_for`, status, validated confidence, Fashion-DNA version reference if available, generator version, and context snapshot.
2. Add `outfit_items` with real wardrobe-item foreign keys, canonical slots, position, score contribution, and uniqueness rules.
3. Add a validated IANA timezone field for users and compute `scheduled_for` from the user's local date.
4. Detect malformed JSONB `item_ids`, duplicates, missing item references, invalid roles, and duplicate slots before backfill.
5. Backfill only valid legacy outfits and produce an anomaly report for invalid rows.
6. Keep the legacy `item_ids` compatibility read during migration. Do not remove it in this gate.
7. Update Next.js and Python reads/writes to use relational items through an atomic database operation.
8. Add a partial unique index enforcing one `daily_ai`/`daily_fallback` outfit per user and scheduled date.
9. Use insert/upsert conflict handling. A check-then-insert query may optimize work but cannot be the uniqueness guarantee.
10. Validate at render time that items still belong to the user's active wardrobe.
11. Keep the deterministic recommendation engine as the final fallback.

Required tests:
- Fresh and upgrade migration tests.
- Valid legacy outfits backfill with the correct slots.
- Malformed, duplicate, and missing references are reported without guessed repairs.
- Two sequential daily runs produce one row.
- Concurrent attempts produce one row and a deterministic result.
- Every normalized item has a real FK.
- A removed/retired wardrobe item is not rendered as active.
- User-local dates around UTC midnight and DST boundaries are correct.
- Existing valid legacy outfits remain readable.

Acceptance criteria:
- Database uniqueness prevents duplicate daily outfits.
- New outfit writes are relational and atomic.
- User timezone determines the business date.
- Compatibility behavior is preserved for valid legacy data.

Stop after the report. Do not commit or push.
```

---

## Gate 4 prompt — Transactional feedback and versioned Fashion DNA

```text
[Paste the Shared rules for every gate here]

Gates 0–3 are approved. Implement Gate 4 only: make feedback idempotent and Fashion DNA updates transactional and reconstructable.

Use a new forward-only migration, provisionally:
`supabase/migrations/20260916000400_preference_events_dna_versions.sql`

Tasks:
1. Add `preference_events` with the approved event enum, optional outfit/item references, payload, occurrence time, and unique `(user_id,idempotency_key)`.
2. Add `fashion_dna_versions` with sequential per-user version, vector, algorithm version, source event, and timestamp.
3. Backfill one baseline DNA version per user from the current `fashion_dna` projection. Do not invent historical events.
4. Implement one authenticated transactional RPC/service operation that:
   - derives the user from authentication;
   - verifies outfit ownership before any insert;
   - inserts or resolves one idempotent event;
   - returns the prior result without another update when repeated;
   - locks or version-checks current DNA;
   - obtains style tags from server-owned outfit items;
   - calculates the next vector with the existing clamping semantics;
   - writes the next version and current projection atomically.
5. Preserve existing feedback analytics through a compatibility projection or a clearly documented dual-write inside the same transaction.
6. Change the Next.js action to require an idempotency key generated for the user interaction. Do not accept trusted style tags from the client.

Required tests:
- Repeating the same idempotency key returns the same result and creates no second DNA version.
- Concurrent distinct events produce sequential versions without lost updates.
- A foreign outfit is rejected before any event/feedback row is written.
- A forced failure leaves neither a partial event nor a partial DNA update.
- Client-supplied style tags cannot affect the result.
- Baseline versions match current DNA projections.
- Historical versions reconstruct the resulting vector sequence.

Acceptance criteria:
- Feedback cannot be double-credited.
- Ownership is verified transactionally.
- DNA changes are sequential, atomic, and explainable.
- Existing UI behavior and analytics remain compatible.

Stop after the report. Do not commit or push.
```

---

## Gate 5 prompt — Durable AI jobs and observability

```text
[Paste the Shared rules for every gate here]

Gates 0–4 are approved. Implement Gate 5 only: make AI work durable, bounded, and auditable without adding another microservice.

Use a new forward-only migration, provisionally:
`supabase/migrations/20260916000500_ai_jobs_runs.sql`

Tasks:
1. Add `ai_jobs` and `ai_runs` with the approved statuses, attempts, availability, locking, safe errors, provider/model/prompt/schema metadata, latency, usage, and uniqueness.
2. Implement atomic claim/reclaim RPCs using row locking and `SKIP LOCKED` or an equivalent proven PostgreSQL pattern.
3. Implement bounded exponential backoff, retryable/permanent error classification, stale-lock recovery, and dead-letter recovery.
4. Reuse existing Python/FastAPI provider and validation modules through a CLI worker. Do not introduce another service or call Groq from interactive Next.js requests.
5. Queue extraction after safe media persistence. Queue daily generation with deterministic idempotency keys.
6. Preserve deterministic outfit fallback and record fallback attribution.
7. Record model, prompt version, schema version, validation status, and safe error codes.
8. Stop writing raw model output to `.last_groq_response.json`; remove the tracked artifact only after confirming it contains no required fixture data, and add it to `.gitignore`.
9. Sanitize logs and database error messages. Never store prompts containing unnecessary personal data, secrets, tokens, or authorization headers.

Required tests:
- Two workers cannot claim the same job simultaneously.
- A stale job can be safely reclaimed.
- Retryable errors schedule bounded retries with increasing delay.
- Permanent validation errors do not retry indefinitely.
- Attempts stop at `max_attempts` and transition to dead-letter.
- Recovery requeues only authorized dead-letter jobs.
- Provider failure triggers the documented deterministic fallback where applicable.
- Every AI-produced record references its job/run.
- Logs, rows, and fixtures contain no secret values.

Acceptance criteria:
- Job ownership and retries are database-enforced and measurable.
- External AI remains outside the interactive request path.
- Failures cannot consume resources indefinitely.
- Every AI result has provider/model/prompt/schema provenance.

Stop after the report. Do not commit or push.
```

---

## Gate 6 prompt — Recommendation data foundation

```text
[Paste the Shared rules for every gate here]

Gates 0–5 are approved. Implement Gate 6 only: add recommendation attribution needed to measure quality.

Use a new forward-only migration, provisionally:
`supabase/migrations/20260916000600_recommendation_impressions.sql`

Tasks:
1. Add `recommendation_impressions` with user, outfit, request ID, rank, candidate score, algorithm version, experiment key, context snapshot, shown time, and uniqueness.
2. Add RLS and indexes for owner-scoped reads and analytics/service writes.
3. Record an impression only when an outfit is actually presented, with a stable request ID and rank.
4. Ensure source, generator/algorithm version, and feedback can be joined without overwriting historical attribution.
5. Update the phase-gate report to calculate like rate by source and algorithm version and to distinguish impressions from feedback events.
6. Do not add pgvector or item embeddings. Main2 has no demonstrated retrieval use case that justifies them. Report this as an explicit deferred decision.

Required tests:
- Repeating the same request/outfit does not duplicate an impression.
- Cross-user impression reads are denied.
- Rank must be at least one.
- Displayed recommendations persist source, rank, algorithm version, and context.
- Like rate can be calculated by source and algorithm version.
- Two experiment keys can be compared without changing old rows.
- No impression is written for an outfit never presented.

Acceptance criteria:
- Every displayed recommendation is attributable to its ranking context.
- Historical experiments remain immutable and comparable.
- Product metrics can distinguish exposure from response.
- No unjustified embedding infrastructure is introduced.

Stop after the report. Do not commit or push.
```

---

## Gate 7 prompt — CI, release validation, and documentation

```text
[Paste the Shared rules for every gate here]

Gates 0–6 are approved. Implement Gate 7 only: make the complete change set reproducibly testable and reviewable before any push.

Tasks:
1. Update CI to use the lockfile and run:
   - npm install with `npm ci`;
   - lint;
   - TypeScript tests;
   - `npx tsc --noEmit`;
   - production build;
   - pinned Python dependency installation;
   - Pytest;
   - migration validation;
   - disposable database/RLS integration tests.
2. Keep scheduled production jobs separate from pull-request CI.
3. Declare least-privilege workflow permissions and pin action revisions appropriately.
4. Ensure CI runs for pull requests targeting main2 and for the production-foundation branch where appropriate.
5. Do not configure or request secret values. List required secret names as manual owner actions.
6. Rewrite README so it documents the actual architecture, local setup, environment-variable names, migration process, tests, daily flow, extraction flow, RLS ownership, media privacy, failure/fallback behavior, worker operation, and deployment checklist.
7. Add current and target architecture diagrams, current/target ERD, migration/backfill report, gate-by-gate validation evidence, and rollback notes.
8. Run the full local regression suite from a clean install and a fresh disposable database.
9. Test both a fresh migration and a representative upgrade from the pre-change schema.
10. Review the complete diff for secrets, raw AI output, personal data, generated files, and unrelated changes.

Required final validation:
- `npm ci`
- `npm run lint`
- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- pinned Python install command documented by the repository
- `pytest`
- migration replay/fresh database test
- upgrade migration test
- RLS integration suite
- focused concurrency/idempotency tests from Gates 3–5

Acceptance criteria:
- All required local checks pass, or each pre-existing failure is isolated with evidence.
- Fresh and upgrade migrations succeed.
- README matches actual code and operational behavior.
- Workflow files are syntactically valid and least-privilege.
- The final diff contains no secret values, raw provider responses, or unrelated files.

Prepare a PR-ready summary using exactly:

Problem:
Changes:
Result:
Validation:
Manual owner actions:

Do not push, open a PR, or merge. Stop with the complete local validation report and wait for my explicit approval for the next Git operation.
```

---

## Separate push prompt — use only after all gates pass

Do not use this prompt until every gate is approved locally.

```text
All Gates 0–7 have passed locally and their reports are approved.

Perform a final read-only pre-push audit first:
- confirm branch `chore/main2-production-foundation`;
- confirm its base is main2 commit `f976b4a4c3ed7ccadcac90e35947bb81eda6882d`;
- confirm the worktree is clean except for the approved gate changes;
- show the commit list and complete changed-file list;
- confirm no secret values, environment files, raw AI responses, binary datasets, or unrelated changes are included;
- confirm the latest full validation results and their timestamps;
- fetch main2 and report whether it moved since the approved baseline.

Do not rebase, push, force-push, open a PR, or modify GitHub yet. Stop after the audit and request my explicit approval for the exact push command and destination branch.
```
