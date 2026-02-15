/**
 * フロントエンド → API 呼び出しクライアント
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
    }>;
}

export interface ImageResponse {
    imageBase64: string;
    imageMimeType: string;
    narrative: string;
}

/**
 * Phase 1' 完了後: 類似伝承を検索
 */
export async function searchFolklore(
    handle: { id: string; text: string },
    answers: Record<string, string>
): Promise<FolkloreSearchResponse> {
    const res = await fetch('/api/search-folklore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, answers }),
    });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    return res.json();
}

/**
 * 伝承結果から概念候補を生成
 */
export async function generateConcepts(
    folklore: SearchResult[],
    answers: Record<string, string>,
    handle: { id: string; text: string }
): Promise<ConceptResponse> {
    const res = await fetch('/api/generate-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folklore, answers, handle }),
    });
    if (!res.ok) throw new Error(`Concept generation failed: ${res.status}`);
    return res.json();
}

/**
 * 画像 + ナラティブ生成
 */
export async function generateImage(
    concept: { name: string; reading: string; description: string },
    artStyle: string,
    visualInput: string,
    answers: Record<string, string>
): Promise<ImageResponse> {
    const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, artStyle, visualInput, answers }),
    });
    if (!res.ok) throw new Error(`Image generation failed: ${res.status}`);
    return res.json();
}
