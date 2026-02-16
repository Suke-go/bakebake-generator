'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp, YokaiConcept } from '@/lib/context';
import { searchFolklore, generateConcepts } from '@/lib/api-client';
import ProgressDots from './ProgressDots';

/**
 * Phase 2 — 伝承との共鳴
 *
 * 1. API で類似伝承を検索 (search-folklore)
 * 2. 伝承表示 → 概念候補を生成 (generate-concepts)
 * 3. 妖怪名の選択 → Phase 3 へ
 */

const SCATTER_POSITIONS = [
    { left: '5%', top: '0px' },
    { right: '0%', top: '100px' },
    { left: '12%', top: '220px' },
    { right: '8%', top: '350px' },
    { left: '2%', top: '470px' },
];

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

    // API results (local, before setting to context)
    const [folkloreData, setFolkloreData] = useState<Array<{
        id: string; kaiiName: string; content: string; location: string; similarity: number;
    }>>([]);
    const [conceptData, setConceptData] = useState<YokaiConcept[]>([]);

    const fieldHeight = useMemo(() => {
        if (visibleFolklore === 0) return 0;
        const lastPos = SCATTER_POSITIONS[Math.min(visibleFolklore - 1, SCATTER_POSITIONS.length - 1)];
        const topVal = parseInt(lastPos.top) || 0;
        return topVal + 180;
    }, [visibleFolklore]);

    // 1. Mount: 伝承検索 API 呼び出し
    const fetchData = useCallback(async () => {
        if (!state.selectedHandle) return;

        try {
            // 伝承検索
            const searchResult = await searchFolklore(
                { id: state.selectedHandle.id, text: state.selectedHandle.text },
                state.answers
            );
            const folklore = searchResult.folklore;
            setFolkloreData(folklore);
            setFolkloreResults(folklore);

            // 概念生成
            const conceptResult = await generateConcepts(
                folklore,
                state.answers,
                { id: state.selectedHandle.id, text: state.selectedHandle.text }
            );
            setConceptData(conceptResult.concepts as YokaiConcept[]);
            setConcepts(conceptResult.concepts as YokaiConcept[]);

            // 成功 → intro 表示開始
            setStage('intro');
        } catch (err) {
            console.error('Phase 2 API error:', err);
            setErrorMsg(err instanceof Error ? err.message : '検索に失敗しました');
            setStage('error');
        }
    }, [state.selectedHandle, state.answers, setFolkloreResults, setConcepts]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // 2. Intro sequence (after API success)
    useEffect(() => {
        if (stage !== 'intro') return;
        const t1 = setTimeout(() => setShowLine1(true), 600);
        const t2 = setTimeout(() => setShowLine2(true), 2500);
        const t3 = setTimeout(() => setStage('folklore'), 4000);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, [stage]);

    // 3. Folklore reveal (one by one)
    useEffect(() => {
        if (stage !== 'folklore') return;
        if (visibleFolklore < folkloreData.length) {
            const t = setTimeout(() => setVisibleFolklore((v: number) => v + 1), 2000);
            return () => clearTimeout(t);
        } else {
            const t = setTimeout(() => {
                setStage('concepts');
                setTimeout(() => setShowConceptIntro(true), 500);
            }, 2500);
            return () => clearTimeout(t);
        }
    }, [stage, visibleFolklore, folkloreData.length]);

    // 4. Concept reveal
    useEffect(() => {
        if (stage !== 'concepts' || !showConceptIntro) return;
        if (visibleConcepts < conceptData.length) {
            const t = setTimeout(() => setVisibleConcepts((v: number) => v + 1), 1200);
            return () => clearTimeout(t);
        }
    }, [stage, showConceptIntro, visibleConcepts, conceptData.length]);

    const handleSelect = (idx: number) => {
        setSelectedIdx(idx);
        selectConcept(conceptData[idx]);
        setTimeout(() => goToPhase(3), 1000);
    };

    // Loading state
    if (stage === 'loading') {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ animation: 'breathe 3s ease-in-out infinite' }}>
                    古い記録を探しています……
                </p>
            </div>
        );
    }

    // Error state
    if (stage === 'error') {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ marginBottom: 16 }}>
                    記録にたどり着けませんでした
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-ghost)', marginBottom: 24 }}>
                    {errorMsg}
                </p>
                <button className="button button-primary" onClick={() => { setStage('loading'); fetchData(); }}>
                    もう一度探す
                </button>
            </div>
        );
    }

    return (
        <div className="phase-scrollable">

            {/* Narrator */}
            {showLine1 && (
                <p className="voice float-up" style={{ marginBottom: 12 }}>
                    あなたの体験を、古い記録のなかに探しました。
                </p>
            )}
            {showLine2 && (
                <p className="voice float-up" style={{
                    marginBottom: 48,
                    animationDelay: '0.2s',
                }}>
                    似たような体験が、各地に残っていました。
                </p>
            )}

            {/* Folklore — scattered across space */}
            {(stage === 'folklore' || stage === 'concepts') && visibleFolklore > 0 && (
                <>
                    <p className="label fade-in" style={{ marginBottom: 16 }}>
                        似た伝承
                    </p>
                    <div
                        className="folklore-field"
                        style={{ minHeight: fieldHeight }}
                    >
                        {folkloreData.slice(0, visibleFolklore).map((f, i) => {
                            const pos = SCATTER_POSITIONS[i % SCATTER_POSITIONS.length];
                            return (
                                <div
                                    key={f.id}
                                    className="folklore-entry volatile"
                                    style={{
                                        ...pos,
                                        animationDelay: `${i * 0.3}s`,
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

            {/* Concepts */}
            {stage === 'concepts' && (
                <>
                    <div className="jp-separator float-up">◇</div>

                    {showConceptIntro && (
                        <>
                            <p className="voice float-up" style={{ marginBottom: 8 }}>
                                昔の人は、似たものにこんな名前をつけていました。
                            </p>
                            <p className="label float-up" style={{
                                animationDelay: '0.4s', marginTop: 32, marginBottom: 8,
                            }}>
                                あなたの体験に近いものは
                            </p>
                        </>
                    )}

                    <div>
                        {conceptData.slice(0, visibleConcepts).map((c, i) => (
                            <button
                                key={i}
                                className={`concept-card float-up ${selectedIdx !== null && selectedIdx !== i ? 'dimmed' : ''
                                    } ${selectedIdx === i ? 'selected' : ''}`}
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
