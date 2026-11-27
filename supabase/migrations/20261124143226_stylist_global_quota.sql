CREATE TABLE public.stylist_global_quota_windows (
 quota_type text NOT NULL CHECK (quota_type IN ('gemini_daily','gemini_monthly')),
 window_start timestamptz NOT NULL,
 used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (quota_type,window_start)
);
ALTER TABLE public.stylist_global_quota_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stylist_global_quota_windows FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.stylist_global_quota_windows TO service_role;

-- Preserve the existing RPC contract so older application builds cannot bypass global limits.
CREATE OR REPLACE FUNCTION public.reserve_stylist_quota(p_user_id uuid,p_quota_type text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 v_day timestamptz := date_trunc('day',now(),'UTC');
 v_month timestamptz := date_trunc('month',now(),'UTC');
 v_count integer;
BEGIN
 IF p_quota_type = 'api_hourly' THEN
  INSERT INTO public.stylist_quota_windows AS q (user_id,quota_type,window_start,used_count)
  VALUES (p_user_id,'api_hourly',date_trunc('hour',now(),'UTC'),1)
  ON CONFLICT (user_id,quota_type,window_start) DO UPDATE
  SET used_count=q.used_count+1, updated_at=now()
  WHERE q.used_count < 20
  RETURNING used_count INTO v_count;
  RETURN v_count IS NOT NULL;
 ELSIF p_quota_type IS DISTINCT FROM 'gemini_daily' THEN
  RAISE EXCEPTION 'Invalid quota type';
 END IF;
 -- Exception block is a subtransaction. A quota denial rolls back all writes
 -- in this block, including inserted rows. Unexpected errors propagate.
 -- Every Gemini request acquires locks in month -> day -> user order.
 BEGIN
  INSERT INTO public.stylist_global_quota_windows AS q (quota_type,window_start,used_count)
  VALUES ('gemini_monthly',v_month,1)
  ON CONFLICT (quota_type,window_start) DO UPDATE
  SET used_count=q.used_count+1, updated_at=now()
  WHERE q.used_count < 3000 RETURNING used_count INTO v_count;
  IF NOT FOUND THEN RAISE SQLSTATE 'SG001' USING MESSAGE='Monthly quota exhausted'; END IF;
  INSERT INTO public.stylist_global_quota_windows AS q (quota_type,window_start,used_count)
  VALUES ('gemini_daily',v_day,1)
  ON CONFLICT (quota_type,window_start) DO UPDATE
  SET used_count=q.used_count+1, updated_at=now()
  WHERE q.used_count < 100 RETURNING used_count INTO v_count;
  IF NOT FOUND THEN RAISE SQLSTATE 'SG001' USING MESSAGE='Daily quota exhausted'; END IF;
  INSERT INTO public.stylist_quota_windows AS q (user_id,quota_type,window_start,used_count)
  VALUES (p_user_id,'gemini_daily',v_day,1)
  ON CONFLICT (user_id,quota_type,window_start) DO UPDATE
  SET used_count=q.used_count+1, updated_at=now()
  WHERE q.used_count < 10 RETURNING used_count INTO v_count;
  IF NOT FOUND THEN RAISE SQLSTATE 'SG001' USING MESSAGE='User quota exhausted'; END IF;
  RETURN true;
 EXCEPTION WHEN SQLSTATE 'SG001' THEN
  RETURN false;
 END;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_stylist_quota(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stylist_quota(uuid,text) TO service_role;
