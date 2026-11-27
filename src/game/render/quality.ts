/**
 * Performance tiers. "Auto" picks one from what the device tells us; the player can force Low, Medium or High
 * in Settings > Graphics. Pure, so it is tested without a browser.
 */
import type { Quality, Settings } from '../settings';

export type Tier = 'low' | 'medium' | 'high';

export interface DeviceFacts {
  touch: boolean;
  /** navigator.hardwareConcurrency (0 when unknown). */
  cores: number;
  /** navigator.deviceMemory in GB (0 when unknown). */
  memory: number;
  dpr: number;
}

/** What a tier allows: the pixel ratio cap, shadows, and a frame cap for the menu backdrop. */
export const TIER_PROFILE: Record<Tier, { maxPixelRatio: number; shadows: boolean; menuFps: number }> = {
  low: { maxPixelRatio: 1, shadows: false, menuFps: 30 },
  medium: { maxPixelRatio: 1.5, shadows: true, menuFps: 60 },
  high: { maxPixelRatio: 2, shadows: true, menuFps: 60 },
};

export const autoTier = (f: DeviceFacts): Tier => {
  const weak = (f.cores > 0 && f.cores <= 4) || (f.memory > 0 && f.memory <= 3);
  if (f.touch) return weak ? 'low' : 'medium';
  if (f.cores > 0 && f.cores <= 2) return 'low';
  // A 4-core laptop is usually integrated graphics: start at medium, the frame-time governor cuts further.
  return weak ? 'medium' : 'high';
};

export const resolveTier = (q: Quality, f: DeviceFacts): Tier => (q === 'auto' ? autoTier(f) : q);

export interface RenderProfile {
  tier: Tier;
  pixelRatio: number;
  shadows: boolean;
  menuFps: number;
}

export const renderProfile = (s: Pick<Settings, 'quality' | 'shadows' | 'resScale'>, f: DeviceFacts): RenderProfile => {
  const tier = resolveTier(s.quality, f);
  const p = TIER_PROFILE[tier];
  return {
    tier,
    pixelRatio: Math.max(0.5, Math.min(f.dpr || 1, p.maxPixelRatio) * s.resScale),
    shadows: s.shadows && p.shadows,
    menuFps: p.menuFps,
  };
};

/** The facts of this browser (safe to call during server rendering: returns a desktop default). */
export const deviceFacts = (): DeviceFacts => {
  if (typeof window === 'undefined') return { touch: false, cores: 8, memory: 8, dpr: 1 };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    touch: window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window,
    cores: nav.hardwareConcurrency ?? 0,
    memory: nav.deviceMemory ?? 0,
    dpr: window.devicePixelRatio || 1,
  };
};
