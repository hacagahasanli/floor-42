import { chooseAwards } from '~/game/awards';

import { FD_COPY } from './copy';
import { fighterView } from './fighters';

import type { AwardId, PlayerTally } from '~/game/awards';
import type { IconName, WeaponName } from './Icon';
import type { CharacterId } from '~/game/sim/types';

/**
 * What the Field Day result screen shows, computed from the match end state. Pure (no React, no DOM), so the wording rules,
 * "You" vs P1/P2 vs a fighter's name, the loss and draw variants and the award slots are unit-tested.
 */
export type ResultMode = 'solo' | 'online' | 'twoPlayer' | 'demo';
export type Outcome = 'win' | 'loss' | 'draw';

export interface ResultFighter {
  character: CharacterId;
  kos: number;
  stats: { damage: number; accuracy: number; deaths: number; bestStreak: number; shots: number };
  tally: PlayerTally;
}

export interface ResultInput {
  mode: ResultMode;
  /** The HUD's winner: 0 = you / P1, 1 = the rival / P2, -1 or null = a draw. */
  winner: number | null;
  /** [you / P1, rival / P2]. */
  fighters: [ResultFighter, ResultFighter];
  /** The per-match random index into a two-line cell of the pill tables (F-075), modulo the cell's length. */
  lossLine?: number;
}

export type MarginBand = 'shutout' | 'big' | 'clear' | 'close';
/** F-075: margin m = |a - b|; close = 1, clear = 2-3, big = 4+; shutout = a decisive match with the loser on 0 KOs. */
export const marginBand = (score: [number, number], decisive: boolean): MarginBand => {
  const m = Math.abs(score[0] - score[1]);
  if (decisive && Math.min(score[0], score[1]) === 0) return 'shutout';
  return m >= 4 ? 'big' : m >= 2 ? 'clear' : 'close';
};

export interface AwardSlot {
  x: number;
  y: number;
  rot: number;
}
/** Where the medallions hang (b14, design px in the 1280 column): two on the left, staggered, one on the right. */
export const AWARD_SLOTS: AwardSlot[] = [
  { x: 60, y: 150, rot: -3 },
  { x: 300, y: 346, rot: 2 },
  { x: 990, y: 170, rot: 3 },
];
/** 1 award hangs left-high; 2 hang left-high and right; 3 fill all slots. */
export const slotsFor = (n: number): AwardSlot[] => (n >= 3 ? AWARD_SLOTS : n === 2 ? [AWARD_SLOTS[0], AWARD_SLOTS[2]] : n === 1 ? [AWARD_SLOTS[1]] : []);

export interface AwardView {
  id: AwardId;
  title: string;
  line: string;
  holder: 0 | 1;
  /** The sticker. The disc is white with a ring in the holder's accent (R-027), so an award carries no colour of its own. */
  icon: { kind: 'icon'; name: IconName } | { kind: 'weapon'; name: WeaponName };
}

const AWARD_LOOK: Record<AwardId, Pick<AwardView, 'icon'>> = {
  pinata: { icon: { kind: 'icon', name: 'burst' } },
  boomerang: { icon: { kind: 'icon', name: 'again' } },
  bouncy: { icon: { kind: 'icon', name: 'jump' } },
  sharpshooter: { icon: { kind: 'weapon', name: 'pistol' } },
  sponge: { icon: { kind: 'icon', name: 'fighter' } },
  hitter: { icon: { kind: 'weapon', name: 'shotgun' } },
  streak: { icon: { kind: 'icon', name: 'flag' } },
  ribbon: { icon: { kind: 'icon', name: 'pennant' } },
};

export interface ResultModel {
  outcome: Outcome;
  /** 0 or 1, null on a draw. */
  winner: 0 | 1 | null;
  loser: 0 | 1 | null;
  /** The title without the "WINS!", for the sr text and the letter pop. */
  title: string;
  /** The score pill after the title: "5 – 3 · clean win" (F-075). */
  pill: string;
  score: [number, number];
  /** Whether the local player (index 0) is the loser: the loser's card shows the YOU chip. */
  youLost: boolean;
  awards: AwardView[];
}

/** "FIGHTER 3" -> "Fighter 3". */
export const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, a: string, b: string) => a + b.toUpperCase());

export const nameOf = (mode: ResultMode, i: 0 | 1, character: CharacterId): string =>
  mode === 'twoPlayer' ? `P${i + 1}` : fighterView(character).name;

export const buildResult = (input: ResultInput): ResultModel => {
  const { mode, fighters } = input;
  const C = FD_COPY.result;
  const w = input.winner === 0 || input.winner === 1 ? input.winner : null;
  const youPlay = mode === 'solo' || mode === 'online';
  const outcome: Outcome = w === null ? 'draw' : youPlay && w === 1 ? 'loss' : 'win';
  const score: [number, number] = [fighters[0].kos, fighters[1].kos];
  const scoreText = `${score[0]} – ${score[1]}`;

  // F-075: one line by margin. solo / online: the win table when you win, the loss table when you lose; 2P and demo always
  // the win table (it names nobody); a draw the draw line in every mode.
  const pick = (cell: readonly string[]) => cell[(input.lossLine ?? 0) % cell.length];
  const band = marginBand(score, w !== null);
  const line =
    outcome === 'draw'
      ? C.drawLine
      : outcome === 'loss'
        ? pick(C.lossLines[band === 'shutout' ? 'big' : band])
        : pick(C.winLines[band]);
  const pill = `${scoreText} · ${line}`;

  const who = (i: 0 | 1) => (youPlay && i === 0 ? 'You' : mode === 'twoPlayer' ? `P${i + 1}` : titleCase(fighterView(fighters[i].character).name));
  const input2 = (f: ResultFighter) => ({
    tally: f.tally,
    accuracy: f.stats.accuracy,
    shots: f.stats.shots,
    damage: f.stats.damage,
    bestStreak: f.stats.bestStreak,
    kos: f.kos,
  });
  const awards: AwardView[] = chooseAwards([input2(fighters[0]), input2(fighters[1])], w).map((a) => ({
    id: a.id,
    title: C.awards[a.id].title,
    line: C.awards[a.id].line(who(a.holder), a.value),
    holder: a.holder,
    ...AWARD_LOOK[a.id],
  }));

  return {
    outcome,
    winner: w,
    loser: w === null ? null : w === 0 ? 1 : 0,
    title: w === null ? C.draw : C.wins(nameOf(mode, w, fighters[w].character)),
    pill,
    score,
    youLost: outcome === 'loss',
    awards,
  };
};
