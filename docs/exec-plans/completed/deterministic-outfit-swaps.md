# Problem
Users need to replace one piece in an outfit without losing the original recommendation or turning a preview into mutable history.

# User Value
Offer a small ranked set of owned alternatives and preserve every accepted swap as a traceable child outfit.

# Current Repository State
The deterministic engine exposes `scoreOutfit`. Outfit membership is authoritative in `outfit_items`, with one canonical slot per row. Outfits do not yet link to a parent or allow `source='swap'`. BE-1 provides a separate append-only behavioral ledger with nullable item references.

# Product Scope
Authenticated deterministic candidates and transactional one-piece swap persistence. No LLM, Gemini, UI, multi-item swaps or preview persistence.

# Proposed Architecture
Read the owned parent through RLS and explicit owner filters, resolve its relational slots against the user's active confirmed wardrobe, replace only the selected slot, validate the full structure and rank each result with `scoreOutfit`. Persist an accepted swap through one security-definer RPC that creates a new child outfit, relational items and one `item_swapped` event atomically.

# Data Flow
Owned outfit + selected member + active confirmed wardrobe + Fashion DNA → deterministic scored candidates → explicit create request → immutable child outfit and swap event.

# API Contracts
`getSwapCandidates(outfitId, itemId, limit=3)` returns replacement items and complete-outfit scores without writes. `createSwappedOutfit(parentOutfitId, replacedItemId, replacementItemId, idempotencyKey)` returns the child outfit ID from the transactional RPC.

# Database Changes
Add nullable indexed `outfits.parent_outfit_id`, preserve all existing outfit source values while adding `swap`, extend interaction events with `item_swapped`, and add an owner-checking idempotent `create_swapped_outfit` RPC.

# Failure Modes
Reject missing authentication, foreign parents, non-member replaced items, inactive/draft/foreign replacements, slot mismatches, invalid parent/result structures and mismatched idempotency replays. Any error rolls back outfit, membership and event writes together.

# Security
Never accept a user ID. Candidate reads use the authenticated owner and RLS. Direct writes remain denied. The generic interaction RPC cannot create swap events; only the swap transaction supplies item references.

# Observability
The child source, parent link, generator version and item-level interaction provide durable provenance without private request logging.

# Implementation Gates
Schema/RPC migration, candidate/action implementation, focused unit tests, local transactional SQL/RLS verification, full tests, lint and types.

# Tests
Same-slot deterministic ranking; original, draft, retired and foreign exclusion; ownership/member/role rejection; immutable parent; linked complete child; single swap event; idempotency; transaction rollback.

# Rollback
Stop callers first, then remove the RPC/event constraint extension/parent link/source extension in a new controlled migration. Existing parent outfits remain untouched.

# Validation Metric
Valid ranked alternatives and exactly one complete child/event pair per accepted idempotency key.

# Completed Validation
- Added `20261005170000_outfit_swaps.sql` and applied/registered it on the verified local Docker Supabase database only. No remote migration was run.
- `outfits.parent_outfit_id` is an indexed self-reference with `on delete set null`; the existing source values remain valid and `swap` is added.
- `item_swapped` requires distinct non-null replaced/replacement references. Existing behavioral events require both references to remain null, and the generic interaction RPC still rejects swap creation.
- `getSwapCandidates` authenticates, owner-filters the parent, resolves relational membership, uses only the caller's active confirmed wardrobe, replaces the same canonical slot, validates the entire result, calls `scoreOutfit`, applies an explicit UUID tie-break and performs no writes.
- `create_swapped_outfit` serializes a user's idempotency key, validates ownership/membership/active wardrobe/normalized slot/structure, creates a new linked child plus complete `outfit_items`, and records one item-level interaction atomically. The parent is never updated.
- Local SQL/RLS validation passed owner success, foreign parent/replacement denial, missing member, draft/retired/wrong-role rejection, parent immutability, child completeness/provenance, event references, exact replay, mismatched replay, forced post-insert rollback, RLS reads and function privileges.
- The existing BE-1 local SQL/RLS and concurrent replay suite also passed after the event constraint extension.
- Focused swap/interaction/engine tests passed 48 tests. The final full suite passed 308 tests with 4 skipped across 20 files.
- `npm run lint` passed with zero errors and two existing warnings in `doc/doc-filelist.js` and `doc/doc-script.js`. `npx tsc --noEmit` and `git diff --check` passed.
- No LLM, Gemini, prompt, recommendation algorithm, feedback or Fashion DNA update path was added.
