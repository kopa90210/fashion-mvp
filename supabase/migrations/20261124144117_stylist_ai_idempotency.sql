CREATE TABLE public.stylist_ai_requests (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
 state text NOT NULL CHECK (state IN ('running','completed')),
 claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
 lease_until timestamptz NOT NULL DEFAULT now()+interval '30 seconds',
 intent jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,request_id),
 CHECK (intent IS NULL OR (state='completed' AND jsonb_typeof(intent)='object' AND octet_length(intent::text)<=2048))
);
CREATE INDEX stylist_ai_requests_active_idx ON public.stylist_ai_requests(user_id,lease_until) WHERE state='running';
ALTER TABLE public.stylist_ai_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stylist_ai_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.stylist_ai_requests TO service_role;

CREATE FUNCTION public.begin_stylist_ai(p_user_id uuid,p_request_id uuid,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.stylist_ai_requests%ROWTYPE;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid request identity'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 602));
 SELECT * INTO r FROM public.stylist_ai_requests WHERE user_id=p_user_id AND request_id=p_request_id;
 IF FOUND THEN
  IF r.fingerprint<>p_fingerprint THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF r.state='completed' THEN RETURN jsonb_build_object('status','completed','intent',r.intent); END IF;
  IF r.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('status','busy'); END IF;
  -- Never re-execute an ambiguous expired claim with the same key.
  UPDATE public.stylist_ai_requests SET state='completed',intent=NULL WHERE user_id=p_user_id AND request_id=p_request_id;
  RETURN jsonb_build_object('status','completed','intent',NULL);
 END IF;
 IF EXISTS(SELECT 1 FROM public.stylist_ai_requests WHERE user_id=p_user_id AND state='running' AND lease_until>clock_timestamp()) THEN RETURN jsonb_build_object('status','busy'); END IF;
 IF NOT public.reserve_stylist_quota(p_user_id,'gemini_daily') THEN
  INSERT INTO public.stylist_ai_requests(user_id,request_id,fingerprint,state) VALUES(p_user_id,p_request_id,p_fingerprint,'completed');
  RETURN jsonb_build_object('status','completed','intent',NULL);
 END IF;
 INSERT INTO public.stylist_ai_requests(user_id,request_id,fingerprint,state,lease_until)
 VALUES(p_user_id,p_request_id,p_fingerprint,'running',clock_timestamp()+interval '30 seconds') RETURNING * INTO r;
 RETURN jsonb_build_object('status','claimed','token',r.claim_token);
END;
$$;

CREATE FUNCTION public.finish_stylist_ai(p_user_id uuid,p_request_id uuid,p_token uuid,p_intent jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,602));
 UPDATE public.stylist_ai_requests SET state='completed',intent=p_intent
 WHERE user_id=p_user_id AND request_id=p_request_id AND claim_token=p_token AND state='running' AND lease_until>clock_timestamp();
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_stylist_ai(uuid,uuid,text),public.finish_stylist_ai(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_stylist_ai(uuid,uuid,text),public.finish_stylist_ai(uuid,uuid,uuid,jsonb) TO service_role;
