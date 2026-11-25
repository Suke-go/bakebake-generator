import { NextResponse } from 'next/server';
import { isPlayUuid, MAX_BATCH_BYTES, parsePlayEventBatch } from '@/lib/play-log-contract';
import { appendLocalPlayEvents, findLocalPlaySession, localPlayLogAllowed } from '@/lib/play-log-local';
import { getResearchSupabase, matchesResearchToken } from '@/lib/research-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    const supabase = getResearchSupabase();
    if (!supabase && !localPlayLogAllowed()) return NextResponse.json({ error: 'Play logging unavailable' }, { status: 503 });
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BATCH_BYTES) return NextResponse.json({ error: 'Batch too large' }, { status: 413 });
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const token = typeof body.token === 'string' ? body.token : '';
    const events = parsePlayEventBatch(body.events);
    if (!isPlayUuid(body.sessionId) || !token || !events) return NextResponse.json({ error: 'Invalid play events' }, { status: 400 });

    // Sessions opened in the local file (development only) are logged there.
    const local = localPlayLogAllowed() ? await findLocalPlaySession(body.sessionId) : null;
    if (local) {
        if (!matchesResearchToken(token, local.token_hash)) return NextResponse.json({ error: 'Play session not authorized' }, { status: 403 });
        await appendLocalPlayEvents(local.id, events);
        return NextResponse.json({ accepted: events.length });
    }
    if (!supabase) return NextResponse.json({ error: 'Play session not authorized' }, { status: 403 });
    const { data: session, error: sessionError } = await supabase.from('play_sessions').select('id, token_hash').eq('id', body.sessionId).maybeSingle();
    if (sessionError || !session || !matchesResearchToken(token, session.token_hash)) {
        return NextResponse.json({ error: 'Play session not authorized' }, { status: 403 });
    }
    // Retries resend the same event ids; ignoring duplicates keeps the log append-only.
    const { error } = await supabase.from('play_events').upsert(events.map(event => ({
        session_id: session.id, event_id: event.eventId, seq: event.seq, event_type: event.eventType,
        occurred_at: event.occurredAt, elapsed_ms: event.elapsedMs, payload: event.payload,
    })), { onConflict: 'event_id', ignoreDuplicates: true });
    if (error) {
        console.error('play-log insert failed', error);
        return NextResponse.json({ error: 'Could not save play events' }, { status: 500 });
    }
    return NextResponse.json({ accepted: events.length });
}
