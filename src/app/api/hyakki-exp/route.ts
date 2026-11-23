// POST /api/hyakki-exp: one anonymous record per consented study play (see src/components/hyakki/HyakkiExp.tsx).
// While the play goes on the row holds the operation log so far; sending the answers replaces it with the full record.
// The record never holds the player's town.
import { NextResponse } from 'next/server';
import { getResearchSupabase } from '@/lib/research-server';
import { PROGRESS_VERSION, exhibitRow, isExhibitVersion, progressRow } from '@/lib/hyakki-exhibit';

const VERSION = 'hyakki-exp-v1';
const SCALE_KEYS = ['foothold', 'trace', 'collection', 'worldLink', 'worldSpread', 'enjoy', 'again'];
const point = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : null);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function POST(request: Request) {
    const supabase = getResearchSupabase();
    if (!supabase) return NextResponse.json({ error: 'Recording is not set up' }, { status: 503 });

    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid record' }, { status: 400 });
    if (body.version === PROGRESS_VERSION) {
        const row = progressRow(body);
        if (!row) return NextResponse.json({ error: 'Invalid record' }, { status: 400 });
        let { error } = await supabase.from('hyakki_exp_responses').insert(row);
        // The row exists: move it forward only while it is still a log in progress and only with a later save, so a
        // save that arrives late can undo neither a newer one nor the sent answers.
        if (error?.code === '23505') {
            ({ error } = await supabase.from('hyakki_exp_responses').update({ payload: row.payload })
                .eq('id', row.id).eq('version', PROGRESS_VERSION).lt('payload->seq', row.payload.seq));
        }
        if (error) console.error('hyakki-exp progress failed', error.message);
        return NextResponse.json(error ? { error: 'Could not record' } : { ok: true }, { status: error ? 500 : 200 });
    }
    if (isExhibitVersion(body.version)) {
        const row = exhibitRow(body);
        if (!row) return NextResponse.json({ error: 'Invalid record' }, { status: 400 });
        const { error } = await supabase.from('hyakki_exp_responses').upsert(row, { onConflict: 'id' });
        return NextResponse.json(error ? { error: 'Could not record' } : { ok: true }, { status: error ? 500 : 200 });
    }

    const scalesIn = (body.scales ?? {}) as Record<string, unknown>;
    const scales = Object.fromEntries(SCALE_KEYS.map(k => [k, point(scalesIn[k])]));
    const interestBefore = point(body.interestBefore), interestAfter = point(body.interestAfter);
    if (body.consent !== true || body.version !== VERSION || !text(body.age, 16) || !text(body.gender, 16)
        || interestBefore === null || interestAfter === null || Object.values(scales).some(v => v === null)) {
        return NextResponse.json({ error: 'Invalid record' }, { status: 400 });
    }

    const logIn = (body.log ?? {}) as Record<string, unknown>;
    const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
    const payload = {
        age: text(body.age, 16), gender: text(body.gender, 16), interestBefore, interestAfter,
        town: body.town === 'own' || body.town === 'unknown' ? body.town : null, knownTown: text(body.knownTown, 8), scales, why: text(body.why, 500), remember: text(body.remember, 500),
        log: {
            region: text(logIn.region, 32), seconds: num(logIn.seconds),
            peeks: list(logIn.peeks, 5).map(num), chosen: list(logIn.chosen, 5).map(v => text(v, 32)), friends: list(logIn.friends, 5).map(num),
            nearAll: num(logIn.nearAll), nearAloud: num(logIn.nearAloud),
            skippedCall: logIn.skippedCall === true, skippedParade: logIn.skippedParade === true,
            opened: num(logIn.opened), saved: logIn.saved === true,
        },
    };

    const { error } = await supabase.from('hyakki_exp_responses').insert({ version: VERSION, payload });
    if (error) {
        console.error('hyakki-exp insert failed', error.message);
        return NextResponse.json({ error: 'Could not record' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
