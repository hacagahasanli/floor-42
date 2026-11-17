import { Bungee, Chakra_Petch } from 'next/font/google';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const display = Bungee({ weight: '400', subsets: ['latin'], variable: '--font-bungee' });
const ui = Chakra_Petch({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-chakra' });

export const metadata: Metadata = {
  title: { default: 'Merge Conflict', template: '%s | Merge Conflict' },
  description: 'A two-player office shootout on floor 42. Keep it quiet, or the CTO comes out.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className={`${display.variable} ${ui.variable}`}>
    <body className="min-h-screen font-sans">{children}</body>
  </html>
);

export default RootLayout;
