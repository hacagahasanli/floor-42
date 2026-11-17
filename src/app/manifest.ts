import type { MetadataRoute } from 'next';

/**
 * Installable as an app. On iPhone that's the only way to play without the browser bars:
 * Share -> Add to Home Screen, then open Floor 42 from the home screen. No start_url, so the
 * page you add it from is the one that opens.
 */
const manifest = (): MetadataRoute.Manifest => ({
  name: 'Floor 42 · Merge Conflict',
  short_name: 'Floor 42',
  description: 'A two-player office shootout. Two hits and you are out.',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#0a0d18',
  theme_color: '#0a0d18',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
});

export default manifest;
