import { Bungee, Chakra_Petch } from 'next/font/google';

import { GAME_NAME_TITLE } from '~/components/fieldday/brand';
import { SettingsRoot } from '~/components/menu/SettingsRoot';
import { TelemetryInit } from '~/components/TelemetryInit';
import { COPY } from '~/game/copy';
import { STUDIO_NAME } from '~/lib/studio';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const display = Bungee({ weight: '400', subsets: ['latin'], variable: '--font-bungee' });
const ui = Chakra_Petch({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-chakra' });

export const metadata: Metadata = {
  title: { default: `${GAME_NAME_TITLE} — 1v1 shootout · ${STUDIO_NAME}`, template: `%s · ${GAME_NAME_TITLE}` },
  description: `${COPY.tagline} A two-player shootout from ${STUDIO_NAME}: first to five KOs.`,
  // Added to the iPhone home screen, it opens full screen with no browser bars.
  appleWebApp: { capable: true, title: GAME_NAME_TITLE, statusBarStyle: 'black-translucent' },
  // The address stays floor42.nalbakigames.com until the deploy step moves it (pewfield.nalbakigames.com is planned, see the brand README).
  metadataBase: new URL('https://floor42.nalbakigames.com'),
  // Logo and icons: Pewfield logo concept A (docs/collab/CREATIVE/brand), exported by tools/brand/export-pewfield.mjs.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  manifest: '/site.webmanifest',
  openGraph: { images: [{ url: '/og.jpg', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', images: ['/og.jpg'] },
};

/** Phones: no pinch zoom or double-tap zoom in the middle of a fight; draw under the notch. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0B0F1E',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className={`${display.variable} ${ui.variable}`}>
    <body className="min-h-screen font-sans">
      <TelemetryInit />
      <SettingsRoot />
      {children}
    </body>
  </html>
);

export default RootLayout;
