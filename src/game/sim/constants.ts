import type { CharacterId, ItemKind } from './types';

export const DT = 1 / 60;

export const ARENA = {
  left: -10,
  right: 10,
  floor: 0,
  ceiling: 8,
  /** One-way platforms: you can jump up through them and drop down with Down. */
  platforms: [
    { x0: -7.2, x1: -3.6, y: 1.1 }, // left desk
    { x0: 3.6, x1: 7.2, y: 1.1 }, // right desk
    { x0: -2.2, x1: 2.2, y: 3.4 }, // hanging cable tray over the middle
  ],
  spawns: [
    { x: -5.4, y: 1.1 },
    { x: 5.4, y: 1.1 },
  ],
  itemSpawns: [
    { kind: 'keyboard' as ItemKind, x: 0, y: 3.4 },
    { kind: 'mug' as ItemKind, x: -6.6, y: 1.1 },
    { kind: 'mug' as ItemKind, x: 6.6, y: 1.1 },
    { kind: 'monitor' as ItemKind, x: -1.2, y: 0 },
    { kind: 'monitor' as ItemKind, x: 1.2, y: 0 },
  ],
};

export const RULES = {
  hp: 100,
  kosToWin: 5,
  roundSeconds: 90,
  countdownSeconds: 2.4,
  respawnSeconds: 1.4,
  spawnInvulnerable: 1.2,
};

export const PHYS = {
  gravity: 42,
  fastFall: 70,
  maxFall: 24,
  groundAccel: 90,
  airAccel: 42,
  groundFriction: 60,
  airFriction: 8,
  dashSpeed: 19,
  dashTime: 0.14,
  dashCooldown: 0.55,
  wallKickX: 12.5,
  wallSlide: 4, // max fall speed while hugging glass
  dropTime: 0.25,
};

export interface CharacterStats {
  name: string;
  speed: number;
  jump: number;
  weight: number; // knockback divisor
  reach: number; // multiplier on every melee reach
  height: number;
  width: number;
  airJumps: number;
}

export const CHARACTERS: Record<CharacterId, CharacterStats> = {
  hotfix: { name: 'Hotfix', speed: 9.4, jump: 15, weight: 0.92, reach: 1.18, height: 2.0, width: 0.7, airJumps: 1 },
  legacy: { name: 'Legacy', speed: 7.4, jump: 13.6, weight: 1.38, reach: 1.0, height: 1.85, width: 1.0, airJumps: 1 },
  standup: { name: 'Standup', speed: 10.6, jump: 15.6, weight: 0.8, reach: 0.9, height: 1.5, width: 0.7, airJumps: 2 },
  intern: { name: 'Intern', speed: 9.0, jump: 14.8, weight: 1.0, reach: 1.0, height: 1.7, width: 0.8, airJumps: 1 },
};

export interface ItemStats {
  name: string;
  hands: 1 | 2;
  /** Movement speed multiplier while holding it. */
  carrySpeed: number;
  throwSpeed: number;
  throwLift: number;
  throwDamage: number;
  throwKnockback: number;
  /** Fraction of frontal damage the item absorbs while held (monitor is a shield). */
  shield: number;
  breaksOnImpact: boolean;
  respawnSeconds: number;
}

export const ITEMS: Record<ItemKind, ItemStats> = {
  keyboard: {
    name: 'Keyboard',
    hands: 2,
    carrySpeed: 0.86,
    throwSpeed: 17,
    throwLift: 2,
    throwDamage: 11,
    throwKnockback: 11,
    shield: 0,
    breaksOnImpact: false,
    respawnSeconds: 0,
  },
  mug: {
    name: 'Hot coffee',
    hands: 1,
    carrySpeed: 1,
    throwSpeed: 13,
    throwLift: 6,
    throwDamage: 7,
    throwKnockback: 5,
    shield: 0,
    breaksOnImpact: true,
    respawnSeconds: 5,
  },
  monitor: {
    name: 'Monitor',
    hands: 2,
    carrySpeed: 0.78,
    throwSpeed: 11,
    throwLift: 3,
    throwDamage: 14,
    throwKnockback: 15,
    shield: 0.6,
    breaksOnImpact: false,
    respawnSeconds: 0,
  },
};

export interface AttackStats {
  duration: number;
  activeFrom: number;
  activeTo: number;
  reach: number;
  /** Vertical extent of the hitbox, centred on the chest. */
  span: number;
  damage: number;
  knockback: number;
  lift: number; // fraction of knockback sent upwards
  /** Extra knockback per m/s of the attacker's own speed: swinging with momentum. */
  momentum: number;
  slow: number;
  lunge: number;
}

export const ATTACKS: Record<'jab' | 'sweep' | 'bash' | 'splash' | 'push', AttackStats> = {
  jab: { duration: 0.24, activeFrom: 0.05, activeTo: 0.13, reach: 0.95, span: 0.8, damage: 6, knockback: 6.5, lift: 0.3, momentum: 0.2, slow: 0, lunge: 3 },
  sweep: { duration: 0.5, activeFrom: 0.16, activeTo: 0.34, reach: 2.1, span: 2.2, damage: 15, knockback: 14, lift: 0.45, momentum: 0.6, slow: 0, lunge: 2 },
  bash: { duration: 0.36, activeFrom: 0.1, activeTo: 0.2, reach: 1.15, span: 1.4, damage: 10, knockback: 17, lift: 0.2, momentum: 0.5, slow: 0, lunge: 7 },
  splash: { duration: 0.3, activeFrom: 0.06, activeTo: 0.16, reach: 1.25, span: 1.2, damage: 4, knockback: 3, lift: 0.2, momentum: 0, slow: 1.8, lunge: 0 },
  push: { duration: 0.32, activeFrom: 0.1, activeTo: 0.17, reach: 2.3, span: 1.8, damage: 3, knockback: 23, lift: 0.18, momentum: 0, slow: 0, lunge: 0 },
};

export const PUSH_COOLDOWN = 3;
export const WALL_SPLAT_SPEED = 11;
export const WALL_SPLAT_DAMAGE = 12;
export const SLOW_FACTOR = 0.55;
