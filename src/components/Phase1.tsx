'use client';

import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/lib/context';
import { HANDLES } from '@/lib/data';
import ProgressDots from './ProgressDots';

export default function Phase1() {
    const { goToPhase, setHandle } = useApp();
    const [showIntro, setShowIntro] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showFreeInput, setShowFreeInput] = useState(false);
    const [freeText, setFreeText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const t1 = setTimeout(() => setShowIntro(true), 400);
        const t2 = setTimeout(() => setShowOptions(true), 2200);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);

    useEffect(() => {
        if (showFreeInput && inputRef.current) {
            inputRef.current.focus();
        }
    }, [showFreeInput]);

    const handleSelect = (handle: (typeof HANDLES)[0]) => {
        setSelectedId(handle.id);
        setHandle(handle);
        setTimeout(() => goToPhase(1.5), 800);
    };

    const handleFreeSubmit = () => {
        if (freeText.trim()) {
            setSelectedId('free');
            setHandle({ id: 'free', text: freeText.trim(), shortText: '自由入力' });
            setTimeout(() => goToPhase(1.5), 600);
        }
    };

    return (
        <div className="phase-scrollable phase-enter">
            {showIntro && (
                <p className="voice float-up" style={{ marginBottom: 40, textAlign: 'left' }}>
                    最近、こんなことはありませんでしたか？
                </p>
            )}

            {showOptions && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {HANDLES.map((handle, i) => (
                        <button
                            key={handle.id}
                            className={`handle-option fade-in ${selectedId && selectedId !== handle.id ? 'dimmed' : ''
                                } ${selectedId === handle.id ? 'selected' : ''}`}
                            style={{ animationDelay: `${i * 0.12}s` }}
                            onClick={() => !selectedId && handleSelect(handle)}
                        >
                            {handle.text.split('\n').map((line, j) => (
                                <span key={j}>
                                    {line}
                                    {j < handle.text.split('\n').length - 1 && <br />}
                                </span>
                            ))}
                        </button>
                    ))}

                    <button
                        className={`handle-option fade-in ${selectedId && selectedId !== 'free' ? 'dimmed' : ''
                            } ${showFreeInput ? 'selected' : ''}`}
                        style={{
                            animationDelay: `${HANDLES.length * 0.12}s`,
                            color: showFreeInput ? 'var(--text-bright)' : 'var(--text-dim)',
                        }}
                        onClick={() => {
                            if (!selectedId) setShowFreeInput(true);
                        }}
                    >
                        ちょっと違うけど、似たようなことがある…
                    </button>

                    {showFreeInput && !selectedId && (
                        <div className="fade-in" style={{ marginTop: 20, padding: '20px 0' }}>
                            <p style={{
                                fontFamily: 'var(--font-main)',
                                fontSize: 14,
                                color: 'var(--text-dim)',
                                marginBottom: 14,
                                lineHeight: 2.0,
                            }}>
                                そのときのことを、自由に書いてください。
                            </p>
                            <textarea
                                ref={inputRef}
                                className="text-input"
                                value={freeText}
                                onChange={(e) => setFreeText(e.target.value)}
                                placeholder="たとえば：夜中に目が覚めたとき、部屋の隅に何かがいる気がした…"
                                style={{ minHeight: 100, resize: 'none' }}
                            />
                            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    className="button button-primary"
                                    onClick={handleFreeSubmit}
                                    style={{ opacity: freeText.trim() ? 1 : 0.3 }}
                                    disabled={!freeText.trim()}
                                >
                                    つづける
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div style={{ height: 60 }} />
            <ProgressDots current={1} />
        </div>
    );
}
