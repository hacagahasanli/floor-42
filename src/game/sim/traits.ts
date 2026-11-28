// Signature traits (docs/collab/CREATIVE/characters/traits-balance.md). Reference: tools/balance/traits.ts.
// Everything here is gated by GameState.traits, which only createGame's `extra.traits` sets (offline modes).
// Online never sets it, so online states, snapshots and behaviour are unchanged. Pure and deterministic: no RNG, no clock.

import { CHARACTERS, CROUCH, DT, GUNS, RULES } from './constants';

import type { CharacterId, Fighter, GameState, GunKind, TraitId, Weapon } from './types';

/** Per-slot max HP with traits on (the only stat change). Slot ids: hotfix BRIX, legacy ORMO, standup ZUZU, intern TAVO. */
export const TRAIT_HP: Record<CharacterId, number> = {
  hotfix: 110,
  legacy: 115,
  standup: 82, // F-084: 82 with the smart bot (normal/hard roster back inside the band)
  intern: 100,
};
/** Power weapons still one-shot anyone (max HP 115). */
export const TRAIT_POWER_DAMAGE = 120;
const POWER_GUNS: readonly GunKind[] = ['railgun', 'launcher', 'bomb'];

export const TRAIT_CFG = {
  leapfrog: { maxClearance: 2.5, cooldown: 2.5 },
  teaBreak: { regenAfter: 3 },
  sugarRush: { speedMul: 1.2, duration: 1.0, cooldown: 4, minDamage: 1 },
  packedExtra: {
    magMul: 1.25,
    reserveMul: 1.25,
    guns: ['smg', 'uzi', 'shotgun'] as readonly GunKind[],
  },
} as const;

/** Per-fighter trait state. Plain numbers and booleans only (it travels in JSON snapshots). */
export interface TraitState {
  rush: number;
  rushCd: number;
  leapUsed: boolean;
  leapCd: number;
  /** Last tick's position and liveness, for the Leapfrog crossing test. */
  px: number;
  py: number;
  alive: boolean;
}

export const newTraitState = (f: Fighter): TraitState => ({
  rush: 0,
  rushCd: 0,
  leapUsed: false,
  leapCd: 0,
  px: f.x,
  py: f.y,
  alive: false,
});

const ts = (f: Fighter): TraitState => (f.trait ??= newTraitState(f));

const bodyH = (f: Fighter) =>
  CHARACTERS[f.character].height * (1 - (1 - CROUCH.height) * (f.crouch ?? 0));

const emit = (state: GameState, fighter: number, trait: TraitId, x: number, y: number) =>
  state.events.push({ type: 'trait', fighter, trait, x, y });

/** Max health of this fighter in this match. */
export const maxHp = (state: GameState, f: Fighter) =>
  state.traits ? TRAIT_HP[f.character] : CHARACTERS[f.character].hp;

/** Seconds untouched before health returns (Tea Break shortens it for ORMO). */
export const regenDelay = (state: GameState, f: Fighter) =>
  state.traits && f.character === 'legacy' ? TRAIT_CFG.teaBreak.regenAfter : RULES.regenAfter;

export const gunDamage = (state: GameState, kind: GunKind) =>
  state.traits && POWER_GUNS.includes(kind) ? TRAIT_POWER_DAMAGE : GUNS[kind].damage;

/** Sugar Rush: top run speed multiplier. */
export const speedMul = (state: GameState, f: Fighter) =>
  state.traits && f.character === 'standup' && f.trait && f.trait.rush > 0
    ? TRAIT_CFG.sugarRush.speedMul
    : 1;

/** A weapon's magazine size: its own (Packed Extra) or the gun table's. */
export const magSize = (w: Weapon) => w.cap ?? GUNS[w.kind].mag;

/** Full load (magazine + reserve) of a fresh copy of this weapon, for the low-ammo assist. */
export const fullLoad = (w: Weapon) =>
  w.cap === undefined
    ? GUNS[w.kind].mag + GUNS[w.kind].reserve
    : w.cap + Math.round(GUNS[w.kind].reserve * TRAIT_CFG.packedExtra.reserveMul);

/** Once per updateFighter, next to the other timers, before the regen check. */
export const tickTraits = (state: GameState, f: Fighter) => {
  if (!state.traits) return;
  const t = ts(f);
  t.rush = Math.max(0, t.rush - DT);
  t.rushCd = Math.max(0, t.rushCd - DT);
  t.leapCd = Math.max(0, t.leapCd - DT);
  // Tea Break: tell the renderer the tick his health starts to come back (only the window his trait opens).
  if (f.character === 'legacy' && f.respawn <= 0 && f.hp > 0 && f.hp < TRAIT_HP.legacy) {
    const before = f.sinceHit;
    const d = TRAIT_CFG.teaBreak.regenAfter;
    if (before < d && before + DT >= d) emit(state, f.id, 'teaBreak', f.x, f.y);
  }
};

/** After damage lands (applyHit). Only a rival's hit triggers Sugar Rush: no own rocket, no wall splat. */
export const onTraitHit = (
  state: GameState,
  target: Fighter,
  hit: { attacker: number; damage: number },
) => {
  if (!state.traits || target.character !== 'standup') return;
  const cfg = TRAIT_CFG.sugarRush;
  if (hit.attacker === target.id || hit.damage < cfg.minDamage || target.hp <= 0) return;
  const t = ts(target);
  if (t.rushCd > 0) return;
  t.rush = cfg.duration;
  t.rushCd = cfg.cooldown;
  emit(state, target.id, 'sugarRush', target.x, target.y);
};

/** Packed Extra: the gun TAVO picks up. */
export const packWeapon = (state: GameState, f: Fighter, w: Weapon): Weapon => {
  const pe = TRAIT_CFG.packedExtra;
  if (!state.traits || f.character !== 'intern' || !pe.guns.includes(w.kind)) return w;
  const cap = Math.round(GUNS[w.kind].mag * pe.magMul);
  w.mag = cap;
  w.cap = cap;
  w.reserve = Math.round(GUNS[w.kind].reserve * pe.reserveMul);
  emit(state, f.id, 'packedExtra', f.x, f.y);
  return w;
};

/** After both fighters moved this tick, before projectiles: Leapfrog detection, then remember positions. */
export const afterMoveTraits = (state: GameState) => {
  if (!state.traits) return;
  const cfg = TRAIT_CFG.leapfrog;
  for (const f of state.fighters) {
    const t = ts(f);
    if (f.character !== 'hotfix' || f.respawn > 0) continue;
    if (f.onGround) t.leapUsed = false;
    const r = state.fighters.find((o) => o.id !== f.id);
    if (!r) continue;
    const rt = ts(r);
    if (
      t.leapUsed ||
      t.leapCd > 0 ||
      f.onGround ||
      !t.alive ||
      !rt.alive ||
      r.respawn > 0 ||
      state.phase !== 'fight'
    )
      continue;
    const before = Math.sign(t.px - rt.px);
    const after = Math.sign(f.x - r.x);
    const top = r.y + bodyH(r);
    // Feet above the rival's top on both ticks of the crossing, and not from far above.
    const clean = Math.min(f.y, t.py) >= top && f.y - top <= cfg.maxClearance;
    if (before !== 0 && after !== 0 && before !== after && clean) {
      t.leapUsed = true;
      t.leapCd = cfg.cooldown;
      f.dashCooldown = 0;
      f.airDashes = Math.max(f.airDashes, 1);
      emit(state, f.id, 'leapfrog', f.x, f.y);
    }
  }
  // Positions for next tick's crossing test (after the pass, so every fighter uses last tick's values).
  for (const f of state.fighters) {
    const t = ts(f);
    t.px = f.x;
    t.py = f.y;
    t.alive = f.respawn <= 0;
  }
};
