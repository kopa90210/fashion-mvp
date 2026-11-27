create or replace function public.finalize_onboarding_owned_selection(p_expected_version integer)
returns table(item_count integer, completed boolean, selection_version integer)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_row public.onboarding_owned_selections%rowtype;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':onboarding-ownership', 0));
  select * into v_row from public.onboarding_owned_selections
    where user_id = v_user for update;
  if not found then
    raise exception 'No ownership selection to finalize' using errcode = '22023';
  end if;
  if p_expected_version is distinct from v_row.version then
    raise exception 'Selection changed; reload and try again' using errcode = '40001';
  end if;
  if v_row.committed_at is not null then
    return query select cardinality(v_row.item_ids), true, v_row.version;
    return;
  end if;
  if not exists (select 1 from public.fashion_dna where user_id=v_user and quiz_signals is not null) then
    raise exception 'Complete the style quiz first' using errcode='22023';
  end if;
  if exists (
    select 1 from unnest(v_row.item_ids) selected(id)
    left join public.wardrobe_items wi on wi.id = selected.id
      and wi.source = 'curated' and wi.status = 'confirmed'
    where wi.id is null
  ) then
    raise exception 'Selection contains an unavailable piece' using errcode = '22023';
  end if;
  insert into public.user_wardrobe_items(user_id, item_id, quantity, retired_at)
    select v_user, id, 1, null from unnest(v_row.item_ids) selected(id)
    on conflict (user_id, item_id) do update set retired_at = null;
  -- Invalidate pre-commit work before freeing the generated daily slot. A
  -- running worker holds the job row lock while persisting, so this waits for
  -- it and the following update supersedes any outfit it produced.
  update public.ai_jobs j
    set status = 'dead_letter', lease_owner = null, lease_expires_at = null,
        safe_error_code = 'STALE_LEASE', updated_at = now()
    where j.user_id = v_user and j.job_type = 'daily_outfit'
      and j.scheduled_for = (
        now() at time zone (select u.timezone from public.users u where u.id = v_user)
      )::date
      and j.status in ('queued', 'running', 'retry_wait');
  -- Keep prior daily rows and their interactions as history, while freeing
  -- today's generated slot for the updated owned wardrobe.
  update public.outfits o set status = 'superseded'
    where o.user_id = v_user and o.source in ('daily_ai', 'daily_fallback')
      and o.status = 'generated'
      and o.scheduled_for = (
        now() at time zone (select u.timezone from public.users u where u.id = v_user)
      )::date;
  update public.users set has_completed_calibration = true where id = v_user;
  update public.onboarding_owned_selections set committed_at = now()
    where user_id = v_user;
  return query select cardinality(v_row.item_ids), true, v_row.version;
end;
$$;
revoke all on function public.finalize_onboarding_owned_selection(integer) from public, anon;
grant execute on function public.finalize_onboarding_owned_selection(integer) to authenticated;


create function public.add_curated_wardrobe_pieces(p_item_ids uuid[]) returns integer
language plpgsql security invoker set search_path=pg_catalog as $$
declare u uuid:=auth.uid(); n integer;
begin
 if u is null then raise exception 'Not authenticated' using errcode='42501'; end if;
 if p_item_ids is null or cardinality(p_item_ids)>100 or array_position(p_item_ids,null) is not null or cardinality(p_item_ids)<>cardinality(array(select distinct unnest(p_item_ids))) then raise exception 'Invalid selection' using errcode='22023'; end if;
 if exists(select 1 from unnest(p_item_ids) s(id) left join public.wardrobe_items w on w.id=s.id and w.source='curated' and w.status='confirmed' where w.id is null) then raise exception 'Unavailable curated piece' using errcode='22023'; end if;
 insert into public.user_wardrobe_items(user_id,item_id,quantity,retired_at) select u,id,1,null from unnest(p_item_ids) s(id)
 on conflict(user_id,item_id) do update set retired_at=null where public.user_wardrobe_items.retired_at is not null;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.add_curated_wardrobe_pieces(uuid[]) from public,anon;
grant execute on function public.add_curated_wardrobe_pieces(uuid[]) to authenticated;
