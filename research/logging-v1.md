# TOCHI logging v1

This is the smallest study log for the generator. It is separate from the public-facing `surveys` record and is written only for participants who accept the research consent after this version is deployed.

## Data model

`research_sessions` links one consented `surveys.id` to consent and questionnaire versions, initial locale, and a SHA-256 hash of an opaque session posting token. The token can post multiple append-only events for that one session; it is not a one-time token. `research_events` has a unique client event UUID for retry idempotency. It records: first free-text account before supplementary questions, submitted questionnaire snapshot, archive/material snapshot and generated concepts, explicit concept selection and revision/undo, folklore-details opening, image request/completion/failure, and narrative edits.

Each successful completion event includes a separate, low-resolution 256px JPEG snapshot, its base64 SHA-256, generation version, model, and generated narrative. This keeps the image the participant actually compared tied to that event; the larger `surveys.yokai_image_b64` remains only the latest display/print copy. The raw provider image is not copied into research events. The event payload distinguishes participant input, archive records, and model output.

## Access and consent

No RLS policy grants anonymous or authenticated clients access to research tables. The server routes use `SUPABASE_SERVICE_ROLE_KEY` and require the session token. The entry route accepts a research session only when `consentAccepted: true` and `consentVersion: experience-log-consent-v1` match; it saves that version in the session. The token is placed in the participant QR fragment (`#rt=…`), never its query string; generator scanners import it into session storage. Existing tickets have no token and are not logged. A declined or tokenless session is a no-op. Logging errors show a non-blocking notice and do not interrupt generation or printing.

## Deployment

1. Set `SUPABASE_SERVICE_ROLE_KEY` on the Next.js server; do not expose it as `NEXT_PUBLIC_*`.
2. Apply [`supabase/migrations/20260906_research_logging.sql`](../supabase/migrations/20260906_research_logging.sql) through the Supabase CLI or dashboard. If the passwordless linked CLI path fails while initialising `cli_login_postgres`, use the Dashboard SQL Editor or the official password-based CLI connection (`SUPABASE_DB_PASSWORD` / `--db-url`); do not alter or delete the internal CLI role as part of this migration.
3. Verify `research_sessions` and `research_events` have RLS enabled and no anon/authenticated policies. The migration explicitly grants only `SELECT, INSERT` to `service_role`.
4. Confirm the consent screen includes the experience-record statement before enabling collection.

The migration adds `survey_declined` with `ADD COLUMN IF NOT EXISTS` to accommodate deployments whose existing `surveys` table predates that field. It does not change existing `surveys` public policies. Retention, deletion, and access-review policy remain a study governance decision and are not set by this implementation.
