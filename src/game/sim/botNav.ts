/**
 * Platform navigation for the bot (docs/systems/smart-bot.md section 3.5).
 * Surfaces = the floor + every platform top. Edges are analytic (jump physics from constants.ts), built once per
 * arena x character and cached. navInput() turns "stand on surface S near x" into left/right/up/down for this tick.
 * Pure: reads the state, never writes it, no RNG.
 */
import { arenaOf, baseOf, CHARACTERS, isSolid, PHYS } from './constants';

import type { ArenaData, Platform } from './constants';
import type { CharacterId, Fighter, GameState } from './types';

export interface Surface {
  id: number;
  x0: number;
  x1: number;
  y: number;
  solid: boolean;
  floor: boolean;
  /** For a solid box: where it stands (its side blocks walking at that level). */
  base: number;
}

interface Edge {
  to: number;
  kind: 'up' | 'down';
  cost: number;
}

/** Free stretches of surface `a` (not inside a solid box standing on it), shrunk by the body's half width. */
const freeOn = (all: Surface[], a: Surface, lo: number, hi: number, halfW: number, topY = a.y): [number, number][] => {
  let parts: [number, number][] = [[lo, hi]];
  for (const b of all) {
    // Boxes standing on `a`, and any box in the band up to `topY` (its underside or top would stop the jump).
    if (!b.solid || b === a || b.floor) continue;
    const onA = Math.abs(b.base - a.y) < 0.05;
    const inBand = b.y > a.y + 0.05 && b.base < topY + 0.05;
    if (!onA && !inBand) continue;
    // A box in the band also blocks the sideways drift onto the plank: keep a wider berth.
    const pad = halfW + (onA ? 0.1 : 0.9);
    const c0 = b.x0 - pad;
    const c1 = b.x1 + pad;
    parts = parts.flatMap(([p0, p1]) => {
      if (c1 <= p0 || c0 >= p1) return [[p0, p1]] as [number, number][];
      const out: [number, number][] = [];
      if (c0 > p0) out.push([p0, c0]);
      if (c1 < p1) out.push([c1, p1]);
      return out;
    });
  }
  return parts.filter(([p0, p1]) => p1 - p0 > 0.05);
};
const takeoffCache = new Map<string, [number, number][]>();

export interface NavGraph {
  surfaces: Surface[];
  edges: Edge[][];
}

const cache = new Map<string, NavGraph>();

/** Highest rise reachable with a ground jump plus every air jump, minus a safety margin (m). */
export const reachUp = (ch: CharacterId) => {
  const c = CHARACTERS[ch];
  const h1 = (c.jump * c.jump) / (2 * PHYS.gravity);
  const hAir = ((c.jump * 0.88) ** 2) / (2 * PHYS.gravity);
  // Every extra air jump loses a little height to timing: keep a wider margin for the double air jumper.
  return h1 + hAir * c.airJumps - 0.45 - 0.15 * (c.airJumps - 1);
};

const gapBetween = (a: { x0: number; x1: number }, b: { x0: number; x1: number }) => Math.max(0, b.x0 - a.x1, a.x0 - b.x1);

export const graphFor = (A: ArenaData, ch: CharacterId): NavGraph => {
  const key = `${A.id}|${ch}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const surfaces: Surface[] = [{ id: 0, x0: A.left + 0.5, x1: A.right - 0.5, y: A.floor, solid: true, floor: true, base: A.floor }];
  A.platforms.forEach((p: Platform) =>
    surfaces.push({ id: surfaces.length, x0: p.x0, x1: p.x1, y: p.y, solid: isSolid(p), floor: false, base: baseOf(p) }),
  );
  const up = reachUp(ch);
  const edges: Edge[][] = surfaces.map(() => []);
  for (const a of surfaces)
    for (const b of surfaces) {
      if (a === b) continue;
      const dy = b.y - a.y;
      const gap = gapBetween(a, b);
      if (dy > 0.3) {
        // Up: within jump reach, and either overlapping (one-way: jump through) or a short hop sideways.
        if (dy > up) continue;
        if (gap > 2.2) continue;
        // A box standing on a plank is climbed from that plank only (from below its underside stops the jump).
        if (b.solid && b.base > a.y + 0.05) continue;
        const halfW = CHARACTERS[ch].width / 2;
        if (!b.solid && gap === 0) {
          // Take off anywhere on `a` up to 0.8 m outside the plank's span: the hop drifts in under it.
          const lo = Math.max(a.x0 + halfW * 0.3, b.x0 - 0.8);
          const hi = Math.min(a.x1 - halfW * 0.3, b.x1 + 0.8);
          // Under the plank, but every spot under it is taken by a desk or box on our level: not a take-off.
          const roofed = lo <= hi ? freeOn(surfaces, a, lo, hi, halfW, b.y) : [];
          if (!roofed.length) continue;
          takeoffCache.set(`${key}|${a.id}|${b.id}`, roofed);
        }
        // A solid box sitting on this very surface is climbed from its side (overlap is fine: walk up to it).
        edges[a.id].push({ to: b.id, kind: 'up', cost: 2 + dy + gap });
      } else if (dy < -0.3) {
        // Down: drop through a one-way plank or walk off an edge; anything below that is under or next to us.
        if (gap > 3) continue;
        edges[a.id].push({ to: b.id, kind: 'down', cost: 1 + gap });
      } else if (gap < 1.6) {
        edges[a.id].push({ to: b.id, kind: 'up', cost: 1 + gap });
      }
    }
  const g = { surfaces, edges };
  cache.set(key, g);
  return g;
};

/** The surface a grounded fighter stands on (the floor when nothing else matches). */
export const surfaceOf = (g: NavGraph, f: Fighter): Surface => {
  const halfW = CHARACTERS[f.character].width / 2;
  let best = g.surfaces[0];
  for (const s of g.surfaces) {
    if (s.floor) continue;
    if (Math.abs(f.y - s.y) < 0.08 && f.x + halfW * 0.5 >= s.x0 && f.x - halfW * 0.5 <= s.x1) best = s;
  }
  return best;
};

/** The surface right under a point (for "where is the rival standing", even mid-air). */
export const surfaceUnder = (g: NavGraph, x: number, y: number): Surface => {
  let best = g.surfaces[0];
  for (const s of g.surfaces) if (x >= s.x0 - 0.3 && x <= s.x1 + 0.3 && s.y <= y + 0.1 && s.y > best.y) best = s;
  return best;
};

/**
 * Dijkstra over ~25 nodes: the surfaces on the cheapest route after `from` (ending with `to`), [] when already there,
 * null when unreachable. The graph never changes, so routes are cached per graph.
 */
const routeCache = new WeakMap<NavGraph, Map<number, number[] | null>>();
export const routeOf = (g: NavGraph, from: number, to: number): number[] | null => {
  if (from === to) return [];
  let memo = routeCache.get(g);
  if (!memo) routeCache.set(g, (memo = new Map()));
  const key = from * 1024 + to;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const n = g.surfaces.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = true;
    for (const e of g.edges[u])
      if (dist[u] + e.cost < dist[e.to]) {
        dist[e.to] = dist[u] + e.cost;
        prev[e.to] = u;
      }
  }
  let route: number[] | null = null;
  if (dist[to] < Infinity) {
    route = [];
    for (let v = to; v !== from && v >= 0; v = prev[v]) route.unshift(v);
  }
  memo.set(key, route);
  return route;
};

/** The next surface on the cheapest route, or null when already there / unreachable. */
export const nextHop = (g: NavGraph, from: number, to: number): number | null => routeOf(g, from, to)?.[0] ?? null;

export interface NavOut {
  move: -1 | 0 | 1;
  up: boolean;
  down: boolean;
  /** True once standing on the goal surface within 0.6 m of the goal x. */
  arrived: boolean;
}

/** Per-bot navigation memory: the hop being flown (kept while airborne). */
export interface NavMem {
  hop: number | null;
  takeoffX: number;
  /** Where the feet were heading on the last grounded tick (an unplanned hop, over a box, keeps going there). */
  walkX: number;
  /** The current hop is a walk off an edge (not a jump or a drop through a plank). */
  walkOff: boolean;
}
export const newNavMem = (): NavMem => ({ hop: null, takeoffX: 0, walkX: 0, walkOff: false });

const clampIn = (s: Surface, x: number, inset: number) => Math.min(Math.max(x, s.x0 + inset), s.x1 - inset);

/**
 * One tick of "get to (goal surface, goalX)". `up`/`down` are held-state requests; the caller turns them into edges.
 */
export const navInput = (state: GameState, me: Fighter, g: NavGraph, goal: Surface, goalX: number, mem: NavMem): NavOut => {
  const A = arenaOf(state);
  const halfW = CHARACTERS[me.character].width / 2;
  const toward = (x: number): -1 | 0 | 1 => (Math.abs(x - me.x) < 0.12 ? 0 : x < me.x ? -1 : 1);
  // In the air: steer with braking, so a hop onto a narrow box top stops over it instead of sailing past
  // (air control is 50 m/s^2 against 8 of air drag, so letting go of the key barely slows the fighter).
  const steer = (x: number): -1 | 0 | 1 => {
    const dx = x - me.x;
    const want = Math.sign(dx) * Math.min(CHARACTERS[me.character].speed, Math.sqrt(2 * 40 * Math.abs(dx)));
    return want > me.vx + 0.6 ? 1 : want < me.vx - 0.6 ? -1 : 0;
  };
  if (!me.onGround) {
    // Airborne on a hop: air-jump near the apex while still below the target top, then drift onto it.
    const t = mem.hop !== null ? g.surfaces[mem.hop] : goal;
    // Dropping to a lower surface: keep drifting the way we walked off, then onto the target's span.
    if (t.y < me.y - 0.3 && me.vy <= 0) {
      const dx = t.floor ? goalX : clampIn(t, goalX, halfW + 0.4);
      const overIt = me.x > t.x0 && me.x < t.x1;
      if (mem.walkOff && !overIt && me.y > t.y + 1.5 && !t.floor) return { move: toward(mem.takeoffX), up: false, down: false, arrived: false };
      return { move: steer(dx), up: false, down: false, arrived: false };
    }
    const below = me.y < t.y + 0.15;
    // An unplanned hop only spends air jumps on a goal straight above.
    const c = CHARACTERS[me.character];
    const reachLeft = Math.max(0, me.vy) ** 2 / (2 * PHYS.gravity) + (me.airJumps * (c.jump * 0.88) ** 2) / (2 * PHYS.gravity);
    const planned = mem.hop !== null || (me.x > t.x0 && me.x < t.x1 && t.y < me.y + reachLeft - 0.3);
    const up = below && planned && me.vy < 1 && me.airJumps > 0 && t.y > me.y + 0.3;
    // Under a one-way plank going up: hold under it; once the feet clear its top, slide onto it.
    let aimX = clampIn(t, me.x, halfW + 0.2);
    // Rising: hold the take-off column (it is clear of box undersides and desk tops) until the feet pass the top.
    if (below && mem.hop !== null) aimX = mem.takeoffX;
    // An unplanned hop (over a box in the way, a jink): keep heading where the feet were going.
    else if (below && !planned) aimX = mem.walkX;
    if (t.solid && !below) aimX = clampIn(t, (t.x0 + t.x1) / 2, halfW + 0.2);
    return { move: !below && t.solid ? steer(aimX) : toward(aimX), up, down: false, arrived: false };
  }
  const here = surfaceOf(g, me);
  return navGround(A, me, g, here, goal, goalX, mem, halfW, (x) => {
    mem.walkX = x;
    return toward(x);
  });
};

const navGround = (
  A: ArenaData,
  me: Fighter,
  g: NavGraph,
  here: Surface,
  goal: Surface,
  goalX: number,
  mem: NavMem,
  halfW: number,
  toward: (x: number) => -1 | 0 | 1,
): NavOut => {
  mem.hop = null;
  mem.walkOff = false;
  if (here.id === goal.id) {
    const gx = clampIn(here, goalX, halfW + 0.2);
    return { move: toward(gx), up: false, down: false, arrived: Math.abs(gx - me.x) < 0.6 };
  }
  const route = routeOf(g, here.id, goal.id);
  const hopId = route?.[0] ?? null;
  if (hopId === null) return { move: toward(goalX), up: false, down: false, arrived: false };
  const t = g.surfaces[hopId];
  if (t.y > here.y + 0.3 || Math.abs(t.y - here.y) <= 0.3) {
    // Going up. One-way plank overlapping us: take off under it. A box or a gap: take off at our edge / its side.
    let tx: number;
    const ox0 = Math.max(here.x0, t.x0) + halfW + 0.2;
    const ox1 = Math.min(here.x1, t.x1) - halfW - 0.2;
    const free = takeoffCache.get(`${A.id}|${me.character}|${here.id}|${t.id}`);
    if (!t.solid && free) {
      tx = free[0][0];
      let bestD = Infinity;
      for (const [p0, p1] of free) {
        const c = Math.min(Math.max(me.x, p0), p1);
        if (Math.abs(c - me.x) < bestD) {
          bestD = Math.abs(c - me.x);
          tx = c;
        }
      }
    } else if (!t.solid && ox0 <= ox1) tx = Math.min(Math.max(me.x, ox0), ox1);
    else if (t.solid && t.base <= here.y + 0.05 && gapBetween(here, t) === 0) tx = me.x < (t.x0 + t.x1) / 2 ? t.x0 - halfW - 0.35 : t.x1 + halfW + 0.35;
    else tx = t.x1 < here.x0 + 0.01 ? here.x0 + halfW : t.x0 > here.x1 - 0.01 ? here.x1 - halfW : clampIn(here, (t.x0 + t.x1) / 2, halfW);
    tx = clampIn(here, tx, halfW * 0.5);
    mem.takeoffX = tx;
    if (Math.abs(me.x - tx) < 0.2 && Math.abs(me.vx) < 6) {
      mem.hop = hopId;
      return { move: t.solid ? toward((t.x0 + t.x1) / 2) : 0, up: true, down: false, arrived: false };
    }
    return { move: toward(tx), up: false, down: false, arrived: false };
  }
  // Going down: drop through a plank above the target, or walk off the edge nearest the target.
  const ox0 = Math.max(here.x0, t.x0) + halfW;
  const ox1 = Math.min(here.x1, t.x1) - halfW;
  if (!here.solid && ox0 <= ox1) {
    const tx = Math.min(Math.max(me.x, ox0), ox1);
    if (Math.abs(me.x - tx) < 0.4) {
      mem.hop = hopId;
      return { move: 0, up: false, down: true, arrived: false };
    }
    return { move: toward(tx), up: false, down: false, arrived: false };
  }
  // Walk off the side that faces the goal (the floor spans everything: its centre says nothing).
  // Dropping to the floor on the way somewhere else: walk off the side that faces the surface after it.
  const after = t.floor && route && route.length > 1 ? g.surfaces[route[1]] : null;
  const aimAt = after ? (after.x0 + after.x1) / 2 : t.floor ? goalX : Math.min(Math.max(goalX, t.x0), t.x1);
  const edgeX = Math.abs(aimAt - here.x0) < Math.abs(aimAt - here.x1) ? here.x0 - halfW - 0.5 : here.x1 + halfW + 0.5;
  mem.hop = hopId;
  mem.takeoffX = edgeX;
  mem.walkOff = true;
  return { move: toward(Math.min(Math.max(edgeX, A.left + 0.5), A.right - 0.5)), up: false, down: false, arrived: false };
};
