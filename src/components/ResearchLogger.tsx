'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/context';
import { logResearchEvent } from '@/lib/research-log';
import { RESEARCH_PROMPT_VERSION } from '@/lib/research-versions';

/** Emits only append-only study events. Missing consent/token is a no-op. */
export default function ResearchLogger() {
    const { state } = useApp();
    const sent = useRef(new Set<string>());

    const emitOnce = (key: string, eventType: string, payload: Record<string, unknown>) => {
        if (!state.ticketId || sent.current.has(key)) return;
        sent.current.add(key);
        void logResearchEvent(state.ticketId, { eventType, payload });
    };

    useEffect(() => {
        if (state.imageGenerationVersion < 1 || !state.selectedConcept) return;
        emitOnce(`image-request:${state.ticketId}:${state.imageGenerationVersion}`, 'image_generation_requested', {
            generationVersion: state.imageGenerationVersion,
            attemptNumber: state.imageGenerationCount,
            locale: state.locale,
            promptVersion: RESEARCH_PROMPT_VERSION,
            input: { experience: state.answers.experience ?? '', answers: state.answers },
            artStyle: state.artStyle ?? '',
            selectedConcept: {
                source: state.selectedConcept.source, name: state.selectedConcept.name,
                reading: state.selectedConcept.reading, description: state.selectedConcept.description,
                label: state.selectedConcept.label, namingType: state.selectedConcept.namingType ?? '',
                folkloreRef: state.selectedConcept.folkloreRef?.id ?? '',
            },
            visualInput: state.visualInput,
            folkloreReferences: state.folkloreResults.map(({ id, kaiiName, content, source, location, englishSummary }) => ({ id, kaiiName, content, source: source ?? '', location, englishSummary: englishSummary ?? '' })),
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.ticketId, state.imageGenerationVersion]);

    return null;
}
