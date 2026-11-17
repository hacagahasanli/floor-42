import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Merge Conflict', template: '%s | Merge Conflict' },
  description: 'A fast two-player office fighting game on floor 42. Settle the conflict.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body className="min-h-screen font-sans">{children}</body>
  </html>
);

export default RootLayout;
