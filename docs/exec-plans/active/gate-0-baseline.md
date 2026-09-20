# Gate 0 — Local Baseline Report

## Scope

Gate 0 recorded and validated the actual local workspace at `F:\project\autofashion`. It did not change product behavior, apply migrations, access production Supabase, configure secrets, commit, push, or interact with GitHub.

## Starting State

- Branch: `main2` (informational only; work is local).
- Starting commit: `f976b4a4c3ed7ccadcac90e35947bb81eda6882d`.
- Pre-existing modified files: `.env.example`, `README.md`, `src/app/actions/outfit.test.ts`, and `src/app/actions/outfit.ts`.
- Pre-existing untracked files: `AGENTS.md`, `MAIN2_PRODUCTION_GATE_PROMPTS.md`, and `src/lib/outfit/ai-service.ts`.
- Gate 0 added only execution-plan documentation under `docs/exec-plans/active/`.

## Toolchain

| Tool | Version / state |
|---|---|
| Node.js | `v22.18.0` |
| npm | `10.9.3` |
| Python | `3.14.6` |
| pip | `26.1.2` |
| Git | `2.55.0.windows.3` |
| Supabase CLI | Not installed locally |
| `supabase/config.toml` | Missing |

The local Node and Python versions differ from the repository workflows (`Node 20`, `Python 3.12`). Later CI work must test the supported versions explicitly.

## Commands Actually Run

### Dependency installation

`npm ci`: **PASS**. Installed 659 packages and audited 660 packages. npm reported 17 known dependency vulnerabilities: 7 moderate, 9 high, and 1 critical. No automatic audit fix was applied.

### Lint

`npm run lint`: **FAIL**. ESLint reported 26 findings: 11 errors and 15 warnings.

Errors:

- `src/lib/pipeline/ai/adapters/parsing.ts:60` — `no-explicit-any`.
- `src/lib/pipeline/ai/adapters/real-adapters.test.ts` — ten `no-explicit-any` errors at lines 56, 68, 81, 97, 114, 131, 141, 157, 167, and 209.

Warnings are unused variables in `scripts/test_rls.mjs`, pipeline adapter tests, `real-isolator.ts`, `real-prettifier.ts`, `mock-detector.ts`, and `contracts.test.ts`.

### TypeScript tests

`npm test`: **PASS** — 13 test files passed; 203 tests passed, 4 skipped, 207 total.

### Standalone type checking

`npx tsc --noEmit`: **FAIL**. `src/lib/pipeline/ai/adapters/real-adapters.test.ts:237` widens a garment category to `string`, which is incompatible with the `GoldenGarment` category union.

### Production build

`npm run build`: **PASS**. Next.js 16.2.10 compiled, completed its TypeScript build phase, generated 14 static/dynamic routes, and finalized optimization. The build succeeds while standalone `tsc` fails because the standalone configuration includes the failing test fixture.

### Python tests

`python -m pytest`: **PASS** — 74 passed with one Starlette/httpx deprecation warning in 8.44 seconds.

## Migration Discovery

Migration replay was not attempted because the repository has no local Supabase CLI or `supabase/config.toml`.

Static discovery found:

- Duplicate version `0014`: `0014_phase4b_source_photo_pipeline.sql` and `0014_wishlist_items.sql`.
- Unversioned file: `altamigrition.sql`.

These must be resolved through Gate 1 planning before a deterministic fresh or upgrade replay can be claimed.

## Existing Baseline Failures

1. ESLint: 11 errors and 15 warnings.
2. Standalone TypeScript check: one fixture typing error.
3. Migration tooling/configuration is absent.
4. Migration naming is ambiguous.
5. npm audit reports one critical, nine high, and seven moderate dependency vulnerabilities.
6. Local runtimes do not match workflow runtimes.

No Gate 0 implementation regression was detected. Gate 0 intentionally did not repair these issues.

## Gate Decision

**PASS — baseline established with recorded failures.**

Gate 1 may begin only after explicit approval. Its first step must resolve how local migrations will be validated without rewriting migration history or guessing the production ledger.

## Remediation — 2026-09-16

The actionable baseline failures were repaired locally before further gate
work:

- ESLint errors and warnings were removed by replacing unsafe adapter casts,
  narrowing the transport contract, typing the golden evaluation fixture, and
  removing unused declarations. `npm run lint` passes.
- The standalone TypeScript fixture error was corrected. `npx tsc --noEmit`
  passes.
- Next.js, Sharp, Vitest, the matching ESLint/Vitest packages, and vulnerable
  transitive dependencies were upgraded. `npm audit` reports zero
  vulnerabilities.
- `.nvmrc` and `.python-version` now record the CI-supported Node 20 and Python
  3.12 runtimes. Verification in this workspace still ran on Node 22.18.0 and
  Python 3.14.6.
- Supabase CLI 2.117.0 initialized `supabase/config.toml`. Seeding is disabled
  because this repository has no `supabase/seed.sql`.
- Vitest configuration now uses ESM `.mts` files and `import.meta.dirname`, so
  Vitest 4.1.11 emits no configuration compatibility warning.

Verification after remediation:

- `npm run lint`: **PASS**, zero findings.
- `npx tsc --noEmit`: **PASS**.
- `npm test`: **PASS**, 203 passed and 4 opt-in live-provider tests skipped.
- `npm run test:ai`: **PASS**, 14 passed and 4 opt-in live-provider tests
  skipped.
- `npm run build`: **PASS**, 14 routes generated with Next.js 16.3.5.
- `python -m pytest`: **PASS**, 74 passed with one upstream
  Starlette/httpx deprecation warning.
- `npm audit`: **PASS**, zero vulnerabilities.
- `git diff --check`: **PASS**; Git reported only line-ending conversion
  notices for existing working-tree files.

Migration replay remains unavailable for two independent reasons:

1. Docker is not installed on this workstation, so the disposable Supabase
   stack cannot start.
2. The two historical `0014` files remain ambiguous without deployed migration
   ledger evidence. They were intentionally left unchanged under the Gate 1
   hard-stop rule.

Gate 0 application/tooling failures are resolved. Database migration replay
remains a recorded external prerequisite rather than an unreported pass.
