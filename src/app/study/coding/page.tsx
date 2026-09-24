import type { Metadata } from 'next';
import { Suspense } from 'react';
import CodingClient from './CodingClient';

export const metadata: Metadata = {
    title: '記録のコーディング | ばけばけ',
    description: '怪異・妖怪の記録の読み取りを、民俗学の研究者にお願いするページです。',
    robots: { index: false, follow: false },
};

export default function CodingPage() {
    return (
        <Suspense fallback={null}>
            <CodingClient />
        </Suspense>
    );
}
