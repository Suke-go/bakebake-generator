/**
 * ベクトル検索ユーティリティ
 *
 * ローカルファイルまたは Vercel Blob から
 * 事前計算済みembeddings を読み込み、cosine similarity 検索する。
 *
 * 最適化:
 * - ドキュメント側のノルムを事前計算してキャッシュ
 * - min-heap で top-K 選択 O(n log k) — フルソート O(n log n) を回避
 * - アスペクト分離検索: 事前射影済み128d×3軸ベクトルによる
 *   topic/location/phenomenon別の類似度スコア
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

// ═══════════════════════════════════════════════════════════════════════
// アスペクト分離検索 (topic / location / phenomenon)
// ═══════════════════════════════════════════════════════════════════════

/** 事前射影済みの各エントリ（128d × 3軸、L2正規化済み） */
export interface ProjectedEntry {
    id: string;
    name: string;
    summary: string;
    location: string;
    source: string;
    topic: number[];       // 128d
    location_v: number[];  // 128d (field名の衝突を避けるため _v)
    phenomenon: number[];  // 128d
}

export interface AspectScores {
    topic: number;
    location: number;
    phenomenon: number;
    combined: number;
}

export interface AspectSearchResult {
    id: string;
    kaiiName: string;
    content: string;
    location: string;
    similarity: number;      // combined score（既存互換）
    source: string;
    aspectScores: AspectScores;
}

/** 射影行列データ（384×768） */
interface ProjectionMatrixData {
    matrix: number[][];     // [384][768]
    axes: string[];
    subspaceDim: number;
    inputDim: number;
    projDim: number;
}

// キャッシュ
let cachedProjectedEntries: ProjectedEntry[] | null = null;
/** 射影行列: Float32Array of length rows*cols, row-major */
let cachedMatrixFlat: Float32Array | null = null;
let cachedMatrixRows: number = 0;
let cachedMatrixCols: number = 0;
let cachedSubspaceDim: number = 128;
let cachedNumAxes: number = 3;

/** Buffer → ArrayBufferへの安全な変換 */
function toArrayBuffer(input: Buffer | ArrayBuffer): ArrayBuffer {
    if (input instanceof ArrayBuffer) return input;
    const copy = new Uint8Array(input.byteLength);
    copy.set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
    return copy.buffer as ArrayBuffer;
}

/**
 * バイナリバッファから射影行列を読み込み
 * フォーマット: [rows:u32][cols:u32][subspaceDim:u32][numAxes:u32][data:float32[rows*cols]]
 */
function parseMatrixBinary(input: Buffer | ArrayBuffer): boolean {
    const ab = toArrayBuffer(input);
    const view = new DataView(ab);
    cachedMatrixRows = view.getUint32(0, true);
    cachedMatrixCols = view.getUint32(4, true);
    cachedSubspaceDim = view.getUint32(8, true);
    cachedNumAxes = view.getUint32(12, true);
    const dataOffset = 16;
    const floatCount = cachedMatrixRows * cachedMatrixCols;
    cachedMatrixFlat = new Float32Array(ab, dataOffset, floatCount);
    return true;
}

/**
 * バイナリバッファからベクトルを読み込み
 * フォーマット: [numEntries:u32][vectorDim:u32][data:float32[numEntries*vectorDim]]
 */
function parseVectorsBinary(input: Buffer | ArrayBuffer): Float32Array[] {
    const ab = toArrayBuffer(input);
    const view = new DataView(ab);
    const numEntries = view.getUint32(0, true);
    const vectorDim = view.getUint32(4, true);
    const dataOffset = 8;
    const allData = new Float32Array(ab, dataOffset, numEntries * vectorDim);

    const vectors: Float32Array[] = [];
    for (let i = 0; i < numEntries; i++) {
        vectors.push(allData.subarray(i * vectorDim, (i + 1) * vectorDim));
    }
    return vectors;
}

/**
 * 射影行列を読み込み（起動時1回のみ）
 * 優先順: ローカル .bin → ローカル .json → Blob .bin → Blob .json
 */
async function loadProjectionMatrixAsync(): Promise<boolean> {
    if (cachedMatrixFlat) return true;

    const analysisDir = path.join(process.cwd(), 'data', 'analysis');

    // 1. ローカル .bin
    const binPath = path.join(analysisDir, 'projection-matrix.bin');
    if (fs.existsSync(binPath)) {
        try {
            const buf = fs.readFileSync(binPath);
            parseMatrixBinary(buf);
            console.log(`Loaded projection matrix: ${cachedMatrixRows}×${cachedMatrixCols} (binary, local)`);
            return true;
        } catch (e) {
            console.warn('Failed to load projection matrix (binary local):', e);
        }
    }

    // 2. ローカル .json フォールバック
    const jsonPath = path.join(analysisDir, 'projection-matrix.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const data: ProjectionMatrixData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            cachedMatrixRows = data.matrix.length;
            cachedMatrixCols = data.matrix[0].length;
            cachedSubspaceDim = data.subspaceDim;
            cachedNumAxes = data.axes.length;
            cachedMatrixFlat = new Float32Array(cachedMatrixRows * cachedMatrixCols);
            for (let i = 0; i < cachedMatrixRows; i++) {
                for (let j = 0; j < cachedMatrixCols; j++) {
                    cachedMatrixFlat[i * cachedMatrixCols + j] = data.matrix[i][j];
                }
            }
            console.log(`Loaded projection matrix: ${cachedMatrixRows}×${cachedMatrixCols} (JSON, local)`);
            return true;
        } catch (e) {
            console.warn('Failed to load projection matrix (JSON local):', e);
        }
    }

    // 3. Blob .bin
    const blobBinUrl = process.env.PROJECTION_MATRIX_BIN_BLOB_URL;
    if (blobBinUrl) {
        try {
            const res = await fetch(blobBinUrl);
            if (res.ok) {
                const buf = await res.arrayBuffer();
                parseMatrixBinary(buf);
                console.log(`Loaded projection matrix: ${cachedMatrixRows}×${cachedMatrixCols} (binary, Blob)`);
                return true;
            }
        } catch (e) {
            console.warn('Failed to load projection matrix (binary Blob):', e);
        }
    }

    // 4. Blob .json フォールバック
    const blobJsonUrl = process.env.PROJECTION_MATRIX_BLOB_URL;
    if (blobJsonUrl) {
        try {
            const res = await fetch(blobJsonUrl);
            if (res.ok) {
                const data: ProjectionMatrixData = await res.json();
                cachedMatrixRows = data.matrix.length;
                cachedMatrixCols = data.matrix[0].length;
                cachedSubspaceDim = data.subspaceDim;
                cachedNumAxes = data.axes.length;
                cachedMatrixFlat = new Float32Array(cachedMatrixRows * cachedMatrixCols);
                for (let i = 0; i < cachedMatrixRows; i++) {
                    for (let j = 0; j < cachedMatrixCols; j++) {
                        cachedMatrixFlat[i * cachedMatrixCols + j] = data.matrix[i][j];
                    }
                }
                console.log(`Loaded projection matrix: ${cachedMatrixRows}×${cachedMatrixCols} (JSON, Blob)`);
                return true;
            }
        } catch (e) {
            console.warn('Failed to load projection matrix (JSON Blob):', e);
        }
    }

    return false;
}

function parseProjectedEntries(data: Record<string, unknown>): ProjectedEntry[] {
    const entries = data.entries as Array<Record<string, unknown>>;
    return entries.map((e) => ({
        id: e.id as string,
        name: e.name as string,
        summary: (e.summary as string) || '',
        location: (e.location as string) || '',
        source: (e.source as string) || '',
        topic: e.topic as number[],
        location_v: e.location_v as number[],
        phenomenon: e.phenomenon as number[],
    }));
}

/**
 * 事前射影済みエントリを読み込み
 * 優先順: ローカル .bin+meta → ローカル .json → Blob .bin+meta → Blob .json
 */
export async function loadProjectedEmbeddingsAsync(): Promise<ProjectedEntry[] | null> {
    if (cachedProjectedEntries) return cachedProjectedEntries;

    const analysisDir = path.join(process.cwd(), 'data', 'analysis');

    // 1. ローカル .bin + meta.json
    const binPath = path.join(analysisDir, 'projected-vectors.bin');
    const metaPath = path.join(analysisDir, 'projected-meta.json');
    if (fs.existsSync(binPath) && fs.existsSync(metaPath)) {
        try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            const buf = fs.readFileSync(binPath);
            const vectors = parseVectorsBinary(buf);
            cachedSubspaceDim = meta.subspaceDim || 128;
            const dim = cachedSubspaceDim;

            cachedProjectedEntries = meta.entries.map((e: Record<string, string>, i: number) => ({
                id: e.id,
                name: e.name,
                summary: e.summary || '',
                location: e.location || '',
                source: e.source || '',
                topic: Array.from(vectors[i].subarray(0, dim)),
                location_v: Array.from(vectors[i].subarray(dim, dim * 2)),
                phenomenon: Array.from(vectors[i].subarray(dim * 2, dim * 3)),
            }));
            console.log(`Loaded ${cachedProjectedEntries!.length} projected entries (${dim}d × 3 axes, binary, local)`);
            return cachedProjectedEntries;
        } catch (e) {
            console.warn('Failed to load projected entries (binary local):', e);
        }
    }

    // 2. ローカル .json フォールバック
    const jsonPath = path.join(analysisDir, 'projected-embeddings.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            cachedSubspaceDim = data.subspaceDim || 128;
            cachedProjectedEntries = parseProjectedEntries(data);
            console.log(`Loaded ${cachedProjectedEntries!.length} projected entries (${cachedSubspaceDim}d × 3 axes, JSON, local)`);
            return cachedProjectedEntries;
        } catch (e) {
            console.warn('Failed to load projected entries (JSON local):', e);
        }
    }

    // 3. Blob .bin + meta
    const blobBinUrl = process.env.PROJECTED_VECTORS_BIN_BLOB_URL;
    const blobMetaUrl = process.env.PROJECTED_META_BLOB_URL;
    if (blobBinUrl && blobMetaUrl) {
        try {
            const [binRes, metaRes] = await Promise.all([fetch(blobBinUrl), fetch(blobMetaUrl)]);
            if (binRes.ok && metaRes.ok) {
                const [buf, meta] = await Promise.all([binRes.arrayBuffer(), metaRes.json()]);
                const vectors = parseVectorsBinary(buf);
                cachedSubspaceDim = meta.subspaceDim || 128;
                const dim = cachedSubspaceDim;
                cachedProjectedEntries = meta.entries.map((e: Record<string, string>, i: number) => ({
                    id: e.id, name: e.name,
                    summary: e.summary || '', location: e.location || '', source: e.source || '',
                    topic: Array.from(vectors[i].subarray(0, dim)),
                    location_v: Array.from(vectors[i].subarray(dim, dim * 2)),
                    phenomenon: Array.from(vectors[i].subarray(dim * 2, dim * 3)),
                }));
                console.log(`Loaded ${cachedProjectedEntries!.length} projected entries (${dim}d × 3 axes, binary, Blob)`);
                return cachedProjectedEntries;
            }
        } catch (e) {
            console.warn('Failed to load projected entries (binary Blob):', e);
        }
    }

    // 4. Blob .json フォールバック
    const blobJsonUrl = process.env.PROJECTED_EMBEDDINGS_BLOB_URL;
    if (blobJsonUrl) {
        try {
            const res = await fetch(blobJsonUrl);
            if (res.ok) {
                const data = await res.json();
                cachedSubspaceDim = data.subspaceDim || 128;
                cachedProjectedEntries = parseProjectedEntries(data);
                console.log(`Loaded ${cachedProjectedEntries.length} projected entries (${cachedSubspaceDim}d × 3 axes, JSON, Blob)`);
                return cachedProjectedEntries;
            }
        } catch (e) {
            console.warn('Failed to load projected entries (JSON Blob):', e);
        }
    }

    return null;
}

/** 同期版（キャッシュ済み前提） */
export function loadProjectedEmbeddings(): ProjectedEntry[] | null {
    return cachedProjectedEntries;
}

/**
 * 768d クエリ embedding を 3×128d 部分空間に射影
 * matmul(matrixFlat[rows*cols], query[cols]) → proj[rows] → split → L2正規化
 * Float32Array + 1D flat layout で最大パフォーマンス
 */
function projectQuery(queryEmbedding: number[]): { topic: number[]; location: number[]; phenomenon: number[] } | null {
    if (!cachedMatrixFlat) return null;

    const rows = cachedMatrixRows;
    const cols = cachedMatrixCols;
    const proj = new Float32Array(rows);

    // matmul: proj[i] = sum(matrix[i*cols + j] * query[j])
    for (let i = 0; i < rows; i++) {
        let sum = 0;
        const offset = i * cols;
        for (let j = 0; j < cols; j++) {
            sum += cachedMatrixFlat[offset + j] * queryEmbedding[j];
        }
        proj[i] = sum;
    }

    // Split into 3 subspaces and L2-normalize each
    const dim = cachedSubspaceDim;
    const result: number[][] = [];
    for (let a = 0; a < cachedNumAxes; a++) {
        const start = a * dim;
        const sub = new Array<number>(dim);
        let norm = 0;
        for (let i = 0; i < dim; i++) {
            sub[i] = proj[start + i];
            norm += sub[i] * sub[i];
        }
        norm = Math.sqrt(norm);
        if (norm > 0) {
            for (let i = 0; i < dim; i++) sub[i] /= norm;
        }
        result.push(sub);
    }

    return { topic: result[0], location: result[1], phenomenon: result[2] };
}

/**
 * 正規化済みベクトル同士の cosine similarity (= dot product)
 */
function dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}

/**
 * アスペクト分離検索の初期化（Blob含む非同期読み込み）
 * サーバー起動時に呼ぶ
 */
export async function initAspectSearch(): Promise<boolean> {
    const [matrixOk, projected] = await Promise.all([
        loadProjectionMatrixAsync(),
        loadProjectedEmbeddingsAsync(),
    ]);
    return !!(matrixOk && projected);
}

/**
 * アスペクト分離検索: 3軸それぞれの類似度を計算して返す
 *
 * 結合スコア = wT × topic + wL × location + wP × phenomenon
 * アスペクトごとのスコアも返すため、UI側で「なぜこの結果か」を説明可能
 *
 * @param queryEmbedding 768d Gemini embedding
 * @param topK 返す件数
 * @param userRegion ユーザーの出身地域（あれば location 軸の重みを上げる）
 */
export function searchByAspects(
    queryEmbedding: number[],
    topK: number = 3,
    userRegion?: string,
): AspectSearchResult[] | null {
    const projected = loadProjectedEmbeddings();
    if (!projected || projected.length === 0) return null;

    const queryProj = projectQuery(queryEmbedding);
    if (!queryProj) return null;

    // ユーザーの出身地域がある場合、location 軸の重みを上げる
    const wT = 1.0;
    const wL = userRegion ? 1.5 : 1.0;
    const wP = 1.0;
    const wSum = wT + wL + wP;

    const heap = new MinHeap<{ entry: ProjectedEntry; aspects: AspectScores }>(topK);

    for (let i = 0; i < projected.length; i++) {
        const entry = projected[i];
        const topicSim = dotProduct(queryProj.topic, entry.topic);
        const locSim = dotProduct(queryProj.location, entry.location_v);
        const phenomSim = dotProduct(queryProj.phenomenon, entry.phenomenon);
        const combined = (wT * topicSim + wL * locSim + wP * phenomSim) / wSum;

        if (heap.size < topK || combined > heap.minScore) {
            heap.push(combined, {
                entry,
                aspects: {
                    topic: Math.round(topicSim * 1000) / 1000,
                    location: Math.round(locSim * 1000) / 1000,
                    phenomenon: Math.round(phenomSim * 1000) / 1000,
                    combined: Math.round(combined * 1000) / 1000,
                },
            });
        }
    }

    return heap.drain().map(({ score, value }) => ({
        id: value.entry.id,
        kaiiName: value.entry.name,
        content: value.entry.summary,
        location: value.entry.location,
        similarity: Math.round(score * 1000) / 1000,
        source: value.entry.source,
        aspectScores: value.aspects,
    }));
}

