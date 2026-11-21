// miniPXI (Haider et al., 2022), Table 4. Japanese study-team translation.
// Original item codes and -3 ... +3 anchors are retained for analysis.
export const EXHIBIT_VERSION = 'hyakki-exhibit-v2';
export const PX_ITEMS = [
    ['CUR_1', 'ゲームがこの先どう展開するのか、知りたかった。'],
    ['AUT_1', '自分なりのやり方で、自由に遊べた。'],
    ['ENJ_3', 'このゲームで楽しい時間を過ごした。'],
    ['MEA_1', 'このゲームで遊んだことは、自分にとって意味があった。'],
    ['IMM_3', '遊んでいる間、ゲームに集中していた。'],
    ['AA_2', 'ゲームの見た目や雰囲気が気に入った。'],
    ['EC_1', 'ゲームの中でどう操作すればよいか、分かりやすかった。'],
    ['GR_2', 'ゲームの目標がはっきりしていた。'],
    ['PF_3', '目標に向かってどこまで進んだか、ゲームからはっきり伝わってきた。'],
    ['CH_1', 'ゲームは簡単すぎず、難しすぎなかった。'],
    ['MAS_1', 'このゲームをうまく遊べたと感じた。'],
] as const;

export const LORE_INTEREST = 'ほかの土地にはどんな妖怪の話が伝わっているのか、もっと知りたい。';
export const ANCHORS = ['まったくそう思わない', 'そう思わない', 'ややそう思わない', 'どちらともいえない', 'ややそう思う', 'そう思う', 'とてもそう思う'];

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const point = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 3;
const cardId = (value: unknown) => typeof value === 'string' && /^[\w-]{1,32}$/.test(value);
const idList = (value: unknown, limit: number) => Array.isArray(value) && value.length <= limit && value.every(cardId);

// Each value is the maximum number of public card IDs carried by that event.
export const TRACE_LIMITS = {
    stage: 0, replay: 0, reduced_motion: 0, page_hidden: 0, page_visible: 0,
    pin_pick: 0, map_drag: 0, starters_offered: 3, mists_offered: 12,
    tease_shown: 1, echo_shown: 1, peek: 1, peek_again: 1, invite: 1, revealed: 1, caller: 1,
    skip_call: 0, skip_parade: 0, scroll_open: 1, scroll_close: 1,
    story_link: 1, image_link: 1, download_request: 0, finish: 0,
} as const;
export type TraceKind = keyof typeof TRACE_LIMITS;
export type Track = (kind: TraceKind, ids?: string[]) => void;
export type TraceEvent = { ms: number; stage: number; kind: TraceKind; ids: string[] };
export const MAX_EVENTS = 1200;
export type ExhibitTrace = { version: 1; events: TraceEvent[]; dropped: number };

function validTrace(value: unknown): value is ExhibitTrace {
    if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.dropped) || Number(value.dropped) < 0 ||
        !Array.isArray(value.events) || value.events.length > MAX_EVENTS) return false;
    let previous = 0;
    return value.events.every(e => {
        if (!object(e) || typeof e.kind !== 'string' || !Object.hasOwn(TRACE_LIMITS, e.kind) ||
            !Number.isSafeInteger(e.stage) || Number(e.stage) < 0 || Number(e.stage) > 10 ||
            typeof e.ms !== 'number' || !Number.isSafeInteger(e.ms) || e.ms < previous ||
            !Array.isArray(e.ids) || !idList(e.ids, TRACE_LIMITS[e.kind as TraceKind]) ||
            (TRACE_LIMITS[e.kind as TraceKind] === 1 && e.ids.length !== 1) ||
            Object.keys(e).some(k => !['ms','stage','kind','ids'].includes(k))) return false;
        previous = e.ms;
        return true;
    }) && Object.keys(value).every(k => ['version','events','dropped'].includes(k));
}

export function exhibitRow(body: unknown) {
    if (!object(body) || body.version !== EXHIBIT_VERSION || body.consent !== true ||
        typeof body.id !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(body.id)) return null;
    const { retelling, imagination, ratings, loreInterest, log } = body;
    if (typeof retelling !== 'string' || typeof imagination !== 'string' || retelling.length > 800 || imagination.length > 800 ||
        !object(ratings) || Object.entries(ratings).some(([key, value]) => !PX_ITEMS.some(([id]) => id === key) || !point(value)) ||
        !(loreInterest === null || point(loreInterest)) || !object(log)) return null;
    const { chosen, openedIds, offeredEchoIds, skippedCall, skippedParade } = log;
    if (!Array.isArray(chosen) || chosen.length !== 5 || new Set(chosen).size !== 5 || !idList(chosen, 5) ||
        !idList(openedIds, 100) || !idList(offeredEchoIds, 95) || typeof skippedCall !== 'boolean' || typeof skippedParade !== 'boolean') return null;
    if (log.trace !== undefined && !validTrace(log.trace)) return null;
    return { id: body.id, version: EXHIBIT_VERSION, payload: {
        retelling: retelling.trim(), imagination: imagination.trim(), ratings, loreInterest,
        log: { chosen, openedIds, offeredEchoIds, skippedCall, skippedParade, ...(log.trace ? { trace: log.trace } : {}) },
    } };
}
