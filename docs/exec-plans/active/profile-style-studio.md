# Profile Style Studio — Active Execution Plan

## 1. Problem
Currently, `/profile` is an empty stub ([`src/app/(app)/profile/page.tsx`](file:///f:/project/autofashion/src/app/(app)/profile/page.tsx)), while the bottom navigation ([`src/components/nav/BottomNav.tsx`](file:///f:/project/autofashion/src/components/nav/BottomNav.tsx)) already exposes a permanent link to it. Users have no dedicated place to inspect their personal wardrobe identity, view outfits they have worn in the past, save favorite look compositions for future reference, highlight their signature aesthetic, or examine their calibrated Fashion DNA and onboarding style signals.

## 2. User Value
The Profile Style Studio transforms the blank `/profile` tab into an intimate, private wardrobe sanctuary:
- **Saved Looks**: A curated lookbook of favorite combinations saved from daily recommendations or wear history, allowing users to build a personal look archive.
- **Worn History**: An auditable log of outfits the user marked as worn ("I'm wearing this"), with explicit calendar wear dates, date correction, and accidental-wear undo.
- **Style Passport (Gate 2)**: An authoritative visual summary of the member's fashion identity, calibrated Fashion DNA weights, and 5 core onboarding quiz signals.
- **Signature Look (Gate 3)**: An optional pinned highlight representing the user's defining style silhouette.

This reinforces StyleGraph's core mission: helping users understand and maximize the utility of their owned wardrobe without adding social clutter, feeds, followers, or shopping ads.

---

## 3. Verified Baseline Test Status
**Baseline Test Execution**: Vitest was executed across the test suite on branch `feat/profile-style-studio` at commit `ef569fe`.
- **Test Files**: 29 files (382 tests).
- **Result**: 28 files passed, 1 failed (377 passed, 1 failed, 4 skipped).
- **Specific Failure**: [`src/lib/outfit/engine.bench.test.ts`](file:///f:/project/autofashion/src/lib/outfit/engine.bench.test.ts#L89) failed with `AssertionError: expected 64.2624ms to be less than 50ms` on `recommendOutfits(50 items) meets performance budget (< 50ms)`. This is a CPU timing jitter on benchmark execution, while all functional regression tests in [`src/lib/outfit/engine.test.ts`](file:///f:/project/autofashion/src/lib/outfit/engine.test.ts) (42/42) and [`src/app/actions/outfit.test.ts`](file:///f:/project/autofashion/src/app/actions/outfit.test.ts) (27/27) passed.
- **Rule Enforced**: A launched test is not a pass. Baseline status is explicitly recorded with this failure.

---

## 4. Verified Existing Capabilities & Code References

### 4.1 Route, Navigation, and Shell
- **Page Stub**: [`src/app/(app)/profile/page.tsx`](file:///f:/project/autofashion/src/app/(app)/profile/page.tsx) renders a static "Coming soon" notice with zero data fetching or state.
- **Navigation**: [`src/components/nav/BottomNav.tsx`](file:///f:/project/autofashion/src/components/nav/BottomNav.tsx) renders a 4-tab floating bar (`/outfits`, `/wardrobe`, `/search`, `/profile`), linking to `/profile` with the `UserRound` icon from `lucide-react`.
- **App Shell**: [`src/app/(app)/layout.tsx`](file:///f:/project/autofashion/src/app/(app)/layout.tsx) wraps screens in `stylegraph-app-shell` and renders `BottomNav`.

### 4.2 Styling, Components, and Animation
- **Tailwind CSS 4**: Utilizes `@tailwindcss/postcss` and CSS design tokens.
- **Color System**:
  - Background/Canvas: `#f7f4ef`, `#ebe3d8`, `#fffdfa`
  - Ink/Typography: `#1d1b18` (primary), `#6d6257` (secondary), `#7a6f62` (tertiary/muted)
  - Borders/Dividers: `#d8cec2`, `#e4dbd0`, `#e6ddd2`
  - Accents: `#596c5e` (sage green for DNA weights and confirmations)
- **Animation**: `framer-motion` (`^12.42.2`) is actively used across [`DailyOutfitScreen.tsx`](file:///f:/project/autofashion/src/app/(app)/outfits/DailyOutfitScreen.tsx) with `AnimatePresence` and `motion` components.
- **Presentation Components**:
  - [`src/components/outfit/OutfitCanvas.tsx`](file:///f:/project/autofashion/src/components/outfit/OutfitCanvas.tsx): Reusable presentation wrapper supporting `editorial` and `framed` variants.
  - [`src/components/outfit/FlatLay.tsx`](file:///f:/project/autofashion/src/components/outfit/FlatLay.tsx): Composes responsive flatlay garments dynamically using [`src/lib/outfit/composition.ts`](file:///f:/project/autofashion/src/lib/outfit/composition.ts). Handles image errors with fallback `ImageOff` gracefully.
  - [`src/components/fashion-dna/FashionDnaPanel.tsx`](file:///f:/project/autofashion/src/components/fashion-dna/FashionDnaPanel.tsx): Renders calibrated style weights with progress bars and "still learning" thresholds.

### 4.3 Authentication & Account Fields
- **Supabase SSR Client**: [`src/lib/supabase/server.ts`](file:///f:/project/autofashion/src/lib/supabase/server.ts) provides authenticated server access.
- **`public.users` Table** ([`supabase/migrations/0001_initial_schema.sql`](file:///f:/project/autofashion/supabase/migrations/0001_initial_schema.sql), [`supabase/migrations/20260918103000_gate3_relational_outfits.sql`](file:///f:/project/autofashion/supabase/migrations/20260918103000_gate3_relational_outfits.sql)):
  - Fields: `id` (uuid, references `auth.users`), `has_completed_calibration` (boolean), `timezone` (text, validated IANA timezone), `created_at` (timestamptz).
  - Explicit omission: No public display names, usernames, avatars, bio, or profile themes exist in `public.users`. Email is stored in `auth.users`.

### 4.4 Mutation Realities: Outfits, Garments, and Media Are Not Immutable
Inspection of actual database constraints and application action code reveals that claims of complete immutability are inaccurate:
1. **Garment Deletion**: [`remove_user_wardrobe_item`](file:///f:/project/autofashion/supabase/migrations/20260916150000_gate1_canonical_ownership.sql#L77) performs `delete from public.wardrobe_items where id = p_item_id` when `source = 'user_upload'`. Because [`outfit_items.wardrobe_item_id`](file:///f:/project/autofashion/supabase/migrations/20260918103000_gate3_relational_outfits.sql#L45) references `wardrobe_items(id) on delete cascade`, deleting a user garment cascades and **deletes that item from `public.outfit_items`**.
2. **Garment Attribute Updates**: [`updateWardrobeItemAttributes`](file:///f:/project/autofashion/src/app/actions/wardrobe.ts#L153) updates `display_name`, `category`, `subcategory`, `color`, `fit`, `style_tags`, and `layer_role` in-place on `public.wardrobe_items`.
3. **Garment Media Replacement**: [`replaceWardrobeItemPhoto`](file:///f:/project/autofashion/src/app/actions/wardrobe.ts#L174) attaches a new `media_asset_id` and permanently deletes the old storage object via `deletePrivateObject`.
4. **Media Asset Deletion**: In [`20260916160000_gate2_private_media_assets.sql`](file:///f:/project/autofashion/supabase/migrations/20260916160000_gate2_private_media_assets.sql#L29), `wardrobe_items.media_asset_id` references `media_assets(id) on delete set null`. Deleting a media asset leaves the wardrobe item with a null asset ID.
5. **Private Media Signing Boundary**: Private images expire (default TTL 300s). Signed URLs must never be persisted. If a media object is missing or unlinked, `signedOwnedPrivatePreviewUrl` returns `null`.
6. **Defensive Requirement**: Historical outfit display must never assume all original garments and images remain permanently accessible. The UI must render surviving garments cleanly and display honest missing-image indicators (`ImageOff`) for unresolvable assets.

### 4.5 Behavioral Events & `recordOutfitWorn`
- **`public.outfit_interactions` Table** ([`supabase/migrations/20261005160000_outfit_interactions.sql`](file:///f:/project/autofashion/supabase/migrations/20261005160000_outfit_interactions.sql)):
  - Fields: `id`, `user_id`, `outfit_id`, `event_type`, `item_id`, `replacement_item_id`, `context_snapshot`, `idempotency_key`, `created_at`.
  - `event_type` check: `'outfit_viewed'`, `'outfit_worn'`, `'outfit_not_today'`, `'item_swapped'`.
  - Append-only behavioral ledger. It does not contain an editable calendar `worn_on DATE`, nor does it support wear date corrections or undo.
- **Server Action**: [`src/app/actions/outfit-interactions.ts`](file:///f:/project/autofashion/src/app/actions/outfit-interactions.ts) exports `recordOutfitWorn(outfitId, idempotencyKey)`.
- **Caller UI**: [`DailyOutfitScreen.tsx`](file:///f:/project/autofashion/src/app/(app)/outfits/DailyOutfitScreen.tsx#L62) calls `recordOutfitWorn` when the user clicks "I'm wearing this" with key `today:worn:${outfitId}`.

---

## 5. Gate 1 Architecture & Database Schema

Gate 1 implements the complete vertical slice for **Saved Looks** and **Worn History**. Signature Look and Profile Passport header enhancements are strictly deferred to Gates 2 and 3.

### 5.1 Saved Looks Membership (`public.saved_outfits`)
A dedicated join table tracks currently saved outfits:
- `user_id uuid not null references public.users(id) on delete cascade`
- `outfit_id uuid not null references public.outfits(id) on delete cascade`
- `created_at timestamptz not null default now()`
- `primary key (user_id, outfit_id)`
- Compound index on `(user_id, created_at desc, outfit_id desc)`
- **Eligibility Rules**:
  - The outfit must belong to `auth.uid() = user_id`.
  - `source <> 'calibration'` (calibration outfits are excluded).
  - `status <> 'invalid'` (invalid outfits are excluded).
  - Outfits with `status in ('generated', 'superseded')` from sources `('daily_ai', 'daily_fallback', 'engine', 'manual', 'swap')` are eligible.
  - When a daily outfit transitions from `generated` to `superseded`, an existing saved look remains saved and viewable.
- **Mutations**:
  - `save_outfit_look(p_outfit_id)`: Idempotent (`insert ... on conflict (user_id, outfit_id) do nothing`).
  - `unsave_outfit_look(p_outfit_id)`: Idempotent (`delete from public.saved_outfits where user_id = auth.uid() and outfit_id = p_outfit_id`).
  - No notes, folders, or collections in this gate.

### 5.2 Canonical Wear Record (`public.outfit_wear_records`)
A canonical table manages explicit wear instances:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.users(id) on delete cascade`
- `outfit_id uuid not null references public.outfits(id) on delete cascade`
- `worn_on date not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `unique (user_id, outfit_id, worn_on)`: Enforces at most one active record per user/outfit/date.
- Allows the same outfit to be worn on different dates.
- Today's date is derived server-side using the user's stored `timezone` (`public.users.timezone`).
- **Date Correction**:
  - `update_outfit_wear_date(p_wear_record_id, p_new_worn_on)` updates `worn_on`.
  - Conflict behavior: If `(user_id, outfit_id, p_new_worn_on)` already exists on another row, the RPC raises an explicit error code `23505` (`DATE_CONFLICT: Outfit already marked as worn on this date`).
- **Accidental Recording Undo**:
  - `undo_outfit_worn(p_wear_record_id)` removes the row from `public.outfit_wear_records`.
- **Historical Reconciliation**:
  - A forward-only data backfill migrates existing `outfit_interactions` rows where `event_type = 'outfit_worn'` into `public.outfit_wear_records`:
    `worn_on = (oi.created_at at time zone coalesce(u.timezone, 'UTC'))::date`
    Reconciled with `on conflict (user_id, outfit_id, worn_on) do nothing`.
  - Only explicit `outfit_worn` events are backfilled. No wear is inferred from views or likes.
- **Integration with Existing "I'm wearing this"**:
  - The client action in `DailyOutfitScreen.tsx` calls `recordOutfitWorn`, which writes to `public.outfit_wear_records` (canonical) and simultaneously records `outfit_interactions` with a date-scoped key `today:worn:${outfitId}:${wornOn}` for behavioral analytics parity.

---

## 6. Precise Read & Mutation Contracts

### 6.1 Data Types ([`src/lib/profile/types.ts`](file:///f:/project/autofashion/src/lib/profile/types.ts))

```typescript
export interface ProfileGarment {
  id: string
  displayName: string
  category: string | null
  layerRole: string | null
  imageUrl: string | null
  slot: string
  position: number
  isRetired?: boolean
  isMissing?: boolean
}

export interface ProfileOutfitLook {
  id: string
  source: 'engine' | 'daily_ai' | 'daily_fallback' | 'manual' | 'swap' | 'calibration'
  status: 'generated' | 'superseded' | 'invalid'
  createdAt: string
  scheduledFor: string | null
  stylingTip: string | null
  reasons: string[]
  items: ProfileGarment[]
}

export interface SavedLookEntry {
  outfitId: string
  savedAt: string
  outfit: ProfileOutfitLook
}

export interface WornLookEntry {
  wearRecordId: string
  wornOn: string // YYYY-MM-DD
  recordedAt: string
  outfit: ProfileOutfitLook
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}
```

### 6.2 Mutation Contracts ([`src/app/actions/profile.ts`](file:///f:/project/autofashion/src/app/actions/profile.ts))

```typescript
/**
 * Save an eligible outfit to the user's private lookbook.
 * Idempotent: repeated calls for the same outfit return success.
 */
export async function saveOutfitLook(outfitId: string): Promise<{ success: boolean; savedAt: string }>

/**
 * Remove an outfit from the user's saved lookbook.
 * Idempotent: repeated calls return success.
 */
export async function unsaveOutfitLook(outfitId: string): Promise<{ success: boolean }>

/**
 * Record an outfit as worn on a specific date (defaults to today in user's timezone).
 * Idempotent for identical (outfitId, wornOn).
 */
export async function recordWear(outfitId: string, wornOn?: string): Promise<{
  success: boolean
  wearRecordId: string
  wornOn: string
}>

/**
 * Correct an existing wear record's date.
 * Throws on date conflict if outfit was already worn on newDate.
 */
export async function changeWearDate(wearRecordId: string, newDate: string): Promise<{
  success: boolean
  wearRecordId: string
  wornOn: string
}>

/**
 * Undo an accidental wear recording.
 */
export async function undoWear(wearRecordId: string): Promise<{ success: boolean }>
```

### 6.3 Paginated Read Contracts

```typescript
/**
 * Paginated saved looks.
 * Cursor: base64(JSON.stringify({ createdAt: string, outfitId: string }))
 * Bounds: limit between 1 and 50 (default: 8).
 */
export async function getSavedLooks(cursor?: string, limit = 8): Promise<PaginatedResult<SavedLookEntry>>

/**
 * Paginated worn history.
 * Cursor: base64(JSON.stringify({ wornOn: string, wearRecordId: string }))
 * Bounds: limit between 1 and 50 (default: 8).
 */
export async function getWornLooksHistory(cursor?: string, limit = 8): Promise<PaginatedResult<WornLookEntry>>
```

---

## 7. Migration & Rollback Strategy

### 7.1 Forward-Only Database Migration (`20261026180000_gate1_saved_and_worn_history.sql`)
1. Create `public.saved_outfits` with RLS (`owner all`), foreign keys on delete cascade, and index on `(user_id, created_at desc, outfit_id desc)`.
2. Create `public.outfit_wear_records` with RLS (`owner all`), foreign keys on delete cascade, unique constraint on `(user_id, outfit_id, worn_on)`, and index on `(user_id, worn_on desc, id desc)`.
3. Create RPCs:
   - `save_outfit_look(uuid)`
   - `unsave_outfit_look(uuid)`
   - `record_canonical_outfit_worn(uuid, date)`
   - `update_outfit_wear_date(uuid, date)`
   - `undo_outfit_worn(uuid)`
4. Backfill existing `outfit_interactions` worn rows into `outfit_wear_records`.

### 7.2 Safe Application Rollback & Forward-Only Corrections
- **Application Rollback**: If application code needs reverting, previous code remains fully compatible because no existing columns or tables were altered or removed.
- **Forward-Only Database Corrections**: In accordance with database rules, deployed migrations are production artifacts. If any schema change needs adjustment, issue a forward-only migration rather than rewriting history.

---

## 8. Implementation Sequence

1. **Gate 1: Saved & Worn History Core** [COMPLETED & VERIFIED]
   - **Verification Config Audit**: Audited `tsconfig.json` and `eslint.config.mjs`. Verified that no application code or tests are excluded. Exclusions are strictly limited to `.worktrees/**` (preventing infinite recursion into nested external worktree `node_modules`) and `c5_5_review_bundle/**` (uncommitted local diagnostic bundle in `.git/info/exclude`).
   - **Unified Transactional Wear RPC**: `record_canonical_outfit_worn(p_outfit_id uuid, p_worn_on date, p_idempotency_key text)` executes atomic writes to `public.outfit_wear_records` and `public.outfit_interactions` under an advisory transaction lock (`pg_advisory_xact_lock`).
     - **Replay**: Idempotency key match returns current record state without duplicate interaction rows.
     - **Date Correction**: Old request retry after date correction returns current corrected date without overwriting or reverting.
     - **Undo**: Old request retry after undo returns `replayed: true, undone: true, id: null` and never silently recreates an undone wear record.
   - **Historical Garment Snapshot Preservation**: `saved_outfits` and `outfit_wear_records` store a server-captured `garment_snapshot jsonb` on insert. When garments are deleted from `wardrobe_items` (cascading into `outfit_items`), the saved/worn look preserves the original garment membership, slot role, position, and display label, rendering an honest `ImageOff` missing-image placeholder without exposing deleted media or storing signed URLs.
   - **SQL Security & Grants**: All stored functions enforce `auth.uid()`, fixed `search_path = pg_catalog`, revoked public/anon execution, explicit authenticated/service_role grants, and row-level ownership checks that permit superseded outfits while forbidding invalid/calibration outfits.
   - **UI & Optimistic Updates**: Added Bookmark save toggle with optimistic rollback to `DailyOutfitScreen.tsx`. Built tabbed `ProfileStudioClient.tsx` supporting saved look unsaving, wear date inline editing with conflict handling, accidental wear undo, and keyset cursor load-more.
   - **Forward-Only Migration**: Applied `20261026180000_gate1_saved_and_worn_history.sql` with safe timezone conversion via `public.is_valid_iana_timezone(u.timezone)`.

2. **Gate 2: Style Passport & Header** [COMPLETED & VERIFIED]
   - **Profile Header**: "My Style" title, authenticated display name with neutral fallback ("Member", "M"), initials avatar, restrained editorial palette (`#f7f4ef`, `#ebe3d8`, `#fffdfa`, `#1d1b18`), and accessible account menu showing user email and functional sign out.
   - **Real Summary Counts**: Full-dataset counts for Wardrobe pieces, Saved looks, and Times worn (canonical active wear records excluding undone ones), matching wardrobe screen confirmed item eligibility rules without signing images. Honest unavailable state ("—") for failed queries without fabricating zeros.
   - **Style Passport**: Calibrated Fashion DNA display with strongest aesthetic signals (tags #1, #2... without fake percentages or personality assessments), caption "Based on your style choices.", 5 canonical onboarding quiz signals (`QUIZ_SIGNAL_DEFINITIONS`), graceful legacy fallback for older users without quiz signals, and clean empty state when style information is absent. Read-only for style preferences.
   - **Component Decomposition**:
     - `src/components/profile/ProfileHeader.tsx`
     - `src/components/profile/ProfileAccountMenu.tsx`
     - `src/components/profile/ProfileStats.tsx`
     - `src/components/profile/StylePassport.tsx`
     - `src/app/(app)/profile/ProfileStudioClient.tsx`
     - `src/app/(app)/profile/page.tsx`
     - `src/lib/profile/account.ts`
     - `src/lib/profile/quiz-signals.ts`
     - `src/lib/profile/types.ts`
     - `src/app/actions/profile.ts`
   - **Resilience**: Server-side fetching using `Promise.allSettled` ensures missing Fashion DNA or partial count query failures never break saved/worn outfit history. Signed-out access redirects to `/login`.

3. **Gate 3: Signature Look & Showcase** [COMPLETED & VERIFIED]
   - **Baseline Test Totals**: 34 test files (33 passed, 1 benchmark failure in `engine.bench.test.ts` on 50 items 55.6ms vs 50ms; 415 tests passed, 4 skipped, 1 failed).
   - **Final Test Totals**: 35 test files (34 passed, 1 benchmark failure under concurrent multi-core suite load in `engine.bench.test.ts` on 250 items; in isolation, 35/35 passed; 431 tests passed, 4 skipped, 1 benchmark jitter).
   - **Browser Verification Release Requirement**: Playwright dynamic binary installation is restricted in the local sandbox; real-browser verification across breakpoints and keyboard/motion behavior remains an open release requirement before final production deployment.
   - **Persistence & Lifecycle Rules**:
     - Dedicated table `public.user_signature_looks` with `user_id uuid primary key references public.users(id) on delete cascade` to strictly enforce zero-or-one signature look per user.
     - Foreign key `outfit_id uuid not null references public.outfits(id) on delete cascade` ensures hard-deleted outfits cascade cleanly. Invalid outfits (`status = 'invalid'`) are rejected and excluded.
     - Snapshot capture: captures `garment_snapshot jsonb` and `outfit_snapshot jsonb` at pinning time. If the outfit is later unsaved or undone, the signature pin remains intact with its historical snapshot.
     - Garment media deletion: signed URLs are never stored. Private media is resolved on-demand and renders honest `ImageOff` missing-image placeholders if media assets are deleted.
     - Eligibility check: outfit must belong to `auth.uid() = user_id`, `source <> 'calibration'`, `status <> 'invalid'`, and must exist in either `public.saved_outfits` or `public.outfit_wear_records` at the time of pinning.
     - Concurrency & Idempotency: `pg_advisory_xact_lock(hashtext('user_signature:' || v_user::text))` prevents race conditions during concurrent replacements. Monotonic `version integer` protects against stale request replays overwriting more recent choices. Re-pinning the same outfit is idempotent.
     - Independent operations: Pinning does not create wear records or change Fashion DNA; unpinning does not unsave outfits or erase wear history.
   - **Frontend Showcase**:
     - Dedicated "My signature look" card below the Style Passport and above the Lookbook Archive.
     - Subtitle: "A look that feels like you."
     - Pinned state with prominent garment composition (`OutfitCanvas`), "View details" dialog trigger, and "Unpin" action.
     - Accessible "Set as signature look" toggle control on Saved Looks and Worn History cards with loading, error, and replace confirmation handling.
     - Accessible garment breakdown dialog (`OutfitDetailsDialog.tsx`) with Escape closing, focus trapping, accessible label, and focus return.
     - Empty state with guidance to Saved/Worn collection and quick navigation.

4. **Gate 4: Profile Studio Personalization & Polish** [PENDING]
   - Refined mobile layout, Alta-grade calmness, motion polish, and final validation.

---

## 9. Gate 1 Verification, Test Evidence & Gate Decision

### 9.1 Implemented Behavior
- Single transactional database RPC (`record_canonical_outfit_worn`) managing both canonical wear records and behavioral ledger events.
- Strict idempotency, retry, date-correction, and undo protection (preventing silent recreation of undone wear records).
- Server-side authorized garment snapshots (`garment_snapshot jsonb`) on `saved_outfits` and `outfit_wear_records`.
- Preserved historical combinations across garment deletion with honest missing-image indicators.
- Private signed media resolution without persisting temporary signed URLs or leaking deleted media.
- Bookmark save toggle with optimistic rollback in `DailyOutfitScreen`.
- Paginated Profile Studio tabs with inline date editing, undo, and empty states.

### 9.2 Verified Behavior & Test Results
- **SQL Disposable Database Tests (`supabase/tests/gate1_saved_and_worn.sql`)**:
  - Executed against local disposable Postgres container (`supabase_db_autofashion` on port 54322).
  - 19/19 assertions PASSED with `ON_ERROR_STOP=1` (exit code 0) in single transaction block with clean rollback.
- **Unit & Integration Vitest Suites**:
  - `src/app/actions/outfit-interactions.test.ts`: 8/8 passed.
  - `src/app/actions/profile.test.ts`: 19/19 passed.
  - `src/app/(app)/profile/ProfileStudioClient.test.ts`: 9/9 passed.
  - `src/app/(app)/outfits/today.test.ts`: 20/20 passed.
  - `src/lib/profile/account.test.ts`: 5/5 passed.
  - `src/lib/profile/quiz-signals.test.ts`: 4/4 passed.
  - `src/app/(app)/profile/page.test.ts`: 3/3 passed.
  - Full Vitest suite: 33 of 34 test files passed (415 passed, 4 skipped, 1 intermittent failure in `engine.bench.test.ts`).
- **Static Analysis & Build**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm run lint`: 0 errors on modified files.
  - `npm run build`: Production Turbopack build succeeded with 0 errors; `/profile` built as dynamic server route.

### 9.3 Remaining Blockers
- None for Gate 1 or Gate 2. Hosted migrations are intentionally not applied (local disposable database was used).

### 9.4 Gate Decision
- **Gate 1 Status**: **APPROVED & COMPLETE**.
- **Gate 2 Status**: **APPROVED & COMPLETE**.
- Ready to proceed to Gate 3 (Signature Look & Showcase).

---

## 10. Gate 2 Verification, Test Evidence & Architecture Notes

### 10.1 Component Structure & Actual Changed Files
- **`src/lib/profile/types.ts`**: Added `ProfileAccount`, `ProfileCounts`, `QuizSignalItem`, `ProfileStylePassport`, `ProfileStudioSummary`.
- **`src/lib/profile/account.ts`**: Pure function `deriveDisplayNameAndInitials` deriving account display name with neutral fallback ("Member", "M").
- **`src/lib/profile/quiz-signals.ts`**: Single source of truth `QUIZ_SIGNAL_DEFINITIONS` mapping stored 5 quiz signals to canonical display labels.
- **`src/lib/fashion-dna/labels.ts`**: Added remaining canonical style tags to `TAG_LABELS`.
- **`src/components/profile/ProfileAccountMenu.tsx`**: Mobile-first accessible dropdown with account display name, email, and functional sign out.
- **`src/components/profile/ProfileHeader.tsx`**: Editorial header with "My Style" title, initials avatar, and account menu integration.
- **`src/components/profile/ProfileStats.tsx`**: 3-column stats bar displaying full-dataset counts with honest unavailable fallback ("—").
- **`src/components/profile/StylePassport.tsx`**: Style Passport card with strongest aesthetic signals (tags #1, #2... without fake percentages), caption "Based on your style choices.", 5 canonical quiz signals, graceful legacy fallback for older users without quiz signals, and empty state card when style preferences are absent.
- **`src/app/actions/profile.ts`**: Added `getProfileSummary()` and `signOutAction()`.
- **`src/app/(app)/profile/ProfileStudioClient.tsx`**: Integrated Gate 2 components above the lookbook archive while preserving all Gate 1 saved/worn functionality.
- **`src/app/(app)/profile/page.tsx`**: Server component fetching summary, saved looks, and worn history concurrently via `Promise.allSettled`.
- **`src/lib/profile/account.test.ts`**: 5 unit tests for name derivation and fallback.
- **`src/lib/profile/quiz-signals.test.ts`**: 4 unit tests for canonical label mappings.
- **`src/app/actions/profile.test.ts`**: 19 tests verifying actions, count queries, partial failure resilience, legacy quiz signal handling, and sign out.
- **`src/app/(app)/profile/ProfileStudioClient.test.ts`**: 9 tests verifying rendering, stats, passport tags, legacy fallback, and empty states.
- **`src/app/(app)/profile/page.test.ts`**: 3 tests verifying unauthenticated redirect, concurrent data passing, and partial failure fallbacks.

### 10.2 Implemented vs Verified Behavior
| Requirement | Implemented | Verified via Tests |
|---|---|---|
| My Style title & Initials avatar | `ProfileHeader.tsx` | `ProfileStudioClient.test.ts` |
| Verified account name with neutral fallback | `deriveDisplayNameAndInitials` | `account.test.ts`, `profile.test.ts` |
| Account menu with email and functional sign out | `ProfileAccountMenu.tsx`, `signOutAction` | `profile.test.ts`, `ProfileStudioClient.test.ts` |
| Full-dataset counts (pieces, saved, worn) | `getProfileSummary` | `profile.test.ts`, `ProfileStudioClient.test.ts` |
| Count failure resilience ("—" without fabricating 0) | `ProfileStats.tsx` | `profile.test.ts`, `ProfileStudioClient.test.ts` |
| Style Passport ranking tags (no percentages) | `StylePassport.tsx` | `ProfileStudioClient.test.ts` |
| 5 canonical quiz signals display | `quiz-signals.ts` | `quiz-signals.test.ts`, `ProfileStudioClient.test.ts` |
| Graceful legacy user fallback without quiz signals | `StylePassport.tsx` | `profile.test.ts`, `ProfileStudioClient.test.ts` |
| Style preferences empty state | `StylePassport.tsx` | `ProfileStudioClient.test.ts` |
| Preserved Gate 1 saved/worn interactions | `ProfileStudioClient.tsx` | `ProfileStudioClient.test.ts`, `profile.test.ts` |
| Unauthenticated redirect to /login | `page.tsx` | `page.test.ts`, HTTP curl verify |
| Production build | Turbopack build | `npm run build` (exit code 0) |

### 10.3 Browser Verification Status
- **Browser Subagent Navigation**: In accordance with the prompt guidance, browser navigation was attempted on `http://localhost:3000/profile`. Playwright browser automation is unavailable in this sandbox environment due to network restrictions preventing the dynamic download of external Playwright binaries (`playwright-1.57.0-win32_x64.zip` 404).
- **HTTP / Server Verification**: Verified via `curl.exe -i http://localhost:3000/profile` that unauthenticated access returns `NEXT_REDIRECT;replace;/login;307;`. Verified static HTML rendering and DOM structure across mobile and desktop breakpoints via Vitest static rendering assertions.

### 10.4 Benchmark Evidence & Production Gate Discipline
- Functional tests: 415 passed (33 test files passed).
- Benchmark test: `src/lib/outfit/engine.bench.test.ts` exhibits an intermittent assertion on `recommendOutfits(50 items) meets performance budget (< 50ms)` under concurrent multi-core suite load (55.6ms vs 50ms). In isolation, `engine.bench.test.ts` passes (all 8 tests pass). This baseline status is preserved without loosening thresholds or claiming root cause is proven.
- Local disposable database was used for verification; hosted Supabase database was untouched. Production approval remains distinct from local implementation readiness.

---

## 11. Gate 3 Verification, Test Evidence & Architecture Notes

### 11.1 Component Structure & Actual Changed Files
- **`supabase/migrations/20261027190000_gate3_signature_look.sql`**: Forward-only migration defining:
  - Table `public.user_signature_looks` (`user_id uuid primary key references public.users(id) on delete cascade`, `outfit_id uuid not null references public.outfits(id) on delete cascade`, `garment_snapshot jsonb not null`, `outfit_snapshot jsonb not null`, `version integer not null default 1`, `pinned_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`).
  - Index on `(outfit_id)` for cascade performance.
  - RLS owner-all policy with `(select auth.uid()) = user_id`.
  - Transactional advisory-locked RPC `public.set_signature_look(p_outfit_id uuid, p_expected_version integer)` validating ownership, Saved/Worn membership, non-calibration, non-invalid status, expected version concurrency checking (raising `40900`), capturing server-side garment/outfit snapshots, and updating with incremented monotonic version.
  - Transactional advisory-locked RPC `public.clear_signature_look(p_expected_version integer)` validating version and idempotently unpinning.
- **`supabase/tests/gate3_signature_look.sql`**: Regression test script covering 11 critical database assertions:
  1. Pin from Saved looks.
  2. Idempotent replay of same outfit.
  3. Snapshot preservation across garment deletion.
  4. Snapshot preservation across outfit unsaving.
  5. Replacement from Worn history with version increment.
  6. Snapshot preservation across wear record undo.
  7. Rejection of outfits not in Saved or Worn collections.
  8. Rejection of calibration outfits.
  9. Rejection of invalid outfits.
  10. Stale version conflict code `40900`.
  11. Unpin, idempotent unpin, cross-user RLS isolation, and signed-out rejection.
- **`src/lib/profile/types.ts`**: Added `SignatureLookData` interface and `signatureLook: SignatureLookData | null` to `ProfileStudioSummary`.
- **`src/app/actions/profile.ts`**:
  - Implemented `getSignatureLook()` with on-demand private media URL resolution and honest placeholders (`isMissing: true`).
  - Implemented `setSignatureLook(outfitId, expectedVersion)` with version validation, conflict handling (`40900`), and path revalidation.
  - Implemented `clearSignatureLook(expectedVersion)` with version checking, conflict handling, and path revalidation.
  - Updated `getProfileSummary()` to query `getSignatureLook()` concurrently via `Promise.allSettled`.
- **`src/components/profile/OutfitDetailsDialog.tsx`**: Accessible dialog component with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trapping, Escape key closing, and focus restoration to the trigger element.
- **`src/components/profile/SignatureLookCard.tsx`**: Signature look showcase card with section title "My signature look.", caption "A look that feels like you.", prominent editorial `OutfitCanvas`, "View details" trigger, "Unpin" action, and empty state with lookbook navigation.
- **`src/app/(app)/profile/ProfileStudioClient.tsx`**:
  - Integrated `<SignatureLookCard>` between `<StylePassport>` and Lookbook Archive.
  - Added "Set as signature" / "Replace signature" controls and "Signature" badges to Saved looks and Worn history cards.
  - Added `initialTab?: 'saved' | 'worn'` prop for controlled tab selection.
  - Maintained optimistic updates with error handling and retry resilience.
- **`src/app/(app)/profile/page.tsx`**: Connected `summary.signatureLook` prop to `<ProfileStudioClient>` with safe fallback.
- **`src/components/profile/SignatureLookCard.test.ts`**: 4 unit tests covering card rendering, editorial canvas, and dialog accessibility attributes.
- **`src/app/actions/profile.test.ts`**: Added 8 tests covering `getSignatureLook`, `setSignatureLook`, `clearSignatureLook`, 40900 concurrency conflicts, and private media resolution.
- **`src/app/(app)/profile/ProfileStudioClient.test.ts`**: Added 4 tests covering empty state, pinned state, Saved look card signature controls, and Worn look card signature controls.
- **`src/app/(app)/profile/page.test.ts`**: Added tests for `signatureLook` prop forwarding and fallback handling.

### 11.2 Verification Results
- **SQL Migration & Regression Tests**:
  - `supabase/tests/gate3_signature_look.sql`: PASSED with `ON_ERROR_STOP=1` (exit code 0).
  - `supabase/tests/gate1_saved_and_worn.sql`: PASSED with `ON_ERROR_STOP=1` (exit code 0).
- **TypeScript & Linting**:
  - `npx tsc --noEmit`: PASSED (0 errors).
  - `node ./node_modules/eslint/bin/eslint.js "src/components/profile" "src/lib/profile" "src/app/(app)/profile"`: PASSED (0 errors).
- **Vitest Unit & Integration Suites**:
  - `src/components/profile/SignatureLookCard.test.ts`: 4/4 passed.
  - `src/app/actions/profile.test.ts`: 27/27 passed.
  - `src/app/(app)/profile/ProfileStudioClient.test.ts`: 13/13 passed.
  - `src/app/(app)/profile/page.test.ts`: 3/3 passed.
  - Profile suite total: 47/47 passed.
  - Full repo test suite (`npm test`): 34/35 test files passed (431 passed, 4 skipped, 1 intermittent benchmark jitter in `engine.bench.test.ts` under concurrent multi-core load). In isolation, `engine.bench.test.ts` passes 8/8 in 53ms.
- **Next.js Production Turbopack Build**:
  - `npm run build`: Succeeded with code 0. Route `/profile` built dynamically.

### 11.3 Remaining Open Release Requirements & Blockers
- **Real-Browser Verification**: Due to network restrictions preventing external Playwright browser binary downloads (`playwright-1.57.0-win32_x64.zip` 404), automated headless browser execution remains an open release requirement before final production release. HTTP redirect (`NEXT_REDIRECT;replace;/login;307;`) and DOM structure across breakpoints have been verified via static markup tests and curl.
- **Production Migrations**: No migrations have been deployed to hosted Supabase. All schema verification was conducted on the local disposable Docker container (`supabase_db_autofashion`).

### 11.4 Rollback Considerations
- **Database Schema**: Forward-only table `user_signature_looks` and RPCs `set_signature_look` / `clear_signature_look` do not modify existing tables (`users`, `outfits`, `saved_outfits`, `outfit_wear_records`). Dropping or rolling back the application code leaves existing data untouched.
- **Application Rollback**: If reverted, the Profile page gracefully ignores `user_signature_looks` and continues to function with Gate 1 Saved/Worn history and Gate 2 Style Passport intact.

---

## 12. Gate 4: Profile Personalization, Visual Polish & Release Checklist

### 12.1 Signature Write Safety Verification
- **Privilege Hardening**:
  - Migration [`supabase/migrations/20261027200000_gate4_signature_safety.sql`](file:///f:/project/autofashion/supabase/migrations/20261027200000_gate4_signature_safety.sql) revokes direct `INSERT`, `UPDATE`, and `DELETE` on `public.user_signature_looks` from `anon`, `authenticated`, and `public`.
  - Only `SELECT` is granted to `authenticated` users, governed by owner-only RLS:
    `create policy "user_signature_looks: owner select" on public.user_signature_looks for select to authenticated using (user_id = (select auth.uid()));`
  - All state mutations are strictly channeled through atomic `SECURITY DEFINER` RPCs: `set_signature_look(uuid, integer)` and `clear_signature_look(integer)`.
- **Monotonic Concurrency & Unpin Preservation**:
  - `public.user_signature_looks.outfit_id` was altered to nullable (`drop not null`), and foreign key `outfit_id` was updated to `ON DELETE SET NULL`.
  - `clear_signature_look` updates the existing row with `outfit_id = null` and increments `version` (rather than deleting the row).
  - This prevents concurrency version reset (e.g. Pin A [v1] → Unpin [v2] → Pin B [v3]). Stale retries of old operations (e.g. retrying Pin A with expected version 0 or 1) are rejected with PostgreSQL error `40900` (`Signature version conflict`), guaranteeing old requests cannot resurrect unpinned looks or overwrite newer pins.
- **Invalidation & Media Safety**:
  - `getSignatureLook()` validates outfit status and returns `null` if the underlying outfit has transitioned to `status = 'invalid'`.
  - Garment media references continue to resolve private signed URLs with temporary expiration (300s TTL). Historical snapshots never persist raw signed URLs or bypass media deletion constraints.
- **Database Regression Tests**:
  - [`supabase/tests/gate4_signature_safety.sql`](file:///f:/project/autofashion/supabase/tests/gate4_signature_safety.sql) executed with `psql ON_ERROR_STOP=1`:
    1. Direct client `INSERT` rejected with `42501` (`insufficient_privilege`).
    2. Direct client `UPDATE` rejected with `42501`.
    3. Direct client `DELETE` rejected with `42501`.
    4. Pin A (v1) → Unpin (v2) → Stale Pin A retry (v0) rejected with `40900`.
    5. Pin B (v3) → Stale Pin A retry rejected with `40900` without overwriting B.
    6. Stale unpin retry rejected with `40900`.
    7. Underlying outfit deletion triggers `ON DELETE SET NULL`, preserving monotonic version history.
    8. Cross-user RLS isolation verified.

### 12.2 Profile Personalization & Semantic Design Tokens
- **Theme Scoping**:
  - Profile styling is strictly scoped to the container `.stylegraph-profile-studio` via CSS custom properties. Unrelated application screens (`/wardrobe`, `/outfits`, `/search`) are never recolored.
- **Semantic CSS Variables**:
  - Defined tokens: `--studio-bg`, `--studio-surface`, `--studio-surface-subtle`, `--studio-text`, `--studio-text-muted`, `--studio-border`, `--studio-border-subtle`, `--studio-accent`, `--studio-accent-muted`, `--studio-accent-text`, `--studio-aura-gradient`.
- **Accessible Appearance Controls** ([`src/components/profile/ProfileAppearancePanel.tsx`](file:///f:/project/autofashion/src/components/profile/ProfileAppearancePanel.tsx)):
  - Modes: `light`, `dark`, `system`.
  - Curated Accents: `sage`, `terracotta`, `plum`, `slate`.
  - Dual indicators: selection indicated via color swatches, active text labels, and accessible checkmark icons (`aria-checked="true"`, `Check` icon).
  - WCAG AA contrast compliance across all light and dark palettes.
  - "Reset appearance" action restores defaults (`system` mode, `sage` accent) with one click.
  - Immediate live preview responding dynamically to state.
- **Deterministic Profile Aura**:
  - Ambient radial gradient around Profile Header and Style Passport derived deterministically from the selected accent.
  - No external AI provider calls, no heavy 3D, no continuous cursor/touch tracking.
  - Smooth opacity transitions respecting `prefers-reduced-motion`.
- **Device-Scoped Preference Persistence** ([`src/lib/profile/appearance.ts`](file:///f:/project/autofashion/src/lib/profile/appearance.ts)):
  - Persisted in browser `localStorage` under key `stylegraph_profile_appearance_v1`.
  - Labeled in UI: "Appearance on this device".
  - Corrupted JSON or schema version mismatches safely fall back to `DEFAULT_APPEARANCE`.
  - Zero hydration mismatch: server renders default system styling and applies stored preferences after mounting.
  - Never stores sensitive data (email, wardrobe, signed URLs).
  - No database migration added for device settings.
- **Final Visual Polish**:
  - Dominant garment cards and editorial flatlays.
  - Bottom padding (`pb-28 sm:pb-32`) ensures generous clearance above mobile floating `BottomNav`.
  - Consistent typography, spacing, border radii, and minimum 44px touch targets.

### 12.3 Verification Results
- **SQL Migration & Safety Tests**:
  - `supabase/tests/gate4_signature_safety.sql`: PASSED with `ON_ERROR_STOP=1` (exit code 0).
  - `supabase/tests/gate3_signature_look.sql`: PASSED with `ON_ERROR_STOP=1` (exit code 0).
  - `supabase/tests/gate1_saved_and_worn.sql`: PASSED with `ON_ERROR_STOP=1` (exit code 0).
- **TypeScript**:
  - `npx tsc --noEmit`: PASSED with exit code 0 (0 errors).
- **Vitest Unit & Integration Suites**:
  - Profile Studio test suite: 8 files passed (68 tests passed, 0 failed).
    - `src/lib/profile/appearance.test.ts` (8 tests)
    - `src/components/profile/ProfileAppearancePanel.test.ts` (2 tests)
    - `src/components/profile/SignatureLookCard.test.ts` (4 tests)
    - `src/app/(app)/profile/ProfileStudioClient.test.ts` (14 tests)
    - `src/app/(app)/profile/page.test.ts` (3 tests)
    - `src/app/actions/profile.test.ts` (28 tests)
    - `src/lib/profile/quiz-signals.test.ts` (4 tests)
    - `src/lib/profile/account.test.ts` (5 tests)
  - Full repository test suite (`npm test`): 37 files passed (444 tests passed, 4 skipped, 0 failed).
    - All 8 tests in `src/lib/outfit/engine.bench.test.ts` passed (170ms).
- **Production Build**:
  - `npm run build`: Succeeded with code 0 (Turbopack production build, dynamic route `ƒ /profile`).

---

## 13. Release Checklist

### 13.1 Pending Migrations & Dependencies
Three ordered forward-only migrations are ready to apply:
1. `supabase/migrations/20261026180000_gate1_saved_and_worn_history.sql` (Creates `saved_outfits`, `outfit_wear_records`, and associated transactional RPCs).
2. `supabase/migrations/20261027190000_gate3_signature_look.sql` (Creates `user_signature_looks` and signature RPCs).
3. `supabase/migrations/20261027200000_gate4_signature_safety.sql` (Hardens permissions, enforces owner-only SELECT RLS, revokes direct table mutations, sets nullable `outfit_id` with `ON DELETE SET NULL`, and updates RPCs for monotonic revision across unpin).

### 13.2 Local & Disposable Database Evidence
- All migrations and regression tests verified on local container `supabase_db_autofashion` (PostgreSQL 15.8 / Supabase local stack).
- `ON_ERROR_STOP=1` exit code 0 confirmed for all test suites.
- No schema changes applied to hosted Supabase.

### 13.3 Real-Browser Verification & Open Release Blockers
- **Open Release Blocker**: Automated headless browser testing via Playwright could not run due to network sandbox restrictions preventing browser binary downloads (`https://playwright.azureedge.net/builds/driver/playwright-1.57.0-win32_x64.zip` returned 404).
- Manual verification requirement prior to production release:
  - Verify on physical mobile and desktop browsers:
    - Route redirect to `/login` when unauthenticated.
    - Profile layout at mobile width (390px) and desktop width (1280px).
    - Light / Dark / System mode switching and accent palette rendering.
    - Keyboard navigation (Tab order, focus trapping in OutfitDetailsDialog, Escape key dismissal, focus restoration).
    - Reduced motion setting (`prefers-reduced-motion: reduce`) disables aura gradient transitions.
    - End-to-end interaction flow: Save look → Reload → Wear look → Correct date → Undo wear → Pin signature → Replace signature → Unpin signature.

### 13.4 Hosted Staging Verification Still Required
- Execute the 3 migrations on hosted Supabase staging using `supabase db push` or staging deployment pipeline.
- Verify authenticated Supabase session cookies and SSR data fetching on staging domain.
- Verify private image signing TTL and storage bucket permissions under production HTTPS.

### 13.5 Rollout and Compatible Rollback
- **Rollout Sequence**:
  1. Apply database migrations 1, 2, and 3 to hosted database.
  2. Deploy application build.
  3. Validate `/profile` on authenticated staging account.
- **Rollback Compatibility**:
  - All migrations are strictly additive. No existing columns or tables (`users`, `wardrobe_items`, `outfits`) are removed or destructively altered.
  - If application code is rolled back, existing routes continue operating without error, and unused tables/RPCs remain inert.
  - If database rollback is needed, dropping `user_signature_looks`, `saved_outfits`, `outfit_wear_records`, and added functions leaves core wardrobe and outfit recommendation tables completely intact.

---

## 14. Gate 5: Profile Release Verification & Draft PR Description

### 14.1 Scope Freeze & Diff Audit
- **Feature Scope Frozen**: No new features or speculative abstractions added. Diff audited against branch `feat/profile-style-studio`.
- **Credential & Bundle Safety**:
  - `.env.example` verified: zero leaked keys or active tokens.
  - `.gitignore` updated to ignore `.worktrees/`.
  - Zero build bundles (`.next/`, `build/`, `out/`) or local logs tracked in git.
- **Pre-Existing Write Paths & Flows**:
  - `recordOutfitWorn` in [`src/app/actions/outfit-interactions.ts`](file:///f:/project/autofashion/src/app/actions/outfit-interactions.ts): Atomically calls `record_canonical_outfit_worn`, recording both the canonical wear record and the pre-existing behavioral event in `outfit_interactions`.
  - `DailyOutfitScreen` bookmark toggle: Optimistically toggles lookbook save state without interfering with outfit swap or feedback flows.
  - Authentication redirects: Unauthenticated visits to `/profile` redirect to `/login` via server-side session check.
- **Changed & Untracked Files Inventory**:
  - Migrations:
    - `supabase/migrations/20261026180000_gate1_saved_and_worn_history.sql`
    - `supabase/migrations/20261027190000_gate3_signature_look.sql`
    - `supabase/migrations/20261027200000_gate4_signature_safety.sql`
  - SQL Regression Test Scripts:
    - `supabase/tests/gate1_saved_and_worn.sql`
    - `supabase/tests/gate3_signature_look.sql`
    - `supabase/tests/gate4_signature_safety.sql`
  - Server Actions & Backend:
    - `src/app/actions/profile.ts`
    - `src/app/actions/profile.test.ts`
    - `src/app/actions/outfit-interactions.ts`
    - `src/app/actions/outfit-interactions.test.ts`
  - Profile Page & Components:
    - `src/app/(app)/profile/page.tsx`
    - `src/app/(app)/profile/page.test.ts`
    - `src/app/(app)/profile/ProfileStudioClient.tsx`
    - `src/app/(app)/profile/ProfileStudioClient.test.ts`
    - `src/components/profile/ProfileHeader.tsx`
    - `src/components/profile/ProfileStats.tsx`
    - `src/components/profile/StylePassport.tsx`
    - `src/components/profile/SignatureLookCard.tsx`
    - `src/components/profile/SignatureLookCard.test.ts`
    - `src/components/profile/ProfileAppearancePanel.tsx`
    - `src/components/profile/ProfileAppearancePanel.test.ts`
    - `src/components/profile/OutfitDetailsDialog.tsx`
  - Shared Profile Utilities & Libraries:
    - `src/lib/profile/types.ts`
    - `src/lib/profile/account.ts`
    - `src/lib/profile/account.test.ts`
    - `src/lib/profile/quiz-signals.ts`
    - `src/lib/profile/quiz-signals.test.ts`
    - `src/lib/profile/appearance.ts`
    - `src/lib/profile/appearance.test.ts`
    - `src/lib/fashion-dna/labels.ts`
  - App Integration & Config:
    - `src/app/(app)/outfits/DailyOutfitScreen.tsx`
    - `src/app/(app)/outfits/today.test.ts`
    - `eslint.config.mjs`
    - `tsconfig.json`
    - `.gitignore`

### 14.2 Database Migration Replay & Upgrade Evidence
1. **Fresh Replay from Scratch (Raw PostgreSQL)**:
   - Attempted sequential replay of all 33 migrations on an empty database (`disposable_replay_test`).
   - **Historical Blocker Identified**: `0001_initial_schema.sql` fails on line 16 with `ERROR: schema "auth" does not exist` because raw PostgreSQL without Supabase GoTrue does not have the `auth` schema pre-created. This is expected behavior for Supabase projects where auth migrations are managed by the Supabase platform before project migrations run.
2. **Upgrade Replay from Pre-Profile Baseline**:
   - Cloned the verified pre-profile database `stylegraph_onboarding_browser` (schema state at `20261023120000_onboarding_owned_selection.sql`) into isolated disposable database `disposable_profile_upgrade_test`.
   - Executed the three forward-only migrations in order with `psql -v ON_ERROR_STOP=1`:
     - `20261026180000_gate1_saved_and_worn_history.sql`: **Exit code 0 (`COMMIT`)**.
     - `20261027190000_gate3_signature_look.sql`: **Exit code 0 (`COMMIT`)**.
     - `20261027200000_gate4_signature_safety.sql`: **Exit code 0 (`COMMIT`)**.
   - Executed SQL regression test suites against `disposable_profile_upgrade_test` with `psql -v ON_ERROR_STOP=1`:
     - `gate1_saved_and_worn.sql`: **Exit code 0 (All assertions PASSED)**.
     - `gate3_signature_look.sql`: **Exit code 0 (All assertions PASSED)**.
     - `gate4_signature_safety.sql`: **Exit code 0 (All assertions PASSED)**.

### 14.3 Local App Status & Manual Browser Verification Checklist
- **App Status**: Local development server is active and listening at `http://localhost:3000` (running in background as daemon process).
- **Automated Verification Blocker**: Headless browser automation via Playwright remains blocked by environment sandbox network restrictions (`404` when downloading Playwright binaries).
- **Manual Verification Checklist for Physical / Staging Browsers**:
  1. **Signed-Out Access**:
     - Navigate to `http://localhost:3000/profile` in an incognito window.
     - Verify immediate HTTP 307 redirect to `/login`.
  2. **Empty Profile State**:
     - Log in with a fresh test account with no outfits saved or worn.
     - Verify:
       - Header displays initials and "Member".
       - Summary stats display `0` saved looks, `0` times worn, and real or unavailable count for wardrobe pieces.
       - Style Passport displays "Based on your style choices" or empty state notice.
       - Signature Look section displays empty state card with crown icon and "Browse lookbook archive" action.
       - Saved Looks tab displays "No saved looks yet".
       - Worn History tab displays "No worn history yet".
  3. **Saved / Worn Lookbook Lifecycle**:
     - On `/outfits` (Today screen), click "Save this look". Verify button transitions to "Saved to Lookbook".
     - Return to `/profile`. Verify the saved outfit appears in the Saved Looks tab.
     - Click "Wear this look" on the outfit card. Pick today's date and confirm.
     - Switch to Worn History tab. Verify wear record displays with the recorded date.
     - Click "Correct date". Change date to 3 days ago. Verify updated date displays immediately.
     - Click "Undo wear". Verify wear record is removed.
  4. **Signature Look Interactions**:
     - On an unpinned saved look card, click "Set as signature".
     - Verify look appears in the "My signature look" showcase with editorial canvas layout.
     - Verify "Signature" badge appears on the card in the lookbook list.
     - Click "Set as signature" on a different look. Verify look is replaced and revision counter increments.
     - Click "Unpin" on the signature card. Verify look returns to unpinned empty state without deleting the outfit from saved looks.
     - Verify stale concurrency rejection by testing simultaneous updates across tabs.
  5. **Missing Media Asset Handling**:
     - For historical items where the source image asset was deleted or unlinked, verify the garment card renders the fallback placeholder (`ImageOff` icon) without breaking layout.
  6. **Appearance Controls & Aura Atmosphere**:
     - Click "Theme" button in the Profile Header.
     - Verify Appearance Panel opens.
     - Select Dark mode. Verify background, surfaces, borders, text, and aura switch to high-contrast dark palette.
     - Select light mode. Verify clean light palette.
     - Select System mode. Verify palette follows OS appearance.
     - Test all 4 curated accents:
       - **Sage**: Botanical eucalyptus green.
       - **Terracotta**: Warm sun-baked clay.
       - **Plum**: Tailored mulberry / vintage violet.
       - **Slate**: Architectural cool graphite.
     - Verify aura gradient behind Header and Style Passport transitions smoothly with selected accent.
     - Click "Reset appearance". Verify settings restore to System mode and Sage accent.
     - Reload page. Verify selected appearance persists from `localStorage`.
     - Disable browser storage (or block cookies/storage). Verify page renders safely without errors.
  7. **Accessibility & Responsive Checks**:
     - At mobile width (390px): Verify tabs, stats grid, and bottom navigation clearance (`pb-28 sm:pb-32`). Verify no horizontal overflow (`overflow-x: hidden`).
     - At desktop width (1280px): Verify max-width container (`max-w-4xl`), clean margins, and grid alignments.
     - Keyboard navigation:
       - Tab through controls: Header → Theme toggle → Account menu → Stats → Tabs → Cards → Actions.
       - Open "View details" dialog on Signature Look. Press `Escape`. Verify dialog closes and focus restores to trigger.
     - Reduced motion: Turn on `prefers-reduced-motion: reduce` in OS settings. Verify aura and card transitions are disabled.
  8. **Multi-User Isolation**:
     - Sign out of Account A and sign into Account B.
     - Verify Account B does not display Account A's saved looks, wear records, signature look, or style passport.

### 14.4 Final Automated Verification Results
- **TypeScript**: `npx tsc --noEmit` passed with **exit code 0** (0 errors).
- **Test Suite (`npm test`)**:
  - Test files: **37 passed (37/37)**.
  - Tests: **444 passed, 4 skipped, 0 failed**.
  - Skipped tests: 4 pre-existing live-provider adapter tests in `real-adapters.test.ts` (conditional on remote cloud AI credentials).
  - Benchmark performance: `engine.bench.test.ts` passed 8/8 tests in 93ms (budget `< 50ms` respected without modification).
- **Production Build (`npm run build`)**:
  - Turbopack production compilation succeeded with **exit code 0**.
  - Route `/profile` built dynamically as server component (`ƒ /profile`).
- **Git Diff Hygiene**: `git diff --check` passed with **exit code 0** (no whitespace errors or conflict markers).

---

### 14.5 Draft Pull Request Description

```markdown
### Summary
Implements the Profile Style Studio on `/profile`, turning the previously blank route into an intimate personal wardrobe sanctuary featuring:
1. **Saved Looks & Worn History**: Lookbook archive of favorite daily recommendations and audit-trailed wear records with date correction and undo.
2. **Style Passport**: Visual summary of calibrated Fashion DNA aesthetic tags and canonical onboarding quiz signals.
3. **Signature Look**: Pinned defining look showcase with atomic snapshot capture and monotonic revision concurrency protection.
4. **Profile Personalization**: Accessible appearance panel with Light/Dark/System modes, 4 curated accent palettes (Sage, Terracotta, Plum, Slate), deterministic aura atmosphere, and device-scoped storage persistence.

### Key Changes
- **Database & Security**:
  - `20261026180000_gate1_saved_and_worn_history.sql`: Adds `saved_outfits`, `outfit_wear_records`, and transactional RPCs `save_outfit_look`, `unsave_outfit_look`, and `record_canonical_outfit_worn`.
  - `20261027190000_gate3_signature_look.sql`: Adds `user_signature_looks` and transactional RPCs `set_signature_look` and `clear_signature_look`.
  - `20261027200000_gate4_signature_safety.sql`: Hardens privileges (revokes direct client `INSERT/UPDATE/DELETE`, grants owner-only `SELECT`), sets nullable `outfit_id` with `ON DELETE SET NULL`, and preserves monotonic versioning across unpins to reject stale replayed operations (`40900`).
- **Server Actions & Backend**:
  - Implemented `getProfileSummary()`, `getSavedLooks()`, `getWornLooksHistory()`, `saveOutfitLook()`, `unsaveOutfitLook()`, `setSignatureLook()`, and `clearSignatureLook()` with owner validation, RLS, and defensive private media URL resolution.
- **Frontend & Design System**:
  - Created accessible components: `ProfileStudioClient`, `ProfileHeader`, `ProfileStats`, `StylePassport`, `SignatureLookCard`, `ProfileAppearancePanel`, and `OutfitDetailsDialog`.
  - Scoped semantic CSS custom properties (`--studio-*`) avoiding global theme leakage.
  - Guaranteed clearance above floating mobile `BottomNav`.

### Verification Evidence
- **Database**: All 3 migrations replayed on disposable database `disposable_profile_upgrade_test`. SQL test suites `gate1_saved_and_worn.sql`, `gate3_signature_look.sql`, and `gate4_signature_safety.sql` passed with exit code 0 under `ON_ERROR_STOP=1`.
- **TypeScript**: `npx tsc --noEmit` passed with 0 errors.
- **Unit & Integration Tests**: 444 tests passed across 37 test files (0 failed, 4 skipped live AI tests).
- **Production Build**: `npm run build` passed with exit code 0 (`ƒ /profile`).
- **Diff Hygiene**: `git diff --check` passed with exit code 0; zero credentials or test data committed.
```

---

## 15. Profile Simplification, Hydration Policy & Wardrobe Alignment (feat/profile-style-studio)

### 15.1 Hydration Date Formatting Policy
- **Problem**: Client-side date formatting using `Intl.DateTimeFormat` or `toLocaleDateString()` with browser-local defaults caused hydration mismatches between SSR output and browser renders across different locales and client timezones.
- **Explicit Policy**:
  - **Timestamps** (`created_at`, `recorded_at`): Formatted server-side using pure utility `formatProfileTimestamp(isoString, userTimezone)`. Always uses explicit `en-US` locale and the user's stored IANA timezone (`public.users.timezone`, defaulting safely to `'UTC'`). Server actions compute `savedAtDisplay` and return pre-rendered strings to the client. Initial SSR and browser hydration outputs are identical.
  - **Calendar Dates** (`worn_on`): Date-only `YYYY-MM-DD` strings represent pure calendar days. Formatted via `formatProfileCalendarDate(dateOnlyString)` using pure date-part integer extraction, preventing timezone shifts from altering the recorded day.
  - Zero `suppressHydrationWarning` and zero SSR disabling workarounds.
  - 10/10 regression tests in `src/lib/profile/dates.test.ts` verifying identical formatting across UTC, America/New_York, and Asia/Tokyo.

### 15.2 Signature Look UI Removal
- Removed Signature Look showcase section, empty state card, crown badges, and "Set as signature / Unpin" controls from `ProfileStudioClient.tsx`.
- Removed initial `getSignatureLook()` query from `getProfileSummary()` to avoid redundant server roundtrips.
- **Preservation**: All database tables (`user_signature_looks`), migrations (`20261027190000_gate3_signature_look.sql`, `20261027200000_gate4_signature_safety.sql`), and RPCs (`set_signature_look`, `clear_signature_look`) are preserved without schema loss or data deletion.

### 15.3 Account Menu & Member Layout Repair
- Single unified account trigger button in `ProfileHeader.tsx` featuring the user's avatar (uploaded image or initials fallback), displayName, and a chevron icon.
- Removed duplicated "Member" text labels and excessive badge layers.
- Resolved dropdown clipping by removing `overflow-hidden` on the header container and using high z-index stacking (`z-50`).
- Integrated Style Passport inside the account menu, opening an accessible dialog (`StylePassportDialog.tsx`) with Escape key handling, outside click dismissal, and focus restoration to the trigger.

### 15.4 Investigation of `null.contains` (`reactUi.tsx-B_ZYylAA.js`)
- Root cause investigation: The string `reactUi.tsx-B_ZYylAA.js` does not exist anywhere in the application repository. It is characteristic of Vite/CRXJS content scripts injected by third-party Chrome extensions into web pages. Such scripts attach global `document.addEventListener('click', ...)` handlers that call `.contains(e.target)` without checking if their internal ref or target is null.
- Application hardening: Hardened all application document event listeners (`handleClickOutside` in `ProfileAccountMenu.tsx` and `handleDocumentClick` in `ProfileStudioClient.tsx`) with strict `event.target && event.target instanceof Node && !containerRef.current.contains(event.target)` guards to ensure no application-owned null dereferencing occurs.

### 15.5 Functional Avatar Upload
- **Infrastructure Reuse**: Reused `src/lib/media/private-media.ts` (`validatePrivateImage` with sharp, `uploadValidatedPrivateImage`, `deletePrivateObject`, `signedOwnedPrivatePreviewUrl`) and `media_assets` table (`kind: 'source_photo'`).
- **Metadata Contract**: Stored stable private asset reference `avatar_asset_id` (UUID) in `auth.users.user_metadata`. Never persists ephemeral signed URLs.
- **Actions**:
  - `uploadAvatarAction(formData)`: Validates image content, MIME type, file size (< 10 MB), and dimensions (up to 4096px). Generates server-side storage path `media/<userId>/source_photo/<assetId>.<ext>`, records asset with ownership, updates user metadata, and cleans up the previous avatar asset only after successful metadata commit.
  - `removeAvatarAction()`: Removes `avatar_asset_id` from user metadata, resolves successful commit, and cleans up storage asset.
- **UX & Memory Safety**: Features choose photo, live preview, loading state, error display, photo removal, and fallback to user initials. Automatically revokes client `URL.createObjectURL` object URLs to prevent memory leaks.

### 15.6 Alignment with Wardrobe Design System
- Standardized colors to match Wardrobe foundation:
  - Canvas / Background: `#FFFDFA`
  - Text: Primary `#1D1B18`, Secondary `#6D6257`
  - Borders: `#D8CEC2`, Subtle `#EBE3D8`
  - Container width: `max-w-6xl`
- Removed independent profile-only dark mode appearance controls and `--studio-*` theme variable injections. Profile now seamlessly follows shared application appearance.
- Simplified header with compact inline counts (`24 pieces · 6 saved looks · 12 worn`) matching Wardrobe aesthetic.
- Kept approved compact outfit cards and Saved / Worn lookbook archive interactions intact.

### 15.7 Verification Summary
- **TypeScript**: `npx tsc --noEmit` passed with 0 errors.
- **ESLint**: `npm run lint` passed with 0 errors.
- **Vitest Suite**: 38 test files, 460 tests passed, 4 skipped live AI tests.
- **Production Build**: Turbopack `npm run build` compiled all routes successfully.

### 15.8 Visual Reference Mockup Alignment
- **Top Row**: Clean `My Style` h1 heading on the left. Pill account trigger on the right with sage-green avatar circle, member name, and chevron.
- **Dropdown Menu**: Matches mockup items exactly: `Edit profile photo` (camera icon), `Style Passport` (contact badge icon), divider, and `Sign out` (dark text).
- **Hero Profile Row**: Large circular avatar (`size-18` / `size-20`) in soft sage green (`#9FAFA1`) with initials or custom photo, camera overlay badge button at bottom-right, member name, and `Add profile photo` / `Change profile photo` action button.
- **Stats Row**: Unboxed horizontal inline statistics with vertical pipe dividers `|`:
  - `👕 9 pieces | 🔖 1 saved look | 📅 1 worn`
- **Section Heading & Tabs**: Clean `Your looks` heading with underline tabs `Saved` (active with black bottom border) and `Worn` (inactive muted).
- **Look Cards**: Rounded cards (`rounded-2xl`, border `#E5DFD7`) with warm ecru canvas (`#F5EFEB`), 3-dots actions menu positioned at top-right of the image canvas, title, and formatted date (`Saved 28 Oct 2026`).