/**
 * Feature switches, one place. Flip a value here and rebuild; nothing else needs to change.
 *
 * ONLINE_ENABLED: online 1v1 (the /play lobby, invite links, quick match) needs the Colyseus server on Fly, which is off
 * while online is parked (Reis, 2026-11-28: no server spend until there is demand). While false, no screen offers online:
 * the home ONLINE button is gone and /play shows the main menu instead of the lobby. The lobby, the net code and the server
 * stay in the repo untouched, so turning it back on is this one line.
 */
// Off unless the build sets NEXT_PUBLIC_ONLINE=1 (online-bots local testing: `NEXT_PUBLIC_ONLINE=1 npm run dev`). Turning it on
// for real is one env var on Vercel after the Fly server is deployed (docs/online/2026-11-28-matchmaking.md).
export const ONLINE_ENABLED = process.env.NEXT_PUBLIC_ONLINE === '1';

/** Online is offered only on the site, never in the portal build (portal is bot and same-keyboard play only). */
export const onlineOffered = (portal: boolean, enabled: boolean = ONLINE_ENABLED): boolean => enabled && !portal;
