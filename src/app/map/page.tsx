import type { Metadata } from 'next';
import YokaiMap from '@/components/YokaiMap';
import 'maplibre-gl/dist/maplibre-gl.css';

export const metadata: Metadata = {
  title: 'Yokai Map | BAKEBAKE XR',
  description: 'Geographic distribution map for yokai folklore records.',
};

export default function MapPage() {
  return <YokaiMap />;
}
