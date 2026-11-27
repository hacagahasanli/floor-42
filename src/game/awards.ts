/**
 * Match awards (Direction B spec 7). Render-side only: nothing here touches the sim. A `MatchTally` reads the same GameEvents the
 * renderer already handles (jumps, Force Push deflections, explosions, hits) and counts what the sim's own `stats` do not; the
 * result screen then asks `chooseAwards` for the (up to) three most remarkable ones.
 *
 * Counted per player (index 0 = you / P1, 1 = the rival / P2):
 *   jumps        every 'jump' event (ground, air and wall jumps)
 *   pushedBack   bullets turned round by Force Push ('deflect' events)
 *   rocketsTaken a launcher blast that hurt you: a 'hit' on you in the same event batch as a launcher 'explosion' by your rival
 *   damageTaken  the damage of every 'hit' on you (damage you took, health you got back later still counts)
 * The sim's accuracy comes from HudFighter.stats (hits / shots), so it is passed in, not counted again.
 *
 * Not tracked (needs per-frame position sampling): KING OF THE HILL (time on one platform). The pool below has five awards.
 */
import { GRENADE } from './sim/constants';

import type { GameEvent } from './sim/types';

export interface PlayerTally {
  jumps: number;
  pushedBack: number;
  rocketsTaken: number;
  damageTaken: number;
}

export const emptyTally = (): PlayerTally => ({ jumps: 0, pushedBack: 0, rocketsTaken: 0, damageTaken: 0 });

export interface MatchTally {
  /** Feed every event the renderer handles, in order. */
  feed: (e: GameEvent) => void;
  /** Call after each batch of events (one sim tick, or one presentation frame): blasts only explain hits of the same batch. */
  endBatch: () => void;
  reset: () => void;
  snapshot: () => [PlayerTally, PlayerTally];
}

/**
 * `slotOf` maps a sim fighter id to 0 (you) or 1 (the rival). Events of a fighter outside 0/1 are ignored.
 */
export const createMatchTally = (slotOf: (fighterId: number) => 0 | 1 | null): MatchTally => {
  let t: [PlayerTally, PlayerTally] = [emptyTally(), emptyTally()];
  let blastBy: number | null = null;
  return {
    feed: (e) => {
      switch (e.type) {
        case 'jump': {
          const s = e.fighter === undefined ? null : slotOf(e.fighter);
          if (s !== null) t[s].jumps += 1;
          break;
        }
        case 'deflect': {
          const s = e.fighter === undefined ? null : slotOf(e.fighter);
          if (s !== null) t[s].pushedBack += 1;
          break;
        }
        case 'explosion':
          // Only the launcher's blast is a "rocket" (bombs have their own radius).
          blastBy = e.radius === GRENADE.radius && e.owner !== undefined ? e.owner : null;
          break;
        case 'hit': {
          const s = slotOf(e.fighter);
          if (s === null) break;
          t[s].damageTaken += Math.max(0, e.damage);
          if (blastBy !== null && e.by === blastBy && e.fighter !== blastBy) t[s].rocketsTaken += 1;
          break;
        }
        default:
          break;
      }
    },
    endBatch: () => {
      blastBy = null;
    },
    reset: () => {
      t = [emptyTally(), emptyTally()];
      blastBy = null;
    },
    snapshot: () => [{ ...t[0] }, { ...t[1] }],
  };
};

export type AwardId = 'pinata' | 'boomerang' | 'bouncy' | 'sharpshooter' | 'sponge';

export interface AwardInput {
  tally: PlayerTally;
  /** The sim's accuracy in percent and its shots (a shotgun blast is one shot). */
  accuracy: number;
  shots: number;
}

export interface Award {
  id: AwardId;
  /** 0 = you / P1, 1 = the rival / P2. */
  holder: 0 | 1;
  /** The number the description shows. */
  value: number;
  /** How remarkable it was (value over the award's reference); the three highest win. */
  score: number;
}

/**
 * Per award: the reference size of a "big" showing, and the least that counts at all. A match that is too short to have
 * earned an award does not show it (so a screen can have fewer than three medallions, never a "took 0 rockets").
 */
export const AWARD_RULES: Record<AwardId, { ref: number; min: number }> = {
  pinata: { ref: 3, min: 1 },
  boomerang: { ref: 3, min: 1 },
  bouncy: { ref: 40, min: 6 },
  sharpshooter: { ref: 60, min: 30 },
  sponge: { ref: 400, min: 100 },
};

/** Fixed order of the pool; ties on score fall back to it so the result is stable. */
export const AWARD_ORDER: AwardId[] = ['pinata', 'boomerang', 'sharpshooter', 'bouncy', 'sponge'];

const valueOf = (id: AwardId, p: AwardInput): number => {
  switch (id) {
    case 'pinata':
      return p.tally.rocketsTaken;
    case 'boomerang':
      return p.tally.pushedBack;
    case 'bouncy':
      return p.tally.jumps;
    case 'sharpshooter':
      // At least four shots: 1 of 1 is not marksmanship.
      return p.shots >= 4 ? p.accuracy : 0;
    case 'sponge':
      return Math.round(p.tally.damageTaken);
  }
};

/**
 * The (up to) three awards of a match. Each award goes to whoever has the bigger number (a tie gives it to nobody); the top
 * three by `value / ref` are shown, but no player gets all three while another award is available for the other player.
 */
export const chooseAwards = (players: [AwardInput, AwardInput], max = 3): Award[] => {
  const candidates: Award[] = [];
  for (const id of AWARD_ORDER) {
    const a = valueOf(id, players[0]);
    const b = valueOf(id, players[1]);
    if (a === b) continue;
    const holder: 0 | 1 = a > b ? 0 : 1;
    const value = Math.max(a, b);
    const rule = AWARD_RULES[id];
    if (value < rule.min) continue;
    candidates.push({ id, holder, value, score: value / rule.ref });
  }
  candidates.sort((x, y) => y.score - x.score || AWARD_ORDER.indexOf(x.id) - AWARD_ORDER.indexOf(y.id));
  const picked: Award[] = [];
  const count = [0, 0];
  // First pass: at most two per player, so both fighters usually appear on the screen.
  for (const c of candidates) {
    if (picked.length >= max) break;
    if (count[c.holder] >= 2) continue;
    picked.push(c);
    count[c.holder] += 1;
  }
  // Second pass: if that left a slot free and only one player has awards, fill it anyway.
  for (const c of candidates) {
    if (picked.length >= max) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked.sort((x, y) => y.score - x.score || AWARD_ORDER.indexOf(x.id) - AWARD_ORDER.indexOf(y.id));
};
