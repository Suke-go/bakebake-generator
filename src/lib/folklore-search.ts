/**
 * ベクトル検索ユーティリティ
 *
 * Vercel Blob に保存された事前計算済みembeddings を
 * インメモリで cosine similarity 検索する。
 */

export interface FolkloreEntry {
    id: string;
    name: string;        // 呼称
    summary: string;     // 要約
    location: string;    // 地域
    source: string;      // 出典
    embedding: number[]; // 768次元 (gemini-embedding-001)
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
 * Vercel Blob から embedding データを読み込み（キャッシュ付き）
 */
export async function loadEmbeddings(): Promise<FolkloreEntry[]> {
    if (cachedEntries) return cachedEntries;

    const blobUrl = process.env.FOLKLORE_BLOB_URL;
    if (!blobUrl) {
        console.warn('FOLKLORE_BLOB_URL not set, using empty dataset');
        return [];
    }

    const res = await fetch(blobUrl);
    if (!res.ok) {
        throw new Error(`Failed to load embeddings: ${res.status}`);
    }

    const data = await res.json();
    cachedEntries = data.entries as FolkloreEntry[];
    console.log(`Loaded ${cachedEntries.length} folklore entries`);
    return cachedEntries;
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
