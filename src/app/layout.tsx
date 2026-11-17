import { Bungee, Chakra_Petch } from 'next/font/google';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const display = Bungee({ weight: '400', subsets: ['latin'], variable: '--font-bungee' });
const ui = Chakra_Petch({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-chakra' });

export const metadata: Metadata = {
  title: { default: 'Floor 42 · Merge Conflict', template: '%s · Floor 42' },
  description: 'Code review got personal. A two-player office shootout from Merge Conflict: settle it on floor 42, two hits and you are out.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className={`${display.variable} ${ui.variable}`}>
    <body className="min-h-screen font-sans">{children}</body>
  </html>
);

export default RootLayout;
