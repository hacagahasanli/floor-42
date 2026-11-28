import { Bungee, Chakra_Petch } from 'next/font/google';

import { GAME_NAME_TITLE } from '~/components/fieldday/brand';
import { SettingsRoot } from '~/components/menu/SettingsRoot';
import { TelemetryInit } from '~/components/TelemetryInit';
import { SHARE_OG, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '~/lib/siteMeta';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const display = Bungee({ weight: '400', subsets: ['latin'], variable: '--font-bungee' });
const ui = Chakra_Petch({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-chakra' });

export const metadata: Metadata = {
  title: { default: SITE_TITLE, template: `%s · ${GAME_NAME_TITLE}` },
  description: SITE_DESCRIPTION,
  applicationName: GAME_NAME_TITLE,
  // Added to the iPhone home screen, it opens full screen with no browser bars.
  appleWebApp: { capable: true, title: GAME_NAME_TITLE, statusBarStyle: 'black-translucent' },
  // The game's own host (nalbaki-games/docs/growth/PEWFIELD-RENAME.md E-1); floor42.nalbakigames.com will 308 here.
  metadataBase: new URL(SITE_URL),
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
  // Share card (growth E-2). Canonical and og:url live on each page (src/lib/siteMeta.ts says why).
  openGraph: SHARE_OG,
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION, images: ['/og.jpg'] },
};

/** Phones: no pinch zoom or double-tap zoom in the middle of a fight; draw under the notch. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // F-068: the brand grape, not the developer-era navy.
  themeColor: '#3B1F6B',
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
