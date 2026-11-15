import type { Metadata } from 'next';
import HyakkiExp from '@/components/hyakki/HyakkiExp';

export const metadata: Metadata = { title: '百鬼夜行 ためし遊び', robots: { index: false } };

export default function Page() {
    return <HyakkiExp />;
}
