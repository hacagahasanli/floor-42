/**
 * One headless bot-vs-bot match against the real sim (src/game/sim/step.ts) or the trait-patched copy
 * (tools/balance/.gen/step.ts, built by patchStep.ts). Deterministic: same args, same result.
 */
import { createBot } from '../../src/game/sim/bot';
import { CHARACTERS, GUNS, OFFLINE_COUNTDOWN_SECONDS } from '../../src/game/sim/constants';
import * as real from '../../src/game/sim/step';
import * as patched from './.gen/step';
import { DEFAULT_TRAITS, TRAITS } from './traits';

import type { BotLevel } from '../../src/game/sim/bot';
import type { ArenaId, CharacterStats, GunStats } from '../../src/game/sim/constants';
import type { CharacterId, GameState, GunKind, InputState } from '../../src/game/sim/types';
import type { TraitConfig, TraitState } from './traits';

export const ROSTER: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
export const NAMES: Record<CharacterId, string> = { hotfix: 'BRIX', legacy: 'ORMO', standup: 'ZUZU', intern: 'TAVO' };

/** realTraits = the shipped src/ sim with GameState.traits on (the flag, not the prototype patch). */
export type SimKind = 'real' | 'patched' | 'realTraits';

export interface MatchArgs {
  chars: [CharacterId, CharacterId];
  seed: number;
  level: BotLevel;
  arena: ArenaId;
  sim: SimKind;
  traits?: TraitConfig;
  /** Brix bot tries to jump over the rival when close (a human using her trait on purpose). */
  leapBot?: boolean;
  /** Harness-only stat overrides (tuning experiments), applied for this match and restored after. */
  stats?: Partial<Record<CharacterId, Partial<CharacterStats>>>;
  guns?: Partial<Record<GunKind, Partial<GunStats>>>;
}

export interface MatchResult {
  /** 1 fighter 0 won, 0 fighter 1 won, 0.5 draw. */
  score0: number;
  ticks: number;
  kos: [number, number];
  endReason: string;
  traits: [TraitState['stat'] | null, TraitState['stat'] | null];
  hash: number;
}

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** FNV-1a over the numbers that matter: a cheap fingerprint to prove two runs are identical. */
export const hashState = (s: GameState, h = 2166136261) => {
  const mix = (v: number) => {
    const x = Math.round(v * 1e6) | 0;
    h = Math.imul(h ^ x, 16777619);
  };
  mix(s.tick);
  mix(s.seed);
  mix(s.winner ?? 9);
  for (const f of s.fighters) {
    mix(f.x);
    mix(f.y);
    mix(f.vx);
    mix(f.vy);
    mix(f.hp);
    mix(f.kos);
    mix(f.dashCooldown);
    mix(f.weapon.mag);
    mix(Number.isFinite(f.weapon.reserve) ? f.weapon.reserve : -1);
  }
  mix(s.projectiles.length);
  return h >>> 0;
};

/** Wraps a bot so a Brix bot also tries to leapfrog: when close and level, jump toward and over the rival. */
const leapWrap = (id: number, seed: number, inner: (s: GameState) => InputState) => {
  const rand = mulberry32(seed ^ 0x2c1b3c6d);
  let until = -1;
  let dir: -1 | 1 = 1;
  let lastUp = false;
  return (s: GameState): InputState => {
    const out = inner(s);
    const me = s.fighters[id];
    const foe = s.fighters[1 - id];
    if (me.character !== 'hotfix' || s.phase !== 'fight' || me.respawn > 0 || foe.respawn > 0) return out;
    const dx = foe.x - me.x;
    if (s.tick >= until && me.onGround && Math.abs(dx) < 2.6 && Math.abs(foe.y - me.y) < 0.5 && rand() < 0.08) {
      until = s.tick + 40;
      dir = dx < 0 ? -1 : 1;
    }
    if (s.tick < until) {
      out.left = dir < 0;
      out.right = dir > 0;
      // First jump from the ground, the air jump near the apex if the feet are not yet over the head.
      const wantUp = me.onGround || (me.airJumps > 0 && me.vy < 1 && me.y < foe.y + 2.2 && Math.sign(foe.x - me.x) === dir);
      out.up = wantUp && !lastUp;
      // Leapfrog landed (dash is ready again mid-air): dash on, away from the rival.
      if (!me.onGround && me.dashCooldown <= 0 && Math.sign(foe.x - me.x) === -dir) out.dash = !s.fighters[id].prev.dash;
    }
    lastUp = out.up;
    return out;
  };
};

export const runMatch = (a: MatchArgs): MatchResult => {
  const tables: [Record<string, object>, Record<string, object> | undefined][] = [
    [CHARACTERS, a.stats],
    [GUNS, a.guns],
  ];
  const saved = tables.map(([t, o]) => Object.fromEntries(Object.keys(o ?? {}).map((k) => [k, { ...t[k] }])));
  tables.forEach(([t, o]) => Object.entries(o ?? {}).forEach(([k, v]) => Object.assign(t[k], v)));
  try {
    return runOne(a);
  } finally {
    tables.forEach(([t], i) => Object.entries(saved[i]).forEach(([k, v]) => Object.assign(t[k], v)));
  }
};

const runOne = (a: MatchArgs): MatchResult => {
  const sim = a.sim === 'patched' ? patched : real;
  TRAITS.cfg = a.traits ?? { ...DEFAULT_TRAITS, enabled: false };
  const s = sim.createGame(a.chars, a.seed, false, undefined, { arena: a.arena, countdownSeconds: OFFLINE_COUNTDOWN_SECONDS, ...(a.sim === 'realTraits' ? { traits: true } : {}) });
  const bots = [0, 1].map((id) => {
    const b = createBot(id, (a.seed * 7919 + id * 104729) | 0, a.level);
    return a.leapBot ? leapWrap(id, a.seed + id, b) : b;
  });
  const MAX = 60 * 200;
  while (s.phase !== 'over' && s.tick < MAX) sim.step(s, [bots[0](s), bots[1](s)]);
  const st = (i: number) => ((s.fighters[i] as { trait?: TraitState }).trait?.stat ?? null);
  return {
    score0: s.winner === 0 ? 1 : s.winner === 1 ? 0 : 0.5,
    ticks: s.tick,
    kos: [s.fighters[0].kos, s.fighters[1].kos],
    endReason: s.endReason ?? 'cap',
    traits: [st(0), st(1)],
    hash: hashState(s),
  };
};
