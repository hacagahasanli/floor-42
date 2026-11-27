/**
 * Can Brix physically leapfrog each rival? Scripted, flat floor (OFFSITE with its platforms removed for the
 * test only), rival standing still or crouched, Brix running in from 8 m and jumping at a given distance,
 * with or without the air jump at the apex. Prints the take-off distances that trigger Leapfrog.
 *   npx tsx tools/balance/leapfrogReach.ts
 */
import { CHARACTERS, OFFSITE } from '../../src/game/sim/constants';
import { EMPTY_INPUT } from '../../src/game/sim/types';
import * as patched from './.gen/step';
import { buildPatchedStep } from './patchStep';
import { DEFAULT_TRAITS, TRAITS } from './traits';

import type { CharacterId, GameState, InputState } from '../../src/game/sim/types';
import type { TraitState } from './traits';

buildPatchedStep();
TRAITS.cfg = DEFAULT_TRAITS;
const saved = OFFSITE.platforms;
OFFSITE.platforms = [];

const attempt = (rival: CharacterId, takeoff: number, airJump: boolean, crouch: boolean) => {
  const s: GameState = patched.createGame(['hotfix', rival], 1, false, undefined, { arena: 'offsite', countdownSeconds: 0.02 });
  s.pickups = [];
  const [b, r] = s.fighters;
  Object.assign(b, { x: -8, y: 0, invulnerable: 0 });
  Object.assign(r, { x: 0, y: 0, invulnerable: 0 });
  b.dashCooldown = 5;
  let jumped = false;
  let second = false;
  let lastUp = false;
  for (let i = 0; i < 180; i++) {
    const up = (!jumped && r.x - b.x <= takeoff) || (jumped && airJump && !second && b.vy < 0.5 && !b.onGround);
    if (up && !lastUp) {
      if (!jumped) jumped = true;
      else second = true;
    }
    const inB: InputState = { ...EMPTY_INPUT, right: true, up: up && !lastUp, aimX: 10, aimY: 1 };
    lastUp = inB.up;
    patched.step(s, [inB, { ...EMPTY_INPUT, crouch, aimX: -10, aimY: 1 }]);
    if (((b as { trait?: TraitState }).trait?.stat.leaps ?? 0) > 0) return true;
  }
  return false;
};

for (const crouch of [false, true])
  for (const rival of ['hotfix', 'legacy', 'standup', 'intern'] as CharacterId[])
    for (const air of [false, true]) {
      const ok: number[] = [];
      for (let d = 0.5; d <= 7.01; d += 0.25) if (attempt(rival, d, air, crouch)) ok.push(+d.toFixed(2));
      const span = ok.length ? `${ok[0]}..${ok[ok.length - 1]} m (${ok.length} of 27 take-off points)` : 'never';
      console.log(`${rival.padEnd(8)} h=${CHARACTERS[rival].height}${crouch ? ' crouched' : ''}  ${air ? 'with air jump' : 'one jump    '}  ${span}`);
    }
OFFSITE.platforms = saved;
