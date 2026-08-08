import type { Metadata } from 'next';
import './globals.css';
import { ElevenLabsProvider } from '../components/ElevenLabsProvider';
import { AuthProvider } from '../components/AuthProvider';

export const metadata: Metadata = {
  title: 'DaleelBites — UAE Voice Food Broker',
  description:
    'Speak a craving. DaleelBites compares it live across Talabat, Deliveroo and Noon Food, then hands you the order page.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Clash Display (headlines) + Satoshi (body) from Fontshare. Preconnect first so
            the display face is not the thing holding up first paint; the Tailwind stacks
            fall back to system faces if the host is blocked. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-raw-base text-raw-ink">
        <AuthProvider>
          <ElevenLabsProvider>{children}</ElevenLabsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
