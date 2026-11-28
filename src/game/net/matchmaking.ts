/**
 * Quick match that never leaves a player waiting (owner decision 2026-11-28, docs/online/2026-11-28-matchmaking.md).
 *
 *   1. Search the player's own region (the nearest by round trip) for a waiting human.
 *   2. Nothing after HOME_WAIT_MS: search the nearest other region (when there is one).
 *   3. Still nothing: back to the home region, where the server seats its bot if no human turned up meanwhile.
 *      The bot is due BOT_DUE_MS after the search started, whatever the connects cost.
 *
 * With one region (today: fra) steps 1 and 3 are the same room: join it once with the bot due at BOT_DUE_MS.
 *
 * The plan is pure; the runner takes its network and clock as arguments, so both are unit-tested with fake ones.
 */
import type { Probe, Region } from './regions';

export const MATCH_TIMING = {
  /** How long the home region is searched before trying the next region (multi-region only). */
  HOME_WAIT_MS: 4_000,
  /** How long the nearest other region is searched. */
  FALLBACK_WAIT_MS: 3_000,
  /** Total wait (from pressing Quick match) after which the server bot joins. The owner's target is 8-10 s. */
  BOT_DUE_MS: 8_500,
  /** Never ask the server for a bot sooner than this after joining a room: a human who is joining right now still wins. */
  MIN_BOT_WAIT_MS: 400,
  /** The server never waits longer than this for a bot, whatever a client asks (and caps abuse of the option). */
  MAX_BOT_WAIT_MS: 20_000,
  /**
   * A fallback region is tried only if its round trip is at most this much over the home region's. Further than that,
   * a human match would feel laggy, so the player gets the bot in their own region instead (owner, 2026-11-28:
   * latency first).
   */
  FALLBACK_RTT_CAP_MS: 60,
} as const;

export type LegKind = 'home' | 'fallback' | 'bot';

export interface Leg {
  kind: LegKind;
  region: Region;
  /** End this leg (leave the room, go on) this long after the SEARCH started; null = stay (the bot leg). */
  untilMs: number | null;
  /** Ask the server for a bot (the bot leg only). */
  bot: boolean;
}

/**
 * The search, in order. `probes` are the round trips to each region (Infinity = did not answer); with no probes (one
 * region, nothing measured) the first region is home. Regions that did not answer are left out; if none answered, the
 * first listed is still tried (the probe route may be what failed).
 */
export const planSearch = (regions: Region[], probes: Probe[] = [], timing = MATCH_TIMING): Leg[] => {
  if (!regions.length) return [];
  const rtt = (id: string) => probes.find((p) => p.id === id)?.rtt ?? (probes.length ? Infinity : 0);
  const ranked = regions
    .map((region, i) => ({ region, i, rtt: rtt(region.id) }))
    .filter((r) => Number.isFinite(r.rtt))
    .sort((a, b) => a.rtt - b.rtt || a.i - b.i);
  const home = ranked[0]?.region ?? regions[0];
  const homeRtt = ranked[0]?.rtt ?? 0;
  const next = ranked.find((r) => r.region.id !== home.id && r.rtt <= homeRtt + timing.FALLBACK_RTT_CAP_MS)?.region;
  if (!next) return [{ kind: 'bot', region: home, untilMs: null, bot: true }];
  return [
    { kind: 'home', region: home, untilMs: timing.HOME_WAIT_MS, bot: false },
    { kind: 'fallback', region: next, untilMs: timing.HOME_WAIT_MS + timing.FALLBACK_WAIT_MS, bot: false },
    { kind: 'bot', region: home, untilMs: null, bot: true },
  ];
};

/** The bot delay to send with a bot-leg join, `elapsedMs` after the search started. */
export const botDelayFor = (elapsedMs: number, timing = MATCH_TIMING) =>
  Math.round(Math.min(timing.MAX_BOT_WAIT_MS, Math.max(timing.MIN_BOT_WAIT_MS, timing.BOT_DUE_MS - elapsedMs)));

/** What the server may accept as the bot delay a client asked for (undefined: no bot). */
export const clampBotDelay = (v: unknown, timing = MATCH_TIMING): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(timing.MAX_BOT_WAIT_MS, Math.max(0, v)) : undefined;

export interface MatchDeps<R> {
  /** Join (or create) a public quick-match room in a region; `botAfterMs` set only on the bot leg. */
  join: (region: Region, botAfterMs: number | undefined) => Promise<R>;
  /** Resolves when this room has a match (a human rival found, or the bot seated). */
  matched: (room: R) => Promise<unknown>;
  leave: (room: R) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** The search was cancelled (the player pressed Cancel): stop and leave. */
  cancelled?: () => boolean;
  /** When the player pressed Quick match (deps.now() clock): the bot is due BOT_DUE_MS after it, probes included. */
  startedAt?: number;
  /** Each leg as it starts, for the lobby's status line. */
  onLeg?: (leg: Leg) => void;
}

export interface MatchResult<R> {
  room: R;
  leg: Leg;
}

export class SearchCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/**
 * Runs the legs in order. A leg that fails to connect is skipped (the bot leg falls back to any region that worked:
 * a player is never left with nothing because one region is down). Throws the last error if no leg could connect.
 */
export const runQuickMatch = async <R>(legs: Leg[], deps: MatchDeps<R>): Promise<MatchResult<R>> => {
  const t0 = deps.startedAt ?? deps.now();
  const elapsed = () => deps.now() - t0;
  let lastError: unknown = new Error('no region to search');
  const worked: Region[] = [];
  const queue = [...legs];
  while (queue.length) {
    const leg = queue.shift()!;
    if (deps.cancelled?.()) throw new SearchCancelled();
    deps.onLeg?.(leg);
    let room: R;
    try {
      room = await deps.join(leg.region, leg.bot ? botDelayFor(elapsed()) : undefined);
    } catch (e) {
      lastError = e;
      // The bot leg's region is down: try it in a region that answered earlier in this search.
      if (leg.bot && worked.length && !queue.length) {
        const alt = worked.find((r) => r.id !== leg.region.id);
        if (alt) queue.push({ ...leg, region: alt });
      }
      continue;
    }
    worked.push(leg.region);
    if (deps.cancelled?.()) {
      deps.leave(room);
      throw new SearchCancelled();
    }
    if (leg.untilMs === null) {
      await deps.matched(room);
      return { room, leg };
    }
    const left = Math.max(0, leg.untilMs - elapsed());
    let found = false;
    const match = deps.matched(room).then(() => {
      found = true;
    });
    await Promise.race([match, deps.sleep(left)]);
    if (found) return { room, leg };
    deps.leave(room);
  }
  throw lastError;
};
