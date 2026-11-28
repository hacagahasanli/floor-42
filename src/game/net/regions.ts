/**
 * Game server regions.
 *
 * Today there is one game server (Fly region fra). With NEXT_PUBLIC_GAME_REGIONS set to more than one region, the
 * client probes each region's /ping and quick match searches the nearest first, then the nearest other one, then
 * seats a bot at home (matchmaking.ts). Adding a region is config only: deploy the same image as another Fly app and
 * add `id=wss://host` to the list. How and what it costs: docs/online/2026-11-28-matchmaking.md.
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

/** Median; Infinity counts as a very slow answer (one lost sample does not knock a region out). */
export const median = (xs: number[]): number => {
  if (!xs.length) return Infinity;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

export interface Probe {
  id: string;
  /** Round trip in ms; Infinity when the region did not answer. */
  rtt: number;
}

type Fetch = (url: string, init?: { cache?: 'no-store'; signal?: AbortSignal }) => Promise<{ ok: boolean }>;

/**
 * Round trip to each region, measured (never a geo guess): one warm-up request (DNS, TLS, and on Fly the machine
 * start), then the MEDIAN of `samples`. All regions are probed at once; one region's samples go one after the other
 * on the warm connection (parallel requests to one host would open new TLS connections and time the handshakes).
 * A region that does not answer within `timeoutMs` is out.
 */
export const probeRegions = async (
  regions: Region[],
  fetchFn: Fetch = (u, i) => fetch(u, i),
  now: () => number = () => performance.now(),
  samples = 4,
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
      const got: number[] = [];
      for (let i = 0; i < samples; i++) got.push(await once());
      return { id: r.id, rtt: Math.round(median(got)) };
    }),
  );

/** The region with the lowest round trip, or null when none answered. Ties go to the first listed. */
export const nearest = (probes: Probe[]): Probe | null => {
  let best: Probe | null = null;
  for (const p of probes) if (Number.isFinite(p.rtt) && (!best || p.rtt < best.rtt)) best = p;
  return best;
};
