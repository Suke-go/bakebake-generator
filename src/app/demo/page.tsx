'use client';

import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useApp, type Locale } from '@/lib/context';
import EntrySurvey from '@/components/EntrySurvey';
import OfudaDoor from '@/components/OfudaDoor';
import GeneratorFlow from '@/components/GeneratorFlow';

/**
 * /demo — the whole experience on one smartphone.
 *
 * language → consent and entry questions → the ofuda opens the door →
 * the yokai-making phases, all on this device. No exhibition terminal or QR
 * scan is involved; submitting the exit survey prints the yokai at the booth.
 */

type Stage = 'language' | 'survey' | 'door';

const TICKET_KEY = 'yokai_ticket_id';

const subscribeNothing = () => () => {};

function LanguageSelect({ onSelect }: { onSelect: (locale: Locale) => void }) {
    return (
        <div data-yokai-zone="demo-language" style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2.2rem',
            padding: '2rem 1.5rem',
            textAlign: 'center',
        }}>
            <Image src="/bakebake-logo.png" alt="BAKEBAKE XR" width={132} height={132} priority style={{ objectFit: 'contain' }} />
            <p className="title-text" style={{ fontSize: '1.05rem', lineHeight: 2.1, fontWeight: 400 }}>
                言語を選んでください<br />
                <span lang="en" style={{ opacity: 0.7, letterSpacing: '0.08em' }}>Choose your language</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: 300 }}>
                <button type="button" className="interactive-button" style={{ padding: '1.2rem', fontSize: '1.15rem', letterSpacing: '0.2em' }} onClick={() => onSelect('ja')}>
                    日本語
                </button>
                <button type="button" lang="en" className="interactive-button" style={{ padding: '1.2rem', fontSize: '1.15rem', letterSpacing: '0.08em' }} onClick={() => onSelect('en')}>
                    English
                </button>
            </div>
        </div>
    );
}

function DemoContent() {
    const { state, setLocale, setTicketId, goToPhase } = useApp();
    // The persisted phase is only known in the browser.
    const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
    const [stage, setStage] = useState<Stage>('language');
    const [resumed, setResumed] = useState(false);
    const isEnglish = state.locale === 'en';
    const inGenerator = state.currentPhase !== 0;

    // Leaving the generator (back from the first phase, or a reset) returns to
    // the entrance rather than to a door that has already been opened.
    const [wasInGenerator, setWasInGenerator] = useState(inGenerator);
    if (wasInGenerator !== inGenerator) {
        setWasInGenerator(inGenerator);
        if (!inGenerator) setStage('language');
    }

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [stage]);

    const chooseLanguage = useCallback((locale: Locale) => {
        setLocale(locale);
        // A phone that already answered the questions keeps its ofuda.
        let savedId: string | null = null;
        try { savedId = localStorage.getItem(TICKET_KEY); } catch { /* storage unavailable */ }
        if (savedId) {
            setTicketId(savedId);
            setResumed(true);
            setStage('door');
        } else {
            setResumed(false);
            setStage('survey');
        }
    }, [setLocale, setTicketId]);

    const startAsSomeoneElse = useCallback(() => {
        try { localStorage.removeItem(TICKET_KEY); } catch { /* storage unavailable */ }
        setResumed(false);
        setStage('survey');
    }, []);

    if (!mounted) return <div style={{ minHeight: '100dvh' }} />;

    if (inGenerator) return <GeneratorFlow standalone />;

    if (stage === 'language') return <LanguageSelect onSelect={chooseLanguage} />;

    if (stage === 'survey') {
        return (
            <EntrySurvey
                isEnglish={isEnglish}
                onComplete={id => {
                    setTicketId(id);
                    setStage('door');
                }}
            />
        );
    }

    return (
        <OfudaDoor
            isEnglish={isEnglish}
            onOpened={() => goToPhase(1)}
            onStartAsSomeoneElse={resumed ? startAsSomeoneElse : undefined}
        />
    );
}

export default function DemoPage() {
    return <Suspense fallback={<div style={{ minHeight: '100dvh' }} />}><DemoContent /></Suspense>;
}
