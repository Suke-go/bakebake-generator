import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { buildSearchQuery, type HandleInfo, type UserAnswers } from '@/lib/prompt-builder';
import { toErrorMessage } from '@/lib/genai-utils';
import { searchByEventAndAppraisal, RuriUnavailable, type RankedFolkloreRecord } from '@/lib/event-appraisal-search';

export const runtime = 'nodejs';
export const maxDuration = 120;

const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_RESULT_CACHE_SIZE = 200;

interface SearchEventsResponse {
    ranked: RankedFolkloreRecord[];
    corpusVersion: string;
    branchSizes: { event: number; appraisal: number };
    paidApiCalls: number;
}
type CacheEntry = { value: SearchEventsResponse; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<SearchEventsResponse>>();

function cacheKey(handle: HandleInfo, answers: UserAnswers, eventText: string, appraisalText: string): string {
    const stable = JSON.stringify([
        handle.id,
        handle.text,
        Object.keys(answers).sort().map((key) => [key, (answers as Record<string, string>)[key]]),
        eventText,
        appraisalText,
    ]);
    return createHash('sha256').update(stable).digest('hex');
}

function setCache(key: string, value: SearchEventsResponse) {
    if (cache.size >= SEARCH_RESULT_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(key, { value, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
}

const JAPANESE = /[぀-ヿ一-鿿]/;

/**
 * The archive summaries are Japanese, and both the lexical stage and the reranker
 * read Japanese. An account written in another language shares no words with them
 * (an English "a" only meets the anonymised "Aさん" of the summaries), so it is
 * translated before the search. Returns null when no translation is available.
 */
async function toJapanese(texts: string[]): Promise<string[] | null> {
    const prompt = [
        'Translate each string of the JSON array below into plain, natural Japanese.',
        'Translate faithfully: add nothing, explain nothing, keep names of places as they are.',
        'Return only a JSON array of the same length, in the same order.',
        JSON.stringify(texts),
    ].join('\n');
    const apiKeys = [process.env.GEMINI_API_KEY, process.env.GEMINI_SUB_API_KEY].filter(Boolean) as string[];
    for (const apiKey of apiKeys) {
        try {
            const generated = await new GoogleGenAI({ apiKey }).models.generateContent({
                model: 'gemini-3.8-flash',
                contents: prompt,
                config: { responseMimeType: 'application/json' },
            });
            const parsed: unknown = JSON.parse(generated.text || '');
            if (Array.isArray(parsed) && parsed.length === texts.length && parsed.every((item) => typeof item === 'string' && item.trim())) {
                return parsed as string[];
            }
        } catch (error) {
            console.warn('search-events: translation failed:', toErrorMessage(error));
        }
    }
    return null;
}

export async function POST(req: Request) {
    try {
        const startedAt = Date.now();
        let bodyText: string;
        try {
            bodyText = await req.text();
        } catch {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        if (!bodyText.trim()) return NextResponse.json({ error: 'Request body is empty' }, { status: 400 });

        let payload: unknown;
        try {
            payload = JSON.parse(bodyText);
        } catch {
            return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
        }

        const { handle, answers, eventText, appraisalText, limit } = payload as {
            handle?: HandleInfo;
            answers?: UserAnswers;
            eventText?: string;
            appraisalText?: string;
            limit?: number;
        };
        const validHandle = handle && typeof handle.id === 'string' && typeof handle.text === 'string';
        const validAnswers = typeof answers === 'object' && answers !== null;
        if (!validHandle || !validAnswers || typeof eventText !== 'string' || typeof appraisalText !== 'string' || !eventText.trim() || !appraisalText.trim()) {
            return NextResponse.json({ error: 'handle, answers, eventText, and appraisalText are required' }, { status: 400 });
        }
        const resultLimit = Number.isInteger(limit) && limit! >= 1 && limit! <= 10 ? limit! : 5;

        const key = cacheKey(handle, answers, eventText, appraisalText);
        const cached = cache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return NextResponse.json(cached.value, {
                headers: {
                    'x-search-events-cache': 'hit',
                    'x-search-events-duration-ms': `${Date.now() - startedAt}`,
                },
            });
        }

        let promise = inFlight.get(key);
        if (!promise) {
            promise = (async (): Promise<SearchEventsResponse> => {
                let queries = [buildSearchQuery(handle, answers), eventText, appraisalText];
                let paidApiCalls = 0;
                if (!JAPANESE.test(eventText + appraisalText)) {
                    const translated = await toJapanese(queries);
                    if (translated) {
                        queries = translated;
                        paidApiCalls = 1;
                    }
                }
                const result = await searchByEventAndAppraisal(queries[0], queries[1], queries[2], resultLimit);
                return {
                    ranked: result.ranked,
                    corpusVersion: result.corpusVersion,
                    branchSizes: result.branchSizes,
                    paidApiCalls,
                };
            })();
            inFlight.set(key, promise);
            promise.finally(() => inFlight.delete(key));
        }

        const value = await promise;
        setCache(key, value);
        return NextResponse.json(value, {
            headers: {
                'x-search-events-cache': 'miss',
                'x-search-events-duration-ms': `${Date.now() - startedAt}`,
            },
        });
    } catch (error) {
        if (error instanceof RuriUnavailable) {
            console.warn('search-events: reranker unavailable:', error.message);
            return NextResponse.json({ error: 'Reranker unavailable' }, { status: 503 });
        }
        console.error('search-events error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
