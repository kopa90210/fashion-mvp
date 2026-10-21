# Problem
The deterministic swap backend has no consumer flow for choosing a piece, previewing an alternative and explicitly accepting the immutable child outfit.

# User Value
Change one part of today's owned outfit visually while retaining control over whether the derived look becomes the active Today outfit.

# Current Repository State
Today distinguishes owned looks from style inspiration and already supports wear/not-today and preference actions. BE-2 returns scored owned alternatives and persists an accepted swap as a new child outfit plus interaction.

# Product Scope
Personal Today mode only: piece selection, three alternatives, local preview and explicit persistence. No LLM, score percentages, swap history deletion, undo or automatic acceptance.

# Proposed Architecture
Use a native dialog as a mobile bottom sheet with a small reducer-driven flow. Keep the original `currentOutfit` untouched through selection and preview; replace it locally only after `createSwappedOutfit` succeeds.

# Data Flow
Current owned outfit → choose member → `getSwapCandidates(..., 3)` → local replacement preview → explicit `createSwappedOutfit` → display persisted child outfit.

# API Contracts
Enrich `SwapCandidate` with canonical category, optional subcategory and a consumer descriptor. Keep `outfitScore` internal to preview state and never render it. Existing persistence signature remains unchanged.

# Database Changes
None. Uses BE-2 schema and RPC.

# Failure Modes
Candidate failure shows safe retry copy. Empty results return to piece choice. Persistence failure leaves the preview intact for retry. Request locks prevent duplicate persistence.

# Security
The swap entry appears only for a fully owned outfit. BE-2 remains authoritative for ownership, membership and slot validation.

# Observability
No new logs. Successful persistence continues to create the BE-2 child and interaction.

# Implementation Gates
Candidate metadata, accessible bottom-sheet flow, focused state/presentation/action tests, full tests, lint and types.

# Tests
Open flow, select piece, candidate display, local replacement preview, transactional confirmation, safe retry, empty state and preservation of existing Today actions.

# Rollback
Remove the client flow and candidate display metadata. BE-2 remains available and no history is deleted.

# Validation Metric
Users can reach and persist a one-piece preview while the original remains visible until acceptance.

# Completed Validation
- Personal Today mode now exposes `Swap something`; style-inspiration/proxy looks do not expose ownership swap controls.
- The native-dialog bottom sheet opens at `What would you change?`, renders required pieces as image-first choices and places accessories in a smaller secondary section.
- Selecting a piece requests exactly three BE-2 candidates. The sheet shows the current piece first, skeleton progress, safe retry copy and an explicit empty state.
- Candidate cards show signed garment imagery, name and a humanized subcategory/category descriptor. The deterministic score is retained only for the derived outfit state and is never displayed as a percentage.
- Candidate selection renders an `Updated look` FlatLay without mutating the current outfit. `Use this look` calls the transactional action with a deterministic key; only a successful child ID updates Today. Persistence failure keeps the preview available for retry.
- The persisted child replaces the visible Today outfit, retains the current Fashion DNA vector and clears parent-specific explanation copy. No Undo is shown and no history is deleted.
- Native buttons provide keyboard operation; the dialog owns its accessible label, focuses each step heading, traps focus natively and restores focus to the trigger on close.
- Added reducer, presentation, preview immutability, deterministic action, failure, empty-state and existing-Today regression coverage. Focused UX-5/API tests passed 30 tests.
- Final full suite: 314 passed, 4 skipped across 21 files. `npm run lint` passed with zero errors and two existing warnings in `doc/doc-filelist.js` and `doc/doc-script.js`. `npx tsc --noEmit` and `git diff --check` passed.
- No database migration, LLM/Gemini call, preference feedback change, recommendation algorithm change or automatic swap was introduced.
