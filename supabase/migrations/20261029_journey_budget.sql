-- Public CHIIR entry: reserve before generation, consume once before reranking.
-- 800 JPY/month reserved for requests; 200 JPY left for deployment/overhead.
CREATE TABLE IF NOT EXISTS public.journey_budget_month (
 month_jst date PRIMARY KEY, reserved_yen integer NOT NULL CHECK(reserved_yen BETWEEN 0 AND 800)
);
CREATE TABLE IF NOT EXISTS public.journey_entry_ticket (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), consumed boolean NOT NULL DEFAULT false
);
ALTER TABLE public.journey_budget_month ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_entry_ticket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journey_budget_month,public.journey_entry_ticket FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.journey_budget_month,public.journey_entry_ticket TO service_role;
CREATE OR REPLACE FUNCTION public.reserve_journey_entry(p_account_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE reserved integer; ticket uuid;
BEGIN
 IF length(p_account_hash)<>64 THEN RETURN NULL; END IF;
 INSERT INTO public.journey_budget_month VALUES (date_trunc('month',now() AT TIME ZONE 'Asia/Tokyo')::date,50)
 ON CONFLICT(month_jst) DO UPDATE SET reserved_yen=journey_budget_month.reserved_yen+50 WHERE journey_budget_month.reserved_yen<=750
 RETURNING reserved_yen INTO reserved;
 IF reserved IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.journey_entry_ticket(account_hash) VALUES(p_account_hash) RETURNING id INTO ticket;
 RETURN ticket;
END; $$;
CREATE OR REPLACE FUNCTION public.claim_journey_entry(p_ticket uuid,p_account_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE claimed uuid;
BEGIN
 UPDATE public.journey_entry_ticket SET consumed=true WHERE id=p_ticket AND account_hash=p_account_hash AND NOT consumed
 AND created_at>now()-interval '20 minutes' RETURNING id INTO claimed;
 RETURN claimed IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_journey_entry(text), public.claim_journey_entry(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_journey_entry(text), public.claim_journey_entry(uuid,text) TO service_role;
