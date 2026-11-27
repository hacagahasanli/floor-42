import { DT } from '../sim/constants';

import { SNAPSHOT_EVERY_TICKS } from './protocol';

import type { EventBatch } from './protocol';
import type { Fighter, GameEvent, GameState, Projectile } from '../sim/types';

/**
 * What the far side did, shown a little in the past so it always moves smoothly.
 *
 * The rival, the rival's bullets and rockets, and the results the authority decided (your health,
 * your knockout, the rival's) come from the authority's snapshots. They are kept in a buffer and
 * drawn `delay` ms behind the newest one, interpolated between the two snapshots around that
 * moment, so a late or lost snapshot is covered by the next one instead of freezing or jumping.
 *
 * - The delay adapts: one snapshot interval plus the jitter actually measured (95th percentile of
 *   snapshot arrival times over the last few seconds), between 35 and 250 ms.
 * - Underrun (the buffer ran dry, e.g. a stall): the rival keeps moving on its last velocity for
 *   up to 100 ms, then slows to a stop. Never a frozen frame, never a teleport.
 * - Catch-up: after a stall the timeline runs faster (up to 1.6x) until it is back at the target
 *   delay, so what happened during the stall plays out quickly instead of landing all at once.
 *   More than 1.5 s behind, it jumps.
 * - Events are shown when the timeline reaches their tick: you see the shot that hit you before
 *   the health bar drops.
 */

const MS = DT * 1000;
const SNAP_MS = SNAPSHOT_EVERY_TICKS * MS;
export const MIN_DELAY_MS = 40;
export const MAX_DELAY_MS = 250;
/** Where the delay starts, until the first seconds of jitter are measured. */
const START_DELAY_MS = 60;
const EXTRAPOLATE_TICKS = 6; // 100 ms on the last velocity...
const COAST_TICKS = 9; // ...then 150 ms easing to a stop
const KEEP_MS = 3000;
const MAX_RATE = 1.6;
const JUMP_BEHIND_MS = 1500;

export interface Sample {
  tick: number;
  /** Arrival time, ms. */
  at: number;
  fighters: Fighter[];
  projectiles: Projectile[];
}

export interface TimelineView {
  /** The game tick shown, fractional. */
  tick: number;
  fighters: Fighter[];
  projectiles: Projectile[];
  /** The buffer ran dry and the view is guessing. */
  underrun: boolean;
  /** Dry for longer than the guess covers: the rival is slowing to a stop. */
  coasting: boolean;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * k;
};

export const createTimeline = () => {
  let samples: Sample[] = [];
  /**
   * Jitter: how far each snapshot's arrival strayed from the one before, given the ticks between
   * them. Measured between neighbours, so a sender whose clock runs a little slow or fast (a
   * browser host dropping frames) doesn't count as jitter.
   */
  let jitter: { at: number; v: number }[] = [];
  let newestAt = 0;
  let renderTick: number | null = null;
  let delay = START_DELAY_MS;
  let underrun = false;
  /** Fighters' last drawn positions, and the offset that hides the step when a guess meets the truth. */
  let drawn: { x: number; y: number }[] = [];
  let offsets: { x: number; y: number }[] = [];
  const events = new Map<number, GameEvent[]>();
  let shownUpTo = -1;
  let late: GameEvent[] = [];
  const stats = { underruns: 0, jumps: 0, delayMs: delay, behindMs: 0, received: 0, renderTick: 0, newestTick: 0, underrun: false };

  const push = (state: GameState, at: number) => {
    stats.received += 1;
    const tick = state.tick;
    if (samples.some((s) => s.tick === tick)) return;
    const sample: Sample = {
      tick,
      at,
      fighters: state.fighters.map((f) => ({ ...f, weapon: { ...f.weapon } })),
      projectiles: state.projectiles.map((p) => ({ ...p })),
    };
    const prev = samples[samples.length - 1];
    if (prev && tick > prev.tick) {
      jitter.push({ at, v: Math.abs(at - prev.at - (tick - prev.tick) * MS) });
      newestAt = at;
    } else if (!prev) newestAt = at;
    let i = samples.length;
    while (i > 0 && samples[i - 1].tick > tick) i--;
    samples.splice(i, 0, sample);
    jitter = jitter.filter((l) => l.at > at - KEEP_MS);
    samples = samples.filter((s) => s.at > at - KEEP_MS || s === samples[samples.length - 1]);
    // Target delay: one snapshot interval plus the 95th percentile of the measured jitter.
    const j = jitter.map((l) => l.v).sort((x, y) => x - y);
    const p95 = j[Math.floor(j.length * 0.95)] ?? 0;
    const target = Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, SNAP_MS + p95 + 8));
    // Widen fast, narrow slowly (the same time constant whatever the snapshot rate).
    delay += (target - delay) * (target > delay ? 0.25 : 0.01 * SNAPSHOT_EVERY_TICKS);
    stats.delayMs = Math.round(delay);
  };

  /**
   * Advance the clock by dtMs (real time) and return what to draw. Null before any snapshot.
   * Leaving an underrun, the guess and the real positions differ: that step is eased out over
   * ~100 ms instead of drawn as a jump (a respawn, more than 3 m, is still a cut).
   */
  const view = (dtMs: number, now: number, frozen = false): TimelineView | null => {
    const was = underrun;
    const v = rawView(dtMs, now, frozen);
    if (!v) return null;
    const k = Math.exp(-dtMs / 100);
    const fighters = v.fighters.map((f, i) => {
      const o = (offsets[i] ??= { x: 0, y: 0 });
      const d = drawn[i];
      if (was && !v.underrun && d) {
        const dx = d.x - f.x;
        const dy = d.y - f.y;
        if (Math.hypot(dx, dy) < 3) {
          o.x = dx;
          o.y = dy;
        }
      }
      o.x *= k;
      o.y *= k;
      if (f.respawn > 0) o.x = o.y = 0;
      const out = o.x || o.y ? { ...f, x: f.x + o.x, y: f.y + o.y } : f;
      drawn[i] = { x: out.x, y: out.y };
      return out;
    });
    return { ...v, fighters };
  };

  const rawView = (dtMs: number, now: number, frozen: boolean): TimelineView | null => {
    if (!samples.length) return null;
    const newest = samples[samples.length - 1];
    // Where the clock should be: `delay` behind the newest tick (moved on by the time since it
    // arrived, up to two snapshot intervals: after that we are waiting, not lagging).
    const ideal = newest.tick + Math.min((now - newestAt) / MS, 4) - delay / MS;
    if (renderTick === null) renderTick = Math.min(ideal, newest.tick);
    if (!frozen) {
      const behind = ideal - renderTick;
      if (behind * MS > JUMP_BEHIND_MS) {
        renderTick = ideal;
        stats.jumps += 1;
      } else {
        // Gently faster when behind, a little slower when ahead.
        const rate = Math.max(0.9, Math.min(MAX_RATE, 1 + behind / 20));
        renderTick += (dtMs / MS) * rate;
      }
    }
    stats.behindMs = Math.round((ideal - renderTick) * MS);
    const maxTick = newest.tick + EXTRAPOLATE_TICKS + COAST_TICKS;
    if (renderTick > maxTick) renderTick = maxTick;
    const rt = renderTick;
    stats.renderTick = Math.round(rt * 10) / 10;
    stats.newestTick = newest.tick;
    let a = samples[0];
    let b: Sample | null = null;
    for (const s of samples) {
      if (s.tick <= rt) a = s;
      else {
        b = s;
        break;
      }
    }
    const wasUnderrun = underrun;
    underrun = !b && rt > a.tick;
    if (underrun && !wasUnderrun) stats.underruns += 1;
    const coasting = underrun && rt - a.tick > EXTRAPOLATE_TICKS;
    if (rt < a.tick) return { tick: rt, fighters: a.fighters, projectiles: a.projectiles, underrun, coasting };

    if (b) {
      const k = (rt - a.tick) / (b.tick - a.tick);
      const fighters = a.fighters.map((fa, i) => {
        const fb = b!.fighters[i];
        // A respawn or a teleport: no sliding across the room.
        if (!fb || Math.hypot(fb.x - fa.x, fb.y - fa.y) > 3) return k < 1 ? fa : fb;
        const src = k < 0.5 ? fa : fb;
        return { ...src, x: lerp(fa.x, fb.x, k), y: lerp(fa.y, fb.y, k), aim: lerpAngle(fa.aim, fb.aim, k), crouch: lerp(fa.crouch ?? 0, fb.crouch ?? 0, k) };
      });
      const inB = new Map(b.projectiles.map((p) => [p.id, p]));
      const projectiles = a.projectiles.map((p) => {
        const q = inB.get(p.id);
        if (q) return { ...p, x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) };
        const t = (rt - a.tick) * DT;
        return { ...p, x: p.x + p.vx * t, y: p.y + p.vy * t };
      });
      return { tick: rt, fighters, projectiles, underrun, coasting };
    }
    // Underrun: keep moving on the last velocity, then ease to a stop.
    const over = rt - a.tick;
    const run = Math.min(over, EXTRAPOLATE_TICKS);
    const coast = Math.max(0, Math.min(over - EXTRAPOLATE_TICKS, COAST_TICKS));
    const travel = (run + coast - (coast * coast) / (2 * COAST_TICKS)) * DT;
    const fighters = a.fighters.map((f) => (f.respawn > 0 ? f : { ...f, x: f.x + f.vx * travel, y: Math.max(0, f.y + f.vy * travel) }));
    const projectiles = a.projectiles.map((p) => ({ ...p, x: p.x + p.vx * over * DT, y: p.y + p.vy * over * DT }));
    return { tick: rt, fighters, projectiles, underrun, coasting };
  };

  /** Authoritative events for a range of ticks; replaces what was there. */
  const applyEvents = (batch: EventBatch) => {
    for (const t of [...events.keys()]) if (t >= batch.from && t <= batch.to) events.delete(t);
    for (const [t, e] of batch.e) {
      if (t <= shownUpTo) {
        // Arrived after its moment: still show it if it is recent, else it is history.
        if (t > shownUpTo - 12) late.push(e);
        continue;
      }
      const list = events.get(t) ?? [];
      list.push(e);
      events.set(t, list);
    }
  };

  /** Events whose tick the view has reached since the last call. */
  const drainEvents = (): GameEvent[] => {
    if (renderTick === null) return [];
    const upTo = Math.floor(renderTick);
    const out = late;
    late = [];
    for (const t of [...events.keys()].sort((x, y) => x - y)) {
      if (t > upTo) break;
      if (t > shownUpTo) out.push(...events.get(t)!);
      events.delete(t);
    }
    shownUpTo = Math.max(shownUpTo, upTo);
    return out;
  };

  /** A new round: forget everything. */
  const reset = () => {
    drawn = [];
    offsets = [];
    samples = [];
    jitter = [];
    renderTick = null;
    events.clear();
    shownUpTo = -1;
    late = [];
  };

  /** After a pause: start the clock again from the snapshots. */
  const resync = () => {
    renderTick = null;
  };

  return { push, view, applyEvents, drainEvents, reset, resync, stats, get delay() {
    return delay;
  } };
};

export type Timeline = ReturnType<typeof createTimeline>;
