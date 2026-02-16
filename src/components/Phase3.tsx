'use client';

import { useState, useEffect } from 'react';
import { useApp, ArtStyle } from '@/lib/context';
import ProgressDots from './ProgressDots';

const ART_STYLES: { id: ArtStyle; name: string; desc: string }[] = [
    {
        id: 'sumi',
        name: '水墨画',
        desc: '余白とにじみを活かした、静かな筆致。',
    },
    {
        id: 'emaki',
        name: '絵巻',
        desc: '流れる構図で、場面の連なりを描く。',
    },
    {
        id: 'ukiyoe',
        name: '浮世絵',
        desc: '輪郭と平面で、くっきりとした印象に。',
    },
    {
        id: 'manga',
        name: '漫画風',
        desc: '現代的な線と陰影で、感情を強める。',
    },
    {
        id: 'dennou',
        name: '電脳',
        desc: 'ノイズや光を混ぜた、異質な質感。',
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
        setSelectedStyle(style);
        setArtStyle(style);
        setTimeout(() => setStep('describe'), 420);
    };

    const handleSubmit = () => {
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
                            {' / '}
                            {state.selectedConcept?.reading || ''}
                        </p>
                        <p className="voice float-up" style={{ marginBottom: 34, animationDelay: '0.25s' }}>
                            どの画風で姿を結びますか。
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
                見えた姿を、ひとこと添えてください。
            </p>

            <p
                style={{
                    fontSize: 13,
                    color: 'var(--text-dim)',
                    marginBottom: 14,
                    fontFamily: 'var(--font-main)',
                }}
            >
                体格、距離感、光、動きなど自由に。
            </p>

            <textarea
                className="text-input"
                style={{ minHeight: 100, resize: 'none' }}
                placeholder="例: 霧の奥で、輪郭だけが揺れていた"
                value={input}
                onChange={(e) => setInput(e.target.value)}
            />

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button className="button" onClick={handleSubmit}>
                    おまかせ
                </button>
                <button
                    className="button button-primary"
                    onClick={handleSubmit}
                    style={{ opacity: input.trim() ? 1 : 0.5 }}
                >
                    つづける
                </button>
            </div>

            <ProgressDots current={4} />
        </div>
    );
}