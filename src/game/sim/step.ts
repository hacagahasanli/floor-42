import { ARENA, CHARACTERS, DT, GRENADE, GUNS, PHYS, PUSH, RULES, WALL_SPLAT_DAMAGE, WALL_SPLAT_SPEED } from './constants';
import { EMPTY_INPUT } from './types';

import type { CharacterId, Fighter, GameState, GunKind, InputState, Pickup, Projectile, Weapon } from './types';

const approach = (v: number, target: number, delta: number) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);

const sign = (v: number): 1 | -1 => (v < 0 ? -1 : 1);

/** Deterministic PRNG kept in the state, so a server and a replay agree. */
const nextRandom = (state: GameState) => {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const newWeapon = (kind: GunKind): Weapon => ({
  kind,
  mag: GUNS[kind].mag,
  reserve: GUNS[kind].reserve,
  cooldown: 0,
  reload: 0,
});

/** Where bullets leave from: the chest. */
export const muzzle = (f: Fighter) => {
  const c = CHARACTERS[f.character];
  return { x: f.x + Math.cos(f.aim) * 0.7, y: f.y + c.height * 0.62 + Math.sin(f.aim) * 0.7 };
};

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
    aim: spawn.x < 0 ? 0 : Math.PI,
    onGround: true,
    wall: 0,
    airJumps: c.airJumps,
    airDashes: 1,
    dashTime: 0,
    dashCooldown: 0,
    dropTime: 0,
    hp: c.hp,
    kos: 0,
    stun: 0,
    pushCooldown: 0,
    pushTime: 0,
    pushHit: [],
    pushed: 0,
    respawn: 0,
    invulnerable: 0,
    weapon: newWeapon('pistol'),
    firing: 1,
    lastHitBy: null,
    prev: { ...EMPTY_INPUT },
  };
};

export const createGame = (characters: [CharacterId, CharacterId], seed = 1): GameState => {
  const pickups: Pickup[] = ARENA.gunSpawns.map((s, i) => ({
    id: i,
    kind: s.kind,
    x: s.x,
    y: s.y,
    vy: 0,
    active: true,
    respawn: 0,
    home: { x: s.x, y: s.y },
  }));
  for (let i = 0; i < ARENA.dropSlots; i++) {
    pickups.push({ id: pickups.length, kind: 'smg', x: 0, y: ARENA.ceiling, vy: 0, active: false, respawn: Infinity, home: null });
  }
  return {
    tick: 0,
    phase: 'countdown',
    phaseTime: RULES.countdownSeconds,
    winner: null,
    endReason: null,
    hitstop: 0,
    seed,
    dropTimer: ARENA.dropEvery,
    nextId: 1,
    fighters: characters.map((c, i) => createFighter(i, c)),
    pickups,
    projectiles: [],
    events: [],
  };
};

const respawnFighter = (f: Fighter) => {
  const spawn = ARENA.spawns[f.id % ARENA.spawns.length];
  Object.assign(f, {
    x: spawn.x,
    y: spawn.y + 2,
    vx: 0,
    vy: 0,
    facing: spawn.x < 0 ? 1 : -1,
    aim: spawn.x < 0 ? 0 : Math.PI,
    hp: CHARACTERS[f.character].hp,
    stun: 0,
    pushed: 0,
    pushTime: 0,
    dashTime: 0,
    weapon: newWeapon('pistol'),
    invulnerable: RULES.spawnInvulnerable,
    lastHitBy: null,
  });
};

const knockOut = (state: GameState, f: Fighter) => {
  f.hp = 0;
  f.respawn = RULES.respawnSeconds;
  f.pushTime = 0;
  state.events.push({ type: 'ko', fighter: f.id, by: f.lastHitBy, x: f.x, y: f.y + 1 });
  state.hitstop = 9;
  if (state.phase !== 'fight') return;
  const scorerId = f.lastHitBy !== null && f.lastHitBy !== f.id ? f.lastHitBy : state.fighters.find((o) => o.id !== f.id)?.id;
  if (scorerId === undefined) return;
  const scorer = state.fighters[scorerId];
  scorer.kos += 1;
  if (scorer.kos >= RULES.kosToWin) {
    state.phase = 'over';
    state.winner = scorer.id;
    state.endReason = 'kos';
  }
};

interface HitSpec {
  attacker: number;
  dx: number; // knockback direction
  dy: number;
  damage: number;
  knockback: number;
  push?: boolean;
}

/** Damages and shoves a fighter. Returns false if they cannot be hit right now. */
export const applyHit = (state: GameState, target: Fighter, hit: HitSpec): boolean => {
  if (target.respawn > 0 || target.invulnerable > 0) return false;
  const c = CHARACTERS[target.character];
  const k = hit.knockback / c.weight;
  const len = Math.hypot(hit.dx, hit.dy) || 1;
  target.vx += (hit.dx / len) * k;
  target.vy = Math.max(target.vy, (hit.dy / len) * k + (k > 6 ? 3 : 0));
  if (k > 6) target.onGround = false;
  target.stun = Math.max(target.stun, k > 6 ? 0.06 + k * 0.012 : 0);
  target.hp -= hit.damage;
  if (hit.attacker !== target.id) target.lastHitBy = hit.attacker;
  if (hit.push) target.pushed = 0.6;
  state.events.push({ type: 'hit', x: target.x, y: target.y + c.height * 0.6, power: k, damage: hit.damage });
  if (k > 10) state.hitstop = Math.max(state.hitstop, Math.min(6, Math.round(k * 0.25)));
  if (target.hp <= 0) knockOut(state, target);
  return true;
};

const explode = (state: GameState, p: Projectile) => {
  state.events.push({ type: 'explosion', x: p.x, y: p.y, radius: GRENADE.radius });
  for (const o of state.fighters) {
    const c = CHARACTERS[o.character];
    const dx = o.x - p.x;
    const dy = o.y + c.height / 2 - p.y;
    // Distance to the nearest point of the body, so a direct hit is a full hit.
    const nx = Math.min(Math.max(p.x, o.x - c.width / 2), o.x + c.width / 2);
    const ny = Math.min(Math.max(p.y, o.y), o.y + c.height);
    const d = Math.hypot(nx - p.x, ny - p.y);
    if (d > GRENADE.radius) continue;
    // Near the blast is lethal; the edge still hurts.
    const falloff = 0.5 + 0.5 * (1 - d / GRENADE.radius);
    const self = o.id === p.owner ? GRENADE.selfDamage : 1;
    applyHit(state, o, {
      attacker: p.owner,
      dx: dx || 0.01,
      dy: dy + 0.6,
      damage: p.damage * falloff * self,
      knockback: p.knockback * (0.4 + falloff * 0.6),
    });
  }
};

const fire = (state: GameState, f: Fighter) => {
  const g = GUNS[f.weapon.kind];
  const m = muzzle(f);
  for (let i = 0; i < g.pellets; i++) {
    const angle = f.aim + (nextRandom(state) - 0.5) * 2 * g.spread;
    const speed = g.speed * (g.pellets > 1 ? 0.85 + nextRandom(state) * 0.3 : 1);
    state.projectiles.push({
      id: state.nextId++,
      kind: g.projectile,
      owner: f.id,
      x: m.x,
      y: m.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: g.damage,
      knockback: g.knockback,
      life: g.life,
      hit: [],
    });
  }
  f.vx -= Math.cos(f.aim) * g.recoil;
  if (!f.onGround) f.vy -= Math.sin(f.aim) * g.recoil * 0.6;
  f.firing = 0;
  state.events.push({ type: 'shot', fighter: f.id, gun: f.weapon.kind, x: m.x, y: m.y, angle: f.aim });
};

/** The gun a fighter is standing on, if any. */
export const pickupCandidate = (state: GameState, f: Fighter): Pickup | null => {
  const c = CHARACTERS[f.character];
  for (const p of state.pickups) {
    if (!p.active) continue;
    if (Math.abs(p.x - f.x) < c.width / 2 + 0.6 && p.y > f.y - 0.6 && p.y < f.y + c.height) return p;
  }
  return null;
};

const takePickup = (state: GameState, f: Fighter, p: Pickup) => {
  f.weapon = newWeapon(p.kind);
  p.active = false;
  p.respawn = p.home ? RULES.gunRespawn : Infinity;
  state.events.push({ type: 'pickup', fighter: f.id, gun: p.kind });
};

const updateWeapon = (state: GameState, f: Fighter, input: InputState, canAct: boolean) => {
  const w = f.weapon;
  const g = GUNS[w.kind];
  w.cooldown = Math.max(0, w.cooldown - DT);
  f.firing += DT;

  if (w.reload > 0) {
    w.reload -= DT;
    if (w.reload <= 0) {
      const take = Math.min(g.mag - w.mag, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
    return;
  }
  const startReload = () => {
    if (w.mag >= g.mag || w.reserve <= 0) return;
    w.reload = g.reloadTime;
    state.events.push({ type: 'reload', fighter: f.id });
  };
  if (canAct && input.reload && !f.prev.reload) startReload();
  if (w.mag <= 0) {
    if (w.reserve > 0) startReload();
    else if (w.kind !== 'pistol') {
      // Out of everything: back to the pistol.
      f.weapon = newWeapon('pistol');
      state.events.push({ type: 'empty', fighter: f.id });
    }
    return;
  }
  if (canAct && input.fire && w.cooldown <= 0 && f.pushTime <= 0) {
    w.mag -= 1;
    w.cooldown = g.rate;
    fire(state, f);
  }
};

const updatePush = (state: GameState, f: Fighter) => {
  if (f.pushTime <= 0) return;
  const t = PUSH.duration - f.pushTime;
  f.pushTime -= DT;
  if (t < PUSH.activeFrom || t > PUSH.activeTo) return;
  const c = CHARACTERS[f.character];
  const cy = f.y + c.height * 0.55;
  const x0 = f.facing > 0 ? f.x : f.x - c.width / 2 - PUSH.reach;
  const x1 = f.facing > 0 ? f.x + c.width / 2 + PUSH.reach : f.x;
  for (const o of state.fighters) {
    if (o.id === f.id || f.pushHit.includes(o.id)) continue;
    const oc = CHARACTERS[o.character];
    const overlap = o.x + oc.width / 2 > x0 && o.x - oc.width / 2 < x1 && o.y + oc.height > cy - PUSH.span / 2 && o.y < cy + PUSH.span / 2;
    if (!overlap) continue;
    f.pushHit.push(o.id);
    applyHit(state, o, { attacker: f.id, dx: f.facing, dy: PUSH.lift, damage: PUSH.damage, knockback: PUSH.knockback, push: true });
  }
  // Force Push also sends enemy shots back where they came from.
  for (const p of state.projectiles) {
    if (p.owner === f.id || p.kind === 'rail') continue;
    if (p.x < x0 || p.x > x1 || Math.abs(p.y - cy) > PUSH.span / 2) continue;
    const speed = Math.hypot(p.vx, p.vy) * 1.2;
    const back = Math.atan2(-p.vy, -p.vx);
    p.vx = Math.cos(back) * speed;
    p.vy = Math.sin(back) * speed;
    p.owner = f.id;
    p.life = Math.max(p.life, 0.6);
    p.hit = [];
    state.events.push({ type: 'deflect', x: p.x, y: p.y });
  }
};

const updateFighter = (state: GameState, f: Fighter, input: InputState) => {
  const c = CHARACTERS[f.character];
  const halfW = c.width / 2;
  const pressed = (k: keyof InputState) => input[k] && !f.prev[k];

  f.dashTime = Math.max(0, f.dashTime - DT);
  f.dashCooldown = Math.max(0, f.dashCooldown - DT);
  f.dropTime = Math.max(0, f.dropTime - DT);
  f.stun = Math.max(0, f.stun - DT);
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

  // Aim follows the mouse. You face where you aim.
  if (state.phase === 'fight') {
    const m = { x: f.x, y: f.y + c.height * 0.62 };
    const dx = input.aimX - m.x;
    const dy = input.aimY - m.y;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) f.aim = Math.atan2(dy, dx);
    f.facing = Math.cos(f.aim) < 0 ? -1 : 1;
  }

  // Horizontal movement.
  const dir = canAct ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
  if (f.dashTime <= 0) {
    const maxSpeed = c.speed * GUNS[f.weapon.kind].carry;
    if (dir !== 0) {
      f.vx = approach(f.vx, dir * maxSpeed, (f.onGround ? PHYS.groundAccel : PHYS.airAccel) * DT);
    } else {
      const friction = f.stun > 0 ? 18 : f.onGround ? PHYS.groundFriction : PHYS.airFriction;
      f.vx = approach(f.vx, 0, friction * DT);
    }
  }

  // Jump, wall-kick, air jump.
  if (canAct && pressed('up')) {
    if (f.onGround) {
      f.vy = c.jump;
      f.onGround = false;
      state.events.push({ type: 'jump', x: f.x, y: f.y, wallKick: false });
    } else if (f.wall !== 0) {
      f.vx = -f.wall * PHYS.wallKickX;
      f.vy = c.jump * 0.95;
      f.airJumps = c.airJumps;
      f.airDashes = 1;
      state.events.push({ type: 'jump', x: f.x, y: f.y, wallKick: true });
    } else if (f.airJumps > 0) {
      f.airJumps -= 1;
      f.vy = c.jump * 0.88;
      state.events.push({ type: 'jump', x: f.x, y: f.y, wallKick: false });
    }
  }

  if (canAct && pressed('down') && f.onGround && f.y > ARENA.floor + 0.01) {
    f.dropTime = PHYS.dropTime;
    f.onGround = false;
  }

  // Dash: also dodges bullets while it lasts.
  if (canAct && pressed('dash') && f.dashCooldown <= 0 && (f.onGround || f.airDashes > 0)) {
    const d = dir !== 0 ? (dir as 1 | -1) : f.facing;
    f.vx = d * PHYS.dashSpeed;
    if (!f.onGround) {
      f.airDashes -= 1;
      f.vy = 0;
    }
    f.dashTime = PHYS.dashTime;
    f.dashCooldown = PHYS.dashCooldown;
    state.events.push({ type: 'dash', x: f.x, y: f.y });
  }

  if (canAct && pressed('push') && f.pushCooldown <= 0) {
    f.pushTime = PUSH.duration;
    f.pushCooldown = PUSH.cooldown;
    f.pushHit = [];
    state.events.push({ type: 'push', x: f.x, y: f.y + c.height * 0.55, facing: f.facing });
  }

  // Walking over a gun with only the pistol picks it up; E swaps any time.
  const near = canAct ? pickupCandidate(state, f) : null;
  if (near && (pressed('pickup') || f.weapon.kind === 'pistol')) takePickup(state, f, near);

  updateWeapon(state, f, input, canAct);
  updatePush(state, f);

  // Gravity.
  if (f.dashTime > 0 && !f.onGround) {
    f.vy = 0;
  } else {
    const fastFall = canAct && input.down && !f.onGround && f.vy < 3;
    f.vy -= (fastFall ? PHYS.fastFall : PHYS.gravity) * DT;
    const hugging = f.wall !== 0 && dir === f.wall;
    f.vy = Math.max(f.vy, hugging ? -PHYS.wallSlide : -PHYS.maxFall);
  }

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
      f.stun = 0.5;
      f.hp -= WALL_SPLAT_DAMAGE;
      state.hitstop = Math.max(state.hitstop, 7);
      state.events.push({ type: 'wallSplat', side, y: f.y + c.height * 0.6 });
      if (f.hp <= 0) knockOut(state, f);
    } else if (into > 0) {
      f.vx = 0;
    }
  }

  if (f.y + c.height > ARENA.ceiling) {
    f.y = ARENA.ceiling - c.height;
    f.vy = Math.min(f.vy, 0);
  }

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
  f.prev = { ...input };
};

const updateProjectiles = (state: GameState) => {
  state.projectiles = state.projectiles.filter((p) => {
    p.life -= DT;
    const px = p.x;
    const py = p.y;
    if (p.kind === 'grenade') p.vy -= GRENADE.gravity * DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;

    const done = () => {
      if (p.kind === 'grenade') explode(state, p);
      else state.events.push({ type: 'impact', x: p.x, y: p.y });
      return false;
    };

    if (p.life <= 0) return p.kind === 'grenade' ? done() : false;

    // Find where this tick's path is cut short: the room's walls, or furniture
    // (cover; rails go straight through it). Only fighters before that point get hit.
    let tEnd = 1;
    let blocked = false;
    const cut = (t: number) => {
      if (t >= 0 && t < tEnd) {
        tEnd = t;
        blocked = true;
      }
    };
    const ddx = p.x - px;
    const ddy = p.y - py;
    if (p.x < ARENA.left) cut((ARENA.left - px) / ddx);
    if (p.x > ARENA.right) cut((ARENA.right - px) / ddx);
    if (p.y < ARENA.floor) cut((ARENA.floor - py) / ddy);
    if (p.y > ARENA.ceiling) cut((ARENA.ceiling - py) / ddy);
    // A shot skimming along a desk top at chest height grazes past; only shots coming
    // down onto or up into furniture are stopped.
    if (p.kind !== 'rail' && Math.abs(ddy) > Math.abs(ddx) * 0.15) {
      for (const pl of ARENA.platforms) {
        if ((py - pl.y) * (p.y - pl.y) > 0 || ddy === 0) continue;
        const t = (pl.y - py) / ddy;
        const cx = px + ddx * t;
        if (cx >= pl.x0 && cx <= pl.x1) cut(t);
      }
    }
    const ex = px + ddx * tEnd;
    const ey = py + ddy * tEnd;

    // Hit fighters along the path (fast rounds would skip over thin targets).
    for (const o of state.fighters) {
      if (o.id === p.owner || o.respawn > 0 || p.hit.includes(o.id)) continue;
      if (o.dashTime > 0) continue; // dodged
      const oc = CHARACTERS[o.character];
      const x0 = o.x - oc.width / 2 - 0.08;
      const x1 = o.x + oc.width / 2 + 0.08;
      const y0 = o.y;
      const y1 = o.y + oc.height;
      if (!segmentHitsBox(px, py, ex, ey, x0, y0, x1, y1)) continue;
      if (p.kind === 'grenade') {
        p.x = Math.min(Math.max(ex, x0), x1);
        p.y = ey;
        return done();
      }
      const landed = applyHit(state, o, { attacker: p.owner, dx: p.vx, dy: p.vy * 0.3 + Math.abs(p.vx) * 0.15, damage: p.damage, knockback: p.knockback });
      if (!landed) continue;
      if (p.kind === 'rail') {
        p.hit.push(o.id);
        continue;
      }
      return false;
    }
    if (blocked) {
      p.x = ex;
      p.y = ey;
      return done();
    }
    return true;
  });
};

/** Liang–Barsky style test: does the segment touch the box? */
const segmentHitsBox = (ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number) => {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay);
};

const updatePickups = (state: GameState) => {
  for (const p of state.pickups) {
    if (!p.active) {
      if (!p.home) continue;
      p.respawn -= DT;
      if (p.respawn <= 0) Object.assign(p, { active: true, x: p.home.x, y: p.home.y, vy: 0 });
      continue;
    }
    // Ceiling drops fall onto whatever is below them.
    if (p.home) continue;
    const prevY = p.y;
    p.vy = Math.max(p.vy - PHYS.gravity * 0.5 * DT, -12);
    p.y += p.vy * DT;
    if (p.y <= ARENA.floor) {
      p.y = ARENA.floor;
      p.vy = 0;
    }
    for (const pl of ARENA.platforms) {
      if (p.x >= pl.x0 && p.x <= pl.x1 && prevY >= pl.y && p.y <= pl.y) {
        p.y = pl.y;
        p.vy = 0;
      }
    }
  }

  if (state.phase !== 'fight') return;
  state.dropTimer -= DT;
  if (state.dropTimer > 0) return;
  state.dropTimer = ARENA.dropEvery;
  const slot = state.pickups.find((p) => !p.home && !p.active);
  if (!slot) return;
  const kind = ARENA.dropKinds[Math.floor(nextRandom(state) * ARENA.dropKinds.length)];
  const x = ARENA.left + 2 + nextRandom(state) * (ARENA.right - ARENA.left - 4);
  Object.assign(slot, { kind, x, y: ARENA.ceiling - 0.4, vy: 0, active: true });
  state.events.push({ type: 'drop', x });
};

/** Advances the game by one fixed tick (DT). Mutates and returns the state. */
export const step = (state: GameState, inputs: InputState[]): GameState => {
  state.events = [];
  state.tick += 1;

  // Hitstop: the world holds still for a few ticks so big hits land with weight.
  if (state.hitstop > 0) {
    state.hitstop -= 1;
    return state;
  }

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
      state.endReason = 'time';
      const [a, b] = state.fighters;
      state.winner = a.kos === b.kos ? -1 : a.kos > b.kos ? a.id : b.id;
    }
  }

  for (const f of state.fighters) updateFighter(state, f, inputs[f.id] ?? EMPTY_INPUT);
  updateProjectiles(state);
  updatePickups(state);
  return state;
};

export { sign };
