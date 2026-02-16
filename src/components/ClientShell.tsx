'use client';

import { ReactNode } from 'react';
import { AppProvider } from '@/lib/context';
import FogBackground from '@/components/FogBackground';
import ThemeEngine from '@/components/ThemeEngine';

export default function ClientShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <FogBackground />
      <ThemeEngine />
      {children}
    </AppProvider>
  );
}

