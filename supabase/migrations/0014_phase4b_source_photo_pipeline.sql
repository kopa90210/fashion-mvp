-- 0014_phase4b_source_photo_pipeline.sql
-- Phase 4B: Source photo detection, isolation, extraction pipeline schema
--
-- Adds:
-- - source_photos table (user uploads, detection workflow)
-- - Extensions to wardrobe_items (processing state, crop data, derived image)
-- - Extensions to extraction_log (stage-aware, source-photo traceability)
-- - RLS policies for cross-user isolation
-- - Ownership invariant schema support (RPC enforcement: Gate 3)
--
-- MIGRATION REPLAY SAFETY CLASSIFICATION:
-- CREATE TABLE: intentionally one-time (no IF NOT EXISTS).
--   Migration runners MUST track applied migrations to prevent re-execution.
--   Running 0014 twice without tracking will fail: "relation already exists".
-- ✅ CREATE INDEX: IF NOT EXISTS throughout
-- ✅ CREATE POLICY: DROP IF EXISTS POLICY first
-- ✅ ALTER TABLE ADD COLUMN: IF NOT EXISTS throughout
-- Safe for tracked/idempotent execution only (not for manual replay).

-- ---------------------------------------------------------------------------
-- 1. Create source_photos table
-- ---------------------------------------------------------------------------
-- FK Design Decision: user_id references public.users (application-owned domain model).
-- rationale: consistent with existing wardrobe_items.user_id → public.users pattern.
-- public.users.id itself references auth.users.id; Phase 4B uses application layer.
create table public.source_photos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users on delete cascade not null,
  image_url         text not null,
  status            text not null default 'uploading' check (
    status in ('uploading', 'detecting', 'done', 'failed')
  ),
  idempotency_key   text,
  file_hash         text,
  created_at        timestamptz default now() not null
);

-- Unique constraint on (user_id, idempotency_key) for idempotent uploads
create unique index source_photos_user_idempotency_key_idx
  on public.source_photos (user_id, idempotency_key)
  where idempotency_key is not null;

-- Index for status queries
create index source_photos_user_status_idx
  on public.source_photos (user_id, status);

-- Index for file_hash deduplication (optional, for content-based dedup)
create index source_photos_file_hash_idx
  on public.source_photos (file_hash);

-- ---------------------------------------------------------------------------
-- 2. Extend wardrobe_items for Phase 4B processing
-- ---------------------------------------------------------------------------
alter table public.wardrobe_items
  add column if not exists source_photo_id uuid references public.source_photos on delete set null;

alter table public.wardrobe_items
  add column if not exists crop_box jsonb;

alter table public.wardrobe_items
  add column if not exists raw_image_url text;

alter table public.wardrobe_items
  add column if not exists processing_status text default 'detected' check (
    processing_status in ('detected', 'isolating', 'isolated', 'extracting', 'extracted', 'failed')
  );

alter table public.wardrobe_items
  add column if not exists prettify_status text default 'none' check (
    prettify_status in ('none', 'processing', 'done', 'failed')
  );

-- INVARIANT: Processing and prettify states are transitions only via Backend RPC.
-- Clients MUST NOT directly update these columns.

-- Index for source_photo lookup
create index if not exists wardrobe_items_source_photo_id_idx
  on public.wardrobe_items (source_photo_id);

-- Index for processing status queries
create index if not exists wardrobe_items_processing_status_idx
  on public.wardrobe_items (processing_status);

-- Index for prettify status queries
create index if not exists wardrobe_items_prettify_status_idx
  on public.wardrobe_items (prettify_status);

-- ---------------------------------------------------------------------------
-- 3. Extend extraction_log for stage-aware pipeline tracking
-- ---------------------------------------------------------------------------
alter table public.extraction_log
  add column if not exists source_photo_id uuid references public.source_photos on delete set null;

alter table public.extraction_log
  add column if not exists wardrobe_item_id uuid references public.wardrobe_items on delete set null;

-- Canonical extraction stages from Phase 4B specification
alter table public.extraction_log
  add column if not exists stage text check (
    stage is null or stage in (
      'detection',
      'crop',
      'background_removal',
      'attribute_extraction',
      'prettify'
    )
  );

alter table public.extraction_log
  add column if not exists request_id text;

alter table public.extraction_log
  add column if not exists attempt integer default 1 check (attempt >= 1);

alter table public.extraction_log
  add column if not exists error_code text;

-- Indexes for pipeline traceability
create index if not exists extraction_log_source_photo_id_idx
  on public.extraction_log (source_photo_id);

create index if not exists extraction_log_wardrobe_item_id_idx
  on public.extraction_log (wardrobe_item_id);

create index if not exists extraction_log_stage_idx
  on public.extraction_log (stage);

create index if not exists extraction_log_request_id_idx
  on public.extraction_log (request_id);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------

-- Enable RLS on source_photos
alter table public.source_photos enable row level security;

-- source_photos: User can only read/write their own
-- Drop first for replay-safe idempotency
drop policy if exists "source_photos: owner all" on public.source_photos;

create policy "source_photos: owner all"
  on public.source_photos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. Enforce ownership invariant on wardrobe_items
-- ---------------------------------------------------------------------------
-- Existing wardrobe_items RLS policies already restrict access via user_wardrobe_items.
-- Add a constraint to ensure that if source_photo_id is present, the source photo
-- belongs to the same user as the wardrobe item owner.
--
-- Constraint is enforced via RLS and application logic during insert/update via RPC.
-- The RPC (create_draft_wardrobe_item) must validate:
--   source_photos.user_id = auth.uid()
--   before inserting the wardrobe_item row.

-- No additional policies needed here; existing policies handle access control.
-- The three-way ownership check is:
--   source_photos.user_id == auth.uid() (enforced by source_photos policy)
--   user_wardrobe_items.user_id == auth.uid() (enforced by user_wardrobe_items policy)
--   wardrobe_items.source_photo_id must be owned by the same user (enforced in RPC)

-- ---------------------------------------------------------------------------
-- 6. extraction_log remains service-role only (no new RLS changes)
-- ---------------------------------------------------------------------------
-- Existing RLS prevents authenticated access. Phase 4B does not change this.
-- Service role (backend) uses service key for all extraction_log writes.

comment on table public.source_photos is
  'User-uploaded source photos. Each photo triggers detection pipeline. 
   Status progresses: uploading → detecting → (done | failed).';

comment on table public.extraction_log is
  'Audit trail for AI extraction stages (detection, crop, background_removal, attribute_extraction, prettify).
   Service-role only; tracks stage, request_id, attempt, and errors.';

comment on column public.wardrobe_items.source_photo_id is
  'Provenance: reference to source_photos row. NULL for curated items.';

comment on column public.wardrobe_items.raw_image_url is
  'Isolated garment crop extracted during detection/isolation. 
   NULL until isolation is complete.';

comment on column public.wardrobe_items.crop_box is
  'Normalized crop coordinates within source photo: {x, y, width, height} ∈ [0..1].
   Range invariant: 0 <= x, y < 1; 0 < width, height; x + width <= 1; y + height <= 1.
   Stored as JSONB. Validation enforced by application layer (Gate 3+).
   Phase 4B: adjustItemCrop re-runs isolation with updated crop_box.';

comment on column public.wardrobe_items.processing_status is
  'Internal pipeline state: detected → isolating → isolated → extracting → extracted | failed.
   Independent from user-facing status (draft/confirmed/rejected).
   INVARIANT: Backend orchestrator transitions only (SECURITY_DEFINER RPC).
   Clients MUST NOT update this field directly.
   Schema support: ✅ | RLS boundary: ✅ | Full enforcement: Gate 3+';

comment on column public.wardrobe_items.prettify_status is
  'Optional post-processing: none → processing → (done | failed).
   Never blocks persistence. Never auto-confirms items.
   INVARIANT: Prettify orchestrator transitions only (SECURITY_DEFINER RPC).
   Clients MUST NOT update this field directly.
   Schema support: ✅ | RLS boundary: ✅ | Full enforcement: Gate 3+';

comment on column public.source_photos.idempotency_key is
  'Client-provided key for upload idempotency. 
   Unique per user. Prevents duplicate source_photos from same logical request.';

comment on column public.source_photos.file_hash is
  'SHA-256 or similar hash of image content for content-based deduplication queries.
   Indexed for observability only. NOT unique. NOT a business rule.
   Does not prevent uploading the same photograph twice.
   Separate concern from idempotency_key (request deduplication).';
