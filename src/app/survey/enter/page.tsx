"use client";

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EntrySurvey from '@/components/EntrySurvey';
import '@/app/globals.css';

function SurveyEnterContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isEnglish = searchParams.get('lang') === 'en';
    const ticketPath = useCallback((id: string) => `/survey/ticket/${id}${isEnglish ? '?lang=en' : ''}`, [isEnglish]);
    const [isCheckingSession, setIsCheckingSession] = useState(true);

    // 以前のセッション（ID）が残っていれば復帰する
    useEffect(() => {
        const savedId = localStorage.getItem('yokai_ticket_id');
        if (savedId) {
            router.push(ticketPath(savedId));
        } else {
            setIsCheckingSession(false);
        }
    }, [router, ticketPath]);

    if (isCheckingSession) {
        return (
            <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                <p className="body-text" style={{ opacity: 0.5 }}>{isEnglish ? 'Checking a previous record...' : '以前の記録を確認中...'}</p>
            </div>
        );
    }

    return <EntrySurvey isEnglish={isEnglish} onComplete={id => router.push(ticketPath(id))} />;
}

export default function SurveyEnterPage() {
    return <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#000' }} />}> <SurveyEnterContent /> </Suspense>;
}
