'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useApp, YokaiConcept } from '@/lib/context';
import { searchFolklore, generateConcepts } from '@/lib/api-client';
import ProgressDots from './ProgressDots';

const SCATTER_POSITIONS = [
    { left: '5%', top: '0px' },
    { right: '0%', top: '100px' },
    { left: '12%', top: '220px' },
    { right: '8%', top: '350px' },
    { left: '2%', top: '470px' },
];

const RETRY_MAX = 2;
const RETRY_BASE_MS = 900;
const ANIM_INTRO_TO_FOLKLORE_MS = 700;
const ANIM_FOLKLORE_TO_CONCEPT_MS = 600;
const ANIM_FOLKLORE_STEP_MS = 180;
const ANIM_CONCEPT_STEP_MS = 120;

export default function Phase2() {
    const { state, goToPhase, setFolkloreResults, setConcepts, selectConcept } = useApp();
    const [stage, setStage] = useState<'loading' | 'intro' | 'folklore' | 'concepts' | 'error'>('loading');
    const [showLine1, setShowLine1] = useState(false);
    const [showLine2, setShowLine2] = useState(false);
    const [visibleFolklore, setVisibleFolklore] = useState(0);
    const [showConceptIntro, setShowConceptIntro] = useState(false);
    const [visibleConcepts, setVisibleConcepts] = useState(0);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [retryMsg, setRetryMsg] = useState('');
    const [isFetching, setIsFetching] = useState(false);
    const [isGeneratingConcepts, setIsGeneratingConcepts] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const [folkloreData, setFolkloreData] = useState<Array<{
        id: string;
        kaiiName: string;
        content: string;
        location: string;
        similarity: number;
    }>>([]);
    const [conceptData, setConceptData] = useState<YokaiConcept[]>([]);

    const inFlightRef = useRef(false);
    const mountedRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const requestSeqRef = useRef(0);

    const abortCurrentRequest = useCallback((reason: string) => {
        const controller = abortRef.current;
        if (!controller || controller.signal.aborted) {
            return;
        }

        try {
            controller.abort(new DOMException(reason, 'AbortError'));
        } catch {
            controller.abort(reason);
        }
    }, []);

    const fieldHeight = useMemo(() => {
        if (visibleFolklore === 0) return 0;
        const lastPos = SCATTER_POSITIONS[Math.min(visibleFolklore - 1, SCATTER_POSITIONS.length - 1)];
        const topVal = parseInt(lastPos.top, 10) || 0;
        return topVal + 180;
    }, [visibleFolklore]);

    const isRetryableError = useCallback((message: string) => {
        const normalized = message.toLowerCase();
        const retryHints = [
            '429',
            'resource exhausted',
            'rate limit',
            'quota',
            'too many requests',
            'retry',
            'failed to fetch',
            'network',
        ];
        return retryHints.some((hint) => normalized.includes(hint));
    }, []);

    const resetAnimationState = useCallback(() => {
        setShowLine1(false);
        setShowLine2(false);
        setVisibleFolklore(0);
        setShowConceptIntro(false);
        setVisibleConcepts(0);
        setSelectedIdx(null);
    }, []);

    const fetchData = useCallback(async (retryCount = 0) => {
        if (!state.selectedHandle) {
            setErrorMsg('選択された手がかりがありません。');
            setStage('error');
            return;
        }
        if (inFlightRef.current) return;

        const requestId = ++requestSeqRef.current;
        const controller = new AbortController();
        abortCurrentRequest('phase2 request superseded');
        abortRef.current = controller;

        inFlightRef.current = true;
        setIsFetching(true);
        resetAnimationState();
        setErrorMsg('');
        setRetryMsg('');
        setIsGeneratingConcepts(false);
        setStage('loading');

        if (retryCount > 0) {
            setRetryMsg(`バックオフ付き再試行 (${retryCount}/${RETRY_MAX})`);
        }

        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }

        try {
            const searchResult = await searchFolklore(
                { id: state.selectedHandle.id, text: state.selectedHandle.text },
                state.answers,
                controller.signal
            );
            const folklore = searchResult.folklore;
            const localFallbackConcepts = folklore.slice(0, 3).map((entry) => ({
                source: 'db' as const,
                name: entry.kaiiName,
                reading: '',
                description: entry.content,
                label: 'fallback',
                folkloreRef: entry.id,
            }));

            setFolkloreData(folklore);
            setFolkloreResults(folklore);
            setRetryMsg('概念候補を生成しています...');
            setIsGeneratingConcepts(true);
            setStage('intro');

            try {
                const conceptResult = await generateConcepts(
                    folklore,
                    state.answers,
                    { id: state.selectedHandle.id, text: state.selectedHandle.text },
                    controller.signal
                );
                setConceptData(conceptResult.concepts as YokaiConcept[]);
                setConcepts(conceptResult.concepts as YokaiConcept[]);
            } catch (conceptErr) {
                console.warn('Phase 2 concept error, fallback applied:', conceptErr);
                const conceptFallback = [
                    ...localFallbackConcepts,
                    {
                        source: 'llm' as const,
                        name: '補助候補',
                        reading: '',
                        description: '生成が不安定なため、ローカル候補を補助表示しています。',
                        label: 'local-fallback',
                    },
                ];
                setConceptData(conceptFallback as YokaiConcept[]);
                setConcepts(conceptFallback as YokaiConcept[]);
                setRetryMsg('概念APIが不安定なため、補助候補で続行します。');
            }

            setIsGeneratingConcepts(false);
            setRetryMsg('');

            if (!mountedRef.current || requestId !== requestSeqRef.current || controller.signal.aborted) {
                return;
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                setIsGeneratingConcepts(false);
                return;
            }

            if (!mountedRef.current || requestId !== requestSeqRef.current || controller.signal.aborted) {
                return;
            }

            const message = err instanceof Error ? err.message : 'Request failed';
            setIsGeneratingConcepts(false);
            console.error('Phase 2 API error:', message);

            if (isRetryableError(message) && retryCount < RETRY_MAX) {
                const delayMs = RETRY_BASE_MS * 2 ** retryCount;
                const isNetworkIssue =
                    message.toLowerCase().includes('failed to fetch') ||
                    message.toLowerCase().includes('network');
                setRetryMsg(
                    isNetworkIssue
                        ? `通信が不安定です。${(delayMs / 1000).toFixed(1)}秒後に再試行します...`
                        : `混み合っています。${(delayMs / 1000).toFixed(1)}秒後に再試行します...`
                );

                retryTimerRef.current = setTimeout(() => {
                    if (!mountedRef.current || inFlightRef.current) return;
                    void fetchData(retryCount + 1);
                }, delayMs);
                return;
            }

            setErrorMsg(message);
            setRetryMsg('');
            setStage('error');
        } finally {
            if (requestId === requestSeqRef.current) {
                inFlightRef.current = false;
                setIsFetching(false);
                setIsGeneratingConcepts(false);
            }
        }
    }, [
        state.selectedHandle,
        state.answers,
        setConcepts,
        setFolkloreResults,
        abortCurrentRequest,
        isRetryableError,
        resetAnimationState,
    ]);

    useEffect(() => {
        mountedRef.current = true;
        void fetchData();

        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);

        return () => {
            mountedRef.current = false;
            inFlightRef.current = false;
            window.removeEventListener('resize', checkMobile);
            abortCurrentRequest('phase2 unmount');
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
        };
    }, [fetchData, abortCurrentRequest]);

    useEffect(() => {
        if (stage !== 'intro') return;
        const t1 = setTimeout(() => setShowLine1(true), 600);
        const t2 = setTimeout(() => setShowLine2(true), 1800);
        const t3 = setTimeout(() => setStage('folklore'), ANIM_INTRO_TO_FOLKLORE_MS);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [stage]);

    useEffect(() => {
        if (stage !== 'folklore') return;
        if (isGeneratingConcepts) return;

        if (visibleFolklore < folkloreData.length) {
            const t = setTimeout(() => setVisibleFolklore((v: number) => v + 1), ANIM_FOLKLORE_STEP_MS);
            return () => clearTimeout(t);
        }

        const t = setTimeout(() => {
            setStage('concepts');
            setTimeout(() => setShowConceptIntro(true), 200);
        }, ANIM_FOLKLORE_TO_CONCEPT_MS);
        return () => clearTimeout(t);
    }, [stage, visibleFolklore, folkloreData.length, isGeneratingConcepts]);

    useEffect(() => {
        if (stage !== 'concepts' || !showConceptIntro) return;
        if (visibleConcepts < conceptData.length) {
            const t = setTimeout(() => setVisibleConcepts((v: number) => v + 1), ANIM_CONCEPT_STEP_MS);
            return () => clearTimeout(t);
        }
    }, [stage, showConceptIntro, visibleConcepts, conceptData.length]);

    const handleSelect = (idx: number) => {
        setSelectedIdx(idx);
        selectConcept(conceptData[idx]);
        setTimeout(() => goToPhase(3), 1000);
    };

    const handleRetry = useCallback(() => {
        void fetchData(0);
    }, [fetchData]);

    if (stage === 'loading') {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ animation: 'breathe 3s ease-in-out infinite' }}>
                    古い記録を探しています...
                </p>
                {retryMsg && (
                    <p style={{ fontSize: 12, color: 'var(--text-ghost)', marginTop: 12 }}>
                        {retryMsg}
                    </p>
                )}
            </div>
        );
    }

    if (stage === 'error') {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ marginBottom: 16 }}>
                    記録にたどり着けませんでした。
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-ghost)', marginBottom: 24 }}>
                    {errorMsg}
                </p>
                {retryMsg && (
                    <p style={{ fontSize: 12, color: 'var(--text-ghost)', marginBottom: 16 }}>
                        {retryMsg}
                    </p>
                )}
                <button
                    className="button button-primary"
                    onClick={handleRetry}
                    disabled={isFetching}
                >
                    {isFetching ? '再試行中...' : '再試行'}
                </button>
            </div>
        );
    }

    return (
        <div className="phase-scrollable">
            {showLine1 && (
                <p className="voice float-up" style={{ marginBottom: 12 }}>
                    あなたの体験を、古い記録のなかに探しました。
                </p>
            )}
            {showLine2 && (
                <p className="voice float-up" style={{ marginBottom: 48, animationDelay: '0.2s' }}>
                    似た語りが、各地に残っていました。
                </p>
            )}

            {isGeneratingConcepts && stage !== 'concepts' && (
                <p className="label" style={{ marginBottom: 24 }}>
                    概念候補をまとめています...
                </p>
            )}

            {(stage === 'folklore' || stage === 'concepts') && visibleFolklore > 0 && (
                <>
                    <p className="label fade-in" style={{ marginBottom: 16 }}>
                        関連する伝承
                    </p>
                    <div className="folklore-field" style={{ minHeight: isMobile ? 'auto' : fieldHeight }}>
                        {folkloreData.slice(0, visibleFolklore).map((f, i) => {
                            const pos = isMobile ? { position: 'relative' as const, marginBottom: '24px' } : SCATTER_POSITIONS[i % SCATTER_POSITIONS.length];
                            return (
                                <div
                                    key={f.id}
                                    className="folklore-entry volatile"
                                    style={{
                                        ...pos,
                                        animationDelay: `${i * 0.3}s`,
                                        transform: isMobile ? 'none' : undefined,
                                    }}
                                >
                                    <p className="folklore-name">{f.kaiiName}</p>
                                    <p className="folklore-content">{f.content}</p>
                                    <p className="folklore-meta">{f.location}</p>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {stage === 'concepts' && (
                <>
                    <div className="jp-separator float-up" />

                    {showConceptIntro && (
                        <>
                            <p className="voice float-up" style={{ marginBottom: 8 }}>
                                昔の人は、似た気配に名を与えてきました。
                            </p>
                            <p className="label float-up" style={{ animationDelay: '0.4s', marginTop: 32, marginBottom: 8 }}>
                                あなたの体験に近いもの
                            </p>
                        </>
                    )}

                    <div>
                        {conceptData.slice(0, visibleConcepts).map((c, i) => (
                            <button
                                key={i}
                                className={`concept-card float-up ${selectedIdx !== null && selectedIdx !== i ? 'dimmed' : ''} ${selectedIdx === i ? 'selected' : ''}`}
                                style={{ animationDelay: `${i * 0.15}s` }}
                                onClick={() => selectedIdx === null && handleSelect(i)}
                            >
                                <div className="yokai-name">{c.name}</div>
                                <div className="yokai-reading">{c.reading}</div>
                                <div className="yokai-desc">{c.description}</div>
                                <span className="concept-label">{c.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}

            <div style={{ height: 60 }} />
            <ProgressDots current={3} />
        </div>
    );
}
