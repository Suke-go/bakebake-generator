'use client';

import { ReactNode } from 'react';
import { AppProvider } from '@/lib/context';
import FogBackground from '@/components/FogBackground';

export default function ClientShell({ children }: { children: ReactNode }) {
    return (
        <AppProvider>
            <FogBackground />
            {children}
        </AppProvider>
    );
}

