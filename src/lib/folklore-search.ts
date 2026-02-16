/**
 * ベクトル検索ユーティリティ
 *
 * ローカルファイルまたは Vercel Blob から
 * 事前計算済みembeddings を読み込み、cosine similarity 検索する。
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FolkloreEntry {
    id: string;
    name: string;        // 呼称
    summary: string;     // 要約
    location: string;    // 地域
    source: string;      // 出典
    embedding: number[]; // 3072次元 (gemini-embedding-001)
}

export interface SearchResult {
    id: string;
    kaiiName: string;
    content: string;
    location: string;
    similarity: number;
    source: string;
}

/**
 * cosine similarity を計算
 */
function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * embedding キャッシュ（Fluid Compute でインスタンス再利用）
 */
let cachedEntries: FolkloreEntry[] | null = null;

/**
 * embedding データを読み込み（キャッシュ付き）
 * - ローカルファイル (data/folklore-embeddings.json) を優先
 * - FOLKLORE_BLOB_URL があればそこからフェッチ（本番用）
 */
export async function loadEmbeddings(): Promise<FolkloreEntry[]> {
    if (cachedEntries) return cachedEntries;

    // 1. ローカルファイルを試す
    const localPath = path.join(process.cwd(), 'data', 'folklore-embeddings.json');
    if (fs.existsSync(localPath)) {
        const raw = fs.readFileSync(localPath, 'utf-8');
        const data = JSON.parse(raw);
        cachedEntries = data.entries as FolkloreEntry[];
        console.log(`Loaded ${cachedEntries.length} folklore entries (local file)`);
        return cachedEntries;
    }

    // 2. Vercel Blob からフェッチ（本番用）
    const blobUrl = process.env.FOLKLORE_BLOB_URL;
    if (blobUrl) {
        const res = await fetch(blobUrl);
        if (!res.ok) {
            throw new Error(`Failed to load embeddings from Blob: ${res.status}`);
        }
        const data = await res.json();
        cachedEntries = data.entries as FolkloreEntry[];
        console.log(`Loaded ${cachedEntries.length} folklore entries (Blob)`);
        return cachedEntries;
    }

    console.warn('No embedding data found (local or Blob). Using empty dataset.');
    return [];
}

/**
 * 類似検索: query embedding に最も近い entries を topK 件返す
 */
export function searchByEmbedding(
    queryEmbedding: number[],
    entries: FolkloreEntry[],
    topK: number = 5
): SearchResult[] {
    const scored = entries.map(entry => ({
        entry,
        similarity: cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    scored.sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, topK).map(({ entry, similarity }) => ({
        id: entry.id,
        kaiiName: entry.name,
        content: entry.summary,
        location: entry.location,
        similarity: Math.round(similarity * 1000) / 1000,
        source: entry.source,
    }));
}
