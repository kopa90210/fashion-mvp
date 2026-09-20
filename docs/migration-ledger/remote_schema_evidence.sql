-- Gate 1 remote schema evidence collection (read-only, no table data).
-- Run in the linked project's Supabase SQL Editor and save only the result
-- metadata under docs/migration-ledger/.

-- Application tables whose existence distinguishes the duplicate 0014 files.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'users',
    'wardrobe_items',
    'user_wardrobe_items',
    'wishlist_items',
    'source_photos',
    'extraction_log'
  )
order by table_name;

-- Columns created by the source-photo pipeline migration.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'wardrobe_items' and column_name in (
      'source_photo_id', 'crop_box', 'raw_image_url',
      'processing_status', 'prettify_status'
    ))
    or
    (table_name = 'extraction_log' and column_name in (
      'source_photo_id', 'wardrobe_item_id', 'stage', 'request_id',
      'attempt', 'error_code'
    ))
  )
order by table_name, ordinal_position;

-- The migration ledger is expected to be empty; record it directly.
select to_jsonb(m) as migration_row
from supabase_migrations.schema_migrations as m
order by to_jsonb(m)::text;

-- Gate 1 ownership audit. These aggregate counts expose no user IDs or item IDs.
-- `owner_id` is a legacy column; `user_wardrobe_items` is the intended model.
with ownership as (
  select
    wi.source,
    wi.owner_id,
    wi.id,
    count(uwi.user_id) as membership_count,
    bool_or(uwi.user_id = wi.owner_id) as legacy_owner_has_membership
  from public.wardrobe_items as wi
  left join public.user_wardrobe_items as uwi on uwi.item_id = wi.id
  group by wi.source, wi.owner_id, wi.id
)
select
  source,
  case
    when source = 'curated' and membership_count = 0 then 'curated_no_membership'
    when source = 'curated' and membership_count > 0 then 'curated_has_membership'
    when source = 'user_upload' and membership_count = 0 and owner_id is null
      then 'orphan_no_owner_or_membership'
    when source = 'user_upload' and membership_count = 0 and owner_id is not null
      then 'safe_backfill_candidate'
    when source = 'user_upload' and membership_count = 1 and owner_id is null
      then 'canonical_membership_only'
    when source = 'user_upload' and membership_count = 1 and legacy_owner_has_membership
      then 'canonical_match'
    when source = 'user_upload' and membership_count = 1 and not legacy_owner_has_membership
      then 'owner_membership_conflict'
    when source = 'user_upload' and membership_count > 1 then 'multiple_memberships'
    else 'other'
  end as ownership_state,
  count(*) as item_count
from ownership
group by source, ownership_state
order by source, ownership_state;
