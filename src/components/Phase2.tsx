'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useApp, YokaiConcept } from '@/lib/context';
import { searchFolklore, generateConcepts } from '@/lib/api-client';
import ProgressDots from './ProgressDots';
import SpookyText from './SpookyText';
// Use flex properties to create the organic scattered effect from 29f9879 without absolute vertical overlap
const SCATTER_POSITIONS = [
    { alignSelf: 'flex-start', marginLeft: '5%' },
    { alignSelf: 'flex-end', marginRight: '0%' },
    { alignSelf: 'flex-start', marginLeft: '12%' },
];

const RETRY_MAX = 2;
const RETRY_BASE_MS = 900;
const ANIM_INTRO_TO_FOLKLORE_MS = 2400;
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
    const [customName, setCustomName] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);

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
            setRetryMsg(`少し間をおいて再試行します (${retryCount}/${RETRY_MAX})`);
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
            const localFallbackConcepts = folklore.slice(0, 3).map((entry: any) => ({
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
                        name: '名もなき気配',
                        reading: '',
                        description: 'まだ名前のない、あなただけが感じた存在。',
                        label: 'local-fallback',
                    },
                ];
                setConceptData(conceptFallback as YokaiConcept[]);
                setConcepts(conceptFallback as YokaiConcept[]);
                setRetryMsg('');
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
        if (selectedIdx !== null) return;
        setSelectedIdx(idx);
        setShowCustomInput(false);
        selectConcept(conceptData[idx]);
        setTimeout(() => goToPhase(3), 1000);
    };

    const handleCustomName = () => {
        if (!customName.trim() || selectedIdx !== null) return;
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        const custom: YokaiConcept = {
            source: 'llm',
            name: customName.trim(),
            reading: '',
            description: 'あなた自身が名付けた妖怪',
            label: '自分で名付けた',
        };
        setSelectedIdx(-1);
        setShowCustomInput(false);
        selectConcept(custom);
        setTimeout(() => goToPhase(3), 1000);
    };

    const NAMING_TYPE_LABELS: Record<string, string> = {
        place_action: '場所・行動型',
        appearance_sound: '外見・音型',
        vernacular: '土着・方言型',
        fallback: '補助候補',
    };

    const handleRetry = useCallback(() => {
        void fetchData(0);
    }, [fetchData]);

    if (stage === 'loading') {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ animation: 'breathe 3s ease-in-out infinite' }}>
                    伝承の記録を検索しています...
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 16, letterSpacing: '0.1em' }}>
                    数秒お待ちください
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
                    記録の検索に失敗しました。
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
                    体験内容をもとに、伝承データベースを検索しました。
                </p>
            )}
            {showLine2 && (
                <p className="voice float-up" style={{ marginBottom: 48, animationDelay: '0.2s' }}>
                    類似する伝承記録を抽出しました。
                </p>
            )}

            {isGeneratingConcepts && stage !== 'concepts' && (
                <p className="label" style={{ marginBottom: 24 }}>
                    名前の候補を生成しています...
                </p>
            )}

            {(stage === 'folklore' || stage === 'concepts') && visibleFolklore > 0 && (
                <>
                    <p className="label fade-in" style={{ marginBottom: 16 }}>
                        関連する伝承
                    </p>
                    <div className="folklore-field" style={{ display: 'flex', flexDirection: 'column' }}>
                        {folkloreData.slice(0, visibleFolklore).map((f, i) => {
                            const desktopPos = SCATTER_POSITIONS[i % SCATTER_POSITIONS.length];
                            const mobilePos = { alignSelf: 'stretch', marginTop: i === 0 ? '0' : '32px' };
                            const pos = isMobile ? mobilePos : desktopPos;

                            return (
                                <div
                                    key={f.id}
                                    className="folklore-entry volatile"
                                    style={{
                                        position: 'relative',
                                        ...pos,
                                        animationDelay: `${i * 0.3}s`,
                                        transform: 'none',
                                    }}
                                >
                                    <SpookyText
                                        text={f.kaiiName}
                                        as="p"
                                        className="folklore-name"
                                        mojibake
                                        mojibakeOptions={{ resolveSpeed: 50, flickerRate: 60, delay: 0, intensity: 0.6 }}
                                        charSizeVariation={0.15}
                                    />
                                    <SpookyText
                                        text={f.content}
                                        as="p"
                                        className="folklore-content"
                                        mojibake
                                        mojibakeOptions={{ resolveSpeed: 15, flickerRate: 40, delay: 100, intensity: 0.4 }}
                                        charSizeVariation={0.08}
                                    />
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
                                名前の候補を生成しました。
                            </p>
                            <p className="label float-up" style={{ animationDelay: '0.4s', marginTop: 32, marginBottom: 8 }}>
                                名前の候補
                            </p>
                        </>
                    )}

                    <div>
                        {conceptData.filter(c => c.source === 'llm').slice(0, visibleConcepts).map((c, i) => {
                            const globalIdx = conceptData.indexOf(c);
                            const namingType = (c as any).namingType as string | undefined;
                            const typeLabel = namingType ? NAMING_TYPE_LABELS[namingType] || '' : '';
                            return (
                                <button
                                    key={globalIdx}
                                    className={`concept-card float-up ${selectedIdx !== null && selectedIdx !== globalIdx ? 'dimmed' : ''} ${selectedIdx === globalIdx ? 'selected' : ''}`}
                                    style={{ animationDelay: `${i * 0.15}s` }}
                                    onClick={() => selectedIdx === null && handleSelect(globalIdx)}
                                >
                                    {typeLabel && <span className="concept-label" style={{ marginBottom: 4 }}>{typeLabel}</span>}
                                    <SpookyText
                                        text={c.name}
                                        as="div"
                                        className="yokai-name"
                                        mojibake
                                        mojibakeOptions={{ resolveSpeed: 60, flickerRate: 40, delay: 100, intensity: 0.8 }}
                                        charAnimation
                                        charDelayStep={50}
                                    />
                                    <div className="yokai-reading">{c.reading}</div>
                                    <div className="yokai-desc">{c.description}</div>
                                </button>
                            );
                        })}
                    </div>

                    {visibleConcepts >= conceptData.filter(c => c.source === 'llm').length && selectedIdx === null && (
                        <div className="float-up" style={{ animationDelay: '0.5s', marginTop: 16 }}>
                            {!showCustomInput ? (
                                <button
                                    className="concept-card"
                                    style={{ textAlign: 'center', opacity: 0.8 }}
                                    onClick={() => setShowCustomInput(true)}
                                >
                                    <div className="yokai-desc">自分で名付ける</div>
                                </button>
                            ) : (
                                <div className="concept-card" style={{ padding: '16px' }}>
                                    <p className="label" style={{ marginBottom: 8 }}>あなたが感じた名前を入力してください</p>
                                    <input
                                        type="text"
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                        placeholder="例: 影渡り"
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            fontSize: '1.1rem',
                                            background: 'transparent',
                                            border: '1px solid var(--text-ghost)',
                                            borderRadius: 4,
                                            color: 'var(--text-main)',
                                            marginBottom: 8,
                                        }}
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleCustomName()}
                                    />
                                    <button
                                        className="button button-primary"
                                        onClick={handleCustomName}
                                        disabled={!customName.trim()}
                                        style={{ width: '100%' }}
                                    >
                                        この名前で記録する
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            <div style={{ height: 60 }} />
            <ProgressDots current={3} />
        </div>
    );
}
