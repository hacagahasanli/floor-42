import {
  ARENA,
  ATTACKS,
  CHARACTERS,
  DT,
  ITEMS,
  PHYS,
  PUSH_COOLDOWN,
  RULES,
  SLOW_FACTOR,
  WALL_SPLAT_DAMAGE,
  WALL_SPLAT_SPEED,
} from './constants';
import { EMPTY_INPUT } from './types';

import type { AttackKind, CharacterId, Fighter, GameState, InputState, Item, ItemKind } from './types';

const approach = (v: number, target: number, delta: number) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);

const sign = (v: number): 1 | -1 => (v < 0 ? -1 : 1);

export const createFighter = (id: number, character: CharacterId): Fighter => {
  const spawn = ARENA.spawns[id % ARENA.spawns.length];
  const c = CHARACTERS[character];
  return {
    id,
    character,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    facing: spawn.x < 0 ? 1 : -1,
    onGround: true,
    wall: 0,
    airJumps: c.airJumps,
    airDashes: 1,
    dashTime: 0,
    dashCooldown: 0,
    dropTime: 0,
    hp: RULES.hp,
    kos: 0,
    stun: 0,
    slow: 0,
    pushCooldown: 0,
    pushed: 0,
    respawn: 0,
    invulnerable: 0,
    held: null,
    attack: null,
    guarding: false,
    lastHitBy: null,
    prev: { ...EMPTY_INPUT },
  };
};

const createItem = (id: number, kind: ItemKind, x: number, y: number): Item => ({
  id,
  kind,
  x,
  y,
  vx: 0,
  vy: 0,
  rot: 0,
  spin: 0,
  holder: null,
  thrownBy: null,
  thrownTime: 0,
  active: true,
  respawn: 0,
  homeX: x,
  homeY: y,
});

export const createGame = (characters: [CharacterId, CharacterId]): GameState => ({
  tick: 0,
  phase: 'countdown',
  phaseTime: RULES.countdownSeconds,
  winner: null,
  fighters: characters.map((c, i) => createFighter(i, c)),
  items: ARENA.itemSpawns.map((s, i) => createItem(i, s.kind, s.x, s.y)),
  events: [],
});

const respawnFighter = (f: Fighter) => {
  const spawn = ARENA.spawns[f.id % ARENA.spawns.length];
  Object.assign(f, {
    x: spawn.x,
    y: spawn.y + 2,
    vx: 0,
    vy: 0,
    facing: spawn.x < 0 ? 1 : -1,
    hp: RULES.hp,
    stun: 0,
    slow: 0,
    pushed: 0,
    attack: null,
    dashTime: 0,
    invulnerable: RULES.spawnInvulnerable,
    lastHitBy: null,
  });
};

const breakItem = (state: GameState, item: Item) => {
  const s = ITEMS[item.kind];
  state.events.push(
    item.kind === 'mug' ? { type: 'splash', x: item.x, y: item.y } : { type: 'shatter', x: item.x, y: item.y },
  );
  if (item.holder !== null) state.fighters[item.holder].held = null;
  Object.assign(item, { active: false, respawn: s.respawnSeconds, holder: null, thrownBy: null });
};

const dropHeld = (state: GameState, f: Fighter) => {
  if (f.held === null) return;
  const item = state.items[f.held];
  Object.assign(item, { holder: null, thrownBy: null, vx: f.vx * 0.5, vy: 4, spin: 6 });
  f.held = null;
};

const knockOut = (state: GameState, f: Fighter) => {
  f.hp = 0;
  f.respawn = RULES.respawnSeconds;
  f.attack = null;
  f.guarding = false;
  dropHeld(state, f);
  state.events.push({ type: 'ko', fighter: f.id, x: f.x, y: f.y + 1 });
  if (state.phase !== 'fight') return;
  const scorerId = f.lastHitBy ?? state.fighters.find((o) => o.id !== f.id)?.id ?? null;
  if (scorerId === null) return;
  const scorer = state.fighters[scorerId];
  scorer.kos += 1;
  if (scorer.kos >= RULES.kosToWin) {
    state.phase = 'over';
    state.winner = scorer.id;
  }
};

interface HitSpec {
  attacker: number;
  dir: 1 | -1;
  damage: number;
  knockback: number;
  lift: number;
  slow: number;
  push: boolean;
}

/** Applies a hit to a fighter. Returns false if the fighter cannot be hit right now. */
export const applyHit = (state: GameState, target: Fighter, hit: HitSpec): boolean => {
  if (target.respawn > 0 || target.invulnerable > 0 || target.id === hit.attacker) return false;
  const heldKind = target.held !== null ? state.items[target.held].kind : null;
  const frontal = target.facing === -hit.dir;
  const shield = heldKind && frontal ? (target.guarding ? 1 : ITEMS[heldKind].shield) : 0;
  const guarded = shield > 0;
  const damage = hit.damage * (1 - shield);
  const weight = CHARACTERS[target.character].weight;
  const k = (hit.knockback * (target.guarding ? 0.4 : guarded ? 0.75 : 1)) / weight;

  target.vx = hit.dir * k;
  target.vy = Math.max(target.vy, k * hit.lift + 3);
  target.onGround = false;
  target.stun = 0.12 + k * 0.022;
  target.attack = null;
  target.dashTime = 0;
  target.hp -= damage;
  target.slow = Math.max(target.slow, hit.slow);
  target.lastHitBy = hit.attacker;
  if (hit.push) target.pushed = 0.6;
  state.events.push({
    type: 'hit',
    x: target.x,
    y: target.y + CHARACTERS[target.character].height * 0.6,
    power: k,
    guarded,
  });
  if (target.hp <= 0) knockOut(state, target);
  return true;
};

const attackFor = (heldKind: ItemKind | null): AttackKind => {
  if (heldKind === 'keyboard') return 'sweep';
  if (heldKind === 'monitor') return 'bash';
  if (heldKind === 'mug') return 'splash';
  return 'jab';
};

const throwItem = (state: GameState, f: Fighter, input: InputState) => {
  if (f.held === null) return;
  const item = state.items[f.held];
  const s = ITEMS[item.kind];
  const c = CHARACTERS[f.character];
  f.held = null;
  Object.assign(item, {
    holder: null,
    thrownBy: f.id,
    thrownTime: 0,
    x: f.x + f.facing * (c.width / 2 + 0.3),
    y: f.y + c.height * 0.62,
    vx: f.facing * s.throwSpeed + f.vx * 0.5,
    vy: s.throwLift + Math.max(f.vy, 0) * 0.5 + (input.up ? 7 : 0) - (input.down && !f.onGround ? 9 : 0),
    spin: -f.facing * (item.kind === 'keyboard' ? 18 : 11),
  });
  state.events.push({ type: 'throw', item: item.id });
};

const tryPickup = (state: GameState, f: Fighter) => {
  const c = CHARACTERS[f.character];
  let best: Item | null = null;
  let bestD = Infinity;
  for (const item of state.items) {
    if (!item.active || item.holder !== null || item.thrownBy !== null) continue;
    const dx = Math.abs(item.x - f.x);
    const dy = item.y - f.y;
    if (dx > c.width / 2 + 1.0 || dy < -0.6 || dy > c.height + 0.2) continue;
    if (dx < bestD) {
      bestD = dx;
      best = item;
    }
  }
  if (!best) return;
  best.holder = f.id;
  best.vx = 0;
  best.vy = 0;
  best.spin = 0;
  f.held = best.id;
  state.events.push({ type: 'pickup', item: best.id });
};

const updateFighter = (state: GameState, f: Fighter, input: InputState) => {
  const c = CHARACTERS[f.character];
  const halfW = c.width / 2;
  const pressed = (k: keyof InputState) => input[k] && !f.prev[k];

  f.dashTime = Math.max(0, f.dashTime - DT);
  f.dashCooldown = Math.max(0, f.dashCooldown - DT);
  f.dropTime = Math.max(0, f.dropTime - DT);
  f.stun = Math.max(0, f.stun - DT);
  f.slow = Math.max(0, f.slow - DT);
  f.pushCooldown = Math.max(0, f.pushCooldown - DT);
  f.pushed = Math.max(0, f.pushed - DT);
  f.invulnerable = Math.max(0, f.invulnerable - DT);

  if (f.respawn > 0) {
    f.respawn -= DT;
    if (f.respawn <= 0) respawnFighter(f);
    f.prev = { ...input };
    return;
  }

  const canAct = state.phase === 'fight' && f.stun <= 0;
  const heldKind = f.held !== null ? state.items[f.held].kind : null;
  const heldStats = heldKind ? ITEMS[heldKind] : null;

  f.guarding = canAct && heldKind === 'monitor' && input.down && f.onGround && !f.attack;

  // Horizontal movement.
  const dir = canAct && !f.guarding ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
  if (f.dashTime <= 0) {
    let maxSpeed = c.speed * (f.slow > 0 ? SLOW_FACTOR : 1) * (heldStats?.carrySpeed ?? 1);
    if (f.attack && f.onGround) maxSpeed *= 0.35;
    if (dir !== 0) {
      f.vx = approach(f.vx, dir * maxSpeed, (f.onGround ? PHYS.groundAccel : PHYS.airAccel) * DT);
      if (!f.attack) f.facing = dir as 1 | -1;
    } else {
      const friction = f.stun > 0 ? 18 : f.onGround ? PHYS.groundFriction : PHYS.airFriction;
      f.vx = approach(f.vx, 0, friction * DT);
    }
  }

  // Jump, wall-kick, air jump.
  if (canAct && pressed('up') && !f.guarding) {
    if (f.onGround) {
      f.vy = c.jump;
      f.onGround = false;
      state.events.push({ type: 'jump', x: f.x, y: f.y, wallKick: false });
    } else if (f.wall !== 0) {
      f.vx = -f.wall * PHYS.wallKickX;
      f.vy = c.jump * 0.95;
      f.facing = -f.wall as 1 | -1;
      f.airJumps = c.airJumps;
      f.airDashes = 1;
      state.events.push({ type: 'jump', x: f.x, y: f.y, wallKick: true });
    } else if (f.airJumps > 0) {
      f.airJumps -= 1;
      f.vy = c.jump * 0.88;
      state.events.push({ type: 'jump', x: f.x, y: f.y, wallKick: false });
    }
  }

  // Drop through a desk.
  if (canAct && pressed('down') && f.onGround && f.y > ARENA.floor + 0.01 && heldKind !== 'monitor') {
    f.dropTime = PHYS.dropTime;
    f.onGround = false;
  }

  // Dash.
  if (canAct && pressed('dash') && f.dashCooldown <= 0 && (f.onGround || f.airDashes > 0)) {
    const d = dir !== 0 ? (dir as 1 | -1) : f.facing;
    f.vx = d * PHYS.dashSpeed;
    if (!f.onGround) {
      f.airDashes -= 1;
      f.vy = 0;
    }
    f.facing = d;
    f.dashTime = PHYS.dashTime;
    f.dashCooldown = PHYS.dashCooldown;
    state.events.push({ type: 'dash', x: f.x, y: f.y });
  }

  // Attack, Force Push, grab / throw.
  if (canAct && !f.attack) {
    if (pressed('push') && f.pushCooldown <= 0) {
      f.attack = { kind: 'push', t: 0, hit: [] };
      f.pushCooldown = PUSH_COOLDOWN;
      f.guarding = false;
      state.events.push({ type: 'push', x: f.x, y: f.y + c.height * 0.55, facing: f.facing });
    } else if (pressed('attack')) {
      const kind = attackFor(heldKind);
      f.attack = { kind, t: 0, hit: [] };
      f.guarding = false;
      if (f.onGround) f.vx += f.facing * ATTACKS[kind].lunge;
    } else if (pressed('grab')) {
      if (f.held !== null) throwItem(state, f, input);
      else tryPickup(state, f);
    }
  }

  // Gravity.
  if (f.dashTime > 0 && !f.onGround) {
    f.vy = 0;
  } else {
    const fastFall = canAct && input.down && !f.onGround && f.vy < 3;
    f.vy -= (fastFall ? PHYS.fastFall : PHYS.gravity) * DT;
    const hugging = f.wall !== 0 && dir === f.wall;
    f.vy = Math.max(f.vy, hugging ? -PHYS.wallSlide : -PHYS.maxFall);
  }

  // Integrate.
  const prevY = f.y;
  f.x += f.vx * DT;
  f.y += f.vy * DT;

  // Glass walls.
  let touching: -1 | 0 | 1 = 0;
  for (const side of [-1, 1] as const) {
    const limit = side < 0 ? ARENA.left + halfW : ARENA.right - halfW;
    const past = side < 0 ? f.x <= limit + 0.02 : f.x >= limit - 0.02;
    if (!past) continue;
    touching = side;
    const into = f.vx * side;
    f.x = side < 0 ? Math.max(f.x, limit) : Math.min(f.x, limit);
    if (f.pushed > 0 && into > WALL_SPLAT_SPEED) {
      f.pushed = 0;
      f.vx = -side * 4;
      f.vy = Math.max(f.vy, 5);
      f.stun = 0.7;
      f.hp -= WALL_SPLAT_DAMAGE;
      state.events.push({ type: 'wallSplat', side, y: f.y + c.height * 0.6 });
      if (f.hp <= 0) knockOut(state, f);
    } else if (into > 0) {
      f.vx = 0;
    }
  }

  // Ceiling.
  if (f.y + c.height > ARENA.ceiling) {
    f.y = ARENA.ceiling - c.height;
    f.vy = Math.min(f.vy, 0);
  }

  // Floor and one-way desks.
  f.onGround = false;
  if (f.vy <= 0) {
    let landY: number | null = null;
    if (f.y <= ARENA.floor) landY = ARENA.floor;
    else if (f.dropTime <= 0) {
      for (const p of ARENA.platforms) {
        if (f.x + halfW * 0.5 < p.x0 || f.x - halfW * 0.5 > p.x1) continue;
        if (prevY >= p.y - 0.001 && f.y <= p.y) {
          landY = p.y;
          break;
        }
      }
    }
    if (landY !== null) {
      f.y = landY;
      f.vy = 0;
      f.onGround = true;
      f.airJumps = c.airJumps;
      f.airDashes = 1;
    }
  }
  f.wall = f.onGround ? 0 : touching;

  // Attack hitboxes.
  if (f.attack) {
    const a = ATTACKS[f.attack.kind];
    f.attack.t += DT;
    const { t } = f.attack;
    if (t >= a.activeFrom && t <= a.activeTo) {
      const reach = a.reach * c.reach;
      const x0 = f.facing > 0 ? f.x : f.x - halfW - reach;
      const x1 = f.facing > 0 ? f.x + halfW + reach : f.x;
      const cy = f.y + c.height * 0.55;
      for (const o of state.fighters) {
        if (o.id === f.id || f.attack.hit.includes(o.id)) continue;
        const oc = CHARACTERS[o.character];
        const overlap =
          o.x + oc.width / 2 > x0 && o.x - oc.width / 2 < x1 && o.y + oc.height > cy - a.span / 2 && o.y < cy + a.span / 2;
        if (!overlap) continue;
        const landed = applyHit(state, o, {
          attacker: f.id,
          dir: f.facing,
          damage: a.damage,
          knockback: a.knockback + a.momentum * Math.max(0, f.vx * f.facing),
          lift: a.lift,
          slow: a.slow,
          push: f.attack.kind === 'push',
        });
        if (landed) f.attack.hit.push(o.id);
      }
    }
    if (t >= a.duration) {
      if (f.attack.kind === 'splash' && f.held !== null) breakItem(state, state.items[f.held]);
      f.attack = null;
    }
  }

  f.prev = { ...input };
};

const updateItem = (state: GameState, item: Item) => {
  const s = ITEMS[item.kind];
  if (!item.active) {
    item.respawn -= DT;
    if (item.respawn <= 0) {
      Object.assign(item, {
        active: true,
        x: item.homeX,
        y: item.homeY,
        vx: 0,
        vy: 0,
        rot: 0,
        spin: 0,
        thrownBy: null,
      });
    }
    return;
  }
  if (item.holder !== null) {
    const f = state.fighters[item.holder];
    const c = CHARACTERS[f.character];
    item.x = f.x + f.facing * (c.width / 2 + 0.2);
    item.y = f.y + c.height * 0.5;
    item.vx = f.vx;
    item.vy = f.vy;
    return;
  }

  const prevY = item.y;
  item.vy = Math.max(item.vy - PHYS.gravity * DT, -PHYS.maxFall);
  item.x += item.vx * DT;
  item.y += item.vy * DT;
  item.rot += item.spin * DT;

  if (item.x < ARENA.left + 0.3 || item.x > ARENA.right - 0.3) {
    item.x = Math.min(Math.max(item.x, ARENA.left + 0.3), ARENA.right - 0.3);
    if (s.breaksOnImpact && item.thrownBy !== null) return breakItem(state, item);
    item.vx = -item.vx * 0.35;
  }

  // Thrown items hit fighters.
  if (item.thrownBy !== null) {
    item.thrownTime += DT;
    const speed = Math.hypot(item.vx, item.vy);
    for (const o of state.fighters) {
      if (o.id === item.thrownBy) continue;
      const oc = CHARACTERS[o.character];
      if (Math.abs(item.x - o.x) > oc.width / 2 + 0.3 || item.y < o.y - 0.2 || item.y > o.y + oc.height + 0.2) continue;
      const scale = Math.min(1.2, Math.max(0.5, speed / s.throwSpeed));
      const landed = applyHit(state, o, {
        attacker: item.thrownBy,
        dir: sign(item.vx),
        damage: s.throwDamage * scale,
        knockback: s.throwKnockback * scale,
        lift: 0.35,
        slow: item.kind === 'mug' ? 2.2 : 0,
        push: false,
      });
      if (!landed) continue;
      if (s.breaksOnImpact) return breakItem(state, item);
      item.vx = -item.vx * 0.25;
      item.vy = 3;
      item.thrownBy = null;
      return;
    }
  }

  // Land on the floor or a desk.
  if (item.vy <= 0) {
    let landY: number | null = null;
    if (item.y <= ARENA.floor) landY = ARENA.floor;
    else {
      for (const p of ARENA.platforms) {
        if (item.x >= p.x0 && item.x <= p.x1 && prevY >= p.y - 0.001 && item.y <= p.y) {
          landY = p.y;
          break;
        }
      }
    }
    if (landY !== null) {
      if (s.breaksOnImpact && item.thrownBy !== null) return breakItem(state, item);
      item.y = landY;
      item.vy = 0;
      item.vx = approach(item.vx, 0, 40 * DT);
      item.spin = 0;
      item.rot = 0;
      if (Math.abs(item.vx) < 2) item.thrownBy = null;
    }
  }
};

/** Advances the game by one fixed tick (DT). Mutates and returns the state. */
export const step = (state: GameState, inputs: InputState[]): GameState => {
  state.events = [];
  state.tick += 1;

  if (state.phase === 'countdown') {
    state.phaseTime -= DT;
    if (state.phaseTime <= 0) {
      state.phase = 'fight';
      state.phaseTime = RULES.roundSeconds;
    }
  } else if (state.phase === 'fight') {
    state.phaseTime -= DT;
    if (state.phaseTime <= 0) {
      state.phaseTime = 0;
      state.phase = 'over';
      const [a, b] = state.fighters;
      state.winner = a.kos === b.kos ? -1 : a.kos > b.kos ? a.id : b.id;
    }
  }

  for (const f of state.fighters) updateFighter(state, f, inputs[f.id] ?? EMPTY_INPUT);
  for (const item of state.items) updateItem(state, item);
  return state;
};
