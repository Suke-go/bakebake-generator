'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/context';
import { generateEventAppraisal, searchByEventAndAppraisal } from '@/lib/api-client';
import { logResearchEvent } from '@/lib/research-log';
import ProgressDots from './ProgressDots';

const COPY = {
    ja: {
        reading: 'あなたの体験を読んでいます...',
        eventLabel: '起きたこと',
        appraisalIntro: 'あなたは、これをどう受け止めましたか？近いものを選んでください。',
        searching: '選んだ受け止め方で、伝承データベースを検索しています...',
        skip: '選ばずに進む',
        grounded: 'あなたの言葉から',
        interpretation: '解釈',
    },
    en: {
        reading: 'Reading your account...',
        eventLabel: 'What happened',
        appraisalIntro: 'How did you make sense of this at the time? Choose the one closest to how you felt.',
        searching: 'Searching the archive using what you chose...',
        skip: 'Skip this step',
        grounded: 'From your own words',
        interpretation: 'A possible reading',
    },
};

/**
 * Reads the account into an event statement and appraisal candidates, lets
 * the participant pick the appraisal closest to their own sense-making, then
 * retrieves folklore records via the paper's combined (event+appraisal)
 * pipeline. If generation is unavailable (paid API paused, or both
 * providers fail), this phase skips straight to Phase 2, which falls back
 * to its own direct search — the participant never gets stuck here.
 */
export default function Phase1Appraisal() {
    const { state, goToPhase, completeEventAppraisalSearch, backOverrideRef } = useApp();
    const isEnglish = state.locale === 'en';
    const copy = isEnglish ? COPY.en : COPY.ja;
    const [status, setStatus] = useState<'reading' | 'choosing' | 'searching' | 'skipped'>('reading');
    const [eventText, setEventText] = useState('');
    const [appraisals, setAppraisals] = useState<Array<{ id: string; text: string; sourceSpan: string; basis: 'grounded' | 'interpretation' }>>([]);
    const mountedRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    const proceedWithoutAppraisal = useCallback(() => {
        goToPhase(2);
    }, [goToPhase]);

    useEffect(() => {
        mountedRef.current = true;
        backOverrideRef.current = null;
        if (!state.selectedHandle) {
            proceedWithoutAppraisal();
            return;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        (async () => {
            try {
                const result = await generateEventAppraisal(
                    { id: state.selectedHandle!.id, text: state.selectedHandle!.text },
                    state.answers,
                    controller.signal,
                    state.locale,
                );
                if (!mountedRef.current || controller.signal.aborted) return;
                if (!result.event.text || result.appraisals.length === 0) {
                    setStatus('skipped');
                    proceedWithoutAppraisal();
                    return;
                }
                setEventText(result.event.text);
                setAppraisals(result.appraisals);
                setStatus('choosing');
            } catch (error) {
                if (!mountedRef.current || controller.signal.aborted) return;
                console.warn('Phase1Appraisal: generation failed, skipping to direct search:', error);
                setStatus('skipped');
                proceedWithoutAppraisal();
            }
        })();
        return () => {
            mountedRef.current = false;
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleChoose = useCallback(async (appraisal: { id: string; text: string; sourceSpan: string; basis: 'grounded' | 'interpretation' }) => {
        if (!state.selectedHandle || status !== 'choosing') return;
        setStatus('searching');
        const controller = new AbortController();
        abortRef.current = controller;
        void logResearchEvent(state.ticketId, {
            eventType: 'appraisal_selected',
            payload: { locale: state.locale, eventText, appraisal },
        });
        try {
            const searchResult = await searchByEventAndAppraisal(
                { id: state.selectedHandle.id, text: state.selectedHandle.text },
                state.answers,
                eventText,
                appraisal.text,
                controller.signal,
                5,
            );
            if (!mountedRef.current) return;
            const folklore = searchResult.ranked.map((record) => ({
                id: record.id,
                kaiiName: record.name,
                content: record.summary,
                location: record.prefecture,
                similarity: 1 / record.rank,
                source: record.route === 'both' ? '日文研（event・appraisal両経路）' : record.route === 'event' ? '日文研（event経路）' : '日文研（appraisal経路）',
            }));
            void logResearchEvent(state.ticketId, {
                eventType: 'event_appraisal_search_completed',
                payload: { corpusVersion: searchResult.corpusVersion, branchSizes: searchResult.branchSizes, results: searchResult.ranked },
            });
            completeEventAppraisalSearch(eventText, appraisals, appraisal.id, folklore);
            goToPhase(2);
        } catch (error) {
            if (!mountedRef.current) return;
            console.warn('Phase1Appraisal: search failed, falling back to direct search:', error);
            proceedWithoutAppraisal();
        }
    }, [state.selectedHandle, state.answers, state.locale, state.ticketId, status, eventText, appraisals, completeEventAppraisalSearch, goToPhase, proceedWithoutAppraisal]);

    if (status === 'reading' || status === 'skipped') {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ animation: 'breathe 3s ease-in-out infinite' }}>{copy.reading}</p>
            </div>
        );
    }

    if (status === 'searching') {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ animation: 'breathe 3s ease-in-out infinite' }}>{copy.searching}</p>
            </div>
        );
    }

    return (
        <div className="phase-scrollable" style={{ display: 'flex', flexDirection: 'column' }}>
            <p className="label" style={{ marginBottom: 8 }}>{copy.eventLabel}</p>
            <p className="voice" style={{ marginBottom: 32 }}>{eventText}</p>
            <p className="voice float-up" style={{ marginBottom: 20 }}>{copy.appraisalIntro}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {appraisals.map((appraisal) => (
                    <button
                        key={appraisal.id}
                        type="button"
                        className="concept-card"
                        onClick={() => handleChoose(appraisal)}
                        style={{ textAlign: 'left' }}
                    >
                        <span className="concept-label" style={{ marginBottom: 4 }}>
                            {appraisal.basis === 'grounded' ? copy.grounded : copy.interpretation}
                        </span>
                        <div className="yokai-desc">{appraisal.text}</div>
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                <button type="button" className="button" onClick={proceedWithoutAppraisal}>{copy.skip}</button>
            </div>
            <div style={{ height: 60 }} />
            <ProgressDots current={2} />
        </div>
    );
}
