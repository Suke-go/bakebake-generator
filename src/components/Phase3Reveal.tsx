'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/lib/context';
import ProgressDots from './ProgressDots';

/**
 * Fog Generation Effect
 * Phase 1: fog rushes in from edges, intensifies, fills the screen
 * Phase 2: a silhouette forms in the center as fog begins to clear
 * Phase 3: fog recedes revealing the void again
 *
 * Uses the same noise system as FogBackground for visual consistency
 */
function FogGenerationCanvas({ onComplete }: { onComplete: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio, 1.5);
        const resize = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();

        const w = window.innerWidth;
        const h = window.innerHeight;
        const cx = w / 2;
        const cy = h / 2;
        const startTime = performance.now();
        let active = true;

        // Fog particles — drift inward from all edges
        type Mote = {
            x: number; y: number;
            vx: number; vy: number;
            size: number;
            alpha: number;
            life: number;
        };

        const motes: Mote[] = [];

        const spawnMote = () => {
            // Spawn from random edge
            const edge = Math.floor(Math.random() * 4);
            let x: number, y: number;
            switch (edge) {
                case 0: x = Math.random() * w; y = -20; break;      // top
                case 1: x = w + 20; y = Math.random() * h; break;    // right
                case 2: x = Math.random() * w; y = h + 20; break;    // bottom
                default: x = -20; y = Math.random() * h; break;       // left
            }
            // Drift toward center with some randomness
            const angle = Math.atan2(cy - y, cx - x) + (Math.random() - 0.5) * 1.2;
            const speed = 0.4 + Math.random() * 0.8;
            motes.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 40 + Math.random() * 120,
                alpha: 0.02 + Math.random() * 0.04,
                life: 0,
            });
        };

        const render = () => {
            if (!active) return;

            const elapsed = (performance.now() - startTime) / 1000;
            const duration = 6.0;
            const progress = Math.min(elapsed / duration, 1);

            ctx.clearRect(0, 0, w, h);

            // Phase timing:
            // 0.0-0.5: fog rushes in (intensity rises)
            // 0.5-0.75: fog fully engulfs, silhouette forms
            // 0.75-1.0: fog starts to thin, presence remains

            // Overall fog intensity curve
            let intensity: number;
            if (progress < 0.5) {
                intensity = progress * 2; // 0 -> 1
            } else if (progress < 0.75) {
                intensity = 1.0;
            } else {
                intensity = 1.0 - (progress - 0.75) * 2.5; // 1 -> ~0.4
            }

            // Spawn fog motes — faster during buildup
            const spawnRate = progress < 0.6 ? 4 : 1;
            for (let i = 0; i < spawnRate; i++) {
                if (Math.random() < 0.5 + intensity * 0.5) {
                    spawnMote();
                }
            }

            // Draw fog motes as soft radial gradients
            for (let i = motes.length - 1; i >= 0; i--) {
                const m = motes[i];
                m.x += m.vx;
                m.y += m.vy;
                m.life += 0.01;
                m.vx *= 0.998;
                m.vy *= 0.998;

                // Fade based on life and overall intensity
                const fadeIn = Math.min(m.life * 3, 1);
                const a = m.alpha * fadeIn * intensity;

                if (a > 0.001) {
                    const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.size);
                    g.addColorStop(0, `rgba(180, 170, 155, ${a})`);
                    g.addColorStop(0.5, `rgba(140, 130, 115, ${a * 0.5})`);
                    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(m.x - m.size, m.y - m.size, m.size * 2, m.size * 2);
                }

                // Remove dead motes
                if (m.life > 3 || m.x < -200 || m.x > w + 200 || m.y < -200 || m.y > h + 200) {
                    motes.splice(i, 1);
                }
            }

            // Central presence — forms during peak fog
            if (progress > 0.3) {
                const presenceAlpha = Math.min((progress - 0.3) * 2, 1) * intensity * 0.15;
                const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
                g.addColorStop(0, `rgba(200, 185, 160, ${presenceAlpha})`);
                g.addColorStop(0.6, `rgba(120, 110, 95, ${presenceAlpha * 0.3})`);
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(cx - 200, cy - 200, 400, 400);
            }

            // Overall screen fog wash
            const washAlpha = intensity * 0.06;
            ctx.fillStyle = `rgba(100, 95, 85, ${washAlpha})`;
            ctx.fillRect(0, 0, w, h);

            if (progress >= 1) {
                active = false;
                setTimeout(onComplete, 600);
                return;
            }
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);

        return () => { active = false; };
    }, [onComplete]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10,
                pointerEvents: 'none',
            }}
        />
    );
}

export default function Phase3Reveal() {
    const { state, setNarrative, setGeneratedImage } = useApp();
    const [generating, setGenerating] = useState(true);
    const [showImage, setShowImage] = useState(false);
    const [showName, setShowName] = useState(false);
    const [showNarrative, setShowNarrative] = useState(false);
    const [showActions, setShowActions] = useState(false);

    const handleComplete = useCallback(() => {
        setGeneratedImage('/api/placeholder-yokai');
        setNarrative(
            '\u305d\u306e\u6c17\u914d\u306e\u4e2d\u306b\u3001\u305f\u3060\u9759\u304b\u306b\u305d\u3053\u306b\u3044\u305f\u3002\u540d\u524d\u3092\u4e0e\u3048\u3089\u308c\u308b\u306e\u3092\u3001\u5f85\u3063\u3066\u3044\u305f\u306e\u304b\u3082\u3057\u308c\u306a\u3044\u3002'
        );
        setGenerating(false);
    }, [setGeneratedImage, setNarrative]);

    useEffect(() => {
        if (!generating) {
            setTimeout(() => setShowImage(true), 400);
            setTimeout(() => setShowName(true), 1600);
            setTimeout(() => setShowNarrative(true), 2800);
            setTimeout(() => setShowActions(true), 4000);
        }
    }, [generating]);

    if (generating) {
        return (
            <>
                <FogGenerationCanvas onComplete={handleComplete} />
                <div className="phase" style={{
                    justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                    position: 'relative', zIndex: 11,
                }}>
                    <p className="generation-wait">
                        {'\u59ff\u3092\u4e0e\u3048\u3066\u3044\u307e\u3059'}
                    </p>
                </div>
            </>
        );
    }

    return (
        <div className="phase-scrollable">
            <div className="reveal-container">
                {showImage && (
                    <div className="reveal-image-frame float-up">
                        <div style={{
                            width: '100%', height: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-surface)',
                        }}>
                            <p style={{ color: 'var(--text-ghost)', fontSize: 12 }}>
                                [ ]
                            </p>
                        </div>
                    </div>
                )}

                {showName && (
                    <div className="float-up" style={{ animationDelay: '0.1s' }}>
                        <h1 className="reveal-name">{state.yokaiName}</h1>
                        <p className="reveal-reading">{state.selectedConcept?.reading}</p>
                    </div>
                )}

                {showNarrative && (
                    <p className="reveal-narrative float-up" style={{ animationDelay: '0.2s' }}>
                        {state.narrative}
                    </p>
                )}

                {showActions && (
                    <div className="float-up" style={{
                        marginTop: 32, display: 'flex', gap: 12, animationDelay: '0.2s',
                    }}>
                        <button className="button">{'\u3082\u3046\u4e00\u5ea6'}</button>
                        <button className="button button-primary">{'\u4fdd\u5b58\u3059\u308b'}</button>
                    </div>
                )}
            </div>

            <ProgressDots current={4} />
        </div>
    );
}
