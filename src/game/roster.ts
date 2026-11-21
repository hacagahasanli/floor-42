import { CHARACTERS } from './sim/constants';

import type { CharacterId } from './sim/types';

export interface RosterEntry {
  id: CharacterId;
  name: string;
  silhouette: string;
  accent: string;
}

/** The four fighters. All original to Nalbaki Games. Role and pitch live in copy.ts (developer and regular). */
export const ROSTER: RosterEntry[] = [
  {
    id: 'hotfix',
    name: CHARACTERS.hotfix.name,
    silhouette: 'Tall and thin, pointed hood',
    accent: '#ff6a3d',
  },
  {
    id: 'legacy',
    name: CHARACTERS.legacy.name,
    silhouette: 'Wide block, big beard',
    accent: '#3ddc84',
  },
  {
    id: 'standup',
    name: CHARACTERS.standup.name,
    silhouette: 'Small body under a cloud of hair',
    accent: '#3ec5ff',
  },
  {
    id: 'intern',
    name: CHARACTERS.intern.name,
    silhouette: 'Beanie and an oversized backpack',
    accent: '#ffd23f',
  },
];

export const isCharacterId = (v: unknown): v is CharacterId =>
  typeof v === 'string' && ROSTER.some((r) => r.id === v);
