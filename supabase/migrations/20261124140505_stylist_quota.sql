CREATE TABLE public.stylist_quota_windows (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 quota_type text NOT NULL CHECK (quota_type IN ('api_hourly','gemini_daily')),
 window_start timestamptz NOT NULL,
 used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,quota_type,window_start)
);
ALTER TABLE public.stylist_quota_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stylist_quota_windows FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.stylist_quota_windows TO service_role;
CREATE FUNCTION public.reserve_stylist_quota(p_user_id uuid,p_quota_type text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_limit integer; v_window timestamptz; v_count integer;
BEGIN
 CASE p_quota_type
 WHEN 'api_hourly' THEN v_limit := 20; v_window := date_trunc('hour',now(),'UTC');
 WHEN 'gemini_daily' THEN v_limit := 10; v_window := date_trunc('day',now(),'UTC');
 ELSE RAISE EXCEPTION 'Invalid quota type';
 END CASE;
 INSERT INTO public.stylist_quota_windows AS q (user_id,quota_type,window_start,used_count)
 VALUES (p_user_id,p_quota_type,v_window,1)
 ON CONFLICT (user_id,quota_type,window_start) DO UPDATE
 SET used_count=q.used_count+1, updated_at=now()
 WHERE q.used_count < v_limit
 RETURNING used_count INTO v_count;
 RETURN v_count IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_stylist_quota(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stylist_quota(uuid,text) TO service_role;
