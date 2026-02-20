'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/context';

export default function Phase0() {
    const { goToPhase } = useApp();
    const [stage, setStage] = useState(0);

    useEffect(() => {
        const timers = [
            setTimeout(() => setStage(1), 1800),
            setTimeout(() => setStage(2), 4200),
            setTimeout(() => setStage(3), 6400),
        ];
        return () => timers.forEach(clearTimeout);
    }, []);

    const handleTouch = useCallback(() => {
        if (stage < 3) return;
        setStage(4);
        setTimeout(() => goToPhase(1), 900);
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
            <p
                style={{
                    fontFamily: 'var(--font-main)',
                    fontSize: 26,
                    letterSpacing: '0.12em',
                    lineHeight: 2.1,
                    color: 'var(--text-bright)',
                    opacity: stage >= 1 && stage < 4 ? 1 : 0,
                    transform: stage >= 1 && stage < 4 ? 'none' : 'translateY(4px)',
                    transition: stage === 4
                        ? 'opacity 0.6s ease, transform 0.6s ease'
                        : 'opacity 1.6s ease, transform 1.6s ease',
                }}
            >
                妖怪生成装置
            </p>

            <p
                style={{
                    fontFamily: 'var(--font-main)',
                    fontSize: 17,
                    letterSpacing: '0.08em',
                    lineHeight: 2.0,
                    color: 'var(--text-bright)',
                    marginTop: 14,
                    opacity: stage >= 2 && stage < 4 ? 1 : 0,
                    transform: stage >= 2 && stage < 4 ? 'none' : 'translateY(4px)',
                    transition: stage === 4
                        ? 'opacity 0.5s ease, transform 0.5s ease'
                        : 'opacity 1.4s ease, transform 1.4s ease',
                }}
            >
                あなたの体験から
                <br />
                新たな妖怪の記録を生成します
            </p>

            <p
                style={{
                    fontFamily: 'var(--font-main)',
                    fontSize: 12,
                    letterSpacing: '0.15em',
                    color: 'var(--text-ghost)',
                    marginTop: 56,
                    opacity: stage === 3 ? 1 : 0,
                    transition: 'opacity 1.2s ease',
                    animation: stage === 3 ? 'breathe 4s ease-in-out infinite' : 'none',
                }}
            >
                画面に触れて開始
            </p>
        </div>
    );
}