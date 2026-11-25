-- Service-only persistence of a completed, validated daily decision.
alter table public.ai_decisions add column outfit_id uuid references public.outfits(id) on delete set null;
create function public.persist_metered_daily_outfit(p_user_id uuid,p_request_id uuid,p_scheduled_for date)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 d public.ai_decisions%rowtype; v_id uuid; ids uuid[]; slots text[]; v_timezone text; v_source text;
begin
 select * into d from public.ai_decisions where user_id=p_user_id and request_id=p_request_id and component='daily_outfit' for update;
 if not found or d.source is null or d.source='UNAVAILABLE' or d.result is null then raise exception 'No completed daily decision'; end if;
 if jsonb_typeof(d.result->'item_ids') is distinct from 'array' then raise exception 'Invalid item ids'; end if;
 select array_agg(x::uuid order by ord) into ids from jsonb_array_elements_text(d.result->'item_ids') with ordinality as t(x,ord);
 if coalesce(cardinality(ids),0) not between 2 and 5 or cardinality(ids)<>cardinality(array(select distinct unnest(ids))) then raise exception 'Invalid outfit ids'; end if;
 select timezone into v_timezone from public.users where id=p_user_id;
 if not public.is_valid_iana_timezone(v_timezone) or p_scheduled_for is distinct from (now() at time zone v_timezone)::date then raise exception 'Invalid daily date'; end if;
 -- Lock the owned, confirmed rows against concurrent retirement or mutation.
 perform 1 from public.user_wardrobe_items uw join public.wardrobe_items w on w.id=uw.item_id where uw.user_id=p_user_id and uw.item_id=any(ids) and uw.retired_at is null and w.status='confirmed' for share of uw,w;
 select array_agg(w.layer_role order by a.ord) into slots from unnest(ids) with ordinality a(id,ord) join public.user_wardrobe_items uw on uw.item_id=a.id and uw.user_id=p_user_id and uw.retired_at is null join public.wardrobe_items w on w.id=a.id and w.status='confirmed';
 if coalesce(cardinality(slots),0)<>cardinality(ids) or public.is_valid_outfit_slots(slots) is distinct from true then raise exception 'Invalid owned outfit'; end if;
 if d.outfit_id is not null then
  if not exists(select 1 from public.outfits where id=d.outfit_id and user_id=p_user_id and item_ids=to_jsonb(ids)) then raise exception 'Stored outfit mismatch'; end if;
  return d.outfit_id;
 end if;
 -- Keep the legacy daily unique index intact. A metered decision uses an engine
 -- row with authoritative provenance in the service-only ledger, not a forged source.
 v_source:='engine';
 insert into public.outfits(user_id,item_ids,source,scheduled_for,reasoning,styling_tip,generator_version,context_snapshot,fashion_dna_updated_at)
 values(p_user_id,to_jsonb(ids),v_source,p_scheduled_for,d.result->'reasoning',d.result->>'styling_tip','metered-daily-v1',jsonb_build_object('metered_daily',true), (select updated_at from public.fashion_dna where user_id=p_user_id))
 returning id into v_id;
 insert into public.outfit_items(outfit_id,wardrobe_item_id,slot,position)
 select v_id,a.id,slots[a.ord::integer],(a.ord-1)::smallint from unnest(ids) with ordinality a(id,ord);
 update public.ai_decisions set outfit_id=v_id where user_id=p_user_id and request_id=p_request_id and component='daily_outfit';
 return v_id;
end $$;
revoke all on function public.persist_metered_daily_outfit(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.persist_metered_daily_outfit(uuid,uuid,date) to service_role;

