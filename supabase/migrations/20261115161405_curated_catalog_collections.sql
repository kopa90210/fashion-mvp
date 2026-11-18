-- A catalog label is presentation metadata, never a user's gender or ownership.
alter table public.wardrobe_items
  add column catalog_collection text,
  add constraint wardrobe_items_catalog_collection_check
    check (catalog_collection is null or
           (source is not distinct from 'curated' and
            catalog_collection in ('masculine', 'feminine', 'shared')));

comment on column public.wardrobe_items.catalog_collection is
  'Curated presentation collection. NULL means unclassified and is excluded from scoped discovery; shared is explicit.';

create index wardrobe_items_confirmed_curated_collection_category_idx
  on public.wardrobe_items (catalog_collection, category)
  where source = 'curated' and status = 'confirmed';
