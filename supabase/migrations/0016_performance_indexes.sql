-- 0016_performance_indexes.sql
-- Targeted composite indexes designed directly for real application query patterns.

-- 1. Daily outfit lookups and shown-outfit deduplication
-- Queries:
--   - outfits.select(...).eq('user_id', userId).gte('created_at', startOfDay).order('created_at', { ascending: false })
--   - outfits.select('item_ids').eq('user_id', userId).gte('created_at', since)
create index if not exists outfits_user_created_idx
  on public.outfits (user_id, created_at desc);

-- 2. Stored daily AI / fallback outfit fast-path retrieval
-- Query:
--   - outfits.select(...).eq('user_id', userId).in('source', ...).gte('created_at', startOfDay).order('created_at', { ascending: false }).limit(1)
create index if not exists outfits_user_source_created_idx
  on public.outfits (user_id, source, created_at desc);

-- 3. User wardrobe items sorted by addition date
-- Query:
--   - user_wardrobe_items.select(...).eq('user_id', userId).order('added_at', { ascending: false })
create index if not exists user_wardrobe_items_user_added_idx
  on public.user_wardrobe_items (user_id, added_at desc);

-- 4. Wardrobe items composite category + status filter
-- Query:
--   - wardrobe_items.select(...).eq('category', category) with status checks
create index if not exists wardrobe_items_category_status_idx
  on public.wardrobe_items (category, status);

-- 5. Feedback count query by user
-- Query:
--   - feedback.select('id', { count: 'exact', head: true }).eq('user_id', userId)
create index if not exists feedback_user_idx
  on public.feedback (user_id);

-- 6. Case-insensitive text search support on wardrobe items display_name
-- Query:
--   - searchPieces() text search
create index if not exists wardrobe_items_lower_display_name_idx
  on public.wardrobe_items (lower(display_name));
