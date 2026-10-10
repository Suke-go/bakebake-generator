/**
 * Retrieval pipeline following the CHIIR 2027 paper's Method section:
 *
 *   BM25 top-50 for q (account), e (event statement), m (chosen appraisal)
 *   -> Ruri cross-encoder reads q against each candidate, and reads the
 *      branch's own query (e or m) against each candidate, giving two
 *      ranks per branch
 *   -> reciprocal rank fusion (k=60) combines each branch's two ranks into
 *      R_E and R_M
 *   -> the combined condition takes, per record, the better of R_E and
 *      R_M: R_combined(d) = min(R_E(d), R_M(d))
 *
 * This module is the live-app counterpart to the paper's offline study
 * pipeline; it reuses the same BM25 implementation and RRF constant
 * (k=60) already used for the existing e5/bm25 experience search so the
 * two stay comparable.
 */

import { loadExperienceCorpus, lexicalScores, sorted, type RecordEntry } from './experience-search';
import { ruriRerank, rankById, RuriUnavailable } from './ruri-client';

const CANDIDATE_BUDGET = 50;
const RRF_K = 60;

export interface RankedFolkloreRecord {
    id: string;
    name: string;
    summary: string;
    prefecture: string;
    /** which branch(es) this record's rank came through */
    route: 'event' | 'appraisal' | 'both';
    rank: number;
}

export interface EventAppraisalSearchResult {
    corpusVersion: string;
    ranked: RankedFolkloreRecord[];
    /** diagnostics, useful for research logging */
    branchSizes: { event: number; appraisal: number };
}

function rrfFuse(rankA: Map<string, number>, rankB: Map<string, number>): Map<string, number> {
    const ids = new Set([...rankA.keys(), ...rankB.keys()]);
    const fused = new Map<string, number>();
    for (const id of ids) {
        const ra = rankA.get(id);
        const rb = rankB.get(id);
        let score = 0;
        if (ra !== undefined) score += 1 / (RRF_K + ra);
        if (rb !== undefined) score += 1 / (RRF_K + rb);
        fused.set(id, score);
    }
    return fused;
}

/** Rank position (1-based) by descending RRF score; ties broken by id for determinism. */
function rankFromScores(scores: Map<string, number>): Map<string, number> {
    const order = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const ranks = new Map<string, number>();
    order.forEach(([id], i) => ranks.set(id, i + 1));
    return ranks;
}

async function branchRank(
    account: string,
    branchQuery: string,
    records: RecordEntry[],
): Promise<{ rank: Map<string, number>; pool: Array<{ id: string; text: string }> }> {
    const scores = lexicalScores(branchQuery, records);
    const topDocIdx = sorted(scores, records, true).slice(0, CANDIDATE_BUDGET);
    const pool = topDocIdx.map((i) => ({ id: records[i].id, text: records[i].summary }));
    if (pool.length === 0) return { rank: new Map(), pool: [] };

    const [accountScored, branchScored] = await Promise.all([
        ruriRerank(account, pool),
        ruriRerank(branchQuery, pool),
    ]);
    const rQ = rankById(accountScored);
    const rBranch = rankById(branchScored);
    const fusedScores = rrfFuse(rQ, rBranch);
    return { rank: rankFromScores(fusedScores), pool };
}

/**
 * account: the full concatenated account (same text used everywhere else as "the account").
 * eventText: the generated event statement.
 * appraisalText: the participant's chosen appraisal candidate (or the auto-selected one).
 */
export async function searchByEventAndAppraisal(
    account: string,
    eventText: string,
    appraisalText: string,
    limit = 5,
): Promise<EventAppraisalSearchResult> {
    const { records, manifest } = await loadExperienceCorpus();
    const recordById = new Map(records.map((r) => [r.id, r]));

    const [eventBranch, appraisalBranch] = await Promise.all([
        branchRank(account, eventText, records),
        branchRank(account, appraisalText, records),
    ]);

    // Combined condition: take each record's better (lower) rank across the
    // two branches, min(R_E, R_M). Ties broken by the branch that ranked it
    // higher's own RRF-derived position, then by id for determinism.
    const allIds = new Set([...eventBranch.rank.keys(), ...appraisalBranch.rank.keys()]);
    const combined: Array<{ id: string; rank: number; route: 'event' | 'appraisal' | 'both' }> = [];
    for (const id of allIds) {
        const rE = eventBranch.rank.get(id);
        const rM = appraisalBranch.rank.get(id);
        const best = Math.min(rE ?? Infinity, rM ?? Infinity);
        const route = rE !== undefined && rM !== undefined ? 'both' : rE !== undefined ? 'event' : 'appraisal';
        combined.push({ id, rank: best, route });
    }
    combined.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

    const ranked: RankedFolkloreRecord[] = combined.slice(0, limit).map((c, i) => {
        const record = recordById.get(c.id);
        return {
            id: c.id,
            name: record?.name ?? '',
            summary: record?.summary ?? '',
            prefecture: record?.prefecture ?? '',
            route: c.route,
            rank: i + 1,
        };
    });

    return {
        corpusVersion: `${manifest.version}:${manifest.corpusSha256}`,
        ranked,
        branchSizes: { event: eventBranch.pool.length, appraisal: appraisalBranch.pool.length },
    };
}

export { RuriUnavailable };
