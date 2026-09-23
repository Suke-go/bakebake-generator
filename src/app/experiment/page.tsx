import type { Metadata } from 'next';
import ExperimentClient from './ExperimentClient';

export const metadata: Metadata = {
  title: '体験から伝承を探す | ばけばけ',
  description: '自分の経験から怪異・妖怪伝承を探し、つながりを確かめる試用画面です。',
};

export default function ExperimentPage() {
  return <ExperimentClient />;
}
