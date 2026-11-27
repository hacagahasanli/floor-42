/**
 * Signature-trait feedback rules (R-026 spec section 11.1-11.2). Pure numbers and tables: no three.js, no DOM, so the
 * timings are unit-tested. The sim only emits `{type:'trait', fighter, trait, x, y}`; everything here is presentation.
 */
import { TRAIT_CFG } from '../sim/traits';

import type { TraitId } from '../sim/types';

export const TRAIT_NAME: Record<TraitId, string> = {
  leapfrog: 'LEAPFROG',
  teaBreak: 'TEA BREAK',
  sugarRush: 'SUGAR RUSH',
  packedExtra: 'PACKED EXTRA',
};

/** Seconds between the event and its callout: Sugar Rush after the damage number, Packed Extra after the gun callout. */
export const CALLOUT_DELAY: Record<TraitId, number> = { leapfrog: 0, teaBreak: 0, sugarRush: 0.12, packedExtra: 0.15 };

/** A fighter's first this-many fires in a match say the word; later ones are a disc only. */
export const WORD_FIRES = 3;

const POP_IN = 0.18;
const HOLD = 0.7;
const OUT = 0.25;
const DISC_HOLD = 0.17;
const RISE_M = 0.3;
const FADE_REDUCED = 0.12;

/** Whole life of one callout in seconds: pill 1.13, disc 0.6. */
export const calloutLife = (fireNo: number) => (fireNo <= WORD_FIRES ? POP_IN + HOLD + OUT : POP_IN + DISC_HOLD + OUT);

export interface CalloutPose {
  scale: number;
  /** Metres above its anchor. */
  rise: number;
  alpha: number;
}

/**
 * The callout at `t` seconds into a life of `life` seconds. Full motion: scale 0 -> 1.15 -> 1 over 180 ms (spring), hold, then it
 * rises 0.3 m and fades over the last 250 ms. Reduced motion: no scale and no rise, 120 ms fade in and out.
 */
export const calloutPose = (t: number, life: number, reduced: boolean, out: CalloutPose): CalloutPose => {
  if (reduced) {
    out.scale = 1;
    out.rise = 0;
    out.alpha = Math.max(0, Math.min(1, t / FADE_REDUCED, (life - t) / FADE_REDUCED));
    return out;
  }
  const outStart = life - OUT;
  if (t < POP_IN) {
    const k = t / POP_IN;
    out.scale = k < 0.6 ? (k / 0.6) * 1.15 : 1.15 - ((k - 0.6) / 0.4) * 0.15;
  } else out.scale = 1;
  const o = t > outStart ? Math.min(1, (t - outStart) / OUT) : 0;
  out.rise = RISE_M * o * o * (3 - 2 * o);
  out.alpha = 1 - o;
  return out;
};

/** Sugar Rush speed lines: stretch with speed, clamped. */
export const lineStretch = (speed: number) => Math.max(0.5, Math.min(1.5, 0.5 + Math.abs(speed) / 8));

/** The badge's colour state from the sim's own timers. `fill` is the share of the refill done (0..1). */
export type BadgeState = 'ready' | 'lit' | 'cooldown';
export interface TraitHud {
  id: TraitId;
  state: BadgeState;
  fill: number;
}

export interface TraitTimers {
  rush: number;
  rushCd: number;
  leapCd: number;
}

/**
 * Where the HUD badge is for one fighter (specs 11.1, 11.2). Leapfrog: cooldown 2.5 s after a fire. Sugar Rush: lit for the 1.0 s
 * burst, then cooldown to 4.0 s. Tea Break: grey and refilling over his 3.0 s wait after damage, lit while he heals, ready at full
 * HP. Packed Extra: always ready (it pops on a pickup).
 */
export const badgeFor = (
  id: TraitId,
  t: TraitTimers,
  hp: { hp: number; max: number; sinceHit: number; delay: number },
): TraitHud => {
  switch (id) {
    case 'leapfrog':
      return t.leapCd > 0 ? { id, state: 'cooldown', fill: 1 - t.leapCd / TRAIT_CFG.leapfrog.cooldown } : { id, state: 'ready', fill: 1 };
    case 'sugarRush':
      if (t.rush > 0) return { id, state: 'lit', fill: 1 };
      return t.rushCd > 0 ? { id, state: 'cooldown', fill: 1 - t.rushCd / TRAIT_CFG.sugarRush.cooldown } : { id, state: 'ready', fill: 1 };
    case 'teaBreak':
      if (hp.hp >= hp.max) return { id, state: 'ready', fill: 1 };
      return hp.sinceHit >= hp.delay ? { id, state: 'lit', fill: 1 } : { id, state: 'cooldown', fill: Math.max(0, Math.min(1, hp.sinceHit / hp.delay)) };
    default:
      return { id, state: 'ready', fill: 1 };
  }
};
