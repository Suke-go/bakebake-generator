export type ExperienceEngine = 'e5' | 'bm25';
export type ExperienceVariant = 'baseline' | 'aspect-balanced';

export interface ExperienceSearchRequest {
    experience: string;
    focus?: string;
    limit?: number;
    variant?: ExperienceVariant;
    engine?: ExperienceEngine;
}

export interface ExperienceCandidate {
    id: string;
    name: string;
    summary: string;
    prefecture: string;
    source: string;
    sourceUrl: null;
    evidence: { field: 'summary'; start: number; end: number; text: string };
    score: number;
    matchingAspects: string[];
}

export interface ExperienceSearchResponse {
    searchId: string;
    query: { experience: string; focus: string };
    variant: ExperienceVariant;
    model: {
        id: string;
        version: string;
        corpusVersion: string;
        recordCount: number;
        activeAspectCount: number;
        engine: ExperienceEngine;
        queryEncoderRevision?: string;
        documentEncoderRevision?: string;
        approximation?: string;
        candidateBudget: number;
        queryTokenCounts?: number[];
        queryTruncated?: boolean[];
        maxQueryTokens?: number;
    };
    candidates: ExperienceCandidate[];
    durationMs: number;
}
