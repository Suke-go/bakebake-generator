-- Contact-study: email for the second-session invitation (kept out of state/exports), and a second link per session.
ALTER TABLE public.contact_study_sessions ADD COLUMN IF NOT EXISTS contact_email text CHECK (contact_email IS NULL OR length(contact_email) <= 200);
ALTER TABLE public.contact_study_sessions ADD COLUMN IF NOT EXISTS alt_token_hash text UNIQUE CHECK (alt_token_hash IS NULL OR alt_token_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.contact_study_sessions ADD COLUMN IF NOT EXISTS notified_at timestamptz;
COMMENT ON COLUMN public.contact_study_sessions.contact_email IS 'Used only to send the second-session link. Never exported with results. Delete at the end of the study.';
