import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getResearchSupabase, hashResearchToken } from '@/lib/research-server';
import {
    CONTACT_STUDY_VERSION, parseAccounts, parseProfile, parseRatings, type StudyState,
} from '@/lib/contact-study';

export const runtime = 'nodejs';
const TABLE = 'contact_study_sessions';
const MAX_BYTES = 64 * 1024;

function reply(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function load(token: unknown) {
    if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return null;
    const db = getResearchSupabase();
    if (!db) return null;
    const { data } = await db.from(TABLE).select('id, phase, state').eq('token_hash', hashResearchToken(token)).maybeSingle();
    return data as { id: string; phase: string; state: StudyState } | null;
}

function view(phase: string, state: StudyState) {
    if (phase !== 'review' || !state.items) return { phase };
    const order = state.assignment.firstShown === 0 ? [0, 1] : [1, 0];
    const accounts = order.map((i) => ({
        index: i,
        text: state.accounts[i].text,
        withStatements: state.assignment.withStatements === i,
        done: Boolean(state.ratings?.[i]),
        records: state.items![i].map((r) => ({
            id: r.id, name: r.name, region: r.region, summary: r.summary,
            ...(state.assignment.withStatements === i ? { statement: r.statement ?? '' } : {}),
        })),
    }));
    return { phase, accounts };
}

export async function POST(request: Request) {
    const text = await request.text();
    if (text.length > MAX_BYTES) return reply({ error: 'too_large' }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return reply({ error: 'bad_json' }, 400); }
    const db = getResearchSupabase();
    if (!db) return reply({ error: 'not_configured' }, 503);
    const now = new Date().toISOString();

    if (body.type === 'start') {
        if (body.consent !== true) return reply({ error: 'consent_required' }, 400);
        const token = randomBytes(24).toString('hex');
        const state: StudyState = {
            consentAt: now, accounts: [],
            assignment: { withStatements: randomInt(2) as 0 | 1, firstShown: randomInt(2) as 0 | 1 },
            events: [{ type: 'start', at: now }],
        };
        const { error } = await db.from(TABLE).insert({
            id: randomUUID(), token_hash: hashResearchToken(token), protocol_version: CONTACT_STUDY_VERSION, phase: 'accounts', state,
        });
        if (error) return reply({ error: 'store_failed' }, 500);
        return reply({ token, phase: 'accounts' });
    }

    const row = await load(body.token);
    if (!row) return reply({ error: 'not_found' }, 404);
    const state = row.state;

    if (body.type === 'load') return reply(view(row.phase, state));

    if (body.type === 'accounts') {
        if (row.phase !== 'accounts') return reply({ error: 'wrong_phase', phase: row.phase }, 409);
        const accounts = parseAccounts(body.accounts);
        if (!accounts) return reply({ error: 'invalid_accounts' }, 400);
        const profile = parseProfile(body.profile);
        if (!profile) return reply({ error: 'invalid_profile' }, 400);
        state.profile = profile;
        state.accounts = accounts.map((t) => ({ text: t }));
        state.events.push({ type: 'accounts', at: now });
        const { error } = await db.from(TABLE).update({ phase: 'waiting', state, updated_at: now }).eq('id', row.id);
        if (error) return reply({ error: 'store_failed' }, 500);
        return reply({ phase: 'waiting' });
    }

    if (body.type === 'ratings') {
        if (row.phase !== 'review' || !state.items) return reply({ error: 'wrong_phase', phase: row.phase }, 409);
        const i = body.accountIndex;
        if (i !== 0 && i !== 1) return reply({ error: 'bad_index' }, 400);
        const ids = state.items[i].map((r) => r.id);
        const ratings = parseRatings(body.ratings, ids, state.assignment.withStatements === i);
        if (!ratings) return reply({ error: 'invalid_ratings' }, 400);
        state.ratings = state.ratings ?? [null, null];
        state.ratings[i] = ratings;
        state.events.push({ type: `ratings_${i}`, at: now });
        const phase = state.ratings[0] && state.ratings[1] ? 'complete' : 'review';
        const { error } = await db.from(TABLE).update({ phase, state, updated_at: now }).eq('id', row.id);
        if (error) return reply({ error: 'store_failed' }, 500);
        return reply(view(phase, state));
    }
    return reply({ error: 'unknown_type' }, 400);
}
