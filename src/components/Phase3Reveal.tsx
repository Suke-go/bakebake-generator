'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/lib/context';
import ProgressDots from './ProgressDots';

/**
 * Fog Generation Effect
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

        type Mote = {
            x: number; y: number;
            vx: number; vy: number;
            size: number;
            alpha: number;
            life: number;
        };

        const motes: Mote[] = [];

        const spawnMote = () => {
            const edge = Math.floor(Math.random() * 4);
            let x: number, y: number;
            switch (edge) {
                case 0: x = Math.random() * w; y = -20; break;
                case 1: x = w + 20; y = Math.random() * h; break;
                case 2: x = Math.random() * w; y = h + 20; break;
                default: x = -20; y = Math.random() * h; break;
            }
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

            let intensity: number;
            if (progress < 0.5) {
                intensity = progress * 2;
            } else if (progress < 0.75) {
                intensity = 1.0;
            } else {
                intensity = 1.0 - (progress - 0.75) * 2.5;
            }

            const spawnRate = progress < 0.6 ? 4 : 1;
            for (let i = 0; i < spawnRate; i++) {
                if (Math.random() < 0.5 + intensity * 0.5) {
                    spawnMote();
                }
            }

            for (let i = motes.length - 1; i >= 0; i--) {
                const m = motes[i];
                m.x += m.vx;
                m.y += m.vy;
                m.life += 0.01;
                m.vx *= 0.998;
                m.vy *= 0.998;

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

                if (m.life > 3 || m.x < -200 || m.x > w + 200 || m.y < -200 || m.y > h + 200) {
                    motes.splice(i, 1);
                }
            }

            if (progress > 0.3) {
                const presenceAlpha = Math.min((progress - 0.3) * 2, 1) * intensity * 0.15;
                const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
                g.addColorStop(0, `rgba(200, 185, 160, ${presenceAlpha})`);
                g.addColorStop(0.6, `rgba(120, 110, 95, ${presenceAlpha * 0.3})`);
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(cx - 200, cy - 200, 400, 400);
            }

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
    const { state, goToPhase, setNarrative, setGeneratedImage } = useApp();
    const [generating, setGenerating] = useState(true);
    const [fogDone, setFogDone] = useState(false);
    const [showImage, setShowImage] = useState(false);
    const [showName, setShowName] = useState(false);
    const [showNarrative, setShowNarrative] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const [imageDataUrl, setImageDataUrl] = useState('');
    const [apiDone, setApiDone] = useState(false);
    const [error, setError] = useState('');

    // Call generate-image API on mount
    useEffect(() => {
        if (!state.selectedConcept) return;

        const callApi = async () => {
            try {
                const res = await fetch('/api/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        concept: {
                            name: state.selectedConcept!.name,
                            reading: state.selectedConcept!.reading,
                            description: state.selectedConcept!.description,
                        },
                        artStyle: state.artStyle,
                        visualInput: state.visualInput,
                        answers: state.answers,
                    }),
                });

                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const data = await res.json();

                if (data.imageBase64) {
                    const dataUrl = `data:${data.imageMimeType};base64,${data.imageBase64}`;
                    setImageDataUrl(dataUrl);
                    setGeneratedImage(dataUrl);
                }
                if (data.narrative) {
                    setNarrative(data.narrative);
                }
                setApiDone(true);
            } catch (err) {
                console.error('Generate image error:', err);
                setError(err instanceof Error ? err.message : '生成に失敗しました');
                setApiDone(true);
            }
        };

        callApi();
    }, [state.selectedConcept, state.artStyle, state.visualInput, state.answers, setGeneratedImage, setNarrative]);

    // Fog animation completion
    const handleFogComplete = useCallback(() => {
        setFogDone(true);
    }, []);

    // Reveal when both fog and API are done
    useEffect(() => {
        if (fogDone && apiDone) {
            setGenerating(false);
        }
    }, [fogDone, apiDone]);

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
                <FogGenerationCanvas onComplete={handleFogComplete} />
                <div className="phase" style={{
                    justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                    position: 'relative', zIndex: 11,
                }}>
                    <p className="generation-wait">
                        姿を与えています
                    </p>
                </div>
            </>
        );
    }

    if (error) {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ marginBottom: 16 }}>
                    姿を描くことができませんでした
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-ghost)', marginBottom: 24 }}>
                    {error}
                </p>
                <button className="button button-primary" onClick={() => goToPhase(3)}>
                    やり直す
                </button>
            </div>
        );
    }

    return (
        <div className="phase-scrollable">
            <div className="reveal-container">
                {showImage && (
                    <div className="reveal-image-frame float-up">
                        {imageDataUrl ? (
                            <img
                                src={imageDataUrl}
                                alt={state.yokaiName || '妖怪'}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain',
                                    borderRadius: 2,
                                }}
                            />
                        ) : (
                            <div style={{
                                width: '100%', height: '100%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--bg-surface)',
                            }}>
                                <p style={{ color: 'var(--text-ghost)', fontSize: 12 }}>
                                    画像を生成できませんでした
                                </p>
                            </div>
                        )}
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
                        <button className="button" onClick={() => goToPhase(0)}>もう一度</button>
                        <button className="button button-primary">保存する</button>
                    </div>
                )}
            </div>

            <ProgressDots current={4} />
        </div>
    );
}
