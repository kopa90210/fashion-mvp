-- Local draft only. Apply after Gate 2-5 and 20260919130000 on a disposable DB first.
begin;

alter table public.source_photos
  add column media_asset_id uuid references public.media_assets(id) on delete set null,
  add column detected_count integer not null default 0 check (detected_count between 0 and 8);
create index source_photos_media_asset_idx on public.source_photos(media_asset_id)
  where media_asset_id is not null;

alter table public.ai_jobs
  add column source_photo_id uuid references public.source_photos(id) on delete set null;
create index ai_jobs_source_photo_idx on public.ai_jobs(source_photo_id)
  where source_photo_id is not null;
alter table public.ai_jobs drop constraint ai_jobs_shape_check;
alter table public.ai_jobs add constraint ai_jobs_shape_check check (
  (job_type = 'daily_outfit' and scheduled_for is not null and wardrobe_item_id is null and source_photo_id is null)
  or (job_type = 'wardrobe_extraction' and scheduled_for is null and source_photo_id is null)
  or (job_type = 'outfit_photo' and scheduled_for is null and wardrobe_item_id is null)
);

alter table public.wardrobe_items
  add column original_media_asset_id uuid references public.media_assets(id) on delete set null,
  add column reconstructed_media_asset_id uuid references public.media_assets(id) on delete set null;
create index wardrobe_items_original_media_idx on public.wardrobe_items(original_media_asset_id)
  where original_media_asset_id is not null;
create index wardrobe_items_reconstructed_media_idx on public.wardrobe_items(reconstructed_media_asset_id)
  where reconstructed_media_asset_id is not null;

-- Keep generated-image provenance immutable to end-user table updates.
-- Only the trusted completion/confirmation RPC may choose the displayed asset.
create or replace function public.guard_outfit_photo_draft_update()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if old.original_media_asset_id is not null
    and current_setting('app.pipeline_transition', true) is distinct from 'true'
    and current_setting('app.outfit_photo_confirmed', true) is distinct from 'true'
    and (new.source_photo_id is distinct from old.source_photo_id
      or new.original_media_asset_id is distinct from old.original_media_asset_id
      or new.reconstructed_media_asset_id is distinct from old.reconstructed_media_asset_id
      or (old.status = 'draft' and new.media_asset_id is distinct from old.media_asset_id)
      or (old.status = 'draft' and new.image_url is distinct from old.image_url)
      or new.raw_image_url is distinct from old.raw_image_url
      or new.extraction_ai_run_id is distinct from old.extraction_ai_run_id
      or (old.status = 'draft' and new.status = 'confirmed')) then
    raise exception 'Outfit draft image and confirmation require trusted RPC' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger trg_guard_outfit_photo_draft_update
  before update on public.wardrobe_items for each row
  execute function public.guard_outfit_photo_draft_update();

create or replace function public.enqueue_outfit_photo_job(p_source_photo_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_user uuid := auth.uid(); v_job uuid; v_photo public.source_photos%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into v_photo from public.source_photos
    where id = p_source_photo_id and user_id = v_user for update;
  if not found or v_photo.status not in ('uploading','detecting') or not exists (
    select 1 from public.media_assets ma where ma.id = v_photo.media_asset_id
      and ma.owner_id = v_user and ma.status = 'active' and ma.kind = 'source_photo'
      and ma.bucket_id = 'private-wardrobe-media'
      and split_part(ma.object_path, '/', 1) = v_user::text
  ) then raise exception 'Source photo is not available' using errcode = '42501'; end if;
  insert into public.ai_jobs (user_id, job_type, idempotency_key, source_photo_id)
  values (v_user, 'outfit_photo', 'outfit-photo:' || p_source_photo_id::text || ':v1', p_source_photo_id)
  on conflict (user_id, job_type, idempotency_key) do update
    set updated_at = public.ai_jobs.updated_at returning id into v_job;
  update public.source_photos set status = 'detecting' where id = p_source_photo_id;
  return v_job;
end; $$;
revoke all on function public.enqueue_outfit_photo_job(uuid) from public, anon;
grant execute on function public.enqueue_outfit_photo_job(uuid) to authenticated;

-- A generic service-role completion cannot mark an outfit-photo job successful
-- without its garment transaction. Error completions still use complete_ai_job.
create or replace function public.guard_outfit_photo_job_completion()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.job_type = 'outfit_photo' and new.status = 'succeeded'
    and old.status is distinct from 'succeeded'
    and current_setting('app.outfit_photo_completed', true) is distinct from 'true' then
    raise exception 'Outfit photo completion requires garment transaction' using errcode = '42501';
  end if;
  if new.job_type = 'outfit_photo' and new.status = 'dead_letter'
    and old.status is distinct from 'dead_letter' and new.source_photo_id is not null then
    update public.source_photos set status = 'failed' where id = new.source_photo_id;
  end if;
  if new.job_type = 'outfit_photo' and new.status = 'queued'
    and old.status = 'dead_letter' and new.source_photo_id is not null then
    update public.source_photos set status = 'detecting' where id = new.source_photo_id;
  end if;
  return new;
end; $$;
create trigger trg_guard_outfit_photo_job_completion
  before update of status on public.ai_jobs for each row
  execute function public.guard_outfit_photo_job_completion();

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
    if v_category is null or v_category not in ('top','bottom','footwear','outerwear','accessory')
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
revoke all on function public.complete_outfit_photo_job(uuid, text, integer, text,
  text, text, text, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_outfit_photo_job(uuid, text, integer, text,
  text, text, text, integer, jsonb, jsonb) to service_role;

create or replace function public.confirm_outfit_photo_draft(p_item_id uuid, p_use_reconstructed boolean default false)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_user uuid := auth.uid(); v_item public.wardrobe_items%rowtype; v_asset public.media_assets%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select wi.* into v_item from public.wardrobe_items wi
    join public.user_wardrobe_items uwi on uwi.item_id = wi.id
    join public.source_photos sp on sp.id = wi.source_photo_id
    where wi.id = p_item_id and uwi.user_id = v_user and uwi.retired_at is null
      and sp.user_id = v_user and wi.status = 'draft' and wi.processing_status = 'extracted'
    for update of wi;
  if not found then raise exception 'Draft is not ready or not owned by caller' using errcode = '42501'; end if;
  select * into v_asset from public.media_assets
    where id = case when p_use_reconstructed then v_item.reconstructed_media_asset_id
      else v_item.original_media_asset_id end
      and owner_id = v_user and status = 'active' and kind = 'wardrobe_item'
      and split_part(object_path, '/', 1) = v_user::text;
  if not found then raise exception 'Private garment image is unavailable' using errcode = '42501'; end if;
  perform set_config('app.outfit_photo_confirmed', 'true', true);
  update public.wardrobe_items set media_asset_id = v_asset.id,
    image_url = 'private://' || v_asset.bucket_id || '/' || v_asset.object_path,
    status = 'confirmed' where id = p_item_id;
end; $$;
revoke all on function public.confirm_outfit_photo_draft(uuid, boolean) from public, anon;
grant execute on function public.confirm_outfit_photo_draft(uuid, boolean) to authenticated;

commit;
