"use client";

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/lib/supabase';
import '@/app/globals.css';

export default function SurveyTicketPage({ params }: { params: { id: string } }) {
    const { id } = params;

    const [scannedYokai, setScannedYokai] = useState<{ name: string; b64: string } | null>(null);

    // 簡易的なスリープ防止（Wake Lock API）を試行する
    useEffect(() => {
        let wakeLock: any = null;
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await (navigator as any).wakeLock.request('screen');
                    console.log('Wake Lock is active');
                } catch (err: any) {
                    console.log(`${err.name}, ${err.message}`);
                }
            }
        };

        requestWakeLock();

        const handleVisibilityChange = () => {
            if (wakeLock !== null && document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (wakeLock !== null) {
                wakeLock.release().then(() => wakeLock = null);
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // 自分のIDのレコードの変更（ジェネレーターからの画像保存）を監視する
    useEffect(() => {
        if (!id) return;

        // 初期ロード時にすでに記録済みかチェック
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

        // Realtime Subscription
        const channel = supabase
            .channel(`survey-${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'surveys',
                    filter: `id=eq.${id}`
                },
                (payload) => {
                    const record = payload.new as any;
                    if (record && record.yokai_name) {
                        setScannedYokai({
                            name: record.yokai_name,
                            b64: record.yokai_image_b64
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
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
            backgroundColor: '#000'
        }}>
            {/* 軽量な静的グラデーション背景（バッテリー節約のためWebGLシェーダーを廃止） */}
            <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                background: 'radial-gradient(ellipse at 50% 40%, hsl(270, 30%, 12%) 0%, hsl(230, 24%, 4%) 70%, #000 100%)',
            }} />

            <div style={{
                position: 'relative',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2rem',
                padding: '2rem',
                background: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 0 50px rgba(100, 50, 200, 0.3)'
            }}>
                {scannedYokai ? (
                    // 記録済みの表示（サンクス画面）
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <h2 className="title-text" style={{ fontSize: '1.5rem', textAlign: 'center', color: '#00ff00' }}>
                            記録が完了しました
                        </h2>

                        {scannedYokai.b64 && (
                            <img
                                src={scannedYokai.b64}
                                alt={scannedYokai.name}
                                style={{
                                    width: '200px',
                                    height: '200px',
                                    objectFit: 'cover',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}
                            />
                        )}

                        <p className="title-text" style={{ fontSize: '1.2rem', margin: '0.5rem 0' }}>
                            {scannedYokai.name}
                        </p>

                        <p className="body-text" style={{ textAlign: 'center', opacity: 0.8, maxWidth: '280px', marginTop: '1rem' }}>
                            観測にご協力いただきありがとうございました。
                        </p>
                        <a
                            href={`/survey/exit?id=${id}`}
                            className="interactive-button"
                            style={{ marginTop: '1.5rem', padding: '1rem 2rem', textDecoration: 'none', textAlign: 'center' }}
                        >
                            事後アンケートへ進む
                        </a>
                    </div>
                ) : (
                    // 未記録の表示（QRコード）
                    <>
                        <h2 className="title-text" style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.1em' }}>
                            あなたの観測ID
                        </h2>

                        <div style={{
                            padding: '1rem',
                            background: '#fff',
                            borderRadius: '8px',
                            boxShadow: '0 0 30px rgba(255, 255, 255, 0.3)',
                            mixBlendMode: 'screen'
                        }}>
                            <QRCodeSVG
                                value={id}
                                size={200}
                                bgColor="#ffffff"
                                fgColor="#000000"
                                level="H"
                                includeMargin={false}
                            />
                        </div>

                        <p className="body-text" style={{ textAlign: 'center', opacity: 0.8, maxWidth: '250px' }}>
                            この気配を保ったまま、スクリーンの前へお進みください。画面は閉じないようお願いします。（スクリーンショット推奨）
                        </p>
                    </>
                )}
            </div>

            {/* Bottom identifier text (optional) */}
            <div style={{
                position: 'absolute',
                bottom: '2rem',
                opacity: 0.3,
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                zIndex: 10
            }}>
                ID: {id}
            </div>
        </div>
    );
}
