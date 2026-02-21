"use client";

import React, { useEffect, useState, use, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import '@/app/globals.css';

/**
 * StyledQR — qr-code-styling による妖怪テーマQRコード
 * 丸ドット・緑系・canvas描画
 */
function StyledQR({ value, size = 200 }: { value: string; size?: number }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const qrRef = useRef<any>(null);

    useEffect(() => {
        if (!value || !containerRef.current) return;

        // Dynamic import (qr-code-styling uses DOM APIs)
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
                    color: '#22c55e',
                    type: 'dots',
                },
                cornersSquareOptions: {
                    color: '#16a34a',
                    type: 'extra-rounded',
                },
                cornersDotOptions: {
                    color: '#4ade80',
                    type: 'dot',
                },
                backgroundOptions: {
                    color: 'transparent',
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
        <div style={{
            position: 'relative',
            minHeight: '100dvh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000',
        }}>
            {/* 背景グラデーション */}
            <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                background: 'radial-gradient(ellipse at 50% 40%, hsl(140, 20%, 6%) 0%, hsl(150, 15%, 2%) 60%, #000 100%)',
            }} />

            {/* お札カード */}
            <div style={{
                position: 'relative',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2rem',
                padding: '2.5rem 2rem',
                background: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(6px)',
                borderRadius: '3px',
                border: '1px solid rgba(80, 180, 100, 0.15)',
                boxShadow: '0 0 50px rgba(40, 160, 70, 0.08), inset 0 0 40px rgba(0,0,0,0.4)',
                maxWidth: '340px',
                width: '85vw',
            }}>
                {/* 上部装飾線 */}
                <div style={{
                    width: '50%',
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, rgba(80, 180, 100, 0.3), transparent)',
                }} />

                {scannedYokai ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        {scannedYokai.b64 && (
                            <img
                                src={scannedYokai.b64}
                                alt={scannedYokai.name}
                                style={{
                                    width: '200px', height: '200px',
                                    objectFit: 'cover', borderRadius: '4px',
                                    border: '1px solid rgba(80,180,100,0.2)'
                                }}
                            />
                        )}
                        <p className="title-text" style={{ fontSize: '1.2rem' }}>
                            {scannedYokai.name}
                        </p>
                        <a
                            href={`/survey/exit?id=${id}`}
                            className="interactive-button"
                            style={{ marginTop: '0.5rem', padding: '1rem 2rem', textDecoration: 'none', textAlign: 'center' }}
                        >
                            事後アンケートへ
                        </a>
                    </div>
                ) : (
                    <>
                        {/* QR code with green glow */}
                        <div style={{
                            position: 'relative',
                            padding: '1.2rem',
                            background: 'rgba(0, 0, 0, 0.6)',
                            borderRadius: '8px',
                            boxShadow: '0 0 40px rgba(34, 197, 94, 0.2), 0 0 80px rgba(34, 197, 94, 0.08)',
                        }}>
                            {/* Pulsing glow ring (CSS animation) */}
                            <div style={{
                                position: 'absolute',
                                inset: '-4px',
                                borderRadius: '12px',
                                border: '1px solid rgba(34, 197, 94, 0.2)',
                                animation: 'qrPulse 3s ease-in-out infinite',
                                pointerEvents: 'none',
                            }} />
                            <StyledQR value={id} size={200} />
                        </div>

                        {/* 簡潔な指示 */}
                        <p style={{
                            fontFamily: 'var(--font-main, "Noto Serif JP", serif)',
                            fontSize: '0.8rem',
                            letterSpacing: '0.12em',
                            lineHeight: 2.2,
                            color: 'rgba(180, 220, 180, 0.5)',
                            textAlign: 'center',
                            margin: 0,
                        }}>
                            妖怪生成装置にかざしてください
                        </p>
                    </>
                )}

                {/* 下部装飾線 */}
                <div style={{
                    width: '50%',
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, rgba(80, 180, 100, 0.3), transparent)',
                }} />
            </div>

            {/* ID: ほぼ不可視 */}
            <div style={{
                position: 'absolute',
                bottom: '0.8rem',
                opacity: 0.05,
                fontFamily: 'monospace',
                fontSize: '0.5rem',
                zIndex: 10,
                color: 'rgba(255,255,255,0.3)',
                userSelect: 'none',
            }}>
                {id}
            </div>

            {/* CSS animation for pulsing glow */}
            <style>{`
                @keyframes qrPulse {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.02); }
                }
            `}</style>
        </div>
    );
}
