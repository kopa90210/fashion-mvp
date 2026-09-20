-- Gate 1 migration evidence collection (read-only).
-- Run in each supported Supabase environment and save the result without
-- credentials or user data.

-- 1. Show the ledger shape before interpreting its fields.
select
  column_name,
  data_type,
  ordinal_position
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;

-- 2. Preserve all available metadata for the ambiguous version.
-- to_jsonb avoids assuming which Supabase CLI ledger columns exist.
select to_jsonb(m) as migration_0014
from supabase_migrations.schema_migrations as m
where to_jsonb(m) ->> 'version' = '0014'
   or to_jsonb(m) ->> 'version' like '0014%';

-- 3. Identify which logical schema effects are present.
select
  to_regclass('public.wishlist_items') as wishlist_items,
  to_regclass('public.source_photos') as source_photos;

-- 4. Fingerprint the columns created by the two logical migrations.
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    table_name in ('wishlist_items', 'source_photos')
    or (
      table_name = 'wardrobe_items'
      and column_name in (
        'source_photo_id',
        'crop_box',
        'raw_image_url',
        'processing_status',
        'prettify_status'
      )
    )
    or (
      table_name = 'extraction_log'
      and column_name in (
        'source_photo_id',
        'wardrobe_item_id',
        'stage',
        'request_id',
        'attempt',
        'error_code'
      )
    )
  )
order by table_name, ordinal_position;
