import type { Metadata } from 'next';
import { Suspense } from 'react';
import ContactStudyClient from './ContactStudyClient';

export const metadata: Metadata = {
    title: '昔の話と今の体験 | ばけばけ',
    description: '自分の体験と、昔の怪異・妖怪の記録とのつながりを確かめる研究への協力ページです。',
    robots: { index: false, follow: false },
};

export default function ContactStudyPage() {
    return (
        <Suspense fallback={null}>
            <ContactStudyClient />
        </Suspense>
    );
}
