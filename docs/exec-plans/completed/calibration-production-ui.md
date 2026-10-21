# Problem

The calibration flow works semantically, but local Supabase images are blocked by Next.js private-IP protection and the current fixed-position canvas degrades into large blank cards when media fails. The page hierarchy also lets secondary Fashion DNA information compete with the preference decision.

# User Value

Users can judge each complete look quickly, submit one clear preference, and see reassuring evidence that StyleGraph is learning without encountering broken media or navigation overlap.

# Current Repository State

Calibration already owns the three-response state machine and optimistic Fashion DNA updates. `OutfitCanvas` is presentation-only, `FlatLay` renders role-based absolute zones, and the app layout supplies a fixed bottom navigation. Tailwind CSS 4 and shadcn/ui are installed.

# Product Scope

Frontend presentation and safe Next.js image delivery only. Curated pieces remain style seeds; owned-wardrobe semantics, calibration RPCs, recommendation logic, persistence, and routing remain unchanged.

# Proposed Architecture

- A pure shared media-policy module builds strict Next.js image configuration and classifies assets that should bypass optimization.
- `FlatLay` remains responsible for composition and delegates resilient image loading/fallback rendering to a local presentation component.
- `OutfitCanvas` remains a presentation shell.
- `OutfitCalibrationScreen` remains the interaction/state-machine owner.
- `FashionDnaPanel` remains presentation-only and exposes only the strongest human-readable signals.

# Data Flow

Server-provided calibration outfit → role-aware `FlatLay` → explicit preference action → existing calibration server action → Fashion DNA/result update → next look or completion.

# API Contracts

No request, response, enum, lifecycle, or server-action contract changes.

# Database Changes

None.

# Failure Modes

- Image loading: neutral skeleton.
- Image failure/missing URL: stable garment placeholder with name and role.
- Route loading: composition-shaped skeleton.
- Route error: generic retry UI.
- Submission error: current outfit remains visible and retryable.

# Security

Private-IP image optimization is enabled only for development when the configured Supabase hostname is explicitly localhost or `127.0.0.1`. Production retains exact protocol, hostname, port, bucket, and path matching. Signed private media stays unoptimized.

# Observability

No new user data or URL logging. Existing server-side action observability remains unchanged.

# Implementation Gates

1. Image policy and fallback rendering.
2. Editorial one-piece/separates composition.
3. Responsive calibration hierarchy and resilient async states.
4. Focused tests and TypeScript validation.

# Tests

Cover one-piece, separates, accessories, missing media, local image policy, calibration actions/absence of behavior actions, all progress labels, loading/error states, secondary DNA placement, and responsive/safe-area markup. Run focused Vitest suites, then `npx tsc --noEmit`.

# Rollback

Revert the presentation components, route state files, media-policy module, and `next.config.ts` import. No durable data rollback is required.

# Validation Metric

Calibration image success/fallback rate, completion rate, and preference submission error rate; qualitative verification at 375, 430, 768, 1024, 1280, and 1440 px.

# Completion Evidence

- Focused calibration/image/presentation tests passed.
- Full Vitest suite passed: 359 passed, 4 skipped.
- Focused ESLint passed.
- `npx tsc --noEmit` passed.
- Next.js 16.3.5 compiled `/outfits/calibration`; an unauthenticated request correctly rendered through the route error boundary.
- Automated screenshot verification was attempted but the browser automation helper crashed; manual authenticated breakpoint review remains a release smoke-test item.
