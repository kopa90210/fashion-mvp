-- DOMAIN-ONE-PIECE: canonical one-piece taxonomy and outfit structures.
-- Local-only until explicitly deployed through the normal migration process.

begin;

alter table public.wardrobe_items drop constraint if exists wardrobe_items_category_check;
alter table public.wardrobe_items add constraint wardrobe_items_category_check
  check (category in ('top', 'bottom', 'one_piece', 'outerwear', 'footwear', 'accessory')) not valid;
alter table public.wardrobe_items validate constraint wardrobe_items_category_check;

alter table public.wishlist_items drop constraint if exists wishlist_items_category_check;
alter table public.wishlist_items add constraint wishlist_items_category_check
  check (category in ('top', 'bottom', 'one_piece', 'outerwear', 'footwear', 'accessory')) not valid;
alter table public.wishlist_items validate constraint wishlist_items_category_check;

alter table public.outfit_items drop constraint if exists outfit_items_slot_check;
alter table public.outfit_items add constraint outfit_items_slot_check
  check (slot in ('base_layer', 'bottom', 'one_piece', 'footwear', 'outerwear', 'accessory')) not valid;
alter table public.outfit_items validate constraint outfit_items_slot_check;

create or replace function public.is_valid_outfit_slots(p_slots text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  with counts as (
    select
      count(*) filter (where slot = 'base_layer') as base_layers,
      count(*) filter (where slot = 'bottom') as bottoms,
      count(*) filter (where slot = 'one_piece') as one_pieces,
      count(*) filter (where slot = 'footwear') as footwear,
      count(*) filter (where slot = 'outerwear') as outerwear,
      count(*) filter (where slot = 'accessory') as accessories,
      count(*) as total,
      count(distinct slot) as distinct_total,
      count(*) filter (where slot not in ('base_layer','bottom','one_piece','footwear','outerwear','accessory')) as invalid
    from unnest(coalesce(p_slots, array[]::text[])) as slot
  )
  select invalid = 0
    and total = distinct_total
    and footwear = 1
    and outerwear <= 1
    and accessories <= 1
    and (
      (base_layers = 1 and bottoms = 1 and one_pieces = 0)
      or (base_layers = 0 and bottoms = 0 and one_pieces = 1)
    )
  from counts
$$;

revoke all on function public.is_valid_outfit_slots(text[]) from public, anon, authenticated;
grant execute on function public.is_valid_outfit_slots(text[]) to service_role;

create or replace function public.wardrobe_item_slot(
  p_category text,
  p_subcategory text,
  p_display_name text,
  p_layer_role text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  with normalized as (
    select
      lower(btrim(coalesce(p_category, ''))) as category,
      lower(btrim(coalesce(p_layer_role, ''))) as role,
      lower(concat_ws(' ', p_subcategory, p_display_name, p_layer_role)) as item_text
  )
  select case category
    when 'top' then 'base_layer'
    when 'bottom' then 'bottom'
    when 'one_piece' then 'one_piece'
    when 'footwear' then 'footwear'
    when 'outerwear' then 'outerwear'
    when 'accessory' then 'accessory'
    else case
      when item_text like any (array['%dress%', '%jumpsuit%', '%romper%', '%gown%']) then 'one_piece'
      when item_text like any (array['%shoe%', '%footwear%', '%sneaker%', '%boot%', '%loafer%']) then 'footwear'
      when item_text like any (array['%outerwear%', '%outer wear%', '%outer_layer%', '%outer layer%', '%jacket%', '%coat%', '%blazer%']) then 'outerwear'
      when item_text like any (array['%bottom%', '%pant%', '%trouser%', '%skirt%', '%jean%', '%short%']) then 'bottom'
      when item_text like any (array['%top%', '%shirt%', '%blouse%', '%tee%', '%sweater%']) then 'base_layer'
      when role in ('base_layer', 'base', 'top') then 'base_layer'
      when role = 'bottom' then 'bottom'
      when role in ('one_piece', 'dress', 'jumpsuit', 'romper') then 'one_piece'
      when role in ('footwear', 'shoe') then 'footwear'
      when role in ('outerwear', 'outer_layer') then 'outerwear'
      when role = 'accessory' then 'accessory'
      else 'accessory'
    end
  end
  from normalized
$$;

create or replace function public.create_outfit_with_items(
  p_item_ids uuid[],
  p_source text,
  p_reasoning jsonb default null,
  p_styling_tip text default null,
  p_confidence numeric default null,
  p_generator_version text default null,
  p_context_snapshot jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_scheduled_for date;
  v_outfit_id uuid;
  v_item_id uuid;
  v_slot text;
  v_position smallint := 0;
  v_slots text[] := array[]::text[];
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_source not in ('engine', 'daily_ai', 'daily_fallback', 'manual') then raise exception 'Invalid outfit source' using errcode = '22023'; end if;
  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then raise exception 'Invalid confidence' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_context_snapshot, '{}'::jsonb)) <> 'object' then raise exception 'Context snapshot must be an object' using errcode = '22023'; end if;
  if cardinality(p_item_ids) not between 2 and 5 or cardinality(p_item_ids) <> cardinality(array(select distinct unnest(p_item_ids))) then
    raise exception 'Outfit must contain two to five distinct items' using errcode = '22023';
  end if;

  select timezone into v_timezone from public.users where id = v_user_id;
  if not public.is_valid_iana_timezone(v_timezone) then raise exception 'User timezone is invalid' using errcode = '22023'; end if;
  if p_source in ('daily_ai', 'daily_fallback') then
    v_scheduled_for := (now() at time zone v_timezone)::date;
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_scheduled_for::text, 0));
    select id into v_outfit_id from public.outfits
      where user_id = v_user_id and scheduled_for = v_scheduled_for
        and source in ('daily_ai', 'daily_fallback') and status = 'generated'
      limit 1 for update;
    if v_outfit_id is not null then return v_outfit_id; end if;
  end if;

  foreach v_item_id in array p_item_ids loop
    select case wi.layer_role
      when 'base_layer' then 'base_layer' when 'bottom' then 'bottom'
      when 'one_piece' then 'one_piece' when 'footwear' then 'footwear' when 'outerwear' then 'outerwear'
      when 'accessory' then 'accessory' else null end
    into v_slot
    from public.user_wardrobe_items uwi
    join public.wardrobe_items wi on wi.id = uwi.item_id
    where uwi.user_id = v_user_id and uwi.item_id = v_item_id and uwi.retired_at is null;
    if v_slot is null then raise exception 'Item is not in the active wardrobe or has an invalid role' using errcode = '22023'; end if;
    if v_slot = any(v_slots) then raise exception 'Outfit has duplicate slots' using errcode = '22023'; end if;
    v_slots := array_append(v_slots, v_slot);
  end loop;
  if not public.is_valid_outfit_slots(v_slots) then
    raise exception 'Outfit is missing a required slot' using errcode = '22023';
  end if;

  insert into public.outfits (user_id, item_ids, source, scheduled_for, reasoning, styling_tip, confidence, generator_version, context_snapshot, fashion_dna_updated_at)
  values (v_user_id, to_jsonb(p_item_ids), p_source, v_scheduled_for, p_reasoning, p_styling_tip, p_confidence, p_generator_version, coalesce(p_context_snapshot, '{}'::jsonb),
    (select updated_at from public.fashion_dna where user_id = v_user_id))
  returning id into v_outfit_id;
  foreach v_item_id in array p_item_ids loop
    insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position)
    values (v_outfit_id, v_item_id, v_slots[v_position + 1], v_position);
    v_position := v_position + 1;
  end loop;
  return v_outfit_id;
exception when unique_violation then
  if p_source in ('daily_ai', 'daily_fallback') then
    select id into v_outfit_id from public.outfits
      where user_id = v_user_id and scheduled_for = v_scheduled_for
        and source in ('daily_ai', 'daily_fallback') and status = 'generated'
      limit 1;
    if v_outfit_id is not null then return v_outfit_id; end if;
  end if;
  raise;
end;
$$;

create or replace function public.complete_ai_job(
  p_job_id uuid, p_worker_id text, p_attempt integer, p_outcome text,
  p_provider text, p_model text, p_prompt_version text, p_schema_version text,
  p_validation_status text, p_latency_ms integer, p_usage jsonb,
  p_safe_error_code text, p_result jsonb
)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_job public.ai_jobs%rowtype; v_run_id uuid; v_outfit_id uuid;
  v_ids uuid[]; v_item_id uuid; v_roles text[] := array[]::text[]; v_role text;
  v_position integer := 0; v_source text; v_confidence numeric;
  v_category text; v_name text; v_color text;
begin
  select * into v_job from public.ai_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running' or v_job.lease_owner is distinct from p_worker_id
    or v_job.total_attempts <> p_attempt or v_job.lease_expires_at <= now() then
    raise exception 'Job lease is not current' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('succeeded','retryable_error','permanent_error')
    or p_provider is null or p_model is null or p_prompt_version is null or p_schema_version is null
    or p_validation_status not in ('valid','invalid','not_run')
    or p_latency_ms is null or p_latency_ms < 0
    or coalesce(jsonb_typeof(p_usage), 'null') <> 'object' then
    raise exception 'Invalid run metadata' using errcode = '22023';
  end if;
  if (p_outcome = 'succeeded' and (p_safe_error_code is not null or p_validation_status <> 'valid' or coalesce(jsonb_typeof(p_result), 'null') <> 'object'))
    or (p_outcome <> 'succeeded' and (p_safe_error_code is null or p_result is not null)) then
    raise exception 'Invalid run outcome' using errcode = '22023';
  end if;

  insert into public.ai_runs (job_id, attempt, status, provider, model, prompt_version,
    schema_version, validation_status, latency_ms, usage, safe_error_code)
  values (v_job.id, p_attempt, p_outcome::public.ai_run_status, p_provider, p_model,
    p_prompt_version, p_schema_version, p_validation_status, p_latency_ms, p_usage, p_safe_error_code)
  returning id into v_run_id;

  if p_outcome = 'succeeded' and v_job.job_type = 'daily_outfit' then
    if jsonb_typeof(p_result->'item_ids') is distinct from 'array'
      or jsonb_typeof(p_result->'reasoning') is distinct from 'array'
      or p_result->>'source' is null or p_result->>'source' not in ('daily_ai','daily_fallback') then
      raise exception 'Invalid outfit result' using errcode = '22023';
    end if;
    if jsonb_array_length(p_result->'reasoning') > 10
      or exists (select 1 from jsonb_array_elements(p_result->'reasoning') as reason(value)
        where jsonb_typeof(reason.value) <> 'string' or length(reason.value #>> '{}') > 500)
      or length(coalesce(p_result->>'styling_tip', '')) > 500 then
      raise exception 'Invalid outfit explanation' using errcode = '22023';
    end if;
    v_ids := array(select value::uuid from jsonb_array_elements_text(p_result->'item_ids'));
    if cardinality(v_ids) not between 2 and 5
      or cardinality(v_ids) <> cardinality(array(select distinct unnest(v_ids))) then
      raise exception 'Invalid outfit items' using errcode = '22023';
    end if;
    v_confidence := (p_result->>'confidence')::numeric;
    if v_confidence is null or v_confidence < 0 or v_confidence > 1 then
      raise exception 'Invalid outfit confidence' using errcode = '22023';
    end if;
    foreach v_item_id in array v_ids loop
      select wi.layer_role into v_role from public.user_wardrobe_items uwi
      join public.wardrobe_items wi on wi.id = uwi.item_id
      where uwi.user_id = v_job.user_id and uwi.item_id = v_item_id
        and uwi.retired_at is null and wi.status = 'confirmed';
      if v_role is null or v_role not in ('base_layer','bottom','one_piece','footwear','outerwear','accessory')
        or v_role = any(v_roles) then
        raise exception 'Outfit item is invalid or unavailable' using errcode = '22023';
      end if;
      v_roles := array_append(v_roles, v_role);
    end loop;
    if not public.is_valid_outfit_slots(v_roles) then
      raise exception 'Outfit missing required role' using errcode = '22023';
    end if;
    v_source := p_result->>'source';
    insert into public.outfits (user_id, item_ids, source, scheduled_for, reasoning,
      styling_tip, confidence, generator_version, context_snapshot, ai_job_id, ai_run_id)
    values (v_job.user_id, to_jsonb(v_ids), v_source, v_job.scheduled_for,
      p_result->'reasoning', p_result->>'styling_tip', v_confidence,
      p_model || ':' || p_prompt_version, jsonb_build_object('job_id', v_job.id), v_job.id, v_run_id)
    on conflict do nothing returning id into v_outfit_id;
    if v_outfit_id is null then
      select id into v_outfit_id from public.outfits where user_id = v_job.user_id
        and scheduled_for = v_job.scheduled_for and source in ('daily_ai','daily_fallback')
        and status = 'generated' limit 1;
      if v_outfit_id is null then raise exception 'Outfit could not be persisted' using errcode = '23505'; end if;
    else
      foreach v_item_id in array v_ids loop
        insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position)
        values (v_outfit_id, v_item_id, v_roles[v_position + 1], v_position);
        v_position := v_position + 1;
      end loop;
    end if;
    update public.ai_runs set outfit_id = v_outfit_id where id = v_run_id;
  elsif p_outcome = 'succeeded' and v_job.job_type = 'wardrobe_extraction' then
    v_category := p_result->>'category';
    v_name := p_result->>'display_name';
    v_color := p_result->>'color_primary';
    v_confidence := (p_result->>'confidence')::numeric;
    if v_category is null or v_category not in ('top','bottom','one_piece','footwear','outerwear','accessory')
      or v_name is null or length(trim(v_name)) not between 1 and 120
      or v_color is null or length(trim(v_color)) not between 1 and 80
      or v_confidence is null or v_confidence < 0 or v_confidence > 1 then
      raise exception 'Invalid extraction result' using errcode = '22023';
    end if;
    perform set_config('app.pipeline_transition', 'true', true);
    update public.wardrobe_items wi set category = v_category, display_name = v_name,
      color = jsonb_build_object('primary', v_color), model_confidence = v_confidence,
      layer_role = case v_category when 'top' then 'base_layer' else v_category end,
      processing_status = 'extracted', extraction_ai_run_id = v_run_id
    where wi.id = v_job.wardrobe_item_id and wi.source = 'user_upload' and wi.status = 'draft'
      and exists (select 1 from public.user_wardrobe_items uwi
        where uwi.user_id = v_job.user_id and uwi.item_id = wi.id and uwi.retired_at is null);
    if not found then raise exception 'Draft item no longer available' using errcode = '22023'; end if;
  end if;

  update public.ai_jobs set
    status = case when p_outcome = 'succeeded' then 'succeeded'::public.ai_job_status
      when p_outcome = 'permanent_error' or attempts >= max_attempts then 'dead_letter'::public.ai_job_status
      else 'retry_wait'::public.ai_job_status end,
    available_at = case when p_outcome = 'retryable_error' and attempts < max_attempts
      then now() + make_interval(secs => least(3600, 5 * power(2, attempts - 1)::integer))
      else now() end,
    lease_owner = null, lease_expires_at = null, safe_error_code = p_safe_error_code,
    result_outfit_id = v_outfit_id, updated_at = now()
  where id = v_job.id;
  return v_outfit_id;
end; $$;

create or replace function public.complete_outfit_photo_job(
  p_job_id uuid, p_worker_id text, p_attempt integer, p_provider text,
  p_model text, p_prompt_version text, p_schema_version text,
  p_latency_ms integer, p_usage jsonb, p_garments jsonb
)
returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_job public.ai_jobs%rowtype; v_photo public.source_photos%rowtype;
  v_run uuid; v_garment jsonb; v_original jsonb; v_reconstructed jsonb;
  v_original_id uuid; v_reconstructed_id uuid; v_item uuid;
  v_count integer := 0; v_category text; v_role text; v_box jsonb;
  v_path text; v_recon_path text;
begin
  select * into v_job from public.ai_jobs where id = p_job_id for update;
  if not found or v_job.job_type <> 'outfit_photo' or v_job.status <> 'running'
    or v_job.lease_owner is distinct from p_worker_id
    or v_job.total_attempts <> p_attempt or v_job.lease_expires_at <= now() then
    raise exception 'Job lease is not current' using errcode = '42501';
  end if;
  select * into v_photo from public.source_photos
    where id = v_job.source_photo_id and user_id = v_job.user_id for update;
  if not found or v_photo.status <> 'detecting' then
    raise exception 'Source photo is unavailable' using errcode = '42501';
  end if;
  if p_provider is null or length(p_provider) not between 1 and 80
    or p_model is null or length(p_model) not between 1 and 120
    or p_prompt_version is null or length(p_prompt_version) not between 1 and 80
    or p_schema_version is null or length(p_schema_version) not between 1 and 80
    or p_latency_ms is null or p_latency_ms < 0
    or jsonb_typeof(p_usage) is distinct from 'object'
    or jsonb_typeof(p_garments) is distinct from 'array' then
    raise exception 'Invalid run metadata' using errcode = '22023';
  end if;
  if jsonb_array_length(p_garments) > 8 then
    raise exception 'Too many garments' using errcode = '22023';
  end if;
  insert into public.ai_runs (job_id, attempt, status, provider, model,
    prompt_version, schema_version, validation_status, latency_ms, usage)
  values (v_job.id, p_attempt, 'succeeded', p_provider, p_model,
    p_prompt_version, p_schema_version, 'valid', p_latency_ms, p_usage)
  returning id into v_run;

  perform set_config('app.pipeline_transition', 'true', true);
  for v_garment in select value from jsonb_array_elements(p_garments) loop
    v_original := v_garment->'original';
    v_reconstructed := v_garment->'reconstructed';
    v_category := v_garment->>'category';
    v_role := case v_category when 'top' then 'base_layer' else v_category end;
    v_box := v_garment->'box';
    v_path := v_original->>'object_path';
    v_recon_path := v_reconstructed->>'object_path';
    if v_category is null or v_category not in ('top','bottom','one_piece','footwear','outerwear','accessory')
      or length(trim(coalesce(v_garment->>'display_name',''))) not between 1 and 120
      or length(trim(coalesce(v_garment->'color'->>'primary',''))) not between 1 and 80
      or v_garment->>'confidence' is null
      or (v_garment->>'confidence')::numeric not between 0 and 1
      or jsonb_typeof(v_box) is distinct from 'object'
      or v_box->>'x' is null or v_box->>'y' is null
      or v_box->>'width' is null or v_box->>'height' is null
      or (v_box->>'x')::numeric not between 0 and 1
      or (v_box->>'y')::numeric not between 0 and 1
      or (v_box->>'width')::numeric <= 0 or (v_box->>'height')::numeric <= 0
      or (v_box->>'x')::numeric + (v_box->>'width')::numeric > 1
      or (v_box->>'y')::numeric + (v_box->>'height')::numeric > 1
      or v_path is null or v_path !~ ('^' || v_job.user_id::text || '/[0-9a-f-]+\.png$')
      or v_recon_path is not null and v_recon_path !~ ('^' || v_job.user_id::text || '/[0-9a-f-]+\.png$') then
      raise exception 'Invalid garment result' using errcode = '22023';
    end if;
    if v_original->>'byte_size' is null or v_original->>'width' is null
      or v_original->>'height' is null or v_original->>'sha256' is null
      or (v_original->>'byte_size')::integer not between 1 and 4194304
      or (v_original->>'width')::integer not between 1 and 1024
      or (v_original->>'height')::integer not between 1 and 1024
      or v_original->>'sha256' !~ '^[0-9a-f]{64}$' then
      raise exception 'Invalid garment image' using errcode = '22023';
    end if;
    insert into public.media_assets(owner_id, bucket_id, object_path, kind, mime_type,
      byte_size, sha256, width, height)
    values (v_job.user_id, 'private-wardrobe-media', v_path, 'wardrobe_item',
      'image/png', (v_original->>'byte_size')::integer, v_original->>'sha256',
      (v_original->>'width')::integer, (v_original->>'height')::integer)
    returning id into v_original_id;
    v_reconstructed_id := null;
    if v_recon_path is not null then
      if v_reconstructed->>'byte_size' is null or v_reconstructed->>'width' is null
        or v_reconstructed->>'height' is null or v_reconstructed->>'sha256' is null
        or (v_reconstructed->>'byte_size')::integer not between 1 and 4194304
        or (v_reconstructed->>'width')::integer not between 1 and 1024
        or (v_reconstructed->>'height')::integer not between 1 and 1024
        or v_reconstructed->>'sha256' !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid reconstructed image' using errcode = '22023';
      end if;
      insert into public.media_assets(owner_id, bucket_id, object_path, kind, mime_type,
        byte_size, sha256, width, height)
      values (v_job.user_id, 'private-wardrobe-media', v_recon_path, 'wardrobe_item',
        'image/png', (v_reconstructed->>'byte_size')::integer, v_reconstructed->>'sha256',
        (v_reconstructed->>'width')::integer, (v_reconstructed->>'height')::integer)
      returning id into v_reconstructed_id;
    end if;
    insert into public.wardrobe_items (image_url, raw_image_url, media_asset_id,
      original_media_asset_id, reconstructed_media_asset_id, source_photo_id,
      source, status, processing_status, prettify_status, crop_box, category,
      subcategory, display_name, color, material, fit, pattern, style_tags,
      formality_score, season_weights, layer_role, model_confidence, extraction_ai_run_id)
    values ('private://private-wardrobe-media/' || v_path,
      'private://private-wardrobe-media/' || v_path, v_original_id, v_original_id,
      v_reconstructed_id, v_photo.id, 'user_upload', 'draft', 'extracted',
      case when v_reconstructed_id is not null then 'done' else 'failed' end,
      v_box, v_category, nullif(v_garment->>'subcategory',''),
      v_garment->>'display_name', coalesce(v_garment->'color','{}'::jsonb),
      coalesce(v_garment->'material','{}'::jsonb),
      coalesce(v_garment->'fit','{}'::jsonb), nullif(v_garment->>'pattern',''),
      coalesce(v_garment->'style_tags','{}'::jsonb),
      (v_garment->>'formality_score')::numeric,
      coalesce(v_garment->'season_weights','{}'::jsonb), v_role,
      (v_garment->>'confidence')::numeric, v_run)
    returning id into v_item;
    insert into public.user_wardrobe_items (user_id, item_id, quantity)
      values (v_job.user_id, v_item, 1);
    v_count := v_count + 1;
  end loop;
  update public.source_photos set status = 'done', detected_count = v_count where id = v_photo.id;
  perform set_config('app.outfit_photo_completed', 'true', true);
  update public.ai_jobs set status = 'succeeded', lease_owner = null,
    lease_expires_at = null, updated_at = now(), safe_error_code = null
    where id = v_job.id;
  return v_count;
end; $$;

create or replace function public.create_swapped_outfit(
  p_parent_outfit_id uuid,
  p_replaced_item_id uuid,
  p_replacement_item_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_context jsonb := jsonb_build_object('parent_outfit_id', p_parent_outfit_id);
  v_existing record;
  v_parent record;
  v_member record;
  v_replacement record;
  v_child_id uuid;
  v_item_ids uuid[] := array[]::uuid[];
  v_new_item_ids uuid[] := array[]::uuid[];
  v_slots text[] := array[]::text[];
  v_member_count integer := 0;
  v_replaced_found boolean := false;
  v_resolved_slot text;
  v_replaced_slot text;
  v_position integer;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_parent_outfit_id is null or p_replaced_item_id is null or p_replacement_item_id is null
    or p_replaced_item_id = p_replacement_item_id then
    raise exception 'Invalid swap items' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 200 or btrim(p_idempotency_key) = '' then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  -- Serialize only identical retry namespaces, keeping the transaction short.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_idempotency_key, 0));

  select oi.outfit_id, oi.event_type, oi.item_id, oi.replacement_item_id,
         oi.context_snapshot, o.user_id, o.source
  into v_existing
  from public.outfit_interactions oi
  join public.outfits o on o.id = oi.outfit_id
  where oi.user_id = v_user and oi.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user
      or v_existing.source is distinct from 'swap'
      or v_existing.event_type is distinct from 'item_swapped'
      or v_existing.item_id is distinct from p_replaced_item_id
      or v_existing.replacement_item_id is distinct from p_replacement_item_id
      or v_existing.context_snapshot is distinct from v_context then
      raise exception 'Idempotency key was used for a different interaction' using errcode = '22023';
    end if;
    return v_existing.outfit_id;
  end if;

  select o.id, o.scheduled_for
  into v_parent
  from public.outfits o
  where o.id = p_parent_outfit_id and o.user_id = v_user
  for share;
  if not found then raise exception 'Outfit not found' using errcode = '42501'; end if;

  select array_agg(oi.wardrobe_item_id order by oi.position)
  into v_item_ids
  from public.outfit_items oi
  where oi.outfit_id = p_parent_outfit_id;
  if coalesce(cardinality(v_item_ids), 0) not between 2 and 5 then
    raise exception 'Parent outfit is structurally invalid' using errcode = '22023';
  end if;
  if p_replacement_item_id = any(v_item_ids) then
    raise exception 'Replacement is already in the outfit' using errcode = '22023';
  end if;

  -- Lock all involved ownership/item rows in UUID order before validation.
  perform 1
  from public.user_wardrobe_items uwi
  join public.wardrobe_items wi on wi.id = uwi.item_id
  where uwi.user_id = v_user
    and wi.id = any(array_append(v_item_ids, p_replacement_item_id))
  order by wi.id
  for share of uwi, wi;

  for v_member in
    select oi.wardrobe_item_id, oi.slot, oi.position,
           wi.category, wi.subcategory, wi.display_name, wi.layer_role,
           wi.status, uwi.retired_at
    from public.outfit_items oi
    join public.wardrobe_items wi on wi.id = oi.wardrobe_item_id
    left join public.user_wardrobe_items uwi
      on uwi.item_id = wi.id and uwi.user_id = v_user
    where oi.outfit_id = p_parent_outfit_id
    order by oi.position
  loop
    v_member_count := v_member_count + 1;
    if v_member.retired_at is not null or v_member.status is distinct from 'confirmed' then
      raise exception 'Parent outfit contains unavailable wardrobe items' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.user_wardrobe_items uwi
      where uwi.user_id = v_user and uwi.item_id = v_member.wardrobe_item_id and uwi.retired_at is null
    ) then
      raise exception 'Parent outfit contains unavailable wardrobe items' using errcode = '22023';
    end if;
    v_resolved_slot := public.wardrobe_item_slot(v_member.category, v_member.subcategory, v_member.display_name, v_member.layer_role);
    if v_resolved_slot is distinct from v_member.slot then
      raise exception 'Parent outfit item has an invalid role' using errcode = '22023';
    end if;
    v_slots := array_append(v_slots, v_member.slot);
    if v_member.wardrobe_item_id = p_replaced_item_id then
      v_replaced_found := true;
      v_replaced_slot := v_member.slot;
      v_new_item_ids := array_append(v_new_item_ids, p_replacement_item_id);
    else
      v_new_item_ids := array_append(v_new_item_ids, v_member.wardrobe_item_id);
    end if;
  end loop;

  if v_member_count <> cardinality(v_item_ids) then
    raise exception 'Parent outfit contains unavailable wardrobe items' using errcode = '22023';
  end if;
  if not v_replaced_found then raise exception 'Replaced item is not part of outfit' using errcode = '22023'; end if;
  if not public.is_valid_outfit_slots(v_slots) then
    raise exception 'Resulting outfit is structurally invalid' using errcode = '22023';
  end if;

  select wi.id, wi.category, wi.subcategory, wi.display_name, wi.layer_role
  into v_replacement
  from public.user_wardrobe_items uwi
  join public.wardrobe_items wi on wi.id = uwi.item_id
  where uwi.user_id = v_user and uwi.item_id = p_replacement_item_id
    and uwi.retired_at is null and wi.status = 'confirmed';
  if not found then raise exception 'Replacement is not in the active confirmed wardrobe' using errcode = '22023'; end if;
  v_resolved_slot := public.wardrobe_item_slot(v_replacement.category, v_replacement.subcategory, v_replacement.display_name, v_replacement.layer_role);
  if v_resolved_slot is distinct from v_replaced_slot then
    raise exception 'Replacement has a different role' using errcode = '22023';
  end if;

  insert into public.outfits (
    user_id, item_ids, source, scheduled_for, status, generator_version,
    context_snapshot, fashion_dna_updated_at, parent_outfit_id
  ) values (
    v_user, to_jsonb(v_new_item_ids), 'swap', v_parent.scheduled_for, 'generated',
    'deterministic-swap-v1', v_context,
    (select fd.updated_at from public.fashion_dna fd where fd.user_id = v_user),
    p_parent_outfit_id
  ) returning id into v_child_id;

  for v_position in 1..cardinality(v_new_item_ids) loop
    insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position)
    values (v_child_id, v_new_item_ids[v_position], v_slots[v_position], v_position - 1);
  end loop;

  insert into public.outfit_interactions (
    user_id, outfit_id, event_type, item_id, replacement_item_id,
    context_snapshot, idempotency_key
  ) values (
    v_user, v_child_id, 'item_swapped', p_replaced_item_id,
    p_replacement_item_id, v_context, p_idempotency_key
  );

  return v_child_id;
end;
$$;

commit;
