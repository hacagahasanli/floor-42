/**
 * F-069: a shotgun blast lands up to six pellets on one fighter within a tick or two, and one "-16" per pellet at the same spot
 * stacks into an unreadable smear. Pellets of one blast that hit the same target within MERGE_WINDOW seconds add into ONE number:
 * the first pellet spawns it, the rest raise its value (and its size/colour tier) in place. Pure logic, no DOM or three.js, so it
 * is safe to import anywhere (the site server-renders /play and /arena).
 */
export const MERGE_WINDOW = 0.05;
/** At or above this a number is drawn big and red (the old per-hit rule, now applied to the sum). */
export const BIG_NUMBER = 50;

export interface NumberHit {
  /** Fighter that took the hit. */
  target: number;
  /** Fighter that dealt it (-1 = none, e.g. the arena). */
  by: number;
  damage: number;
  /** Sim time in seconds (tick * DT), so a slow frame does not split one blast. */
  now: number;
  /** True for pellets (the attacker holds the shotgun); anything else always gets its own number. */
  pellet: boolean;
}

export type NumberAction<S> = { kind: 'spawn'; total: number } | { kind: 'merge'; total: number; slot: S };

interface Open<S> {
  by: number;
  start: number;
  total: number;
  slot: S | undefined;
}

/** Tracks the open blast per target. `S` is whatever the renderer uses to find the number it spawned (a pool index). */
export const createNumberMerger = <S>(window = MERGE_WINDOW) => {
  const open = new Map<number, Open<S>>();
  return {
    /** What to do with this hit: spawn a new number, or merge into the open one (`total` is the summed damage to show). */
    hit(h: NumberHit): NumberAction<S> {
      const o = open.get(h.target);
      // A small epsilon: 3 ticks at 60 Hz is 0.05 s give or take float error.
      if (h.pellet && o && o.slot !== undefined && o.by === h.by && h.now - o.start <= window + 1e-6) {
        o.total += h.damage;
        return { kind: 'merge', total: o.total, slot: o.slot };
      }
      if (h.pellet) open.set(h.target, { by: h.by, start: h.now, total: h.damage, slot: undefined });
      else open.delete(h.target);
      return { kind: 'spawn', total: h.damage };
    },
    /** Remember where the number for the latest spawn on `target` went. */
    bind(target: number, slot: S) {
      const o = open.get(target);
      if (o) o.slot = slot;
    },
  };
};

export const numberTier = (total: number) => (total >= BIG_NUMBER ? { color: '#ff3d6e', size: 1.5 } : { color: '#ffd23f', size: 1.1 });
