/**
 * Every line of developer humour in one table, each with a plain fighting-game twin.
 * On first entry the player says whether they are a developer or a regular player (Settings > Accessibility
 * changes it later); `developer` gets the merge-conflict jokes, `regular` gets punchy words anyone reads at once.
 * Same game, same mechanics: only the words change. Pure (no React), so the table is unit-tested.
 */
import { RULES } from './sim/constants';

import type { CharacterId } from './sim/types';

export type CopyVariant = 'developer' | 'regular';
/** What Settings stores: 'unset' until the first-entry question is answered. */
export type Audience = CopyVariant | 'unset';

/** The variant shown before the player has answered (and on a games portal, always). */
export const DEFAULT_VARIANT: CopyVariant = 'regular';

/**
 * A games-portal build keeps every line plain and never asks (same rule as the studio's other portal builds:
 * no developer jokes for a general audience). Set NEXT_PUBLIC_PORTAL=1 at build time.
 */
export const PORTAL_BUILD = process.env.NEXT_PUBLIC_PORTAL === '1';

export const resolveVariant = (audience: Audience, portal = PORTAL_BUILD): CopyVariant =>
  portal || audience === 'unset' ? DEFAULT_VARIANT : audience;

/** True when the first-entry question should show. */
export const shouldAskAudience = (audience: Audience, portal = PORTAL_BUILD) => !portal && audience === 'unset';

interface FighterCopy {
  role: string;
  pitch: string;
}

interface Entry<T> {
  developer: T;
  regular: T;
}

const K = RULES.kosToWin;

export const COPY = {
  /** Under the logo on the main menu, and the page description. */
  tagline: {
    developer: 'Code review got personal.',
    regular: 'One office. Two fighters. No mercy.',
  },
  /** The win condition, short (menu entry, online lobby). */
  goal: {
    developer: `First to ${K} KOs takes the merge`,
    regular: `First to ${K} KOs wins`,
  },
  /** The title card before every round. `above`/`below` are the small lines around it ('' = none). */
  introAbove: { developer: '<<<<<<< HEAD', regular: '' },
  introTitle: {
    developer: ['CODE REVIEW', 'GOT PERSONAL'],
    regular: ['ONE FLOOR', 'NO MERCY'],
  },
  introLine: {
    developer: `Two developers. One floor of guns. First to ${K} KOs takes the merge.`,
    regular: `Two fighters. One floor of guns. First to ${K} KOs wins.`,
  },
  introBelow: { developer: '>>>>>>> their-branch', regular: '' },
  /** The last second of the countdown: ready, then go. */
  countdownReady: { developer: 'git merge', regular: 'READY' },
  countdownGo: { developer: 'CONFLICT!', regular: 'FIGHT!' },
  /** The little room tag under the timer. */
  hudRoom: { developer: 'agents-know · merge room', regular: 'open office' },
  /** The result screen's coloured line before the score reason. */
  resultWin: { developer: 'Conflict resolved, your way.', regular: 'The floor is yours.' },
  resultLoss: { developer: 'Conflict resolved, their way.', regular: 'They took the floor.' },
  resultDraw: { developer: 'Still conflicted.', regular: 'Dead even.' },
  drawSub: {
    developer: 'Time ran out with nothing resolved.',
    regular: 'Time ran out with the score level.',
  },
  /** How to play: the three rule cards (title, text). */
  howTo: {
    developer: [
      ['Knock them out', `Everyone has ${RULES.hp} health. A pistol shot point blank takes half, a rocket takes it all. First to ${K} KOs takes the merge.`],
      ['Grab a gun', 'Pistol in hand; an SMG, an Uzi, a shotgun, a sniper rail and rockets lie around the floor.'],
      ['Use the office', 'Desks and the meeting table stop bullets. The glass breaks: push them through it, like a bad commit.'],
    ],
    regular: [
      ['Knock them out', `Everyone has ${RULES.hp} health. A pistol shot point blank takes half, a rocket takes it all. First to ${K} KOs wins.`],
      ['Grab a gun', 'Pistol in hand; an SMG, an Uzi, a shotgun, a sniper rail and rockets lie around the floor.'],
      ['Use the cover', 'Desks and the meeting table stop bullets. The glass breaks: push them through it.'],
    ],
  },
  /** Loading tips in the lift: true tips first, the developer set adds a little flavour. */
  tips: {
    developer: [
      'Desks and the meeting table stop bullets: fight from behind them.',
      'Force Push sends incoming bullets back at the shooter. Works on rivals, not on main.',
      'Push your rival into the glass for a wall splat.',
      'Dash makes you untouchable to bullets for a moment (every 5 s).',
      'Kick off the glass walls to climb fast.',
      'The rockets and the sniper rail wait on the top floor: production access, six shots.',
      'Stay out of the fight for a few seconds and your health comes back. Like a weekend.',
      'The Uzi shreds up close, the SMG holds the middle, the pistol is the steadiest at range.',
      'A shotgun blast kills only point blank: get right in their face, then pump.',
    ],
    regular: [
      'Desks and the meeting table stop bullets: fight from behind them.',
      'Force Push sends incoming bullets back at the shooter.',
      'Push your rival into the glass for a wall splat.',
      'Dash makes you untouchable to bullets for a moment (every 5 s).',
      'Kick off the glass walls to climb fast.',
      'The rockets and the sniper rail wait on the top floor.',
      'Stay out of the fight for a few seconds and your health comes back.',
      'The Uzi shreds up close, the SMG holds the middle, the pistol is the steadiest at range.',
      'A shotgun blast kills only point blank: get right in their face, then pump.',
    ],
  },
  /** Fighter flavour (character select, nameplates). Names and stats stay the same in both. */
  fighters: {
    developer: {
      hotfix: { role: 'On-call engineer', pitch: 'Has been awake since the 3 a.m. page. Tall, quick, high jumps, headset still on.' },
      legacy: { role: 'Senior maintainer', pitch: 'Wrote the module everyone is afraid to touch. Slow and wide, but the hardest to shove: Force Push barely moves him.' },
      standup: { role: 'Scrum lead', pitch: 'Keeps every meeting to fifteen minutes. Smallest target, fastest runner, two air jumps.' },
      intern: { role: 'First week', pitch: 'Pushed to main on day one. Balanced in every stat, carries a backpack bigger than their back.' },
    },
    regular: {
      hotfix: { role: 'High flyer', pitch: 'Tall and quick with the highest jumps. Never takes the headset off.' },
      legacy: { role: 'Heavyweight', pitch: 'Slow and wide, but the hardest to shove: a Force Push barely moves him.' },
      standup: { role: 'Speedster', pitch: 'Smallest target, fastest runner, two air jumps. Gone before you aim.' },
      intern: { role: 'All-rounder', pitch: 'Balanced in every stat. Carries a backpack bigger than their back.' },
    },
  } satisfies Entry<Record<CharacterId, FighterCopy>>,
} satisfies Record<string, Entry<unknown>>;

export type CopyTable = typeof COPY;
export type Copy = { [K in keyof CopyTable]: CopyTable[K]['developer'] | CopyTable[K]['regular'] };

/** One variant of the whole table. */
export const copyFor = (variant: CopyVariant): Copy =>
  Object.fromEntries(Object.entries(COPY).map(([k, v]) => [k, v[variant]])) as Copy;
