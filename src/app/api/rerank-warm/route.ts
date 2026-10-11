import { NextResponse } from 'next/server';
import { ruriRerank } from '@/lib/ruri-client';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Wakes the Modal reranker while the participant is still reading the
 * appraisal choices. A cold start takes over a minute; started early, it is
 * usually finished by the time the participant chooses and the search runs.
 */
export async function POST() {
    const startedAt = Date.now();
    try {
        await ruriRerank('warm', [{ id: 'warm', text: 'warm' }], { timeoutMs: 110_000 });
        return NextResponse.json({ warm: true }, { headers: { 'x-rerank-warm-ms': `${Date.now() - startedAt}` } });
    } catch (error) {
        console.warn('rerank-warm: reranker did not respond:', error instanceof Error ? error.message : error);
        return NextResponse.json({ warm: false }, { status: 503 });
    }
}
