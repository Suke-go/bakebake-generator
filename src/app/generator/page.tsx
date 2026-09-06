'use client';

import { useApp } from '@/lib/context';
import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Phase0 from '@/components/Phase0';
import Phase1 from '@/components/Phase1';
import Phase1Prime from '@/components/Phase1Prime';
import Phase2 from '@/components/Phase2';
import Phase3 from '@/components/Phase3';
import Phase3Reveal from '@/components/Phase3Reveal';
import ResearchLogger from '@/components/ResearchLogger';
import { importResearchTokenFromHash, subscribeResearchLogErrors } from '@/lib/research-log';

const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3分

/**
 * Phase transition: fade out → darkness → fade in
 * Uses phaseKey (number) to detect transitions, not children reference
 */
function PhaseTransition({ phaseKey }: { phaseKey: number }) {
  const [visible, setVisible] = useState(false);
  const [displayedPhase, setDisplayedPhase] = useState(phaseKey);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      // First mount — just fade in
      isFirstRender.current = false;
      const t = setTimeout(() => setVisible(true), 100);
      return () => clearTimeout(t);
    }

    // Phase changed — fade out, swap, fade in
    setVisible(false);
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    const t = setTimeout(() => {
      setDisplayedPhase(phaseKey);
      showTimer = setTimeout(() => setVisible(true), 150);
    }, 500);
    return () => {
      clearTimeout(t);
      if (showTimer) clearTimeout(showTimer);
    };
  }, [phaseKey]);

  const content = (() => {
    switch (displayedPhase) {
      case 0: return <Phase0 />;
      case 1: return <Phase1 />;
      case 1.5: return <Phase1Prime />;
      case 2: return <Phase2 />;
      case 3: return <Phase3 />;
      case 3.5: return <Phase3Reveal />;
      default: return <Phase0 />;
    }
  })();

  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transition: `opacity ${visible ? '0.8s' : '0.4s'} ease`,
      width: '100%',
      height: '100%',
    }}>
      {content}
    </div>
  );
}

/**
 * 戻るボタン（左上のゴーストボタン）
 * Phase 0 以外で表示。タップで1つ前の Phase、長押しで Phase 0 へリセット。
 */
function BackButton({ phase, onBack, onReset }: {
  phase: number;
  onBack: () => void;
  onReset: () => void;
}) {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (phase === 0) return null;

  const handlePointerDown = () => {
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      onReset();
    }, 1500);
  };

  const handlePointerUp = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
      onBack();
    }
  };

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        if (longPressRef.current) clearTimeout(longPressRef.current);
      }}
      style={{
        position: 'fixed',
        top: 18,
        left: 18,
        zIndex: 100,
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        color: 'var(--text-ghost)',
        fontSize: 18,
        opacity: 0.5,
        cursor: 'pointer',
        transition: 'opacity 0.3s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
      aria-label="戻る"
    >
      ←
    </button>
  );
}

function LanguageToggle({ locale, onChange }: { locale: 'ja' | 'en'; onChange: (locale: 'ja' | 'en') => void }) {
  return <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 100, display: 'flex', gap: 6 }}>
    <button type="button" className="button" aria-pressed={locale === 'ja'} onClick={() => onChange('ja')}>日本語</button>
    <button type="button" className="button" aria-pressed={locale === 'en'} onClick={() => onChange('en')}>English</button>
  </div>;
}

/**
 * Phase の逆引きマップ（1つ前の Phase を返す）
 */
function getPreviousPhase(current: number): number {
  if (current <= 0) return 0;
  if (current <= 1) return 0;
  if (current <= 1.5) return 1;
  if (current <= 2) return 1.5;
  if (current <= 3) return 2;
  if (current <= 3.5) return 3;
  return 0;
}

function GeneratorContent() {
  const { state, goToPhase, resetState, setLocale, setTicketId, backOverrideRef } = useApp();
  const searchParams = useSearchParams();
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [researchLogFailed, setResearchLogFailed] = useState(false);
  const autoStartedTicketRef = useRef<string | null>(null);
  const resetToReception = useCallback(() => {
    const suffix = state.locale === 'en' ? '?lang=en' : '';
    window.history.replaceState(null, '', `/generator${suffix}`);
    resetState();
  }, [resetState, state.locale]);

  useEffect(() => {
    const requestedLocale = searchParams.get('lang');
    if (requestedLocale === 'en' || requestedLocale === 'ja') setLocale(requestedLocale);
  }, [searchParams, setLocale]);

  useEffect(() => {
    const requestedLocale = searchParams.get('lang');
    const localeFromUrl = requestedLocale === 'en' || requestedLocale === 'ja' ? requestedLocale : null;
    const ticketId = searchParams.get('id');
    if (ticketId && ticketId.length >= 10) {
      // A reset returns to Phase 0 in this mounted generator. Do not reopen
      // the same ticket merely because its original QR query remains in URL.
      if (autoStartedTicketRef.current === ticketId) return;
      autoStartedTicketRef.current = ticketId;
      if (state.ticketId !== ticketId) {
        // A different QR always starts a new participant session; otherwise
        // a persisted prior work could be attributed to the new ticket.
        const locale = localeFromUrl ?? state.locale;
        resetState();
        setLocale(locale);
        setTicketId(ticketId);
        importResearchTokenFromHash(ticketId);
        goToPhase(1);
        return;
      }
      setTicketId(ticketId);
      importResearchTokenFromHash(ticketId);
      if (state.currentPhase === 0) goToPhase(1);
    }
  }, [searchParams, resetState, setLocale, setTicketId, goToPhase, state.currentPhase, state.locale, state.ticketId]);

  useEffect(() => subscribeResearchLogErrors(() => setResearchLogFailed(true)), []);

  // #4: overflow hidden を generator ルートだけに適用
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Wake Lock — 展示端末のスリープ防止
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try { wakeLock = await (navigator as any).wakeLock.request('screen'); } catch { }
      }
    };
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (wakeLock !== null) wakeLock.release().then(() => { wakeLock = null; });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // #7: アイドルタイムアウト（Phase 0 以外で3分操作なし → Phase 0 にリセット）
  // 残り30秒で警告表示、操作があれば延長
  const WARNING_BEFORE_MS = 30 * 1000;

  useEffect(() => {
    if (state.currentPhase === 0) {
      setShowIdleWarning(false);
      return;
    }

    let warningTimer: ReturnType<typeof setTimeout>;
    let resetTimer: ReturnType<typeof setTimeout>;

    const startTimers = () => {
      setShowIdleWarning(false);
      warningTimer = setTimeout(() => {
        setShowIdleWarning(true);
        resetTimer = setTimeout(resetToReception, WARNING_BEFORE_MS);
      }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
    };

    startTimers();

    const handleActivity = () => {
      clearTimeout(warningTimer);
      clearTimeout(resetTimer);
      startTimers();
    };

    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      clearTimeout(warningTimer);
      clearTimeout(resetTimer);
      setShowIdleWarning(false);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [state.currentPhase, resetToReception]);

  // #6: 戻るボタンのハンドラー
  const handleBack = useCallback(() => {
    if (backOverrideRef.current?.()) return;
    goToPhase(getPreviousPhase(state.currentPhase));
  }, [state.currentPhase, goToPhase, backOverrideRef]);

  const handleReset = useCallback(() => {
    resetToReception();
  }, [resetToReception]);

  return (
    <div data-yokai-zone="generator-main">
      <BackButton
        phase={state.currentPhase}
        onBack={handleBack}
        onReset={handleReset}
      />
      <ResearchLogger />
      {state.currentPhase !== 0 && state.currentPhase !== 1 && <LanguageToggle locale={state.locale} onChange={setLocale} />}
      <PhaseTransition phaseKey={state.currentPhase} />
      {researchLogFailed && <p style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 200, color: 'var(--text-ghost)', fontSize: 11, textAlign: 'center' }}>
        {state.locale === 'en' ? 'Your research record could not be saved. You can continue the experience.' : '研究用の記録を保存できませんでした。体験は続けられます。'}
      </p>}
      {showIdleWarning && (
        <div style={{
          position: 'fixed',
          bottom: 48,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          fontFamily: 'var(--font-main)',
          fontSize: 13,
          color: 'var(--text-dim)',
          letterSpacing: '0.1em',
          textAlign: 'center',
          animation: 'breathe 2s ease-in-out infinite',
        }}>
          操作がありません。30秒後にリセットします
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return <Suspense fallback={<div data-yokai-zone="generator-loading" />}><GeneratorContent /></Suspense>;
}
