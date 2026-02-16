import type { Metadata } from 'next';
import './globals.css';
import ClientShell from '@/components/ClientShell';

export const metadata: Metadata = {
  title: 'ばけばけ発生器',
  description: 'あなたの体験から、まだ名のない気配を編む。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}