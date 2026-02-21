"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import '@/app/globals.css';

type SurveyRecord = {
    id: string;
    created_at: string;
    visitor_type: string;
    yokai_name: string | null;
    print_triggered: boolean;
    printed: boolean;
    post_completed: boolean;
};

export default function AdminDashboardPage() {
    const [surveys, setSurveys] = useState<SurveyRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Initial fetch
    useEffect(() => {
        const fetchSurveys = async () => {
            try {
                setIsLoading(true);
                const { data, error } = await supabase
                    .from('surveys')
                    .select('id, created_at, visitor_type, yokai_name, print_triggered, printed, post_completed')
                    .order('created_at', { ascending: false })
                    .limit(100);

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
                    setSurveys(prev => [payload.new as SurveyRecord, ...prev].slice(0, 100)); // Keep latest 100
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

    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const getStatusBadge = (record: SurveyRecord) => {
        if (record.printed) return <span style={{ color: '#00ff00', border: '1px solid #00ff00', padding: '2px 8px', borderRadius: '12px' }}>完了</span>;
        if (record.print_triggered) return <span style={{ color: '#ffaa00', border: '1px solid #ffaa00', padding: '2px 8px', borderRadius: '12px' }}>印刷中</span>;
        if (record.yokai_name) return <span style={{ color: '#aaffff', border: '1px solid #aaffff', padding: '2px 8px', borderRadius: '12px' }}>生成済 (QR未読)</span>;
        return <span style={{ color: '#aaa', border: '1px solid #aaa', padding: '2px 8px', borderRadius: '12px' }}>入場中</span>;
    };

    return (
        <div data-yokai-zone="admin-dashboard-main" style={{
            minHeight: '100dvh',
            padding: '2rem',
            background: '#111',
            color: '#fff',
            fontFamily: 'sans-serif'
        }}>
            <h1 className="title-text" style={{ fontSize: '2rem', marginBottom: '2rem' }}>
                運用ダッシュボード
            </h1>

            {error && <div style={{ color: '#ff6b6b', marginBottom: '1rem' }}>Error: {error}</div>}

            <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                overflowX: 'auto'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.1)', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                            <th style={{ padding: '1rem' }}>入場時間</th>
                            <th style={{ padding: '1rem' }}>ID (下4桁)</th>
                            <th style={{ padding: '1rem' }}>属性</th>
                            <th style={{ padding: '1rem' }}>生成妖怪</th>
                            <th style={{ padding: '1rem' }}>ステータス</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</td></tr>
                        ) : surveys.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center' }}>データがありません</td></tr>
                        ) : (
                            surveys.map(record => (
                                <tr key={record.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '1rem', opacity: 0.8 }}>{formatTime(record.created_at)}</td>
                                    <td style={{ padding: '1rem', fontFamily: 'monospace' }}>...{record.id.slice(-4)}</td>
                                    <td style={{ padding: '1rem', opacity: 0.8 }}>{record.visitor_type}</td>
                                    <td style={{ padding: '1rem' }}>{record.yokai_name || '-'}</td>
                                    <td style={{ padding: '1rem' }}>{getStatusBadge(record)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <p style={{ marginTop: '2rem', opacity: 0.5, fontSize: '0.8rem' }}>
                ※この画面はリアルタイムで自動更新されます
            </p>
        </div>
    );
}
