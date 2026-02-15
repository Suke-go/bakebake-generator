'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/lib/context';
import { ArtStyle } from '@/lib/context';
import ProgressDots from './ProgressDots';

/**
 * Phase 3 — 画風選択 → 姿の描写
 *
 * 妖怪画の歴史に基づく選択肢:
 *
 * 1. 石燕風 — 鳥山石燕 (1776)。一体ごとの図鑑的描写。墨の線描。
 * 2. 百鬼夜行絵巻 — 平安〜室町。巻物に妖怪の行列。流れるような構図。
 * 3. 錦絵風 — 歌川国芳、月岡芳年。鮮やかな版画。劇的な構図。
 * 4. 漫画風 — 水木しげる。ペンと墨。親しみのある描写。
 * 5. 現代 — デジタル。光の粒子とノイズ。
 */
const ART_STYLES: { id: ArtStyle; name: string; desc: string }[] = [
    {
        id: 'sumi',
        name: '石燕風',
        desc: '墨の線描。図鑑のように一体だけを描く。',
    },
    {
        id: 'emaki',
        name: '百鬼夜行絵巻',
        desc: '巻物に描かれた妖怪の行列。平安の絵巻物のように。',
    },
    {
        id: 'ukiyoe',
        name: '錦絵風',
        desc: '歌川国芳や月岡芳年のような、鮮やかな版画。',
    },
    {
        id: 'manga',
        name: '漫画風',
        desc: 'ペンと墨。水木しげるのような、親しみのある描写。',
    },
    {
        id: 'dennou',
        name: '現代',
        desc: 'デジタルの筆。光の粒子とノイズ。',
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

    // Style step timing
    useEffect(() => {
        if (step === 'style') {
            const t1 = setTimeout(() => setShowStyleIntro(true), 400);
            const t2 = setTimeout(() => setShowStyleOptions(true), 1800);
            return () => { clearTimeout(t1); clearTimeout(t2); };
        }
    }, [step]);

    // Describe step timing
    useEffect(() => {
        if (step === 'describe') {
            const t = setTimeout(() => setShowDescribe(true), 300);
            return () => clearTimeout(t);
        }
    }, [step]);

    const handleStyleSelect = (style: ArtStyle) => {
        setSelectedStyle(style);
        setArtStyle(style);
        setTimeout(() => setStep('describe'), 800);
    };

    const handleSubmit = () => {
        if (input.trim()) {
            setVisualInput(input.trim());
        }
        setShowDescribe(false);
        setTimeout(() => goToPhase(3.5), 400);
    };

    // === Step: Art Style ===
    if (step === 'style') {
        return (
            <div className="phase-scrollable phase-enter">
                {showStyleIntro && (
                    <>
                        <p className="voice float-up" style={{ marginBottom: 12 }}>
                            {state.selectedConcept?.name || ''}
                            ——
                            {state.selectedConcept?.reading || ''}
                        </p>
                        <p className="voice float-up" style={{
                            marginBottom: 40,
                            animationDelay: '0.3s',
                        }}>
                            どんな画風で描きましょうか。
                        </p>
                    </>
                )}

                {showStyleOptions && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {ART_STYLES.map((s, i) => (
                            <button
                                key={s.id}
                                className={`handle-option fade-in ${selectedStyle && selectedStyle !== s.id ? 'dimmed' : ''
                                    } ${selectedStyle === s.id ? 'selected' : ''}`}
                                style={{ animationDelay: `${i * 0.15}s` }}
                                onClick={() => !selectedStyle && handleStyleSelect(s.id)}
                            >
                                <span style={{
                                    fontSize: 18,
                                    color: 'var(--text-bright)',
                                    letterSpacing: '0.12em',
                                }}>
                                    {s.name}
                                </span>
                                <br />
                                <span style={{
                                    fontSize: 13,
                                    color: 'var(--text-dim)',
                                    letterSpacing: '0.04em',
                                    marginTop: 4,
                                    display: 'inline-block',
                                }}>
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

    // === Step: Describe Appearance ===
    return (
        <div
            className="phase"
            style={{
                opacity: showDescribe ? 1 : 0,
                transition: 'opacity 0.6s ease',
            }}
        >
            <p className="question-text" style={{ marginBottom: 20 }}>
                あなたが見たそれは、どんな姿をしていましたか？
            </p>

            <p style={{
                fontSize: 13,
                color: 'var(--text-dim)',
                marginBottom: 16,
                fontFamily: 'var(--font-main)',
            }}>
                色、形、大きさ、印象…なんでも
            </p>

            <textarea
                className="text-input"
                style={{ minHeight: 100, resize: 'none' }}
                placeholder="たとえば：黒い影のような、人の形をしたもの…"
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
                    style={{ opacity: input.trim() ? 1 : 0.3 }}
                >
                    つづける
                </button>
            </div>

            <ProgressDots current={4} />
        </div>
    );
}
