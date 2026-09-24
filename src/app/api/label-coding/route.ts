import { NextResponse } from 'next/server';
import { getResearchSupabase, hashResearchToken } from '@/lib/research-server';
import { parseAnswer, type CodingAnswer, type CodingItem } from '@/lib/label-coding';

export const runtime = 'nodejs';
const TABLE = 'label_coding_sessions';

function reply(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
    const text = await request.text();
    if (text.length > 16 * 1024) return reply({ error: 'too_large' }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return reply({ error: 'bad_json' }, 400); }
    const db = getResearchSupabase();
    if (!db) return reply({ error: 'not_configured' }, 503);
    const token = body.token;
    if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return reply({ error: 'not_found' }, 404);
    const { data: row } = await db.from(TABLE).select('id, coder, items, answers, completed_at').eq('token_hash', hashResearchToken(token)).maybeSingle();
    if (!row) return reply({ error: 'not_found' }, 404);
    const items = row.items as CodingItem[];
    const answers = (row.answers ?? {}) as Record<string, CodingAnswer>;
    const now = new Date().toISOString();

    if (body.type === 'load') return reply({ coder: row.coder, items, answers, completed: Boolean(row.completed_at) });

    if (body.type === 'save') {
        const id = body.id;
        if (typeof id !== 'string' || !items.some((it) => it.id === id)) return reply({ error: 'bad_item' }, 400);
        const answer = parseAnswer(body.answer);
        if (!answer) return reply({ error: 'bad_answer' }, 400);
        answers[id] = answer;
        const { error } = await db.from(TABLE).update({ answers, updated_at: now }).eq('id', row.id);
        if (error) return reply({ error: 'store_failed' }, 500);
        return reply({ ok: true });
    }

    if (body.type === 'complete') {
        const missing = items.filter((it) => { const a = answers[it.id]; return !a || !a.A1 || !a.B || !a.H; }).length;
        if (missing > 0) return reply({ error: 'incomplete', missing }, 400);
        const { error } = await db.from(TABLE).update({ completed_at: now, updated_at: now }).eq('id', row.id);
        if (error) return reply({ error: 'store_failed' }, 500);
        return reply({ ok: true });
    }
    return reply({ error: 'unknown_type' }, 400);
}
