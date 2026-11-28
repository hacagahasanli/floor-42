/**
 * Feature switches, one place. Flip a value here and rebuild; nothing else needs to change.
 *
 * ONLINE_ENABLED: online 1v1 (the /play lobby, invite links, quick match) needs the Colyseus server on Fly, which is off
 * while online is parked (Reis, 2026-11-28: no server spend until there is demand). While false, no screen offers online:
 * the home ONLINE button is gone and /play shows the main menu instead of the lobby. The lobby, the net code and the server
 * stay in the repo untouched, so turning it back on is this one line.
 */
export const ONLINE_ENABLED = false as boolean;

/** Online is offered only on the site, never in the portal build (portal is bot and same-keyboard play only). */
export const onlineOffered = (portal: boolean, enabled: boolean = ONLINE_ENABLED): boolean => enabled && !portal;
