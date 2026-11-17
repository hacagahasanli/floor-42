# Merge Conflict

A fast two-player office fighting game set on floor 42. Two developers, one file, settle it with whatever is on the desk.

> Status: playable prototype. Single player against a bot (`?bot=easy|normal|hard`), desktop keyboard, auto-aim, sound on (M mutes).

A side-on office shootout across three floors of furniture: desks and the kitchen counter, hanging walkways, and a mezzanine under the ceiling.

**Two hits and you're out** (a rocket or a rail: one), so cover and timing matter more than trading shots face to face.

**Keep it quiet.** Every shot, blast and body through the glass fills the office noise meter. When it's full the CTO gets up from the glass office, walks out and watches for a few seconds. Whoever fires or shoves while the CTO is watching loses the round on the spot.

## Play locally

```bash
npm install
npm run dev
```

- `/characters`: four fighters on turntables, pick yours and an opponent
- `/arena`: the fight (`?p1=legacy&p2=standup&bot=hard`, add `&demo` for bot vs bot)

## Controls

Keyboard only by default: your gun aims at the opponent by itself. Press **T** (or the button in the corner) to switch to mouse aim; the choice is remembered.

| Key | Action |
| --- | --- |
| A / D | move |
| W | jump, again in the air, wall-kick off the glass |
| Space | shoot (hold for automatic fire); left click too in mouse mode |
| S | drop through furniture, fast fall |
| Shift | dash: you can't be hit while it lasts |
| Q | Force Push: shoves them, sends their bullets back, splats them into the glass |
| E | swap for the gun you are standing on (with only a pistol you pick guns up by walking over them) |
| T / M | aim mode / mute |

Reloading is automatic (R reloads early). Enter starts a rematch.

## Guns

Everyone starts with the pistol (endless ammo). Walk over a gold ring to grab something better; more drops from the ceiling vents. When a special gun runs dry you are back to the pistol.

| Gun | What it does |
| --- | --- |
| Pistol | accurate, 8 rounds, never runs out, two hits to KO |
| SMG | fast and spread out |
| Shotgun | six pellets, a one-shot KO up close, kicks you back |
| Railgun | one-shot KO, goes through furniture and through people |
| Launcher | one-shot KO near the blast; it throws everyone, you too (rocket jumps) |

Desks, walkways and cabinets stop bullets, so they are cover.

## How it is built

- `src/game/sim`: a pure, deterministic TypeScript simulation at a fixed 60 Hz. No DOM, no Three.js, so the game server can run the same code later (the server will be authoritative).
- `src/game/render`: Three.js view: low-poly characters with procedural animation, the office, pooled particles, interpolation between ticks.
- `src/components`, `src/app`: Next.js pages and the HUD.

```bash
npm run test:run   # simulation tests
npm run type-check
```
