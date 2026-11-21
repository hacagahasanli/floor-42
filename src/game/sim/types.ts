// Pure simulation types. No DOM, no Three.js: the same code will run on the game server.

export type CharacterId = 'hotfix' | 'legacy' | 'standup' | 'intern';

export type GunKind = 'pistol' | 'smg' | 'shotgun' | 'railgun' | 'launcher' | 'uzi' | 'bomb';

/** One tick of input. Buttons are held state; edges are derived by the sim. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean; // jump / double jump / wall-kick
  down: boolean; // drop through a walkway, fast fall; crouch on the floor, a desk or a box
  /** Crouch anywhere on the ground, walkways too (Down there drops you through instead). */
  crouch: boolean;
  dash: boolean;
  fire: boolean; // held: guns fire at their own rate
  pickup: boolean;
  reload: boolean;
  push: boolean; // Force Push
  /** Aim point in world space (the mouse, projected onto the fight plane). */
  aimX: number;
  aimY: number;
}

export const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  crouch: false,
  dash: false,
  fire: false,
  pickup: false,
  reload: false,
  push: false,
  aimX: 0,
  aimY: 0,
};

export interface Weapon {
  kind: GunKind;
  mag: number;
  reserve: number; // Infinity for the pistol
  cooldown: number;
  reload: number; // > 0 while reloading
}

export interface Fighter {
  id: number;
  character: CharacterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  aim: number; // radians, 0 = right, PI/2 = up
  /** The point being aimed at (bombs are lobbed to land on it). */
  aimTx: number;
  aimTy: number;
  onGround: boolean;
  wall: -1 | 0 | 1;
  airJumps: number;
  airDashes: number;
  dashTime: number;
  dashCooldown: number;
  dropTime: number;
  /** 0 standing .. 1 fully crouched. Eases at CROUCH.time; the hitbox height follows it. */
  crouch: number;
  hp: number;
  kos: number;
  stun: number;
  pushCooldown: number;
  pushTime: number; // > 0 while the Force Push is out
  pushHit: number[];
  pushed: number; // > 0 right after being shoved: hitting a wall now splats
  respawn: number;
  invulnerable: number;
  /** Seconds since you last took damage: after a while, health comes back. */
  sinceHit: number;
  weapon: Weapon;
  /** The gun you were holding when you picked up a bomb; you get it back after the throw. */
  stash: Weapon | null;
  /** Picked while dead: you respawn as this character. */
  nextCharacter: CharacterId | null;
  firing: number; // seconds since the last shot, for muzzle flash / recoil
  lastHitBy: number | null;
  /** Match stats for the end screen. A shotgun blast counts as one shot. */
  stats: { damage: number; shots: number; hits: number; deaths: number; streak: number; bestStreak: number };
  prev: InputState;
}

export interface Pickup {
  id: number;
  kind: GunKind;
  x: number;
  y: number;
  vy: number;
  active: boolean;
  respawn: number;
  /** Index into ARENA.gunSpawns, or null for a ceiling drop that is gone once taken. */
  spawn: number | null;
}

export type ProjectileKind = 'bullet' | 'pellet' | 'rail' | 'grenade' | 'bomb';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  gun: GunKind;
  /** Where it was fired from: damage falls off with distance travelled. */
  ox: number;
  oy: number;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  knockback: number;
  life: number;
  hit: number[]; // rails pierce: fighters already hit
}

export type GameEvent =
  | { type: 'shot'; fighter: number; gun: GunKind; x: number; y: number; angle: number }
  | { type: 'hit'; fighter: number; x: number; y: number; power: number; damage: number; by?: number }
  | { type: 'impact'; x: number; y: number; owner?: number }
  | { type: 'explosion'; x: number; y: number; radius: number; owner?: number }
  | { type: 'rail'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'push'; x: number; y: number; facing: 1 | -1; fighter?: number }
  | { type: 'deflect'; x: number; y: number; fighter?: number }
  | { type: 'wallSplat'; side: -1 | 1; y: number; fighter?: number }
  | { type: 'ko'; fighter: number; by: number | null; x: number; y: number }
  | { type: 'jump'; x: number; y: number; wallKick: boolean; fighter?: number }
  | { type: 'dash'; x: number; y: number; fighter?: number }
  | { type: 'pickup'; fighter: number; gun: GunKind }
  | { type: 'reload'; fighter: number }
  | { type: 'empty'; fighter: number }
  | { type: 'drop'; x: number };

export type EndReason = 'kos' | 'time';

export type Phase = 'countdown' | 'fight' | 'over';

export interface GameState {
  tick: number;
  phase: Phase;
  phaseTime: number;
  winner: number | null; // fighter id, -1 for a draw
  endReason: EndReason | null;
  /** Both players agreed to pause: nothing moves until someone resumes. */
  paused: boolean;
  hitstop: number;
  /**
   * Online match: big hits don't freeze the world (no hitstop). Online, a freeze would start late
   * on the far side, or start for a hit the guessing side predicted and the authority never had.
   */
  net?: boolean;
  seed: number; // deterministic RNG state (spread, drops)
  dropTimer: number;
  nextId: number;
  fighters: Fighter[];
  pickups: Pickup[];
  projectiles: Projectile[];
  events: GameEvent[];
}
