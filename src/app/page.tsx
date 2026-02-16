'use client';

import { useApp } from '@/lib/context';
import { useState, useEffect, useRef } from 'react';
import Phase0 from '@/components/Phase0';
import Phase1 from '@/components/Phase1';
import Phase1Prime from '@/components/Phase1Prime';
import Phase2 from '@/components/Phase2';
import Phase3 from '@/components/Phase3';
import Phase3Reveal from '@/components/Phase3Reveal';

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

export default function Home() {
  const { state } = useApp();
  return <PhaseTransition phaseKey={state.currentPhase} />;
}
