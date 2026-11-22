/**
 * Capture-only camera director (trailer and store clips). It is never created in the shipped game: `startArena`
 * only builds it when the page is opened with `?capture=1` AND it is not a production build.
 *
 * It stays on the game's real side-on angle (camera on the z axis, looking straight at the fight plane) and only
 * decides framing: where to look, how far back to stand, and a small dutch roll on impacts. Nothing here touches
 * the simulation or the render of the world, so what it shows is what the game shows.
 *
 * Shots (see the camera-systems skill: exponential smoothing, deadzone, look-ahead, clamp the view not the centre):
 * - follow: a close frame on the pair, pulled back only as far as both fighters need; the centre leans toward the
 *   fighter who is moving or shooting (look-ahead) and ignores small moves (deadzone).
 * - impact push: a hit or an explosion eases the camera in toward the point of contact, then it relaxes.
 * - KO: a stronger, longer push on the fallen fighter, a touch of roll, then it releases.
 * - establishing: for the first seconds of a take, and on demand, a wide frame of the whole office.
 * Slight low angle: the eye sits a little under the look target (about 4 degrees), never more.
 */
import { ARENA } from '../sim/constants';

import type { GameEvent } from '../sim/types';

export interface DirectorFighter {
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  /** Seconds until respawn (> 0 = knocked out). */
  respawn: number;
}

export interface DirectorInput {
  dt: number;
  fighters: readonly DirectorFighter[];
  /** Vertical field of view in degrees and the canvas aspect (width / height). */
  fov: number;
  aspect: number;
}

export interface DirectorShot {
  /** Where the camera looks (world units, fight plane z = 0). */
  x: number;
  y: number;
  /** Camera distance from the fight plane. */
  z: number;
  /** Dutch roll in radians. */
  roll: number;
  /** Extra metres the eye sits below the look target (slight low angle). */
  low: number;
}

export interface DirectorOptions {
  /** Closest the camera may get (distance). */
  minDistance?: number;
  /** Seconds of wide establishing frame at the start. */
  establishing?: number;
  /** Farthest the camera may stand (portrait: keeps fighters big; the pair may then be cropped to favour the action). */
  maxDistance?: number;
  /** Seconds the camera holds the whole office after a KO, once the push has settled (0 = never). */
  wideAfterKo?: number;
  /** 0..1: how tight the follow frame is. 1 = as close as both fighters allow. */
  tightness?: number;
}

/** True only in dev builds with `?capture=1` (or `?capture=portrait`), so the shipped game is never affected. */
export const captureRequested = (): boolean => {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('capture');
};

/** Frame-rate independent smoothing factor (camera-systems skill). */
export const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export const createCaptureDirector = (opts: DirectorOptions = {}) => {
  const minDistance = opts.minDistance ?? 12;
  const tightness = opts.tightness ?? 0.85;
  const maxDistance = opts.maxDistance ?? Infinity;
  let establishing = opts.establishing ?? 0;
  const wideAfterKo = opts.wideAfterKo ?? 0;
  let wideDelay = -1; // counts down after a KO; the wide beat starts when it reaches 0
  let wideHold = 0;

  const cur: DirectorShot = { x: 0, y: ARENA.ceiling / 2, z: 40, roll: 0, low: 0.8 };
  let init = false;
  /** Impact push: 0..1 strength, and where it points. */
  let push = 0;
  let pushX = 0;
  let pushY = 0;
  let pushRate = 2.5;
  let rollKick = 0;
  let rollSign = 1;
  let focusX = 0;
  let focusY = 0;
  let lead = 0;
  let lastAction: { x: number; y: number; at: number } | null = null;
  let t = 0;

  const notify = (e: GameEvent) => {
    switch (e.type) {
      case 'hit':
        if (e.damage >= 1) {
          push = Math.max(push, e.damage >= 50 || e.power > 12 ? 0.55 : 0.3);
          pushX = e.x;
          pushY = e.y;
          pushRate = 2.2;
          rollKick = Math.max(rollKick, 0.012);
          rollSign = e.x >= focusX ? 1 : -1;
          lastAction = { x: e.x, y: e.y, at: t };
        }
        break;
      case 'explosion':
        push = Math.max(push, 0.7);
        pushX = e.x;
        pushY = e.y;
        pushRate = 1.8;
        rollKick = Math.max(rollKick, 0.02);
        lastAction = { x: e.x, y: e.y, at: t };
        break;
      case 'wallSplat':
        push = Math.max(push, 0.6);
        pushX = e.side < 0 ? ARENA.left : ARENA.right;
        pushY = e.y;
        pushRate = 1.6;
        rollKick = Math.max(rollKick, 0.018);
        break;
      case 'ko':
        push = 1;
        pushX = e.x;
        pushY = e.y;
        pushRate = 1.1;
        rollKick = 0.03;
        rollSign = e.x >= focusX ? 1 : -1;
        lastAction = { x: e.x, y: e.y, at: t };
        if (wideAfterKo > 0) wideDelay = 1.5;
        break;
      case 'shot':
        lastAction = { x: e.x, y: e.y, at: t };
        break;
      default:
        break;
    }
  };

  /** Ask for the wide establishing frame for `seconds` (e.g. right after a round starts). */
  const wide = (seconds: number) => {
    wideHold = Math.max(wideHold, seconds);
  };

  const update = ({ dt, fighters, fov, aspect }: DirectorInput): DirectorShot => {
    t += dt;
    const tanHalf = Math.tan((fov * Math.PI) / 360);
    const [a, b] = fighters;
    const padX = 3.4;
    const padY = 2.6;
    const fit = Math.max((Math.abs(a.x - b.x) / 2 + padX) / (tanHalf * aspect), (Math.abs(a.y - b.y) / 2 + padY) / tanHalf);
    const aliveA = a.respawn <= 0;
    const aliveB = b.respawn <= 0;
    // Look at the pair; when one is down, at whoever is still standing (the fallen one stays in frame via padding).
    const wA = aliveA ? 1 : 0.35;
    const wB = aliveB ? 1 : 0.35;
    let mx = (a.x * wA + b.x * wB) / (wA + wB);
    let my = (a.y * wA + b.y * wB) / (wA + wB) + 1.2; // chest height
    // Look-ahead toward where the faster/firing fighter is heading, eased so a direction flip never whips.
    const speedA = aliveA ? a.vx : 0;
    const speedB = aliveB ? b.vx : 0;
    const leadGoal = Math.max(-2.2, Math.min(2.2, (speedA + speedB) * 0.18));
    lead += (leadGoal - lead) * ease(2, dt);
    mx += lead;
    // Too far apart to fit at maxDistance (portrait): favour the fighter where the action is, keep the other at the edge.
    if (fit > maxDistance) {
      const recent = lastAction && t - lastAction.at < 2 ? lastAction.x : null;
      const ref = recent ?? (aliveA ? a.x : b.x);
      const actor = Math.abs(a.x - ref) <= Math.abs(b.x - ref) ? a : b;
      const other = actor === a ? b : a;
      mx = actor.x * 0.8 + other.x * 0.2 + lead;
      my = actor.y * 0.8 + other.y * 0.2 + 1.2;
    }
    // Deadzone: the focus only follows once the target leaves a small box around it.
    const dzx = 0.9;
    const dzy = 0.6;
    if (!init) {
      focusX = mx;
      focusY = my;
    }
    const ox = mx - focusX;
    const oy = my - focusY;
    if (Math.abs(ox) > dzx) focusX += ox - Math.sign(ox) * dzx;
    if (Math.abs(oy) > dzy) focusY += oy - Math.sign(oy) * dzy;

    // Distance: close, but both fighters (plus padding) stay inside the frame.
    const wideZ = Math.max((ARENA.right + 1.5) / (tanHalf * aspect), (ARENA.ceiling / 2 + 2) / tanHalf);
    const closeZ = Math.max(minDistance, fit);
    // tightness blends between "everything fits just" and the wide frame.
    let z = Math.min(maxDistance, wideZ, closeZ + (1 - tightness) * (wideZ - closeZ) * 0.6);

    let x = focusX;
    let y = focusY;

    // Impact push toward the point of contact (the camera moves in and slides toward the hit).
    push = Math.max(0, push - dt * (pushRate * 0.45));
    const p = push * push * (3 - 2 * push); // smoothstep
    z *= 1 - 0.3 * p;
    x += (pushX - x) * 0.35 * p;
    y += (pushY - y) * 0.3 * p;

    // Establishing / wide hold.
    if (wideDelay > 0) {
      wideDelay -= dt;
      if (wideDelay <= 0) {
        wideHold = Math.max(wideHold, wideAfterKo);
        wideDelay = -1;
      }
    }
    const wideNow = establishing > 0 || wideHold > 0;
    if (establishing > 0) establishing -= dt;
    if (wideHold > 0) wideHold -= dt;
    if (wideNow) {
      z = wideZ;
      x = 0;
      y = ARENA.ceiling / 2 + 0.6;
    }

    // Clamp the VIEW to the office (not the centre): no outside-the-wall peeking, centre on an axis that does not fit.
    const hw = z * tanHalf * aspect;
    const hh = z * tanHalf;
    const maxX = Math.max(0, ARENA.right + 1.2 - hw);
    x = Math.max(-maxX, Math.min(maxX, x));
    const lowY = ARENA.floor - 0.8 + hh;
    const highY = ARENA.ceiling + 0.5 - hh;
    y = lowY > highY ? (lowY + highY) / 2 : Math.max(lowY, Math.min(highY, y));

    if (!init) {
      cur.x = x;
      cur.y = y;
      cur.z = z;
      init = true;
    } else {
      // Zooming in is quicker than pulling back, so a hit lands and the camera settles gently.
      const zRate = z < cur.z ? 5 : 1.6;
      cur.x += (x - cur.x) * ease(3.4, dt);
      cur.y += (y - cur.y) * ease(3.4, dt);
      cur.z += (z - cur.z) * ease(zRate, dt);
    }
    // Roll: a small kick on impact, damped back to level.
    rollKick = Math.max(0, rollKick - dt * 0.05);
    cur.roll += (rollSign * rollKick - cur.roll) * ease(8, dt);
    // Slight low angle, scaled with how close we are (never more than ~4 degrees).
    cur.low = Math.min(1.1, cur.z * 0.07);
    return cur;
  };

  return { notify, update, wide };
};

export type CaptureDirector = ReturnType<typeof createCaptureDirector>;
