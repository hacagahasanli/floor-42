/** One headless match between two brains on the shipped sim (traits on, offline countdown). Deterministic. */
import { parentPort, workerData } from 'node:worker_threads';

import { createBot, EASY_GUN_GRACE_TICKS } from '../../../src/game/sim/bot';
import { OFFLINE_COUNTDOWN_SECONDS } from '../../../src/game/sim/constants';
import { createGame, step } from '../../../src/game/sim/step';
import { createDecent, createMasher, createStrafer } from './players';
import { createSmartBot } from './smartBot';
import { TRAIT_HP } from '../../../src/game/sim/traits';

// Harness-only experiment: per-character max HP override (JSON in env SMART_HP), e.g. {"standup":82}.
Object.assign(TRAIT_HP, JSON.parse(process.env.SMART_HP ?? '{}'));

import type { BotLevel } from '../../../src/game/sim/bot';
import type { ArenaId } from '../../../src/game/sim/constants';
import type { CharacterId, GameState, InputState } from '../../../src/game/sim/types';

export interface VsJob {
  specs: [string, string];
  chars: [CharacterId, CharacterId];
  seed: number;
  arena: ArenaId;
  /** Which slot side A sits in. */
  aSlot: number;
}
export interface Tele {
  dashes: number;
  pushes: number;
  splats: number;
  pickups: number;
  shots: number;
  hits: number;
  damage: number;
  power: number;
  leaps: number;
  rushes: number;
}
export interface VsResult {
  score0: number;
  ticks: number;
  kos: [number, number];
  tele: [Tele, Tele];
}

const brain = (spec: string, id: number, seed: number): ((s: GameState) => InputState) => {
  const [kind, level] = spec.split(':');
  if (kind === 'bot') return createBot(id, seed, level as BotLevel);
  if (kind === 'smart') return createSmartBot(id, seed, level as BotLevel);
  if (kind === 'masher') return createMasher(id, seed);
  if (kind === 'strafer') return createStrafer(id, seed);
  if (kind === 'decent') return createDecent(id, seed);
  throw new Error(`unknown spec ${spec}`);
};

export const runVs = (j: VsJob): VsResult => {
  // The easy bot plays with the gun grace the game gives it (game.ts: fighter 1 = the bot, only at easy).
  const easySlot = j.specs.findIndex((s) => s.endsWith(':easy'));
  const s = createGame(j.chars, j.seed, false, undefined, {
    arena: j.arena,
    countdownSeconds: OFFLINE_COUNTDOWN_SECONDS,
    // Online states carry no traits (env SMART_NOTRAITS=1 reproduces the server bot's matches).
    traits: !process.env.SMART_NOTRAITS,
    ...(easySlot >= 0 && j.specs[1 - easySlot].indexOf(':') < 0 ? { gunGrace: { fighter: easySlot, ticks: EASY_GUN_GRACE_TICKS } } : {}),
  });
  const b = [brain(j.specs[0], 0, (j.seed * 7919) | 0), brain(j.specs[1], 1, (j.seed * 7919 + 104729) | 0)];
  const tele: [Tele, Tele] = [
    { dashes: 0, pushes: 0, splats: 0, pickups: 0, shots: 0, hits: 0, damage: 0, power: 0, leaps: 0, rushes: 0 },
    { dashes: 0, pushes: 0, splats: 0, pickups: 0, shots: 0, hits: 0, damage: 0, power: 0, leaps: 0, rushes: 0 },
  ];
  const MAX = 60 * 200;
  while (s.phase !== 'over' && s.tick < MAX) {
    step(s, [b[0](s), b[1](s)]);
    for (const e of s.events) {
      if (e.type === 'dash' && e.fighter !== undefined) tele[e.fighter].dashes++;
      if (e.type === 'push' && e.fighter !== undefined) tele[e.fighter].pushes++;
      if (e.type === 'wallSplat' && e.fighter !== undefined) tele[1 - e.fighter].splats++;
      if (e.type === 'pickup' && e.gun !== 'bomb') tele[e.fighter].pickups++;
      if (e.type === 'trait' && e.trait === 'leapfrog') tele[e.fighter].leaps++;
      if (e.type === 'trait' && e.trait === 'sugarRush') tele[e.fighter].rushes++;
      if (e.type === 'pickup' && (e.gun === 'railgun' || e.gun === 'launcher')) tele[e.fighter].power++;
    }
  }
  s.fighters.forEach((f, i) => Object.assign(tele[i], { shots: f.stats.shots, hits: f.stats.hits, damage: f.stats.damage }));
  return { score0: s.winner === 0 ? 1 : s.winner === 1 ? 0 : 0.5, ticks: s.tick, kos: [s.fighters[0].kos, s.fighters[1].kos], tele };
};

if (parentPort && workerData) parentPort.postMessage((workerData as VsJob[]).map(runVs));
