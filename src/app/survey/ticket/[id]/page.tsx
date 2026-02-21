"use client";

import React, { useEffect, useState, use, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import QRGlow from '@/components/QRFlameAura';
import '@/app/globals.css';

/**
 * StyledQR — qr-code-styling によるcanvas QR
 * 墨色ドット・和紙背景
 */
function StyledQR({ value, size = 200 }: { value: string; size?: number }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const qrRef = useRef<any>(null);

    useEffect(() => {
        if (!value || !containerRef.current) return;

        import('qr-code-styling').then((mod) => {
            const QRCodeStyling = mod.default;

            if (qrRef.current) {
                qrRef.current.update({ data: value });
                return;
            }

            const qr = new QRCodeStyling({
                width: size,
                height: size,
                type: 'canvas',
                data: value,
                dotsOptions: {
                    color: '#1a2418',       // 墨色に近い深緑
                    type: 'dots',
                },
                cornersSquareOptions: {
                    color: '#0f1a0d',
                    type: 'extra-rounded',
                },
                cornersDotOptions: {
                    color: '#2d4a28',       // 苔色
                    type: 'dot',
                },
                backgroundOptions: {
                    color: '#ede8d8',       // 生成り色（和紙）
                },
                qrOptions: {
                    errorCorrectionLevel: 'H',
                },
            });

            qrRef.current = qr;
            containerRef.current!.innerHTML = '';
            qr.append(containerRef.current!);
        });
    }, [value, size]);

    return <div ref={containerRef} style={{ lineHeight: 0 }} />;
}

export default function SurveyTicketPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [scannedYokai, setScannedYokai] = useState<{ name: string; b64: string } | null>(null);

    // Wake Lock
    useEffect(() => {
        let wakeLock: any = null;
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try { wakeLock = await (navigator as any).wakeLock.request('screen'); } catch { }
            }
        };
        requestWakeLock();
        const handleVisibilityChange = () => {
            if (wakeLock !== null && document.visibilityState === 'visible') requestWakeLock();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            if (wakeLock !== null) wakeLock.release().then(() => wakeLock = null);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Realtime subscription
    useEffect(() => {
        if (!id) return;
        const checkExisting = async () => {
            const { data } = await supabase
                .from('surveys')
                .select('yokai_name, yokai_image_b64')
                .eq('id', id)
                .single();
            if (data && data.yokai_name) {
                setScannedYokai({ name: data.yokai_name, b64: data.yokai_image_b64 });
            }
        };
        checkExisting();

        const channel = supabase
            .channel(`survey-${id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'surveys', filter: `id=eq.${id}` },
                (payload) => {
                    const record = payload.new as any;
                    if (record && record.yokai_name) {
                        setScannedYokai({ name: record.yokai_name, b64: record.yokai_image_b64 });
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [id]);

    return (
        <div data-yokai-zone="survey-ticket-main" style={{
            position: 'relative',
            minHeight: '100dvh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0a0a0a',
        }}>
            {/* 漆黒の背景 with subtle vignette */}
            <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                background: 'radial-gradient(ellipse at 50% 45%, hsl(120, 8%, 8%) 0%, hsl(0, 0%, 3%) 70%, #000 100%)',
            }} />

            {/* ── お札 ── */}
            <div style={{
                position: 'relative',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                // 間: generous vertical spacing
                gap: '2.5rem',
                // お札の形: 縦長, 和紙の色
                padding: '3rem 2rem 2.5rem',
                background: 'linear-gradient(180deg, #ede8d8 0%, #e5dfc8 100%)',
                borderRadius: '2px',
                maxWidth: '300px',
                width: '80vw',
                // 和紙の質感: subtle inner shadow + soft outer glow
                boxShadow: `
                    inset 0 0 30px rgba(0, 0, 0, 0.06),
                    0 0 60px rgba(40, 100, 50, 0.12),
                    0 4px 20px rgba(0, 0, 0, 0.4)
                `,
                // 非常に薄い枠線
                border: '1px solid rgba(160, 140, 100, 0.3)',
            }}>

                {/* 上部の朱印的装飾 */}
                <div style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '50%',
                    border: '1.5px solid rgba(180, 60, 40, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.6,
                }}>
                    <span style={{
                        fontFamily: 'serif',
                        fontSize: '0.75rem',
                        color: 'rgba(160, 50, 30, 0.6)',
                        fontWeight: 700,
                    }}>化</span>
                </div>

                {scannedYokai ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                        {scannedYokai.b64 && (
                            <img
                                src={scannedYokai.b64}
                                alt={scannedYokai.name}
                                style={{
                                    width: '180px', height: '180px',
                                    objectFit: 'cover', borderRadius: '2px',
                                    border: '1px solid rgba(0,0,0,0.1)'
                                }}
                            />
                        )}
                        <p style={{
                            fontFamily: '"Noto Serif JP", serif',
                            fontSize: '1.1rem',
                            color: '#2a2a20',
                            margin: 0,
                        }}>
                            {scannedYokai.name}
                        </p>
                        <a
                            href={`/survey/exit?id=${id}`}
                            style={{
                                fontFamily: '"Noto Serif JP", serif',
                                fontSize: '0.8rem',
                                padding: '0.8rem 2rem',
                                textDecoration: 'none',
                                color: '#ede8d8',
                                background: '#2a3a28',
                                borderRadius: '2px',
                                letterSpacing: '0.1em',
                            }}
                        >
                            事後アンケートへ
                        </a>
                    </div>
                ) : (
                    <>
                        {/* QR + GLSL glow */}
                        <div style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            {/* GLSL glow behind QR */}
                            <QRGlow size={280} />

                            {/* QR code: washi background, ink dots */}
                            <div style={{
                                position: 'relative',
                                zIndex: 1,
                                borderRadius: '2px',
                                overflow: 'hidden',
                            }}>
                                <StyledQR value={id} size={200} />
                            </div>
                        </div>

                        {/* 指示テキスト — 墨色、書体的 */}
                        <p style={{
                            fontFamily: '"Noto Serif JP", serif',
                            fontSize: '0.85rem',
                            letterSpacing: '0.2em',
                            lineHeight: 2.4,
                            color: 'rgba(40, 40, 30, 0.6)',
                            textAlign: 'center',
                            margin: 0,
                        }}>
                            妖怪生成装置にかざしてください
                        </p>
                    </>
                )}

                {/* 下部装飾: 細い墨線 */}
                <div style={{
                    width: '40%',
                    height: '0.5px',
                    background: 'rgba(40, 40, 30, 0.15)',
                }} />
            </div>

            {/* ID: ほぼ不可視 */}
            <div style={{
                position: 'absolute',
                bottom: '0.6rem',
                opacity: 0.04,
                fontFamily: 'monospace',
                fontSize: '0.45rem',
                zIndex: 10,
                color: 'rgba(255,255,255,0.3)',
                userSelect: 'none',
            }}>
                {id}
            </div>
        </div>
    );
}
