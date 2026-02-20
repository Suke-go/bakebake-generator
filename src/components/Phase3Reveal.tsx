'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
// Keep <img> for data URI image payloads to avoid Next Image URL validation issues.
import { useApp } from '@/lib/context';
import { generateImage } from '@/lib/api-client';
import ProgressDots from './ProgressDots';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';

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

function FogGenerationCanvas({ onComplete }: { onComplete: () => void }) {
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

        type Mote = {
            x: number;
            y: number;
            vx: number;
            vy: number;
            size: number;
            alpha: number;
            life: number;
        };

        const motes: Mote[] = [];

        const spawnMote = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const cx = w / 2;
            const cy = h / 2;
            const edge = Math.floor(Math.random() * 4);
            let x: number;
            let y: number;
            switch (edge) {
                case 0:
                    x = Math.random() * w;
                    y = -20;
                    break;
                case 1:
                    x = w + 20;
                    y = Math.random() * h;
                    break;
                case 2:
                    x = Math.random() * w;
                    y = h + 20;
                    break;
                default:
                    x = -20;
                    y = Math.random() * h;
                    break;
            }

            const angle = Math.atan2(cy - y, cx - x) + (Math.random() - 0.5) * 1.2;
            const speed = 0.4 + Math.random() * 0.8;
            motes.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 40 + Math.random() * 120,
                alpha: 0.02 + Math.random() * 0.04,
                life: 0,
            });
        };

        const render = () => {
            if (!active) return;

            const w = window.innerWidth;
            const h = window.innerHeight;
            const cx = w / 2;
            const cy = h / 2;
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
                    ctx.globalAlpha = a;
                    ctx.drawImage(offscreen, m.x - m.size, m.y - m.size, m.size * 2, m.size * 2);
                }

                if (
                    m.life > 3 ||
                    m.x < -200 ||
                    m.x > w + 200 ||
                    m.y < -200 ||
                    m.y > h + 200
                ) {
                    motes.splice(i, 1);
                }
            }
            ctx.globalAlpha = 1.0;

            if (progress > 0.3) {
                const presenceAlpha = Math.min((progress - 0.3) * 2, 1) * intensity * 0.15;
                ctx.globalAlpha = presenceAlpha;
                ctx.drawImage(offscreen, cx - 200, cy - 200, 400, 400);
                ctx.globalAlpha = 1.0;
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
        return () => {
            active = false;
            window.removeEventListener('resize', resize);
        };
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
    const [fogDone, setFogDone] = useState(false);
    const [showImage, setShowImage] = useState(false);
    const [showName, setShowName] = useState(false);
    const [showNarrative, setShowNarrative] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const [imageDataUrl, setImageDataUrl] = useState('');
    const [apiDone, setApiDone] = useState(false);
    const [error, setError] = useState('');
    const [warning, setWarning] = useState('');
    const abortRef = useRef<AbortController | null>(null);
    const reqRef = useRef(0);
    const mountedRef = useRef(true);
    const lastRequestKeyRef = useRef('');
    const activeRequestKeyRef = useRef<string | null>(null);
    const cachedImageUrlRef = useRef<string | null>(state.generatedImageUrl);

    // QR Scanning & Save State
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState('');
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

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
        setFogDone(false);
        setShowImage(false);
        setShowName(false);
        setShowNarrative(false);
        setShowActions(false);
        setImageDataUrl('');
        setApiDone(false);
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
            setFogDone(true);
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
            setFogDone(true);
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
                controller.signal
            );

            if (!mountedRef.current || requestId !== reqRef.current || controller.signal.aborted) {
                return;
            }

            setWarning(data.warnings?.length ? data.warnings.join(' / ') : '');
            if (data.imageBase64) {
                const dataUrl = `data:${data.imageMimeType};base64,${data.imageBase64}`;
                setImageDataUrl(dataUrl);
                setGeneratedImage(dataUrl);
            } else {
                setImageDataUrl('');
                setGeneratedImage('');
            }

            setNarrative(data.narrative);
            setApiDone(true);
        } catch (err) {
            if (!mountedRef.current || requestId !== reqRef.current) {
                return;
            }
            if (controller.signal.aborted) {
                setFogDone(true);
                setApiDone(true);
                return;
            }

            console.error('Generate image error:', err);
            setError(err instanceof Error ? err.message : '画像生成に失敗しました。');
            setFogDone(true);
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
        setGeneratedImage,
        setNarrative,
    ]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortCurrentRequest('phase3 unmount');
            if (scannerRef.current) {
                scannerRef.current.clear().catch(console.error);
                scannerRef.current = null;
            }
        };
    }, [abortCurrentRequest]);

    const handleRetry = useCallback(() => {
        void callApi();
    }, [callApi]);

    useEffect(() => {
        void Promise.resolve().then(() => callApi());
        return () => {
            abortCurrentRequest('phase3 effect cleanup');
        };
    }, [callApi, abortCurrentRequest]);

    const handleFogComplete = useCallback(() => {
        setFogDone(true);
    }, []);

    useEffect(() => {
        if (isScanning && !scannerRef.current) {
            scannerRef.current = new Html5QrcodeScanner(
                "generator-qr-reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                false
            );

            scannerRef.current.render(
                async (decodedText) => {
                    if (isSaving || saveSuccess) return;
                    setIsSaving(true);
                    setScanError('');
                    try {
                        if (scannerRef.current) {
                            scannerRef.current.clear().catch(console.error);
                            scannerRef.current = null;
                        }

                        // Resize image and convert to lightweight JPEG base64
                        const compressedB64 = state.generatedImageUrl ? await compressImage(state.generatedImageUrl) : null;

                        // Save to Supabase using the scanned ID
                        const { error: dbError } = await supabase
                            .from('surveys')
                            .update({
                                yokai_name: state.yokaiName,
                                yokai_desc: state.narrative,
                                yokai_image_b64: compressedB64
                            })
                            .eq('id', decodedText);

                        if (dbError) throw dbError;

                        setSaveSuccess(true);
                        setIsScanning(false);
                        setIsSaving(false);

                        // Automatically return to Phase 0 after a short delay
                        setTimeout(() => {
                            goToPhase(0);
                        }, 5000);

                    } catch (err: any) {
                        console.error("Save error", err);
                        setScanError("記録の転送に失敗しました。もう一度QRをかざしてください。");
                        setIsSaving(false);
                        setIsScanning(false); // Can retry by clicking "保存する" again
                    }
                },
                (err) => {
                    // Ignore parsing errors
                }
            );
        }

        return () => {
            // Cleanup scanner when scanning state becomes false
            if (!isScanning && scannerRef.current) {
                scannerRef.current.clear().catch(console.error);
                scannerRef.current = null;
            }
        };
    }, [isScanning, isSaving, saveSuccess, state.generatedImageUrl, state.yokaiName, state.narrative, goToPhase]);

    const isGenerating = !fogDone || !apiDone;

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
                <FogGenerationCanvas onComplete={handleFogComplete} />
                <div className="phase" style={{
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center',
                    position: 'relative',
                    zIndex: 11,
                }}>
                    <p className="generation-wait">いま、あなたの気配に姿を与えています。</p>
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
                    姿を結ぶことができませんでした。
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
                    <button className="button" onClick={handleRetry}>
                        もう一度試す
                    </button>
                    <button className="button button-primary" onClick={() => goToPhase(3)}>
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
                                    画像は生成されませんでした。
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

                {warning && (
                    <p style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 8 }}>
                        {warning}
                    </p>
                )}

                {showActions && !isScanning && !saveSuccess && (
                    <div className="float-up" style={{
                        marginTop: 32,
                        display: 'flex',
                        gap: 12,
                        animationDelay: '0.2s',
                    }}>
                        <button className="button" onClick={() => goToPhase(2)}>
                            やり直す
                        </button>
                        <button className="button" onClick={() => goToPhase(0)}>
                            最初から
                        </button>
                        <button className="button button-primary" onClick={() => setIsScanning(true)}>
                            QRに記録する (カメラ読取)
                        </button>
                    </div>
                )}

                {isScanning && (
                    <div className="float-up scan-container" style={{
                        marginTop: 32,
                        width: '100%',
                        maxWidth: '400px',
                        background: 'rgba(0,0,0,0.5)',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.2)'
                    }}>
                        <p style={{ textAlign: 'center', marginBottom: '1rem', color: '#fff' }}>
                            【スマートフォンのQRコードをカメラに見せてください】
                        </p>
                        <div id="generator-qr-reader" style={{ width: '100%', background: '#fff' }}></div>
                        <button className="button" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setIsScanning(false)}>
                            キャンセル
                        </button>
                    </div>
                )}

                {isSaving && (
                    <div className="float-up" style={{ marginTop: 32, textAlign: 'center' }}>
                        <p>あなたの観測データを定着させています...</p>
                    </div>
                )}

                {scanError && (
                    <div className="float-up" style={{ marginTop: 16, color: '#ff6b6b', textAlign: 'center' }}>
                        <p>{scanError}</p>
                    </div>
                )}

                {saveSuccess && (
                    <div className="float-up" style={{ marginTop: 32, textAlign: 'center' }}>
                        <p style={{ color: '#00ff00', fontSize: '1.2rem', marginBottom: '1rem' }}>
                            記録が完了しました。
                        </p>
                        <p style={{ opacity: 0.8 }}>
                            出口のスタッフへ、このQRコードを再度提示してください。<br />
                            記録のお札を発行いたします。
                        </p>
                        <p style={{ marginTop: '2rem', fontSize: '0.9rem', opacity: 0.5 }}>
                            ※まもなく最初の画面に戻ります
                        </p>
                    </div>
                )}
            </div>

            <ProgressDots current={4} />
        </div>
    );
}
