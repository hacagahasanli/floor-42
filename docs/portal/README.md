# CrazyGames portal build

`npm run build:portal` builds `dist/portal` (one static folder, `index.html` at the root, relative paths), checks it
(`scripts/portal-report.mjs`) and zips it to `dist/pewfield-crazygames.zip` (`scripts/portal-zip.mjs`).
`npm run dev:portal` serves it on port 3205; `node scripts/portal-serve.mjs 3215` serves the built folder under
`/games/floor-42/`, as a portal would.

## How it is built

The Next.js site is untouched. `vite.portal.config.ts` bundles the same components from `src/` with `NEXT_PUBLIC_PORTAL=1`
and two small shims (`portal/shims`) for `next/link` and `next/navigation`. Screens are hash routes (`#/`, `#/arena?...`,
`#/play`), so nothing depends on the server path. `portal/App.tsx` is the router, `src/platform/` the SDK adapter.

## Size (measured with `npm run build:portal`)

- 29 files, 1552 KB on disk, 602 KB gzip over the wire, zip 0.58 MB. Limit: 20 MB initial (ideal), 50 MB hard.
- One JS bundle 1170 KB (335 KB gzip), CSS 88 KB, five fonts, seven gun sounds, logo and favicons.

## What the checks cover (`scripts/portal-report.mjs`)

File count and size limits; relative paths only; the only absolute URLs in the code are the CrazyGames SDK script and the
game server of online play; no `nalbakigames.com`, itch.io, GitHub or other portal names; no "Support us"; no developer-joke
settings text. Telemetry is never started on the portal (`TelemetryInit` is not in the portal app and `NEXT_PUBLIC_STATS_URL`
is defined away), so there are no analytics requests.

## CrazyGames SDK v3 (`src/platform/`)

`loadingStart` at boot and `loadingStop` when the first screen has painted; `gameplayStart`/`gameplayStop` only while a round is
really being played (not in the countdown, a pause menu, the results or a demo); the portal's mute setting silences the game.
No ads (Basic Launch). If the SDK script is missing or reports `disabled`, the game uses a no-op adapter and plays the same.

## Differences from the site

- No Support button, no studio links, no "Game words" setting or first-run question (plain words always).
- The Credits page keeps the studio name and logo mark (no link).
- Online play is quick match only: no invite link, room code or "Invite a friend". It still connects to the game server
  `wss://floor42-game.fly.dev` (and WebRTC STUN servers of Google and Cloudflare for the direct link). Solo play against the bot
  needs no network at all.

## Media

- `docs/portal/covers/`: landscape 1920x1080, portrait 800x1200, square 800x800, two fighters (Hotfix, Legacy). Real frames of
  the game's menu scene with the UI hidden, plus the game logo.
- `docs/portal/screens/crazygames-*.png`: four 1920x1080 frames (menu, fighter select, round intro, fight).

## Checked by hand

Served under a sub-path on port 3215, headless Chromium (Playwright): menu, fighter select, a full round against the easy bot
to the results screen; requests only to the local server and `sdk.crazygames.com`; no console errors.
