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
    const [freeText, setFreeText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    useEffect(() => {
        const t1 = setTimeout(() => setShowIntro(true), 300);
        const t2 = setTimeout(() => setShowOptions(true), 1200);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, []);




    const handleSelect = (handle: (typeof HANDLES)[0]) => {
        if (isTransitioning) return;
        setIsTransitioning(true);
        setSelectedId(handle.id);
        setHandle(handle);
        setTimeout(() => goToPhase(1.5), 700);
    };

    const handleFreeSubmit = () => {
        if (!freeText.trim() || isTransitioning) return;
        setIsTransitioning(true);
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        setSelectedId('free');
        setHandle({ id: 'free', text: freeText.trim(), shortText: '自由入力' });
        setTimeout(() => goToPhase(1.5), 700);
    };

    return (
        <div className="phase-scrollable phase-enter">
            {showIntro && (
                <p className="voice float-up" style={{ marginBottom: 28, textAlign: 'left' }}>
                    あなたの体験を入力するか、近いものを選んでください。
                </p>
            )}

            {showOptions && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <p
                        className="label"
                        style={{ marginBottom: 10 }}
                    >
                        近い体験から選択する
                    </p>

                    {HANDLES.map((handle, i) => (
                        <button
                            key={handle.id}
                            className={`handle-option fade-in ${selectedId && selectedId !== handle.id ? 'dimmed' : ''} ${selectedId === handle.id ? 'selected' : ''}`}
                            style={{ animationDelay: `${i * 0.08}s` }}
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

                    <div className="fade-in" style={{ marginTop: 24 }}>
                        <p
                            style={{
                                fontFamily: 'var(--font-main)',
                                fontSize: 13,
                                color: 'var(--text-dim)',
                                marginBottom: 10,
                                lineHeight: 1.9,
                            }}
                        >
                            自由に記述する
                        </p>
                        <textarea
                            ref={inputRef}
                            className="text-input"
                            value={freeText}
                            onChange={(e) => setFreeText(e.target.value)}
                            placeholder="例: 夜道で誰もいないのに足音だけが続いた"
                            style={{ minHeight: 96, resize: 'none' }}
                            disabled={!!selectedId}
                        />
                        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                className="button button-primary"
                                onClick={handleFreeSubmit}
                                style={{ opacity: freeText.trim() && !selectedId ? 1 : 0.4 }}
                                disabled={!freeText.trim() || !!selectedId}
                            >
                                次へ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ height: 60 }} />
            <ProgressDots current={1} />
        </div>
    );
}