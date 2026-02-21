'use client';

import { useState, useEffect } from 'react';
import { useApp, ArtStyle } from '@/lib/context';
import ProgressDots from './ProgressDots';

const ART_STYLES: { id: ArtStyle; name: string; desc: string }[] = [
    {
        id: 'sumi',
        name: '水墨画',
        desc: '余白とにじみの筆致。石燕以前の妖怪画の系譜。',
    },
    {
        id: 'emaki',
        name: '絵巻',
        desc: '百鬼夜行絵巻に連なる横長の物語様式。',
    },
    {
        id: 'ukiyoe',
        name: '浮世絵',
        desc: '鳥山石燕の拭きぼかしを継ぐ木版画様式。',
    },
    {
        id: 'manga',
        name: '漫画風',
        desc: '水木しげるの点描に始まる現代妖怪画。',
    },
    {
        id: 'dennou',
        name: '電脳',
        desc: 'ノイズと光の電子的様式。デジタルの怪異。',
    },
];

export default function Phase3() {
    const { state, goToPhase, setVisualInput, setArtStyle } = useApp();
    const [step, setStep] = useState<'style' | 'describe'>('style');
    const [selectedStyle, setSelectedStyle] = useState<ArtStyle>(null);
    const [showStyleIntro, setShowStyleIntro] = useState(false);
    const [showStyleOptions, setShowStyleOptions] = useState(false);
    const [input, setInput] = useState('');
    const [showDescribe, setShowDescribe] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);

    useEffect(() => {
        if (step === 'style') {
            const t1 = setTimeout(() => setShowStyleIntro(true), 260);
            const t2 = setTimeout(() => setShowStyleOptions(true), 900);
            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
            };
        }
        return undefined;
    }, [step]);

    useEffect(() => {
        if (step === 'describe') {
            const t = setTimeout(() => setShowDescribe(true), 240);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [step]);

    const handleStyleSelect = (style: ArtStyle) => {
        if (isTransitioning) return;
        setIsTransitioning(true);
        setSelectedStyle(style);
        setArtStyle(style);
        setTimeout(() => {
            setStep('describe');
            setIsTransitioning(false);
        }, 420);
    };

    const handleSubmit = () => {
        if (isTransitioning) return;
        setIsTransitioning(true);
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        if (input.trim()) {
            setVisualInput(input.trim());
        }
        setShowDescribe(false);
        setTimeout(() => goToPhase(3.5), 260);
    };

    if (step === 'style') {
        return (
            <div className="phase-scrollable phase-enter">
                {showStyleIntro && (
                    <>
                        <p className="voice float-up" style={{ marginBottom: 12 }}>
                            {state.selectedConcept?.name || ''}
                            {state.selectedConcept?.reading ? ` / ${state.selectedConcept.reading}` : ''}
                        </p>
                        <p className="voice float-up" style={{ marginBottom: 34, animationDelay: '0.25s' }}>
                            記録に残すための画風を選択してください。
                        </p>
                    </>
                )}

                {showStyleOptions && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {ART_STYLES.map((s, i) => (
                            <button
                                key={s.id}
                                className={`handle-option fade-in ${selectedStyle && selectedStyle !== s.id ? 'dimmed' : ''} ${selectedStyle === s.id ? 'selected' : ''}`}
                                style={{ animationDelay: `${i * 0.1}s` }}
                                onClick={() => !selectedStyle && handleStyleSelect(s.id)}
                            >
                                <span
                                    style={{
                                        fontSize: 18,
                                        color: 'var(--text-bright)',
                                        letterSpacing: '0.12em',
                                    }}
                                >
                                    {s.name}
                                </span>
                                <br />
                                <span
                                    style={{
                                        fontSize: 13,
                                        color: 'var(--text-dim)',
                                        letterSpacing: '0.04em',
                                        marginTop: 4,
                                        display: 'inline-block',
                                    }}
                                >
                                    {s.desc}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ height: 60 }} />
                <ProgressDots current={4} />
            </div>
        );
    }

    return (
        <div
            className="phase"
            style={{
                opacity: showDescribe ? 1 : 0,
                transition: 'opacity 0.5s ease',
            }}
        >
            <p className="question-text" style={{ marginBottom: 16 }}>
                外見の補足があれば入力してください。
            </p>

            <p
                style={{
                    fontSize: 13,
                    color: 'var(--text-dim)',
                    marginBottom: 14,
                    fontFamily: 'var(--font-main)',
                }}
            >
                体格、距離感、光、動きなど。
            </p>

            <textarea
                className="text-input"
                style={{ minHeight: 100, resize: 'none' }}
                placeholder="例: 霧の奥で、輪郭だけが揺れていた"
                value={input}
                onChange={(e) => setInput(e.target.value)}
            />

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                {!input.trim() ? (
                    <button className="button" onClick={handleSubmit}>
                        おまかせで記録する
                    </button>
                ) : (
                    <button
                        className="button button-primary"
                        onClick={handleSubmit}
                        style={{ opacity: 1 }}
                    >
                        決定
                    </button>
                )}
            </div>

            <ProgressDots current={4} />
        </div>
    );
}