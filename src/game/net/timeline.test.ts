import { createGame } from '../sim/step';

import { SNAPSHOT_EVERY_TICKS } from './protocol';
import { createTimeline, MAX_DELAY_MS, MIN_DELAY_MS } from './timeline';

import type { GameState } from '../sim/types';

const STRIDE = SNAPSHOT_EVERY_TICKS;
const SNAP = (1000 / 60) * STRIDE;
const FRAME = 1000 / 60;

/** A snapshot at game tick `tick` with the rival (fighter 1) running right at 6 m/s (0.1 per tick). */
const snap = (tick: number): GameState => {
  const s = createGame(['hotfix', 'legacy'], 1, true);
  s.tick = tick;
  Object.assign(s.fighters[1], { x: tick * 0.1, y: 0, vx: 6, vy: 0, respawn: 0 });
  return s;
};

/** Feed snapshots every SNAPSHOT_EVERY_TICKS ticks with the given arrival jitter, drawing every frame in between. */
const drive = (ms: number, jitter: (i: number) => number = () => 0, stallFrom = Infinity, stallMs = 0) => {
  const tl = createTimeline();
  const frames: { t: number; x: number; tick: number; underrun: boolean }[] = [];
  const arrivals: { at: number; tick: number }[] = [];
  for (let i = 0; i * SNAP < ms; i++) {
    let at = 1000 + i * SNAP + jitter(i);
    if (at >= stallFrom && at < stallFrom + stallMs) at = stallFrom + stallMs; // held, then a burst
    arrivals.push({ at, tick: i * STRIDE });
  }
  arrivals.sort((a, b) => a.at - b.at);
  let k = 0;
  for (let t = 1000; t < 1000 + ms; t += FRAME) {
    while (k < arrivals.length && arrivals[k].at <= t) tl.push(snap(arrivals[k++].tick), arrivals[k - 1].at);
    const v = tl.view(FRAME, t);
    if (v) frames.push({ t, x: v.fighters[1].x, tick: v.tick, underrun: v.underrun });
  }
  return { tl, frames };
};

describe('timeline: the rival drawn from the authority', () => {
  it('interpolates smoothly between snapshots', () => {
    const { frames } = drive(3000);
    // Once the delay has settled, every frame moves forward about one tick's worth, none jumps.
    const steps = frames.slice(120).map((f, i, a) => (i ? f.x - a[i - 1].x : 0.1)).slice(1);
    expect(Math.min(...steps)).toBeGreaterThan(0.08);
    expect(Math.max(...steps)).toBeLessThan(0.12);
  });

  it('adapts the delay to the measured jitter, within MIN_DELAY_MS..250 ms', () => {
    const calm = drive(4000).tl.delay;
    const rough = drive(4000, (i) => ((i * 7919) % 13) * 6).tl.delay; // 0..72 ms of jitter
    expect(calm).toBeGreaterThanOrEqual(MIN_DELAY_MS);
    expect(rough).toBeGreaterThan(calm + 25);
    expect(drive(4000, (i) => ((i * 7919) % 13) * 40).tl.delay).toBeLessThanOrEqual(MAX_DELAY_MS);
  });

  it('uses a snapshot that arrives out of order to fill the gap', () => {
    const tl = createTimeline();
    tl.push(snap(10), 1000);
    tl.push(snap(14), 1060);
    tl.push(snap(12), 1070);
    // Drawn at tick 13: between 12 and 14, not between 10 and 14 extrapolated.
    const v = tl.view(0, 1000 + 13 * FRAME + tl.delay - 10 * FRAME + 1)!;
    expect(v.underrun).toBe(false);
  });

  it('never freezes in a stall: keeps moving for 100 ms, eases to a stop, and counts an underrun', () => {
    const { tl, frames } = drive(4000, () => 0, 2000, 700);
    const during = frames.filter((f) => f.t > 2000 && f.t < 2700);
    const moving = during.filter((f, i) => i > 0 && f.x > during[i - 1].x + 1e-6).length;
    expect(moving).toBeGreaterThan(5);
    expect(tl.stats.underruns).toBeGreaterThanOrEqual(1);
    // No frame jumps: at most what the fighter covers at the 1.6x catch-up, plus the eased step.
    const steps = frames.map((f, i) => (i ? Math.abs(f.x - frames[i - 1].x) : 0));
    expect(Math.max(...steps)).toBeLessThan(0.1 * 1.6 + 0.08);
  });

  it('catches up after a stall at most 1.6x, without a jump', () => {
    const { frames } = drive(5000, () => 0, 2000, 700);
    const after = frames.filter((f) => f.t > 2700);
    const rates = after.map((f, i) => (i ? (f.tick - after[i - 1].tick) / 1 : 1)).slice(1);
    expect(Math.max(...rates)).toBeLessThanOrEqual(1.6 + 1e-9);
    // And it does get back to the target delay.
    const end = frames[frames.length - 1];
    expect(end.underrun).toBe(false);
  });

  it('shows events when the timeline reaches their tick, and a batch replaces its range', () => {
    const tl = createTimeline();
    for (let i = 0; i < 10; i++) tl.push(snap(i * STRIDE), 1000 + i * SNAP);
    tl.applyEvents({ from: 0, to: 20, e: [[10, { type: 'drop', x: 1 }], [12, { type: 'drop', x: 2 }]] });
    // A rewind: tick 12 had no drop after all, tick 13 does.
    tl.applyEvents({ from: 11, to: 20, e: [[13, { type: 'drop', x: 3 }]] });
    tl.view(0, 1000);
    const seen: number[] = [];
    for (let t = 1000; t < 1600; t += FRAME) {
      tl.view(FRAME, t);
      for (const e of tl.drainEvents()) if (e.type === 'drop') seen.push(e.x);
    }
    expect(seen).toEqual([1, 3]);
  });
});
