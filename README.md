<div align="center">

# Floor 42

### Code review got personal. Settle it on floor 42.

A game by **Merge Conflict**, the studio where coworkers settle their conflicts.

**A fast side-on office shootout in the browser. Two hits and you're out.**<br>
Your gun **aims itself**, so the whole game is moving, jumping and timing your shots.
Desks, walkways and cabinets are **cover**. A **Force Push** shoves your rival into the glass and sends their bullets back at them.
A rocket crosses the whole office in a second.

<img alt="Two bots fighting across the office on floor 42: walkways, desks, a kitchen, guns on the mezzanine" src="docs/demo.gif" width="100%">

</div>

## What you get

- **Two hits and you're out.** Pistol: two shots. Rocket, railgun, point-blank shotgun: one. Standing still and trading shots loses; cover, jumps and dashes win.
- **Auto-aim by default.** Space shoots, the gun tracks your rival. Prefer aiming yourself? Press **T** for mouse aim (the choice is remembered).
- **Five guns on the floor.** Everyone starts with a pistol that never runs dry. There is one gun per floor at a time, and it shows up at a random spot as a random kind. Walk over a gold ring for an SMG, a shotgun, a railgun that goes through furniture and people, or a rocket launcher whose blast throws you too (rocket jumps). More drops from the ceiling vents.
- **Force Push.** A shove on a short cooldown. It knocks your rival back, splats them into the glass walls (the glass cracks) and **reflects incoming bullets** back at the shooter.
- **An office you fight across.** Three levels: desks, a meeting table and a kitchen on the floor, hanging walkways and a cable tray in the middle, a mezzanine under the ceiling. Wall-kick off the glass, double jump, drop through furniture.
- **Four original fighters.** Hotfix (tall, hood up, headset on), Legacy (wide, bearded, hardest to shove), Standup (small, fastest, two air jumps) and Intern (beanie, a backpack bigger than their back).
- **Sound without a single audio file.** Every gunshot, blast and crack is synthesised live with WebAudio.
- **A bot with three levels.** `easy`, `normal`, `hard`: reaction time, aim error and how often it dodges.

<div align="center">

![Three.js](https://img.shields.io/badge/Three.js-r187-000)
![Next.js](https://img.shields.io/badge/Next.js-16-111)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Tests](https://img.shields.io/badge/tests-37%20passing-2ea44f)
![60 fps](https://img.shields.io/badge/target-60%20fps-ffd23f)

[Play locally](#play-locally) · [Controls](#controls) · [Guns](#guns) · [How it works](#how-it-works) · [Status](#status)

</div>

<table>
  <tr>
    <td><img alt="Title screen" src="docs/home.png"></td>
    <td><img alt="Character select with four fighters on turntables" src="docs/characters.png"></td>
  </tr>
</table>

## Play locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

- `/play`: **online 1v1**. *Invite a friend* gives you a link to send; *Quick match* pairs you with whoever is waiting. Rematch with Enter.
- `/characters`: practice against a bot (`/arena?p1=legacy&p2=standup&bot=hard`, add `&demo` to watch bot against bot)

The browser connects to the game server on Fly.io by default. To run your own server locally:

```bash
npm run server                                        # Colyseus on ws://localhost:2567
NEXT_PUBLIC_GAME_SERVER=ws://localhost:2567 npm run dev
```

## Controls

Keyboard only. Your gun aims at the opponent by itself.

| Key | Action |
| --- | --- |
| A / D | move |
| W | jump, again in the air, wall-kick off the glass |
| Space | shoot (hold for automatic fire) |
| S | drop through furniture, fast fall |
| Shift | dash: you can't be hit while it lasts |
| Q | Force Push |
| R / E | swap for the gun you're standing on (an **R · SWAP** sign shows over it) |
| T | auto-aim / mouse aim (in mouse mode left click shoots too) |
| M | mute |

Reloading is automatic (R reloads early). Enter starts a rematch.

**Esc twice** asks to pause: online your rival has to press Esc twice too, then the game stops for both of you. The same menu has *Exit match*.
After a KO you are back in **3 seconds**, at a random spot far from your rival, and while you wait you can pick who you come back as (keys 1–4). At the end of an online match you pick your next fighter right in the result screen.

If your rival's connection drops, the game holds for 20 seconds while they reconnect. If they leave, you can keep the room open for them (up to three minutes, asked minute by minute) and they come back with the same link.

## Guns

| Gun | What it does | How often |
| --- | --- | --- |
| Pistol | 8 rounds, never runs out; two hits up close, more from across the office | always |
| SMG | fast, three hits up close, weaker at range | common |
| Shotgun | six pellets, a one-shot KO point-blank, falls off fast | common |
| Uzi | sprays very fast, every round does little | sometimes |
| Sniper rail | one-shot KO at any range, goes through furniture and people; 6 shots | top floor |
| Rockets | fly straight, one-shot KO near the blast, throw everyone around; 6 shots | top floor |
| Bomb | drops from the ceiling vents; you lob it with Space and get your gun back; lethal right next to it | now and then |

A shot coming down onto or up into furniture is stopped. A shot skimming along a desk top grazes past.

## How it works

```
src/game/sim      pure TypeScript simulation, fixed 60 Hz, deterministic, no DOM
src/game/render   Three.js view: low-poly characters, the office, guns, particles
src/game/sfx.ts   WebAudio sound synthesis
src/game/net      online play: wire protocol, client prediction and reconciliation
server            Colyseus game server (runs the same simulation, decides every hit)
src/components    Next.js pages, the HUD and the online lobby
```

Full technical write-up: [docs/TECHNICAL.md](docs/TECHNICAL.md).

- **The rules don't know about the screen.** `step(state, inputs)` advances the game by one tick. The renderer only reads the state. The same `step` will run on the game server, which will decide every hit, so nobody can cheat from the browser.
- **Fixed timestep, smooth picture.** Logic runs at exactly 60 ticks a second on any monitor. Frames in between are interpolated.
- **Deterministic.** Spread and ceiling drops come from a seeded random number generator stored in the state, so the same inputs always replay the same match. A test checks it.
- **Everything is code.** Characters, guns and the office are built from primitives, animation is procedural, the skyline and the whiteboard are drawn into canvas textures. No model files, no image assets, no audio files.

```bash
npm run test:run    # simulation tests: guns, cover, rockets, Force Push, KOs, bot determinism
npm run type-check
```

## Status

| | |
| --- | --- |
| Single player against a bot, desktop keyboard | ✅ playable |
| Four characters, five guns, one arena | ✅ |
| Online 1v1: invite link, quick match, rematch (Colyseus on Fly.io, server-authoritative, client prediction) | ✅ |
| Public deploy of the pages | next (Cloudflare Pages, mc.mergeconflict.gg) |
| Mobile and touch | not planned yet |
