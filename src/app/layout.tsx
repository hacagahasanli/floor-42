import { Bungee, Chakra_Petch } from 'next/font/google';

import { SettingsRoot } from '~/components/menu/SettingsRoot';
import { STUDIO_NAME } from '~/lib/studio';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const display = Bungee({ weight: '400', subsets: ['latin'], variable: '--font-bungee' });
const ui = Chakra_Petch({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-chakra' });

export const metadata: Metadata = {
  title: { default: `Floor 42 · ${STUDIO_NAME}`, template: '%s · Floor 42' },
  description: `Code review got personal. A two-player office shootout from ${STUDIO_NAME}: settle it on floor 42, two hits and you are out.`,
  // Added to the iPhone home screen, it opens full screen with no browser bars.
  appleWebApp: { capable: true, title: 'Floor 42', statusBarStyle: 'black-translucent' },
  metadataBase: new URL('https://floor42.nalbakigames.com'),
  // Logo and icons from the brand kit (brand/floor-42/INTEGRATE.md).
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
      <SettingsRoot />
      {children}
    </body>
  </html>
);

export default RootLayout;
