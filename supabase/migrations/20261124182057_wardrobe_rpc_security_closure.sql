CREATE OR REPLACE FUNCTION public.attach_media_asset_to_wardrobe_item(p_item_id uuid,p_media_asset_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); b text; path text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.wardrobe_items w JOIN public.user_wardrobe_items m ON m.item_id=w.id
 WHERE w.id=p_item_id AND w.source='user_upload' AND m.user_id=u AND m.retired_at IS NULL AND (w.owner_id IS NULL OR w.owner_id=u)
 AND NOT EXISTS (SELECT 1 FROM public.user_wardrobe_items x WHERE x.item_id=w.id AND x.user_id<>u) FOR UPDATE OF w,m;
 IF NOT FOUND THEN RAISE EXCEPTION 'Garment unavailable' USING ERRCODE='42501'; END IF;
 SELECT bucket_id,object_path INTO b,path FROM public.media_assets WHERE id=p_media_asset_id AND owner_id=u AND kind='wardrobe_item' AND status='active' AND bucket_id='private-wardrobe-media' AND split_part(object_path,'/',1)=u::text;
 IF NOT FOUND THEN RAISE EXCEPTION 'Media unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.wardrobe_items SET media_asset_id=p_media_asset_id,image_url='private://'||b||'/'||path WHERE id=p_item_id;
END $$;
CREATE OR REPLACE FUNCTION public.remove_user_wardrobe_item(p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); s text; o uuid;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 SELECT w.source,w.owner_id INTO s,o FROM public.wardrobe_items w JOIN public.user_wardrobe_items m ON m.item_id=w.id WHERE w.id=p_item_id AND m.user_id=u FOR UPDATE OF w,m;
 IF NOT FOUND THEN RAISE EXCEPTION 'Garment unavailable' USING ERRCODE='42501'; END IF;
 IF s='user_upload' THEN
 IF (o IS NOT NULL AND o<>u) OR EXISTS(SELECT 1 FROM public.user_wardrobe_items x WHERE x.item_id=p_item_id AND x.user_id<>u) THEN RAISE EXCEPTION 'Ambiguous ownership' USING ERRCODE='42501'; END IF;
 DELETE FROM public.wardrobe_items WHERE id=p_item_id;
 ELSE DELETE FROM public.user_wardrobe_items WHERE user_id=u AND item_id=p_item_id; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.create_draft_wardrobe_item(p_image_url text,p_source_photo_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); i uuid;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF p_source_photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.source_photos WHERE id=p_source_photo_id AND user_id=u) THEN RAISE EXCEPTION 'Photo unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.wardrobe_items(image_url,source,status,source_photo_id,processing_status,prettify_status,owner_id) VALUES(p_image_url,'user_upload','draft',p_source_photo_id,'detected','none',u) RETURNING id INTO i;
 INSERT INTO public.user_wardrobe_items(user_id,item_id,quantity) VALUES(u,i,1);
 RETURN i;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user(),public.guard_wardrobe_item_pipeline_transitions() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.attach_media_asset_to_wardrobe_item(uuid,uuid),public.remove_user_wardrobe_item(uuid),public.create_draft_wardrobe_item(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_media_asset_to_wardrobe_item(uuid,uuid),public.remove_user_wardrobe_item(uuid),public.create_draft_wardrobe_item(text,uuid) TO authenticated;

