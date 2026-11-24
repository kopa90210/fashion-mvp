-- Run with an administrative connection against isolated staging only.
-- Synthetic fixtures are rolled back; no real Storage objects are created.
BEGIN;
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); i uuid; j uuid; k uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); c uuid;
BEGIN
 INSERT INTO auth.users(id,email) VALUES(a,a::text||'@security-test.invalid'),(b,b::text||'@security-test.invalid');
 INSERT INTO public.media_assets(id,owner_id,object_path,kind,mime_type,byte_size) VALUES(m,a,a::text||'/'||m::text||'.jpg','wardrobe_item','image/jpeg',100),(n,b,b::text||'/'||n::text||'.jpg','wardrobe_item','image/jpeg',100);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 i:=public.create_draft_wardrobe_item('test-fixture',NULL);
 IF NOT EXISTS(SELECT 1 FROM public.wardrobe_items WHERE id=i AND owner_id=a) THEN RAISE EXCEPTION 'New owner not assigned'; END IF;
 PERFORM public.attach_media_asset_to_wardrobe_item(i,m);
 BEGIN PERFORM public.attach_media_asset_to_wardrobe_item(i,n); RAISE EXCEPTION 'Foreign media accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.set_owned_wardrobe_draft_status(i,'confirmed');
 UPDATE public.wardrobe_items SET display_name='Edited fixture' WHERE id=i;
 IF NOT FOUND THEN RAISE EXCEPTION 'Legitimate edit failed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 j:=public.create_draft_wardrobe_item('test-fixture',NULL);
 IF EXISTS(SELECT 1 FROM public.wardrobe_items WHERE id=i) THEN RAISE EXCEPTION 'Foreign read allowed'; END IF;
 BEGIN PERFORM public.remove_user_wardrobe_item(i); RAISE EXCEPTION 'Foreign deletion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 EXECUTE 'RESET ROLE';
 UPDATE public.user_wardrobe_items SET retired_at=now() WHERE user_id=a AND item_id=i;
 INSERT INTO public.user_wardrobe_items(user_id,item_id) VALUES(a,j);
 INSERT INTO public.wardrobe_items(id,source,status,image_url) VALUES(k,'user_upload','confirmed','test-fixture');
 INSERT INTO public.user_wardrobe_items(user_id,item_id) VALUES(a,k),(b,k);
 SELECT id INTO c FROM public.wardrobe_items WHERE source='curated' LIMIT 1;
 IF c IS NULL THEN RAISE EXCEPTION 'Curated fixture unavailable'; END IF;
 INSERT INTO public.user_wardrobe_items(user_id,item_id) VALUES(a,c),(b,c);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN PERFORM public.attach_media_asset_to_wardrobe_item(i,m); RAISE EXCEPTION 'Retired media replacement allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.remove_user_wardrobe_item(j); RAISE EXCEPTION 'Mismatched owner deletion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.remove_user_wardrobe_item(k); RAISE EXCEPTION 'Ambiguous legacy deletion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.remove_user_wardrobe_item(c);
 IF EXISTS(SELECT 1 FROM public.user_wardrobe_items WHERE user_id=a AND item_id=c) THEN RAISE EXCEPTION 'Curated removal failed'; END IF;
 PERFORM public.remove_user_wardrobe_item(i);
 EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM public.wardrobe_items WHERE id=i) THEN RAISE EXCEPTION 'Owned removal failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_wardrobe_items WHERE user_id=b AND item_id=c) THEN RAISE EXCEPTION 'Other curated membership removed'; END IF;
 IF has_function_privilege('anon','public.handle_new_user()','EXECUTE') OR has_function_privilege('authenticated','public.handle_new_user()','EXECUTE') OR has_function_privilege('anon','public.guard_wardrobe_item_pipeline_transitions()','EXECUTE') OR has_function_privilege('authenticated','public.guard_wardrobe_item_pipeline_transitions()','EXECUTE') THEN RAISE EXCEPTION 'Trigger grant remains'; END IF;
END $$;
SELECT 'P0-03C assertions passed' AS result;
ROLLBACK;
