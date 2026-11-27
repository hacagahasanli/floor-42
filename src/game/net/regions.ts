/**
 * Multi-region support, off by default.
 *
 * Today there is one game server (Fly region fra) and every player connects to it. With
 * NEXT_PUBLIC_GAME_REGIONS set, the client probes each region's /ping, connects to the nearest and
 * quick match only pairs players in the same latency tier. Unset, nothing here runs and the game
 * behaves exactly as before. How to turn it on and what it costs: docs/TECHNICAL.md, "Regions".
 *
 * Why one Fly app per region: a browser cannot choose a region. fly-prefer-region is a request
 * header and a WebSocket upgrade from a page cannot set headers; fly-replay is a response header
 * the app would have to send, and Fly's docs do not promise that it works for a WebSocket upgrade.
 * A hostname per region (one small app each, same image) needs neither and is how the SDK's own
 * Client.selectByLatency expects endpoints to be given.
 */

export interface Region {
  id: string;
  /** The game server, ws:// or wss://. */
  url: string;
}

/** "fra=wss://floor42-game.fly.dev,iad=wss://floor42-game-iad.fly.dev" -> regions. Garbage entries are skipped. */
export const parseRegions = (spec: string | undefined): Region[] => {
  if (!spec) return [];
  const out: Region[] = [];
  for (const part of spec.split(',')) {
    const [id, url] = part.trim().split('=');
    if (id && url && /^wss?:\/\//.test(url) && /^[a-z0-9-]{2,12}$/.test(id)) out.push({ id, url });
  }
  return out;
};

export const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

export interface Probe {
  id: string;
  /** Round trip in ms; Infinity when the region did not answer. */
  rtt: number;
}

type Fetch = (url: string, init?: { cache?: 'no-store'; signal?: AbortSignal }) => Promise<{ ok: boolean }>;

/**
 * Round trip to each region: one warm-up request (DNS, TLS), then the best of `samples`. All
 * regions are probed at once; a region that does not answer within `timeoutMs` is out.
 */
export const probeRegions = async (
  regions: Region[],
  fetchFn: Fetch = (u, i) => fetch(u, i),
  now: () => number = () => performance.now(),
  samples = 3,
  timeoutMs = 2500,
): Promise<Probe[]> =>
  Promise.all(
    regions.map(async (r): Promise<Probe> => {
      const once = async () => {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        const t0 = now();
        try {
          const res = await fetchFn(`${httpUrl(r.url)}/ping?t=${Math.random().toString(36).slice(2)}`, { cache: 'no-store', signal: ctl.signal });
          return res.ok ? now() - t0 : Infinity;
        } catch {
          return Infinity;
        } finally {
          clearTimeout(timer);
        }
      };
      if ((await once()) === Infinity) return { id: r.id, rtt: Infinity };
      let best = Infinity;
      for (let i = 0; i < samples; i++) best = Math.min(best, await once());
      return { id: r.id, rtt: Math.round(best) };
    }),
  );

/** The region with the lowest round trip, or null when none answered. Ties go to the first listed. */
export const nearest = (probes: Probe[]): Probe | null => {
  let best: Probe | null = null;
  for (const p of probes) if (Number.isFinite(p.rtt) && (!best || p.rtt < best.rtt)) best = p;
  return best;
};

/**
 * The round trip a player accepts to the server, by how long they have waited for a rival: 60 ms
 * at first (the owner's target), then wider. Quick match pairs only players in the same tier.
 * Widening while waiting needs the lobby to retry with the next tier: not wired yet.
 */
export const BUDGET_STEPS: { afterMs: number; rtt: number }[] = [
  { afterMs: 0, rtt: 60 },
  { afterMs: 8_000, rtt: 100 },
  { afterMs: 20_000, rtt: 150 },
  { afterMs: 40_000, rtt: Infinity },
];

export const budgetAt = (waitedMs: number): number => {
  let rtt = BUDGET_STEPS[0].rtt;
  for (const s of BUDGET_STEPS) if (waitedMs >= s.afterMs) rtt = s.rtt;
  return rtt;
};

/** The matching tier of a player: the smallest budget step that admits their round trip (0: beyond every step, matches anyone). */
export const tierFor = (rtt: number): number => {
  for (const s of BUDGET_STEPS) if (s.rtt >= rtt) return Number.isFinite(s.rtt) ? s.rtt : 0;
  return 0;
};
