import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { PLAY_CONSENT_VERSION, PLAY_MODES, PLAY_PROTOCOL_VERSION } from '@/lib/play-log-contract';
import { createLocalPlaySession, localPlayLogAllowed } from '@/lib/play-log-local';
import { getResearchSupabase, hashResearchToken } from '@/lib/research-server';

export const runtime = 'nodejs';

// Opens an opt-in play-log session. Without explicit consent nothing is stored.
export async function POST(request: Request) {
    const supabase = getResearchSupabase();
    if (!supabase && !localPlayLogAllowed()) return NextResponse.json({ logging: 'disabled' }, { status: 503 });
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    if (body.consentAccepted !== true || body.consentVersion !== PLAY_CONSENT_VERSION || !(PLAY_MODES as readonly unknown[]).includes(body.mode)) {
        return NextResponse.json({ error: 'Invalid play session' }, { status: 400 });
    }
    const token = randomBytes(32).toString('base64url');
    const row = {
        token_hash: hashResearchToken(token),
        protocol_version: PLAY_PROTOCOL_VERSION,
        consent_version: PLAY_CONSENT_VERSION,
        mode: String(body.mode),
        locale: body.locale === 'en' ? 'en' : body.locale === 'ja' ? 'ja' : null,
    };
    const { data, error } = supabase ? await supabase.from('play_sessions').insert(row).select('id').single() : { data: null, error: 'no supabase' };
    let sessionId: string | undefined = data?.id;
    // On a development machine without the play-log tables, keep the log in a local file instead.
    if ((error || !sessionId) && localPlayLogAllowed()) sessionId = await createLocalPlaySession(row);
    if (!sessionId) {
        console.error('play-session creation failed', error);
        return NextResponse.json({ logging: 'disabled' }, { status: 500 });
    }
    return NextResponse.json({ sessionId, token, protocolVersion: PLAY_PROTOCOL_VERSION }, { headers: { 'Cache-Control': 'no-store' } });
}
