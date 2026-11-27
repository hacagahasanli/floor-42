/**
 * Every line of player-facing game copy in one flat table. R-022: the developer-themed variant and the audience question
 * are gone (the game has one voice, plain words anyone reads at once). Pure (no React), so the table is unit-tested.
 */
import { ROSTER } from './roster';
import { RULES } from './sim/constants';
import { TRAIT_HP } from './sim/traits';

import type { ArenaId } from './sim/constants';
import type { CharacterId } from './sim/types';

interface FighterCopy {
  role: string;
  pitch: string;
}

const K = RULES.kosToWin;

const FIGHTERS: Record<CharacterId, FighterCopy> = {
  // Roles from roster-v3.md section 5. The pitch lines carry only what is true today (stats): each fighter's trait sentence
  // joins them when the systems designer's traits ship (roster.ts keeps the lines as `traitLine`).
  hotfix: { role: 'The Jammer', pitch: 'Tallest, highest jumps, on skates.' },
  legacy: { role: 'The Office Dad', pitch: 'Slow, wide and impossible to shove.' },
  standup: { role: 'The Tiny Coach', pitch: 'Smallest, fastest, three jumps.' },
  intern: { role: 'The Trailblazer', pitch: 'Balanced in every stat.' },
};

/**
 * The health line of How to play (R-026 section 11.3). With traits (offline) the fighters whose health differs are listed from the
 * data (TRAIT_HP), most health first; online (traits off) everybody has the same health and the old line stays.
 */
export const healthLine = (traits: boolean): string => {
  const tail = `A pistol shot point blank takes about half, a rocket takes it all. First to ${K} KOs wins.`;
  if (!traits) return `Everyone has ${RULES.hp} health. A pistol shot point blank takes half, a rocket takes it all. First to ${K} KOs wins.`;
  const odd = ROSTER.filter((r) => TRAIT_HP[r.id] !== RULES.hp)
    .sort((a, b) => TRAIT_HP[b.id] - TRAIT_HP[a.id])
    .map((r) => `${r.name} ${TRAIT_HP[r.id]}`);
  return `Most fighters have ${RULES.hp} health: ${odd.join(', ')}. ${tail}`;
};

export const COPY = {
  /** Under the logo on the main menu, and the page description. */
  tagline: 'Two coworkers. One grudge. No mercy.',
  /** The win condition, short (menu entry, online lobby). */
  goal: `First to ${K} KOs wins`,
  /** The sub-label under PLAY on the home screen (R-013 4.2, F-026); `{name}` is the current fighter, `{level}` the bot level. */
  playSub: `Fight the {level} bot as {name} · first to ${K}`,
  /** The VS doors' bottom line (R-013 4.4); `{n}` is the match length. */
  vsFirstTo: 'FIRST TO {n}',
  /** The title card before every round. `above`/`below` are the small lines around it ('' = none). */
  introAbove: '',
  introTitle: ['ONE FLOOR', 'NO MERCY'],
  introLine: `Two fighters. One floor of guns. First to ${K} KOs wins.`,
  introBelow: '',
  /** The last second of the countdown: ready, then go. */
  countdownReady: 'READY',
  countdownGo: 'FIGHT!',
  /** The little room tag under the timer. */
  hudRoom: 'open office',
  /** The result screen's coloured line before the score reason. */
  resultWin: 'The floor is yours.',
  resultLoss: 'They took the floor.',
  /** Final-KO band: the stamp and the line under it ({NAME} is the winner, upper case). */
  knockoutStamp: 'KNOCKOUT',
  knockoutLine: '{NAME} TAKES THE FLOOR',
  /** Result line when nobody is "you" (bot against bot): {NAME} is the winner. */
  resultDemo: '{NAME} took the floor.',
  resultDraw: 'Dead even.',
  drawSub: 'Time ran out with the score level.',
  /** How to play: the three rule cards (title, text). */
  howTo: [
    ['Knock them out', healthLine(true)],
    ['Grab a gun', 'Pistol in hand; an SMG, an Uzi, a shotgun, a sniper rail and rockets lie around the floor.'],
    ['Use the cover', 'Desks and the meeting table stop bullets. The glass breaks: push them through it.'],
  ],
  /** Loading tips in the lift. */
  tips: ([
    'Desks and the meeting table stop bullets: fight from behind them.',
    'Force Push sends incoming bullets back at the shooter.',
    'Push your rival into the glass for a wall splat.',
    'Dash makes you untouchable to bullets for a moment (every 5 s).',
    'Kick off the glass walls to climb fast.',
    'The rockets and the sniper rail wait up top.',
    'Stay out of the fight for a few seconds and your health comes back.',
    'The Uzi shreds up close, the SMG holds the middle, the pistol is the steadiest at range.',
    'A shotgun blast kills only point blank: get right in their face, then pump.',
  ]),
  /** Loading tips that are only true with signature traits (offline play): the lift adds them when traits are on. */
  traitTips: ['Ormo starts healing a second early: keep him busy.', 'Brix gets her dash back when she jumps over your head.'],
  /** Fighter flavour (character select, nameplates). */
  fighters: FIGHTERS,
};

export type Copy = typeof COPY;

/**
 * Match and result lines that name the place (docs/collab/CREATIVE/levels/arena-2.md section 7, F-043). COPY holds the
 * office's; an arena overrides them. No "office" or "floor" line may show around an Offsite match.
 */
export const ARENA_MATCH_COPY: Partial<Record<ArenaId, Pick<Copy, 'introTitle' | 'introLine' | 'knockoutLine' | 'resultWin' | 'resultLoss' | 'resultDemo'>>> = {
  offsite: {
    introTitle: ['TEAM-BUILDING', 'NO MERCY'],
    introLine: `Two fighters. One canyon of guns. First to ${K} KOs wins.`,
    knockoutLine: '{NAME} WINS THE OFFSITE',
    resultWin: 'You survived the offsite.',
    resultLoss: 'The offsite got you.',
    resultDemo: '{NAME} survived the offsite.',
  },
};

/** The whole table, with the arena's place-naming lines laid over it. */
export const copyFor = (arena: ArenaId = 'office'): Copy => (ARENA_MATCH_COPY[arena] ? { ...COPY, ...ARENA_MATCH_COPY[arena] } : COPY);
