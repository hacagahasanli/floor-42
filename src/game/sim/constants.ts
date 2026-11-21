import type { CharacterId, GunKind } from './types';

export const DT = 1 / 60;

export type PlatformStyle =
  | 'desk'
  | 'table'
  | 'counter'
  | 'fridge'
  | 'shelf'
  | 'cabinet'
  | 'walkway'
  | 'tray'
  | 'crate'
  | 'metal'
  | 'rack'
  | 'ledge';

export interface Platform {
  x0: number;
  x1: number;
  /** The top you stand on. */
  y: number;
  style: PlatformStyle;
  /** Solid boxes only: where the box stands (a walkway, a balcony). Absent = the floor. */
  base?: number;
}

/**
 * Things nobody fits under: desks, the meeting table and the kitchen counter are solid from the floor to their
 * top, and crates, metal boxes and the server rack from their base to their top. You walk up to them and jump on;
 * you never walk (or drop) into them. Everything else is a one-way floor (docs/ARENA.md).
 */
export const SOLID_STYLES: readonly PlatformStyle[] = ['desk', 'table', 'counter', 'crate', 'metal', 'rack'];
export const isSolid = (p: Platform) => SOLID_STYLES.includes(p.style);
/** Closed boxes (crates, metal boxes, the rack). Every solid box, desks included, stops shots into its side. */
export const CLOSED_STYLES: readonly PlatformStyle[] = ['crate', 'metal', 'rack'];
export const isClosed = (p: Platform) => CLOSED_STYLES.includes(p.style);
/** Where a solid box stands. */
export const baseOf = (p: Platform) => p.base ?? 0;

/**
 * Where the menu backdrop's fighter stands: on open floor 2.2 m past the end of the meeting table, so neither
 * their body nor the turn of their shoulders ever reaches into the furniture.
 */
export const menuSpotX = () => {
  const table = ARENA.platforms.find((p) => p.style === 'table')!;
  return table.x1 + 2.2;
};

/**
 * Floor 42, open-plan. The walkways, shelves and cabinets are one-way platforms: jump up through them,
 * press Down to drop. Desks, the table and the counter are solid (see SOLID_STYLES).
 * Bullets do not go through furniture, so desks are cover.
 */
/**
 * How often each gun shows up on the lower floors, as weights (one entry = one ticket).
 * The power weapons live on the mezzanine instead (POWER_TABLE), so every match sees them.
 */
export const GUN_TABLE: GunKind[] = [
  'smg',
  'smg',
  'smg',
  'shotgun',
  'shotgun',
  'shotgun',
  'uzi',
  'uzi',
];

/** The top floor only ever offers a power weapon: worth the climb, six shots, then it's gone. */
export const POWER_TABLE: GunKind[] = ['railgun', 'railgun', 'launcher', 'launcher', 'launcher'];

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
    // Cover where the fight goes up: a crate and the server rack at the inner ends of the lower walkways
    // (steps up to the cable tray), a metal box on each balcony, and a small hanging ledge on each side,
    // an inner route from the walkways up to the balconies.
    { x0: -3.7, x1: -2.6, y: 5.4, base: 4.4, style: 'crate' },
    { x0: 2.6, x1: 3.5, y: 6.4, base: 4.4, style: 'rack' },
    { x0: -9, x1: -7.2, y: 7.6, style: 'ledge' },
    { x0: 7.2, x1: 9, y: 7.6, style: 'ledge' },
    { x0: -12, x1: -11, y: 10.4, base: 9.4, style: 'metal' },
    { x0: 11, x1: 12, y: 10.4, base: 9.4, style: 'metal' },
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
   * Taking it starts a timer before the next one appears. The kind is drawn from GUN_TABLE.
   */
  gunSpawns: [
    {
      spots: [
        { x: 0, y: 1.0 },
        { x: -8, y: 1.1 },
        { x: 16.9, y: 2.8 },
      ],
      kinds: GUN_TABLE,
    },
    {
      spots: [
        { x: -5.4, y: 4.4 },
        { x: 5.4, y: 4.4 },
        { x: 0, y: 7.2 },
      ],
      kinds: GUN_TABLE,
    },
    // A second gun on the two lower floors, near the other spawns.
    {
      spots: [
        { x: -13, y: 1.1 },
        { x: 10.5, y: 1.2 },
        { x: 4, y: 0 },
      ],
      kinds: GUN_TABLE,
    },
    {
      spots: [
        { x: -7.5, y: 4.4 },
        { x: 7.5, y: 4.4 },
      ],
      kinds: GUN_TABLE,
    },
    // The top floor's power weapon stays last (tests and the HUD count on it).
    {
      spots: [
        { x: -15, y: 9.4 },
        { x: 15, y: 9.4 },
        { x: 0, y: 10.6 },
      ],
      kinds: POWER_TABLE,
      respawn: 15,
    },
  ] as { spots: { x: number; y: number }[]; kinds: GunKind[]; respawn?: number }[],
  /** Bombs fall from the ceiling vents now and then. */
  dropEvery: 18,
  dropSlots: 2,
  dropKinds: ['bomb'] as GunKind[],
};

export const RULES = {
  hp: 100,
  kosToWin: 5,
  roundSeconds: 150,
  /** The title card (2 s: what this game is about), then "git merge" ... "CONFLICT!". */
  countdownSeconds: 3.6,
  respawnSeconds: 3,
  spawnInvulnerable: 1.4,
  /** A taken gun comes back this soon, so whoever just respawned finds one quickly. */
  gunRespawn: 6,
  /** Untouched for this long, health refills at this rate (a hit is ~50: back in ~3 s). */
  regenAfter: 4,
  regenPerSecond: 15,
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
  /** Once every 5 s: a dash is a big play, not something to spam (Reis). */
  dashCooldown: 5,
  wallKickX: 12.5,
  wallSlide: 4,
  dropTime: 0.25,
};

/**
 * Holding crouch on the ground: the body (and its hitbox) drops to 52 % of its height. Shots leave a standing
 * chest at 62 % and auto-aim (and the bot) aim at 55 %, so a shot fired at a standing chest or head passes over a
 * crouched body; at 60 % it would still clip the top of it. It goes down and back up in 0.1 s, walking is 70 % of
 * the run speed, and the gun (muzzle) sits at the same 62 % of the lower body. Aim that follows the crouched
 * body still hits it: crouching dodges shots already in the air, not the next ones.
 */
export const CROUCH = {
  height: 0.52,
  time: 0.1,
  speed: 0.7,
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
  hotfix: {
    name: 'Hotfix',
    speed: 9.4,
    jump: 16.5,
    weight: 0.92,
    hp: 100,
    height: 2.0,
    width: 0.7,
    airJumps: 1,
  },
  legacy: {
    name: 'Legacy',
    speed: 7.6,
    jump: 15.2,
    weight: 1.38,
    hp: 100,
    height: 1.85,
    width: 1.0,
    airJumps: 1,
  },
  standup: {
    name: 'Standup',
    speed: 10.6,
    jump: 17,
    weight: 0.8,
    hp: 100,
    height: 1.5,
    width: 0.7,
    airJumps: 2,
  },
  intern: {
    name: 'Intern',
    speed: 9.0,
    jump: 16.2,
    weight: 1.0,
    hp: 100,
    height: 1.7,
    width: 0.8,
    airJumps: 1,
  },
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
  projectile: 'bullet' | 'pellet' | 'rail' | 'grenade' | 'bomb';
  /** Damage falls from full at `near` metres to `min` x damage at `far`. Absent = no falloff. */
  falloff?: { near: number; far: number; min: number };
  /** Kick back on the shooter, in m/s. */
  recoil: number;
  /** Slows your run while you carry it. */
  carry: number;
}

/**
 * Every gun has one job (docs/BALANCE.md, guarded by balance.test.ts): the pistol is the reliable baseline
 * (two hits only point blank, three across a room, the most accurate small gun at range); the Uzi shreds up close
 * and fades fast; the SMG owns the middle distance; the shotgun is a point-blank burst with a short reach.
 * The rocket and the rail always kill in one, which is why they are rare, slow to fire and only six shots.
 */
export const GUNS: Record<GunKind, GunStats> = {
  pistol: {
    name: 'Pistol',
    rate: 0.38,
    mag: 8,
    reserve: Infinity,
    reloadTime: 1,
    damage: 50,
    knockback: 4,
    speed: 30,
    spread: 0.02,
    pellets: 1,
    life: 1.3,
    projectile: 'bullet',
    recoil: 0,
    carry: 1,
    falloff: { near: 2.5, far: 20, min: 0.45 },
  },
  smg: {
    name: 'SMG',
    rate: 0.14,
    mag: 20,
    reserve: 40,
    reloadTime: 1.4,
    damage: 30,
    knockback: 2.5,
    speed: 32,
    spread: 0.08,
    pellets: 1,
    life: 1,
    projectile: 'bullet',
    recoil: 0.4,
    carry: 0.97,
    falloff: { near: 6, far: 18, min: 0.5 },
  },
  uzi: {
    name: 'Uzi',
    rate: 0.05,
    mag: 32,
    reserve: 32,
    reloadTime: 1.2,
    damage: 14,
    knockback: 1.2,
    speed: 30,
    spread: 0.15,
    pellets: 1,
    life: 0.8,
    projectile: 'bullet',
    recoil: 0.2,
    carry: 1,
    falloff: { near: 3, far: 10, min: 0.4 },
  },
  shotgun: {
    name: 'Shotgun',
    rate: 0.8,
    mag: 4,
    reserve: 8,
    reloadTime: 1.5,
    damage: 18,
    knockback: 4,
    speed: 28,
    spread: 0.2,
    pellets: 6,
    life: 0.32,
    projectile: 'pellet',
    recoil: 7,
    carry: 0.93,
    falloff: { near: 2, far: 8, min: 0.35 },
  },
  railgun: {
    name: 'Sniper rail',
    rate: 1.4,
    mag: 3,
    reserve: 3,
    reloadTime: 1.8,
    damage: 100,
    knockback: 14,
    speed: 160,
    spread: 0,
    pellets: 1,
    life: 0.35,
    projectile: 'rail',
    recoil: 9,
    carry: 0.88,
  },
  launcher: {
    name: 'Rockets',
    rate: 1.1,
    mag: 2,
    reserve: 4,
    reloadTime: 1.1,
    damage: 110,
    knockback: 22,
    // Slow on purpose: a rocket you can see coming (and dodge), several times slower than a bullet.
    speed: 14,
    spread: 0.01,
    pellets: 1,
    life: 3,
    projectile: 'grenade',
    recoil: 4,
    carry: 0.88,
  },
  bomb: {
    name: 'Bomb',
    rate: 0.5,
    mag: 1,
    reserve: 0,
    reloadTime: 1,
    damage: 110,
    knockback: 20,
    speed: 16,
    spread: 0,
    pellets: 1,
    life: 1.8,
    projectile: 'bomb',
    recoil: 0,
    carry: 1,
  },
};

export const GRENADE = { gravity: 0, radius: 2.8, selfDamage: 0.45 };
/** A thrown bomb: arcs, explodes on contact or when the fuse runs out. Lethal right next to it. */
export const BOMB = { gravity: 26, radius: 3.2, selfDamage: 0.45 };

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
