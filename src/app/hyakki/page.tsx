import type { Metadata } from 'next';
import Hyakki from '@/components/hyakki/Hyakki';

export const metadata: Metadata = {
  title: 'Hyakki Yagyo | BAKEBAKE XR',
  description: 'Pick five yokai from your region and call the night parade of one hundred.',
};

export default function HyakkiPage() {
  return <Hyakki />;
}
