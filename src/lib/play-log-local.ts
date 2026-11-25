// Local stand-in for the play-log tables, for playtests on a development machine
// before supabase/migrations/20261106_archive_play_log.sql is applied. Never used
// in production. Rows mirror play_sessions and play_events, one JSON object per line:
//   outputs/archive-race/play-logs/sessions.jsonl
//   outputs/archive-race/play-logs/events.jsonl
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'outputs', 'archive-race', 'play-logs');
const SESSIONS = path.join(DIR, 'sessions.jsonl');
const EVENTS = path.join(DIR, 'events.jsonl');

export const localPlayLogAllowed = () => process.env.NODE_ENV !== 'production';

type Session = { id: string; token_hash: string };
type Event = { eventId: string; seq: number; eventType: string; occurredAt: string; elapsedMs: number; payload: Record<string, unknown> };

async function lines<T>(file: string): Promise<T[]> {
    const text = await readFile(file, 'utf8').catch(() => '');
    return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as T);
}

export async function createLocalPlaySession(row: { token_hash: string; protocol_version: string; consent_version: string; mode: string; locale: string | null }): Promise<string> {
    const id = randomUUID();
    await mkdir(DIR, { recursive: true });
    await appendFile(SESSIONS, JSON.stringify({ id, ...row, created_at: new Date().toISOString() }) + '\n', 'utf8');
    return id;
}

export async function findLocalPlaySession(id: string): Promise<Session | null> {
    return (await lines<Session>(SESSIONS)).find(s => s.id === id) ?? null;
}

let seen: Set<string> | null = null;
/** Appends events, skipping event ids already stored (retries resend them). */
export async function appendLocalPlayEvents(sessionId: string, events: Event[]): Promise<number> {
    seen ??= new Set((await lines<{ event_id: string }>(EVENTS)).map(e => e.event_id));
    const fresh = events.filter(e => !seen!.has(e.eventId));
    if (!fresh.length) return 0;
    fresh.forEach(e => seen!.add(e.eventId));
    await appendFile(EVENTS, fresh.map(e => JSON.stringify({
        session_id: sessionId, event_id: e.eventId, seq: e.seq, event_type: e.eventType,
        occurred_at: e.occurredAt, elapsed_ms: e.elapsedMs, payload: e.payload, created_at: new Date().toISOString(),
    })).join('\n') + '\n', 'utf8');
    return fresh.length;
}
