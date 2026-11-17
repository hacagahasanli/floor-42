# Floor 42: technical guide

Reader: a frontend developer (Next.js, React, TypeScript) who has not built a game before.
Goal: after reading this you can find any rule in the code, change a number safely, and explain why the project is split the way it is.

Everything below was read from the source. Paths are relative to the repo root; `file:line` points at the lines as of this writing. Numbers come from `src/game/sim/constants.ts` unless stated.

Everything described here is built, including online multiplayer (section 10). Updated for commits up to `9d30b50`.

Project tooling, one line: the game was built with agent skills from the owner's local repo `~/Desktop/projects/game-dev-skills` (not published). Three were written for this project (`web-multiplayer-netcode`, `web-game-feel`, `web-game-audio`); five third-party skills in it are Apache-2.0.

---

## 1. Overview

Floor 42 is a side-on, 1v1 office shootout that runs in the browser.

- Two fighters on a 36-unit-wide office (`ARENA.left = -18`, `right = 18`, `ceiling = 13.5`). One world unit is roughly one metre.
- Two hits knock a fighter out: 100 hp, the pistol does 50 per hit.
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
    characters/page.tsx    character select (renders CharacterSelect)
    play/page.tsx          online lobby (?room=<id> joins an invite)
    arena/page.tsx         reads ?p1= &p2= &demo &bot= and renders ArenaGame
    layout.tsx             fonts (Bungee, Chakra Petch), metadata
  components/
    ArenaGame.tsx          React shell: canvas + HUD overlay + hidden input
    CharacterSelect.tsx    turntable gallery of the four fighters
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
    roster.ts              character names, pitches, accent colours (UI copy)
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

### Platforms: one-way and drop-through

Every platform is a horizontal segment `{x0, x1, y}` (`ARENA.platforms`, `constants.ts:23`). There are no solid sides or undersides: you jump up through them and land on top.

Landing rule (`step.ts:437-457`): only when moving down or still (`vy <= 0`), and the fighter's feet crossed the platform's height this tick (`prevY >= p.y && f.y <= p.y`), and the middle half of the body overlaps the platform horizontally. The floor (`y = 0`) is the same check against `ARENA.floor`.

Drop-through: pressing Down while standing on furniture sets `dropTime = 0.25 s` (`PHYS.dropTime`). While it is above zero, platform landing is skipped. The floor itself cannot be dropped through (`step.ts:363`).

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
| Pistol | 0.38 | 8 | inf | 1.0 | 50 | 1 | 0.02 | 30 | 1.3 | 4 | 0 | 1.00 | bullet | 6 / 20 / 0.5 |
| SMG | 0.11 | 20 | 40 | 1.4 | 34 | 1 | 0.10 | 32 | 1.0 | 2.5 | 0.4 | 0.97 | bullet | 5 / 16 / 0.5 |
| Uzi | 0.055 | 32 | 32 | 1.2 | 12 | 1 | 0.15 | 30 | 0.8 | 1.2 | 0.2 | 1.00 | bullet | 4 / 12 / 0.5 |
| Shotgun | 0.9 | 4 | 8 | 1.5 | 20 | 6 | 0.26 | 28 | 0.32 | 4 | 7 | 0.93 | pellet | 2 / 7 / 0.4 |
| Sniper rail (`railgun`) | 1.4 | 3 | 3 | 1.8 | 100 | 1 | 0 | 160 | 0.35 | 14 | 9 | 0.88 | rail | none |
| Rockets (`launcher`) | 1.1 | 2 | 4 | 1.1 | 110 | 1 | 0.01 | 22 | 2.2 | 22 | 4 | 0.88 | grenade | none |
| Bomb | 0.5 | 1 | 0 | 1.0 | 110 | 1 | 0 | 16 | 1.8 | 20 | 0 | 1.00 | bomb | none (see Bombs) |

**Falloff.** Small guns lose damage with the distance the shot has travelled. `GunStats.falloff = {near, far, min}`: full damage up to `near`, then a straight line down to `min` x damage at `far` and beyond. Each projectile records where it was fired (`Projectile.ox`, `oy`), and `updateProjectiles` scales the damage at the moment of the hit from the distance to the target's centre (`step.ts`, "Damage falls off with the distance the shot travelled"). A pistol hit from 20 or more units away does 25, so it takes four. The sniper rail and rockets have no falloff: they always kill in one.

Hits to KO from 100 hp, up close: pistol 2, SMG 3, Uzi 9, shotgun 5 of 6 pellets (so a point-blank blast usually kills), sniper rail 1, rocket 1 on a direct hit (110 damage at the blast centre). The comment above `GUNS` in `constants.ts` states the design intent: deadly up close, more hits at range, and one-shot weapons kept rare.

Notes:
- Spread is a random cone, drawn from the seeded RNG (`step.ts:193`). Shotgun pellet speed also varies by 0.85 to 1.15.
- Recoil pushes the shooter backwards; in the air it also pushes vertically. This is what makes rocket-jumping possible.
- `life` caps range: shotgun pellets vanish after 0.32 s, about 9 units.
- Running dry on a special gun drops you back to a fresh pistol (`step.ts:255-259`). A magazine that empties with reserve left reloads automatically.
- Pickups: with only the pistol in hand, walking over a gun takes it. Otherwise press **E or R** to swap for the gun you stand on (R still reloads when there is nothing to swap, `step.ts`, the `swap` line). Bombs are always picked up on contact.
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
| Drop through furniture, fast fall | S or Down |
| Dash | Shift |
| Fire (hold) | Space (also left click in mouse mode) |
| Force Push | Q |
| Swap for the gun you stand on | E or R |
| Reload (when there is no gun to swap for) | R |
| Toggle aim mode | T |
| Mute | M |
| Rematch after a match | Enter |
| Pause menu (online: ask to pause) | Esc twice within 450 ms |
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

Browsers refuse to start audio until the user interacts with the page. `createSfx` therefore creates the `AudioContext` lazily: `sfx.unlock()` is called on every keydown (`game.ts:456-457`) and `ensure()` creates or resumes it (`sfx.ts:14`). Sounds requested before the first key press are silently skipped. M mutes by setting master gain to 0; master gain is otherwise 0.75 (`MASTER`). The mute choice is remembered in `localStorage` under `merge-conflict:muted`.

Since `3da54fc` the audio follows the owner's `web-game-audio` skill (`sfx.ts`, header comment):

- **Buses.** Every voice goes through a stereo panner to a category bus (`sfx` 1.0, `ui` 0.7, `amb` 0.5), then a `DynamicsCompressor`, then the master gain. A scaled copy of each voice also goes to a generated room reverb (a `ConvolverNode` whose 0.9 s impulse response is decaying noise built in code, `makeRoom`).
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
| Movement | land on a desk and drop through it with Down; wall-kick off the glass; facing follows aim |
| Guns | pistol hits where aimed and misses when aimed away; furniture blocks bullets; auto-reload; spent special gun falls back to pistol; two pistol hits KO; point-blank shotgun is a one-shot KO; railgun goes through furniture; grenade throws everyone including the shooter; rockets fly straight across the office; walking over a gun with a pistol picks it up; dash dodges bullets |
| Force Push | splats into the glass (checks `WALL_SPLAT_DAMAGE`); reflects bullets at the shooter |
| KOs | KO scores for the shooter and the fighter respawns with a pistol; 3 s wait after a KO and coming back as someone else |
| Falloff, Uzi, power weapons, bombs, swap | small guns hurt less from across the office; the sniper rail still kills in one at range; the top floor always offers a power weapon with six shots and lower floors never do; the Uzi fires fast but weakly; a bomb is picked up over your gun and the gun returns after the throw; a lobbed bomb lands near the target and is lethal next to it; R swaps for the gun you stand on |
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

- `WireInput = [clientTick, buttonBitmask, aimX, aimY]` (`protocol.ts:13`). Buttons map to bits in this order: left 0, right 1, up 2, down 3, dash 4, fire 5, pickup 6, reload 7, push 8 (`protocol.ts:10`). Aim is rounded to 2 decimals.
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
- **Pause by agreement.** One player sends `pause` (Esc twice); the room records it in `seat.pause` and broadcasts `pauseState {requests, paused}`. When both seats have asked, `game.paused = true`. `cancelPause` withdraws a request (ignored once paused). `resume` from either player clears the pause and both requests. `step` returns immediately when `state.paused` is true (`step.ts`, right after clearing events), so nothing moves, no timers run and `tick` does not advance. Because `game.tick` stops, the server counts its own `serverTick` and uses that to decide when to send a snapshot, so snapshots keep flowing while paused (`DuelRoom.ts:34`, `:184-185`). Against the bot, pause is instant and local.
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
- **Round end and leaving (online).** The result modal has a character picker, Rematch (Enter) and Leave; it does not send you to `/characters`. Esc twice opens a Paused / "Pause requested" menu with Resume or Keep playing, and Exit match; while the rival has asked and you have not, a banner says "Press Esc twice to agree".
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
| Two-hit lethality (pistol 50 damage, rocket and railgun one-shot) | Keeps fights short and makes cover, dash and push matter. Standing still and trading shots loses. |
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
| Studio "Merge Conflict" at mergeconflict.gg, with games on subdomains (notes) | One brand, one game per subdomain. Not checked for this guide. |

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

**Online**
- Prediction across hitstop (up to 9 frozen ticks) was not analysed separately; a two-browser test matched, which is evidence, not proof (section 10).
- The rival is shown about one round trip behind (123 to 131 ms measured to Fly `fra`) plus the snapshot interval, and its input is a guess between snapshots.
- A clean leave ends the match with no forfeit result; a dropped connection gets 20 s to reconnect. The first player after an idle period waits for the Fly machine to start.

**Code and testing**
- Automated tests cover the simulation and the wire format. Rendering, input, audio, the React shell, `net/client.ts` and `DuelRoom` have none. `type-check` exists but there is no CI configuration in the repo.
- Magic numbers inside `step.ts` (stun thresholds, the 0.15 graze slope, the 0.6 s push-flag time) are not in `constants.ts`.
- The Dockerfile pins Colyseus versions while `package.json` uses ranges, and lists server files in `COPY` by hand.

**Before going public**
- `CLAUDE.md` lists work to do on the base template: remove the private `@frontend/ui-kit` dependency and every NAIC trace. `package.json` no longer lists `@frontend/ui-kit`; the rest of that list was not checked for this guide.

**Next steps**
1. Tests for `DuelRoom` (queue folding, rematch, leave) and for `createOnlineSession` reconciliation with a fake room.
2. A simulation test that replays a recorded input log on two instances of `step` and compares full state, to guard determinism.
3. A forfeit result for a rival who never comes back.
4. CI running `npm run test:run` and `npm run type-check`.
