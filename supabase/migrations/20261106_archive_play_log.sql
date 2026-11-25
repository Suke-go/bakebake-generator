-- Append-only play logs for the map journey (and the later similarity race).
-- Only opt-in sessions are created. Payloads hold record ids, ranks and
-- timings; the server rejects free text (see src/lib/play-log-contract.ts).
CREATE TABLE IF NOT EXISTS public.play_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    protocol_version text NOT NULL,
    consent_version text NOT NULL,
    mode text NOT NULL,
    locale text CHECK (locale IS NULL OR locale IN ('ja', 'en')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.play_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.play_sessions(id) ON DELETE CASCADE,
    event_id uuid NOT NULL UNIQUE,
    seq integer NOT NULL CHECK (seq >= 0),
    event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 80),
    occurred_at timestamptz NOT NULL,
    elapsed_ms integer NOT NULL CHECK (elapsed_ms >= 0),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT play_events_session_seq_key UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS play_sessions_created_idx ON public.play_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS play_events_session_seq_idx ON public.play_events (session_id, seq);

ALTER TABLE public.play_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.play_sessions, public.play_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.play_sessions, public.play_events TO service_role;
