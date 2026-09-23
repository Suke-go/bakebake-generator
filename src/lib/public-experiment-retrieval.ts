/**
 * Public, exploratory retrieval over the existing 33,378-record E5 summary index.
 *
 * This is deliberately versioned separately from the frozen Qwen-based T48/T49
 * prospective study. It makes no claim that a rank proves a shared experience.
 * All computation is local. The only encoder dependency is the existing offline
 * E5 encoder in experience-search.ts; no paid API or remote transport is used.
 */
import { createHash } from 'node:crypto';
import {
  encodeExperienceQueries,
  experienceTokens,
  loadExperienceCorpus,
  loadExperienceVectors,
  QUERY_MODEL_REVISION,
} from '@/lib/experience-search';
import type { ExperienceSearchManifest, RecordEntry } from '@/lib/experience-search';

export const PUBLIC_EXPERIMENT_ALGORITHM_VERSION = 'public-explore-e5-v1';

const EXPECTED_CORPUS_COUNT = 33_378;
const E5_ROUTE_BUDGET = 1_000;
const BM25_ROUTE_BUDGET = 300;
const RRF_K = 60;
const FOIL_NEIGHBORHOOD_K = 1_000;
const TOP_K = 5;
const FOIL_CHOICES = 10;
const HASH = /^[0-9a-f]{64}$/;

export interface PublicExperimentCard {
  id: string;
  name: string;
  summary: string;
  prefecture: string;
  summarySha256: string;
}

export interface PublicExperimentCorpus {
  records: readonly RecordEntry[];
  vectors: Float32Array;
  manifest: ExperienceSearchManifest;
}

export interface PublicExperimentDependencies {
  getCorpus(): Promise<PublicExperimentCorpus>;
  encode(text: string): Promise<number[]>;
  tokenize?(text: string): string[];
}

interface Posting { doc: number; tf: number }
interface PreparedCorpus extends PublicExperimentCorpus {
  dimension: number;
  ids: string[];
  summaryHashes: string[];
  summaryToPosition: Map<string, number>;
  postings: Map<string, Posting[]>;
  lengths: number[];
  averageLength: number;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function requireQuery(value: string): string {
  if (typeof value !== 'string') throw new Error('experience must be text');
  const query = value.trim();
  if (!query || query.length > 2_000) throw new Error('experience must have 1–2000 characters');
  return query;
}

function requireSummary(value: string, field: string, data: PreparedCorpus): number {
  if (typeof value !== 'string' || !value) throw new Error(`${field} must be a stored summary`);
  const position = data.summaryToPosition.get(sha256(value));
  if (position === undefined || data.records[position].summary !== value) {
    throw new Error(`${field} is absent from the stored corpus`);
  }
  return position;
}

function exclusionSet(values: readonly string[], anchors: readonly string[]): Set<string> {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !HASH.test(value))) {
    throw new Error('excludedSummaryHashes must contain SHA-256 strings');
  }
  return new Set([...values, ...anchors]);
}

function prepare(corpus: PublicExperimentCorpus, tokenize: (text: string) => string[]): PreparedCorpus {
  const { records, vectors, manifest } = corpus;
  const dimension = manifest.dimensions;
  if (!Number.isInteger(dimension) || dimension < 2 || !records.length ||
      records.length !== manifest.count || vectors.length !== records.length * dimension) {
    throw new Error('E5 index and records do not align');
  }
  const ids: string[] = [];
  const seenIds = new Set<string>();
  const summaryHashes: string[] = [];
  const summaryToPosition = new Map<string, number>();
  const postings = new Map<string, Posting[]>();
  const lengths: number[] = [];
  records.forEach((record, doc) => {
    if (!record.id || seenIds.has(record.id) || !record.summary) {
      throw new Error('E5 records need unique IDs and nonempty summaries');
    }
    seenIds.add(record.id);
    ids.push(record.id);
    const digest = sha256(record.summary);
    const earlier = summaryToPosition.get(digest);
    if (earlier !== undefined && records[earlier].summary !== record.summary) {
      throw new Error('summary SHA-256 collision');
    }
    summaryHashes.push(digest);
    if (earlier === undefined) summaryToPosition.set(digest, doc);
    const terms = tokenize(record.summary);
    lengths.push(terms.length);
    const counts = new Map<string, number>();
    for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
    for (const [term, tf] of counts) {
      const list = postings.get(term) || [];
      list.push({ doc, tf });
      postings.set(term, list);
    }
  });
  if (vectors.some(value => !Number.isFinite(value))) throw new Error('E5 index contains nonfinite values');
  const averageLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return { ...corpus, dimension, ids, summaryHashes, summaryToPosition, postings, lengths,
    averageLength: averageLength || 1 };
}

function normalize(value: readonly number[], dimension: number, label: string): number[] {
  if (value.length !== dimension || value.some(n => !Number.isFinite(n))) {
    throw new Error(`${label} is not a finite E5 vector`);
  }
  const norm = Math.hypot(...value);
  if (!(norm > 1e-10)) throw new Error(`${label} has zero norm`);
  return value.map(n => n / norm);
}

function documentVector(data: PreparedCorpus, position: number): number[] {
  const start = position * data.dimension;
  return Array.from(data.vectors.subarray(start, start + data.dimension));
}

function cosineScores(data: PreparedCorpus, vector: readonly number[]): Float64Array {
  const scores = new Float64Array(data.records.length);
  for (let doc = 0; doc < data.records.length; doc++) {
    const offset = doc * data.dimension;
    let score = 0;
    for (let d = 0; d < data.dimension; d++) score += vector[d] * data.vectors[offset + d];
    scores[doc] = score;
  }
  return scores;
}

function bm25Scores(data: PreparedCorpus, query: string, tokenize: (text: string) => string[]): Float64Array {
  const scores = new Float64Array(data.records.length);
  for (const term of tokenize(query)) {
    const rows = data.postings.get(term);
    if (!rows) continue;
    const idf = Math.log1p((data.records.length - rows.length + .5) / (rows.length + .5));
    for (const { doc, tf } of rows) {
      scores[doc] += idf * tf * 2.2 /
        (tf + 1.2 * (.25 + .75 * data.lengths[doc] / data.averageLength));
    }
  }
  return scores;
}

function descending(data: PreparedCorpus, scores: Float64Array, positiveOnly = false): number[] {
  return data.ids.map((_, index) => index)
    .filter(index => Number.isFinite(scores[index]) && (!positiveOnly || scores[index] > 0))
    .sort((a, b) => scores[b] - scores[a] || compareIds(data.ids[a], data.ids[b]));
}

function compareIds(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function ranks(order: readonly number[], count: number): Int32Array {
  const byPosition = new Int32Array(count);
  order.forEach((position, index) => { byPosition[position] = index + 1; });
  return byPosition;
}

/** BM25 contributes only when its positive-score rank is within its fixed route budget. */
export function publicExperimentRrfScore(denseRank: number, lexicalRank: number): number {
  return 1 / (RRF_K + denseRank) +
    (lexicalRank >= 1 && lexicalRank <= BM25_ROUTE_BUDGET
      ? 1 / (RRF_K + lexicalRank) : 0);
}

function card(data: PreparedCorpus, position: number): PublicExperimentCard {
  const record = data.records[position];
  return { id: record.id, name: record.name || '', summary: record.summary,
    prefecture: record.prefecture || '', summarySha256: data.summaryHashes[position] };
}

function uniqueCards(data: PreparedCorpus, ordered: readonly number[], limit: number,
    excluded: ReadonlySet<string> = new Set()): PublicExperimentCard[] {
  const seen = new Set(excluded);
  const cards: PublicExperimentCard[] = [];
  for (const position of ordered) {
    const digest = data.summaryHashes[position];
    if (seen.has(digest)) continue;
    seen.add(digest);
    cards.push(card(data, position));
    if (cards.length === limit) break;
  }
  return cards;
}

function cardUnion(...groups: readonly PublicExperimentCard[][]): PublicExperimentCard[] {
  const seen = new Set<string>();
  const output: PublicExperimentCard[] = [];
  for (const group of groups) for (const item of group) {
    if (!seen.has(item.summarySha256)) {
      seen.add(item.summarySha256);
      output.push(item);
    }
  }
  return output;
}

function provenance<T extends Record<string, unknown>>(
  data: PreparedCorpus, phase: string, query: string, extra: T,
) {
  return {
    algorithmVersion: PUBLIC_EXPERIMENT_ALGORITHM_VERSION,
    phase, querySha256: sha256(query), corpusVersion: data.manifest.version,
    corpusSha256: data.manifest.corpusSha256,
    recordsSha256: data.manifest.recordsSha256,
    vectorsSha256: data.manifest.vectorsSha256,
    documentEncoderRevision: data.manifest.modelRevision,
    queryEncoderRevision: QUERY_MODEL_REVISION,
    corpusCount: data.records.length, documentField: 'summary',
    duplicateUnit: 'exact stored summary SHA-256',
    paidApiCalls: 0, networkCalls: 0, generatedText: 0,
    researchStatus: 'public exploration; not the frozen Qwen/T49 confirmatory protocol',
    ...extra,
  };
}

let productionCorpusPromise: Promise<PublicExperimentCorpus> | undefined;
async function productionCorpus(): Promise<PublicExperimentCorpus> {
  if (!productionCorpusPromise) productionCorpusPromise = (async () => {
    const loaded = await loadExperienceCorpus();
    if (loaded.records.length !== EXPECTED_CORPUS_COUNT || loaded.manifest.dimensions !== 384) {
      throw new Error('unexpected public E5 corpus version');
    }
    return { ...loaded, vectors: await loadExperienceVectors(loaded.manifest) };
  })().catch(error => { productionCorpusPromise = undefined; throw error; });
  return productionCorpusPromise;
}

const productionDependencies: PublicExperimentDependencies = {
  getCorpus: productionCorpus,
  encode: async (text: string) => (await encodeExperienceQueries([text]))[0],
  tokenize: experienceTokens,
};

export function createPublicExperimentRetrieval(dependencies: PublicExperimentDependencies) {
  if (!dependencies || typeof dependencies.getCorpus !== 'function' || typeof dependencies.encode !== 'function') {
    throw new Error('retrieval dependencies are required');
  }
  const tokenize = dependencies.tokenize || experienceTokens;
  let preparedPromise: Promise<PreparedCorpus> | undefined;
  const corpus = () => {
    if (!preparedPromise) preparedPromise = dependencies.getCorpus()
      .then(loaded => prepare(loaded, tokenize))
      .catch(error => { preparedPromise = undefined; throw error; });
    return preparedPromise;
  };
  const encodedQuery = async (text: string, data: PreparedCorpus) =>
    normalize(await dependencies.encode(text), data.dimension, 'query');

  async function initialPublicExperiment(experience: string) {
    const query = requireQuery(experience);
    const data = await corpus();
    const queryVector = await encodedQuery(query, data);
    const denseScores = cosineScores(data, queryVector);
    const denseOrder = descending(data, denseScores);
    const lexicalScores = bm25Scores(data, query, tokenize);
    const lexicalOrder = descending(data, lexicalScores, true);
    const denseRanks = ranks(denseOrder, data.records.length);
    const lexicalRanks = ranks(lexicalOrder, data.records.length);
    const pool = new Set([
      ...denseOrder.slice(0, E5_ROUTE_BUDGET),
      ...lexicalOrder.slice(0, BM25_ROUTE_BUDGET),
    ]);
    const fusionOrder = [...pool].sort((a, b) => {
      const fused = (doc: number) => publicExperimentRrfScore(denseRanks[doc], lexicalRanks[doc]);
      return fused(b) - fused(a) || compareIds(data.ids[a], data.ids[b]);
    });
    const denseCards = uniqueCards(data, denseOrder, TOP_K);
    const fusionCards = uniqueCards(data, fusionOrder, TOP_K);
    return {
      cards: cardUnion(denseCards, fusionCards),
      rankings: {
        dense: denseCards.map(value => value.summarySha256),
        fusion: fusionCards.map(value => value.summarySha256),
      },
      provenance: provenance(data, 'initial', query, {
        routes: ['E5_dense', 'E5_BM25_RRF'],
        denseBudget: E5_ROUTE_BUDGET, positiveBm25Budget: BM25_ROUTE_BUDGET,
        rrfK: RRF_K, fusedCandidateCount: pool.size,
        queryVectorSource: 'existing local E5 query encoder',
      }),
    };
  }

  async function foilPublicExperiment(experience: string, positiveSummary: string,
      excludedSummaryHashes: string[]) {
    const query = requireQuery(experience);
    const data = await corpus();
    const positive = requireSummary(positiveSummary, 'positiveSummary', data);
    const excluded = exclusionSet(excludedSummaryHashes, [data.summaryHashes[positive]]);
    const queryVector = await encodedQuery(query, data);
    const queryRanks = ranks(descending(data, cosineScores(data, queryVector)), data.records.length);
    const positiveRanks = ranks(descending(data, cosineScores(data,
      normalize(documentVector(data, positive), data.dimension, 'positive'))), data.records.length);
    const ordered = data.ids.map((_, index) => index).sort((a, b) =>
      Math.max(queryRanks[a], positiveRanks[a]) - Math.max(queryRanks[b], positiveRanks[b]) ||
      queryRanks[a] + positiveRanks[a] - queryRanks[b] - positiveRanks[b] ||
      queryRanks[a] - queryRanks[b] || compareIds(data.ids[a], data.ids[b]));
    const cards = uniqueCards(data, ordered, FOIL_CHOICES, excluded);
    return { cards,
      provenance: provenance(data, 'foil_choices', query, {
        positiveSummarySha256: data.summaryHashes[positive], excludedSummaryCount: excluded.size,
        method: 'E5 full-corpus T48-style minimax rank intersection',
        topK: FOIL_CHOICES,
      }) };
  }

  async function finalPublicExperiment(experience: string, positiveSummary: string,
      foilSummary: string | null, excludedSummaryHashes: string[]) {
    const query = requireQuery(experience);
    const data = await corpus();
    const positive = requireSummary(positiveSummary, 'positiveSummary', data);
    const foil = foilSummary === null ? null : requireSummary(foilSummary, 'foilSummary', data);
    if (foil !== null && data.summaryHashes[foil] === data.summaryHashes[positive]) {
      throw new Error('positive and foil must be different stored summaries');
    }
    const excluded = exclusionSet(excludedSummaryHashes,
      [data.summaryHashes[positive], ...(foil === null ? [] : [data.summaryHashes[foil]])]);
    const queryVector = await encodedQuery(query, data);
    const positiveVector = normalize(documentVector(data, positive), data.dimension, 'positive');
    const queryRanks = ranks(descending(data, cosineScores(data, queryVector)), data.records.length);
    const positiveRanks = ranks(descending(data, cosineScores(data, positiveVector)), data.records.length);
    const t48Order = data.ids.map((_, index) => index).sort((a, b) =>
      Math.max(queryRanks[a], positiveRanks[a]) - Math.max(queryRanks[b], positiveRanks[b]) ||
      queryRanks[a] + positiveRanks[a] - queryRanks[b] - positiveRanks[b] ||
      queryRanks[a] - queryRanks[b] || compareIds(data.ids[a], data.ids[b]));
    const t48Cards = uniqueCards(data, t48Order, TOP_K, excluded);
    const rankings: Record<string, string[]> = {
      T48: t48Cards.map(value => value.summarySha256),
    };
    let cards: PublicExperimentCard[];
    const plusVector = normalize(queryVector.map((n, index) => n + positiveVector[index]),
      data.dimension, 'Rocchio+');
    if (foil === null) {
      const plusCards = uniqueCards(data, descending(data, cosineScores(data, plusVector)), TOP_K, excluded);
      rankings.Rocchio_plus = plusCards.map(value => value.summarySha256);
      cards = cardUnion(t48Cards, plusCards);
    } else {
      const foilVector = normalize(documentVector(data, foil), data.dimension, 'foil');
      const foilRanks = ranks(descending(data, cosineScores(data, foilVector)), data.records.length);
      const t49Order = data.ids.map((_, index) => index)
        .filter(index => Math.max(queryRanks[index], positiveRanks[index]) <= Math.min(FOIL_NEIGHBORHOOD_K, data.records.length) &&
          positiveRanks[index] < foilRanks[index])
        .sort((a, b) =>
          Math.max(queryRanks[a], positiveRanks[a]) - Math.max(queryRanks[b], positiveRanks[b]) ||
          queryRanks[a] + positiveRanks[a] - queryRanks[b] - positiveRanks[b] ||
          positiveRanks[a] - foilRanks[a] - positiveRanks[b] + foilRanks[b] ||
          compareIds(data.ids[a], data.ids[b]));
      const t49Cards = uniqueCards(data, t49Order, TOP_K, excluded);
      rankings.T49 = t49Cards.map(value => value.summarySha256);
      const minusVector = normalize(queryVector.map((n, index) =>
        n + positiveVector[index] - foilVector[index]), data.dimension, 'Rocchio+/-');
      const minusCards = uniqueCards(data, descending(data, cosineScores(data, minusVector)), TOP_K, excluded);
      rankings.Rocchio_plus_minus = minusCards.map(value => value.summarySha256);
      cards = cardUnion(t48Cards, t49Cards, minusCards);
    }
    return { cards, rankings,
      provenance: provenance(data, 'final_pool', query, {
        positiveSummarySha256: data.summaryHashes[positive],
        foilSummarySha256: foil === null ? null : data.summaryHashes[foil],
        excludedSummaryCount: excluded.size,
        methods: Object.keys(rankings), topK: TOP_K,
        t49NeighborhoodK: foil === null ? null : FOIL_NEIGHBORHOOD_K,
        unfilledSlots: Object.fromEntries(Object.entries(rankings).map(([name, values]) => [name, TOP_K - values.length])),
        resultUnit: 'unique stored summary',
      }) };
  }

  return { initialPublicExperiment, foilPublicExperiment, finalPublicExperiment };
}

const production = createPublicExperimentRetrieval(productionDependencies);
export const initialPublicExperiment = production.initialPublicExperiment;
export const foilPublicExperiment = production.foilPublicExperiment;
export const finalPublicExperiment = production.finalPublicExperiment;
