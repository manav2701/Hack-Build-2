import type { Metadata } from 'next';
import './globals.css';
import { ElevenLabsProvider } from '../components/ElevenLabsProvider';

export const metadata: Metadata = {
  title: 'Dalal (دلال) — Voice-First UAE Shopping Agent',
  description: 'AI voice broker that interviews you, scrapes live Noon, Amazon.ae & r/dubai, and delivers a 2-product verdict.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col justify-between">
        <ElevenLabsProvider>{children}</ElevenLabsProvider>
      </body>
    </html>
  );
}
