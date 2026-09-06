import { NextResponse } from 'next/server';
import { getResearchSupabase, matchesResearchToken } from '@/lib/research-server';

const MAX_PAYLOAD_BYTES = 256 * 1024;
const EVENT_TYPE = /^[a-z][a-z0-9_]{0,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
    const supabase = getResearchSupabase();
    if (!supabase) return NextResponse.json({ error: 'Research logging unavailable' }, { status: 503 });

    let body: Record<string, unknown>;
    try {
        body = await request.json() as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId : '';
    const token = typeof body.token === 'string' ? body.token : '';
    const event = body.event as Record<string, unknown> | null;
    if (!ticketId || !token || !event || typeof event !== 'object' ||
        typeof event.eventId !== 'string' || !UUID.test(event.eventId) || typeof event.eventType !== 'string' ||
        !EVENT_TYPE.test(event.eventType) || typeof event.occurredAt !== 'string' ||
        !event.payload || typeof event.payload !== 'object') {
        return NextResponse.json({ error: 'Invalid research event' }, { status: 400 });
    }

    const payloadText = JSON.stringify(event.payload);
    if (Buffer.byteLength(payloadText, 'utf8') > MAX_PAYLOAD_BYTES || Number.isNaN(Date.parse(event.occurredAt))) {
        return NextResponse.json({ error: 'Research event is too large or malformed' }, { status: 400 });
    }

    const { data: session, error: sessionError } = await supabase
        .from('research_sessions')
        .select('id, token_hash, survey:surveys!inner(survey_declined)')
        .eq('survey_id', ticketId)
        .maybeSingle();
    if (sessionError || !session || !matchesResearchToken(token, session.token_hash)) {
        return NextResponse.json({ error: 'Research session not authorized' }, { status: 403 });
    }

    const survey = session.survey as unknown as { survey_declined?: boolean } | { survey_declined?: boolean }[] | null;
    const surveyDeclined = Array.isArray(survey) ? survey[0]?.survey_declined : survey?.survey_declined;
    if (surveyDeclined) return NextResponse.json({ error: 'Research consent is absent' }, { status: 403 });

    const { error: insertError } = await supabase.from('research_events').insert({
        session_id: session.id,
        event_id: event.eventId,
        event_type: event.eventType,
        occurred_at: event.occurredAt,
        payload: event.payload,
    });
    if (insertError) {
        if (insertError.code === '23505') return NextResponse.json({ accepted: true, duplicate: true });
        console.error('research-log insert failed', insertError);
        return NextResponse.json({ error: 'Could not save research event' }, { status: 500 });
    }
    return NextResponse.json({ accepted: true });
}
