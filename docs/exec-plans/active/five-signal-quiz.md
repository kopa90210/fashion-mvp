# Five-signal onboarding quiz

## Problem
The current quiz has 11 fixed questions and a forced pair, while the browser sends a style vector the server does not derive.

## User Value
Five quick choices produce outfits aligned with occasion, style, fit, formality, and appetite for novelty.

## Current Repository State
The deterministic engine scores only style tags. Wardrobe items also have JSONB fit weights and a numeric formality score. No reliable occasion tags exist. The migration ledger has an unresolved duplicate `0014` and remote drift.

## Product Scope
MVP onboarding and deterministic outfit ranking. Existing users keep their Fashion DNA and receive legacy scoring until they retake the quiz.

## Proposed Architecture
The client submits five answer IDs. The server validates all IDs and derives the style vector and typed signals. A forward-only migration adds signals to Fashion DNA and extends the transactional quiz RPC. The engine uses supported item attributes, with neutral scores for missing data.

## Data Flow
Five cards -> answer IDs -> server validation/scoring -> transactional RPC -> Fashion DNA -> wardrobe and style-seed ranking.

## API Contracts
`submitStyleQuiz(answers)` accepts one valid option for each of five questions. `fashion_dna.quiz_signals` stores the five IDs. The RPC receives a server-derived vector and signals.

## Database Changes
Add nullable `quiz_signals` JSONB to `fashion_dna`; retain old metadata and versions. Add a four-argument quiz RPC. Local migration only.

## Failure Modes
Reject incomplete, duplicate, or unknown answers. Missing fit/formality/item tags produce neutral adjustments. Old users without signals keep existing ranking. Occasion uses formality and style proxies until explicit occasion tags exist.

## Security
Auth-scoped RPC; no client style vector; no remote migration or production data change.

## Observability
Keep outfit source tracking and existing RPC version history. Document which ranking signals are proxies.

## Implementation Gates
Quiz, scoring, server action, migration, engine, call sites, tests, and verification.

## Tests
Five-by-four structure, validation and submission, legacy compatibility, each wired ranking signal, lint, typecheck, build.

## Rollback
Revert app deployment. Nullable added column and old RPC remain compatible; no historical migration rewrite.

## Validation Metric
Quiz completion time and rate, calibration like rate, outfit like rate, and signal availability on wardrobe items.
