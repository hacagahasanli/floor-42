import { botDelayFor, clampBotDelay, MATCH_TIMING, planSearch, runQuickMatch, SearchCancelled } from './matchmaking';

import type { Leg, MatchDeps } from './matchmaking';
import type { Region } from './regions';

const fra: Region = { id: 'fra', url: 'wss://fra.example' };
const iad: Region = { id: 'iad', url: 'wss://iad.example' };
const sin: Region = { id: 'sin', url: 'wss://sin.example' };

describe('planSearch: region order', () => {
  it('one region (today): a single leg in it, with the bot', () => {
    expect(planSearch([fra])).toEqual([{ kind: 'bot', region: fra, untilMs: null, bot: true }]);
  });

  it('home is the nearest region, then the nearest other one, then back home for the bot', () => {
    const legs = planSearch([fra, iad, sin], [
      { id: 'fra', rtt: 110 },
      { id: 'iad', rtt: 35 },
      { id: 'sin', rtt: 80 },
    ]);
    expect(legs.map((l) => [l.kind, l.region.id, l.untilMs, l.bot])).toEqual([
      ['home', 'iad', MATCH_TIMING.HOME_WAIT_MS, false],
      ['fallback', 'sin', MATCH_TIMING.HOME_WAIT_MS + MATCH_TIMING.FALLBACK_WAIT_MS, false],
      ['bot', 'iad', null, true],
    ]);
  });

  it('a region that did not answer is never home or fallback', () => {
    expect(planSearch([fra, iad], [{ id: 'fra', rtt: Infinity }, { id: 'iad', rtt: 40 }]).map((l) => [l.kind, l.region.id])).toEqual([
      ['bot', 'iad'],
    ]);
  });

  it('latency first: a fallback more than FALLBACK_RTT_CAP_MS over home is skipped, the bot comes at home instead', () => {
    const cap = MATCH_TIMING.FALLBACK_RTT_CAP_MS;
    // Baku-like: fra 75 ms, iad 165 ms -> no cross-Atlantic human, bot in fra.
    expect(planSearch([fra, iad], [{ id: 'fra', rtt: 75 }, { id: 'iad', rtt: 165 }]).map((l) => [l.kind, l.region.id])).toEqual([['bot', 'fra']]);
    // Exactly at the cap is allowed; one ms over is not.
    expect(planSearch([fra, iad], [{ id: 'fra', rtt: 40 }, { id: 'iad', rtt: 40 + cap }]).map((l) => l.kind)).toEqual(['home', 'fallback', 'bot']);
    expect(planSearch([fra, iad], [{ id: 'fra', rtt: 40 }, { id: 'iad', rtt: 41 + cap }]).map((l) => l.kind)).toEqual(['bot']);
  });

  it('nothing answered the probe: still try the first region (the probe route may be what is down)', () => {
    expect(planSearch([fra, iad], [{ id: 'fra', rtt: Infinity }, { id: 'iad', rtt: Infinity }])).toEqual([
      { kind: 'bot', region: fra, untilMs: null, bot: true },
    ]);
    expect(planSearch([])).toEqual([]);
  });

  it('ties go to the region listed first', () => {
    expect(planSearch([fra, iad], [{ id: 'fra', rtt: 50 }, { id: 'iad', rtt: 50 }])[0].region.id).toBe('fra');
  });
});

describe('bot delay', () => {
  it('the bot is due BOT_DUE_MS after pressing Quick match, whatever the connects cost', () => {
    expect(botDelayFor(0)).toBe(MATCH_TIMING.BOT_DUE_MS);
    expect(botDelayFor(7_000)).toBe(MATCH_TIMING.BOT_DUE_MS - 7_000);
    // A slow search still leaves a moment for a human who is joining right now.
    expect(botDelayFor(20_000)).toBe(MATCH_TIMING.MIN_BOT_WAIT_MS);
    expect(MATCH_TIMING.BOT_DUE_MS).toBeGreaterThanOrEqual(8_000);
    expect(MATCH_TIMING.BOT_DUE_MS).toBeLessThanOrEqual(10_000);
  });

  it('the server clamps what a client asks for', () => {
    expect(clampBotDelay(undefined)).toBeUndefined();
    expect(clampBotDelay('3000')).toBeUndefined();
    expect(clampBotDelay(Number.NaN)).toBeUndefined();
    expect(clampBotDelay(-5)).toBe(0);
    expect(clampBotDelay(1e9)).toBe(MATCH_TIMING.MAX_BOT_WAIT_MS);
    expect(clampBotDelay(2500)).toBe(2500);
  });
});

/** A fake network: each region has rooms; a room matches at `matchAt` ms (absolute fake time) or never. */
const harness = (opts: {
  humanAt?: Partial<Record<string, number>>;
  down?: string[];
  /** The server seats the bot `botAfterMs` after the bot-leg join. */
  serverBot?: boolean;
}) => {
  let clock = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const log: string[] = [];
  const sleep = (ms: number) => new Promise<void>((res) => timers.push({ at: clock + ms, fn: res }));
  type Room = { region: string; matchAt: number | null; bot: boolean; left: boolean };
  const deps: MatchDeps<Room> = {
    now: () => clock,
    sleep,
    join: async (region, botAfterMs) => {
      log.push(`join ${region.id}${botAfterMs !== undefined ? ` bot=${botAfterMs}` : ''} @${clock}`);
      if (opts.down?.includes(region.id)) throw new Error(`${region.id} down`);
      clock += 100; // connect cost
      const human = opts.humanAt?.[region.id];
      const humanAt = human !== undefined && human >= 0 ? Math.max(human, clock) : null;
      const botAt = botAfterMs !== undefined && opts.serverBot !== false ? clock + botAfterMs : null;
      const at = [humanAt, botAt].filter((x): x is number => x !== null).sort((a, b) => a - b)[0] ?? null;
      return { region: region.id, matchAt: at, bot: at !== null && at === botAt && at !== humanAt, left: false };
    },
    matched: (room) => (room.matchAt === null ? new Promise(() => {}) : sleep(room.matchAt - clock)),
    leave: (room) => {
      room.left = true;
      log.push(`leave ${room.region} @${clock}`);
    },
    onLeg: (leg: Leg) => log.push(`leg ${leg.kind}`),
  };
  /** Advance the fake clock, firing timers in order (and letting promise callbacks run in between). */
  const run = async <T>(p: Promise<T>, until = 60_000): Promise<T> => {
    let done = false;
    let out: T | undefined;
    let err: unknown;
    p.then(
      (v) => ((done = true), (out = v)),
      (e) => ((done = true), (err = e)),
    );
    for (let i = 0; i < 10_000 && !done; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      if (done) break;
      timers.sort((a, b) => a.at - b.at);
      const t = timers.shift();
      if (!t || t.at > until) break;
      clock = Math.max(clock, t.at);
      t.fn();
    }
    if (!done) throw new Error(`still searching at ${clock} ms`);
    if (err) throw err;
    return out as T;
  };
  return { deps, run, log, time: () => clock };
};

describe('runQuickMatch: the state machine', () => {
  it('a lone player in one region gets the bot at BOT_DUE_MS (<= 10 s)', async () => {
    const h = harness({});
    const res = await h.run(runQuickMatch(planSearch([fra]), h.deps));
    expect(res.leg.kind).toBe('bot');
    expect(res.room.bot).toBe(true);
    expect(h.time()).toBe(MATCH_TIMING.BOT_DUE_MS + 100);
    expect(h.time()).toBeLessThanOrEqual(10_000);
  });

  it('a human waiting in the home region is matched at once, no other region is tried', async () => {
    const h = harness({ humanAt: { fra: 0 } });
    const res = await h.run(runQuickMatch(planSearch([fra, iad], [{ id: 'fra', rtt: 30 }, { id: 'iad', rtt: 80 }]), h.deps));
    expect(res.leg.kind).toBe('home');
    expect(res.room.bot).toBe(false);
    expect(h.log.filter((l) => l.startsWith('join'))).toEqual(['join fra @0']);
  });

  it('home is empty: after HOME_WAIT_MS it leaves and finds the human in the nearest other region', async () => {
    const h = harness({ humanAt: { iad: 0 } });
    const res = await h.run(runQuickMatch(planSearch([fra, iad], [{ id: 'fra', rtt: 30 }, { id: 'iad', rtt: 80 }]), h.deps));
    expect(res.leg.kind).toBe('fallback');
    expect(res.room.region).toBe('iad');
    expect(h.log).toEqual(['leg home', 'join fra @0', `leave fra @${MATCH_TIMING.HOME_WAIT_MS}`, 'leg fallback', `join iad @${MATCH_TIMING.HOME_WAIT_MS}`]);
  });

  it('nobody anywhere: home, fallback, then the bot at home, due at BOT_DUE_MS overall', async () => {
    const h = harness({});
    const res = await h.run(runQuickMatch(planSearch([fra, iad], [{ id: 'fra', rtt: 30 }, { id: 'iad', rtt: 80 }]), h.deps));
    expect(res.leg.kind).toBe('bot');
    expect(res.room.region).toBe('fra');
    expect(res.room.bot).toBe(true);
    const t = MATCH_TIMING.HOME_WAIT_MS + MATCH_TIMING.FALLBACK_WAIT_MS;
    expect(h.log).toContain(`join fra bot=${MATCH_TIMING.BOT_DUE_MS - t} @${t}`);
    expect(h.time()).toBe(MATCH_TIMING.BOT_DUE_MS + 100);
  });

  it('a human who arrives at home during the fallback still beats the bot on the way back', async () => {
    const h = harness({ humanAt: { fra: MATCH_TIMING.HOME_WAIT_MS + 500 } });
    const res = await h.run(runQuickMatch(planSearch([fra, iad], [{ id: 'fra', rtt: 30 }, { id: 'iad', rtt: 80 }]), h.deps));
    expect(res.leg.kind).toBe('bot');
    expect(res.room.bot).toBe(false);
  });

  it('the fallback region is down: skipped, the bot still comes on time', async () => {
    const h = harness({ down: ['iad'] });
    const res = await h.run(runQuickMatch(planSearch([fra, iad], [{ id: 'fra', rtt: 30 }, { id: 'iad', rtt: 80 }]), h.deps));
    expect(res.room.bot).toBe(true);
    expect(h.time()).toBeLessThanOrEqual(10_000);
  });

  it('home goes down after the probe: the bot leg moves to a region that answered', async () => {
    const h = harness({});
    let fraUp = true;
    const join = h.deps.join;
    h.deps.join = async (r, b) => {
      if (r.id === 'fra' && !fraUp) throw new Error('fra down');
      fraUp = false; // up for the first join only
      return join(r, b);
    };
    const res = await h.run(runQuickMatch(planSearch([fra, iad], [{ id: 'fra', rtt: 30 }, { id: 'iad', rtt: 80 }]), h.deps));
    expect(res.room.region).toBe('iad');
    expect(res.room.bot).toBe(true);
  });

  it('every region down: the error comes back (the lobby shows "can\'t reach the game server")', async () => {
    const h = harness({ down: ['fra'] });
    await expect(h.run(runQuickMatch(planSearch([fra]), h.deps))).rejects.toThrow('fra down');
  });

  it('cancel: leaves the room it just joined and stops', async () => {
    const h = harness({});
    let cancel = false;
    h.deps.cancelled = () => cancel;
    const join = h.deps.join;
    h.deps.join = async (r, b) => {
      const room = await join(r, b);
      cancel = true;
      return room;
    };
    await expect(h.run(runQuickMatch(planSearch([fra]), h.deps))).rejects.toBeInstanceOf(SearchCancelled);
    expect(h.log.some((l) => l.startsWith('leave fra'))).toBe(true);
  });
});
