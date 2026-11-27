import {
  ARENA,
  arenaOf,
  ASSIST,
  BOMB,
  CHARACTERS,
  CROUCH,
  DT,
  GRENADE,
  GUNS,
  baseOf,
  isClosed,
  isSolid,
  PHYS,
  PUSH,
  RULES,
  WALL_SPLAT_DAMAGE,
  WALL_SPLAT_SPEED,
} from './constants';
import { EMPTY_INPUT } from './types';

import type { ArenaData, ArenaId } from './constants';
import type {
  CharacterId,
  Fighter,
  GameState,
  GunKind,
  InputState,
  Pickup,
  Projectile,
  Weapon,
} from './types';

const approach = (v: number, target: number, delta: number) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);

const sign = (v: number): 1 | -1 => (v < 0 ? -1 : 1);

/** On top of a desk, the table or the counter: Down does nothing there (there is no room under it). */
const standingOnSolid = (A: ArenaData, f: Fighter, halfW: number) =>
  A.platforms.some((p) => isSolid(p) && Math.abs(f.y - p.y) < 0.001 && f.x + halfW * 0.5 >= p.x0 && f.x - halfW * 0.5 <= p.x1);

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

/** How tall the body (and its hitbox) is right now: lower while crouching. */
export const bodyHeight = (f: Fighter) =>
  CHARACTERS[f.character].height * (1 - (1 - CROUCH.height) * (f.crouch ?? 0));

/** Where bullets leave from: the chest (lower while crouching). */
export const muzzle = (f: Fighter) => {
  return { x: f.x + Math.cos(f.aim) * 0.7, y: f.y + bodyHeight(f) * 0.62 + Math.sin(f.aim) * 0.7 };
};

export const createFighter = (id: number, character: CharacterId, A: ArenaData = ARENA): Fighter => {
  const spawn = A.spawns[id % A.spawns.length];
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
    aimTx: 0,
    aimTy: 0,
    onGround: true,
    wall: 0,
    airJumps: c.airJumps,
    airDashes: 1,
    dashTime: 0,
    dashCooldown: 0,
    dropTime: 0,
    crouch: 0,
    hp: c.hp,
    kos: 0,
    stats: { damage: 0, shots: 0, hits: 0, deaths: 0, streak: 0, bestStreak: 0 },
    stun: 0,
    pushCooldown: 0,
    pushTime: 0,
    pushHit: [],
    pushed: 0,
    respawn: 0,
    invulnerable: 0,
    sinceHit: 0,
    weapon: newWeapon('pistol'),
    bombs: 0,
    nextCharacter: null,
    firing: 1,
    lastHitBy: null,
    prev: { ...EMPTY_INPUT },
  };
};

/** `net`: an online match (no hitstop, see GameState.net). */
export const createGame = (
  characters: [CharacterId, CharacterId],
  seed = 1,
  net = false,
  local?: { kosToWin: number; assist: boolean },
  extra?: { gunGrace?: { fighter: number; ticks: number }; countdownSeconds?: number; arena?: ArenaId },
): GameState => {
  const A = arenaOf({ arena: extra?.arena });
  const fighters = characters.map((c, i) => createFighter(i, c, A));
  fighters.forEach((f) => Object.assign(f, { x: 0, y: 0 }));
  const pickups: Pickup[] = A.gunSpawns.map((_, i) => ({
    id: i,
    kind: 'smg',
    x: 0,
    y: 0,
    vy: 0,
    active: false,
    respawn: 0,
    spawn: i,
  }));
  for (let i = 0; i < A.dropSlots; i++) {
    pickups.push({
      id: pickups.length,
      kind: 'smg',
      x: 0,
      y: A.ceiling,
      vy: 0,
      active: false,
      respawn: Infinity,
      spawn: null,
    });
  }
  const state: GameState = {
    tick: 0,
    phase: 'countdown',
    phaseTime: extra?.countdownSeconds ?? RULES.countdownSeconds,
    winner: null,
    endReason: null,
    paused: false,
    hitstop: 0,
    ...(net ? { net: true } : {}),
    ...(local ? { kosToWin: local.kosToWin, assist: local.assist } : {}),
    ...(extra?.gunGrace ? { gunGrace: { ...extra.gunGrace } } : {}),
    // The office is the absence of the field, so online states and snapshots stay as they were.
    ...(A.id !== 'office' ? { arena: A.id } : {}),
    seed,
    dropTimer: A.dropEvery,
    nextId: 1,
    fighters,
    pickups,
    projectiles: [],
    events: [],
  };
  // Random starting spots (far apart) and random guns on each floor.
  for (const f of state.fighters) placeAtSpawn(state, f);
  // Local 2-player: P1 starts on the left, under the P1 plate, P2 on the right (same two spots, swapped if needed).
  // Respawns after a KO keep the normal rule.
  if (local && fighters[0].x > fighters[1].x) {
    const [a, b] = fighters;
    const spot = { x: a.x, y: a.y };
    Object.assign(a, { x: b.x, y: b.y });
    Object.assign(b, spot);
    for (const f of fighters) {
      f.facing = f.x < 0 ? 1 : -1;
      f.aim = f.facing > 0 ? 0 : Math.PI;
    }
  }
  for (const p of state.pickups) {
    if (p.spawn === null) continue;
    const firstAt = A.gunSpawns[p.spawn].firstAt;
    // A delayed entry starts empty; updatePickups counts it down once the fight begins.
    if (firstAt !== undefined) p.respawn = firstAt;
    else placeGun(state, p);
  }
  return state;
};

/** Put a fighter on a random spawn point, preferring ones far from everyone else. */
const placeAtSpawn = (state: GameState, f: Fighter) => {
  const others = state.fighters.filter(
    (o) => o !== f && o.respawn <= 0 && (o.x !== 0 || o.y !== 0),
  );
  const scored = arenaOf(state).spawns.map((p) => ({
    p,
    d: others.length ? Math.min(...others.map((o) => Math.hypot(o.x - p.x, o.y - p.y))) : 99,
  }));
  const far = scored.filter((s) => s.d > 12);
  const pool = far.length ? far : scored.sort((a, b) => b.d - a.d).slice(0, 2);
  const spot = pool[Math.floor(nextRandom(state) * pool.length)].p;
  f.x = spot.x;
  f.y = spot.y;
  f.facing = spot.x < 0 ? 1 : -1;
  f.aim = f.facing > 0 ? 0 : Math.PI;
};

/** A floor's gun appears at a random spot on that floor, as a random kind. */
const placeGun = (state: GameState, p: Pickup) => {
  const def = arenaOf(state).gunSpawns[p.spawn!];
  const spot = def.spots[Math.floor(nextRandom(state) * def.spots.length)];
  Object.assign(p, {
    kind: def.kinds[Math.floor(nextRandom(state) * def.kinds.length)],
    x: spot.x,
    y: spot.y,
    vy: 0,
    active: true,
  });
};

/** Pick the character you come back as. Takes effect at your next respawn. */
export const chooseCharacter = (state: GameState, id: number, character: CharacterId) => {
  const f = state.fighters[id];
  if (f && character in CHARACTERS) f.nextCharacter = character;
};

const respawnFighter = (state: GameState, f: Fighter) => {
  if (f.nextCharacter) {
    f.character = f.nextCharacter;
    f.nextCharacter = null;
  }
  placeAtSpawn(state, f);
  Object.assign(f, {
    y: f.y + 1.5,
    vx: 0,
    vy: 0,
    hp: CHARACTERS[f.character].hp,
    stun: 0,
    pushed: 0,
    pushTime: 0,
    dashTime: 0,
    crouch: 0,
    weapon: newWeapon('pistol'),
    bombs: 0,
    invulnerable: RULES.spawnInvulnerable,
    sinceHit: 0,
    lastHitBy: null,
  });
};

const knockOut = (state: GameState, f: Fighter) => {
  f.hp = 0;
  f.respawn = RULES.respawnSeconds;
  f.pushTime = 0;
  state.events.push({ type: 'ko', fighter: f.id, by: f.lastHitBy, x: f.x, y: f.y + 1 });
  if (!state.net) state.hitstop = 9;
  if (state.phase !== 'fight') return;
  const scorerId =
    f.lastHitBy !== null && f.lastHitBy !== f.id
      ? f.lastHitBy
      : state.fighters.find((o) => o.id !== f.id)?.id;
  if (scorerId === undefined) return;
  const scorer = state.fighters[scorerId];
  scorer.kos += 1;
  f.stats.deaths += 1;
  f.stats.streak = 0;
  scorer.stats.streak += 1;
  scorer.stats.bestStreak = Math.max(scorer.stats.bestStreak, scorer.stats.streak);
  if (scorer.kos >= (state.kosToWin ?? RULES.kosToWin)) {
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
  if (hit.damage > 0) target.sinceHit = 0;
  if (hit.attacker !== target.id) {
    target.lastHitBy = hit.attacker;
    const a = state.fighters[hit.attacker];
    if (a) {
      a.stats.damage += Math.min(hit.damage, hit.damage + Math.min(0, target.hp));
      // One hit per shot: pellets and splash from the same shot count once.
      if (a.stats.hits < a.stats.shots) a.stats.hits += 1;
    }
  }
  if (hit.push) target.pushed = 0.6;
  state.events.push({
    type: 'hit',
    fighter: target.id,
    x: target.x,
    y: target.y + bodyHeight(target) * 0.6,
    power: k,
    damage: hit.damage,
    by: hit.attacker,
  });
  if (k > 10 && !state.net) state.hitstop = Math.max(state.hitstop, Math.min(6, Math.round(k * 0.25)));
  if (target.hp <= 0) knockOut(state, target);
  return true;
};

const isExplosive = (k: Projectile['kind']) => k === 'grenade' || k === 'bomb';

const explode = (state: GameState, p: Projectile) => {
  const blast = p.kind === 'bomb' ? BOMB : GRENADE;
  state.events.push({ type: 'explosion', x: p.x, y: p.y, radius: blast.radius, owner: p.owner });
  for (const o of state.fighters) {
    const c = CHARACTERS[o.character];
    const h = bodyHeight(o);
    const dx = o.x - p.x;
    const dy = o.y + h / 2 - p.y;
    // Distance to the nearest point of the body, so a direct hit is a full hit.
    const nx = Math.min(Math.max(p.x, o.x - c.width / 2), o.x + c.width / 2);
    const ny = Math.min(Math.max(p.y, o.y), o.y + h);
    const d = Math.hypot(nx - p.x, ny - p.y);
    if (d > blast.radius) continue;
    // Near the blast is lethal; the edge still hurts.
    const falloff =
      p.kind === 'bomb' ? Math.max(0.15, 1 - d / blast.radius) : 0.5 + 0.5 * (1 - d / blast.radius);
    const self = o.id === p.owner ? blast.selfDamage : 1;
    applyHit(state, o, {
      attacker: p.owner,
      dx: dx || 0.01,
      dy: dy + 0.6,
      damage: p.damage * falloff * self,
      knockback: p.knockback * (0.4 + falloff * 0.6),
    });
  }
};

/** The low-arc launch angle that lands a lobbed throw on (tx, ty); 45° if it can't reach. */
export const lobAngle = (x: number, y: number, tx: number, ty: number, v: number, g: number) => {
  const dx = Math.abs(tx - x);
  const dy = ty - y;
  const dir = tx >= x ? 1 : -1;
  const disc = v ** 4 - g * (g * dx * dx + 2 * dy * v * v);
  const up = disc < 0 || dx < 0.01 ? Math.PI / 4 : Math.atan((v * v - Math.sqrt(disc)) / (g * dx));
  return dir > 0 ? up : Math.PI - up;
};

const fire = (state: GameState, f: Fighter, kind: GunKind = f.weapon.kind) => {
  const g = GUNS[kind];
  const m = muzzle(f);
  for (let i = 0; i < g.pellets; i++) {
    let angle = f.aim + (nextRandom(state) - 0.5) * 2 * g.spread;
    if (g.projectile === 'bomb')
      angle = lobAngle(m.x, m.y, f.aimTx, f.aimTy, g.speed, BOMB.gravity);
    const speed = g.speed * (g.pellets > 1 ? 0.85 + nextRandom(state) * 0.3 : 1);
    state.projectiles.push({
      id: state.nextId++,
      kind: g.projectile,
      gun: kind,
      owner: f.id,
      x: m.x,
      y: m.y,
      ox: m.x,
      oy: m.y,
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
  state.events.push({
    type: 'shot',
    fighter: f.id,
    gun: kind,
    x: m.x,
    y: m.y,
    angle: f.aim,
  });
  f.stats.shots += 1;
};

/** The gun a fighter is standing on, if any. */
export const pickupCandidate = (state: GameState, f: Fighter): Pickup | null => {
  const c = CHARACTERS[f.character];
  for (const p of state.pickups) {
    if (!p.active) continue;
    if (Math.abs(p.x - f.x) < c.width / 2 + 0.6 && p.y > f.y - 0.6 && p.y < f.y + c.height)
      return p;
  }
  return null;
};

const takePickup = (state: GameState, f: Fighter, p: Pickup) => {
  // A bomb goes in its own one-bomb slot: your gun stays in hand.
  if (p.kind === 'bomb') f.bombs = 1;
  else f.weapon = newWeapon(p.kind);
  p.active = false;
  p.respawn = p.spawn !== null ? (arenaOf(state).gunSpawns[p.spawn].respawn ?? RULES.gunRespawn) : Infinity;
  state.events.push({ type: 'pickup', fighter: f.id, gun: p.kind });
};

/** Under a quarter of the gun's full load (magazine + reserve) left. The pistol never runs low. */
export const lowAmmo = (w: Weapon) => {
  const g = GUNS[w.kind];
  if (w.kind === 'pistol' || !Number.isFinite(g.reserve)) return false;
  return w.mag + w.reserve < ASSIST.lowAmmo * (g.mag + g.reserve);
};

/**
 * Local 2-player pick up (no Pick up key): a bomb goes in its slot, a gun is taken at once with only the pistol or a
 * nearly empty gun, otherwise after standing on it for ASSIST.swapHold seconds. Stepping off resets the wait.
 */
const assistPickup = (state: GameState, f: Fighter, near: Pickup | null) => {
  if (!near) {
    f.pickupHold = 0;
    f.pickupHoldId = undefined;
    return;
  }
  if (near.kind === 'bomb') {
    if (!f.bombs) takePickup(state, f, near);
    return;
  }
  if (f.pickupHoldId !== near.id) {
    f.pickupHoldId = near.id;
    f.pickupHold = 0;
  }
  if (f.weapon.kind === 'pistol' || lowAmmo(f.weapon)) {
    takePickup(state, f, near);
    f.pickupHold = 0;
    return;
  }
  f.pickupHold = (f.pickupHold ?? 0) + DT;
  if (f.pickupHold >= ASSIST.swapHold - 1e-9) {
    takePickup(state, f, near);
    f.pickupHold = 0;
    f.pickupHoldId = undefined;
  }
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
  // Local 2-player: a part-empty magazine reloads itself after a pause in shooting.
  if (state.assist && canAct && w.mag > 0 && f.firing >= ASSIST.reloadIdle) {
    startReload();
    if (w.reload > 0) return;
  }
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
  const cy = f.y + bodyHeight(f) * 0.55;
  const x0 = f.facing > 0 ? f.x : f.x - c.width / 2 - PUSH.reach;
  const x1 = f.facing > 0 ? f.x + c.width / 2 + PUSH.reach : f.x;
  for (const o of state.fighters) {
    if (o.id === f.id || f.pushHit.includes(o.id)) continue;
    const oc = CHARACTERS[o.character];
    const overlap =
      o.x + oc.width / 2 > x0 &&
      o.x - oc.width / 2 < x1 &&
      o.y + bodyHeight(o) > cy - PUSH.span / 2 &&
      o.y < cy + PUSH.span / 2;
    if (!overlap) continue;
    f.pushHit.push(o.id);
    applyHit(state, o, {
      attacker: f.id,
      dx: f.facing,
      dy: PUSH.lift,
      damage: PUSH.damage,
      knockback: PUSH.knockback,
      push: true,
    });
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
    state.events.push({ type: 'deflect', x: p.x, y: p.y, fighter: f.id });
  }
};

const updateFighter = (state: GameState, f: Fighter, input: InputState) => {
  const A = arenaOf(state);
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
  // Out of the fight for a while, you heal: an old wound no longer makes the next hit a KO.
  f.sinceHit += DT;
  if (f.respawn <= 0 && f.hp > 0 && f.sinceHit >= RULES.regenAfter)
    f.hp = Math.min(CHARACTERS[f.character].hp, f.hp + RULES.regenPerSecond * DT);

  if (f.respawn > 0) {
    f.respawn -= DT;
    if (f.respawn <= 0) respawnFighter(state, f);
    f.prev = { ...input };
    return;
  }

  const canAct = state.phase === 'fight' && f.stun <= 0;

  // Aim follows the mouse. You face where you aim.
  if (state.phase === 'fight') {
    const m = { x: f.x, y: f.y + bodyHeight(f) * 0.62 };
    const dx = input.aimX - m.x;
    const dy = input.aimY - m.y;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) f.aim = Math.atan2(dy, dx);
    f.aimTx = input.aimX;
    f.aimTy = input.aimY;
    f.facing = Math.cos(f.aim) < 0 ? -1 : 1;
  }

  // Crouch: held on the ground. Down crouches where it cannot drop you (the floor, a desk, the table, the
  // counter, a box); the Crouch key also works on walkways. Not in the air (Down is the fast fall there) and
  // not during a dash; a jump or a dash stands you up.
  const solidGround = f.y <= A.floor + 0.01 || standingOnSolid(A, f, halfW);
  const wantCrouch = canAct && f.onGround && f.dashTime <= 0 && (input.crouch || (input.down && solidGround));
  f.crouch = approach(f.crouch ?? 0, wantCrouch ? 1 : 0, DT / CROUCH.time);
  if (Math.abs(f.crouch - Math.round(f.crouch)) < 1e-9) f.crouch = Math.round(f.crouch); // no float dust at the ends

  // Horizontal movement.
  const dir = canAct ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
  if (f.dashTime <= 0) {
    const maxSpeed = c.speed * GUNS[f.weapon.kind].carry * (1 - (1 - CROUCH.speed) * f.crouch);
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
      state.events.push({ type: 'jump', x: f.x, y: f.y, wallKick: false, fighter: f.id });
    } else if (f.wall !== 0) {
      f.vx = -f.wall * PHYS.wallKickX;
      f.vy = c.jump * 0.95;
      f.airJumps = c.airJumps;
      f.airDashes = 1;
      state.events.push({ type: 'jump', x: f.x, y: f.y, wallKick: true, fighter: f.id });
    } else if (f.airJumps > 0) {
      f.airJumps -= 1;
      f.vy = c.jump * 0.88;
      state.events.push({ type: 'jump', x: f.x, y: f.y, wallKick: false, fighter: f.id });
    }
  }

  if (canAct && pressed('down') && f.onGround && f.y > A.floor + 0.01 && !standingOnSolid(A, f, halfW)) {
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
    state.events.push({ type: 'dash', x: f.x, y: f.y, fighter: f.id });
  }

  // Local 2-player: while a bomb is carried, Push throws it instead.
  const pushThrows = !!state.assist && f.bombs > 0 && pressed('push');
  if (canAct && !pushThrows && pressed('push') && f.pushCooldown <= 0) {
    f.pushTime = PUSH.duration;
    f.pushCooldown = PUSH.cooldown;
    f.pushHit = [];
    state.events.push({ type: 'push', x: f.x, y: f.y + bodyHeight(f) * 0.55, facing: f.facing, fighter: f.id });
  }

  // Only a pistol: walk over a gun to take it. Bombs are always picked up (own slot). Otherwise press Pick up (F) to swap;
  // Reload (R) only reloads.
  const graced = state.gunGrace?.fighter === f.id && state.tick < (state.gunGrace.until ?? Infinity);
  const near = canAct && !graced ? pickupCandidate(state, f) : null;
  // A bomb is always picked up (one at a time: a second stays where it is); a gun needs Pick up or a pistol in hand.
  if (state.assist) assistPickup(state, f, near);
  else if (near && (near.kind === 'bomb' ? !f.bombs : pressed('pickup') || f.weapon.kind === 'pistol'))
    takePickup(state, f, near);

  updateWeapon(state, f, input, canAct);
  // Throw bomb: your gun stays in hand; the bomb is lobbed to the aim point.
  if (canAct && f.bombs > 0 && (pressed('throwBomb') || pushThrows) && f.pushTime <= 0) {
    f.bombs = 0;
    fire(state, f, 'bomb');
  }
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
  const prevX = f.x;
  f.x += f.vx * DT;
  f.y += f.vy * DT;

  // A box standing on a walkway or a balcony has an underside: a jump from below stops under it.
  for (const p of A.platforms) {
    const base = baseOf(p);
    if (!isSolid(p) || base <= A.floor) continue;
    if (prevY + c.height > base + 0.001 || f.y + c.height <= base) continue;
    if (f.x + halfW * 0.5 <= p.x0 || f.x - halfW * 0.5 >= p.x1) continue;
    f.y = base - c.height;
    f.vy = Math.min(f.vy, 0);
  }

  // Desks, the table, the counter and boxes are solid: below their top you stop at their side.
  // Only if you were already below the top last tick; coming down onto them is a landing (below).
  for (const p of A.platforms) {
    if (!isSolid(p) || prevY >= p.y - 0.001 || f.y >= p.y - 0.001) continue;
    if (f.y + c.height <= baseOf(p) + 0.001) continue;
    if (f.x + halfW <= p.x0 || f.x - halfW >= p.x1) continue;
    const fromLeft = prevX + halfW <= p.x0 + 0.001;
    const fromRight = prevX - halfW >= p.x1 - 0.001;
    const left = fromLeft || (!fromRight && f.x < (p.x0 + p.x1) / 2);
    f.x = left ? p.x0 - halfW : p.x1 + halfW;
    if (f.vx * (left ? 1 : -1) > 0) f.vx = 0;
  }

  // Glass walls.
  let touching: -1 | 0 | 1 = 0;
  for (const side of [-1, 1] as const) {
    const limit = side < 0 ? A.left + halfW : A.right - halfW;
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
      if (!state.net) state.hitstop = Math.max(state.hitstop, 7);
      state.events.push({ type: 'wallSplat', side, y: f.y + c.height * 0.6, fighter: f.id });
      if (f.hp <= 0) knockOut(state, f);
    } else if (into > 0) {
      f.vx = 0;
    }
  }

  if (f.y + c.height > A.ceiling) {
    f.y = A.ceiling - c.height;
    f.vy = Math.min(f.vy, 0);
  }

  f.onGround = false;
  // Land when the body moved down (or not at all) this tick. Not `vy <= 0`: a wall splat above
  // sets an upward bounce after the move, and the fall already made would then skip the floor
  // or the furniture under you.
  if (f.y <= prevY) {
    let landY: number | null = null;
    if (f.y <= A.floor) landY = A.floor;
    else if (f.dropTime <= 0) {
      for (const p of A.platforms) {
        if (f.x + halfW * 0.5 < p.x0 || f.x - halfW * 0.5 > p.x1) continue;
        if (prevY >= p.y - 0.001 && f.y <= p.y) {
          landY = p.y;
          break;
        }
      }
    }
    if (landY !== null) {
      f.y = landY;
      // A splat's bounce still pops you up, from the surface instead of from inside it.
      if (f.vy <= 0) {
        f.vy = 0;
        f.onGround = true;
        f.airJumps = c.airJumps;
        f.airDashes = 1;
      }
    }
  }
  f.wall = f.onGround ? 0 : touching;
  f.prev = { ...input };
};

/**
 * Where furniture stops a shot moving (ddx, ddy) from (px, py) this tick, as a fraction of the step (Infinity: it
 * flies on). Every solid box (desks, the table, the counter, crates, metal boxes, the server rack) is cover from the
 * floor (or its base) to its top: a shot into its side stops, however flat, so a fighter crouched behind a desk is
 * hidden and one standing behind it shows only what rises above the top. A shot skimming along a top at chest
 * height grazes past; only steep shots coming down onto a top stop there. Walkways and shelves stop any shot
 * crossing them, however flat, so whoever stands on one is covered from below. Rails pierce bodies, one-way
 * floors and the closed boxes, but stop at desks, the table and the counter.
 */
const furnitureCut = (A: ArenaData, px: number, py: number, ddx: number, ddy: number, kind: Projectile['kind']) => {
  let tEnd = Infinity;
  const cut = (t: number) => {
    if (t >= 0 && t < tEnd) tEnd = t;
  };
  const ex = px + ddx;
  const ey = py + ddy;
  if (kind !== 'rail' && ddy !== 0) {
    const steep = Math.abs(ddy) > Math.abs(ddx) * 0.15;
    for (const pl of A.platforms) {
      if ((py - pl.y) * (ey - pl.y) > 0 || (!steep && isSolid(pl))) continue;
      const t = (pl.y - py) / ddy;
      const cx = px + ddx * t;
      if (cx >= pl.x0 && cx <= pl.x1) cut(t);
    }
  }
  for (const pl of A.platforms) {
    // Rails still go through the closed boxes up on the walkways and balconies (they are leg cover against guns).
    if (!isSolid(pl) || (kind === 'rail' && isClosed(pl))) continue;
    const base = baseOf(pl);
    if (px > pl.x0 && px < pl.x1 && py > base && py < pl.y) {
      cut(0);
      continue;
    }
    if (ddx === 0) continue;
    for (const sx of [pl.x0, pl.x1]) {
      if ((px - sx) * (ex - sx) > 0) continue;
      const t = (sx - px) / ddx;
      const cy = py + ddy * t;
      if (cy >= base && cy <= pl.y) cut(t);
    }
  }
  return tEnd;
};

/** True when a round fired from (ax, ay) would reach (bx, by) without furniture stopping it. */
export const clearShot = (A: ArenaData, ax: number, ay: number, bx: number, by: number, kind: Projectile['kind'] = 'bullet') =>
  furnitureCut(A, ax, ay, bx - ax, by - ay, kind) > 1;

/** Where a fighter's shots come from when aiming at (tx, ty): the muzzle for that aim. */
const muzzleToward = (f: Fighter, tx: number, ty: number) => {
  const cy = f.y + bodyHeight(f) * 0.62;
  const a = Math.atan2(ty - cy, tx - f.x);
  return { x: f.x + Math.cos(a) * 0.7, y: cy + Math.sin(a) * 0.7 };
};

/** Heights on the rival's body to try, as fractions of it: the chest first, then up to the head, then down. */
const AIM_SPOTS = [0.55, 0.7, 0.85, 0.95, 0.4, 0.25, 0.1];

/**
 * The point on the rival's body that fighter `id`'s gun can hit from here, for auto-aim and the bot: the chest
 * when nothing is in the way, the head over a desk, or null when furniture hides them completely.
 */
export const visibleAim = (state: GameState, id: number): { x: number; y: number } | null => {
  const me = state.fighters[id];
  const foe = state.fighters.find((f) => f.id !== id)!;
  const kind = GUNS[me.weapon.kind].projectile;
  const h = bodyHeight(foe);
  for (const k of AIM_SPOTS) {
    const tx = foe.x;
    const ty = foe.y + h * k;
    const m = muzzleToward(me, tx, ty);
    if (clearShot(arenaOf(state), m.x, m.y, tx, ty, kind)) return { x: tx, y: ty };
  }
  return null;
};

const updateProjectiles = (state: GameState) => {
  const A = arenaOf(state);
  state.projectiles = state.projectiles.filter((p) => {
    p.life -= DT;
    const px = p.x;
    const py = p.y;
    if (p.kind === 'grenade') p.vy -= GRENADE.gravity * DT;
    if (p.kind === 'bomb') p.vy -= BOMB.gravity * DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;

    const done = () => {
      if (isExplosive(p.kind)) explode(state, p);
      else state.events.push({ type: 'impact', x: p.x, y: p.y, owner: p.owner });
      return false;
    };

    if (p.life <= 0) return isExplosive(p.kind) ? done() : false;

    // Find where this tick's path is cut short: the room's walls, or furniture (cover).
    // Only fighters before that point get hit.
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
    if (p.x < A.left) cut((A.left - px) / ddx);
    if (p.x > A.right) cut((A.right - px) / ddx);
    if (p.y < A.floor) cut((A.floor - py) / ddy);
    if (p.y > A.ceiling) cut((A.ceiling - py) / ddy);
    cut(furnitureCut(A, px, py, ddx, ddy, p.kind));
    // A stopped shot ends just short of what stopped it: a body standing on a walkway starts
    // exactly at its top, and a shot that stops under the walkway must not touch their feet.
    const tHit = blocked ? Math.max(0, tEnd - 0.01 / (Math.hypot(ddx, ddy) || 1)) : tEnd;
    const hx = px + ddx * tHit;
    const hy = py + ddy * tHit;
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
      const y1 = o.y + bodyHeight(o);
      if (!segmentHitsBox(px, py, hx, hy, x0, y0, x1, y1)) continue;
      if (isExplosive(p.kind)) {
        p.x = Math.min(Math.max(ex, x0), x1);
        p.y = ey;
        return done();
      }
      // Damage falls off with the distance the shot travelled.
      const fo = GUNS[p.gun].falloff;
      const travelled = Math.hypot(o.x - p.ox, o.y + bodyHeight(o) / 2 - p.oy);
      const scale = fo
        ? 1 - (1 - fo.min) * Math.min(1, Math.max(0, (travelled - fo.near) / (fo.far - fo.near)))
        : 1;
      const landed = applyHit(state, o, {
        attacker: p.owner,
        dx: p.vx,
        dy: p.vy * 0.3 + Math.abs(p.vx) * 0.15,
        damage: p.damage * scale,
        knockback: p.knockback,
      });
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
const segmentHitsBox = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) => {
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
  const A = arenaOf(state);
  for (const p of state.pickups) {
    if (!p.active) {
      if (p.spawn === null) continue;
      // The first-appearance timer (firstAt) runs from FIGHT, not from the countdown.
      if (state.phase === 'countdown') continue;
      p.respawn -= DT;
      if (p.respawn <= 0) placeGun(state, p);
      continue;
    }
    // Ceiling drops fall onto whatever is below them.
    if (p.spawn !== null) continue;
    const prevY = p.y;
    p.vy = Math.max(p.vy - PHYS.gravity * 0.5 * DT, -12);
    p.y += p.vy * DT;
    if (p.y <= A.floor) {
      p.y = A.floor;
      p.vy = 0;
    }
    for (const pl of A.platforms) {
      if (p.x >= pl.x0 && p.x <= pl.x1 && prevY >= pl.y && p.y <= pl.y) {
        p.y = pl.y;
        p.vy = 0;
      }
    }
  }

  if (state.phase !== 'fight') return;
  state.dropTimer -= DT;
  if (state.dropTimer > 0) return;
  state.dropTimer = A.dropEvery;
  const slot = state.pickups.find((p) => p.spawn === null && !p.active);
  if (!slot) return;
  const kind = A.dropKinds[Math.floor(nextRandom(state) * A.dropKinds.length)];
  const x = A.left + 2 + nextRandom(state) * (A.right - A.left - 4);
  Object.assign(slot, { kind, x, y: A.ceiling - 0.4, vy: 0, active: true });
  state.events.push({ type: 'drop', x });
};

/** Advances the game by one fixed tick (DT). Mutates and returns the state. */
export const step = (state: GameState, inputs: InputState[]): GameState => {
  state.events = [];
  if (state.paused) return state;
  state.tick += 1;

  // Hitstop: the world holds still for a few ticks so big hits land with weight (offline only).
  if (state.hitstop > 0 && !state.net) {
    state.hitstop -= 1;
    return state;
  }

  if (state.phase === 'countdown') {
    state.phaseTime -= DT;
    if (state.phaseTime <= 0) {
      state.phase = 'fight';
      state.phaseTime = RULES.roundSeconds;
      if (state.gunGrace && state.gunGrace.until === undefined) state.gunGrace.until = state.tick + state.gunGrace.ticks;
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
