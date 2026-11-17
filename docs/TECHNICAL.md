# Floor 42: technical guide

Reader: a frontend developer (Next.js, React, TypeScript) who has not built a game before.
Goal: after reading this you can find any rule in the code, change a number safely, and explain why the project is split the way it is.

Everything below was read from the source. Paths are relative to the repo root; `file:line` points at the lines as of this writing. Numbers come from `src/game/sim/constants.ts` unless stated.

Status legend: **built** means the code exists and runs. **In progress** means files exist but the feature is not usable yet. Online multiplayer is the only in-progress area (section 10).

---

## 1. Overview

Floor 42 is a side-on, 1v1 office shootout that runs in the browser.

- Two fighters on a 36-unit-wide office (`ARENA.left = -18`, `right = 18`, `ceiling = 13.5`). One world unit is roughly one metre.
- Two hits knock a fighter out: 100 hp, the pistol does 50 per hit.
- First to 5 KOs wins (`RULES.kosToWin`), or the higher KO count when the 150 s round ends (`RULES.roundSeconds`).
- Your gun **auto-aims** at the opponent by default; you only move, jump, dash, push and fire. Mouse aim is an option.
- Five guns: pistol (infinite ammo, you spawn with it), SMG, shotgun, railgun, rocket launcher.
- Furniture (desks, walkways, cabinets) is cover: bullets stop on it.
- **Force Push** (Q): a short-range shove that also reflects bullets.
- Single-player against a bot (three levels). Online play is in progress.

### Folder map

```text
src/
  app/                     Next.js App Router: pages only, no game logic
    page.tsx               title screen
    characters/page.tsx    character select (renders CharacterSelect)
    arena/page.tsx         reads ?p1= &p2= &demo &bot= and renders ArenaGame
    layout.tsx             fonts (Bungee, Chakra Petch), metadata
  components/
    ArenaGame.tsx          React shell: canvas + HUD overlay + hidden input
    CharacterSelect.tsx    turntable gallery of the four fighters
  game/
    sim/                   THE RULES. Pure TypeScript, no DOM, no Three.js
      types.ts             GameState, Fighter, InputState, GameEvent ...
      constants.ts         arena layout, rules, physics, gun stats
      step.ts              step(state, inputs): advance one tick
      bot.ts               single-player opponent
      sim.test.ts          22 tests
    render/                THE LOOK. Three.js scene built from primitives
      game.ts              startArena(): game loop, sim <-> scene glue
      arena.ts             office geometry, canvas textures, skyline
      characters.ts        fighter models and procedural animation (poseRig)
      guns.ts  vfx.ts  palette.ts  gallery.ts
    input.ts               keyboard and pointer -> InputState
    sfx.ts                 WebAudio sound synthesis
    roster.ts              character names, pitches, accent colours (UI copy)
    net/protocol.ts        wire format for online play (in progress)
server/
  index.ts  DuelRoom.ts    Colyseus game server (in progress)
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
2. **It runs in tests.** `sim.test.ts` builds a state, calls `step` N times and asserts. No browser, no canvas. 22 tests run in about 0.3 s.
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

| Gun | rate (s) | mag | reserve | reload (s) | damage | pellets | spread (rad) | speed | life (s) | knockback | recoil | carry | kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pistol | 0.38 | 8 | inf | 1.0 | 50 | 1 | 0.02 | 30 | 1.3 | 4 | 0 | 1.00 | bullet |
| SMG | 0.11 | 20 | 40 | 1.4 | 34 | 1 | 0.10 | 32 | 1.0 | 2.5 | 0.4 | 0.97 | bullet |
| Shotgun | 0.9 | 4 | 8 | 1.5 | 20 | 6 | 0.26 | 28 | 0.32 | 4 | 7 | 0.93 | pellet |
| Railgun | 1.6 | 2 | 2 | 1.8 | 100 | 1 | 0 | 160 | 0.35 | 14 | 9 | 0.88 | rail |
| Rockets | 1.1 | 1 | 3 | 1.1 | 110 | 1 | 0.01 | 22 | 2.2 | 22 | 4 | 0.88 | grenade |

Hits to KO from 100 hp: pistol 2, SMG 3, shotgun 5 of 6 pellets (so a point-blank blast usually kills), railgun 1, rocket 1 on a direct hit (110 damage at the blast centre). The comment at `constants.ts:125` states the design intent: lethal on purpose.

Notes:
- Spread is a random cone, drawn from the seeded RNG (`step.ts:193`). Shotgun pellet speed also varies by 0.85 to 1.15.
- Recoil pushes the shooter backwards; in the air it also pushes vertically. This is what makes rocket-jumping possible.
- `life` caps range: shotgun pellets vanish after 0.32 s, about 9 units.
- Running dry on a special gun drops you back to a fresh pistol (`step.ts:255-259`). A magazine that empties with reserve left reloads automatically.
- Walking over a pickup with only the pistol takes it automatically; with another gun, E swaps (`step.ts:388-390`). Fixed gun spawns respawn after 12 s; ceiling drops come every 10 s into up to 3 slots (`ARENA.dropEvery`, `dropSlots`).

### Projectiles

`Projectile.kind` (`types.ts:88`) selects behaviour:

| Kind | Behaviour |
|---|---|
| `bullet` | Pistol and SMG. Removed on first hit or when blocked. |
| `pellet` | Shotgun. Same as bullet, shorter life, drawn shorter. |
| `rail` | Pierces fighters (remembers who it hit in `hit[]`) and **ignores furniture**. Stopped only by the room walls. |
| `grenade` | The rocket. Explodes on a fighter, on a wall/floor/ceiling, on furniture, or when `life` runs out. |

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

`knockOut` (`step.ts:119`): sets `respawn = 1.6 s`, emits `ko`, 9 ticks of hitstop. The scorer is whoever last hit the victim (`lastHitBy`); if there is none or it was self-inflicted, the other fighter scores. After `respawn`, `respawnFighter` (`step.ts:99`) puts them at their spawn with full hp, a fresh pistol and 1.4 s of invulnerability (rendered as flicker, `game.ts:315`). `applyHit` refuses to hit anyone who is respawning or invulnerable.

---

## 5. The bot (`src/game/sim/bot.ts`)

`createBot(myId, seed, level)` returns a function `(state) => InputState`. It is called every tick exactly like a human's input source, so the sim cannot tell the difference.

How it behaves like a person instead of a perfect machine:

- **Reaction delay.** It only re-plans when `state.tick % reaction === 0` (`bot.ts:99`). Between plans it keeps its last decision (move direction, whether to fire) and only keeps tracking the target's position.
- **Aim error.** On each plan it draws one error, and aims at the target's chest offset by `error * distance`. The error stays fixed until the next plan, like a shaky hand.
- **Preferred range per gun** (`RANGE`): for example shotgun 1.5 to 4, railgun 9 to 18. Too close, it backs off; too far, it approaches; in range, it sometimes strafes.
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
- **Canvas textures.** Surfaces that need a pattern (sky gradient, skyline facade, floor tiles, the whiteboard with merge-conflict markers, the "FLOOR 42" sign, the glass-crack decal) are drawn with the 2D canvas API at startup and wrapped in `THREE.CanvasTexture` (`arena.ts:9-18`). Decor uses a small seeded RNG so it is identical on every load (`arena.ts:21`).
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

Fixed and far back: a perspective camera (fov 36) placed so the whole office width and height always fit, whatever the window aspect (`updateCamera`, `game.ts:264-274`; distance formula at `:266`). Position eases toward the target with exponential smoothing. Screen shake is a random offset of the look-at point, which decays over time. Shake uses `Math.random`, which is acceptable because it is render-only.

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
| Pick up / swap gun | E |
| Reload | R |
| Toggle aim mode | T |
| Mute | M |
| Rematch after a match | Enter |

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

Browsers refuse to start audio until the user interacts with the page. `createSfx` therefore creates the `AudioContext` lazily: `sfx.unlock()` is called on every keydown (`game.ts:456-457`) and `ensure()` creates or resumes it (`sfx.ts:14`). Sounds requested before the first key press are silently skipped. M mutes by setting master gain to 0; master gain is otherwise 0.5.

Sounds are triggered from sim events in `handleEvent`, so audio and visuals stay in step with the rules without the sim knowing about either.

---

## 9. Testing

Files: `src/game/sim/sim.test.ts` (vitest, Node environment, no DOM). Helpers build a fighting state with pickups and drops disabled (`fighting()`), place fighters, arm them, and run N ticks with scripted input.

What the 22 tests cover:

| Group | Tests |
|---|---|
| Round flow | input is ignored during the countdown, then the fight starts; round ends on time with the KO leader as winner |
| Movement | land on a desk and drop through it with Down; wall-kick off the glass; facing follows aim |
| Guns | pistol hits where aimed and misses when aimed away; furniture blocks bullets; auto-reload; spent special gun falls back to pistol; two pistol hits KO; point-blank shotgun is a one-shot KO; railgun goes through furniture; grenade throws everyone including the shooter; rockets fly straight across the office; walking over a gun with a pistol picks it up; dash dodges bullets |
| Force Push | splats into the glass (checks `WALL_SPLAT_DAMAGE`); reflects bullets at the shooter |
| KOs | KO scores for the shooter and the fighter respawns with a pistol |
| Bot | two bots score within a round; same seeds give the same result |

Not covered: the grazing-shot rule at exact slope boundaries, ceiling-drop spawning, kill-credit edge cases (last hit by a rocket you fired yourself), draws, and everything in `render/`, `input.ts`, `sfx.ts`, `ArenaGame.tsx` and the server.

Run:

```bash
npm run test:run     # one-off run; expected: 22 passed
npm test             # watch mode
npm run type-check   # tsc --noEmit
```

`npm run test:run` was executed while writing this guide: `22 passed`, about 0.3 s. `npm run type-check` was not run for this document.

---

## 10. Online multiplayer (in progress)

### What exists today

| Piece | State |
|---|---|
| `src/game/net/protocol.ts` | exists: input encoding, snapshot encoding, message types |
| `server/index.ts`, `server/DuelRoom.ts` | exist: Colyseus room with input queue, tick loop, snapshots, rematch |
| Browser client (connect, prediction, reconciliation, smoothing) | **not built** (nothing under `src/game/net/` besides `protocol.ts`; the Colyseus SDK is installed but unused) |
| Lobby UI (invite link, quick match) | **not built** |
| Fly.io deployment (`fly.toml`, Dockerfile, CI) | **not built** |
| `npm run server` | script exists (`tsx server/index.ts`); never run for this document |

The server files are being written as this guide is written, so details below can change. Treat this section as the design plus what the files say today.

### Design

Stack: Colyseus 0.18 (a Node.js game-server framework: rooms, matchmaking, WebSocket transport) hosted on Fly.io.

```text
  Browser A                         Server (one DuelRoom)                  Browser B
  ---------                         ---------------------                  ---------
  read keys
  send [tick, bits, aimX, aimY] -->  queue per player
  predict locally with step()        every 1/60 s:
                                       take next queued input per player
                                       step(game, [inputA, inputB])   <- same sim/step.ts
                                     every 2nd tick:
  <-- snapshot {ack, inputs, state} -- broadcast full GameState         --> snapshot
  reconcile
```

1. **Authoritative server.** The server runs the same `step` at 60 Hz (`setSimulationInterval(..., 1000 / 60)`, `DuelRoom.ts:54`) and decides every hit, KO and score. Clients send inputs, never positions or damage. A modified client can lie about its keys but not about the outcome.
2. **Compact inputs.** `WireInput = [clientTick, buttonBitmask, aimX, aimY]` (`protocol.ts:13`). Nine buttons map to bits 0 to 8; aim is rounded to 2 decimals.
3. **Input queue per player.** The server keeps a queue per seat, sorted by client tick, ignores ticks it has already applied, and accepts at most 10 inputs per message (`DuelRoom.ts:37-45`). Each server tick applies one queued input.
4. **Backlog folding.** If more than 4 inputs are queued, the oldest are merged into the next (`DuelRoom.ts:110-113`, `mergeWire`): held buttons and aim come from the newer one, but one-shot presses (up, down, dash, fire, pickup, reload, push) from either are kept. This catches up after a lag spike without dropping a jump or dash. With nothing queued, held movement continues but one-shot presses are cleared so a lone jump does not repeat.
5. **Snapshots about 30 times a second.** Every `SNAPSHOT_EVERY_TICKS = 2` ticks the server broadcasts the full `GameState` (`DuelRoom.ts:126-133`) as JSON. `Infinity` (the pistol's reserve, empty drop slots) is encoded as a marker string because JSON cannot carry it (`protocol.ts:57-62`). Measured size of an idle snapshot (tick 400, no projectiles): 2,643 bytes, so roughly 80 KB/s per client at 30 snapshots/s. This is with `events` emptied.
6. **Per-player ack.** Each snapshot carries `ack: [slotA, slotB]`, the last client tick the server applied for each player, plus the inputs it used (`protocol.ts:45-51`).
7. **Client prediction.** The client applies its own inputs immediately with the same `step`, so its own character responds without waiting for a round trip.
8. **Reconciliation.** On each snapshot the client replaces its state with the server's, then re-applies every input with a tick greater than the ack (the ones the server has not seen yet). If its prediction was right the result equals what it had; if not, it snaps to the truth plus the unacknowledged inputs. This works only because `step` is deterministic and its entire memory is in `GameState`.
9. **Smoothing.** Corrections are not shown as teleports; the displayed position eases toward the corrected one. (Design only; not written.)
10. **Rooms.** `DuelRoom` has `maxClients = 2`. A private room (`options.private`, `DuelRoom.ts:35`) is hidden from matchmaking and joined by room id, which an invite link will carry. Quick match is the default public room (`ROOM_NAME = 'duel'`). When the second player joins the room locks and the game starts (`DuelRoom.ts:68-71`). Rematch: after `phase === 'over'` both clients send `rematch`; when both have, `startGame` runs again.

### Things the current files do not do (read from the code)

- The client does not exist, so none of items 7 to 9 is testable yet.
- Snapshots are sent with `events: []` (`DuelRoom.ts:131`). Sounds and particles come from events, so a client that only applies snapshots would be silent. The client has to produce events by running `step` itself during prediction and replay, and avoid double-playing effects when it replays. This is an open design point.
- When a player leaves, the room discards the game and broadcasts `left` (`DuelRoom.ts:76-83`). There is no reconnect window and no forfeit result.
- No rate limiting beyond the 10-inputs-per-message cap, no authentication, and no check that a client's tick numbers are plausible.
- Hitstop freezes `step` for up to 9 ticks. How the client's prediction and the server's tick counter stay aligned during hitstop has not been designed or tested.
- `server/` imports `@colyseus/core` and `@colyseus/ws-transport`, which are installed as dependencies of `colyseus` but not listed in `package.json` directly.
- No tests cover `protocol.ts` or `DuelRoom.ts`.

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
| Own visual theme: Bungee for display, Chakra Petch for UI, navy with git-diff colours (HEAD green, incoming red, conflict yellow) | A distinct identity; `src/app/layout.tsx`, `palette.ts`, `globals.css`. |
| Hosting plan: Cloudflare Pages for the static pages (free); Fly.io only for multiplayer servers, with autostop (notes) | Static pages cost nothing; a server only runs while someone plays. Not set up yet. |
| Studio "Merge Conflict" at mergeconflict.gg, with games on subdomains (notes) | One brand, one game per subdomain. Not set up yet. |

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

**Code and testing**
- Test coverage is the simulation only. Rendering, input, audio, the React shell and the server have no automated tests. `type-check` exists but there is no CI configuration in the repo.
- Magic numbers inside `step.ts` (stun thresholds, the 0.15 graze slope, the 0.6 s push-flag time) are not in `constants.ts`.
- The README badge says 22 passing tests, matching today. The commit message for `3c8d987` says 26, from before the CTO removal.

**Before going public**
- `CLAUDE.md` lists work still to do on the base template: remove the private `@frontend/ui-kit` dependency and every NAIC trace. This guide did not check whether that is finished.

**Next steps (in order of dependency)**
1. Finish the browser net client: connect, send inputs, run the same `step` for prediction, apply snapshots with ack replay, smooth corrections.
2. Decide how effects are produced on the client without snapshot events.
3. Lobby UI: private invite link, quick match, rematch button wired to the `rematch` message.
4. Tests for `protocol.ts` (encode/decode round trip, `Infinity`) and for `DuelRoom` queue folding.
5. A simulation test that replays a recorded input log on two instances of `step` and compares full state, to guard determinism.
6. Fly.io config with autostop; Cloudflare Pages for the web app; domain setup.
