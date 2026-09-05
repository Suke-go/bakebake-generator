'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context';
import ProgressDots from './ProgressDots';

export default function Phase1() {
    const { goToPhase, state, setLocale } = useApp();
    const [visible, setVisible] = useState(false);
    const isEnglish = state.locale === 'en';

    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), 220);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="phase-scrollable phase-enter" style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                <button
                    type="button"
                    className="button"
                    onClick={() => setLocale(isEnglish ? 'ja' : 'en')}
                    aria-label={isEnglish ? '日本語に切り替える' : 'Switch to English'}
                    style={{ minHeight: 34, padding: '7px 12px', fontSize: 12 }}
                >
                    {isEnglish ? '日本語' : 'English'}
                </button>
            </div>
            <p className="voice" style={{ marginBottom: 20, textAlign: 'left' }}>
                {isEnglish
                    ? 'Let’s give a name and a form to an experience that felt strange or hard to explain.'
                    : '日常で「なんだか変だな」「うまく説明できないな」と感じた経験を、名前と姿にしてみます。'}
            </p>
            <p style={{ fontFamily: 'var(--font-main)', fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.9, marginBottom: 32 }}>
                {isEnglish
                    ? 'It can be a one-time event or a feeling that keeps returning. It does not have to be scary.'
                    : '一度だけの出来事でも、続いている感覚でも構いません。怖い話でなくても大丈夫です。'}
            </p>
            <button className="button button-primary" type="button" onClick={() => goToPhase(1.5)}>
                {isEnglish ? 'Begin' : 'はじめる'}
            </button>
            <div style={{ height: 60 }} />
            <ProgressDots current={1} />
        </div>
    );
}
