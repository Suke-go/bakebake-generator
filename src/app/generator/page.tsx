'use client';

import { Suspense } from 'react';
import GeneratorFlow from '@/components/GeneratorFlow';

export default function Home() {
  return <Suspense fallback={<div data-yokai-zone="generator-loading" />}><GeneratorFlow /></Suspense>;
}
