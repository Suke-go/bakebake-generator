'use client';

import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/lib/context';
import { MOCK_FOLKLORE, MOCK_CONCEPTS } from '@/lib/data';
import ProgressDots from './ProgressDots';

/**
 * Phase 2 — 伝承との共鳴
 *
 * 1. ナレーター導入（古い記録のなかに探した）
 * 2. 類似伝承が空間に散らばって現れる
 * 3. 概念（妖怪名）の選択
 */

const SCATTER_POSITIONS = [
    { left: '5%', top: '0px' },
    { right: '0%', top: '100px' },
    { left: '12%', top: '220px' },
    { right: '8%', top: '350px' },
    { left: '2%', top: '470px' },
];

export default function Phase2() {
    const { goToPhase, setFolkloreResults, setConcepts, selectConcept } = useApp();
    const [stage, setStage] = useState<'intro' | 'folklore' | 'concepts'>('intro');
    const [showLine1, setShowLine1] = useState(false);
    const [showLine2, setShowLine2] = useState(false);
    const [visibleFolklore, setVisibleFolklore] = useState(0);
    const [showConceptIntro, setShowConceptIntro] = useState(false);
    const [visibleConcepts, setVisibleConcepts] = useState(0);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

    const fieldHeight = useMemo(() => {
        if (visibleFolklore === 0) return 0;
        const lastPos = SCATTER_POSITIONS[Math.min(visibleFolklore - 1, SCATTER_POSITIONS.length - 1)];
        const topVal = parseInt(lastPos.top) || 0;
        return topVal + 180;
    }, [visibleFolklore]);

    // Intro sequence
    useEffect(() => {
        const t1 = setTimeout(() => setShowLine1(true), 600);
        const t2 = setTimeout(() => setShowLine2(true), 2500);
        const t3 = setTimeout(() => {
            setFolkloreResults(MOCK_FOLKLORE);
            setStage('folklore');
        }, 4000);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, [setFolkloreResults]);

    // Folklore reveal
    useEffect(() => {
        if (stage !== 'folklore') return;
        if (visibleFolklore < MOCK_FOLKLORE.length) {
            const t = setTimeout(() => setVisibleFolklore((v: number) => v + 1), 2000);
            return () => clearTimeout(t);
        } else {
            const t = setTimeout(() => {
                setConcepts(MOCK_CONCEPTS);
                setStage('concepts');
                setTimeout(() => setShowConceptIntro(true), 500);
            }, 2500);
            return () => clearTimeout(t);
        }
    }, [stage, visibleFolklore, setConcepts]);

    // Concept reveal
    useEffect(() => {
        if (stage !== 'concepts' || !showConceptIntro) return;
        if (visibleConcepts < MOCK_CONCEPTS.length) {
            const t = setTimeout(() => setVisibleConcepts((v: number) => v + 1), 1200);
            return () => clearTimeout(t);
        }
    }, [stage, showConceptIntro, visibleConcepts]);

    const handleSelect = (idx: number) => {
        setSelectedIdx(idx);
        selectConcept(MOCK_CONCEPTS[idx]);
        setTimeout(() => goToPhase(3), 1000);
    };

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
                        {MOCK_FOLKLORE.slice(0, visibleFolklore).map((f, i) => {
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
                        {MOCK_CONCEPTS.slice(0, visibleConcepts).map((c, i) => (
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
