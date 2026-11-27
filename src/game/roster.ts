import { CHARACTERS } from './sim/constants';

import type { CharacterId } from './sim/types';

export interface RosterEntry {
  id: CharacterId;
  name: string;
  silhouette: string;
  /** The fill colour of the fighter (jersey, vest, track top, flannel): the UI accent. */
  accent: string;
  /** The light rim tint the fighter is lit with (roster-v2 section 4); the model uses the same value. */
  rim: string;
  /** One line of personality (the first sentence of the CD's sheet). */
  personality: string;
  /** The signature trait's label, upper case (a chip on the select card). Gameplay for it is not built yet. */
  trait: string;
  /** The CD's one-sentence description of the trait. NOT live: show it only when the trait ships. */
  traitLine: string;
  /**
   * Where the head sits in the 360x440 portrait render (`renderPortraits`, pose `ready`): centre x, y and width as fractions of the image.
   * Measured from the projected head vertices (helmet, quiff, hair puffs and headlamp count; braids, tie and moustache tips do not).
   * F-045 adds `top` (the highest point of the head or, for TAVO, of his pack) and `h` (head height, head top to chin), also as
   * fractions of the image: the select and menu cards put `top` 8 % below the card's top edge and scale by `h`.
   * Re-measure with docs/collab/shots/roster-v3-polish/measure.mjs after any change to a head, hat or pack.
   */
  headAnchor: { x: number; y: number; w: number; top: number; h: number };
}

/**
 * The four fighters (R-022b / R-024, docs/collab/CREATIVE/characters/roster-v3.md). All original to Nalbaki Games.
 * Ids stay internal (old links, saves and online): hotfix = BRIX, legacy = ORMO, standup = ZUZU, intern = TAVO.
 * Role and pitch live in copy.ts.
 */
export const ROSTER: RosterEntry[] = [
  {
    id: 'hotfix',
    name: CHARACTERS.hotfix.name,
    silhouette: 'Tall, black helmet with a red stripe, on skates',
    accent: '#E5392F',
    rim: '#FFB3A8',
    personality: 'Runs the mailroom on roller skates and plays roller derby every weekend.',
    trait: 'LEAPFROG',
    traitLine: "Jump clean over the rival's head and her dash is ready again, instantly.",
    headAnchor: { x: 0.44, y: 0.19, w: 0.23, top: 0.065, h: 0.213 },
  },
  {
    id: 'legacy',
    name: CHARACTERS.legacy.name,
    silhouette: 'Wide square block, silver walrus moustache',
    accent: '#14A37F',
    rim: '#9FF0D8',
    personality: 'Thirty years at the company, never ran once.',
    trait: 'TEA BREAK',
    traitLine: 'His health starts coming back sooner after he stops fighting.',
    headAnchor: { x: 0.52, y: 0.25, w: 0.31, top: 0.13, h: 0.258 },
  },
  {
    id: 'standup',
    name: CHARACTERS.standup.name,
    silhouette: 'Small, two round hair puffs, gold mitts',
    accent: '#F25CB8',
    rim: '#FFC4E6',
    personality: 'Shortest person in the company, self-appointed coach.',
    trait: 'SUGAR RUSH',
    traitLine: 'Every time she gets hit she runs faster for a moment.',
    headAnchor: { x: 0.51, y: 0.41, w: 0.44, top: 0.262, h: 0.305 },
  },
  {
    id: 'intern',
    name: CHARACTERS.intern.name,
    silhouette: 'Huge pack higher than his head, headlamp',
    accent: '#2456D6',
    rim: '#A9C2FF',
    personality: 'Still packed for a week on a day trip, but now he is the guy who leads the hike.',
    trait: 'PACKED EXTRA',
    traitLine: 'Every regular gun he picks up has a bit more ammo.',
    headAnchor: { x: 0.52, y: 0.32, w: 0.23, top: 0.07, h: 0.3 },
  },
];

export const isCharacterId = (v: unknown): v is CharacterId =>
  typeof v === 'string' && ROSTER.some((r) => r.id === v);
