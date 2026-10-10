/**
 * Client for the Ruri cross-encoder reranker deployed on Modal
 * (deploy/bakemon_server/modal_app.py — cl-nagoya/ruri-v3-reranker-310m).
 *
 * This is the only paid/external-compute step in retrieval; it is not an
 * LLM call and has no content-generation cost, but it does leave the local
 * process, so callers that must guarantee `paidApiCalls: 0` (see
 * search-folklore/route.ts's convention) should not call this.
 */

export class RuriUnavailable extends Error { }

export interface RuriScoredDoc { id: string; score: number }

// Modal scales reranker containers to zero; a cold start (model load) can
// take ~20-30s on top of inference, so the timeout must comfortably exceed
// that, not just batched-inference time.
// Measured ~40s for a 50-candidate batch on Modal's CPU container
// (cold start + inference); give real headroom rather than guessing.
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Score `query` against every candidate's `text`, in one batched call.
 * Returns candidates sorted by score descending (the Modal endpoint already
 * sorts; we re-sort defensively in case that contract ever changes).
 */
export async function ruriRerank(
    query: string,
    candidates: Array<{ id: string; text: string }>,
    opts?: { timeoutMs?: number },
): Promise<RuriScoredDoc[]> {
    if (candidates.length === 0) return [];
    const url = process.env.RURI_RERANK_URL;
    if (!url) throw new RuriUnavailable('RURI_RERANK_URL is not configured');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ query, candidates }),
            signal: controller.signal,
        });
        if (!res.ok) throw new RuriUnavailable(`Ruri rerank HTTP ${res.status}`);
        const data = (await res.json()) as { ranked?: Array<{ id: string; score: number }> };
        if (!Array.isArray(data.ranked)) throw new RuriUnavailable('Malformed Ruri rerank response');
        return [...data.ranked].sort((a, b) => b.score - a.score);
    } catch (error) {
        if (error instanceof RuriUnavailable) throw error;
        throw new RuriUnavailable(error instanceof Error ? error.message : 'Ruri rerank request failed');
    } finally {
        clearTimeout(timeout);
    }
}

/** Rank position (1-based) of each id within a score-descending list, by id. */
export function rankById(scored: RuriScoredDoc[]): Map<string, number> {
    const ranks = new Map<string, number>();
    scored.forEach((doc, i) => ranks.set(doc.id, i + 1));
    return ranks;
}
