"use client";

import React, { useEffect, useState, use, useRef, useCallback } from 'react';
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
                    color: '#2a0808',       // 濃い血の色（黒に近い赤）
                    type: 'dots',
                },
                cornersSquareOptions: {
                    color: '#1a0505',       // さらに暗い赤黒
                    type: 'extra-rounded',
                },
                cornersDotOptions: {
                    color: '#4a0808',       // 強い血の赤
                    type: 'dot',
                },
                backgroundOptions: {
                    color: '#e2d5c8',       // 少し暗く汚れた生成り色
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
    const [scannedYokai, setScannedYokai] = useState<{ name: string; b64: string; desc: string } | null>(null);

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
                .select('yokai_name, yokai_image_b64, yokai_desc')
                .eq('id', id)
                .single();
            if (data && data.yokai_name) {
                setScannedYokai({ name: data.yokai_name, b64: data.yokai_image_b64, desc: data.yokai_desc || '' });
            }
        };
        checkExisting();

        const channel = supabase
            .channel(`survey-${id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'surveys', filter: `id=eq.${id}` },
                async (payload) => {
                    const record = payload.new as any;
                    if (record && record.yokai_name) {
                        // Realtime payloads silently omit fields >64 bytes (e.g. yokai_image_b64).
                        // Use the event as a signal, then fetch full data via REST API.
                        const { data } = await supabase
                            .from('surveys')
                            .select('yokai_name, yokai_image_b64, yokai_desc')
                            .eq('id', id)
                            .single();
                        if (data && data.yokai_name) {
                            setScannedYokai({ name: data.yokai_name, b64: data.yokai_image_b64, desc: data.yokai_desc || '' });
                        }
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

            {/* ── お札 (label.png 背景) ── */}
            <div style={{
                position: 'relative',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                // 間: generous vertical spacing
                gap: '2.5rem',
                // 霊符画像の比率に合わせたPadding
                padding: '4rem 2rem 3rem',
                // 背景画像にlabel.pngを指定
                backgroundImage: 'url(/label.png)',
                backgroundSize: '100% 100%',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                borderRadius: '4px',
                maxWidth: '340px',
                width: '85vw',
                minHeight: '600px', // 霊符らしく縦長を維持
                // 霊符らしく少し影をつける
                boxShadow: `
                    0 0 60px rgba(0, 0, 0, 0.6),
                    0 4px 20px rgba(0, 0, 0, 0.8)
                `,
            }}>

                {scannedYokai ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1.2rem',
                        background: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(4px)',
                        padding: '1.5rem',
                        borderRadius: '8px',
                        width: '100%',
                        boxSizing: 'border-box',
                    }}>
                        {/* Thank you message */}
                        <p style={{
                            fontFamily: '"Noto Serif JP", serif',
                            fontSize: '0.85rem',
                            letterSpacing: '0.15em',
                            color: '#ede8d8', // 白・生成り文字
                            margin: 0,
                            textAlign: 'center',
                        }}>
                            ご参加ありがとうございました
                        </p>

                        {/* Yokai image */}
                        {scannedYokai.b64 && (
                            <img
                                src={scannedYokai.b64}
                                alt={scannedYokai.name}
                                style={{
                                    width: '180px', height: '180px',
                                    objectFit: 'cover', borderRadius: '4px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                }}
                            />
                        )}

                        {/* Yokai name */}
                        <p style={{
                            fontFamily: '"Noto Serif JP", serif',
                            fontSize: '1.3rem',
                            color: '#ffffff',
                            margin: 0,
                            fontWeight: 600,
                            letterSpacing: '0.05em',
                        }}>
                            {scannedYokai.name}
                        </p>

                        {/* Narrative */}
                        {scannedYokai.desc && (
                            <p style={{
                                fontFamily: '"Noto Serif JP", serif',
                                fontSize: '0.8rem',
                                lineHeight: 1.8,
                                color: 'rgba(237, 232, 216, 0.9)', // 少し白を抑えた生成り
                                margin: 0,
                                textAlign: 'left',
                                width: '100%',
                            }}>
                                {scannedYokai.desc}
                            </p>
                        )}

                        {/* Download button */}
                        {scannedYokai.b64 && (
                            <a
                                href={scannedYokai.b64}
                                download={`${scannedYokai.name || 'yokai'}.jpg`}
                                style={{
                                    fontFamily: '"Noto Serif JP", serif',
                                    fontSize: '0.8rem',
                                    padding: '0.7rem 2rem',
                                    textDecoration: 'none',
                                    color: '#ede8d8',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: '1px solid rgba(237, 232, 216, 0.3)',
                                    borderRadius: '4px',
                                    letterSpacing: '0.1em',
                                    textAlign: 'center',
                                    marginTop: '0.5rem',
                                    transition: 'background 0.2s ease',
                                }}
                            >
                                画像を保存する
                            </a>
                        )}
                    </div>
                ) : (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1.5rem',
                        // 背景の黒枠を最小限に抑える
                        background: 'rgba(0, 0, 0, 0.45)',
                        backdropFilter: 'blur(3px)',
                        padding: '1.5rem 1rem',
                        borderRadius: '6px',
                        width: 'auto', // 横幅も最小限に
                        minWidth: '220px',
                        boxSizing: 'border-box',
                        // flexGrow: 1 を削除し、必要最小限の高さにする
                        marginTop: 'auto',
                        marginBottom: 'auto', // コンテナの中央に配置
                    }}>
                        {/* QR + GLSL glow */}
                        <div style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            {/* GLSL glow behind QR */}
                            <QRGlow size={240} />

                            {/* QR code: washi background, ink dots */}
                            <div style={{
                                position: 'relative',
                                zIndex: 1,
                                borderRadius: '4px',
                                overflow: 'hidden',
                                // QRをよりくっきりさせるために白い余白を付与
                                padding: '6px',
                                background: '#ede8d8',
                            }}>
                                <StyledQR value={id} size={160} />
                            </div>
                        </div>

                        {/* 指示テキスト — 白文字 */}
                        <p style={{
                            fontFamily: '"Noto Serif JP", serif',
                            fontSize: '0.85rem',
                            letterSpacing: '0.15em',
                            lineHeight: 1.8,
                            color: '#ede8d8',
                            textAlign: 'center',
                            margin: 0,
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                        }}>
                            妖怪生成装置に<br />かざしてください
                        </p>
                    </div>
                )}
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
