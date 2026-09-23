import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getResearchSupabase, hashResearchToken, matchesResearchToken } from '@/lib/research-server';
import {
    PUBLIC_EXPERIMENT_MAX_BYTES, PUBLIC_EXPERIMENT_VERSION,
    UUID, eligibleCards, isObject, parseContact, parseExperience, parseGrades, publicCards,
    type Card, type Grade, type Phase,
} from '@/lib/public-experiment-contract';
import {
    initialPublicExperiment, foilPublicExperiment, finalPublicExperiment,
} from '@/lib/public-experiment-retrieval';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TABLE = 'public_experiment_sessions';
const ACTION_TYPES = new Set(['initial', 'contact', 'foil', 'final']);
const PRODUCTION_ORIGINS = new Set(['https://www.bakemon.net', 'https://bakemon.net']);

type SearchRecord = { cards: Card[]; rankings?: Record<string, string[]>; provenance: Record<string, unknown> };
type StoredState = {
    experience: string;
    stageA: SearchRecord & { grades?: Record<string, Grade> };
    positiveSummarySha256?: string | null;
    contact?: string | null;
    foil?: SearchRecord & { selectedSummarySha256?: string | null };
    final?: SearchRecord & { grades?: Record<string, Grade> };
    events: Array<{ actionId: string; type: string; at: string }>;
};
type SessionRow = {
    id: string;
    token_hash: string;
    protocol_version: string;
    phase: Phase;
    revision: number;
    state: StoredState;
    last_action_id: string | null;
    last_action_hash: string | null;
    last_response: Record<string, unknown> | null;
};

function reply(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function allowedOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    if (!origin) return true; // Non-browser clients still need an unguessable session token.
    if (PRODUCTION_ORIGINS.has(origin)) return true;
    // Preview deployments are cross-origin from the production site, but the
    // form and API are served by the same preview host.
    if (origin === new URL(request.url).origin) return true;
    return process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function shuffled(cards: Card[]): Card[] {
    const result = publicCards(cards);
    for (let i = result.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function responseFor(sessionId: string, revision: number, phase: Phase, state: StoredState): Record<string, unknown> {
    const common = { sessionId, revision, phase, protocolVersion: PUBLIC_EXPERIMENT_VERSION };
    if (phase === 'initial') return { ...common, cards: publicCards(state.stageA.cards) };
    if (phase === 'contact') return { ...common, eligibleCards: eligibleCards(state.stageA.cards, state.stageA.grades ?? {}) };
    if (phase === 'foil') return { ...common, foilCards: publicCards(state.foil?.cards ?? []) };
    if (phase === 'final') return { ...common, cards: publicCards(state.final?.cards ?? []) };
    return { ...common, saved: true };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return null;
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > PUBLIC_EXPERIMENT_MAX_BYTES) return null;
    if (!request.body) return null;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > PUBLIC_EXPERIMENT_MAX_BYTES) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const text = Buffer.concat(chunks, size).toString('utf8');
    try {
        const value: unknown = JSON.parse(text);
        return isObject(value) ? value : null;
    } catch { return null; }
}

export async function OPTIONS(request: Request) {
    if (!allowedOrigin(request)) return reply({ error: 'Origin not allowed' }, 403);
    return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
}

export async function POST(request: Request) {
    if (!allowedOrigin(request)) return reply({ error: 'Origin not allowed' }, 403);
    let body: Record<string, unknown> | null;
    try { body = await readBody(request); } catch { body = null; }
    if (!body || typeof body.type !== 'string') return reply({ error: 'Invalid request' }, 400);
    const supabase = getResearchSupabase();
    if (!supabase) return reply({ error: 'Storage unavailable' }, 503);

    if (body.type === 'start') {
        const experience = parseExperience(body.experience);
        if (!experience) return reply({ error: '体験は20〜2000文字で入力してください。' }, 400);
        try {
            const found = await initialPublicExperiment(experience);
            if (!found.cards.length) return reply({ error: '検索候補が見つかりませんでした。' }, 503);
            const sessionId = randomUUID();
            const token = randomBytes(32).toString('base64url');
            const state: StoredState = {
                experience,
                stageA: { cards: shuffled(found.cards), rankings: found.rankings, provenance: found.provenance },
                events: [],
            };
            const { error } = await supabase.from(TABLE).insert({
                id: sessionId, token_hash: hashResearchToken(token),
                protocol_version: PUBLIC_EXPERIMENT_VERSION, phase: 'initial', revision: 0,
                state,
            });
            if (error) {
                console.error('public experiment insert failed', error.code || 'unknown');
                return reply({ error: '保存できませんでした。後でお試しください。' }, 503);
            }
            return reply({ ...responseFor(sessionId, 0, 'initial', state), token });
        } catch {
            return reply({ error: '検索を開始できませんでした。' }, 503);
        }
    }

    const sessionId = body.sessionId;
    const token = body.token;
    if (typeof sessionId !== 'string' || !UUID.test(sessionId) ||
        typeof token !== 'string' || token.length < 30 || token.length > 100) {
        return reply({ error: 'Invalid session' }, 400);
    }
    const { data, error: readError } = await supabase.from(TABLE).select('*').eq('id', sessionId).maybeSingle();
    const row = data as SessionRow | null;
    if (readError || !row || row.protocol_version !== PUBLIC_EXPERIMENT_VERSION ||
        !matchesResearchToken(token, row.token_hash)) return reply({ error: 'Session unavailable' }, 404);
    if (body.type === 'resume') return reply(responseFor(row.id, row.revision, row.phase, row.state));
    if (!ACTION_TYPES.has(body.type)) return reply({ error: 'Unknown action' }, 400);
    const actionId = body.actionId;
    const expectedRevision = body.revision;
    if (typeof actionId !== 'string' || !UUID.test(actionId) ||
        !Number.isInteger(expectedRevision) || Number(expectedRevision) < 0) return reply({ error: 'Invalid action' }, 400);
    const actionHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    if (row.last_action_id === actionId) {
        return row.last_action_hash === actionHash && row.last_response
            ? reply(row.last_response) : reply({ error: 'Action ID reused' }, 409);
    }
    if (row.revision !== expectedRevision || row.phase !== body.type) return reply({ error: 'Session changed; reload to continue.' }, 409);

    const next = structuredClone(row.state);
    let phase: Phase;
    try {
        if (body.type === 'initial') {
            const grades = parseGrades(next.stageA.cards, body.grades);
            if (!grades) return reply({ error: 'すべての候補を評価してください。' }, 400);
            next.stageA.grades = grades;
            phase = eligibleCards(next.stageA.cards, grades).length ? 'contact' : 'complete';
            if (phase === 'complete') next.positiveSummarySha256 = null;
        } else if (body.type === 'contact') {
            const selected = body.positiveSummarySha256;
            const contact = parseContact(body.contact);
            const eligible = eligibleCards(next.stageA.cards, next.stageA.grades ?? {});
            const positive = eligible.find(card => card.summarySha256 === selected);
            if (!positive || !contact) return reply({ error: '候補と接点の一文を確認してください。' }, 400);
            next.positiveSummarySha256 = positive.summarySha256;
            next.contact = contact;
            const found = await foilPublicExperiment(next.experience, positive.summary,
                next.stageA.cards.map(card => card.summarySha256));
            next.foil = { cards: publicCards(found.cards), provenance: found.provenance };
            phase = 'foil';
        } else if (body.type === 'foil') {
            const selected = body.foilSummarySha256;
            if (selected !== null && (typeof selected !== 'string' ||
                !next.foil?.cards.some(card => card.summarySha256 === selected))) {
                return reply({ error: '対照候補を確認してください。' }, 400);
            }
            const positive = next.stageA.cards.find(card => card.summarySha256 === next.positiveSummarySha256);
            if (!positive || !next.foil) return reply({ error: '正例が見つかりません。' }, 409);
            const foil = selected === null ? null : next.foil.cards.find(card => card.summarySha256 === selected)!;
            next.foil.selectedSummarySha256 = selected;
            const excluded = [...next.stageA.cards, ...next.foil.cards].map(card => card.summarySha256);
            const found = await finalPublicExperiment(next.experience, positive.summary, foil?.summary ?? null, excluded);
            next.final = { cards: shuffled(found.cards), rankings: found.rankings, provenance: found.provenance };
            phase = 'final';
        } else {
            const cards = next.final?.cards;
            if (!cards) return reply({ error: '最終候補がありません。' }, 409);
            const grades = parseGrades(cards, body.grades);
            if (!grades) return reply({ error: 'すべての候補を評価してください。' }, 400);
            next.final!.grades = grades;
            phase = 'complete';
        }
    } catch {
        return reply({ error: '検索を続行できませんでした。再試行してください。' }, 503);
    }
    next.events.push({ actionId, type: body.type, at: new Date().toISOString() });
    const revision = row.revision + 1;
    const response = responseFor(row.id, revision, phase!, next);
    const { data: updated, error: updateError } = await supabase.from(TABLE)
        .update({ state: next, phase: phase!, revision, last_action_id: actionId,
            last_action_hash: actionHash, last_response: response, updated_at: new Date().toISOString() })
        .eq('id', row.id).eq('revision', row.revision).select('id').maybeSingle();
    if (updateError) {
        console.error('public experiment update failed', updateError.code || 'unknown');
        return reply({ error: '保存できませんでした。再試行してください。' }, 503);
    }
    if (!updated) {
        const { data: current } = await supabase.from(TABLE).select('last_action_id,last_action_hash,last_response').eq('id', row.id).maybeSingle();
        if (current?.last_action_id === actionId && current.last_action_hash === actionHash && current.last_response)
            return reply(current.last_response as Record<string, unknown>);
        return reply({ error: 'Session changed; reload to continue.' }, 409);
    }
    return reply(response);
}
