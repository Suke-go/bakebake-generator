-- Minimal, non-public research log for the generator study.
-- Apply this migration before enabling the server routes below.

ALTER TABLE public.surveys
    ADD COLUMN IF NOT EXISTS survey_declined boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.research_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id uuid NOT NULL UNIQUE REFERENCES public.surveys(id) ON DELETE RESTRICT,
    consented_at timestamptz NOT NULL DEFAULT now(),
    consent_version text NOT NULL,
    questionnaire_version text NOT NULL,
    initial_locale text NOT NULL CHECK (initial_locale IN ('ja', 'en')),
    token_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.research_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.research_sessions(id) ON DELETE RESTRICT,
    event_id uuid NOT NULL UNIQUE,
    event_type text NOT NULL,
    occurred_at timestamptz NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT research_events_type_length CHECK (char_length(event_type) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS research_events_session_created_at_idx
    ON public.research_events (session_id, created_at);

ALTER TABLE public.research_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_events ENABLE ROW LEVEL SECURITY;

-- Deliberately define no anon/authenticated policies. The service-role API is
-- the only writer, and research records are never exposed through the public
-- Supabase client. Existing `surveys` policies remain unchanged.
REVOKE ALL ON TABLE public.research_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.research_events FROM anon, authenticated;

-- The Next.js server uses SUPABASE_SERVICE_ROLE_KEY for the two append-only
-- routes. Make those required privileges explicit rather than relying on
-- database default privileges. No UPDATE or DELETE grant is required.
GRANT SELECT, INSERT ON TABLE public.research_sessions TO service_role;
GRANT SELECT, INSERT ON TABLE public.research_events TO service_role;
