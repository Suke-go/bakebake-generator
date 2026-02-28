"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import '@/app/globals.css';
import './collection.css'; // We will create this next for specific styles

type SurveyRecord = {
    id: string;
    created_at: string;
    visitor_type: string | null;
    yokai_name: string | null;
    yokai_desc: string | null;
    yokai_image_b64: string | null;
    pre_origin: string | null;
    pre_age: string | null;
    pre_gender: string | null;
    pre_familiarity: number | null;
    pre_yokai_perception: string | null;
    post_impression: string | null;
    post_theme: string | null;
    post_action: number | null;
    post_completed: boolean;
};

// Map perception types to Japanese strings
const PERCEPTION_MAP: Record<string, string> = {
    character: 'キャラクター',
    culture: '歴史・文化',
    psychology: '心理・現象',
    none: 'とくにない',
};

export default function CollectionPage() {
    const [surveys, setSurveys] = useState<SurveyRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedYokai, setSelectedYokai] = useState<SurveyRecord | null>(null);

    useEffect(() => {
        const fetchSurveys = async () => {
            try {
                setIsLoading(true);
                // We only want to show ones that actually have a Yokai generated
                const { data, error } = await supabase
                    .from('surveys')
                    .select('*')
                    .not('yokai_name', 'is', null)
                    .order('created_at', { ascending: false });

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

        // Real-time subscription to see new Yokais pop up immediately
        const channel = supabase.channel('collection-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'surveys' }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    const newRec = payload.new as SurveyRecord;
                    if (newRec.yokai_name) {
                        setSurveys(prev => [newRec, ...prev]);
                    }
                } else if (payload.eventType === 'UPDATE') {
                    const updatedRec = payload.new as SurveyRecord;
                    setSurveys(prev => {
                        // If it just got a yokai_name, we might need to add it, or update existing
                        const exists = prev.some(s => s.id === updatedRec.id);
                        if (exists) {
                            return prev.map(s => s.id === updatedRec.id ? { ...s, ...updatedRec } : s);
                        } else if (updatedRec.yokai_name) {
                            return [updatedRec, ...prev];
                        }
                        return prev;
                    });
                } else if (payload.eventType === 'DELETE') {
                    setSurveys(prev => prev.filter(s => s.id !== payload.old.id));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const openModal = useCallback((yokai: SurveyRecord) => {
        setSelectedYokai(yokai);
        // Prevent background scrolling when modal is open
        document.body.style.overflow = 'hidden';
    }, []);

    const closeModal = useCallback(() => {
        setSelectedYokai(null);
        document.body.style.overflow = 'auto';
    }, []);

    if (isLoading) {
        return (
            <div className="collection-loading">
                <div className="generation-wait">読み込み中...</div>
            </div>
        );
    }

    if (error) {
        return <div className="collection-error">Error: {error}</div>;
    }

    return (
        <div data-yokai-zone="collection-main" className="collection-container fade-in">
            <header className="collection-header">
                <h1 className="collection-title">蒐集目録</h1>
                <p className="label" style={{ marginTop: '0.5rem' }}>YOKAI ARCHIVES</p>
                <div className="jp-separator">・</div>
            </header>

            {/* Masonry-like Grid */}
            <div className="yokai-grid">
                {surveys.map(survey => (
                    <div
                        key={survey.id}
                        className="yokai-tile float-up"
                        onClick={() => openModal(survey)}
                    >
                        <div className="tile-image-wrapper">
                            {survey.yokai_image_b64 ? (
                                <img src={survey.yokai_image_b64} alt={survey.yokai_name || ''} loading="lazy" />
                            ) : (
                                <div className="no-image">無形</div>
                            )}
                            <div className="tile-overlay">
                                <div className="tile-name">{survey.yokai_name}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Detail Modal */}
            {selectedYokai && (
                <div className="yokai-modal-backdrop fade-in" onClick={closeModal}>
                    <div className="yokai-modal-content" onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={closeModal}>×</button>

                        <div className="modal-inner">
                            <div className="modal-image-col">
                                <div className="reveal-image-frame ink-bleed-border">
                                    {selectedYokai.yokai_image_b64 && (
                                        <img src={selectedYokai.yokai_image_b64} alt={selectedYokai.yokai_name || ''} />
                                    )}
                                </div>
                                <h2 className="reveal-name ink-spread">{selectedYokai.yokai_name}</h2>
                                <p className="label" style={{ textAlign: 'center', marginTop: '4px' }}>ID: ...{selectedYokai.id.substring(selectedYokai.id.length - 6)}</p>
                            </div>

                            <div className="modal-info-col">
                                <div className="info-section">
                                    <h3 className="section-label">【 縁起 】</h3>
                                    <p className="reveal-narrative" style={{ textAlign: 'left', marginTop: 0, paddingRight: '1rem' }}>
                                        {selectedYokai.yokai_desc || '物語は語られていない...'}
                                    </p>
                                </div>

                                <div className="info-section survey-results">
                                    <h3 className="section-label">【 来訪者記録 】</h3>
                                    <div className="survey-grid">
                                        <div className="survey-item">
                                            <span className="survey-key">属性</span>
                                            <span className="survey-val">{selectedYokai.visitor_type || '—'}</span>
                                        </div>
                                        <div className="survey-item">
                                            <span className="survey-key">出身地</span>
                                            <span className="survey-val">{selectedYokai.pre_origin || '—'}</span>
                                        </div>
                                        <div className="survey-item">
                                            <span className="survey-key">年齢層</span>
                                            <span className="survey-val">{selectedYokai.pre_age || '—'}</span>
                                        </div>
                                        <div className="survey-item">
                                            <span className="survey-key">性別</span>
                                            <span className="survey-val">{selectedYokai.pre_gender || '—'}</span>
                                        </div>
                                        <div className="survey-item">
                                            <span className="survey-key">妖怪観</span>
                                            <span className="survey-val">{PERCEPTION_MAP[selectedYokai.pre_yokai_perception || ''] || selectedYokai.pre_yokai_perception || '—'}</span>
                                        </div>
                                    </div>
                                </div>

                                {selectedYokai.post_completed && (
                                    <div className="info-section survey-results">
                                        <h3 className="section-label">【 体験後記録 】</h3>
                                        {selectedYokai.post_impression && (
                                            <div className="post-impression">
                                                <span className="survey-key d-block">感想・気づき</span>
                                                <p className="survey-val mt-2">「{selectedYokai.post_impression}」</p>
                                            </div>
                                        )}
                                        <div className="survey-grid mt-3">
                                            <div className="survey-item">
                                                <span className="survey-key">主題・テーマ</span>
                                                <span className="survey-val">{selectedYokai.post_theme || '—'}</span>
                                            </div>
                                            <div className="survey-item">
                                                <span className="survey-key">行動変容意欲</span>
                                                <span className="survey-val">{selectedYokai.post_action ? `レベル ${selectedYokai.post_action}` : '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
