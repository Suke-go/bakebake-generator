/**
 * ベクトル検索ユーティリティ
 *
 * ローカルファイルまたは Vercel Blob から
 * 事前計算済みembeddings を読み込み、cosine similarity 検索する。
 *
 * 最適化:
 * - ドキュメント側のノルムを事前計算してキャッシュ
 * - min-heap で top-K 選択 O(n log k) — フルソート O(n log n) を回避
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FolkloreEntry {
    id: string;
    name: string;        // 呼称
    summary: string;     // 要約
    location: string;    // 地域
    source: string;      // 出典
    embedding: number[]; // 768次元 (gemini-embedding-001 with outputDimensionality)
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
 * ベクトルのL2ノルムを計算
 */
function vectorNorm(v: number[]): number {
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
        sum += v[i] * v[i];
    }
    return Math.sqrt(sum);
}

/**
 * 事前計算済みノルムを使った cosine similarity
 * sim = dot(a,b) / (normA * normB)
 */
function cosineSimilarityWithNorms(a: number[], b: number[], normA: number, normB: number): number {
    const denom = normA * normB;
    if (denom === 0) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot / denom;
}

/**
 * Min-heap: top-K を O(n log k) で選択するためのヒープ
 */
class MinHeap<T> {
    private heap: { score: number; value: T }[] = [];

    constructor(private capacity: number) { }

    get size() { return this.heap.length; }
    get minScore() { return this.heap.length > 0 ? this.heap[0].score : -Infinity; }

    push(score: number, value: T) {
        if (this.heap.length < this.capacity) {
            this.heap.push({ score, value });
            this._bubbleUp(this.heap.length - 1);
        } else if (score > this.heap[0].score) {
            this.heap[0] = { score, value };
            this._sinkDown(0);
        }
    }

    drain(): { score: number; value: T }[] {
        const result: { score: number; value: T }[] = [];
        while (this.heap.length > 0) {
            result.push(this.heap[0]);
            const last = this.heap.pop()!;
            if (this.heap.length > 0) {
                this.heap[0] = last;
                this._sinkDown(0);
            }
        }
        return result.reverse(); // 降順にする
    }

    private _bubbleUp(i: number) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.heap[i].score < this.heap[parent].score) {
                [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
                i = parent;
            } else break;
        }
    }

    private _sinkDown(i: number) {
        const n = this.heap.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this.heap[left].score < this.heap[smallest].score) smallest = left;
            if (right < n && this.heap[right].score < this.heap[smallest].score) smallest = right;
            if (smallest === i) break;
            [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
            i = smallest;
        }
    }
}

/**
 * embedding キャッシュ（Fluid Compute でインスタンス再利用）
 */
let cachedEntries: FolkloreEntry[] | null = null;
/** 事前計算済みのドキュメントノルム（cachedEntries と同じ順序） */
let cachedNorms: number[] | null = null;

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
        precomputeNorms(cachedEntries);
        console.log(`Loaded ${cachedEntries.length} folklore entries (local file)`);
        return cachedEntries;
    }

    // 2. Vercel Blob からフェッチ（本番用、public store）
    const blobUrl = process.env.FOLKLORE_BLOB_URL;
    if (blobUrl) {
        console.log(`Fetching embeddings from Blob: ${blobUrl.slice(0, 60)}...`);
        const res = await fetch(blobUrl);
        if (!res.ok) {
            throw new Error(`Failed to load embeddings from Blob: ${res.status}`);
        }
        const data = await res.json();
        cachedEntries = data.entries as FolkloreEntry[];
        precomputeNorms(cachedEntries);
        console.log(`Loaded ${cachedEntries.length} folklore entries (Blob)`);
        return cachedEntries;
    }

    console.warn('No embedding data found (local or Blob). Using empty dataset.');
    return [];
}

/**
 * 全エントリのノルムを事前計算（loadEmbeddings 直後に1回だけ実行）
 */
function precomputeNorms(entries: FolkloreEntry[]) {
    cachedNorms = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
        cachedNorms[i] = vectorNorm(entries[i].embedding);
    }
}

/**
 * 類似検索: query embedding に最も近い entries を topK 件返す
 *
 * 最適化:
 * - クエリノルムは1回だけ計算
 * - ドキュメントノルムは事前計算済みキャッシュを使用
 * - min-heap で top-K 選択 → O(n log k) vs 旧実装 O(n log n)
 */
export function searchByEmbedding(
    queryEmbedding: number[],
    entries: FolkloreEntry[],
    topK: number = 3
): SearchResult[] {
    if (entries.length === 0) return [];

    const queryNorm = vectorNorm(queryEmbedding);
    const heap = new MinHeap<FolkloreEntry>(topK);

    for (let i = 0; i < entries.length; i++) {
        const docNorm = cachedNorms ? cachedNorms[i] : vectorNorm(entries[i].embedding);
        const similarity = cosineSimilarityWithNorms(
            queryEmbedding, entries[i].embedding,
            queryNorm, docNorm
        );

        // heap がまだ埋まってないか、現在の最小より大きい場合のみ push
        if (heap.size < topK || similarity > heap.minScore) {
            heap.push(similarity, entries[i]);
        }
    }

    return heap.drain().map(({ score, value }) => ({
        id: value.id,
        kaiiName: value.name,
        content: value.summary,
        location: value.location,
        similarity: Math.round(score * 1000) / 1000,
        source: value.source,
    }));
}
