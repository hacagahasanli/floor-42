/**
 * Signature traits, as data plus the hooks the patched sim calls (tools/balance/patchStep.ts).
 * This is the reference implementation for engineering: src/ is NOT edited here. The spec is
 * docs/collab/CREATIVE/characters/traits-balance.md.
 *
 * Slots (roster-v3): hotfix = BRIX (Leapfrog), legacy = ORMO (Tea Break), standup = ZUZU (Sugar Rush),
 * intern = TAVO (Packed Extra). Pure and deterministic: no RNG draws, no wall clock, so the sim's RNG
 * stream only changes through behaviour.
 */
import { CHARACTERS, CROUCH, DT, GUNS, RULES } from '../../src/game/sim/constants';

import type { CharacterId, Fighter, GameState, GunKind, Weapon } from '../../src/game/sim/types';

export interface TraitConfig {
  enabled: boolean;
  /** Harness only: traits active for these characters only (measures each trait's own value). Absent = all. */
  only?: CharacterId[];
  leapfrog: {
    /** Highest the feet may be above the rival's top at the crossing tick (m): over the head, not over the level. */
    maxClearance: number;
    /** Also give back the air dash, so the reset can be used before landing. */
    restoreAirDash: boolean;
    /** Seconds after one Leapfrog before the next one can refresh the dash again (spam guard). */
    cooldown: number;
  };
  teaBreak: {
    /** Seconds untouched before health comes back (everyone else: RULES.regenAfter = 4). */
    regenAfter: number;
  };
  sugarRush: {
    /** Run-speed multiplier while it lasts (ground and air top speed only; not dash, not jump). */
    speedMul: number;
    duration: number;
    /** Seconds from one trigger to the next possible one. Does not stack, does not refresh. */
    cooldown: number;
    /** Hits under this damage do not trigger (Force Push chip = 4 does; set > 4 to exclude it). */
    minDamage: number;
  };
  packedExtra: {
    /** Regular guns only. Magazine size multiplier (rounded): the gun also reloads to this size. */
    magMul: number;
    /** Reserve multiplier (rounded). */
    reserveMul: number;
    guns: GunKind[];
  };
}

/** Proposed base HP per slot (the only stat change; speed, jump, air jumps, weight and size stay). */
export const PROPOSED_HP: Record<CharacterId, number> = { hotfix: 110, legacy: 115, standup: 85, intern: 100 };
export const PROPOSED_STATS = Object.fromEntries(Object.entries(PROPOSED_HP).map(([k, hp]) => [k, { hp }]));
/** Power weapons must still kill anyone in one direct hit (docs/BALANCE.md): 120 >= the highest HP (115). */
export const PROPOSED_GUNS = { railgun: { damage: 120 }, launcher: { damage: 120 }, bomb: { damage: 120 } };

export const DEFAULT_TRAITS: TraitConfig = {
  enabled: true,
  leapfrog: { maxClearance: 2.5, restoreAirDash: true, cooldown: 2.5 },
  teaBreak: { regenAfter: 3 },
  sugarRush: { speedMul: 1.2, duration: 1.0, cooldown: 4, minDamage: 1 },
  packedExtra: { magMul: 1.25, reserveMul: 1.25, guns: ['smg', 'uzi', 'shotgun'] },
};

/** Per-fighter trait state. Optional on Fighter, so states without traits serialize exactly as today. */
export interface TraitState {
  rush: number;
  rushCd: number;
  leapUsed: boolean;
  leapCd: number;
  px: number;
  py: number;
  alive: boolean;
  /** Telemetry only (not needed by the rules). */
  stat: { leaps: number; rushes: number; teaHeal: number; extraFired: number };
}

type TF = Fighter & { trait?: TraitState; weapon: Weapon & { cap?: number; bonus?: number; bonusUsed?: number } };

export const TRAITS = {
  cfg: DEFAULT_TRAITS as TraitConfig,

  on(f: Fighter, c: CharacterId) {
    return this.cfg.enabled && f.character === c && (!this.cfg.only || this.cfg.only.includes(c));
  },

  ts(f: Fighter): TraitState {
    const t = f as TF;
    if (!t.trait)
      t.trait = { rush: 0, rushCd: 0, leapUsed: false, leapCd: 0, px: f.x, py: f.y, alive: false, stat: { leaps: 0, rushes: 0, teaHeal: 0, extraFired: 0 } };
    return t.trait;
  },

  /** Called once per updateFighter, next to the other timers. */
  tick(f: Fighter) {
    if (!this.cfg.enabled) return;
    const t = this.ts(f);
    t.rush = Math.max(0, t.rush - DT);
    t.rushCd = Math.max(0, t.rushCd - DT);
    t.leapCd = Math.max(0, t.leapCd - DT);
    // Telemetry: health Ormo regains in the window only his trait opens (sim adds the regen right after this).
    if (this.on(f, 'legacy') && f.respawn <= 0 && f.hp > 0 && f.hp < CHARACTERS.legacy.hp) {
      const s = f.sinceHit + DT;
      if (s >= this.cfg.teaBreak.regenAfter && s < RULES.regenAfter)
        t.stat.teaHeal += Math.min(RULES.regenPerSecond * DT, CHARACTERS.legacy.hp - f.hp);
    }
  },

  regenAfter(f: Fighter) {
    return this.on(f, 'legacy') ? this.cfg.teaBreak.regenAfter : RULES.regenAfter;
  },

  speedMul(f: Fighter) {
    if (!this.on(f, 'standup')) return 1;
    return (f as TF).trait && (f as TF).trait!.rush > 0 ? this.cfg.sugarRush.speedMul : 1;
  },

  /** After damage lands (applyHit). Only a rival's hit triggers Sugar Rush: no self rocket, no wall splat. */
  onHit(_state: GameState, target: Fighter, hit: { attacker: number; damage: number }) {
    if (!this.on(target, 'standup')) return;
    if (hit.attacker === target.id || hit.damage < this.cfg.sugarRush.minDamage || target.hp <= 0) return;
    const t = this.ts(target);
    if (t.rushCd > 0) return;
    t.rush = this.cfg.sugarRush.duration;
    t.rushCd = this.cfg.sugarRush.cooldown;
    t.stat.rushes += 1;
  },

  pickupWeapon(f: Fighter, w: Weapon): Weapon {
    if (!this.on(f, 'intern')) return w;
    const pe = this.cfg.packedExtra;
    if (!pe.guns.includes(w.kind)) return w;
    const g = GUNS[w.kind];
    const cap = Math.round(g.mag * pe.magMul);
    const reserve = Math.round(g.reserve * pe.reserveMul);
    const bonus = cap + reserve - (g.mag + g.reserve);
    return Object.assign(w, { mag: cap, reserve, cap, bonus, bonusUsed: 0 });
  },

  /** A weapon's magazine size: its own (Packed Extra) or the gun table's. Weapon.cap is absent for everyone else. */
  magSize(w: Weapon) {
    return (w as TF['weapon']).cap ?? GUNS[w.kind].mag;
  },

  /** After both fighters moved this tick (step), before projectiles. Leapfrog detection + telemetry. */
  afterMove(state: GameState) {
    if (!this.cfg.enabled) return;
    for (const f of state.fighters) {
      const t = this.ts(f);
      const alive = f.respawn <= 0;
      if (this.on(f, 'hotfix') && alive) {
        if (f.onGround) t.leapUsed = false;
        const r = state.fighters.find((o) => o.id !== f.id)!;
        const rt = this.ts(r);
        if (!t.leapUsed && t.leapCd <= 0 && !f.onGround && t.alive && rt.alive && r.respawn <= 0 && state.phase === 'fight') {
          const before = Math.sign(t.px - rt.px);
          const after = Math.sign(f.x - r.x);
          const top = r.y + bodyH(r);
          // Feet above the rival's top on both ticks of the crossing, and not from far above.
          const clean = Math.min(f.y, t.py) >= top && f.y - top <= this.cfg.leapfrog.maxClearance;
          if (before !== 0 && after !== 0 && before !== after && clean) {
            t.leapUsed = true;
            t.leapCd = this.cfg.leapfrog.cooldown;
            f.dashCooldown = 0;
            if (this.cfg.leapfrog.restoreAirDash) f.airDashes = Math.max(f.airDashes, 1);
            t.stat.leaps += 1;
          }
        }
      }
      if (this.on(f, 'intern')) {
        const w = f.weapon as TF['weapon'];
        if (w.bonus) w.bonusUsed = Math.max(w.bonusUsed ?? 0, w.bonus - (w.mag + w.reserve));
        const last = (t as TraitState & { lastW?: TF['weapon'] }).lastW;
        if (last && last !== w && last.bonusUsed) t.stat.extraFired += last.bonusUsed;
        (t as TraitState & { lastW?: TF['weapon'] }).lastW = w;
      }
    }
    // Positions for next tick's crossing test (after the Brix pass, so both use last tick's values).
    for (const f of state.fighters) {
      const t = this.ts(f);
      t.px = f.x;
      t.py = f.y;
      t.alive = f.respawn <= 0;
    }
  },
};

/** Same as step.ts bodyHeight (CROUCH eases the hitbox). Duplicated to avoid importing the patched module here. */
const bodyH = (f: Fighter) => CHARACTERS[f.character].height * (1 - (1 - CROUCH.height) * (f.crouch ?? 0));
