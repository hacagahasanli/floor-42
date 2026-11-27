/**
 * Pure maths for the follow camera and the knockout beats (aliveness audit R-011, T1-T3).
 * No three.js, no allocation per call: results are written into a caller-owned `out`.
 */

export interface CamRig {
  /** The camera never comes closer than the full view distance divided by this. */
  minDiv: number;
  /** Margin kept around the pair, in world units, sideways and up/down. */
  padX: number;
  padY: number;
  /** Smoothing rates (per second) for panning and for the zoom. */
  kxy: number;
  kz: number;
}

/** Phones: close but not too close; the touch strips already eat the sides. */
export const PHONE_CAM: CamRig = { minDiv: 1.8, padX: 3.2, padY: 2.6, kxy: 3, kz: 3 };
/** Desktop: closer (max 1.6x), more room, and a zoom that is slower than the pan. */
export const DESKTOP_CAM: CamRig = { minDiv: 1.6, padX: 4.0, padY: 3.0, kxy: 2.5, kz: 1.8 };

/** Seconds the camera takes to lean in after FIGHT. */
export const FOLLOW_EASE_IN = 0.8;

/** Knockout beat: move 35% toward the victim and 15% closer for `hold` s, then ease back over `back` s. */
export const KO_BEAT = { hold: 0.6, back: 0.5, pull: 0.35, zoom: 0.85 };

/** Final knockout: slow-motion for `slow` s of real time, then `hold` s before the result card. */
export const FINALE = { scale: 0.3, slow: 0.9, hold: 0.4 };

/** 0..1 follow weight after `dt` more seconds: 0 while counting down, easing in over FOLLOW_EASE_IN after. */
export const nextFollowTime = (t: number, counting: boolean, dt: number) => (counting ? 0 : Math.min(FOLLOW_EASE_IN, t + dt));
export const followWeight = (t: number) => {
  const k = Math.min(1, Math.max(0, t / FOLLOW_EASE_IN));
  return k * k * (3 - 2 * k);
};

/** Strength of the knockout beat `since` seconds after the knockout: 1 while holding, then easing to 0. */
export const koBeatWeight = (since: number) => {
  if (since < 0) return 0;
  if (since <= KO_BEAT.hold) return 1;
  const k = (since - KO_BEAT.hold) / KO_BEAT.back;
  return k >= 1 ? 0 : 1 - k * k * (3 - 2 * k);
};

/** Sim speed during the final-KO slow-motion: `since` is real seconds since the slow-motion began (-1: not running). */
export const finaleScale = (since: number) => (since >= 0 && since < FINALE.slow ? FINALE.scale : 1);
/** True from the final KO until the slow-motion and the hold are over (the result card waits). */
export const finaleHolding = (pending: boolean, since: number) => pending || (since >= 0 && since < FINALE.slow + FINALE.hold);

export interface FollowInput {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  tanHalf: number;
  aspect: number;
  /** Fraction of the screen that is clear (not under HUD / touch strips). */
  fw: number;
  fh: number;
  /** Distance of the full establishing view. */
  dist: number;
  floor: number;
  ceiling: number;
  /** Half width of the arena plus the margin the view may show. */
  halfWidth: number;
  rig: CamRig;
  /** Knockout beat: strength 0..1 and the victim's position. */
  beat: number;
  beatX: number;
  beatY: number;
}

/** Where the camera wants to be to keep both fighters in the clear middle. */
export const followTarget = (i: FollowInput, out: { x: number; y: number; z: number }) => {
  const hwNeed = Math.abs(i.ax - i.bx) / 2 + i.rig.padX;
  const hhNeed = Math.abs(i.ay - i.by) / 2 + i.rig.padY;
  let z = Math.min(i.dist, Math.max(i.dist / i.rig.minDiv, hwNeed / (i.tanHalf * i.aspect * i.fw), hhNeed / (i.tanHalf * i.fh)));
  let x = (i.ax + i.bx) / 2;
  let y = (i.ay + i.by) / 2 + 1;
  if (i.beat > 0) {
    x += (i.beatX - x) * KO_BEAT.pull * i.beat;
    y += (i.beatY - y) * KO_BEAT.pull * i.beat;
    z *= 1 - (1 - KO_BEAT.zoom) * i.beat;
  }
  const hw = z * i.tanHalf * i.aspect * i.fw;
  const hh = z * i.tanHalf * i.fh;
  const maxX = Math.max(0, i.halfWidth - hw);
  out.x = Math.max(-maxX, Math.min(maxX, x));
  const lowY = i.floor - 1 + hh;
  const highY = i.ceiling + 1 - hh;
  out.y = lowY > highY ? (lowY + highY) / 2 : Math.max(lowY, Math.min(highY, y));
  out.z = z;
};
