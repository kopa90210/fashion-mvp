create or replace function public.add_curated_wardrobe_pieces(p_item_ids uuid[]) returns integer
language plpgsql security definer set search_path=pg_catalog as $$
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
