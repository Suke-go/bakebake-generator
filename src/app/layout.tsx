import type { Metadata } from "next";
import "./globals.css";
import ClientShell from "@/components/ClientShell";

export const metadata: Metadata = {
  title: "妖怪生成",
  description: "あなたの体験から、妖怪が生まれる",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <ClientShell>
          {children}
        </ClientShell>
      </body>
    </html>
  );
}
