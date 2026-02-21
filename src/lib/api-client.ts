/**
 * Client helper for API endpoints.
 */

import type { SearchResult } from './folklore-search';

export interface FolkloreSearchResponse {
    folklore: SearchResult[];
    searchQuery: string;
}

export interface ConceptResponse {
    concepts: Array<{
        source: 'db' | 'llm';
        name: string;
        reading: string;
        description: string;
        label: string;
        folkloreRef?: string;
        namingType?: string;
    }>;
}

export interface ImageResponse {
    imageBase64: string;
    imageMimeType: string;
    narrative: string;
    usedModel?: string;
    warnings?: string[];
}

const NERF_OLD_MEMORY_SEARCH = process.env.NEXT_PUBLIC_DISABLE_OLD_MEMORY_SEARCH === 'true';

type SearchCacheEntry = {
    value: FolkloreSearchResponse;
    expiresAt: number;
};

const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CLIENT_CACHE_SIZE = 64;
const CONCEPT_CACHE_TTL_MS = 60_000;
const CONCEPT_CLIENT_CACHE_SIZE = 64;
const IMAGE_CACHE_TTL_MS = 60_000;
const IMAGE_CLIENT_CACHE_SIZE = 24;
const IMAGE_CACHE_KEY_SEPARATOR = '||';
const SEARCH_CACHE_KEY_SEPARATOR = '|';

const searchClientCache = new Map<string, SearchCacheEntry>();
const searchClientInFlight = new Map<string, Promise<FolkloreSearchResponse>>();
const conceptClientCache = new Map<string, { value: ConceptResponse; expiresAt: number }>();
const conceptClientInFlight = new Map<string, Promise<ConceptResponse>>();
const imageClientCache = new Map<string, { value: ImageResponse; expiresAt: number }>();
const imageClientInFlight = new Map<string, Promise<ImageResponse>>();

function makeFallbackFolklore(
    handle: { id: string; text: string },
    answers: Record<string, string>
): SearchResult[] {
    const sortedAnswerKeys = Object.keys(answers).sort();
    const seedBase = `${handle.id}|${sortedAnswerKeys.map((key) => `${key}:${answers[key] ?? ''}`).join('|')}`;
    const seed = Math.abs(seedBase.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));
    const themes = [
        '古い記憶の残滓',
        '心象の境界',
        '夜闇に溶けた記録',
        '幻の行方',
        '昨日の嘆き',
    ];

    return themes.map((theme, index) => ({
        id: `fallback-${handle.id}-${index}-${(seed + index) % 997}`,
        kaiiName: `${handle.text} / ${theme}`,
        content: `旧世代の伝承検索を軽量化モードでスキップし、暫定データで候補を作成しています。(${index + 1})`,
        location: '簡易参照',
        similarity: 0.98 - index * 0.08,
        source: 'fallback',
    }));
}

function buildSearchCacheKey(handle: { id: string; text: string }, answers: Record<string, string>): string {
    const normalizedAnswers = Object.keys(answers)
        .sort()
        .map((key) => `${key}:${answers[key] ?? ''}`)
        .join('|');
    return `${handle.id}|${normalizedAnswers}`;
}

function setSearchCache(key: string, value: FolkloreSearchResponse) {
    if (searchClientCache.size >= SEARCH_CLIENT_CACHE_SIZE) {
        const oldestKey = searchClientCache.keys().next().value;
        if (oldestKey) {
            searchClientCache.delete(oldestKey);
        }
    }
    searchClientCache.set(key, { value, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
}

function getSearchCache(key: string): FolkloreSearchResponse | null {
    const entry = searchClientCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        searchClientCache.delete(key);
        return null;
    }
    return entry.value;
}

function buildConceptCacheKey(
    folklore: SearchResult[],
    answers: Record<string, string>,
    handle: { id: string; text: string }
): string {
    const sortedAnswerKeys = Object.keys(answers).sort();
    const normalizedAnswers = sortedAnswerKeys.map((key) => `${key}:${answers[key] ?? ''}`).join(SEARCH_CACHE_KEY_SEPARATOR);
    const folkloreSignature = folklore
        .slice(0, 3)
        .map((item) => item.id)
        .join(SEARCH_CACHE_KEY_SEPARATOR);
    return `${handle.id}|${normalizedAnswers}|${folkloreSignature}`;
}

function getConceptCache(key: string): ConceptResponse | null {
    const entry = conceptClientCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        conceptClientCache.delete(key);
        return null;
    }
    return entry.value;
}

function setConceptCache(key: string, value: ConceptResponse) {
    if (conceptClientCache.size >= CONCEPT_CLIENT_CACHE_SIZE) {
        const oldestKey = conceptClientCache.keys().next().value;
        if (oldestKey) {
            conceptClientCache.delete(oldestKey);
        }
    }
    conceptClientCache.set(key, { value, expiresAt: Date.now() + CONCEPT_CACHE_TTL_MS });
}

function buildImageCacheKey(
    concept: { name: string; reading: string; description: string },
    artStyle: string,
    visualInput: string,
    answers: Record<string, string>
): string {
    const sortedAnswerKeys = Object.keys(answers).sort();
    const answerSig = sortedAnswerKeys.map((key) => `${key}:${answers[key] ?? ''}`).join(IMAGE_CACHE_KEY_SEPARATOR);
    return `${concept.name}${IMAGE_CACHE_KEY_SEPARATOR}${concept.reading}${IMAGE_CACHE_KEY_SEPARATOR}${concept.description}${IMAGE_CACHE_KEY_SEPARATOR}${artStyle}${IMAGE_CACHE_KEY_SEPARATOR}${answerSig}${IMAGE_CACHE_KEY_SEPARATOR}${visualInput}`;
}

function getImageCache(key: string): ImageResponse | null {
    const entry = imageClientCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        imageClientCache.delete(key);
        return null;
    }
    return entry.value;
}

function setImageCache(key: string, value: ImageResponse) {
    if (imageClientCache.size >= IMAGE_CLIENT_CACHE_SIZE) {
        const oldestKey = imageClientCache.keys().next().value;
        if (oldestKey) {
            imageClientCache.delete(oldestKey);
        }
    }
    imageClientCache.set(key, { value, expiresAt: Date.now() + IMAGE_CACHE_TTL_MS });
}

const API_RETRY_MAX_ATTEMPTS = 3;
const API_RETRY_BASE_MS = 600;

type ApiError = Error & {
    status?: number;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortError(reason?: unknown): Error {
    const message =
        typeof reason === 'string' && reason.trim().length > 0
            ? reason
            : 'The request was aborted';

    try {
        return new DOMException(message, 'AbortError');
    } catch {
        const error = new Error(message);
        error.name = 'AbortError';
        return error;
    }
}

function isAbortError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    throw createAbortError(signal.reason);
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) {
        return Promise.reject(createAbortError(signal.reason));
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            cleanup();
            reject(createAbortError(signal.reason));
        };

        const cleanup = () => {
            signal.removeEventListener('abort', onAbort);
        };

        signal.addEventListener('abort', onAbort, { once: true });

        promise.then(
            (value) => {
                cleanup();
                resolve(value);
            },
            (error) => {
                cleanup();
                reject(error);
            }
        );
    });
}

function isRetryableError(error: unknown): boolean {
    if (isAbortError(error)) return false;
    if (error && typeof error === 'object' && 'status' in error) {
        const status = Number((error as { status?: unknown }).status);
        if (Number.isFinite(status)) {
            return (
                (status >= 500 && status < 600) ||
                status === 408 ||
                status === 409
                ||
                status === 429
            );
        }
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('failed to fetch') || message.includes('network');
    }

    return false;
}

function shouldLogRequestError(error: unknown): error is ApiError {
    return error instanceof Error;
}

async function requestJsonInternal<T>(
    pathname: string,
    body: unknown,
    attempt = 1
): Promise<T> {
    const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };

    try {
        const res = await fetch(pathname, init);
        if (!res.ok) {
            const payload = await res.json().catch(() => null);
            const message = typeof payload === 'object' && payload && typeof (payload as { error?: unknown }).error === 'string'
                ? (payload as { error: string }).error
                : `Request failed: ${res.status}`;
            const err = new Error(message) as ApiError;
            err.status = res.status;
            throw err;
        }

        return (await res.json()) as T;
    } catch (error) {
        if (attempt < API_RETRY_MAX_ATTEMPTS && isRetryableError(error)) {
            const delay = API_RETRY_BASE_MS * attempt + Math.random() * API_RETRY_BASE_MS;
            console.warn(
                `[${pathname}] retryable error, attempt ${attempt}/${API_RETRY_MAX_ATTEMPTS}: ${shouldLogRequestError(error) ? error.message : String(error)}`
            );
            await sleep(delay);
            return requestJsonInternal<T>(pathname, body, attempt + 1);
        }

        const message = shouldLogRequestError(error) ? error.message : 'Request failed';
        throw new Error(message);
    }
}

/**
 * Phase 1' からの伝承検索 API
 */
export async function searchFolklore(
    handle: { id: string; text: string },
    answers: Record<string, string>,
    signal?: AbortSignal
): Promise<FolkloreSearchResponse> {
    throwIfAborted(signal);

    if (NERF_OLD_MEMORY_SEARCH) {
        const fallback = makeFallbackFolklore(handle, answers);
        return { folklore: fallback, searchQuery: 'legacy-search-disabled' };
    }

    const cacheKey = buildSearchCacheKey(handle, answers);
    const cached = getSearchCache(cacheKey);
    if (cached) {
        return cached;
    }

    const inFlight = searchClientInFlight.get(cacheKey);
    if (inFlight) {
        return withAbortSignal(inFlight, signal);
    }

    const sharedRequest = requestJsonInternal<FolkloreSearchResponse>('/api/search-folklore', { handle, answers })
        .then((result) => {
            setSearchCache(cacheKey, result);
            return result;
        });

    const trackedRequest = sharedRequest.finally(() => {
        if (searchClientInFlight.get(cacheKey) === trackedRequest) {
            searchClientInFlight.delete(cacheKey);
        }
    });
    searchClientInFlight.set(cacheKey, trackedRequest);

    return withAbortSignal(trackedRequest, signal);
}

/**
 * 伝承表示 → 概念生成 API
 */
export async function generateConcepts(
    folklore: SearchResult[],
    answers: Record<string, string>,
    handle: { id: string; text: string },
    signal?: AbortSignal
): Promise<ConceptResponse> {
    throwIfAborted(signal);

    const cacheKey = buildConceptCacheKey(folklore, answers, handle);
    const cached = getConceptCache(cacheKey);
    if (cached) {
        return cached;
    }

    const inFlight = conceptClientInFlight.get(cacheKey);
    if (inFlight) {
        return withAbortSignal(inFlight, signal);
    }

    const sharedRequest = requestJsonInternal<ConceptResponse>('/api/generate-concepts', { folklore, answers, handle })
        .then((result) => {
            setConceptCache(cacheKey, result);
            return result;
        });

    const trackedRequest = sharedRequest.finally(() => {
        if (conceptClientInFlight.get(cacheKey) === trackedRequest) {
            conceptClientInFlight.delete(cacheKey);
        }
    });
    conceptClientInFlight.set(cacheKey, trackedRequest);

    return withAbortSignal(trackedRequest, signal);
}

/**
 * Phase 3 画像生成 API
 */
export async function generateImage(
    concept: { name: string; reading: string; description: string },
    artStyle: string,
    visualInput: string,
    answers: Record<string, string>,
    signal?: AbortSignal,
    folklore?: Array<{ kaiiName: string; content: string; location?: string }>
): Promise<ImageResponse> {
    throwIfAborted(signal);

    const cacheKey = buildImageCacheKey(concept, artStyle, visualInput, answers);
    const cached = getImageCache(cacheKey);
    if (cached) {
        return cached;
    }

    const inFlight = imageClientInFlight.get(cacheKey);
    if (inFlight) {
        return withAbortSignal(inFlight, signal);
    }

    const sharedRequest = requestJsonInternal<ImageResponse>('/api/generate-image', { concept, artStyle, visualInput, answers, folklore: folklore || [] })
        .then((result) => {
            setImageCache(cacheKey, result);
            return result;
        });

    const trackedRequest = sharedRequest.finally(() => {
        if (imageClientInFlight.get(cacheKey) === trackedRequest) {
            imageClientInFlight.delete(cacheKey);
        }
    });
    imageClientInFlight.set(cacheKey, trackedRequest);

    return withAbortSignal(trackedRequest, signal);
}
