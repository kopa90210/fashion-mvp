REVOKE UPDATE ON public.user_wardrobe_items, public.wardrobe_items FROM PUBLIC, anon, authenticated;
GRANT UPDATE (quantity, notes) ON public.user_wardrobe_items TO authenticated;
GRANT UPDATE (category, subcategory, brand, display_name, color, fit, style_tags, material, season_weights, layer_role) ON public.wardrobe_items TO authenticated;

CREATE FUNCTION public.set_owned_wardrobe_draft_status(p_item_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL OR p_status IS NULL OR p_status NOT IN ('confirmed','rejected') THEN
  RAISE EXCEPTION 'Invalid draft transition' USING ERRCODE='42501';
 END IF;
 UPDATE public.wardrobe_items wi SET status=p_status
 WHERE wi.id=p_item_id AND wi.source='user_upload' AND wi.status='draft'
 AND (p_status='rejected' OR (wi.source_photo_id IS NULL AND wi.original_media_asset_id IS NULL))
 AND EXISTS (SELECT 1 FROM public.user_wardrobe_items u WHERE u.item_id=wi.id AND u.user_id=v_user AND u.retired_at IS NULL)
 AND (wi.owner_id IS NULL OR wi.owner_id=v_user);
 IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable or transition forbidden' USING ERRCODE='42501'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_owned_wardrobe_draft_status(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_owned_wardrobe_draft_status(uuid,text) TO authenticated;

