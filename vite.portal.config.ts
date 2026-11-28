/**
 * The portal build: one static folder (dist/portal) with relative paths, hash routes, solo play against the bot, no stats,
 * no support link and no outbound links. `npm run build:portal` builds and checks it, then zips it for CrazyGames.
 * `npm run dev:portal` serves it on port 3205. The site (Next.js) is untouched: the portal imports the same components
 * through small shims for `next/link` and `next/navigation`.
 */
import { cpSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

import { GAME_NAME_TITLE } from './src/components/fieldday/brand';
import { WORDMARK_INNER, WORDMARK_VIEWBOX } from './src/components/fieldday/wordmarkArt';
import { STUDIO_NAME } from './src/lib/studio';

const out = path.resolve(__dirname, 'dist/portal');

export default defineConfig({
  root: path.resolve(__dirname, 'portal'),
  base: './',
  // Favicons, the logo and the studio mark, copied next to index.html. Sounds are copied from public/assets below.
  publicDir: path.resolve(__dirname, 'portal/static'),
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: path.resolve(__dirname, 'portal/shims/link.tsx') },
      { find: /^next\/navigation$/, replacement: path.resolve(__dirname, 'portal/shims/navigation.ts') },
      { find: '~', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  esbuild: { jsx: 'automatic' },
  css: { postcss: __dirname },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'process.env.NEXT_PUBLIC_PORTAL': JSON.stringify('1'),
    'process.env.NEXT_PUBLIC_STATS_URL': 'undefined',
    'process.env.NEXT_PUBLIC_BUILD': 'undefined',
    'process.env.NEXT_PUBLIC_GAME_SERVER': JSON.stringify(process.env.PORTAL_GAME_SERVER ?? 'wss://floor42-game.fly.dev'),
    'process.env.NEXT_PUBLIC_TURN_URL': 'undefined',
    'process.env.NEXT_PUBLIC_TURN_USERNAME': 'undefined',
    'process.env.NEXT_PUBLIC_TURN_CREDENTIAL': 'undefined',
  },
  server: { port: 3205, fs: { allow: [__dirname] } },
  preview: { port: 3206 },
  plugins: [
    {
      // The boot screen's wordmark, studio pill and page title come from the same constants as the app (brand.ts, studio.ts),
      // so the rename (R-023) is one edit.
      name: 'boot-wordmark',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => {
          // The logo artwork at the home screen's slot size x 1.25 (height 200, width 461.5; F-057 slot 160 high), as inline SVG: no font to wait for.
          const mark = `<div class="wmw"><h1 class="wm"><svg viewBox="${WORDMARK_VIEWBOX}" role="img" aria-label="${GAME_NAME_TITLE}">${WORDMARK_INNER}</svg></h1></div>`;
          return html.replace('<!--FD_WORDMARK-->', mark).replace('<!--FD_STUDIO-->', STUDIO_NAME).replace('%GAME_TITLE%', `${GAME_NAME_TITLE} \u2014 1v1 shootout`);
        },
      },
    },
    {
      // 'use client' marks components for Next.js; it means nothing here.
      name: 'strip-use-client',
      enforce: 'pre',
      transform: (code, id) => (id.includes('/src/') && /^'use client';/.test(code) ? { code: code.replace(/^'use client';/, ''), map: null } : null),
    },
    {
      // The dev server serves public/assets at ./assets/; the build copies it next to index.html.
      name: 'game-assets',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/assets/sounds/')) req.url = `/@fs${path.resolve(__dirname, 'public')}${req.url.split('?')[0]}`;
          next();
        });
      },
      closeBundle() {
        cpSync(path.resolve(__dirname, 'public/assets'), path.join(out, 'assets'), { recursive: true });
        // The OFL texts of the self-hosted fonts ship with the build (Field Day spec section 8).
        cpSync(path.resolve(__dirname, 'public/licenses'), path.join(out, 'licenses'), { recursive: true });
      },
    },
  ],
  build: {
    outDir: out,
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { onwarn: (w, warn) => (w.code === 'MODULE_LEVEL_DIRECTIVE' ? undefined : warn(w)) },
  },
});
