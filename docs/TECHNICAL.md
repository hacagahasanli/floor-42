# Pewfield: technical guide

Reader: a frontend developer (Next.js, React, TypeScript) who has not built a game before.
Goal: after reading this you can find any rule in the code, change a number safely, and explain why the project is split the way it is.

Everything below was read from the source. Paths are relative to the repo root; `file:line` points at the lines as of this writing. Numbers come from `src/game/sim/constants.ts` unless stated.

Everything described here is built, including online multiplayer (section 10). Updated for commits up to `55edc4d`; section 13 covers the last three (play vs bot, sound sliders, phones).

Project tooling, one line: the game was built with agent skills from the owner's local repo `~/Desktop/projects/game-dev-skills` (not published). Three were written for this project (`web-multiplayer-netcode`, `web-game-feel`, `web-game-audio`); five third-party skills in it are Apache-2.0.

---

## 1. Overview

Pewfield (formerly Floor 42; FLOOR 42 is now the office arena's name) is a side-on, 1v1 shootout that runs in the browser.

Brand: the logo and icons are the Creative Director's concept A ("PEW! burst", `docs/collab/CREATIVE/brand/`). `tools/brand/outline.py` turns its text into paths and `tools/brand/export-pewfield.mjs` writes `public/brand`, the favicons, the manifest icons, `og.jpg` and `src/components/fieldday/wordmarkArt.ts` (the inline wordmark the Home and boot screens share). The game name lives in `src/components/fieldday/brand.ts`.

- Two fighters on a 36-unit-wide arena (the office: `ARENA.left = -18`, `right = 18`, `ceiling = 13.5`; OFFSITE has the same bounds, see Arenas in section 6). One world unit is roughly one metre.
- Every fighter has 100 hp. How many hits a KO takes depends on the gun and the range: the pistol does 50 up close, the Uzi 12, the rocket and the railgun knock you out in one (see `GUNS`).
- First to 5 KOs wins (`RULES.kosToWin`), or the higher KO count when the 150 s round ends (`RULES.roundSeconds`).
- Your gun **auto-aims** at the opponent by default; you only move, jump, dash, push and fire. Mouse aim is an option.
- Guns: pistol (infinite ammo, you spawn with it), SMG, Uzi, shotgun, and two power weapons (sniper rail, rockets). Bombs drop from the ceiling and are thrown once. Small guns lose damage with distance.
- Furniture (desks, walkways, cabinets) is cover: bullets stop on it.
- **Force Push** (Q): a short-range shove that also reflects bullets.
- Single-player against a bot (three levels). Online 1v1 at `/play` (invite link or quick match).

### Folder map

```text
src/
  app/                     Next.js App Router: pages only, no game logic
    page.tsx               title screen
    characters/page.tsx    the main menu opened on its fighter select (same screen as FIGHTER)
    play/page.tsx          online lobby (?room=<id> joins an invite)
    arena/page.tsx         reads ?p1= &p2= &demo &bot= and renders ArenaGame
    layout.tsx             fonts (Bungee, Chakra Petch), metadata
  components/
    ArenaGame.tsx          React shell: canvas + HUD overlay + hidden input
    OnlineLobby.tsx        /play: invite link, quick match, owns the room connection
  game/
    sim/                   THE RULES. Pure TypeScript, no DOM, no Three.js
      types.ts             GameState, Fighter, InputState, GameEvent ...
      constants.ts         arena layout, rules, physics, gun stats
      step.ts              step(state, inputs): advance one tick
      bot.ts               single-player opponent
      sim.test.ts          34 tests (37 with net/protocol.test.ts)
    render/                THE LOOK. Three.js scene built from primitives
      game.ts              startArena(): game loop, sim <-> scene glue
      arena.ts             office geometry, canvas textures, skyline
      characters.ts        fighter models and procedural animation (poseRig)
      guns.ts  vfx.ts  palette.ts  gallery.ts
    input.ts               keyboard and pointer -> InputState
    sfx.ts                 WebAudio sound synthesis
    roster.ts              character names and accent colours
    copy.ts                every dev-joke line with a plain twin (developer / regular), picked on first entry;
                           saved as Settings.audience; NEXT_PUBLIC_PORTAL=1 forces the plain words and never asks
    net/protocol.ts        wire format for online play
    net/client.ts          join a room, prediction and reconciliation
    net/protocol.test.ts   3 tests
server/
  index.ts  DuelRoom.ts    Colyseus game server (authoritative)
  Dockerfile               image for Fly.io
fly.toml                   Fly.io app config
```

The one rule that shapes everything: **`sim/` knows nothing about the screen, and `render/` never decides anything about the game.** Details in section 2.

---

## 2. The simulation (`src/game/sim`)

### What a "game loop" is

A game is a loop that repeatedly (1) reads input, (2) updates the world, (3) draws it. The web analogue: a reducer, `state' = f(state, action)`, called 60 times a second, followed by a render.

The reducer here is `step` (`src/game/sim/step.ts:599`):

```ts
step(state: GameState, inputs: InputState[]): GameState
```

- `state` is one plain object holding everything: both fighters, projectiles, pickups, timers, phase (`types.ts:125`).
- `inputs[i]` is what fighter `i` is pressing this tick.
- It mutates `state` in place and returns it. (Not immutable like a React reducer; that is deliberate for speed, and the tests rely on it.)

### Fixed timestep

`DT = 1 / 60` (`constants.ts:3`). Every tick advances the world by exactly 1/60 s, no matter how fast the machine is. Rendering is allowed to run at any rate; the simulation is not.

The browser side does this in `src/game/render/game.ts:466-490`:

```text
each requestAnimationFrame:
  dt = min(0.1, now - last)         // clamp so a background tab can't cause 100s of ticks
  acc += dt
  while acc >= DT:                  // run as many 1/60 s ticks as time has passed
      step(state, inputs)
      acc -= DT
  render(alpha = acc / DT)          // draw between ticks (section 6)
```

Why fixed and not "multiply by frame time": with variable steps, a 144 Hz laptop and a 30 Hz laptop produce different jump heights and different bullet paths. A fixed step makes the result depend only on the inputs. The clamp at 0.1 s means at most 6 ticks run per frame.

### Why rules and rendering are separate

`sim/` imports nothing from DOM, React or Three.js (comment at `types.ts:1`). Consequences:

1. **It runs on a server.** An authoritative server must decide who got hit. It cannot trust the browser to say so. Because `step` is plain TypeScript, the server imports the same file (`server/DuelRoom.ts:5`) instead of re-implementing the rules.
2. **It runs in tests.** `sim.test.ts` builds a state, calls `step` N times and asserts. No browser, no canvas. The tests run in about 0.3 s.
3. **It is replayable.** Same starting state plus same inputs gives the same result. That is what client-side prediction (section 10) depends on.

Anything cosmetic (particles, camera shake, sounds) lives in `render/` and `sfx.ts`, and is allowed to use `Math.random()`. A grep confirms there is no `Math.random` in `sim/` outside the tests.

### Determinism: seeded RNG in the state

Random spread and ceiling drops use `nextRandom(state)` (`step.ts:12`), a small mulberry32-style generator whose only memory is `state.seed`. Because the seed is part of the state, copying the state copies the random sequence. A replay, or a server and client starting from the same snapshot, draw identical numbers.

`createGame(characters, seed = 1)` (`step.ts:68`) takes the seed. The browser passes a random one per match (`game.ts:57`, `:74`); the test `is deterministic for the same seeds` passes fixed ones and compares results.

The bot has its own separate generator seeded the same way (`bot.ts:7`). It is not part of `GameState`, so a bot replay needs the bot recreated with the same seed.

### Edge-triggered inputs via `prev`

`InputState` (`types.ts:8`) is **held state**: `up: true` means "the key is down this tick". But jumping must happen once per press, not once per tick the key is held. So each fighter stores `prev`, the previous tick's input, and the sim derives the edge:

```ts
const pressed = (k) => input[k] && !f.prev[k];   // step.ts:304
```

Jump, dash, push, drop-through, pickup and reload use `pressed`. `fire` is not edge-triggered: it is held, and the gun's own `rate` limits shots. `f.prev` is saved at the end of each fighter update.

Consequence worth knowing: because the sim only sees one sample per tick, a key pressed and released between two ticks is invisible to it. The browser samples keys once per animation frame and reuses that sample for every tick run in that frame (`game.ts:474-475`), so a very fast tap inside a single frame can be lost. The online design deals with the equivalent problem on the server (section 10).

### Hitstop

When a big hit lands, the game freezes for a few ticks so it "feels" heavy. In `step`, if `state.hitstop > 0` it is decremented and `step` returns early (`step.ts:604-607`): no movement, no timers, no input handling. The tick counter still advances. Values:

| Cause | Ticks frozen |
|---|---|
| KO (`knockOut`) | 9 |
| Hit with knockback `k > 10` | `min(6, round(k * 0.25))` |
| Wall splat | 7 |

The renderer reads `state.hitstop` to stop pose animation and to shudder a stunned fighter (`game.ts:311-316`).

### Tick order inside `step`

1. Clear last tick's `events`, increment `tick`.
2. If in hitstop: stop here.
3. Countdown/fight timers and round end by time (`step.ts:609-624`).
4. For each fighter: `updateFighter` (movement, jump, dash, push, pickup, weapon, gravity, collision).
5. `updateProjectiles` (movement, hit tests, explosions).
6. `updatePickups` (respawns, ceiling drops, gravity for drops).

### Events

The sim does not play sounds or spawn particles. It appends `GameEvent` records to `state.events` (`types.ts:104`): `shot`, `hit`, `explosion`, `ko`, `wallSplat`, `deflect` and so on. The renderer loops over them after each `step` (`game.ts:480`) and reacts (`handleEvent`, `game.ts:182`). This is the only channel from rules to effects. Events are cleared at the start of every `step`, so they describe exactly one tick.

---

## 3. Physics

There is no physics library. `updateFighter` (`step.ts:301-460`) is about 160 lines, and the world is simple enough that a library would add more problems than it solves.

### Bodies

Every fighter is an axis-aligned box (AABB: a rectangle that never rotates) defined by `x` (centre), `y` (feet), `width`, `height` from `CHARACTERS` (`constants.ts:98`). The model's limbs and animation have no effect on collision.

### Movement model

Velocity-based, integrated with Euler steps each tick:

```text
vx moves toward target by accel * DT         // run: groundAccel 90, airAccel 50
vx moves toward 0 by friction * DT           // groundFriction 60, airFriction 8
vy -= gravity * DT                           // gravity 42; fastFall 70 when holding Down
vy clamped to >= -maxFall (24)
x += vx * DT;  y += vy * DT
```

`approach(v, target, delta)` (`step.ts:6`) moves a value toward a target without overshooting. Max run speed is `character.speed * gun.carry`, so heavier guns slow you down (`carry` 0.88 to 1).

All `PHYS` values are in `constants.ts:71`.

### Platforms: one-way, drop-through and solid furniture

Every platform is a horizontal segment `{x0, x1, y}` (`ARENA.platforms`, `constants.ts`). Walkways, the cable tray, shelves, cabinets and the fridge have no solid sides or undersides: you jump up through them and land on top.

Desks, the meeting table and the kitchen counter (`SOLID_STYLES`, `isSolid`) are too low for anyone to stand under, so they are solid from the floor to their top: a fighter whose feet were and still are below the top is pushed back out to the side they came from (or the nearest side), and a bot hops onto them instead of running into them. Before this, fighters walked through the desk tops and table legs on screen.

Landing rule (`step.ts:437-457`): only when moving down or still (`vy <= 0`), and the fighter's feet crossed the platform's height this tick (`prevY >= p.y && f.y <= p.y`), and the middle half of the body overlaps the platform horizontally. The floor (`y = 0`) is the same check against `ARENA.floor`.

Drop-through: pressing Down while standing on a one-way platform (not on solid furniture) sets `dropTime = 0.25 s` (`PHYS.dropTime`). While it is above zero, platform landing is skipped. The floor itself cannot be dropped through (`step.ts:363`).

### Crouch

Holding crouch on the ground eases `f.crouch` from 0 to 1 in 0.1 s (`CROUCH.time`, 6 ticks) and back up as fast. The hitbox height is `bodyHeight(f)` (`step.ts`): the character's height, down to 52 % (`CROUCH.height`) when fully crouched. Bullets, pellets, rails, explosions and Force Push all test against it, and the muzzle and the aim origin sit at 62 % of it. Walking is 70 % of the run speed (`CROUCH.speed`). Collision with furniture keeps the full standing height, so crouching opens no new spaces.

- Keys: Down crouches where it cannot drop you (the floor, desks, the table, the counter, boxes); on a one-way platform Down still drops you through. The separate Crouch action (C by default, input bit 9) crouches anywhere on the ground, walkways included, and never drops you. Phones: the stick pushed down acts as Down, and a Crouch toggle sits beside Swap.
- In the air crouch does nothing: Down stays the fast fall. A jump, a dash (while it lasts), a stun or walking off an edge stands you up; Force Push works crouched.
- Why 52 %: shots leave a standing chest at 62 % and auto-aim and the bot aim at 55 %, so a shot fired at a standing chest or head flies over a crouched body. Auto-aim and the bot aim at the crouched chest, so crouching dodges shots already in the air, not the next ones (balance: docs/BALANCE.md).
- The bot ducks a bullet or pellet that would pass over its whole crouched body, with a chance per level (easy 0.15, normal 0.3, hard 0.45), for 0.3 s.

### Glass walls and wall-kick

Left and right walls clamp `x` (`step.ts:409-430`). If you are airborne and touching a wall, `f.wall` is set to -1 or 1 (`step.ts:458`). Pressing Up in that state kicks you away from the wall: `vx = -wall * 12.5`, `vy = jump * 0.95`, and your air jumps and air dash refill (`step.ts:350-355`). Holding toward the wall slows the fall to `wallSlide = 4`.

### Dash and invincibility frames

Dash (Shift) sets `vx = ±19` for `dashTime = 0.16 s`, with a 0.7 s cooldown, and one air dash until you land or wall-kick. In the air it also zeroes `vy`, so it is a flat horizontal burst (`step.ts:368-379`, `:396`).

While `dashTime > 0` the fighter is skipped by the projectile hit test (`step.ts:511`: `if (o.dashTime > 0) continue; // dodged`). That is the "i-frame": invulnerable to bullets. Note it only covers projectiles; a Force Push or explosion calls `applyHit` directly and is not blocked by a dash.

### Why no library

- The game is one flat plane with boxes and horizontal segments. The collision rules a library solves (arbitrary shapes, rotation, stacking) do not occur.
- Game feel needs exact control: variable gravity (fast fall), wall-slide, dash freezing `vy`, platforms you can pass through from below. In a general engine each of these is an override fighting the defaults.
- Determinism. The server and the client must produce the same numbers from the same inputs. A small hand-written integrator is easy to reason about; a library adds a version and a behaviour surface that has to match on both sides.
- Bundle and server weight: none added.

---

## 4. Combat

### Guns

Source: `GUNS` in `constants.ts:126`. `rate` is seconds between shots while fire is held. `mag` is the magazine; `reserve` is spare ammo (the pistol's is `Infinity`). Speed is world units per second.

| Gun | rate (s) | mag | reserve | reload (s) | damage | pellets | spread (rad) | speed | life (s) | knockback | recoil | carry | kind | falloff (near / far / min) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pistol | 0.38 | 8 | inf | 1.0 | 50 | 1 | 0.02 | 30 | 1.3 | 4 | 0 | 1.00 | bullet | 2.5 / 20 / 0.45 |
| SMG | 0.14 | 20 | 40 | 1.4 | 30 | 1 | 0.08 | 32 | 1.0 | 2.5 | 0.4 | 0.97 | bullet | 6 / 18 / 0.5 |
| Uzi | 0.05 | 32 | 32 | 1.2 | 14 | 1 | 0.15 | 30 | 0.8 | 1.2 | 0.2 | 1.00 | bullet | 3 / 10 / 0.4 |
| Shotgun | 0.8 | 4 | 8 | 1.5 | 18 | 6 | 0.20 | 28 | 0.32 | 4 | 7 | 0.93 | pellet | 2 / 8 / 0.35 |
| Sniper rail (`railgun`) | 1.4 | 3 | 3 | 1.8 | 100 | 1 | 0 | 160 | 0.35 | 14 | 9 | 0.88 | rail | none |
| Rockets (`launcher`) | 1.1 | 2 | 4 | 1.1 | 110 | 1 | 0.01 | 14 | 3.0 | 22 | 4 | 0.88 | grenade | none |
| Bomb | 0.5 | 1 | 0 | 1.0 | 110 | 1 | 0 | 16 | 1.8 | 20 | 0 | 1.00 | bomb | none (see Bombs) |

**Falloff.** Small guns lose damage with the distance the shot has travelled. `GunStats.falloff = {near, far, min}`: full damage up to `near`, then a straight line down to `min` x damage at `far` and beyond. Each projectile records where it was fired (`Projectile.ox`, `oy`), and `updateProjectiles` scales the damage at the moment of the hit from the distance to the target's centre (`step.ts`, "Damage falls off with the distance the shot travelled"). A pistol hit from 20 or more units away does 22.5, so it takes five. The sniper rail and rockets have no falloff: they always kill in one.

Hits to KO from 100 hp, point blank: pistol 2, SMG 4, Uzi 8, shotgun all 6 pellets (one blast, only within about 2.5 m), sniper rail 1, rocket 1 on a direct hit (110 damage at the blast centre). Each gun's role and its time-to-kill at 3, 10 and 20 m are in `docs/BALANCE.md`; `sim/balance.ts` computes them from these constants and `sim/balance.test.ts` fails if a change breaks a role.

Notes:
- Spread is a random cone, drawn from the seeded RNG (`step.ts:193`). Shotgun pellet speed also varies by 0.85 to 1.15.
- Recoil pushes the shooter backwards; in the air it also pushes vertically. This is what makes rocket-jumping possible.
- `life` caps range: shotgun pellets vanish after 0.32 s, about 9 units.
- Running dry on a special gun drops you back to a fresh pistol (`step.ts:255-259`). A magazine that empties with reserve left reloads automatically.
- Pickups: with only the pistol in hand, walking over a gun takes it. Otherwise press **F** (Pick up) to swap for the gun you stand on; a small keycap shows beside it. R only reloads. Bombs are always picked up on contact.
- **One gun per floor** (three floors). `ARENA.gunSpawns` (`constants.ts`) has three entries, each with `spots` on that floor and a `kinds` list that is a weighted table (a kind listed twice has two tickets). `placeGun` picks a random spot and a random kind with the seeded RNG, at match start and again after someone takes it. Pickups remember their entry in `Pickup.spawn` (`null` for a ceiling drop).
  - Ground and middle floors use `GUN_TABLE`: SMG 3 tickets, shotgun 3, Uzi 2. Respawn `RULES.gunRespawn = 15` s.
  - The top floor (mezzanine) uses `POWER_TABLE`: sniper rail 2 tickets, rockets 3. These are the only one-shot guns, so every match offers one, but only on the top floor. Respawn is per spawn (`respawn: 30` on that entry), 30 s. Each carries six shots in total (rail 3 + 3, rockets 2 + 4), then you fall back to the pistol.
  - Ceiling drops (`dropKinds`) are bombs only: `dropSlots = 2`, one every `dropEvery = 18` s, gone once taken.

### Projectiles

`Projectile.kind` (`types.ts:88`) selects behaviour:

| Kind | Behaviour |
|---|---|
| `bullet` | Pistol and SMG. Removed on first hit or when blocked. |
| `pellet` | Shotgun. Same as bullet, shorter life, drawn shorter. |
| `rail` | Pierces fighters (remembers who it hit in `hit[]`) and **ignores furniture**. Stopped only by the room walls. |
| `grenade` | The rocket. Explodes on a fighter, on a wall/floor/ceiling, on furniture, or when `life` runs out. |
| `bomb` | The thrown bomb. Same explosion triggers as a rocket, but it arcs under gravity (see Bombs). |

### Why a segment test, not a point test

At 60 Hz, a pistol bullet moves 30/60 = 0.5 units per tick; the SMG about 0.53; the railgun 160/60 = 2.67 units per tick. A fighter is 0.7 to 1.0 wide. If you only check "is the bullet's current position inside the box?" a railgun round can jump from one side of a fighter to the other between two ticks and never be inside. This is called **tunnelling**.

So each tick the bullet is treated as the line segment from its previous position to its new one, and the code asks whether that segment touches the fighter's box. `segmentHitsBox` (`step.ts:541`) is a Liang-Barsky style clip: it intersects the segment's parametric range `t in [0, 1]` with the box's four edges, and reports a hit if any range remains. The box is widened by 0.08 on each side as a small tolerance (`step.ts:513`).

### Furniture cover

`updateProjectiles` (`step.ts:462-538`) first finds where the bullet's path is cut short this tick (`tEnd`): by the room walls, floor, ceiling, or a platform. Only fighters hit before that point count, which stops a bullet hitting someone standing behind a desk it just struck.

A platform cuts the path when the segment crosses its height `y` while its x at that moment is within `[x0, x1]`. The grazing rule, `step.ts:495-504`:

```ts
if (p.kind !== 'rail' && Math.abs(ddy) > Math.abs(ddx) * 0.15) { ...check platforms }
```

A shot is only blocked by furniture if it is angled more than about 8.5 degrees (slope above 0.15) off horizontal. A shot skimming across a desk top at chest height therefore passes; a shot coming down onto or up into it is stopped. Without this rule, two fighters on the same walkway could not shoot each other.

### Rockets

- `GRENADE.gravity = 0` (`constants.ts:135`): rockets fly straight, because auto-aim already points at the target. The code that applies gravity is still there (`step.ts:467`) and simply multiplies by zero.
- Blast radius 2.8. Damage on each fighter within it (`explode`, `step.ts:165-187`):

```text
d        = distance from blast centre to the NEAREST POINT of the fighter's box
falloff  = 0.5 + 0.5 * (1 - d / radius)          // 1.0 at the centre, 0.5 at the edge
damage   = rocket.damage * falloff * (0.45 if you shot it yourself)
knockback scales with 0.4 + 0.6 * falloff
```

Measuring to the nearest body point rather than the centre means a rocket that hits someone's shoulder counts as a direct hit (d = 0, full damage), instead of being treated as 0.5 units away from their middle. Self-damage is 45% (`GRENADE.selfDamage`), so you can survive your own rocket jump.

### Bombs

A bomb is picked up automatically when you walk over it (`takePickup`, `step.ts`). Instead of replacing your gun it is put in `Fighter.stash`; the bomb becomes your weapon with one round. When it is thrown, `updateWeapon` restores the stashed gun (or a pistol if there was none). Picking one up while already holding a bomb keeps the original stash. Dying clears the stash.

- **Aim is a lob, not a line.** `lobAngle(x, y, tx, ty, v, g)` (`step.ts`) solves the projectile equation for the low-arc launch angle that lands on the target point at speed `v` under gravity `g`, and falls back to 45 degrees if the target is out of reach. The target point is `Fighter.aimTx, aimTy`, which `updateFighter` copies from the input every tick: with auto-aim that is the rival's chest, in mouse mode it is the pointer. Bomb physics: `BOMB = {gravity: 26, radius: 3.2, selfDamage: 0.45}`, launch speed 16, fuse `life` 1.8 s.
- **Explosion falloff is linear and steeper than a rocket's.** Rockets deal `0.5 + 0.5 * (1 - d / radius)` of their damage; a bomb deals `max(0.15, 1 - d / radius)` (`explode`). With 110 base damage, standing right next to it kills; at the edge it does about 17.

### Railgun

`rail` projectiles are not removed on hitting a fighter; they record the fighter in `hit[]` and continue (`step.ts:525-528`), so one shot can hit both players. They also skip the furniture check. The beam you see is drawn by the renderer from the `shot` event out to the room edge (`game.ts:166`); the sim does not use the `rail` GameEvent type (it is declared in `types.ts:109` but never emitted).

### Force Push

Q. 2.5 s cooldown, 0.3 s duration, active between 0.06 s and 0.2 s (`PUSH`, `constants.ts:137`). During the active window `updatePush` (`step.ts:269-299`) does two things in a box in front of the fighter (reach 2.4, height 2.4):

1. Any enemy fighter inside is hit once (4 damage, knockback 24) and flagged `pushed = 0.6 s`.
2. Any enemy projectile inside, except rails, is **reflected**: velocity reversed and multiplied by 1.2, owner switched to the pusher, `hit[]` cleared, life extended to at least 0.6 s. The shooter can now be hit by their own bullet.

You cannot fire while a push is out (`step.ts:262`).

### Wall splat

If a fighter flagged `pushed` hits a side wall moving faster than `WALL_SPLAT_SPEED = 11`, they take 30 extra damage, are stunned 0.5 s, and the glass cracks (`step.ts:418-426`). Only a push sets `pushed`, not bullets or rockets.

### Knockback and stun

`applyHit` (`step.ts:147`) divides knockback by the target's `weight` (Legacy 1.38 is hard to move, Standup 0.8 is easy). Above a threshold (k > 6) the target is lifted off the ground and stunned briefly; a stunned fighter cannot act (`canAct`, `step.ts:321`).

### KO and respawn

`knockOut` (`step.ts:119`): sets `respawn = RULES.respawnSeconds` (3 s), emits `ko`, 9 ticks of hitstop. The scorer is whoever last hit the victim (`lastHitBy`); if there is none or it was self-inflicted, the other fighter scores. After `respawn`, `respawnFighter` puts them on a spawn point chosen by `placeAtSpawn`: `ARENA.spawns` has seven points across all levels, and the pick is random (seeded RNG) among points more than 12 units from the rival, or the two farthest if none qualify. They come back 1.5 units above the point with full hp, a fresh pistol and 1.4 s of invulnerability (rendered as flicker, `game.ts:315`). `applyHit` refuses to hit anyone who is respawning or invulnerable. The same rule places both fighters at the start of a match.

**Choosing a character while dead.** `chooseCharacter(state, id, character)` stores `Fighter.nextCharacter`; `respawnFighter` swaps `character` to it. In the browser, keys 1 to 4 do this while `respawnIn` is not null (`ArenaGame.tsx`), and `game.ts` rebuilds the model when a fighter's character changes (`syncRig`).

---

## 5. The bot (`src/game/sim/bot.ts`)

`createBot(myId, seed, level)` returns a function `(state) => InputState`. It is called every tick exactly like a human's input source, so the sim cannot tell the difference.

How it behaves like a person instead of a perfect machine:

- **Reaction delay.** It only re-plans when `state.tick % reaction === 0` (`bot.ts:99`). Between plans it keeps its last decision (move direction, whether to fire) and only keeps tracking the target's position.
- **Aim error.** On each plan it draws one error, and aims at the target's chest offset by `error * distance`. The error stays fixed until the next plan, like a shaky hand.
- **Preferred range per gun** (`RANGE`): pistol 8 to 15, SMG 6 to 11, shotgun 2.5 to 5, railgun 12 to 24, rockets 9 to 16, Uzi 3 to 8, bomb 5 to 11 (`bot.ts:24`). Too close, it backs off (and jumps if cornered against a wall); too far, it approaches 70% of the time; in range, it strafes or holds. At 50 hp or less it adds 3 units to both limits and plays further back.
- **Decision rules**: with only the pistol it walks to a nearby gun; it Force Pushes when within 2.4 and level; dashes sometimes when the foe has just fired; jumps or drops toward the foe's height; wall-kicks when on a wall.
- **Presses are edges.** One-shot actions alternate (`out[p] = !last[p]`) so the sim's `pressed()` sees a fresh press.

| Level | reaction (ticks) | aim error (rad) | fire chance per plan | dodge chance per plan |
|---|---|---|---|---|
| easy | 16 (0.27 s) | 0.22 | 0.45 | 0.05 |
| normal | 10 (0.17 s) | 0.12 | 0.70 | 0.15 |
| hard | 6 (0.10 s) | 0.05 | 0.90 | 0.30 |

Selected with `?bot=easy|hard` on `/arena` (anything else is `normal`, `arena/page.tsx:18`).

Determinism: the bot's random numbers come from `mulberry32(seed)`. The test `is deterministic for the same seeds` runs two bots for 900 ticks twice and compares positions and hp.

Limits: the bot does not path-find. It reads the fighters' relative positions and jumps or drops when the opponent is above or below; it can get stuck against geometry.

The `?demo` flag makes both sides bots (attract mode and GIF recording, `game.ts:475`).

---

## 6. Rendering (`src/game/render`)

### The scene

Three.js is a 3D library: you build a **scene** (objects), a **camera**, and call `renderer.render(scene, camera)` each frame. The game is 2D in rules (everything at `z = 0`) but drawn in 3D, which gives depth, lighting and shadows for free.

- Every model is assembled from primitives (boxes, cylinders, icospheres) in code; there are no model files and no image assets. Fighters: `buildRig` (`characters.ts:237`). Guns: `guns.ts`. Office: `buildArena` (`arena.ts:276`).
- **Flat-shaded low-poly.** Materials come from one cached factory, `mat()` (`palette.ts:25`), which sets `flatShading: true` so each face has one colour. Colours are in `PALETTE` (`palette.ts:4`), a night office with git-diff accents.
- **Canvas textures.** Surfaces that need a pattern (sky gradient, skyline facade, floor tiles, the whiteboard with merge-conflict markers, the glass-crack decal) are drawn with the 2D canvas API at startup and wrapped in `THREE.CanvasTexture` (`arena.ts:9-18`). Decor uses a small seeded RNG so it is identical on every load (`arena.ts:21`).
- Renderer: antialiasing, PCF soft shadows, ACES filmic tone mapping (`game.ts:61-67`). Pixel ratio capped at 2.

### Arenas (R-016, OFFSITE)

- **Arena = data in the state.** `ArenaData` (`constants.ts`) holds bounds, platforms, spawns, gun spawns, drop settings and `menuSpotX`. `ARENAS = { office: ARENA, offsite: OFFSITE }`; `GameState.arena?: ArenaId` is set by `createGame`'s `extra.arena` and **omitted for the office**, so online states, snapshots and every older state keep their shape (no protocol change; `server/` and `net/` pass nothing and get the office). Everything that used the old global reads `arenaOf(state)`: `step.ts`, `bot.ts`, `game.ts`; the menu showcase reads `arenaOf({ arena })` and `menuSpotX(arena)`. `ARENA` stays exported and is the office object (the office tests mutate it).
- **Which arena.** `arenaChoice.ts`: online = office; else a known `arena=` in the URL (`/arena?...&arena=office|offsite`, portal `#/arena?...`); else `Settings.arena` (the menu's Arena row, remembered); else `DEFAULT_ARENA` (`constants.ts`, one constant, currently `'offsite'`). The menu backdrop is always the office.
- **OFFSITE** (`docs/collab/CREATIVE/levels/arena-2.md`): collision uses the office's rule styles (`desk` = boulder, `walkway` = plank, `crate`). Render: `render/arenaOffsite.ts` (built from the same platform data; backdrop is one merged vertex-coloured mesh with the cloud-shadow and shimmer terms in its material) and `render/offsiteWind.ts` (the one render-only wind: own seeded RNG, never the sim's). `buildArenaFor` (`arenaView.ts`) maps an id to its builder; `ArenaView` exposes `exposure`, `wall` (`glass`/`rock`), `vfxColors`, `react(event)`, `syncPickups`, `finale`, `lighten`, `setReducedMotion`.
- **Tests:** `arenas.test.ts` (office golden hashes recorded at a9d0683, data fingerprint, no `arena` field on default/online states), `offsite.test.ts` (A1 data, A6 reachability with the real physics via `sim/reach.ts`), `botOffsite.test.ts` (A7), `offsiteWind.test.ts`, `arenaChoice.test.ts`.

### Procedural animation

There are no animation clips. `poseRig(rig, input)` (`characters.ts:321`) computes joint angles every frame from the sim's state: leg swing from `sin(phase)` where phase advances with run speed, arm aimed along `f.aim`, lean while dashing, shake while stunned, push swing, reload wobble. Angles are smoothed with `damp` (exponential smoothing, `characters.ts:318`) so they do not snap. The held gun is parented to the rig's hand each frame (`game.ts:339-344`).

### Render interpolation between ticks

The sim ticks at 60 Hz but the monitor may refresh at 144 Hz. Drawing the latest tick's position each frame makes motion stutter at mismatched rates. Instead:

1. Before each `step`, `savePrev()` records every fighter's position (`game.ts:473`).
2. After the tick loop, `acc / DT` is `alpha`, the fraction of the next tick that has elapsed (0 to 1).
3. Fighters are drawn at `prev + (current - prev) * alpha` (`game.ts:317`). Projectiles are drawn at `position - velocity * DT * (1 - alpha)` (`game.ts:377-379`).

Visually this is always about one tick behind the sim, which is unnoticeable; the sim never sees `alpha`.

### Pooled effects

Creating and destroying meshes during play causes garbage collection pauses. So effects are preallocated and reused:

- 360 particles and 6 shockwave rings (`vfx.ts:46`, `:55`), one shared tetrahedron geometry.
- 80 bullet tracers, 6 rocket meshes, 4 railgun beams, one muzzle flash per fighter (`game.ts:120-149`). Unused ones are hidden each frame.

### Camera

Fixed and far back: a perspective camera (fov 36) placed so the whole office width and height always fit, whatever the window aspect (`updateCamera`, `game.ts:264-274`; distance formula at `:266`). Position eases toward the target with exponential smoothing. Shake is described in the next section.

### Game feel (`game.ts`)

Added in `3da54fc`, following the owner's `web-game-feel` skill. The principle: the sim reports what happened as events; the renderer turns each event into one call, `feedback(tier, target?)` (`game.ts`, `TIERS`), and that call scales every effect together.

| Tier | Camera trauma | Screen flash | Zoom punch (fov degrees) | Used for |
|---|---|---|---|---|
| tiny | 0 | 0 | 0 | other player's railgun shot |
| light | 0.15 | 0.06 | 0 | your own shotgun/rail shot, push, small hits |
| heavy | 0.45 | 0.09 | 0.6 | hits with 50+ damage or `power > 12`, glass splat |
| huge | 0.8 | 0.12 | 2.2 | explosions, KOs |

- **Trauma shake.** `trauma` (0 to 1) accumulates per feedback and decays at 1.5 per second. The shake amount is `trauma squared`, and offsets come from smooth noise (a sum of two sines per axis), not `Math.random()`, so it moves smoothly instead of jittering. It offsets camera position, look-at and a small roll (`updateCamera`). The fov zoom punch decays at 6 degrees per second.
- **Hit flash.** `hit` events now carry `fighter` (the one hit). Character models share cached materials, so flashing cannot change a material colour; `setFlash` swaps every mesh of that rig to one white `MeshBasicMaterial` for the flash time and restores the originals.
- **Squash and stretch.** A spring on each rig's vertical scale (`K = 320`, critically damped), kicked on take-off (stretch) and on hard landings (`vy < -10`, squash). The hard landing also plays `sfx.land` and a dust burst. Volume is conserved by scaling x and z by `1 / sqrt(y)`.
- **Damage numbers.** A pool of 10 sprites; one cached canvas texture per distinct text and colour. Gold normally, red for hits of 50 or more; they rise and fade over 0.7 s.
- **Shake toggle.** A "Shake: on/off" button in the HUD calls `toggleMotion` and stores `0` or `1` under `merge-conflict:motion` in `localStorage`. Off sets the multiplier to 0 for trauma, zoom, squash and screen flash, and halves the hit flash.
- **Online.** Effects fire from the events of the locally predicted step only (section 10), so they play once. Another player's shots use the `tiny` tier so the screen does not shake for events you did not cause.

### HUD throttled to 10 Hz

The canvas runs outside React's render loop; React only draws the overlay (health bars, timer, KO text, end screen) in `src/components/ArenaGame.tsx`. Pushing state into React 60 times a second would re-render the whole overlay needlessly, so `emitHud` is called every 0.1 s (`game.ts:484-488`) and `onHud` is `setHud`. HP bars use a 150 ms CSS transition to look smooth between updates. The data crossing the boundary is a small `HudState` object (`game.ts:34`), not the sim state.

`startArena` returns `{ restart, setAimMode, dispose }`. `ArenaGame` calls it in a `useEffect` and calls `dispose()` on cleanup, which cancels the animation frame, removes listeners, and disposes every geometry, material and texture (`game.ts:512-525`).

A development-only handle `window.__mc` exposes the state for automated checks (`game.ts:493`). It is absent in production builds.

---

## 7. Input (`src/game/input.ts`)

### Keyboard map

| Action | Keys |
|---|---|
| Move | A / D or Left / Right |
| Jump, double jump, wall-kick | W or Up |
| Crouch (floor, desks, boxes); drop through a walkway; fast fall | S or Down |
| Crouch anywhere on the ground, walkways too | C |
| Dash | Shift |
| Fire (hold) | Space (also left click in mouse mode) |
| Force Push | Q |
| Swap for the gun you stand on (a small keycap shows beside it) | F |
| Reload | R |
| Toggle aim mode | T |
| Mute | M |
| Rematch after a match | Enter |
| Pause menu (online: ask to pause) | Esc |
| Pick who you respawn as (while dead) | 1 to 4 |

Source: `KEYMAP` (`input.ts:13`); T and M are handled in `game.ts:456-460`; Enter in `ArenaGame.tsx`. Keys use `event.code` (physical key position), so the layout works on non-QWERTY keyboards.

`createControls(canvas)` keeps a `Set` of codes currently down. `read(aimX, aimY, mode)` converts it into an `InputState` snapshot for one tick. Keys are cleared when the window loses focus (`onBlur`) so nothing gets stuck.

### Aim

- **Auto (default):** `autoAim` (`game.ts:299`) points at the opponent's chest (`foe.y + height * 0.55`). While the opponent is respawning it aims 5 units ahead.
- **Mouse (T):** the pointer's normalised coordinates are turned into a ray from the camera and intersected with the plane `z = 0` (`mouseAim`, `game.ts:291`), giving a world-space aim point. Left click fires.

Either way the sim receives only `aimX, aimY` and derives the angle itself (`step.ts:323-330`); it also sets `facing` from the aim, so you face where you shoot. The choice is stored in `localStorage` under `merge-conflict:aim` (`ArenaGame.tsx:16`, wrapped in try/catch).

### The hidden focused input

Browser extensions with keyboard navigation (Vimium and similar) intercept letters such as D, J, K, L on a normal page, which breaks movement. They stay out of the way when a text field has focus. `ArenaGame` renders an invisible 1x1 `<input>` (`aria-label="Game keyboard input"`, `opacity-0`, `pointer-events-none`) and keeps it focused: on mount, on its `blur`, and on any `pointerdown` (`ArenaGame.tsx`, effect under the "Keyboard-navigation extensions" comment). The game's own listeners are on `window`, so they still receive the keys.

Side effect: because a text input has focus, a screen reader announces an edit field with that label. That is a known cost of the trick.

---

## 8. Audio (`src/game/sfx.ts`)

No audio files. Every sound is made with the Web Audio API at the time it plays: oscillators with a pitch sweep (`tone`, `sfx.ts:37`) and filtered noise from one second of random samples generated at startup (`noise`, `sfx.ts:52`), each shaped with an exponential attack/decay envelope (`env`, `sfx.ts:31`). The `shot`, `hit`, `explosion`, `glass`, `ko`, etc. functions combine these.

Browsers refuse to start audio until the user interacts with the page. `createSfx` therefore creates the `AudioContext` lazily: `sfx.unlock()` is called on every keydown (`game.ts:456-457`) and `ensure()` creates or resumes it (`sfx.ts:14`). Sounds requested before the first key press are silently skipped. M mutes by setting master gain to 0; master gain is otherwise `MASTER` 0.75 times the "All sound" slider (default 0.8, section 13.2). The mute choice is remembered in `localStorage` under `merge-conflict:muted`.

Since `3da54fc` the audio follows the owner's `web-game-audio` skill (`sfx.ts`, header comment):

- **Buses.** Every voice goes through a stereo panner to a category bus (`sfx` 1.0, `ui` 0.7, `amb` 0.5, and since `bfed1d6` `guns` 0.45, section 13.2), then a `DynamicsCompressor`, then the master gain. A scaled copy of each voice also goes to a generated room reverb (a `ConvolverNode` whose 0.9 s impulse response is decaying noise built in code, `makeRoom`).
- **Layered gunshots.** A shot is a crack (high-passed noise), a body (band-passed noise) and a thump (a falling sine), with extras per gun: shotgun pump clicks, rocket hiss, slide click.
- **Pan from world x.** `panOf(x) = x / 19.5`, clamped to about plus or minus 0.8, so sounds come from where they happen. Events now pass `e.x` to the sfx calls.
- **Variation.** Every voice gets a random detune (about plus or minus 70 cents) and a gain between 0.9 and 1.1, so repeated shots do not sound identical.
- **Voice budget.** At most 6 gunshot voices at once (`SHOT_BUDGET`); extras are skipped. Each slot frees after 120 ms.
- **Ducking.** `duck()` briefly lowers the `amb` bus on big moments. Today that bus has no source (see below), so the ducking has no audible effect.
- **No ambience.** An ambient noise loop was added and then removed in `c550396`: it sounded like old-TV static. The room is silent between fights. The `amb` bus and `duck` remain in the code.

Still no audio files.

Sounds are triggered from sim events in `handleEvent`, so audio and visuals stay in step with the rules without the sim knowing about either.

---

## 9. Testing

Files: `src/game/sim/sim.test.ts` (vitest, Node environment, no DOM). Helpers build a fighting state with pickups and drops disabled (`fighting()`), place fighters, arm them, and run N ticks with scripted input.

What the 37 tests cover (34 in `sim.test.ts`, 3 in `net/protocol.test.ts`):

| Group | Tests |
|---|---|
| Round flow | input is ignored during the countdown, then the fight starts; round ends on time with the KO leader as winner |
| Movement | land on a desk (Down does not drop into it), drop through a walkway with Down; desks, the table and the counter are solid from the side; wall-kick off the glass; facing follows aim |
| Guns | pistol hits where aimed and misses when aimed away; furniture blocks bullets; auto-reload; spent special gun falls back to pistol; two pistol hits KO point blank, three a few steps back; point-blank shotgun is a one-shot KO; railgun goes through furniture; grenade throws everyone including the shooter; rockets fly straight across the office; walking over a gun with a pistol picks it up; dash dodges bullets |
| Force Push | splats into the glass (checks `WALL_SPLAT_DAMAGE`); reflects bullets at the shooter |
| KOs | KO scores for the shooter and the fighter respawns with a pistol; 3 s wait after a KO and coming back as someone else |
| Falloff, Uzi, power weapons, bombs, swap | small guns hurt less from across the office; the sniper rail still kills in one at range; the top floor always offers a power weapon with six shots and lower floors never do; the Uzi fires fast but weakly; a bomb is picked up over your gun and the gun returns after the throw; a lobbed bomb lands near the target and is lethal next to it; F swaps for the gun you stand on and R does not |
| Level and pause | fighters start far apart; exactly one gun per floor at the start; a taken gun returns on the same floor; nothing moves while `paused` |
| Bot | two bots score within a round; same seeds give the same result |
| Wire protocol (`protocol.test.ts`) | input encode/decode round trip; a press in a skipped input survives a merge; a full game state round-trips including `Infinity` |

Not covered: the grazing-shot rule at exact slope boundaries, ceiling-drop spawning, the spawn-distance rule beyond the start-of-match test, kill-credit edge cases (last hit by a rocket you fired yourself), draws, and everything in `render/`, `input.ts`, `sfx.ts`, `ArenaGame.tsx`, `net/client.ts` and `server/DuelRoom.ts`.

Run:

```bash
npm run test:run     # one-off run; expected: 37 passed
npm test             # watch mode
npm run type-check   # tsc --noEmit
```

`npm run test:run` was executed while updating this guide: `37 passed` (2 files), about 0.3 s. `npm run type-check` was not run for this document.

---

## 10. Online multiplayer (built and deployed; updated through `1b03043`)

> **Superseded in parts by section 14 (2026-11-19).** The snapshot and input handling below is the first version. Since then the authority (server or host browser) compensates lag with a capped rewind, snapshots are numbered and carry events, the client draws the rival from a buffered timeline, there is no hitstop online, and the HUD names the connection. Where this section and section 14 disagree, section 14 is current.

Play it at `/play`. Server: `floor42-game` on Fly.io. This section was rewritten from the code after the feature landed. The server and client files were read; I did not run the server or the two-browser test myself. The three measured numbers below are the owner's, taken on 2026-11-17 from the owner's Mac.

### Pieces

| Piece | File | Job |
|---|---|---|
| Wire format | `src/game/net/protocol.ts` | input encoding, snapshot encoding, message types |
| Browser client | `src/game/net/client.ts` | `joinRoom`, `createOnlineSession` (prediction, reconciliation, ping) |
| Lobby | `src/components/OnlineLobby.tsx`, `src/app/play/page.tsx` | character choice, invite link, quick match, owns the room connection |
| Arena glue | `src/components/ArenaGame.tsx`, `src/game/render/game.ts` | runs the session inside the normal game loop |
| Game server | `server/index.ts`, `server/DuelRoom.ts` | one `DuelRoom` per match, authoritative |
| Deployment | `server/Dockerfile`, `fly.toml` | container and Fly.io app |
| Tests | `src/game/net/protocol.test.ts` | 3 tests on the wire format |

### Data flow

```text
  Browser A                        Server (one DuelRoom)                    Browser B
  ---------                        ---------------------                    ---------
  every tick (60/s):
    read keys
    send 'input' [tick,bits,ax,ay] -> queue per seat
    step() locally (prediction)       every 1/60 s:
                                        take next queued input per seat
                                        step(game, [inA, inB])   <- same sim/step.ts
                                      every 2nd tick (30/s):
  <------ 'snap' {ack, inputs, state} broadcast full GameState -------->  'snap'
  next tick: reconcile
```

The server runs the same `step` as the browser (`DuelRoom.ts:5`, `:125`) at 60 Hz (`setSimulationInterval`, `DuelRoom.ts:54`). It decides every hit, KO and score. Clients send only inputs.

### Wire format (`protocol.ts`)

> Superseded in part by section 15 (2026-11-27): snapshots are protocol 3, compact rows sent every tick, not the full-state JSON every second tick described in the next bullets.

- `WireInput = [clientTick, buttonBitmask, aimX, aimY]` (`protocol.ts:13`). Buttons map to bits in this order: left 0, right 1, up 2, down 3, dash 4, fire 5, pickup 6, reload 7, push 8, crouch 9 (`protocol.ts:10`). New buttons go on the end, so an older peer reads the bits it knows. Aim is rounded to 2 decimals.
- `Snapshot = { ack: [number, number], inputs: [WireInput, WireInput], state }`. `ack[slot]` is the last client tick the server applied for that player. `inputs[slot]` is the input the server is currently using for that player.
- `SNAPSHOT_EVERY_TICKS = 2` (`protocol.ts:8`): a snapshot every second tick, 30 per second. Measured: about 139 snapshots in 4.5 s, consistent with that.
- Snapshots travel as a JSON string. JSON cannot hold `Infinity`, which appears in the state (the pistol's `reserve`, empty drop slots' `respawn`), so `encodeSnapshot` swaps it for the marker string `"__inf"` (and `-Infinity` for `"-__inf"`) and `decodeSnapshot` swaps it back (`protocol.ts:56-61`). A test round-trips a full state including `Infinity`.
- Size: an idle snapshot (tick 400, no projectiles) is 2,643 bytes. I measured this with a one-off script against the earlier server file; at 30 per second that is about 80 KB/s per client.
- The server sends snapshots with `events: []` (`DuelRoom.ts:131`).

### Server (`server/DuelRoom.ts`)

- **Seats.** `maxClients = 2`; `seats` has two slots. A joiner takes slot 0 if free, otherwise slot 1 (`DuelRoom.ts:58`). The character comes from the join options, validated against `CHARACTERS`, falling back to `hotfix`.
- **Start.** When both seats are filled, the room locks (no third client can join) and `startGame` creates the game with a random seed and sends each player `start { slot, characters }`. With one player, that player is sent `waiting { roomId }`.
- **Private rooms.** `options.private` calls `setPrivate(true)`, hiding the room from quick match; it can only be joined by id.
- **Input queue.** Each seat has a queue. A message may contain at most 10 inputs; each must be a 4-number array of finite numbers; inputs with a tick not greater than the seat's `ack`, or a tick already queued, are dropped (`DuelRoom.ts:37-45`). Each server tick takes one input from the queue, sorted by tick.
- **Backlog folding.** If a queue is longer than 4, the oldest entry is merged into the next (`DuelRoom.ts:110-113`, `mergeWire`). The merged input keeps the newer tick, aim and held state, and keeps one-shot presses from either (up, down, dash, fire, pickup, reload, push). A lag spike is caught up without losing a jump or dash.
- **No input this tick.** The seat's last input is reused with the one-shot presses cleared (`up`, `dash`, `push`, `pickup`, `reload`): you keep running, but a single jump press does not repeat. `fire` and `down` are not cleared, so a held trigger keeps firing.
- **Rematch.** Allowed only when the game phase is `over`. When both seats have sent `rematch`, `startGame` runs again and both get a new `start` message.
- **Leaving.** `onLeave` empties the seat, discards the game, broadcasts `left` and unlocks the room, so the same invite link still works for someone else (`DuelRoom.ts:126-133`). There is no forfeit result recorded.
- **Dropped connection.** `onDrop` (a wifi blip, a sleeping tab) pauses the game, broadcasts `pauseState` (so the other client stops predicting) and `dropped {slot, seconds: 20}` and calls `allowReconnection(client, 20)`. If the player returns within 20 s the seat is kept, the game unpauses and `back {slot}` is broadcast. If not, `onLeave` runs as above.
- **Pause by agreement.** One player sends `pause` (Esc); the room records it in `seat.pause` and broadcasts `pauseState {requests, paused}`. When both seats have asked, `game.paused = true`. `cancelPause` withdraws a request (ignored once paused). `resume` from either player clears the pause and both requests. `step` returns immediately when `state.paused` is true (`step.ts`, right after clearing events), so nothing moves, no timers run and `tick` does not advance. Because `game.tick` stops, the server counts its own `serverTick` and uses that to decide when to send a snapshot, so snapshots keep flowing while paused (`DuelRoom.ts:34`, `:184-185`). Against the bot, pause is instant and local.
- **Character choice.** The `character` message sets `seat.character` (used by the next `startGame`, so the pick carries into a rematch) and calls the shared `chooseCharacter` so the fighter respawns as that character.
- **Test hook.** `server/index.ts` sets `RULES.kosToWin` from the `KOS_TO_WIN` environment variable when present, for shorter matches in automated end-of-match checks. Leave it unset in production.
- **Entry point.** `server/index.ts` builds a Colyseus `Server` with `@colyseus/core` and `@colyseus/ws-transport`, defines the room under the name `duel` (`ROOM_NAME`), and listens on `PORT` (default 2567) on `0.0.0.0`.

### Client (`src/game/net/client.ts`)

- **Server address.** `GAME_SERVER` is `NEXT_PUBLIC_GAME_SERVER`, defaulting to `wss://floor42-game.fly.dev` (`client.ts:13`). For a local server set `NEXT_PUBLIC_GAME_SERVER=ws://localhost:2567` before `npm run dev` (not run for this document).
- **`joinRoom(mode, character)`**:

| Mode | Colyseus call | Used for |
|---|---|---|
| `quick` | `joinOrCreate('duel', ...)` | Quick match: join a waiting public room or create one |
| `private` | `create('duel', {private: true})` | Invite a friend: new hidden room |
| `join` | `joinById(roomId, ...)` | Opening an invite link |

- **`createOnlineSession(room, start)`** returns the object the game loop drives. It keeps its own `GameState`, a tick counter, a `history` of sent inputs (capped at 240), the latest unprocessed snapshot, and the rival's assumed input.
  1. **Predict.** Each tick (`session.tick(input)`) it numbers the input, stores it, sends it as `room.send('input', [wire])`, and runs `step` locally with your input and the rival's assumed input. The game feels instant because nothing waits for the network.
  2. **Rival input is assumed.** The client never sees the rival's keys ahead of time. It uses the rival's input from the last snapshot (`snap.inputs[1 - slot]`) and holds it constant until the next snapshot.
  3. **Reconcile.** The `snap` handler only stores the newest snapshot (an older unprocessed one is overwritten). At the start of the next tick, `reconcile` (`client.ts:47`): adopt the server's state as the truth, drop every history entry with tick `<= ack[slot]`, and replay the remaining (not yet acknowledged) inputs with `step`, using the rival's assumed input. Then the normal predicted step for the current tick runs. If the prediction was right, nothing visibly changes; if not, the state is corrected.
  4. **Events from the local predicted step only.** Snapshots carry no events, and the replay's events are discarded because `step` clears `state.events` at the start of each call. `session.tick` returns the events of the single predicted step, and `game.ts` feeds those to `handleEvent` (sounds, particles, shake). So effects play once, from your own prediction.
  5. **Ping.** Every 2 s `room.ping` records round-trip time in ms; the HUD shows it (`ArenaGame.tsx:293`).
  6. **Rematch.** `rematch()` sends the `rematch` message; `restart(msg)` rebuilds the local game when the server sends a new `start`.
  7. **Pause state.** The session listens for `pauseState` and keeps `pauseRequests` and a `serverPaused` flag. `reconcile` re-applies `state.paused = serverPaused` after adopting a snapshot (`client.ts:57`), so a snapshot that was produced just before the pause cannot un-pause the client. `requestPause`, `cancelPause`, `resume` and `chooseCharacter` (which also applies locally at once) send the matching messages.
- This is the design from section 2 working as intended: it depends on `step` being deterministic and holding all its memory in `GameState`.

### Lobby and arena glue

- `/play` renders `OnlineLobby` (`src/app/play/page.tsx`). `?room=<id>` (4 to 32 word characters or hyphens) joins that room immediately, which is the invite link: `${origin}/play?room=${roomId}`.
- Screens: menu (pick one of four fighters, saved in `localStorage` under `merge-conflict:character`; Invite a friend; Quick match), connecting, waiting (invite link with Copy button, or "waiting for someone to join the quick match"), error ("That room is full or gone" for a bad invite, otherwise "Can't reach the game server").
- **The lobby owns the connection.** The room is left only in the lobby's unmount effect (`OnlineLobby.tsx:41-47`), not in the arena component. React StrictMode in development mounts, unmounts and re-mounts components, re-running effects; if `ArenaGame` left the room on cleanup, the match would end the moment it started in dev. `ArenaGame` therefore only subscribes and unsubscribes to messages (`start` for rematches, `left` for the "Your rival left" overlay).
- **Round end and leaving (online).** The result modal has a character picker, Rematch (Enter) and Leave; it does not send you to `/characters`. Esc opens a Paused / "Pause requested" menu with Resume or Keep playing, and Exit match; while the rival has asked and you have not, a banner says "Press Esc to agree".
- **Rival dropped.** On `dropped` a modal counts down the 20 s. On `back` it disappears.
- **Rival left.** On `left` the client runs a wait flow (`WAIT_SECONDS = 60`, `MAX_WAITS = 3`, `ArenaGame.tsx:20-21`): it shows an invite link with a countdown, and after each 60 s asks "Keep waiting another minute?"; the third wait is labelled "last time". When it runs out, the client leaves the room and shows "Link expired". Meanwhile the room stays unlocked, so the same link can bring in a new rival, which triggers a normal `start`.
- **Slot-aware `me`.** In `game.ts`, `me = online.slot` (`game.ts:82`) replaces the hardcoded fighter 0 for auto-aim, aim line, reload sound and the key hint. Fighter order in the sim is unchanged: slot 0 is `fighters[0]`; spawn points are random, not tied to the slot.
- **HUD shows you first.** `emitHud` orders fighters as `[me, rival]` and remaps `winner` and the last KO to that order (`game.ts:452-460`), so the left panel is always "YOU" and the right is "RIVAL", whatever your slot.
- **Rival smoothing.** Your own fighter is drawn from the predicted state. The rival's drawn position eases toward its corrected position with `k = 1 - exp(-22 * dt)` when the correction is under 4 units, and snaps otherwise (`game.ts:329-338`). That hides small server corrections instead of showing teleports.

### Deployment

| Item | Value | Source |
|---|---|---|
| App | `floor42-game` | `fly.toml:2` |
| Region | `fra` (Frankfurt) | `fly.toml:3` |
| Machine | `shared-cpu-1x`, 256 MB | `fly.toml:15-17` |
| Autostop | `auto_stop_machines = "stop"`, `auto_start_machines = true`, `min_machines_running = 0` | `fly.toml:11-13` |
| Port | internal 8080 (`PORT=8080` in the image), HTTPS forced | `fly.toml:9-10`, `Dockerfile:10` |
| Scale | deployed with `--ha=false`: one machine, so every room lives in one process | owner's note |

The machine stops when idle and Fly starts it on the next connection, so the first player after a quiet period waits for a cold start. Rooms live in the memory of that single machine; if it restarts, running matches end.

The `Dockerfile` (`node:20-alpine`) installs exact versions of `@colyseus/core`, `@colyseus/ws-transport`, `@colyseus/schema`, `express` and `tsx`, copies only `server/index.ts`, `server/DuelRoom.ts`, `src/game/sim` and `src/game/net/protocol.ts`, and runs `npx tsx server/index.ts`. Those packages (except `tsx`, a dev dependency) are also direct dependencies in `package.json` (as ranges), so the image and local development can drift if the ranges move. If the server starts importing another file, it must be added to the `COPY` lines or the image will fail at start.

### Measured (2026-11-17, owner's Mac)

- Two browsers connected over Fly: both clients showed identical state.
- Round-trip time to Fly `fra`: about 123 to 131 ms.
- About 139 snapshots in 4.5 s.

### Not covered or not designed (read from the code)

- No automated test for `client.ts` or `DuelRoom.ts`; only `protocol.ts` has tests.
- Hitstop freezes `step` for up to 9 ticks. How prediction and the server stay aligned across hitstop was not designed or tested separately. The two-browser test showed matching state, but that is not a proof for every case.
- The client sends one input per message at 60 messages per second; the server's 10-inputs-per-message allowance is not used by this client.
- No rate limiting beyond the per-message cap, no authentication, and no check that a client's tick numbers are plausible.
- A player who leaves ends the match for the other; there is no forfeit result. A dropped connection has a 20 s reconnect window; a clean leave does not.
- With ~125 ms round trip, the rival is always seen about that far in the past plus the 33 ms snapshot interval, and its input is a guess between snapshots.

---

## 11. Decision log

Rows marked (notes) come from the owner's project notes and commit history, not from the code.

| Decision | Why |
|---|---|
| Replaced the melee prototype (first commit `a7ce688`) with a shooter | Playtest feedback (notes). Guns, cover and movement carried the game better. |
| Auto-aim is the default, mouse aim is an opt-in (T) | The game should be about moving and timing, not aiming precision; also works on keyboard only. |
| High damage (pistol 50 point blank, rocket and railgun one-shot) | Keeps fights short and makes cover, dash and push matter. Standing still and trading shots loses. |
| The "CTO noise" mechanic was added and then removed | It broke the pace of the match. The code lives in commit `3c8d987`; removed in `a6a4b2c`. |
| Rockets fly straight (`GRENADE.gravity = 0`) | Auto-aim aims at the target, so a falling rocket would miss for no visible reason. |
| Simulation separated from rendering, written without a physics engine | Needed for a server-authoritative design, for fast headless tests, and for deterministic replay (sections 2 and 3). |
| Playtest log, owner's first real online match (commits `90aefa7`, `1b03043`): pause by agreement (Esc twice, both must agree online); 3 s respawn (was 1.6 s) at a random spawn far from the rival; pick your next character while dead (keys 1 to 4), and pick or rematch from the result modal instead of leaving to `/characters`; 20 s reconnect for a dropped rival, then a 3 x 60 s wait flow with the same link; one gun per floor at random spots and kinds, slower gun respawn (15 s, was 12 s), one ceiling drop every 25 s (was 3 slots every 10 s); an in-world "E SWAP" prompt; the bot holds longer distances and backs off; layered gunshots, room reverb and compressor | Feedback from the match (notes; the log records the changes, the reasons are the owner's). What the diff shows: before these commits, spawns were two fixed points chosen by fighter id and guns were ten fixed spots. |
| Playtest log, second playtest (commits `3da54fc`, `c550396`, `9d30b50`), distance: small guns lose damage with range (per-gun `falloff`, section 4); a new Uzi | Feedback from the playtest (notes). In code: pistol, SMG, Uzi and shotgun scale down to 50 to 40 percent at range; the rail and rockets do not. |
| Playtest log, rarity: power weapons were made rarer in `c550396`, then judged "too rare" and moved to a dedicated top-floor table in `9d30b50` | Feedback (notes). In code: `GUN_TABLE` (SMG, shotgun, Uzi) on the lower floors, `POWER_TABLE` (rail, rockets) on the top floor only, 30 s respawn, six shots each. Every match sees them, but you have to climb. |
| Playtest log, bombs: ceiling drops became bombs (2 slots every 18 s), picked up automatically, thrown on a low arc, stashed gun returned | Feedback (notes). In code: a bomb does not replace your gun, travels on an arc instead of a line, and its linear blast falloff makes the adjacent case lethal. |
| Playtest log, controls: R swaps guns as well as reloading (E still works); the on-screen prompt says "R SWAP" | Feedback (notes). In code: reload still happens when there is nothing to swap. |
| Playtest log, HUD and sound: the "FLOOR 42" sign moved from the 3D wall to the HUD; the ambience loop was removed | Feedback (notes). The loop sounded like old-TV static (`sfx.ts` header). |
| Own visual theme: Bungee for display, Chakra Petch for UI, navy with git-diff colours (HEAD green, incoming red, conflict yellow) | A distinct identity; `src/app/layout.tsx`, `palette.ts`, `globals.css`. |
| Hosting plan: Cloudflare Pages for the static pages (free); Fly.io only for multiplayer servers, with autostop (notes) | Static pages cost nothing; a server only runs while someone plays. The Fly.io part is live (section 10); Cloudflare Pages was not checked for this guide. |
| Studio "Nalbaki Games" at nalbakigames.com, with games on subdomains (notes) | One brand, one game per subdomain. Not checked for this guide. |

---

## 12. Known limits and next steps

Honest list, from reading the code.

**Gameplay and rules**
- One arena, four characters, one mode (first to 5 or 150 s). Characters differ only in numbers (speed, jump, weight, size, air jumps), not abilities.
- The bot does not path-find and has no awareness of cover.
- Fast key taps shorter than one animation frame can be lost (section 2, edge-triggered inputs).
- A dash makes you immune to bullets only; pushes and explosions still land (`step.ts:511`).
- Kill credit is the last attacker. A fighter killed by a wall splat they caused after being shoved credits the pusher, but no event distinguishes it.
- The `rail` event type and `sign` export are declared but unused (`types.ts:109`, `step.ts:632`).

**Online** (see section 14 for what changed on 2026-11-19)
- Online games have no hitstop (section 14); offline games keep it.
- The rival is drawn from the authority's snapshots, half a round trip plus an adaptive 50 to 250 ms buffer in the past. During a stall longer than about 250 ms it slows to a stop and the HUD says "Connection unstable": nothing can show what has not arrived.
- Lag compensation is capped at 150 ms: a player farther than that (one way) is judged partly late.
- A clean leave ends the match with no forfeit result; a dropped connection gets 20 s to reconnect. The first player after an idle period waits for the Fly machine to start.

**Code and testing**
- Automated tests cover the simulation, the wire format, the authority loop (`net/authority.test.ts`) and the timeline (`net/timeline.test.ts`). Rendering, input, audio, the React shell, the WebRTC link and `DuelRoom` itself have no unit tests; the two-browser network lab (`tools/netlab`) covers them end to end but is not run in CI. `type-check` exists but there is no CI configuration in the repo.
- Magic numbers inside `step.ts` (stun thresholds, the 0.15 graze slope, the 0.6 s push-flag time) are not in `constants.ts`.
- The Dockerfile pins Colyseus versions while `package.json` uses ranges, and lists server files in `COPY` by hand.

**Before going public**
- `CLAUDE.md` lists work to do on the base template: remove the private `@frontend/ui-kit` dependency and every NAIC trace. `package.json` no longer lists `@frontend/ui-kit`; the rest of that list was not checked for this guide.

**Next steps**
1. Tests for `DuelRoom` (queue folding, rematch, leave) and for `createOnlineSession` reconciliation with a fake room.
2. A simulation test that replays a recorded input log on two instances of `step` and compares full state, to guard determinism.
3. A forfeit result for a rival who never comes back.
4. CI running `npm run test:run` and `npm run type-check`.

---

## 13. Since `9d30b50`: play vs bot, sound sliders, phones

Three commits, read from their diffs and the current files. Nothing here changes the simulation (`src/game/sim`) or the wire format.

### 13.1 Play vs bot from `/play` (`b7688ca`)

Reader question: what if nobody else is online?

- **Menu screen.** `OnlineLobby.tsx` has a "Play vs bot" link beside Invite a friend and Quick match (`OnlineLobby.tsx:147-152`).
- **Waiting screen.** While a quick match waits, "Nobody yet? Play the bot instead" is shown (`OnlineLobby.tsx:186-188`).
- **Both are plain links** to `/arena?p1=<your character>&bot=normal`. `/arena` is the existing single-player page: `src/app/arena/page.tsx:20` accepts `bot=easy|normal|hard` and falls back to `normal`. The character picked in the lobby is carried in `p1`; the bot's character is random.
- **Leaving the room.** The links leave `/play`, so the lobby's unmount effect runs and calls `room.leave()` (`OnlineLobby.tsx:41-47`, section 10). Nobody can join an empty match you walked away from. No new code was needed for that; the comment at the waiting link says so.
- The old standalone character-select page is gone (2026-11-23): /characters is the menu's fighter select, which starts the bot at `normal` like the online page.

### 13.2 Sound: guns bus, defaults and sliders (`bfed1d6`)

Reader question: where do the volume numbers live and why are gunshots quieter?

| Item | Value | Where |
|---|---|---|
| Default "All sound" | 0.8 (master volume multiplier) | `DEFAULT_VOLUMES`, `sfx.ts:23` |
| Default "Gunshots" | 0.45 (gain of the `guns` bus) | `DEFAULT_VOLUMES`, `sfx.ts:23` |
| Final master gain | `MASTER (0.75) * volumes.master`, or 0 when muted (M) | `sfx.ts` `ensure`, `setVolume`, `toggleMute` |
| Storage key | `floor42:volume`, JSON `{"master":0.8,"guns":0.45}` | `VOLUME_KEY`, `sfx.ts:18` |
| Mute key (unchanged) | `merge-conflict:muted` | `MUTE_KEY` |

- **A separate bus.** `Bus` gained `'guns'`. `shot()` sets a module-local `busOverride = 'guns'` while `shotVoice()` builds the voices, and the routing helper connects every node to `buses[busOverride ?? bus]`. All layers of a gunshot (crack, body, thump, extras) therefore land on the guns bus without changing each layer's own code. `try/finally` resets the override even if a voice throws. Hits, explosions, glass and KO sounds stay on `sfx`.
- **Reading and writing.** `readVolumes()` merges the stored JSON over the defaults and falls back to defaults if storage is missing or the JSON is bad. `setVolume(kind, value)` clamps to 0..1, updates the live gain nodes at once (no restart), and writes the new pair back, ignoring storage errors. `sfx.volumes` returns a copy.
- **The sliders.** `SoundSliders` in `ArenaGame.tsx` renders two range inputs (0 to 100, "All sound" and "Gunshots") inside the Esc Esc menu, above Exit match. It reads the starting values from `game.volumes()` and calls `game.setVolume` on every change; `game.ts` exposes both as thin wrappers over `sfx`. Each slider has an `aria-label`.
- **Gotcha.** The sliders are only reachable from the pause menu, so online you must be in the menu (the game keeps running unless both players agree to pause, section 10). The master slider scales everything, including the guns bus, so the effective gunshot level is `0.75 * master * guns`.

### 13.3 Phones and tablets (`55edc4d`)

Reader question: how does a touch screen drive a game built for a keyboard?

**Principle.** Touch input is turned into the same `InputState` the keyboard produces, so the simulation and netcode are untouched. Touch devices always auto-aim.

| Piece | File | What it does |
|---|---|---|
| `isTouchDevice()` | `src/game/input.ts:8` | True when `(pointer: coarse)` matches or `ontouchstart` exists. Called by `ArenaGame` (after mount, into state `touch`) and by `startArena` (`touch` constant). |
| `setTouch(button, on)` | `input.ts` | Adds the button to `touchHeld`; on press also to `touchLatched`. |
| `read()` | `input.ts` | Merges keyboard, `touchHeld` and `touchLatched` into one `InputState`, then clears `touchLatched`. |
| `TouchControls` | `src/components/TouchControls.tsx` | Stick, five buttons, pause button. |
| `useLandscape`, `RotateHint` | `TouchControls.tsx` | Detects portrait; full-screen "Turn your phone sideways" overlay. |
| `game.touch(b, on)` | `src/game/render/game.ts` | Unlocks audio, then calls `controls.setTouch`. |

**Latched presses.** The sim runs at a fixed 60 Hz but fingers touch and lift between ticks. A tap shorter than one tick would be pressed and released before `read()` sees it. `touchLatched` remembers "pressed since the last read", so the next tick sees the button down exactly once. `touchHeld` keeps long presses down. The sim's own edge detection (`prev`, section 2) then turns it into one press. `onBlur` clears `touchHeld` (a stuck button when the page loses focus) but not the latch.

**The stick** (`Stick`, left half of the screen below the top bar). It floats: it appears where the thumb lands. The knob is limited to a radius of 56 px. Direction thresholds, as a share of that radius:

| Direction | Threshold | Button pressed |
|---|---|---|
| Left or right | beyond 0.3 | `left` / `right` |
| Up | beyond 0.6 | `up` (jump) |
| Down | beyond 0.6 | `down` (drop through a walkway) |

Only one finger is tracked for the stick (`pointer` ref, pointer capture); other fingers can use the buttons at the same time, because each button captures its own pointer.

**Buttons** (`Pad`, right side): Fire (large), Jump (`up`), Dash, Push, Swap (`pickup`, small). Each calls `press(button, true/false)` on pointer down/up/cancel and suppresses the context menu. The pause button (top centre) calls `openMenu` in `ArenaGame`, which does what Esc does: request a pause, open the menu. That menu contains the sound sliders (13.2). Touch controls are hidden while the menu is open, the game is paused, the match is over or the rival left.

**Fullscreen and landscape.** The first touch on the stick or any button calls `goFullscreen()`, once per page load (`askedFullscreen`). It requests fullscreen on `<html>` (standard or `webkit` prefixed call), then locks the orientation to landscape. Every failure is swallowed (`.catch(() => undefined)`), and if the browser exposes no fullscreen request the function returns without doing anything. So where the API is missing, nothing happens and the browser bars stay. This is how iPhone Safari is expected to behave: as far as I know it offers no Fullscreen API on iPhone, so the page would play with the browser bars visible. The code path for a missing API is confirmed; the iPhone behaviour itself is a platform fact I did not test. `useLandscape` compares `innerHeight` with `innerWidth` on resize and `orientationchange`; in portrait `RotateHint` covers the arena, and the match keeps running underneath.

**Changes to existing code**

| File | Change |
|---|---|
| `ArenaGame.tsx` | `aimMode` forced to `'auto'` on touch; compact fighter panels (`w-48` instead of `w-72`); keyboard hint panel and the "FLOOR 42" sign hidden; hints and the respawn picker moved to the top (`top-36`, `top-32`) clear of the buttons; the hint key shown as "Fire"; no keycap over guns (the Swap button does it); touch wording ("Tap pause to agree", "Rematch"); root is `h-[100dvh]` with `touch-none`. |
| `ArenaGame.tsx` (key trap) | The hidden focused `<input>` (section 7) is not focused on touch devices: a focused field opens the on-screen keyboard. |
| `game.ts` | Pixel ratio `min(devicePixelRatio, 1.5)` on touch, 2 otherwise; a window `pointerdown` listener calls `sfx.unlock()` (removed on dispose), so audio starts on the first touch, as browsers require. |
| `layout.tsx` | Exported `viewport`: no pinch or double-tap zoom (`maximumScale: 1`, `userScalable: false`), `viewportFit: 'cover'`, theme colour `#0a0d18`. This applies to every page, not only the arena. |
| `globals.css` | `turnPhone` keyframes for the rotate hint. |

**How it was verified (from the commit message).** Chrome's Pixel 7 emulation driven with Playwright: stick and Fire held together, Jump, the pause menu, and an online match of a desktop browser against the emulated phone through the Fly server, both staying in sync. **Not yet tested on a real phone**, so real-device fullscreen behaviour, touch latency, frame rate with the 1.5 pixel ratio and iPhone Safari are unconfirmed. I did not re-run the emulation for this document.

**Known limits (from the code)**
- Pinch zoom is disabled for the whole site; this is an accessibility trade-off.
- `isTouchDevice()` is true for any device with touch, including touch laptops, which then get touch controls and forced auto-aim. There is no switch to turn them off.
- The stick tracks one finger and the layout is fixed pixel sizes (`h-64 w-72` button cluster); very small screens were not checked.
- No automated tests cover touch input, like the rest of input, audio and rendering (section 12).

---

## 14. Online play across countries (2026-11-19)

Owner's report: an online match between two countries "froze for an instant, and the next thing I saw I was dead". Reproduced with two real Chromium browsers playing one invite match over an injected bad network (`tools/netlab`, its README says exactly how the network is impaired): 80 to 180 ms round trip, 20 to 60 ms jitter, 1 to 5 % loss, 300 to 800 ms stalls every few seconds, once with the direct line allowed and once with ICE blocked (no TURN), which falls back to server mode.

### Root causes found (each measured, see the table below)

1. **Shader recompiles on the first rocket and on knockouts** (`render/game.ts`). The rocket's engine light and each fighter's fill light were children of objects that get hidden and shown. three.js recompiles every lit material when the number of visible lights changes: 11 to 13 new shader programs and a 116 to 166 ms frame on a 4x throttled CPU (far more on a phone GPU) at exactly the moment a one-shot rocket was fired. Opening the audio context on the first key press of the match cost another 151 ms frame. This happened on both browsers, online or not.
2. **Hitstop in an online match.** A big hit or a knockout froze the whole simulation for up to 9 ticks (150 ms). On the guest that freeze was either predicted from a guess (a kill on the rival the authority never had) or adopted late from a snapshot, after which the guest's own inputs inside it were lost. Measured: the guest's world held still, then a snapshot arrived with the guest at 32 hp, then dead: freeze, then dead.
3. **Late inputs judged late.** The authority applied each of the guest's inputs on the first tick after it arrived and, while nothing arrived (a stall), kept the guest running with its last input. Hits were judged where the guest had been a round trip earlier: the guest's own screen showed it 1.2 units (p50) and up to 4 units away from where it was hit in direct mode, 2.3 (p50) to 8.8 units in server mode.
4. **Unnumbered snapshots on an unordered line.** The direct line is unordered on purpose, but an older snapshot that arrived after a newer one was adopted anyway, rewinding the guest's world (60 to 160 times a minute in the test).
5. **No buffer for the far side.** The rival was drawn from a guess (its last input held) and snapped to the truth whenever a snapshot came in; after a stall, everything that happened in it was adopted in one frame (several hits and a knockout at once).
6. **A relayed snapshot ended the match.** When the direct line went quiet, messages went through the server's relay, but Colyseus accepts at most 4 KB per client message and disconnects a client that sends more. 87 % of snapshots are bigger once relayed (p50 4.5 KB, up to 7.9 KB), so the host was cut off and the guest saw "Your rival left".
7. **A silent direct line looked healthy.** A data channel stays "open" for seconds after the network under it dies; messages sent into it vanish. The HUD also said "direct" in relay mode.
8. **No TURN.** With STUN only, two strict NATs (common on mobile networks) cannot reach each other, so cross-country matches fell back to the server in Frankfurt.

### What changed

| Piece | File | Change |
|---|---|---|
| Lights and shaders | `render/game.ts` | Every point light stays in the scene and is dimmed, never hidden; every gun, fighter, pooled effect and material is compiled before the first frame. |
| Audio | `sfx.ts` | One audio context per visit, opened on the first click anywhere (the lobby counts); the sound graph is built at arena start. |
| No hitstop online | `sim/step.ts`, `sim/types.ts` | `createGame(..., net = true)` sets `state.net`; such a game never sets `hitstop`. Offline play is unchanged. Events now name who caused them (`by`, `owner`, `fighter`). |
| Lag compensation | `net/authority.ts` (new, shared by the host browser and the server) | Each remote input is applied at the tick its sender pressed it (arrival minus the one-way delay, half the best of the last 10 round trips, at most `MAX_COMP_TICKS` = 5 ticks so jitter still fits), by rewinding and replaying, never more than `REWIND_CAP_TICKS` = 9 (150 ms). A slower input only adds its presses to the next tick (a jump is never lost). A late input moves its sender in the past (the dodge counts), but its shots and shoves start when it arrives: no bullet appears halfway to you. While an input is missing, the player keeps its last movement until the real one corrects it. |
| Confirmed snapshots | `authority.ts`, `protocol.ts` | A snapshot carries the newest tick every remote input reached, plus each seat's inputs for the ticks after it (`next`): the client replays its real inputs over them and never adopts the authority's guesses about its own inputs. Snapshots are numbered (`seq`); an older one is never adopted. |
| Events from the authority | `authority.ts`, `client.ts`, `timeline.ts` | The authority sends its events with their ticks (direct: on the reliable channel; server: inside the snapshot). A batch replaces its tick range, because a rewind can change them. The client shows its own actions from prediction and everything the rival caused when its timeline reaches that tick (`isOwnEvent`). |
| Timeline | `net/timeline.ts` (new) | The rival, the rival's shots, and your health and knockout are drawn from a buffer of snapshots, interpolated, `delay` behind the newest. The delay is one snapshot interval plus the 95th percentile of measured arrival jitter, 50 to 250 ms. On underrun the rival keeps its velocity for 100 ms, then slows to a stop over 150 ms; when data returns the step is eased out over 100 ms and the clock catches up at most 1.6x (more than 1.5 s behind, it jumps). Your own fighter stays predicted; its corrections are eased out over about 90 ms. |
| Direct line | `net/peer.ts` | If nothing arrives on the line for 600 ms (or the connection reports disconnected), every message also goes through the server relay until the line talks again; duplicates are dropped. Relayed messages over 3,000 characters are sent in parts. Optional TURN (below). `mode` is `direct`, `turn` or `relay`. |
| HUD | `ArenaGame.tsx` | A badge always shows the path and round trip ("Direct · 42 ms", "Relay (TURN)", "Server relay", "Server", "· you host"). "Connection unstable" appears for 1.5 s after a snapshot or input gap over 250 ms, a timeline coasting to a stop, or inputs waiting over 450 ms. |
| Server | `server/DuelRoom.ts`, `server/Dockerfile` | Runs the same authority loop for both seats, numbers snapshots, sends events, says `v: 2` in `start`, accepts `rtt` reports from version-2 clients. The Dockerfile now copies `src/game/net/authority.ts`. `NET_PROBE=1` logs every hit (test hook). |

Compatibility: a new client on the old server gets no `v` in `start`, sends nothing new, and falls back to predicting every event itself; the old server's snapshots have no `seq` (always newer) and no `next` (pushed to the timeline as they are). An old client on the new server ignores `seq`, `next` and `ev` and adopts the confirmed state, which is consistent.

### TURN (optional, configured by environment)

Set at build time (Vercel project settings), never in the repo:

```
NEXT_PUBLIC_TURN_URL=turn:turn.example.com:3478,turns:turn.example.com:5349
NEXT_PUBLIC_TURN_USERNAME=...
NEXT_PUBLIC_TURN_CREDENTIAL=...
```

`NEXT_PUBLIC_` values end up in the page, so anyone can read them; use credentials that can only relay, with a usage cap, and rotate them. Options, cheapest first (checked 2026-11-19, verify before choosing):
- Cloudflare Realtime TURN: $0.05 per GB after a free 1,000 GB a month ([pricing](https://developers.cloudflare.com/realtime/turn/faq/)). Its credentials are short-lived and minted with an API key, which belongs on a server: the clean setup is a small `/api/turn` route that mints them (not built yet); a long TTL works with the env variables above.
- Self-hosted coturn on a small VPS near the players.
- Twilio Network Traversal Service, about $0.40 per GB (reported by a third party, not checked).

Measured in the lab: the host sent 7.4 MB and the guest 0.6 MB in a 60 s match (snapshots 30/s, inputs 60/s), about 130 KB/s together, so roughly 8 MB a minute through a TURN relay.

### Tests

`npm run test:run` covers: late inputs applied at their due tick and the result equal to an on-time run; the 150 ms cap (a later input only adds its presses, a dash still happens); compensation by the measured one-way delay; duplicates counted once; held movement corrected; replayed events handed out again; pause and character pick surviving a rewind; confirmed snapshots and replaying `next`; late shots fired on arrival, once; the timeline's smooth interpolation, adaptive delay, out-of-order fill, underrun without freeze or jump, catch-up at most 1.6x, events by tick with replacement; snapshot numbering; who shows which event; no hitstop online.

### Before and after (same injected network, 3 seeded runs of 60 s per row)

Host: 80 ms round trip, 20 ms jitter, 1 % loss, a 300 to 800 ms stall every 4 to 9 s. Guest: 180 ms, 60 ms, 5 %, a stall every 3 to 7 s. "Server" rows block ICE (no direct line). Desktop GPU (Apple M1 Pro), dev build, local server. Frame times pool both browsers; the rest is the guest unless noted.

| Mode | Build | Frames > 50 ms | Frame p95 / p99 / max (ms) | Older snapshot adopted | Own correction p95 / p99 (units) | Rival teleports (> 1 unit in a frame) | Freeze-then-dead / KOs (both) | Guest hit vs. its own screen, p50 per run (units) |
|---|---|---|---|---|---|---|---|---|
| direct | before | 10 | 16.7 / 16.8 / 83.4 | 178 | 0.17 / 0.64 | 39 | 2 / 25 | 0.76, 1.17, 1.40 |
| direct | after | 0 | 16.8 / 16.8 / 16.8 | 0 | 0.01 / 0.41 | 15 | 1 / 19 | 0.27, 0.09, 0.13 |
| server | before | 8 | 16.7 / 16.8 / 66.7 | 0 (TCP keeps order) | 1.10 / 5.27 | 101 | 7 / 27 | 2.11, 1.71, 1.44 |
| server | after | 0 | 16.7 / 16.8 / 33.4 | 0 | 1.02 / 3.64 | 83 | 10 / 46 | 0.45, 0.40, 0.48 |

Render hitches on a 4x throttled CPU (`perf.mjs`, desktop and phone viewport): before, 116 to 166 ms frames when the launcher was picked up and fired, 11 to 13 new shader programs each time; after, the longest frame was 16.8 ms and the program count did not change.

What did not get better, honestly: in server mode TCP still stalls everything behind a lost packet, so snapshot gaps (p95 about 85 to 100 ms, worst about 1 s) are the same before and after, and a stall of more than about 250 ms still shows the rival slowing to a stop (with "Connection unstable" on screen). "Freeze-then-dead" here counts any KO within 1 s after such a stall, so in server mode it stays at about one KO in four; only a direct line (or TURN) removes the stalls themselves. Fly's `fra` region is not closer to anyone because of this change.

### Deploying

The browser part ships with Vercel. The server part (`server/DuelRoom.ts`, `server/Dockerfile`, the shared `src/game/net/authority.ts`, `protocol.ts`, `src/game/sim`) needs `cd ~/Desktop/projects/floor-42 && flyctl deploy --ha=false --remote-only`. Until then, server-mode matches run the old server logic; the new client works with it.


## 15. Online latency pass (2026-11-27, branch `net-latency`)

Owner's goal: online should feel ideal, "max 50-60 ms". That only holds when both players are near the server; our own code must add as little as possible on top of the network. Owner decision the same day: online stays parked for the CrazyGames launch and no money is spent now, so the multi-region part is code behind a flag and a written plan, and nothing is deployed.

### What changed

| Piece | File | Change |
|---|---|---|
| Snapshot rate | `net/protocol.ts` | `SNAPSHOT_EVERY_TICKS` 2 to 1: 60 snapshots a second (was 30). |
| Snapshot size | `net/wire.ts` (new), `protocol.ts` | `GameState` as rows of rounded numbers in a fixed column order, short envelope keys, `next` inputs relative to `ack`. 2.6 KB idle and 4.5 to 7.9 KB in play become about 0.8 KB. Steps: positions, velocity, health 0.01; angles and timers 0.001; ids, seed, strings exact; Infinity is a code. A test fails when the simulation grows a field `wire.ts` does not list. |
| Protocol version | `protocol.ts`, `DuelRoom.ts` | `PROTOCOL_VERSION` 3. The client sends `v` when it joins; the server's `onAuth` refuses anything else with code 4426 and "This page is out of date. Reload it to play online." A new client still reads the full-state snapshots of an older server or host (`decodeSnapshot` detects the old shape). |
| Interpolation delay | `net/timeline.ts` | Target = one snapshot interval (16.7 ms, was 33.3) + measured p95 jitter + 8 ms, floor 40 ms (was 50), start 60 ms (was 100). Narrowing speed is the same per second at either rate. |
| Server tick pacing | `net/fixedStep.ts` (new), `DuelRoom.ts` | `setSimulationInterval(fn, 1000/60)` ran the server at 59.35 ticks/s measured (58.5 in a bare Node timer test) while browsers step at 60. Now a 2 ms poll runs the ticks that real time says are due (catch-up at most 4, then it gives the time up). 60.0 ticks/s, tick gaps p50 16.6, max 19.4 ms. `TICK_STATS=1 npm run server` logs rate, gaps and work per tick every 10 s. |
| State copy | `net/clone.ts` (new), `authority.ts` | `structuredClone` per tick replaced by a typed deep copy: 16 us to 4.7 us per copy (measured, `tools/netlab/bench-clone.mts`). Honestly small: about 1 ms of CPU a second saved. Tick work was already p50 0.3 ms, p99 0.7 to 1.3 ms. A test checks it equals `structuredClone` and shares nothing. |
| Shared snapshot builder | `net/serverSnapshot.ts` (new) | The server's snapshot assembly, so the simulation tool runs the same code. |

Determinism: the client adopts a snapshot and replays at most 9 ticks of inputs on it. The rounding (at most 1 cm, 1 ms) makes that replay differ from the server by up to that much; the next snapshot corrects it, and the existing correction smoothing hides it. The server's own simulation is not rounded. Tests that compared replays exactly (`crouch.test.ts`, `protocol.test.ts`) now compare with a 0.02 tolerance (`net/closeTo.ts`).

### Numbers (before / after)

Two ways, both server mode, 10 ms jitter. Regenerate with the commands under "Tools".

1. `tools/netlab/sim.mts`: deterministic, 60 s, runs the real authority, snapshot code, client session and timeline on a virtual clock with netshim's TCP model (rtt/2 + U(0, jitter), a lost message waits max(200, 1.5 rtt) ms and everything behind it). "Rival age" is how far behind the authority's recorded path the drawn rival is, measured at the frames where it moves; it has a resolution of one tick (16.7 ms), so read it as a trend. "Added" = rival age minus rtt/2 (the network's share).

| RTT / loss | Added latency p50 before -> after | Delay (interp.) | Bytes/s to one client before -> after | Underruns in 60 s before -> after |
|---|---|---|---|---|
| 30 ms / 1 % | 18.7 -> 2.2 ms | 50 -> 40 ms | 85.7 KB -> 57.9 KB | 15 -> 35 (floor 35; with the shipped floor 40 see below) |
| 60 ms / 1 % | 20.3 -> 3.7 ms | 50 -> 40 ms | 86.5 KB -> 58.6 KB | 17 -> 37 |
| 120 ms / 2 % | 40 -> 23.5 ms | 50 -> 38 to 40 ms | 88.8 KB -> 60.3 KB | 273 -> 177 |

The "after" rows were taken with floor 35 ms; the shipped floor is 40 ms (a sweep at 60 and 120 ms RTT: floor 35 gives 224 underruns at 120 ms / 2 % loss, floor 42 gives 96, floor 50 gives 97 for the same added latency within the tool's one-tick resolution). Underruns are the timeline running out of snapshots and extrapolating the rival for up to 100 ms (never a freeze); they come from loss stalls, which TCP still imposes. The p95 of "added" is 250 to 450 ms in every row, before and after: that is the head-of-line blocking of a lost TCP message and our code cannot change it (only a direct line or UDP-like transport could).

Bytes: one snapshot in a fight is 0.8 KB (was 2.9 KB on average). 60 a second at 0.8 KB is 48 to 58 KB/s per client, 32 to 38 % less than 30 a second at 2.9 KB. About 200 of the 790 bytes are the seven gun pickups, which barely change: sending them only when changed (plus a keyframe) is the next cheap saving, but it needs ordered delivery, which the direct WebRTC line does not give, so it was left out.

2. `tools/netlab/run.mjs --quick` (two real Chromium browsers, local server, netshim, 30 s, one run per row; run-to-run noise is large because the shim's loss events are random and land differently). Snapshot gaps as the browsers saw them:

| RTT / jitter / loss | Snapshot gap p50 before -> after | p95 before -> after | p99 / max (loss stalls) before -> after |
|---|---|---|---|
| 30 / 10 / 1 % | 33.3 -> 16.2 ms | 40.2 -> 24.1 | 204 / 243 -> 209 / 230 |
| 60 / 10 / 1 % | 33.0 -> 15.8 | 42.8 -> 23.6 | 49 / 249 -> 212 / 229 |
| 120 / 10 / 2 % | 32.6 -> 14.4 | 44.4 -> 25.1 | 237 / 247 -> 218 / 227 |

Rival view error (drawn rival vs where the other browser really was) p50 stayed 0.3 to 1.2 units and p95 2 to 4 units before and after, host side slightly worse at 30 ms (1.3 -> 3.9), not better anywhere beyond noise. "Visible freeze max" is dominated by the shim's loss stalls (0.5 to 3.3 s) in both builds and did not improve. Frames over 50 ms: 0 in both. Conclusion: our added latency is down by roughly 17 ms (p50) and the stream is twice as fine-grained, but the user-visible weakness at 1 to 2 % loss is still TCP stalls, not our delay.

Server (bare Node, loopback, `tools/netlab/tickprobe.mts`, 20 s): game ticks per second 59.35 -> 60.00, snapshot gap max 64 -> 40 ms (30 Hz) -> 16 ms p50 at 60 Hz in the browsers above.

### Tools

- `npx tsx tools/netlab/sim.mts --rtt 60 --jitter 10 --loss 0.01 --secs 60` : the deterministic simulation above.
- `npx tsx tools/netlab/tickprobe.mts [ws://localhost:2567] [secs]` : tick rate, snapshot gaps and bytes against a local `npm run server`.
- `npx tsx tools/netlab/bench-clone.mts`, `npx tsx tools/netlab/tiers.mts` (needs `MULTI_REGION=1`).
- Browser lab: `NETLAB=1 npx next dev --webpack -p 3011` (strict mode off: its double-mounted effects join an invite room twice; `--webpack` because Turbopack refuses the symlinked `node_modules` of a worktree), `npm run server`, then `node tools/netlab/run.mjs out.json --quick --web http://localhost:3011 --server ws://localhost:2567 --secs 30 --host '{"rtt":60,"jitter":10,"loss":0.01,"ws":true,"blockIce":true}' --guest '{...}'` and `node tools/netlab/short.mjs out.json`. `--quick` makes both browsers press Quick match; the invite-link flow of `run.mjs` is unchanged but see "Observed, not fixed".

### Regions and matchmaking

Superseded on 2026-11-28 (branch `online-bots`): the latency tiers and `MULTI_REGION` are gone. Region choice by measured
`/ping` (median of 4), quick match own region -> next region within +60 ms -> server bot, costs and deploy steps:
`docs/online/2026-11-28-matchmaking.md`.

### Observed, not fixed

- (Fixed 2026-11-28 on `online-bots`: the lobby's unmount cleanup, run by React StrictMode in development, cancelled the join; it is now deferred one task.) In the dev build, opening an invite link (`/play?room=...`) in a second browser left that page on "Joining room" in my netlab runs (the server logged the guest's seat leaving), with strict mode on or off; the server-side flow is fine (a headless SDK client gets `peer` then `start` at 6 s). I did not find the cause in the lobby's join effect and it is menu code, so I left it; it is worth a look before online is switched back on. A second, older effect: the server sends `peer` inside `onJoin`, before the joining page has registered its handler (the SDK warns "onMessage() not registered for type 'peer'"), so the second player never answers the direct-line handshake and every match starts after the server's 6 s timeout. That 6 s is the largest "latency" a player sees; fixing it (the client says `ready` after registering handlers, the server starts the handshake on that) is a small, separate change.
- `tools/netlab/run.mjs` needed the first-visit "PLAYER" picker click and a longer start timeout (both added).

### What was not verified

No real network: every number above is a local server with netshim's model, not a measurement from Fly or from phones; TCP behaviour of Fly's edge, Wi-Fi and mobile paths will differ. The multi-region client path (probe, tier) is unit-tested and the server side exercised locally, but never against two real regions. The direct (WebRTC) mode was exercised only by the unit tests and not in a browser run with ICE open. `pickupHold` (local 2-player) survives the wire in a test but is never sent online.
