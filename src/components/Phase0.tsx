'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/lib/context';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';

/**
 * Phase 0: タイトル表示 + QR常時スキャン
 *
 * タイトルアニメーション後、QRスキャナーが自動起動。
 * 参加者のQRを認識したら ticketId を保存して Phase 1 へ。
 * タップ操作は不要。
 */
export default function Phase0() {
    const { goToPhase, setTicketId } = useApp();
    const [stage, setStage] = useState(0);
    const [scannerReady, setScannerReady] = useState(false);
    const [scanError, setScanError] = useState('');
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const scannedRef = useRef(false);

    // タイトルアニメーション
    useEffect(() => {
        const timers = [
            setTimeout(() => setStage(1), 2200),
            setTimeout(() => setStage(2), 5200),
            setTimeout(() => {
                setStage(3);
                setScannerReady(true);  // タイトル表示完了後にスキャナー起動
            }, 8500),
        ];
        return () => timers.forEach(id => clearTimeout(id));
    }, []);

    // QRスキャナー自動起動
    useEffect(() => {
        if (!scannerReady || scannedRef.current) return;

        // DOMが準備できるまで少し待つ
        const initTimer = setTimeout(() => {
            const qrboxSize = Math.min(Math.floor(window.innerWidth * 0.7), 300);
            const scanner = new Html5QrcodeScanner(
                'phase0-qr-reader',
                {
                    fps: 15,                    // スキャン頻度向上
                    qrbox: { width: qrboxSize, height: qrboxSize },
                    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],  // QRのみ → デコード高速化
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true,  // Chrome BarcodeDetector API活用
                    },
                },
                false
            );
            scannerRef.current = scanner;

            scanner.render(
                (decodedText) => {
                    if (scannedRef.current) return;
                    const trimmed = decodedText.trim();
                    if (trimmed.length < 10) {
                        setScanError('有効なQRコードではありません。');
                        return;
                    }
                    // スキャン成功
                    scannedRef.current = true;
                    try { scanner.clear().catch(() => { }); } catch { }
                    scannerRef.current = null;
                    setTicketId(trimmed);
                    setStage(5);
                    setTimeout(() => goToPhase(1), 800);
                },
                () => { /* パースエラーは無視 */ }
            );
        }, 200);

        return () => {
            clearTimeout(initTimer);
            if (scannerRef.current) {
                try { scannerRef.current.clear().catch(() => { }); } catch { }
                scannerRef.current = null;
            }
        };
    }, [scannerReady, setTicketId, goToPhase]);

    const handleTap = () => {
        if (stage < 3 && !scannedRef.current) {
            setStage(3);
            setScannerReady(true);
        }
    };

    return (
        <div
            className="phase"
            onClick={handleTap}
            style={{
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                cursor: stage < 3 ? 'pointer' : 'default',
            }}
        >
            {/* タイトル */}
            <p
                style={{
                    fontFamily: 'var(--font-main)',
                    fontSize: 28,
                    letterSpacing: '0.24em',
                    lineHeight: 2.1,
                    textIndent: '0.24em',
                    color: 'var(--text-bright)',
                    opacity: stage >= 1 && stage < 5 ? 1 : 0,
                    transform: stage >= 1 && stage < 5 ? 'none' : 'translateY(12px)',
                    transition: stage >= 4
                        ? 'opacity 0.6s ease, transform 0.6s ease'
                        : 'opacity 2.2s var(--ease), transform 2.2s var(--ease)',
                }}
            >
                妖怪生成装置
            </p>

            {/* サブテキスト */}
            <p
                style={{
                    fontFamily: 'var(--font-main)',
                    fontSize: 16,
                    letterSpacing: '0.12em',
                    lineHeight: 2.2,
                    textIndent: '0.12em',
                    color: 'var(--text-bright)',
                    marginTop: 14,
                    opacity: stage >= 2 && stage < 4 ? 1 : 0,
                    transform: stage >= 2 && stage < 4 ? 'none' : 'translateY(4px)',
                    transition: stage >= 4
                        ? 'opacity 0.5s ease, transform 0.5s ease'
                        : 'opacity 1.4s ease, transform 1.4s ease',
                }}
            >
                あなたの体験から
                <br />
                新たな妖怪の記録を生成します
            </p>

            {/* QRスキャナー（タイトル完了後に自動表示） */}
            {scannerReady && !scannedRef.current && (
                <div
                    className="float-up"
                    style={{
                        marginTop: 32,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 12,
                    }}
                >
                    <p
                        style={{
                            fontFamily: 'var(--font-main)',
                            fontSize: 12,
                            letterSpacing: '0.15em',
                            color: 'var(--text-ghost)',
                            animation: 'breathe 4s ease-in-out infinite',
                        }}
                    >
                        QRコードをかざしてください
                    </p>

                    <div
                        style={{
                            width: 280,
                            background: '#fff',
                            padding: 8,
                            borderRadius: 8,
                        }}
                    >
                        <div id="phase0-qr-reader" style={{ width: '100%' }} />
                    </div>

                    {scanError && (
                        <p style={{ fontSize: 12, color: '#ff6b6b' }}>{scanError}</p>
                    )}
                </div>
            )}
        </div>
    );
}