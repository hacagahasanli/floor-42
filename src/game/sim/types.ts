// Pure simulation types. No DOM, no Three.js: the same code will run on the game server.

export type CharacterId = 'hotfix' | 'legacy' | 'standup' | 'intern';
export type ItemKind = 'keyboard' | 'mug' | 'monitor';

/** Buttons held this tick. Edges (pressed this tick) are derived by the sim. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean; // jump / wall-kick
  down: boolean; // drop through desks, fast fall, guard with monitor
  dash: boolean;
  attack: boolean;
  grab: boolean; // pick up, or throw what you hold
  push: boolean; // Force Push
}

export const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  dash: false,
  attack: false,
  grab: false,
  push: false,
};

export type AttackKind = 'jab' | 'sweep' | 'bash' | 'splash' | 'push';

export interface Attack {
  kind: AttackKind;
  t: number; // seconds since start
  hit: number[]; // fighter ids already hit by this swing
}

export interface Fighter {
  id: number;
  character: CharacterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  wall: -1 | 0 | 1; // touching the left (-1) or right (1) glass wall while airborne
  airJumps: number;
  airDashes: number;
  dashTime: number;
  dashCooldown: number;
  dropTime: number; // ignore desks while > 0
  hp: number;
  kos: number;
  stun: number;
  slow: number; // coffee burn
  pushCooldown: number;
  pushed: number; // > 0 right after a Force Push: hitting a wall now splats
  respawn: number; // > 0 while knocked out
  invulnerable: number;
  held: number | null; // item id
  attack: Attack | null;
  guarding: boolean;
  lastHitBy: number | null;
  prev: InputState;
}

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  holder: number | null;
  thrownBy: number | null;
  thrownTime: number;
  active: boolean; // false while broken / waiting to respawn
  respawn: number;
  homeX: number;
  homeY: number;
}

export type GameEvent =
  | { type: 'hit'; x: number; y: number; power: number; guarded: boolean }
  | { type: 'splash'; x: number; y: number }
  | { type: 'push'; x: number; y: number; facing: 1 | -1 }
  | { type: 'wallSplat'; side: -1 | 1; y: number }
  | { type: 'ko'; fighter: number; x: number; y: number }
  | { type: 'jump'; x: number; y: number; wallKick: boolean }
  | { type: 'dash'; x: number; y: number }
  | { type: 'pickup'; item: number }
  | { type: 'throw'; item: number }
  | { type: 'shatter'; x: number; y: number };

export type Phase = 'countdown' | 'fight' | 'over';

export interface GameState {
  tick: number;
  phase: Phase;
  phaseTime: number; // countdown left, or fight time left
  winner: number | null; // fighter id, -1 for a draw
  fighters: Fighter[];
  items: Item[];
  events: GameEvent[]; // produced by the last step only
}
