-- Contact-statement user study (PREREG_STUDY_20260924). Participants write two accounts,
-- then rate eight folklore records per account; one account shows connection statements.
CREATE TABLE IF NOT EXISTS public.contact_study_sessions (
    id uuid PRIMARY KEY,
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    protocol_version text NOT NULL CHECK (protocol_version = 'contact-study-v1'),
    phase text NOT NULL CHECK (phase IN ('accounts', 'waiting', 'review', 'complete')),
    state jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_study_sessions_phase_idx ON public.contact_study_sessions (phase);
ALTER TABLE public.contact_study_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contact_study_sessions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.contact_study_sessions TO service_role;
COMMENT ON TABLE public.contact_study_sessions IS 'Contact-statement user study (contact-study-v1). Accounts are personal; do not export outside the research team.';
