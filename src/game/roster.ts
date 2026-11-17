import { CHARACTERS } from './sim/constants';

import type { CharacterId } from './sim/types';

export interface RosterEntry {
  id: CharacterId;
  name: string;
  role: string;
  pitch: string;
  silhouette: string;
  accent: string;
}

/** Concept copy for the character select. All four are original to Merge Conflict. */
export const ROSTER: RosterEntry[] = [
  {
    id: 'hotfix',
    name: CHARACTERS.hotfix.name,
    role: 'On-call engineer',
    pitch: 'Has been awake since the 3 a.m. page. Tall, quick, high jumps, headset still on.',
    silhouette: 'Tall and thin, pointed hood',
    accent: '#ff6a3d',
  },
  {
    id: 'legacy',
    name: CHARACTERS.legacy.name,
    role: 'Senior maintainer',
    pitch: 'Wrote the module everyone is afraid to touch. Slow and wide, but the hardest to shove: Force Push barely moves him.',
    silhouette: 'Wide block, big beard',
    accent: '#3ddc84',
  },
  {
    id: 'standup',
    name: CHARACTERS.standup.name,
    role: 'Scrum lead',
    pitch: 'Keeps every meeting to fifteen minutes. Smallest target, fastest runner, two air jumps.',
    silhouette: 'Small body under a cloud of hair',
    accent: '#3ec5ff',
  },
  {
    id: 'intern',
    name: CHARACTERS.intern.name,
    role: 'First week',
    pitch: 'Pushed to main on day one. Balanced in every stat, carries a backpack bigger than their back.',
    silhouette: 'Beanie and an oversized backpack',
    accent: '#ffd23f',
  },
];

export const isCharacterId = (v: unknown): v is CharacterId =>
  typeof v === 'string' && ROSTER.some((r) => r.id === v);
