import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ExperienceSearchRequest, ExperienceSearchResponse, ExperienceVariant } from './experience-search-types';

const MODEL = 'Xenova/multilingual-e5-small';
export const QUERY_MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const DIM = 384;
const CANDIDATE_BUDGET = 60;
const RRF_K = 60;
export const EXPERIENCE_MODEL_VERSION = 'experience-summary-v1.0.1';

export interface RecordEntry { id: string; name: string; summary: string; prefecture: string }
export interface ExperienceSearchManifest {
    version: string; corpusSha256: string; recordsSha256: string; vectorsSha256: string;
    count: number; dimensions: number; modelRevision: string; source: string;
}
interface Corpus { records: RecordEntry[]; manifest: ExperienceSearchManifest }
let corpusPromise: Promise<Corpus> | undefined;
let vectorPromise: Promise<Float32Array> | undefined;

export class ExperienceSearchUnavailable extends Error { }

export async function loadExperienceCorpus(): Promise<Corpus> {
    if (!corpusPromise) corpusPromise = (async () => {
        const dir = path.join(process.cwd(), 'data', 'experience-search');
        const [raw, meta] = await Promise.all([fs.readFile(path.join(dir, 'records.json')), fs.readFile(path.join(dir, 'manifest.json'), 'utf8')]);
        const manifest: ExperienceSearchManifest = JSON.parse(meta);
        if (createHash('sha256').update(raw).digest('hex') !== manifest.recordsSha256) throw new Error('Record checksum mismatch');
        const records: RecordEntry[] = JSON.parse(raw.toString('utf8'));
        if (records.length !== manifest.count || manifest.dimensions !== DIM) throw new Error('Corpus dimensions mismatch');
        return { records, manifest };
    })().catch(() => { corpusPromise = undefined; throw new ExperienceSearchUnavailable('検索資料を読み込めません。'); });
    return corpusPromise;
}

async function loadVectors(manifest: ExperienceSearchManifest): Promise<Float32Array> {
    if (!vectorPromise) vectorPromise = (async () => {
        const binary = await fs.readFile(path.join(process.cwd(), 'data', 'experience-search', 'document-vectors.f32'));
        if (binary.byteLength !== manifest.count * DIM * 4 || createHash('sha256').update(binary).digest('hex') !== manifest.vectorsSha256) {
            throw new Error('E5 index mismatch');
        }
        // A standalone ArrayBuffer avoids alignment assumptions about Node Buffer offsets.
        const bytes = new Uint8Array(binary.byteLength);
        bytes.set(binary);
        return new Float32Array(bytes.buffer);
    })().catch(() => { vectorPromise = undefined; throw new ExperienceSearchUnavailable('意味検索の索引を読み込めません。'); });
    return vectorPromise;
}

interface EncodedQueries { vectors: number[][]; tokenCounts: number[] }
type Encoder = (texts: string[]) => Promise<EncodedQueries>;
let encoderPromise: Promise<Encoder> | undefined;
async function encodeExperienceBatch(texts: string[]): Promise<EncodedQueries> {
    if (!encoderPromise) encoderPromise = (async () => {
        const { pipeline, env, mean_pooling, AutoTokenizer } = await import('@huggingface/transformers');
        // Retrieval must stay offline. The model cache is shipped with the app;
        // a missing cache is an explicit availability error, never a download.
        env.allowLocalModels = true;
        env.allowRemoteModels = false;
        const cacheDir = process.env.EXPERIENCE_MODEL_CACHE_DIR || path.join(process.cwd(), 'data', 'experience-search-model-cache');
        const localModelDir = path.join(cacheDir, ...MODEL.split('/'), QUERY_MODEL_REVISION);
        const modelOptions = { local_files_only: true } as const;
        // Transformers.js 4's pipeline file discovery can omit the tokenizer
        // for an older, fully cached model revision. Load it explicitly from
        // the same offline cache so the route never depends on the network.
        const [encoder, tokenizer] = await Promise.all([
            pipeline('feature-extraction', localModelDir, {
                ...modelOptions, dtype: 'q8', device: 'cpu',
                session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
            }),
            AutoTokenizer.from_pretrained(localModelDir, modelOptions),
        ]);
        return async (input: string[]) => {
            const prefixed = input.map(t => `query: ${t}`);
            // Transformers.js 4 instances expose the implementation through
            // _call.  Calling the object itself is not preserved by the Next
            // server bundler and fails at runtime with "tokenizer is not a
            // function" even though the same object is callable in raw ESM.
            const tokenCounts = prefixed.map(t => tokenizer._call(t, { return_tensor: false, truncation: false }).input_ids.length);
            const vectors: number[][] = [];
            // Dynamic q8 activation scales can depend on other batch items/padding.
            // Always encode each route alone so fusion cannot change the full-query vector.
            for (const text of prefixed) {
                const tokens = tokenizer._call([text], { padding: true, truncation: true, max_length: 512 });
                const output = await encoder.model._call(tokens);
                const result = mean_pooling(output.last_hidden_state, tokens.attention_mask).normalize(2, -1);
                vectors.push((result.tolist() as number[][])[0]);
            }
            if (vectors.length !== input.length || vectors.some(v => v.length !== DIM || v.some(n => !Number.isFinite(n)))) throw new Error('Invalid query vector');
            return { vectors, tokenCounts };
        };
    })().catch(() => { encoderPromise = undefined; throw new ExperienceSearchUnavailable('意味検索モデルを準備できませんでした。時間をおいて再試行するか、語句検索をお試しください。'); });
    const encode = await encoderPromise;
    return encode(texts);
}

export async function encodeExperienceQueries(texts: string[]): Promise<number[][]> {
    return (await encodeExperienceBatch(texts)).vectors;
}

/** Literal sentence excerpts only: no inferred emotions, clauses, causes or entities. */
export function experiencePaths(experience: string, focus: string, variant: ExperienceVariant): string[] {
    const combined = [experience, focus].filter(Boolean).join('\n');
    if (variant === 'baseline') return [combined];
    const sentences = experience.match(/[^。！？!?\n]+[。！？!?]*/gu)?.map(s => s.trim()).filter(Boolean) || [];
    // Keep entire input even when a longer text contains more sentences than the cap.
    const extras = [...(sentences.length > 1 ? sentences.slice(0, 3) : []), ...(focus ? [focus] : [])];
    return [...new Set([combined, ...extras])];
}

const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
export function experienceTokens(text: string): string[] {
    return [...segmenter.segment(text.normalize('NFKC').toLowerCase())].filter(s => s.isWordLike).map(s => s.segment);
}
interface Posting { doc: number; tf: number }
interface LexicalIndex { postings: Map<string, Posting[]>; lengths: number[]; avg: number }
let lexicalIndex: LexicalIndex | undefined;
function indexLexical(records: RecordEntry[]): LexicalIndex {
    if (lexicalIndex) return lexicalIndex;
    const postings = new Map<string, Posting[]>();
    const lengths: number[] = [];
    records.forEach((r, doc) => {
        const ts = experienceTokens(r.summary); lengths.push(ts.length);
        const counts = new Map<string, number>(); ts.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
        counts.forEach((tf, token) => { const list = postings.get(token) || []; list.push({ doc, tf }); postings.set(token, list); });
    });
    lexicalIndex = { postings, lengths, avg: lengths.reduce((a, b) => a + b, 0) / lengths.length };
    return lexicalIndex;
}

function lexicalScores(query: string, records: RecordEntry[]): Float64Array {
    const index = indexLexical(records);
    const scores = new Float64Array(records.length);
    for (const t of experienceTokens(query)) {
        const postings = index.postings.get(t); if (!postings) continue;
        const idf = Math.log1p((records.length - postings.length + .5) / (postings.length + .5));
        for (const { doc, tf } of postings) scores[doc] += idf * tf * 2.2 / (tf + 1.2 * (.25 + .75 * index.lengths[doc] / index.avg));
    }
    return scores;
}

function cosineScores(query: number[], vectors: Float32Array, count: number): Float64Array {
    const scores = new Float64Array(count);
    for (let doc = 0; doc < count; doc++) {
        let score = 0; const offset = doc * DIM;
        for (let d = 0; d < DIM; d++) score += query[d] * vectors[offset + d];
        scores[doc] = score;
    }
    return scores;
}

function sorted(scores: Float64Array, records: RecordEntry[], positiveOnly: boolean): number[] {
    return records.map((_, i) => i).filter(i => Number.isFinite(scores[i]) && (!positiveOnly || scores[i] > 0))
        .sort((a, b) => scores[b] - scores[a] || records[a].id.localeCompare(records[b].id));
}

/** Research inspection of the same single-path runtime, without changing API limits. */
export async function inspectExperienceSinglePath(experience: string, engine: 'e5' | 'bm25') {
    const { records, manifest } = await loadExperienceCorpus();
    let scores: Float64Array;
    if (engine === 'e5') {
        const [encoded, vectors] = await Promise.all([encodeExperienceBatch([experience]), loadVectors(manifest)]);
        scores = cosineScores(encoded.vectors[0], vectors, records.length);
    } else scores = lexicalScores(experience, records);
    return {
        corpusVersion: `${manifest.version}:${manifest.corpusSha256}`, modelVersion: EXPERIENCE_MODEL_VERSION,
        ranking: sorted(scores, records, engine === 'bm25').slice(0, CANDIDATE_BUDGET).map((doc, i) => ({
            documentIndex: doc, rank: i + 1, score: scores[doc], ...records[doc],
        })),
    };
}

/** Budgeted round-robin pooling followed by reciprocal-rank fusion. */
export function fuseExperienceRanks(rankings: number[][], budget: number): { order: number[]; scores: Map<number, number>; routes: Map<number, number[]> } {
    const pool = new Set<number>();
    for (let rank = 0; pool.size < budget && rank < Math.max(0, ...rankings.map(r => r.length)); rank++) {
        for (const ranking of rankings) { if (ranking[rank] !== undefined && pool.size < budget) pool.add(ranking[rank]); }
    }
    const scores = new Map<number, number>(); const routes = new Map<number, number[]>();
    rankings.forEach((ranking, route) => {
        ranking.forEach((doc, rank) => {
            if (!pool.has(doc)) return;
            scores.set(doc, (scores.get(doc) || 0) + 1 / (RRF_K + rank + 1));
            const matches = routes.get(doc) || []; matches.push(route); routes.set(doc, matches);
        });
    });
    const order = [...pool].sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0) || a - b);
    return { order, scores, routes };
}

export async function searchExperiences(request: ExperienceSearchRequest): Promise<ExperienceSearchResponse> {
    const started = Date.now();
    const experience = request.experience.trim(); const focus = request.focus?.trim() || '';
    const engine = request.engine || 'e5'; const variant = request.variant || 'aspect-balanced';
    const limit = request.limit ?? 5;
    if (!experience || experience.length > 2000 || focus.length > 300 || !Number.isInteger(limit) || limit < 1 || limit > 10 ||
        !['e5', 'bm25'].includes(engine) || !['baseline', 'aspect-balanced'].includes(variant)) throw new Error('Invalid search request');
    const { records, manifest } = await loadExperienceCorpus();
    const paths = experiencePaths(experience, focus, variant);
    let matrices: Float64Array[];
    let tokenCounts: number[] | undefined;
    if (engine === 'e5') {
        const [encoded, vectors] = await Promise.all([encodeExperienceBatch(paths), loadVectors(manifest)]);
        tokenCounts = encoded.tokenCounts;
        matrices = encoded.vectors.map(q => cosineScores(q, vectors, records.length));
    } else matrices = paths.map(p => lexicalScores(p, records));
    const rankings = matrices.map(s => sorted(s, records, engine === 'bm25').slice(0, CANDIDATE_BUDGET));
    const fusion = fuseExperienceRanks(rankings, CANDIDATE_BUDGET);
    // One-route variant is exactly the baseline, including scores and tie order.
    const order = paths.length === 1 ? rankings[0] : fusion.order;
    return {
        searchId: randomUUID(), query: { experience, focus }, variant,
        model: { id: engine === 'e5' ? MODEL : 'intl-ja-bm25', version: EXPERIENCE_MODEL_VERSION,
            corpusVersion: `${manifest.version}:${manifest.corpusSha256}`, recordCount: records.length,
            activeAspectCount: paths.length, engine, candidateBudget: CANDIDATE_BUDGET,
            ...(engine === 'e5' ? { queryEncoderRevision: QUERY_MODEL_REVISION, documentEncoderRevision: manifest.modelRevision,
                queryTokenCounts: tokenCounts, queryTruncated: tokenCounts?.map(n => n > 512), maxQueryTokens: 512,
                approximation: 'q8 ONNX queries encoded individually / float32 original E5 documents; 512 tokens; mean pooling; L2 normalization' } : {}),
        },
        candidates: order.slice(0, limit).map(doc => ({
            ...records[doc], source: manifest.source, sourceUrl: null,
            evidence: { field: 'summary', start: 0, end: [...records[doc].summary].length, text: records[doc].summary },
            score: paths.length === 1 ? matrices[0][doc] : fusion.scores.get(doc) || 0,
            matchingAspects: (fusion.routes.get(doc) || [0]).map(i => paths[i]),
        })), durationMs: Date.now() - started,
    };
}
