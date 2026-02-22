"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import '@/app/globals.css';

export default function SurveyScanPage() {
    const router = useRouter();
    const [scanResult, setScanResult] = useState<string | null>(null);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const hasScanned = useRef(false);

    const handleDecode = useCallback((decodedText: string) => {
        if (hasScanned.current) return;
        hasScanned.current = true;
        setScanResult(decodedText);
        if (scannerRef.current) {
            scannerRef.current.clear().catch(console.error);
            scannerRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (scannerRef.current || hasScanned.current) return;

        const qrboxSize = Math.min(Math.floor(window.innerWidth * 0.7), 300);
        const scanner = new Html5QrcodeScanner(
            "qr-reader",
            {
                fps: 15,
                qrbox: { width: qrboxSize, height: qrboxSize },
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true,
                },
            },
            false
        );
        scannerRef.current = scanner;

        scanner.render(
            (decodedText) => handleDecode(decodedText),
            () => { /* ignore parse errors */ }
        );

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(console.error);
                scannerRef.current = null;
            }
        };
    }, [handleDecode]);

    useEffect(() => {
        if (scanResult) {
            router.push(`/survey/exit?id=${scanResult}`);
        }
    }, [scanResult, router]);

    return (
        <div data-yokai-zone="survey-scan-main" style={{
            minHeight: '100dvh',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000'
        }}>
            <h1 className="title-text" style={{ fontSize: '2rem', marginBottom: '2rem', textAlign: 'center' }}>
                スキャナー
            </h1>

            <p className="body-text" style={{ textAlign: 'center', opacity: 0.8, marginBottom: '2rem' }}>
                参加者のスマートフォンのQRコードを読み取ってください。
            </p>

            <div style={{
                width: '100%',
                maxWidth: '500px',
                background: '#fff',
                padding: '1rem',
                borderRadius: '8px'
            }}>
                <div id="qr-reader" style={{ width: '100%' }}></div>
            </div>

            {scanResult && (
                <div style={{ marginTop: '2rem', color: '#00ff00' }}>
                    ID: {scanResult} を読み込みました。リダイレクト中...
                </div>
            )}

            <button
                onClick={() => {
                    hasScanned.current = false;
                    setScanResult(null);
                }}
                className="interactive-button"
                style={{ marginTop: '3rem', padding: '0.8rem 1.5rem', opacity: 0.6 }}
            >
                スキャナーをリセット
            </button>
        </div>
    );
}
