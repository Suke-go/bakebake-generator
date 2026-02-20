"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Html5QrcodeScanner } from 'html5-qrcode';
import '@/app/globals.css';

export default function SurveyScanPage() {
    const router = useRouter();
    const [scanResult, setScanResult] = useState<string | null>(null);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    useEffect(() => {
        // Initialize scanner
        if (!scannerRef.current) {
            scannerRef.current = new Html5QrcodeScanner(
                "qr-reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                false
            );

            scannerRef.current.render(
                (decodedText) => {
                    // Stop scanning if we get a result
                    if (!scanResult) {
                        setScanResult(decodedText);
                        if (scannerRef.current) {
                            scannerRef.current.clear().catch(console.error);
                        }
                    }
                },
                (errorMessage) => {
                    // parse errors can be ignored safely
                }
            );
        }

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(console.error);
                scannerRef.current = null;
            }
        };
    }, [scanResult]);

    useEffect(() => {
        if (scanResult) {
            // Found a QR code, presumably the session ID
            // Optional: validate it's a UUID here, but for now just redirect
            router.push(`/survey/exit?id=${scanResult}`);
        }
    }, [scanResult, router]);

    return (
        <div style={{
            minHeight: '100vh',
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
                onClick={() => setScanResult(null)}
                className="interactive-button"
                style={{ marginTop: '3rem', padding: '0.8rem 1.5rem', opacity: 0.6 }}
            >
                スキャナーをリセット
            </button>
        </div>
    );
}
