'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context';
import ProgressDots from './ProgressDots';

export default function Phase1() {
    const { goToPhase } = useApp();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), 220);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="phase-scrollable phase-enter" style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease' }}>
            <p className="voice" style={{ marginBottom: 20, textAlign: 'left' }}>
                日常で「なんだか変だな」「うまく説明できないな」と感じた経験を、名前と姿にしてみます。
            </p>
            <p style={{ fontFamily: 'var(--font-main)', fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.9, marginBottom: 32 }}>
                一度だけの出来事でも、続いている感覚でも構いません。怖い話でなくても大丈夫です。
            </p>
            <button className="button button-primary" type="button" onClick={() => goToPhase(1.5)}>
                はじめる
            </button>
            <div style={{ height: 60 }} />
            <ProgressDots current={1} />
        </div>
    );
}
