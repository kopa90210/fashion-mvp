CREATE TABLE public.stylist_ai_telemetry (
 user_id uuid NOT NULL,
 request_id uuid NOT NULL,
 model text NOT NULL CHECK (model ~ '^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$'),
 status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','success','invalid_response','http_error','network_error','timeout','invalid_model')),
 input_tokens integer CHECK (input_tokens >= 0),
 output_tokens integer CHECK (output_tokens >= 0),
 thought_tokens integer CHECK (thought_tokens >= 0),
 latency_ms integer CHECK (latency_ms >= 0),
 pricing_version text CHECK (length(pricing_version)<=80),
 estimated_cost_usd numeric(18,9) CHECK (estimated_cost_usd >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id),
 FOREIGN KEY(user_id,request_id) REFERENCES public.stylist_ai_requests(user_id,request_id) ON DELETE CASCADE,
 CHECK ((estimated_cost_usd IS NULL) = (pricing_version IS NULL))
);
ALTER TABLE public.stylist_ai_telemetry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stylist_ai_telemetry FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.stylist_ai_telemetry TO service_role;
CREATE FUNCTION public.begin_stylist_ai_metered(p_user_id uuid,p_request_id uuid,p_fingerprint text,p_model text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;
BEGIN
 r:=public.begin_stylist_ai(p_user_id,p_request_id,p_fingerprint);
 IF r->>'status'='claimed' THEN
 INSERT INTO public.stylist_ai_telemetry(user_id,request_id,model) VALUES(p_user_id,p_request_id,p_model);
 END IF;
 RETURN r;
END; $$;
CREATE FUNCTION public.finish_stylist_ai_metered(p_user_id uuid,p_request_id uuid,p_token uuid,p_intent jsonb,p_status text,p_input integer,p_output integer,p_thought integer,p_latency integer,p_pricing_version text,p_cost numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.finish_stylist_ai(p_user_id,p_request_id,p_token,p_intent) THEN RETURN false; END IF;
 UPDATE public.stylist_ai_telemetry SET status=p_status,input_tokens=p_input,output_tokens=p_output,thought_tokens=p_thought,latency_ms=p_latency,pricing_version=p_pricing_version,estimated_cost_usd=p_cost
 WHERE user_id=p_user_id AND request_id=p_request_id AND status='reserved';
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing telemetry reservation'; END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.begin_stylist_ai_metered(uuid,uuid,text,text),public.finish_stylist_ai_metered(uuid,uuid,uuid,jsonb,text,integer,integer,integer,integer,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_stylist_ai_metered(uuid,uuid,text,text),public.finish_stylist_ai_metered(uuid,uuid,uuid,jsonb,text,integer,integer,integer,integer,text,numeric) TO service_role;
