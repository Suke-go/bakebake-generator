'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/context';

/**
 * Phase 0: 儀式的な入口
 * 
 * 1. 完全な暗闇（2.5秒）
 * 2. テキストがゆっくり浮かぶ
 * 3. タッチで文字が溶けて消える → 遷移
 */
export default function Phase0() {
    const { goToPhase } = useApp();
    const [stage, setStage] = useState(0);

    useEffect(() => {
        const timers = [
            setTimeout(() => setStage(1), 2500),
            setTimeout(() => setStage(2), 5500),
            setTimeout(() => setStage(3), 8000),
        ];
        return () => timers.forEach(clearTimeout);
    }, []);

    const handleTouch = useCallback(() => {
        if (stage < 3) return;
        setStage(4);
        setTimeout(() => goToPhase(1), 1200);
    }, [stage, goToPhase]);

    return (
        <div
            className="phase"
            onClick={handleTouch}
            style={{
                cursor: stage >= 3 ? 'pointer' : 'default',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
            }}
        >
            <p style={{
                fontFamily: 'var(--font-main)',
                fontSize: 20,
                letterSpacing: '0.10em',
                lineHeight: 2.4,
                color: 'var(--text-bright)',
                opacity: stage >= 1 && stage < 4 ? 1 : 0,
                transform: stage >= 1 && stage < 4 ? 'none' : 'translateY(4px)',
                transition: stage === 4
                    ? 'opacity 0.8s ease, transform 0.8s ease'
                    : 'opacity 2.0s ease, transform 2.0s ease',
            }}>
                最近、
                <br />
                なんとなく気になっていること
            </p>

            <p style={{
                fontFamily: 'var(--font-main)',
                fontSize: 20,
                letterSpacing: '0.10em',
                lineHeight: 2.4,
                color: 'var(--text-bright)',
                marginTop: 20,
                opacity: stage >= 2 && stage < 4 ? 1 : 0,
                transform: stage >= 2 && stage < 4 ? 'none' : 'translateY(4px)',
                transition: stage === 4
                    ? 'opacity 0.6s ease, transform 0.6s ease'
                    : 'opacity 1.8s ease, transform 1.8s ease',
            }}>
                ——ありませんか？
            </p>

            <p style={{
                fontFamily: 'var(--font-main)',
                fontSize: 12,
                letterSpacing: '0.15em',
                color: 'var(--text-ghost)',
                marginTop: 60,
                opacity: stage === 3 ? 1 : 0,
                transition: 'opacity 1.5s ease',
                animation: stage === 3 ? 'breathe 4s ease-in-out infinite' : 'none',
            }}>
                タッチして始める
            </p>
        </div>
    );
}
