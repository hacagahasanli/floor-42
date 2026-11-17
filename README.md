# Merge Conflict

A fast two-player office fighting game set on floor 42. Two developers, one file, settle it with whatever is on the desk.

> Status: clickable prototype. Single player against a bot, desktop keyboard only.

## Play locally

```bash
npm install
npm run dev
```

- `/characters`: four character concepts on turntables, pick yours and an opponent
- `/arena`: the fight (`?p1=legacy&p2=standup`, add `&demo` for bot vs bot)

## Controls

| Key | Action |
| --- | --- |
| A / D | move |
| W / Space | jump, jump again in the air, wall-kick off the glass |
| S | drop through a desk, fast fall, guard while holding a monitor |
| Shift | dash (one in the air) |
| J | attack: jab, or the held weapon's move |
| K | pick up / throw (hold W to lob) |
| L | Force Push: a shove with a 3 s cooldown; into the glass it splats |

## Weapons in the prototype

- **Keyboard**: two hands, a long overhead sweep. Swinging while running adds knockback.
- **Hot coffee**: one hand. Splash up close or throw it; the burn slows the target.
- **Monitor**: two hands. Absorbs most frontal damage, bashes hard, S to guard fully.

## How it is built

- `src/game/sim`: a pure, deterministic TypeScript simulation at a fixed 60 Hz. No DOM, no Three.js, so the game server can run the same code later (the server will be authoritative).
- `src/game/render`: Three.js view: low-poly characters with procedural animation, the office, pooled particles, interpolation between ticks.
- `src/components`, `src/app`: Next.js pages and the HUD.

```bash
npm run test:run   # simulation tests
npm run type-check
```
