'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppProvider } from '@/lib/context';
import FogBackground from '@/components/FogBackground';
import ThemeEngine from '@/components/ThemeEngine';
import YokaiOverlay from '@/components/YokaiOverlay';

export default function ClientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isGenerator = pathname?.startsWith('/generator');

  return (
    <AppProvider>
      <YokaiOverlay />
      {isGenerator && <FogBackground />}
      {isGenerator && <ThemeEngine />}
      {children}
    </AppProvider>
  );
}
