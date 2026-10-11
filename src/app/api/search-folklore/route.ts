import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ExperienceSearchUnavailable, loadExperienceCorpus, searchExperiences } from '@/lib/experience-search';
import { buildSearchQuery } from '@/lib/prompt-builder';
import type { SearchResult } from '@/lib/folklore-search';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_RESULT_CACHE_SIZE = 200;
const CORPUS_COUNT = 33_378;

type SearchEngine = 'local-qwen' | 'local-e5';
type SearchResponse = {
    folklore: SearchResult[];
    searchQuery: string;
    searchEngine: SearchEngine;
    scoreType: 'cosine';
    modelVersion: string;
    corpusVersion: string;
    paidApiCalls: 0;
};
type SearchCacheEntry = { value: SearchResponse; expiresAt: number };

const searchCache = new Map<string, SearchCacheEntry>();
const inFlightSearch = new Map<string, Promise<SearchResponse>>();
let sourceIndexPromise: ReturnType<typeof buildSourceIndex> | undefined;

async function buildSourceIndex() {
    const corpus = await loadExperienceCorpus();
    return {
        records: new Map(corpus.records.map((record) => [record.id, record])),
        manifest: corpus.manifest,
    };
}

function getSourceIndex() {
    sourceIndexPromise ??= buildSourceIndex().catch((error) => {
        sourceIndexPromise = undefined;
        throw error;
    });
    return sourceIndexPromise;
}

function buildSearchCacheKey(handle: { id: string; text: string }, answers: Record<string, string>): string {
    const stable = JSON.stringify([
        handle.id,
        handle.text,
        Object.keys(answers).sort().map((key) => [key, answers[key]]),
    ]);
    return createHash('sha256').update(stable).digest('hex');
}

function setSearchCache(key: string, value: SearchResponse) {
    if (searchCache.size >= SEARCH_RESULT_CACHE_SIZE) {
        const oldestKey = searchCache.keys().next().value;
        if (oldestKey) searchCache.delete(oldestKey);
    }
    searchCache.set(key, { value, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
}

function getSearchCache(key: string): SearchResponse | null {
    const entry = searchCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        searchCache.delete(key);
        return null;
    }
    return entry.value;
}

function sourceUrl(value: unknown): string | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value !== 'string') throw new Error('invalid source URL');
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('source URL must use HTTPS');
    return url.toString();
}

function uniqueSummaries(rows: SearchResult[]): SearchResult[] {
    const summaries = new Set<string>();
    const selected: SearchResult[] = [];
    for (const row of rows) {
        if (summaries.has(row.content)) continue;
        summaries.add(row.content);
        selected.push(row);
        if (selected.length === 5) break;
    }
    return selected;
}

async function runLocalSearch(
    handle: { id: string; text: string },
    answers: Record<string, string>,
): Promise<SearchResponse> {
    const searchQuery = buildSearchQuery(handle, answers);
    if (!searchQuery.trim() || searchQuery.length > 2000) throw new RangeError('検索文は1〜2000文字で入力してください。');
    const { records, manifest } = await getSourceIndex();
    const sidecar = process.env.LOCAL_QWEN_SEARCH_URL?.trim();
    let qwenError: unknown;

    if (sidecar) {
        try {
            const base = new URL(sidecar);
            if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.username || base.password) {
                throw new Error('LOCAL_QWEN_SEARCH_URL must be a 127.0.0.1 HTTP URL');
            }
            const response = await fetch(new URL('/search', base), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: searchQuery, top_k: 10 }),
                signal: AbortSignal.timeout(5_000),
                cache: 'no-store',
            });
            if (!response.ok) throw new Error(`local Qwen returned ${response.status}`);
            const payload = await response.json() as {
                engine?: unknown;
                corpus_count?: unknown;
                corpus_sha256?: unknown;
                paid_api_calls?: unknown;
                results?: unknown;
            };
            if (payload.engine !== 'qwen3-embedding-0.6b-local' || payload.corpus_count !== CORPUS_COUNT ||
                payload.corpus_sha256 !== manifest.corpusSha256 || payload.paid_api_calls !== 0 ||
                !Array.isArray(payload.results) || payload.results.length < 1 || payload.results.length > 10) {
                throw new Error('local Qwen provenance contract failed');
            }
            const seenIds = new Set<string>();
            const mapped = payload.results.map((unknownRow) => {
                if (!unknownRow || typeof unknownRow !== 'object') throw new Error('invalid local Qwen row');
                const row = unknownRow as Record<string, unknown>;
                if (typeof row.id !== 'string' || seenIds.has(row.id) || typeof row.summary !== 'string' ||
                    typeof row.name !== 'string' || typeof row.prefecture !== 'string' ||
                    typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < -1 || row.score > 1) {
                    throw new Error('invalid local Qwen result fields');
                }
                seenIds.add(row.id);
                const source = records.get(row.id);
                if (!source || source.summary !== row.summary) throw new Error('local Qwen result is not in the frozen corpus');
                const sameSummaryIds = row.same_summary_ids;
                if (!Array.isArray(sameSummaryIds) || sameSummaryIds.some((id) => typeof id !== 'string' || !records.has(id))) {
                    throw new Error('invalid duplicate provenance');
                }
                return {
                    id: source.id,
                    kaiiName: source.name,
                    content: source.summary,
                    location: source.prefecture,
                    similarity: row.score,
                    source: manifest.source,
                    sourceUrl: sourceUrl(row.source_url),
                    sameSummaryIds: [...new Set([source.id, ...sameSummaryIds])],
                } satisfies SearchResult;
            });
            return {
                searchQuery,
                searchEngine: 'local-qwen',
                scoreType: 'cosine',
                modelVersion: 'Qwen3-Embedding-0.6B-Q8_0:frozen-local',
                corpusVersion: manifest.corpusSha256,
                paidApiCalls: 0,
                folklore: uniqueSummaries(mapped),
            };
        } catch (error) {
            qwenError = error;
            console.warn('search-folklore: local Qwen unavailable:', error);
        }
    }

    if (process.env.LOCAL_QWEN_REQUIRED === 'true') {
        throw new ExperienceSearchUnavailable(`ローカルQwen検索を利用できません。${qwenError ? 'サービス状態を確認してください。' : 'サービスが設定されていません。'}`);
    }
    const result = await searchExperiences({
        experience: searchQuery,
        variant: 'baseline',
        engine: 'e5',
        limit: 10,
    });
    return {
        searchQuery,
        searchEngine: 'local-e5',
        scoreType: 'cosine',
        modelVersion: `${result.model.id}:${result.model.version}`,
        corpusVersion: manifest.corpusSha256,
        paidApiCalls: 0,
        folklore: uniqueSummaries(result.candidates.map((candidate) => ({
            id: candidate.id,
            kaiiName: candidate.name,
            content: candidate.summary,
            location: candidate.prefecture,
            similarity: candidate.score,
            source: candidate.source,
            sourceUrl: candidate.sourceUrl ?? undefined,
            sameSummaryIds: [candidate.id],
        }))),
    };
}

export async function POST(req: Request) {
    const startedAt = Date.now();
    let body: unknown;
    try {
        const bodyText = await req.text();
        if (!bodyText.trim() || bodyText.length > 12_000) throw new Error('invalid body');
        body = JSON.parse(bodyText);
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { handle, answers } = body as {
        handle?: { id?: unknown; text?: unknown };
        answers?: unknown;
    };
    if (!handle || typeof handle.id !== 'string' || !handle.id.trim() || typeof handle.text !== 'string' ||
        !handle.text.trim() || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
        return NextResponse.json({ error: 'handle and answers are required' }, { status: 400 });
    }
    const answerEntries = Object.entries(answers as Record<string, unknown>);
    if (answerEntries.some(([key, value]) => !key || typeof value !== 'string')) {
        return NextResponse.json({ error: 'answer values must be strings' }, { status: 400 });
    }
    const normalized = Object.fromEntries(answerEntries) as Record<string, string>;
    const normalizedHandle = { id: handle.id, text: handle.text };
    const cacheKey = buildSearchCacheKey(normalizedHandle, normalized);
    const cached = getSearchCache(cacheKey);
    if (cached) {
        return NextResponse.json(cached, {
            headers: { 'x-search-cache': 'hit', 'x-search-engine': cached.searchEngine,
                'x-search-duration-ms': `${Date.now() - startedAt}` },
        });
    }

    const existing = inFlightSearch.get(cacheKey);
    const promise = existing ?? runLocalSearch(normalizedHandle, normalized);
    if (!existing) inFlightSearch.set(cacheKey, promise);
    try {
        const result = await promise;
        setSearchCache(cacheKey, result);
        return NextResponse.json(result, {
            headers: { 'x-search-cache': existing ? 'in-flight' : 'miss', 'x-search-engine': result.searchEngine,
                'x-search-duration-ms': `${Date.now() - startedAt}` },
        });
    } catch (error) {
        console.error('search-folklore local search error:', error);
        if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
        const message = error instanceof ExperienceSearchUnavailable
            ? error.message
            : '検索に失敗しました。もう一度お試しください。';
        return NextResponse.json({ error: message }, { status: 503 });
    } finally {
        if (!existing && inFlightSearch.get(cacheKey) === promise) inFlightSearch.delete(cacheKey);
    }
}
