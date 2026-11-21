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
    return { id: body.id, version: EXHIBIT_VERSION, payload: {
        retelling: retelling.trim(), imagination: imagination.trim(), ratings, loreInterest,
        log: { chosen, openedIds, offeredEchoIds, skippedCall, skippedParade },
    } };
}
