'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
// Keep <img> for data URI image payloads to avoid Next Image URL validation issues.
import { useApp } from '@/lib/context';
import { generateImage } from '@/lib/api-client';
import ProgressDots from './ProgressDots';
import { supabase } from '@/lib/supabase';
import SpookyText from './SpookyText';

const compressImage = (dataUrl: string, maxSize = 512): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width;
            let h = img.height;
            if (w > h) {
                if (w > maxSize) {
                    h = Math.round((h * maxSize) / w);
                    w = maxSize;
                }
            } else {
                if (h > maxSize) {
                    w = Math.round((w * maxSize) / h);
                    h = maxSize;
                }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(dataUrl);

            ctx.filter = 'grayscale(100%)';
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
};

function buildImageRequestKey(
    concept: { name: string; reading: string; description: string },
    artStyle: string | null,
    visualInput: string,
    answers: Record<string, string>
): string {
    const sortedAnswerKeys = Object.keys(answers).sort();
    const answerSig = sortedAnswerKeys.map((key) => `${key}:${answers[key] ?? ''}`).join('|');
    return `${concept.name}|${concept.reading}|${concept.description}|${artStyle || ''}|${answerSig}|${visualInput}`;
}

const MOTE_POOL_SIZE = 200;

type Mote = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    life: number;
    active: boolean;
};

function createMotePool(): Mote[] {
    return Array.from({ length: MOTE_POOL_SIZE }, () => ({
        x: 0, y: 0, vx: 0, vy: 0, size: 0, alpha: 0, life: 0, active: false,
    }));
}

/**
 * Fog animation that loops with breathing intensity until apiDone becomes true.
 * Uses a fixed-size particle pool (swap-remove) to avoid O(n) array splicing.
 */
function FogGenerationCanvas({ apiDoneRef }: { apiDoneRef: React.RefObject<boolean> }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio, 1.5);
        const offscreen = document.createElement('canvas');
        offscreen.width = 240;
        offscreen.height = 240;
        const octx = offscreen.getContext('2d');
        if (octx) {
            const grad = octx.createRadialGradient(120, 120, 0, 120, 120, 120);
            grad.addColorStop(0, 'rgba(180, 170, 155, 1)');
            grad.addColorStop(0.5, 'rgba(140, 130, 115, 0.5)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            octx.fillStyle = grad;
            octx.fillRect(0, 0, 240, 240);
        }

        const resize = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        const startTime = performance.now();
        let active = true;
        let fadeOutStart = 0;

        const pool = createMotePool();
        let activeCount = 0;

        const spawnMote = () => {
            if (activeCount >= MOTE_POOL_SIZE) return;
            // Find first inactive slot
            let slot: Mote | null = null;
            for (let i = activeCount; i < MOTE_POOL_SIZE; i++) {
                if (!pool[i].active) { slot = pool[i]; break; }
            }
            if (!slot) return;

            const w = window.innerWidth;
            const h = window.innerHeight;
            const cx = w / 2;
            const cy = h / 2;
            const edge = Math.floor(Math.random() * 4);
            switch (edge) {
                case 0: slot.x = Math.random() * w; slot.y = -20; break;
                case 1: slot.x = w + 20; slot.y = Math.random() * h; break;
                case 2: slot.x = Math.random() * w; slot.y = h + 20; break;
                default: slot.x = -20; slot.y = Math.random() * h; break;
            }

            const angle = Math.atan2(cy - slot.y, cx - slot.x) + (Math.random() - 0.5) * 1.2;
            const speed = 0.4 + Math.random() * 0.8;
            slot.vx = Math.cos(angle) * speed;
            slot.vy = Math.sin(angle) * speed;
            slot.size = 40 + Math.random() * 120;
            slot.alpha = 0.02 + Math.random() * 0.04;
            slot.life = 0;
            slot.active = true;
            // Swap to active region
            const idx = pool.indexOf(slot);
            if (idx > activeCount) {
                [pool[activeCount], pool[idx]] = [pool[idx], pool[activeCount]];
            }
            activeCount++;
        };

        const render = () => {
            if (!active) return;

            const w = window.innerWidth;
            const h = window.innerHeight;
            const cx = w / 2;
            const cy = h / 2;
            const elapsed = (performance.now() - startTime) / 1000;

            // Breathing sine-based intensity that loops continuously
            const breathCycle = 8.0; // seconds per breath cycle
            const rampUp = Math.min(elapsed / 3.0, 1.0); // fade in over 3s
            const breathe = 0.5 + 0.5 * Math.sin((elapsed / breathCycle) * Math.PI * 2 - Math.PI / 2);

            // Check if API is done → start fade-out
            const isDone = apiDoneRef.current;
            if (isDone && fadeOutStart === 0) {
                fadeOutStart = performance.now();
            }

            let fadeOut = 1.0;
            if (fadeOutStart > 0) {
                fadeOut = 1.0 - Math.min((performance.now() - fadeOutStart) / 1200, 1.0);
                if (fadeOut <= 0) {
                    active = false;
                    return;
                }
            }

            const intensity = rampUp * breathe * fadeOut;

            ctx.clearRect(0, 0, w, h);

            // Spawn
            const spawnRate = fadeOutStart === 0 ? 3 : 0;
            for (let i = 0; i < spawnRate; i++) {
                if (Math.random() < 0.4 + intensity * 0.4) {
                    spawnMote();
                }
            }

            // Update & render particles (iterate active region)
            for (let i = activeCount - 1; i >= 0; i--) {
                const m = pool[i];
                m.x += m.vx;
                m.y += m.vy;
                m.life += 0.01;
                m.vx *= 0.998;
                m.vy *= 0.998;

                const fadeIn = Math.min(m.life * 3, 1);
                const a = m.alpha * fadeIn * intensity;

                if (a > 0.001) {
                    ctx.globalAlpha = a;
                    ctx.drawImage(offscreen, m.x - m.size, m.y - m.size, m.size * 2, m.size * 2);
                }

                if (
                    m.life > 3 ||
                    m.x < -200 || m.x > w + 200 ||
                    m.y < -200 || m.y > h + 200
                ) {
                    // Swap-remove: swap with last active, shrink active region
                    m.active = false;
                    activeCount--;
                    if (i < activeCount) {
                        [pool[i], pool[activeCount]] = [pool[activeCount], pool[i]];
                    }
                }
            }
            ctx.globalAlpha = 1.0;

            // Center presence glow
            if (rampUp > 0.5) {
                const presenceAlpha = Math.min((rampUp - 0.5) * 2, 1) * intensity * 0.15;
                ctx.globalAlpha = presenceAlpha;
                ctx.drawImage(offscreen, cx - 200, cy - 200, 400, 400);
                ctx.globalAlpha = 1.0;
            }

            const washAlpha = intensity * 0.06;
            ctx.fillStyle = `rgba(100, 95, 85, ${washAlpha})`;
            ctx.fillRect(0, 0, w, h);

            requestAnimationFrame(render);
        };

        requestAnimationFrame(render);
        return () => {
            active = false;
            window.removeEventListener('resize', resize);
        };
    }, [apiDoneRef]);

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
    const { state, goToPhase, setNarrative, setGeneratedImage, resetState } = useApp();
    const [showImage, setShowImage] = useState(false);
    const [showName, setShowName] = useState(false);
    const [showNarrative, setShowNarrative] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const [imageDataUrl, setImageDataUrl] = useState('');
    const [apiDone, setApiDone] = useState(false);
    const apiDoneRef = useRef(false);
    // Track blob URLs for cleanup to prevent memory leaks
    const blobUrlRef = useRef<string | null>(null);
    const [error, setError] = useState('');
    const [warning, setWarning] = useState('');
    const abortRef = useRef<AbortController | null>(null);
    const reqRef = useRef(0);
    const mountedRef = useRef(true);
    const lastRequestKeyRef = useRef('');
    const activeRequestKeyRef = useRef<string | null>(null);
    const cachedImageUrlRef = useRef<string | null>(state.generatedImageUrl);

    // Save State
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Auto-reset idle timer
    const [showIdlePrompt, setShowIdlePrompt] = useState(false);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const abortCurrentRequest = useCallback((reason: string) => {
        const controller = abortRef.current;
        if (!controller || controller.signal.aborted) {
            return;
        }

        try {
            controller.abort(new DOMException(reason, 'AbortError'));
        } catch {
            controller.abort(reason);
        }
    }, []);

    const resetRevealState = useCallback(() => {
        setShowImage(false);
        setShowName(false);
        setShowNarrative(false);
        setShowActions(false);
        // Revoke old blob URL to free memory
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
        setImageDataUrl('');
        setApiDone(false);
        apiDoneRef.current = false;
        setError('');
        setWarning('');
        setGeneratedImage('');
        setNarrative('');
    }, [setGeneratedImage, setNarrative]);

    useEffect(() => {
        cachedImageUrlRef.current = state.generatedImageUrl;
    }, [state.generatedImageUrl]);

    const callApi = useCallback(async () => {
        if (!state.selectedConcept) {
            setError('概念が選択されていません。');
            apiDoneRef.current = true;
            setApiDone(true);
            return;
        }

        const requestKey = buildImageRequestKey(
            {
                name: state.selectedConcept.name,
                reading: state.selectedConcept.reading,
                description: state.selectedConcept.description,
            },
            state.artStyle ?? null,
            state.visualInput,
            state.answers
        );

        const cachedImageUrl = cachedImageUrlRef.current;
        if (lastRequestKeyRef.current === requestKey && cachedImageUrl) {
            setImageDataUrl(cachedImageUrl);
            setApiDone(true);
            apiDoneRef.current = true;
            setError('');
            setWarning('');
            return;
        }
        if (activeRequestKeyRef.current === requestKey) {
            return;
        }

        resetRevealState();
        setApiDone(false);
        setError('');
        setWarning('');
        setImageDataUrl('');
        setGeneratedImage('');
        setNarrative('');

        lastRequestKeyRef.current = requestKey;
        activeRequestKeyRef.current = requestKey;
        abortCurrentRequest('phase3 request superseded');

        const controller = new AbortController();
        abortRef.current = controller;
        const requestId = ++reqRef.current;

        try {
            const data = await generateImage(
                {
                    name: state.selectedConcept.name,
                    reading: state.selectedConcept.reading,
                    description: state.selectedConcept.description,
                },
                state.artStyle ?? '',
                state.visualInput,
                state.answers,
                controller.signal,
                state.folkloreResults?.map(f => ({
                    kaiiName: f.kaiiName,
                    content: f.content,
                    location: f.location,
                })) || []
            );

            if (!mountedRef.current || requestId !== reqRef.current || controller.signal.aborted) {
                return;
            }

            setWarning(data.warnings?.length ? data.warnings.join(' / ') : '');
            if (data.imageBase64) {
                // Convert Base64 → Blob URL to avoid holding multi-MB strings in state
                const byteChars = atob(data.imageBase64);
                const byteArr = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) {
                    byteArr[i] = byteChars.charCodeAt(i);
                }
                const blob = new Blob([byteArr], { type: data.imageMimeType });
                // Revoke previous blob URL
                if (blobUrlRef.current) {
                    URL.revokeObjectURL(blobUrlRef.current);
                }
                const blobUrl = URL.createObjectURL(blob);
                blobUrlRef.current = blobUrl;
                setImageDataUrl(blobUrl);
                setGeneratedImage(blobUrl);
            } else {
                setImageDataUrl('');
                setGeneratedImage('');
            }

            setNarrative(data.narrative);
            setApiDone(true);
            apiDoneRef.current = true;

            // 生成完了時に自動保存
            if (state.ticketId && data.imageBase64) {
                try {
                    const compressedB64 = await compressImage(
                        `data:${data.imageMimeType};base64,${data.imageBase64}`
                    );
                    await supabase
                        .from('surveys')
                        .update({
                            yokai_name: state.selectedConcept!.name,
                            yokai_desc: data.narrative,
                            yokai_image_b64: compressedB64,
                        })
                        .eq('id', state.ticketId);
                    setSaveSuccess(true);
                } catch (saveErr) {
                    console.error('Auto-save error:', saveErr);
                    setSaveError('記録の自動保存に失敗しました。');
                }
            }
        } catch (err) {
            if (!mountedRef.current || requestId !== reqRef.current) {
                return;
            }
            if (controller.signal.aborted) {
                apiDoneRef.current = true;
                setApiDone(true);
                return;
            }

            console.error('Generate image error:', err);
            setError(err instanceof Error ? err.message : '画像生成に失敗しました。');
            apiDoneRef.current = true;
            setApiDone(true);
        } finally {
            if (activeRequestKeyRef.current === requestKey) {
                activeRequestKeyRef.current = null;
            }
        }
    }, [
        abortCurrentRequest,
        resetRevealState,
        state.selectedConcept,
        state.artStyle,
        state.visualInput,
        state.answers,
        state.ticketId,
        setGeneratedImage,
        setNarrative,
    ]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortCurrentRequest('phase3 unmount');
        };
    }, [abortCurrentRequest]);

    useEffect(() => {
        void Promise.resolve().then(() => callApi());
        return () => {
            abortCurrentRequest('phase3 effect cleanup');
        };
    }, [callApi, abortCurrentRequest]);


    // Auto-reset: 30s idle → prompt, 10s more → reset
    const clearIdleTimers = useCallback(() => {
        if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
        if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
        setShowIdlePrompt(false);
    }, []);

    const startIdleTimers = useCallback(() => {
        clearIdleTimers();
        idleTimerRef.current = setTimeout(() => {
            setShowIdlePrompt(true);
            resetTimerRef.current = setTimeout(() => {
                resetState();
            }, 10000);
        }, 30000);
    }, [clearIdleTimers, resetState]);

    useEffect(() => {
        if (!showActions) return;
        startIdleTimers();
        const restart = () => startIdleTimers();
        window.addEventListener('pointerdown', restart);
        window.addEventListener('pointermove', restart);
        window.addEventListener('keydown', restart);
        return () => {
            clearIdleTimers();
            window.removeEventListener('pointerdown', restart);
            window.removeEventListener('pointermove', restart);
            window.removeEventListener('keydown', restart);
        };
    }, [showActions, startIdleTimers, clearIdleTimers]);



    const isGenerating = !apiDone;

    useEffect(() => {
        if (!isGenerating) {
            const t1 = setTimeout(() => setShowImage(true), 400);
            const t2 = setTimeout(() => setShowName(true), 1600);
            const t3 = setTimeout(() => setShowNarrative(true), 2800);
            const t4 = setTimeout(() => setShowActions(true), 4000);
            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
                clearTimeout(t4);
            };
        }
        return undefined;
    }, [isGenerating]);

    if (isGenerating) {
        return (
            <>
                <FogGenerationCanvas apiDoneRef={apiDoneRef} />
                <div className="phase" style={{
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center',
                    position: 'relative',
                    zIndex: 11,
                }}>
                    <p className="generation-wait">気配を像に写しています...</p>
                    {warning && (
                        <p style={{ fontSize: 12, color: 'var(--text-ghost)' }}>
                            {warning}
                        </p>
                    )}
                </div>
            </>
        );
    }

    if (error) {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ marginBottom: 16 }}>
                    画像の生成処理に失敗しました。
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-ghost)', marginBottom: 24 }}>
                    {error}
                </p>
                {warning && (
                    <p style={{ fontSize: 11, color: 'var(--text-ghost)', marginBottom: 24 }}>
                        {warning}
                    </p>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="button" onClick={() => {
                        void callApi();
                    }}>
                        再生成
                    </button>
                    <button className="button button-primary" onClick={() => {
                        if (isTransitioning) return;
                        setIsTransitioning(true);
                        goToPhase(3);
                    }} disabled={isTransitioning}>
                        画風選択へ戻る
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="phase-scrollable">
            <div className="reveal-container">
                {showImage && (
                    <div className="reveal-image-frame float-up">
                        {imageDataUrl ? (
                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                <img
                                    src={imageDataUrl}
                                    alt={state.yokaiName || '妖怪'}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 2 }}
                                />
                            </div>
                        ) : (
                            <div style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'var(--bg-surface)',
                            }}>
                                <p style={{ color: 'var(--text-ghost)', fontSize: 12 }}>
                                    画像の生成処理に失敗しました。
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {showName && (
                    <div className="float-up" style={{ animationDelay: '0.1s' }}>
                        <SpookyText
                            text={state.yokaiName || ''}
                            as="h1"
                            className="reveal-name ink-spread"
                            mojibake
                            mojibakeOptions={{ resolveSpeed: 120, flickerRate: 40, delay: 400 }}
                            charAnimation
                            charDelayStep={80}
                        />
                        <p className="reveal-reading">{state.selectedConcept?.reading}</p>
                    </div>
                )}

                {showNarrative && (
                    <p className="reveal-narrative float-up" style={{ animationDelay: '0.2s' }}>
                        {state.narrative}
                    </p>
                )}

                {warning && (
                    <p style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 8 }}>
                        {warning}
                    </p>
                )}

                {showActions && (
                    <div className="float-up" style={{
                        marginTop: 32,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 16,
                        animationDelay: '0.2s',
                    }}>
                        {saveSuccess && (
                            <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 8 }}>
                                記録が完了しました。
                            </p>
                        )}
                        {saveError && (
                            <p style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 8 }}>
                                {saveError}
                            </p>
                        )}
                        <a
                            href={`/survey/exit?id=${state.ticketId}`}
                            className="button button-primary"
                            style={{
                                display: 'inline-block',
                                textDecoration: 'none',
                                textAlign: 'center',
                                padding: '14px 36px',
                                fontSize: 16,
                                letterSpacing: '0.15em',
                            }}
                        >
                            アンケートへ進む
                        </a>
                        <p className="voice" style={{ fontSize: 12, opacity: 0.45, marginTop: 4 }}>
                            アンケートに回答されない方もありがとうございました。
                        </p>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                            <button className="button" onClick={() => {
                                void callApi();
                            }}>
                                再描画
                            </button>
                            <button className="button" onClick={() => {
                                if (isTransitioning) return;
                                setIsTransitioning(true);
                                goToPhase(2);
                            }} disabled={isTransitioning}>
                                概念から選び直す
                            </button>
                            <button className="button" onClick={() => {
                                if (isTransitioning) return;
                                setIsTransitioning(true);
                                resetState();
                            }} disabled={isTransitioning}>
                                初期画面へ戻る
                            </button>
                        </div>

                        {showIdlePrompt && (
                            <p className="voice float-up" style={{
                                fontSize: 13,
                                opacity: 0.7,
                                marginTop: 16,
                                animation: 'breathe 2s ease-in-out infinite',
                            }}>
                                操作がありません。まもなく初期画面に戻ります…
                            </p>
                        )}
                    </div>
                )}
            </div>

            <ProgressDots current={4} />
        </div>
    );
}
