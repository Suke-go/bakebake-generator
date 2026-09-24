-- Blind expert coding of record labels (expert_audit, PREREG_STUDY_v2). One row per coder link.
CREATE TABLE IF NOT EXISTS public.label_coding_sessions (
    id uuid PRIMARY KEY,
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    coder text NOT NULL CHECK (coder IN ('first', 'second')),
    label text NOT NULL DEFAULT '',
    items jsonb NOT NULL,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.label_coding_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.label_coding_sessions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.label_coding_sessions TO service_role;
COMMENT ON TABLE public.label_coding_sessions IS 'Blind expert coding of LLM-labelled folklore records (position, disturbance, handling).';
