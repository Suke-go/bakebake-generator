import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { loadEmbeddings, searchByEmbedding } from '@/lib/folklore-search';
import { buildSearchQuery } from '@/lib/prompt-builder';
import { getStatusCode, toErrorMessage, withExponentialBackoff } from '@/lib/genai-utils';
import type { SearchResult } from '@/lib/folklore-search';

const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 300;
const RATE_LIMIT_COOLDOWN_MS = 45_000;
const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_RESULT_CACHE_SIZE = 200;
const SEARCH_CACHE_KEY_SEPARATOR = '|';
const SEARCH_RESULT_MAX = 5;
const NERF_OLD_MEMORY_SEARCH =
    process.env.NEXT_PUBLIC_DISABLE_OLD_MEMORY_SEARCH === 'true' || process.env.DISABLE_OLD_MEMORY_SEARCH === 'true';

let searchRateLimitUntil = 0;

function isRateLimitError(error: unknown): boolean {
    const status = getStatusCode(error);
    const message = toErrorMessage(error).toLowerCase();
    return status === 429 || message.includes('resource exhausted') || message.includes('quota') || message.includes('rate limit');
}

function buildSearchFallbackSeed(handleId: string, answers: Record<string, string>): number {
    const sortedAnswers = Object.keys(answers).sort().map((key) => `${key}:${answers[key] ?? ''}`).join(SEARCH_CACHE_KEY_SEPARATOR);
    const seedSeed = `${handleId}${SEARCH_CACHE_KEY_SEPARATOR}${sortedAnswers}`;
    return [...seedSeed].reduce((acc, char) => (acc + char.charCodeAt(0)) % 9973, 0);
}

function buildFallbackFolklore(entries: Array<{
    id: string;
    name: string;
    summary: string;
    location: string;
    source: string;
}>, handleId: string, answers: Record<string, string>): SearchResult[] {
    if (entries.length === 0) return [];
    const seed = buildSearchFallbackSeed(handleId, answers);
    const startIndex = entries.length > 0 ? seed % entries.length : 0;
    const slice = [...entries, ...entries];
    const selected = slice.slice(startIndex, startIndex + SEARCH_RESULT_MAX);

    return selected.map((entry, index) => ({
        id: entry.id,
        kaiiName: entry.name,
        content: entry.summary,
        location: entry.location,
        similarity: Math.round((1 - index * 0.06) * 1000) / 1000,
        source: entry.source,
    }));
}

type SearchCacheEntry = {
    value: {
        folklore: SearchResult[];
        searchQuery: string;
    };
    expiresAt: number;
};

const searchCache = new Map<string, SearchCacheEntry>();
const inFlightSearch = new Map<string, Promise<{ folklore: SearchResult[]; searchQuery: string }>>();
let cacheAddCount = 0;

function sweepCache() {
    const now = Date.now();
    for (const [key, entry] of searchCache.entries()) {
        if (entry.expiresAt < now) {
            searchCache.delete(key);
        }
    }
}

function buildSearchCacheKey(handleId: string, answers: Record<string, string>): string {
    const sortedAnswers = Object.keys(answers)
        .sort()
        .map((key) => `${key}:${answers[key] ?? ''}`)
        .join('|');
    return `${handleId}|${sortedAnswers}`;
}

function setSearchCache(key: string, value: { folklore: SearchResult[]; searchQuery: string }) {
    if (searchCache.size >= SEARCH_RESULT_CACHE_SIZE) {
        const oldestKey = searchCache.keys().next().value;
        if (oldestKey) {
            searchCache.delete(oldestKey);
        }
    }
    searchCache.set(key, { value, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });

    cacheAddCount++;
    if (cacheAddCount % 50 === 0) {
        sweepCache();
    }
}

function getSearchCache(key: string): { folklore: SearchResult[]; searchQuery: string } | null {
    const entry = searchCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        searchCache.delete(key);
        return null;
    }
    return entry.value;
}

async function runSearchFallback(
    searchQuery: string,
    apiKey: string,
    handleId: string,
    answers: Record<string, string>,
    signal: AbortSignal
) {
    const genAI = new GoogleGenAI({ apiKey });
    let queryEmbedding: number[] | null = null;

    try {
        const embeddingResult = await withExponentialBackoff(
            async () => {
                return genAI.models.embedContent({
                    model: 'gemini-embedding-001',
                    contents: searchQuery,
                    config: {
                        taskType: 'RETRIEVAL_QUERY',
                        outputDimensionality: 768,
                    },
                });
            },
            'search-folklore',
            MAX_RETRY_ATTEMPTS,
            INITIAL_RETRY_DELAY_MS,
            (error) => {
                if (signal.aborted) return true;
                if (isRateLimitError(error)) {
                    searchRateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
                    return true;
                }
                return false;
            }
        );

        const values = embeddingResult.embeddings?.[0]?.values;
        if (!values) {
            throw new Error('Failed to generate query embedding');
        }
        queryEmbedding = values;
    } catch (error) {
        console.warn('search-folklore: embedding failed, fallback to local order:', toErrorMessage(error));
    }

    const entries = await loadEmbeddings();

    if (!queryEmbedding) {
        const fallback = buildFallbackFolklore(entries, handleId, answers);
        return { folklore: fallback, searchQuery };
    }

    const results = searchByEmbedding(queryEmbedding, entries, 5);
    return { folklore: results, searchQuery };
}

export async function POST(req: Request) {
    try {
        const startedAt = Date.now();
        let cacheState = 'miss';
        let bodyText: string;
        try {
            bodyText = await req.text();
        } catch {
            return NextResponse.json(
                { error: 'Invalid request body' },
                { status: 400 }
            );
        }

        if (!bodyText.trim()) {
            return NextResponse.json(
                { error: 'Request body is empty' },
                { status: 400 }
            );
        }

        let body: unknown;
        try {
            body = JSON.parse(bodyText);
        } catch {
            return NextResponse.json(
                { error: 'Request body must be valid JSON' },
                { status: 400 }
            );
        }

        const { handle, answers } = body as {
            handle?: {
                id: string;
                text: string;
            };
            answers?: unknown;
        };

        const validHandle = handle && typeof handle.id === 'string' && typeof handle.text === 'string';
        const validAnswers = typeof answers === 'object' && answers !== null;
        if (!validHandle || !validAnswers) {
            return NextResponse.json(
                { error: 'handle and answers are required' },
                { status: 400 }
            );
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY not configured' },
                { status: 500 }
            );
        }

        const answersNormalized = answers as Record<string, string>;
        const searchQuery = buildSearchQuery(handle, answersNormalized);
        const cacheKey = buildSearchCacheKey(handle.id, answersNormalized);

        if (NERF_OLD_MEMORY_SEARCH || Date.now() < searchRateLimitUntil) {
            const entries = await loadEmbeddings();
            return NextResponse.json(
                {
                    folklore: buildFallbackFolklore(entries, handle.id, answersNormalized),
                    searchQuery: 'legacy-search-disabled',
                },
                {
                    headers: {
                        'x-search-cache': NERF_OLD_MEMORY_SEARCH ? 'legacy-disabled' : 'rate-limit-fallback',
                        'x-search-duration-ms': `${Date.now() - startedAt}`,
                        ...(Date.now() < searchRateLimitUntil ? { 'x-search-rate-limit': 'cooldown' } : {}),
                    },
                }
            );
        }

        const cached = getSearchCache(cacheKey);
        if (cached) {
            cacheState = 'hit';
            return NextResponse.json(
                cached,
                {
                    headers: {
                        'x-search-cache': cacheState,
                        'x-search-duration-ms': `${Date.now() - startedAt}`,
                    },
                }
            );
        }

        const inFlight = inFlightSearch.get(cacheKey);
        if (inFlight) {
            cacheState = 'in-flight';
            const result = await inFlight;
            return NextResponse.json(
                result,
                {
                    headers: {
                        'x-search-cache': cacheState,
                        'x-search-duration-ms': `${Date.now() - startedAt}`,
                    },
                }
            );
        }

        const promise = runSearchFallback(searchQuery, apiKey, handle.id, answersNormalized, req.signal);
        inFlightSearch.set(cacheKey, promise);

        try {
            const result = await promise;
            setSearchCache(cacheKey, result);
            return NextResponse.json(
                result,
                {
                    headers: {
                        'x-search-cache': cacheState,
                        'x-search-duration-ms': `${Date.now() - startedAt}`,
                    },
                }
            );
        } finally {
            if (inFlightSearch.get(cacheKey) === promise) {
                inFlightSearch.delete(cacheKey);
            }
        }
    } catch (error) {
        console.error('search-folklore error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
