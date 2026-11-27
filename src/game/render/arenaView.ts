import { buildArena } from './arena';
import { buildOffsite } from './arenaOffsite';

import type * as THREE from 'three';
import type { ArenaId } from '../sim/constants';
import type { Tier } from './quality';
import type { ArenaView } from './arena';

export type { ArenaView } from './arena';

export interface ArenaBuildOptions {
  tier?: Tier;
  /** Seeds the render-only wind (OFFSITE). Never the sim's random numbers. */
  seed?: number;
  reducedMotion?: boolean;
}

/** One place that maps an arena id to its renderer, so the match and the menu showcase read the same registry. */
export const buildArenaFor = (id: ArenaId, scene: THREE.Scene, itemCount: number, opts: ArenaBuildOptions = {}): ArenaView =>
  id === 'offsite' ? buildOffsite(scene, itemCount, opts) : buildArena(scene, itemCount);
