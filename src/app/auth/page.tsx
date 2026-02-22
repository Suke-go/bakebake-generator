"use client";

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import '@/app/globals.css';

function AuthForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const nextPath = searchParams.get('next') || '/generator';

    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id.trim() || !password.trim()) return;

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id.trim(), password: password.trim() }),
            });

            if (res.ok) {
                router.push(nextPath);
            } else {
                const data = await res.json();
                setError(data.error || '認証に失敗しました');
            }
        } catch {
            setError('通信エラーが発生しました');
        } finally {
            setLoading(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        fontFamily: 'var(--font-label)',
        fontSize: '16px',
        padding: '0.8rem 1rem',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '6px',
        color: 'var(--text-bright)',
        outline: 'none',
        width: '100%',
    };

    return (
        <div style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at 50% 40%, hsl(230, 15%, 8%) 0%, hsl(230, 24%, 2%) 100%)',
            padding: '2rem',
        }}>
            <div style={{
                maxWidth: '320px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem',
            }}>
                <p style={{
                    fontFamily: 'var(--font-main)',
                    fontSize: '1.1rem',
                    letterSpacing: '0.2em',
                    color: 'var(--text-bright)',
                    textAlign: 'center',
                }}>
                    管理者認証
                </p>

                <form onSubmit={handleSubmit} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                    width: '100%',
                }}>
                    <input
                        type="text"
                        autoComplete="username"
                        placeholder="ID"
                        value={id}
                        onChange={e => setId(e.target.value)}
                        autoFocus
                        style={inputStyle}
                    />

                    <input
                        type="password"
                        autoComplete="current-password"
                        placeholder="パスワード"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        style={inputStyle}
                    />

                    {error && (
                        <p style={{
                            color: '#ff6b6b',
                            fontSize: '0.85rem',
                            textAlign: 'center',
                            margin: 0,
                        }}>
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !id.trim() || !password.trim()}
                        style={{
                            fontFamily: 'var(--font-main)',
                            fontSize: '0.9rem',
                            letterSpacing: '0.15em',
                            padding: '0.8rem',
                            marginTop: '0.5rem',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            color: 'var(--text-bright)',
                            cursor: loading ? 'wait' : 'pointer',
                            opacity: loading || !id.trim() || !password.trim() ? 0.4 : 1,
                            transition: 'opacity 0.2s ease',
                        }}
                    >
                        {loading ? '確認中...' : '認証'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={
            <div style={{
                minHeight: '100dvh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0a0a0c',
                color: '#666',
            }}>
                読み込み中...
            </div>
        }>
            <AuthForm />
        </Suspense>
    );
}
