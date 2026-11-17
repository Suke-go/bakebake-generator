'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppProvider } from '@/lib/context';
import FogBackground from '@/components/FogBackground';
import ThemeEngine from '@/components/ThemeEngine';
import YokaiOverlay from '@/components/YokaiOverlay';

export default function ClientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // /demo is the same generator carried on the participant's own phone.
  const isGenerator = pathname?.startsWith('/generator') || pathname?.startsWith('/demo');

  return (
    <AppProvider>
      {pathname !== '/map' && <YokaiOverlay />}
      {isGenerator && <FogBackground />}
      {isGenerator && <ThemeEngine />}
      {children}
    </AppProvider>
  );
}
