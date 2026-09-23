-- Public exploratory case collection. This table is separate from the
-- prospective pilot and confirmatory study ledgers.
CREATE TABLE IF NOT EXISTS public.public_experiment_sessions (
    id uuid PRIMARY KEY,
    token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    protocol_version text NOT NULL CHECK (protocol_version = 'public-explore-e5-v1'),
    phase text NOT NULL CHECK (phase IN ('initial', 'contact', 'foil', 'final', 'complete')),
    revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
    state jsonb NOT NULL,
    last_action_id uuid,
    last_action_hash text CHECK (last_action_hash IS NULL OR last_action_hash ~ '^[0-9a-f]{64}$'),
    last_response jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_experiment_sessions_created_idx
    ON public.public_experiment_sessions (created_at DESC);

ALTER TABLE public.public_experiment_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_experiment_sessions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.public_experiment_sessions TO service_role;

COMMENT ON TABLE public.public_experiment_sessions IS
    'Exploratory public folklore-reference cases. Not part of the frozen T49 participant pilot or confirmatory sample.';
