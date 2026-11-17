import type { CharacterId, GunKind } from './types';

export const DT = 1 / 60;

export type PlatformStyle = 'desk' | 'table' | 'counter' | 'fridge' | 'shelf' | 'cabinet' | 'walkway' | 'tray';

export interface Platform {
  x0: number;
  x1: number;
  y: number;
  style: PlatformStyle;
}

/**
 * Floor 42, open-plan. Every surface is a one-way platform: jump up through it,
 * press Down to drop. Bullets do not go through furniture, so desks are cover.
 */
export const ARENA = {
  left: -18,
  right: 18,
  floor: 0,
  ceiling: 13.5,
  platforms: [
    { x0: -17.9, x1: -16.1, y: 3.4, style: 'shelf' },
    { x0: -15.5, x1: -11.5, y: 1.1, style: 'desk' },
    { x0: -9.6, x1: -6.2, y: 1.1, style: 'desk' },
    { x0: -14.5, x1: -11.5, y: 6.0, style: 'cabinet' },
    { x0: -8.2, x1: -2.6, y: 4.4, style: 'walkway' },
    { x0: -3, x1: 3, y: 1.0, style: 'table' },
    { x0: -1.6, x1: 1.6, y: 7.2, style: 'tray' },
    { x0: 2.6, x1: 8.2, y: 4.4, style: 'walkway' },
    { x0: 9, x1: 13.6, y: 1.2, style: 'counter' },
    { x0: 11.5, x1: 14.5, y: 6.0, style: 'cabinet' },
    { x0: 15.8, x1: 17.9, y: 2.8, style: 'fridge' },
    // The mezzanine: balconies along both glass walls, and a beam across the middle.
    { x0: -17.9, x1: -9.5, y: 9.4, style: 'walkway' },
    { x0: 9.5, x1: 17.9, y: 9.4, style: 'walkway' },
    { x0: -4.5, x1: 4.5, y: 10.6, style: 'walkway' },
  ] as Platform[],
  /** Respawn points on every level. You come back at one far from your rival. */
  spawns: [
    { x: -13.5, y: 1.1 },
    { x: 11.3, y: 1.2 },
    { x: 0, y: 1.0 },
    { x: -5.4, y: 4.4 },
    { x: 5.4, y: 4.4 },
    { x: -14, y: 9.4 },
    { x: 14, y: 9.4 },
  ],
  /**
   * One gun per floor: each spawn picks a random spot on its level and a random gun.
   * Taking it starts a timer before the next one appears.
   */
  gunSpawns: [
    { spots: [{ x: 0, y: 1.0 }, { x: -8, y: 1.1 }, { x: 16.9, y: 2.8 }], kinds: ['smg', 'shotgun'] },
    { spots: [{ x: -5.4, y: 4.4 }, { x: 5.4, y: 4.4 }, { x: 0, y: 7.2 }], kinds: ['smg', 'shotgun', 'launcher'] },
    { spots: [{ x: -15, y: 9.4 }, { x: 15, y: 9.4 }, { x: 0, y: 10.6 }], kinds: ['railgun', 'launcher'] },
  ] as { spots: { x: number; y: number }[]; kinds: GunKind[] }[],
  dropEvery: 25,
  dropSlots: 1,
  dropKinds: ['smg', 'shotgun', 'railgun', 'launcher'] as GunKind[],
};

export const RULES = {
  hp: 100,
  kosToWin: 5,
  roundSeconds: 150,
  countdownSeconds: 2.4,
  respawnSeconds: 3,
  spawnInvulnerable: 1.4,
  gunRespawn: 15,
};

export const PHYS = {
  gravity: 42,
  fastFall: 70,
  maxFall: 24,
  groundAccel: 90,
  airAccel: 50,
  groundFriction: 60,
  airFriction: 8,
  dashSpeed: 19,
  dashTime: 0.16,
  dashCooldown: 0.7,
  wallKickX: 12.5,
  wallSlide: 4,
  dropTime: 0.25,
};

export interface CharacterStats {
  name: string;
  speed: number;
  jump: number;
  weight: number;
  hp: number;
  height: number;
  width: number;
  airJumps: number;
}

export const CHARACTERS: Record<CharacterId, CharacterStats> = {
  hotfix: { name: 'Hotfix', speed: 9.4, jump: 16.5, weight: 0.92, hp: 100, height: 2.0, width: 0.7, airJumps: 1 },
  legacy: { name: 'Legacy', speed: 7.6, jump: 15.2, weight: 1.38, hp: 100, height: 1.85, width: 1.0, airJumps: 1 },
  standup: { name: 'Standup', speed: 10.6, jump: 17, weight: 0.8, hp: 100, height: 1.5, width: 0.7, airJumps: 2 },
  intern: { name: 'Intern', speed: 9.0, jump: 16.2, weight: 1.0, hp: 100, height: 1.7, width: 0.8, airJumps: 1 },
};

export interface GunStats {
  name: string;
  /** Seconds between shots while the trigger is held. */
  rate: number;
  mag: number;
  reserve: number;
  reloadTime: number;
  damage: number;
  knockback: number;
  speed: number;
  spread: number; // radians, random cone
  pellets: number;
  life: number;
  projectile: 'bullet' | 'pellet' | 'rail' | 'grenade';
  /** Kick back on the shooter, in m/s. */
  recoil: number;
  /** Slows your run while you carry it. */
  carry: number;
}

/** Lethal on purpose: two pistol hits drop anyone, a rocket or a rail drops them in one. */
export const GUNS: Record<GunKind, GunStats> = {
  pistol: { name: 'Pistol', rate: 0.38, mag: 8, reserve: Infinity, reloadTime: 1, damage: 50, knockback: 4, speed: 30, spread: 0.02, pellets: 1, life: 1.3, projectile: 'bullet', recoil: 0, carry: 1 },
  smg: { name: 'SMG', rate: 0.11, mag: 20, reserve: 40, reloadTime: 1.4, damage: 34, knockback: 2.5, speed: 32, spread: 0.1, pellets: 1, life: 1, projectile: 'bullet', recoil: 0.4, carry: 0.97 },
  shotgun: { name: 'Shotgun', rate: 0.9, mag: 4, reserve: 8, reloadTime: 1.5, damage: 20, knockback: 4, speed: 28, spread: 0.26, pellets: 6, life: 0.32, projectile: 'pellet', recoil: 7, carry: 0.93 },
  railgun: { name: 'Railgun', rate: 1.6, mag: 2, reserve: 2, reloadTime: 1.8, damage: 100, knockback: 14, speed: 160, spread: 0, pellets: 1, life: 0.35, projectile: 'rail', recoil: 9, carry: 0.88 },
  launcher: { name: 'Rockets', rate: 1.1, mag: 1, reserve: 3, reloadTime: 1.1, damage: 110, knockback: 22, speed: 22, spread: 0.01, pellets: 1, life: 2.2, projectile: 'grenade', recoil: 4, carry: 0.88 },
};

/** Rockets fly straight: auto-aim points at the target, so no drop. */
export const GRENADE = { gravity: 0, radius: 2.8, selfDamage: 0.45 };

export const PUSH = {
  cooldown: 2.5,
  duration: 0.3,
  activeFrom: 0.06,
  activeTo: 0.2,
  reach: 2.4,
  span: 2.4,
  damage: 4,
  knockback: 24,
  lift: 0.2,
};

export const WALL_SPLAT_SPEED = 11;
export const WALL_SPLAT_DAMAGE = 30;
