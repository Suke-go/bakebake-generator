"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import '@/app/globals.css';

type SurveyRecord = {
    id: string;
    created_at: string;
    visitor_type: string;
    yokai_name: string | null;
    yokai_desc: string | null;
    yokai_image_b64: string | null;
    print_triggered: boolean;
    printed: boolean;
    post_completed: boolean;
};

type DaemonStatus = 'online' | 'offline' | 'checking';

// ─── Statistics Header ──────────────────────────────────────
function StatsHeader({ surveys }: { surveys: SurveyRecord[] }) {
    const total = surveys.length;
    const generated = surveys.filter(s => s.yokai_name).length;
    const printed = surveys.filter(s => s.printed).length;
    const surveyed = surveys.filter(s => s.post_completed).length;

    const cards: { label: string; value: number; color: string }[] = [
        { label: '入場', value: total, color: '#88aaff' },
        { label: '生成済', value: generated, color: '#aaffff' },
        { label: '印刷済', value: printed, color: '#00ff88' },
        { label: 'アンケート', value: surveyed, color: '#ffcc44' },
    ];

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '1.5rem',
        }}>
            {cards.map(c => (
                <div key={c.label} style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '1rem',
                    textAlign: 'center',
                }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: c.color, fontVariantNumeric: 'tabular-nums' }}>
                        {c.value}
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.25rem' }}>
                        {c.label}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Daemon Status Indicator ────────────────────────────────
function DaemonIndicator({ status }: { status: DaemonStatus }) {
    const dotColor = status === 'online' ? '#00ff88' : status === 'offline' ? '#ff4444' : '#888';
    const label = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : '...';

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 1rem',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${dotColor}33`,
            fontSize: '0.8rem',
        }}>
            <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: dotColor,
                boxShadow: status === 'online' ? `0 0 8px ${dotColor}` : 'none',
                display: 'inline-block',
            }} />
            <span style={{ opacity: 0.8 }}>Print Daemon: {label}</span>
        </div>
    );
}

// ─── Detail Panel ───────────────────────────────────────────
function DetailPanel({ record }: { record: SurveyRecord }) {
    return (
        <tr>
            <td colSpan={6} style={{
                padding: '1rem 1.5rem',
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: record.yokai_image_b64 ? '120px 1fr' : '1fr',
                    gap: '1.5rem',
                    alignItems: 'start',
                }}>
                    {record.yokai_image_b64 && (
                        <img
                            src={record.yokai_image_b64}
                            alt={record.yokai_name || 'yokai'}
                            style={{
                                width: 120, height: 120,
                                objectFit: 'cover',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                        />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <div>
                            <span style={{ opacity: 0.5 }}>ID: </span>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{record.id}</span>
                        </div>
                        <div>
                            <span style={{ opacity: 0.5 }}>妖怪名: </span>
                            <span style={{ fontWeight: 600 }}>{record.yokai_name || '—'}</span>
                        </div>
                        <div>
                            <span style={{ opacity: 0.5 }}>説明: </span>
                            <span style={{ opacity: 0.85, lineHeight: 1.6 }}>
                                {record.yokai_desc || '—'}
                            </span>
                        </div>
                        <div>
                            <span style={{ opacity: 0.5 }}>属性: </span>
                            <span>{record.visitor_type || '—'}</span>
                        </div>
                        <div>
                            <span style={{ opacity: 0.5 }}>作成日時: </span>
                            <span>{new Date(record.created_at).toLocaleString('ja-JP')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                            <FlagBadge label="print_triggered" active={record.print_triggered} />
                            <FlagBadge label="printed" active={record.printed} />
                            <FlagBadge label="post_completed" active={record.post_completed} />
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    );
}

function FlagBadge({ label, active }: { label: string; active: boolean }) {
    return (
        <span style={{
            fontSize: '0.7rem',
            fontFamily: 'monospace',
            padding: '2px 8px',
            borderRadius: '4px',
            background: active ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
            color: active ? '#00ff88' : '#666',
            border: `1px solid ${active ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)'}`,
        }}>
            {active ? '✓' : '✗'} {label}
        </span>
    );
}

// ─── Main Dashboard ─────────────────────────────────────────
export default function AdminDashboardPage() {
    const [surveys, setSurveys] = useState<SurveyRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>('checking');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [actionFeedback, setActionFeedback] = useState<{ id: string; msg: string; type: 'ok' | 'err' } | null>(null);

    // ─── Fetch surveys ──────────────────────────────────────
    useEffect(() => {
        const fetchSurveys = async () => {
            try {
                setIsLoading(true);
                const { data, error } = await supabase
                    .from('surveys')
                    .select('id, created_at, visitor_type, yokai_name, yokai_desc, yokai_image_b64, print_triggered, printed, post_completed')
                    .order('created_at', { ascending: false })
                    .limit(200);

                if (error) throw error;
                if (data) setSurveys(data);
            } catch (err: any) {
                console.error(err);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSurveys();

        // Realtime subscription
        const channel = supabase.channel('admin-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'surveys' }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setSurveys(prev => [payload.new as SurveyRecord, ...prev].slice(0, 200));
                } else if (payload.eventType === 'UPDATE') {
                    setSurveys(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s));
                } else if (payload.eventType === 'DELETE') {
                    setSurveys(prev => prev.filter(s => s.id !== payload.old.id));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ─── Daemon health polling ──────────────────────────────
    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch('/api/local-print', { method: 'GET' });
                const data = await res.json();
                setDaemonStatus(res.ok && data.status !== 'offline' ? 'online' : 'offline');
            } catch {
                setDaemonStatus('offline');
            }
        };

        check();
        const interval = setInterval(check, 30_000);
        return () => clearInterval(interval);
    }, []);

    // ─── Action Feedback auto-clear ────────────────────────
    useEffect(() => {
        if (!actionFeedback) return;
        const t = setTimeout(() => setActionFeedback(null), 4000);
        return () => clearTimeout(t);
    }, [actionFeedback]);

    // ─── Reprint handler ────────────────────────────────────
    const handleReprint = useCallback(async (id: string) => {
        if (!confirm('この印刷タスクを再送信しますか？')) return;
        try {
            const res = await fetch('/api/admin/reprint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            setActionFeedback({ id, msg: `再送完了 (daemon: ${data.localDaemon})`, type: 'ok' });
        } catch (err: any) {
            setActionFeedback({ id, msg: `再送失敗: ${err.message}`, type: 'err' });
        }
    }, []);

    // ─── Delete handler ─────────────────────────────────────
    const handleDelete = useCallback(async (id: string) => {
        if (!confirm(`セッション ...${id.slice(-4)} を削除しますか？\nこの操作は元に戻せません。`)) return;
        try {
            const { error } = await supabase.from('surveys').delete().eq('id', id);
            if (error) throw error;
            setSurveys(prev => prev.filter(s => s.id !== id));
            setActionFeedback({ id, msg: '削除完了', type: 'ok' });
        } catch (err: any) {
            setActionFeedback({ id, msg: `削除失敗: ${err.message}`, type: 'err' });
        }
    }, []);

    // ─── Helpers ────────────────────────────────────────────
    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const getStatusBadge = (record: SurveyRecord) => {
        if (record.printed) return <span style={{ color: '#00ff88', border: '1px solid #00ff88', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>完了</span>;
        if (record.print_triggered) return <span style={{ color: '#ffaa00', border: '1px solid #ffaa00', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>印刷中</span>;
        if (record.yokai_name) return <span style={{ color: '#aaffff', border: '1px solid #aaffff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>生成済</span>;
        return <span style={{ color: '#aaa', border: '1px solid #555', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>入場中</span>;
    };

    return (
        <div data-yokai-zone="admin-dashboard-main" style={{
            minHeight: '100dvh',
            padding: '2rem',
            background: '#111',
            color: '#fff',
            fontFamily: 'sans-serif',
        }}>
            {/* ── Header ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                gap: '1rem',
            }}>
                <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 700, letterSpacing: '0.05em' }}>
                    🏯 運用ダッシュボード
                </h1>
                <DaemonIndicator status={daemonStatus} />
            </div>

            {error && <div style={{ color: '#ff6b6b', marginBottom: '1rem', padding: '0.5rem 1rem', background: 'rgba(255,107,107,0.1)', borderRadius: '6px' }}>Error: {error}</div>}

            {/* ── Action Feedback Toast ── */}
            {actionFeedback && (
                <div style={{
                    position: 'fixed',
                    top: '1rem',
                    right: '1rem',
                    zIndex: 1000,
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    background: actionFeedback.type === 'ok' ? 'rgba(0,255,136,0.15)' : 'rgba(255,68,68,0.15)',
                    color: actionFeedback.type === 'ok' ? '#00ff88' : '#ff6b6b',
                    border: `1px solid ${actionFeedback.type === 'ok' ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.3)'}`,
                    backdropFilter: 'blur(10px)',
                    animation: 'fadeIn 0.3s ease',
                }}>
                    {actionFeedback.msg}
                </div>
            )}

            {/* ── Stats Header ── */}
            <StatsHeader surveys={surveys} />

            {/* ── Table ── */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                overflowX: 'auto',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.08)', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                            <th style={{ padding: '0.8rem 1rem', fontSize: '0.8rem', fontWeight: 600 }}>入場時間</th>
                            <th style={{ padding: '0.8rem 1rem', fontSize: '0.8rem', fontWeight: 600 }}>ID</th>
                            <th style={{ padding: '0.8rem 1rem', fontSize: '0.8rem', fontWeight: 600 }}>属性</th>
                            <th style={{ padding: '0.8rem 1rem', fontSize: '0.8rem', fontWeight: 600 }}>生成妖怪</th>
                            <th style={{ padding: '0.8rem 1rem', fontSize: '0.8rem', fontWeight: 600 }}>ステータス</th>
                            <th style={{ padding: '0.8rem 1rem', fontSize: '0.8rem', fontWeight: 600, textAlign: 'right' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>読み込み中...</td></tr>
                        ) : surveys.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>データがありません</td></tr>
                        ) : (
                            surveys.map(record => (
                                <React.Fragment key={record.id}>
                                    <tr
                                        style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            cursor: 'pointer',
                                            background: expandedId === record.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                                            transition: 'background 0.15s',
                                        }}
                                        onClick={() => setExpandedId(prev => prev === record.id ? null : record.id)}
                                        onMouseEnter={e => { if (expandedId !== record.id) (e.currentTarget.style.background = 'rgba(255,255,255,0.03)'); }}
                                        onMouseLeave={e => { if (expandedId !== record.id) (e.currentTarget.style.background = 'transparent'); }}
                                    >
                                        <td style={{ padding: '0.8rem 1rem', opacity: 0.8, fontSize: '0.85rem' }}>
                                            {formatTime(record.created_at)}
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                            ...{record.id.slice(-4)}
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', opacity: 0.8, fontSize: '0.85rem' }}>
                                            {record.visitor_type || '—'}
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', fontSize: '0.85rem' }}>
                                            {record.yokai_name || <span style={{ opacity: 0.3 }}>—</span>}
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem' }}>
                                            {getStatusBadge(record)}
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                {record.yokai_name && (
                                                    <button
                                                        onClick={() => handleReprint(record.id)}
                                                        title="印刷再送"
                                                        style={{
                                                            background: 'rgba(255,170,0,0.15)',
                                                            border: '1px solid rgba(255,170,0,0.3)',
                                                            color: '#ffaa00',
                                                            padding: '4px 10px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.75rem',
                                                            transition: 'background 0.15s',
                                                        }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,170,0,0.3)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,170,0,0.15)')}
                                                    >
                                                        🔄 再印刷
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(record.id)}
                                                    title="削除"
                                                    style={{
                                                        background: 'rgba(255,68,68,0.1)',
                                                        border: '1px solid rgba(255,68,68,0.2)',
                                                        color: '#ff6b6b',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,68,68,0.25)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,68,68,0.1)')}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedId === record.id && <DetailPanel record={record} />}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <p style={{ marginTop: '1.5rem', opacity: 0.4, fontSize: '0.75rem' }}>
                ※この画面はリアルタイムで自動更新されます　|　表示上限: 200件
            </p>
        </div>
    );
}
