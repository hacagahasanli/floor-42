# Smart bot: diagnosis, behaviours, architecture, difficulty, proof

Systems design, 2026-11-28. Owner request (Reis): "Our bots should be smarter — not just run at the player, they should play in a more intelligent way."

Where things are:
- This spec: `docs/systems/smart-bot.md`. It is not in `docs/collab/CREATIVE/` because that folder belongs to the Creative Director (HANDOFF "Rules that bit us"), and bot behaviour and difficulty are systems design.
- Working prototype (not shipped code): `tools/balance/smartbot/`. It has `smartBot.ts`, `nav.ts`, `players.ts` (the scripted test players), the `vs.ts` runner, `navCheck.ts`, `detCheck.ts` and `why.ts`.
- Nothing in `src/` was edited. Every number below comes from headless matches on the shipped sim (`src/game/sim/step.ts`) with traits on, the way offline play ships.

---

## 0. Problems first

1. **The scripted players have auto-aim, and so do real keyboard players by default.** In `game.ts` `autoAim`, the gun follows the rival's chest with zero error, and Space only pulls the trigger. Today's bot aims with an error of 0.12 rad (normal), which is about ±1.2 m at 10 m. So the newcomer has better aim than the bot. The bot can only win on positioning, guns and reflexes, and today it has almost none of those.
2. **Power guns decide matches, and today's bot almost never takes one.** Measured: the old normal bot took **0.1** power guns per match. The new bot takes **2.0** against the masher. That one change was worth about +25 points of win rate (§6.3). The old bot only looks for guns while it holds the pistol, only on its own level (±3.5 m), and only within 9 m. The lookouts and the roof hold the rail and the rockets, so it never got them.
3. **The 46-54 % roster band moves when the bot gets smarter.** With the smart bot, ZUZU wins **56.3 %** against the field at both normal and hard on OFFSITE (800 matches per cell). With the old bot she was at 52.9 %. A bot that actually uses platforms gets more out of her two air jumps, and humans who climb will get the same. **ZUZU at 82 HP** (inside the 82-88 safe range in `traits-balance.md`) brings normal and hard to a worst cell of 4.5 / 4.2 points off 50 (§7). It does not fix easy, where ZUZU is *weak* (44.5 %, 40.8 % at 82) and ORMO strong (56 %). That number belongs to the traits owner, and `traits-balance.md` is in CD space, so this is a recommendation, not an edit.
4. **The office arena is weaker than OFFSITE.** On OFFSITE the platform routes reach 110/110 surface pairs for every fighter. On the office they reach 92-99.5 %; the failures are mostly the tops of the small boxes (rack, metal boxes) and the beam. Smart normal beats the masher 69 % there (the target is 70) and the decent player only 29 %. **Online always plays the office, and the server bot on `online-bots` will be this bot.** So office routes are a must-fix before online ships (§8, step 3).
5. **I disagree with "line-of-sight vision instead of 360° instant vision", once.** The camera is fixed and shows the whole arena (`game.ts` line 151: `camera.position.set(0, A.ceiling / 2, 40)`), so a human always sees where the rival is. A bot that loses track of you behind a crate would be *dumber* than the human, not fairer. What makes a bot feel unfair here is reaction speed and aim, not knowledge. My perception model therefore keeps full position knowledge. Line of sight decides *shooting* and *cover*. Reaction time, an acquire delay and aim that tightens over time are where the bot is human. Hearing gunfire adds nothing when everything is on screen, so I dropped it.
6. **The test players are scripts, not people.** The "decent player" is my stand-in for a decent human [Assumption]. It has perfect auto-aim, decides every 200 ms and has no tactics beyond §5.2. The real check is a 5-person session (§9). Until then, "hard beats a decent human more often than not" is proven only against that script.
7. **The bot costs very little on average, but one decision can spike.** A bot call averages 16.5 µs, p99 0.41 ms, max 3.1 ms (one decision that scores about 150 standing spots). That is fine on the client. On the server, slice the spot scoring across ticks (§8, step 5).

---

## 1. Diagnosis of today's bot (`src/game/sim/bot.ts`, 193 lines)

What it does each think (every 16/10/6 ticks for easy/normal/hard):
1. If it holds only the pistol, it walks toward the nearest gun on its own level (within 3.5 m vertically and 9 m horizontally). It never targets a gun on a higher level on purpose. Easy skips rail and rockets.
2. Otherwise it runs **one rule on horizontal distance**: closer than the gun's band, step back; farther, step in 70 % of the time; inside the band, a random left/right/stand.
3. Coin flips add the rest: push if within 2.4 m (50 %); dash if the rival fired in the last 0.2 s (5/15/30 %); jump if the rival is above (60 %); drop if the rival is below (60 %); and a 6 % random jump.
4. **If it cannot see you, it walks straight at you** (`if (!visibleAim(...)) move = toFoe`).
5. Every tick it aims at your chest with a fixed per-decision error, and fires while it can see you (a 45/70/90 % trigger chance per decision).

Why it reads as "runs at you":
- Its only notion of space is **horizontal distance on one axis**. It has no idea of levels, routes, cover or high ground. Behind cover it closes in by rule (4). With a close-range gun (shotgun band 1.5-3.5 m, Uzi 2-5 m) it walks straight at you.
- The vertical play is random jumping. You see it bounce under a walkway instead of climbing to you.
- It never uses the arena's purpose: power guns up top, boardwalks that block shots from below, crates as cover.
- It has no state across decisions: no goal, no retreat, no "I'm hurt", and no plan to repeat or vary. Every match looks the same.

Baseline numbers are in §6.1. In short: **the masher beats today's normal bot 68 % of the time on OFFSITE**. That matches the playtest (2 of 3).

---

## 2. Target behaviours a player can SEE (with a one-line test each)

Each test is a scripted scene on the real sim. "≥ x of N seeds" means a deterministic test over N seeds. Status: **P** = built in the prototype and measured, **S** = specified only.

| # | Behaviour | What the player sees | One-line test | Status |
|---|---|---|---|---|
| 2.1 | Range keeping by gun | Shotgun/Uzi bot closes to 1-5 m; pistol/SMG holds 4-13 m; rail/rockets hold 6-24 m | Rival standing still at x = 0: mean distance over 10 s is within the gun's band (BAND table §3.4) in ≥ 8 of 10 seeds, for each gun | P |
| 2.2 | Cover and breaking line of sight | Hurt or facing a rail, it stands where a crate, boardwalk or boulder blocks your shots | Rival with a rail on the left lookout: the bot's mean exposure (share of legs/chest/head the rival can hit) is < 0.5 over 10 s | P |
| 2.3 | High ground | With pistol/SMG/rail/rockets it climbs to a boardwalk or lookout above you | Rival on the floor at x = 0, bot with pistol: after 8 s the bot stands ≥ 3.5 m above the rival in ≥ 7 of 10 seeds | P |
| 2.4 | Better guns and the power gun first | It climbs to the lookout or roof for rail or rockets, and swaps a pistol for an SMG on the way | OFFSITE, power gun up at 10 s, rival far: the bot holds it by 18 s in ≥ 7 of 10 seeds (normal/hard). Measured 1.6-2.2 power pickups per match vs 0.1 today | P |
| 2.5 | Retreat and heal | Below ~42 % HP (ORMO 60 %) it backs off behind cover, stops, heals, then returns | Bot at 30 % HP, rival at full HP 8 m away: within 3 s it is at a spot with exposure 0, and its HP rises (regen) in ≥ 8 of 10 seeds | P |
| 2.6 | Dodging rockets/bombs (dash or jump) | A rocket comes and it dashes out of the blast or hops over | A rocket fired at the bot from 10 m: the bot takes no rocket damage in ≥ 60 % (normal) / ≥ 80 % (hard) of 50 seeds | P |
| 2.7a | Force Push for the wall splat | Rival near a cliff/glass wall within 3 m: it shoves them into it | Rival 1.5 m from the bot and 2 m from the wall: push within 0.5 s in ≥ 50 % (normal) / ≥ 80 % (hard) of seeds | P |
| 2.7b | Force Push against incoming shots | A bullet or rocket in front, within reach: it pushes it back | 50 rockets fired at the bot from 6 m: deflect rate ≈ `deflect` (0.2 / 0.4) ±10 pts | P |
| 2.8 | Rail awareness | It does not stand in a rail holder's open line; it settles its own rail aim before firing | Bot holding a rail: no rail shot in the first `acquire` + 0.25 s after the rival appears | P |
| 2.9 | Flanking via jumps and drops | It changes level to get a shot instead of trading through a plank | Rival under a boardwalk (shots blocked from above): within 3 s the bot has a clear shot (`canHitFrom`) in ≥ 8 of 10 seeds | P (comes out of the spot scoring) |
| 2.10a | BRIX uses Leapfrog | Up close and level, she jumps over you and dashes away on the refreshed dash | 100 normal matches with BRIX: ≥ 1.0 Leapfrog triggers per match | **P but FAILS: 0.26 (normal) / 0.18 (hard) per BRIX match** (old bot 0.06). Raising the chance 0.08 → 0.5 changed nothing (0.22): she is rarely within 2.8 m and level. Fix (S): when BRIX holds a close gun or her dash is ready, add a `leap` goal that walks to 3-5 m on the rival's level, then jumps |
| 2.10b | ZUZU presses during Sugar Rush | After being hit she runs at you instead of away | During `trait.rush > 0` the bot's goal is `press` in ≥ 70 % of rush ticks | P |
| 2.10c | TAVO sustained fire | He prefers SMG/Uzi/shotgun and reloads later (Packed Extra) | TAVO's reload threshold is 25 % of the magazine vs 45 % for others; SMG/Uzi pickups score +0.35 | P |
| 2.10d | ORMO's Tea Break | He falls back earlier (60 % HP) and waits out his 3 s | ORMO retreats at a higher HP than the others; telemetry tea heal per match ≥ the old bot's | P |
| 2.11 | Not standing still in the open | On arrival it strafes ±1.2 m and hops (jink); it holds still only when fully hidden | Rival alive: the bot's longest stretch inside a 1 m × 0.6 m box is < 2 s unless exposure = 0 | P |
| 2.12 | Baits/feints | Mid-range, it steps toward you for 0.33 s, then goes back to its spot | Feint rate per minute ≈ `feint` × decisions per minute (normal ≈ 2-4/min) | P (simple) |
| 2.13 | Varied play | Two matches with the same fighters look different: preferred range, height taste and strafe rhythm differ | Same characters, 2 seeds: mean distance differs by ≥ 1 m or mean height by ≥ 1 m | P (persona per seed) |
| 2.14 | Reads the rival | It presses when you are reloading or under 35 % HP | Rival reloading: the bot's band shifts 1 m closer (unit test on `decide`) | P |
| 2.15 | Human imperfections | Reaction time, an acquire delay after you reappear, aim that starts loose and tightens while you stay in view, the wrong pick now and then | Bot shot spread vs a static target: the error at 0 s is ≥ 2× the error at 3 s (unit test on the error curve) | P |
| 2.16 | Not stuck | It never sits under a camper for 8 s (existing A7 test) | `botOffsite.test.ts` passes unchanged with the new bot (plus an office version) | P for OFFSITE (`navCheck` 110/110 per fighter), S for the office |

---

## 3. Architecture

### 3.1 Shape: utility AI over goals, with reflexes underneath

```
every tick:  perceive (sight with memory, threats)  ->  reflexes (dodge, deflect, splat, leapfrog, duck, bomb)
every think: decide = utility over goals {engage spot, gun, retreat spot, press, idle}  ->  goal (surface, x)
every tick:  path (nav graph of surfaces, Dijkstra, ~25 nodes)  ->  left/right/up/down  ->  micro-strafe/jink on arrival
             aim (lead x level, error curve)  ->  trigger discipline per gun
```

Why utility and not a behaviour tree: every top-level choice here is a **graded trade-off** (how far, how high, how hidden, how far to walk, which gun), and the reflexes are flat "if threat then act" rules. A BT would end up as one big utility node anyway. I used hysteresis (`keep` +0.08 for the current spot), a stuck guard (no progress for 2 s: ban that surface for 4 s and re-decide) and a separate reflex cooldown (18 ticks) so the bot does not flicker. That follows the `ai-behavior-trees-utility-ai` and `game-ai` skills.

### 3.2 Perception model (honest, and deterministic)

| Fact | Source | Human analogue |
|---|---|---|
| Rival position, velocity, HP, gun, reloading | the state (whole arena on screen) | the player sees all of it |
| `spot` = point it can hit now | `visibleAim` (shots through furniture are cut exactly as the sim cuts them) | where your shots would land |
| `seenSince` (engagement clock) | first tick `spot` exists; **kept through blinks < 30 ticks (0.5 s)**, reset after longer cover | "I'm tracking him" |
| Threats | projectiles whose closest approach is < 1.0 m (bullets) or < 2.2 m (rockets/bombs) within 0.5 s | you see the rocket coming |
| My exposure at a spot | rival muzzle → my legs/chest/head (`clearShot`) | "am I behind the crate" |

There is no hearing, because everything is visible (§0.5). The bot reads `GameState` and never writes it (`detCheck`: 0 of 48 sampled matches changed the state). All randomness comes from three seeded `mulberry32` streams (decisions, aim, reflexes), so a match replays exactly from its seeds (`detCheck`: 0/48 mismatches). The bot is an input source, so the sim's own determinism is untouched. Online, the server bot's inputs are authoritative like a human's.

### 3.3 Considerations and weights (data, from `smartBot.ts`)

Spot scoring runs for every standing spot (one per metre on every surface, minus box interiors), each think:

| Consideration | Formula | Weight | Reason |
|---|---|---|---|
| Range fit | 1 inside [near, far]; falls off to 0 over 4 m inside / 8 m outside | 0.35 | Each gun has a job (`docs/BALANCE.md`) |
| Can hit him from there | `clearShot` to chest or head | 0.30 | A spot you can't shoot from is only a route |
| Cover | 1 − exposure (legs/chest/head) | 0.12 (0.25 if he holds a rail) | A rail one-shots: hide from it |
| High ground (ranged guns, normal/hard) | clamp((spot.y − his y)/4, −1, 1) × persona.high (0.6-1.4) | 0.18 | Planks stop shots from below (`furnitureCut`) |
| Wall danger | −0.25 if within 2.5 m of a wall and 4 m of him | — | Avoid being splatted |
| Travel | (|dx| + 2|dy|)/20 | −0.5 | Don't cross the map for a 1 % better spot |
| Stay | +0.08 if within 1.1 m of the current goal | — | Hysteresis |

Band shift: near/far move toward him by `aggression` (per level, plus ±1.2 m persona), +1.5 m when he is under 40 % HP, and +1 m while he reloads.

Goal scores (argmax; with probability `mistake` it takes the 2nd best):

| Goal | Score | Notes |
|---|---|---|
| engage | 0.45 + 0.3 × best spot score + noise | default |
| gun | 0.25 + 0.28 × (value gain) + 0.3 if power − 0.35 × travel − 0.15 if he is closer to it + noise | gun value: pistol 1, Uzi 2, shotgun 2.2, SMG 2.4, rail/rockets 4; TAVO +0.35 on SMG/Uzi/shotgun; own gun × (0.4 + 0.6 × ammo share); only if gain > 0.3 |
| retreat | 0.55 + 0.5 × (1 − hp/th) when hp < th (th 0.42; ORMO 0.60); holds at 0.62 until 90 % HP; −0.3 when holding a power gun | normal/hard only |
| press | 0.5 + 0.35 (he < 35 % and I > 50 %) + 0.2 (he reloads) + 0.4 (ZUZU rush) + 0.15 (shotgun/Uzi) | goal = his surface, 1.2 m on my side |
| idle | 0.3 while he is down | drift to the middle, reload |

Reflexes (per tick, once per threat, reflex cooldown 18 ticks):

| Reflex | Trigger | Chance (easy/normal/hard) |
|---|---|---|
| Deflect (Force Push) | threat in front within reach + 2.5 m, push ready | 0 / 0.2 / 0.4 |
| Dash away | rocket/bomb threat (or 40 % of bullet threats), dash ready | 0.1 / 0.45 / 0.7 |
| Hop | rocket/bomb threat, no dash | same as dash |
| Duck | bullet threat on the ground | 0.1 / 0.3 / 0.45 |
| Wall splat | he is within reach + 0.6 m and level, not invulnerable | 0.15 / 0.5 / 0.8 with a wall < 5 m behind him; × 0.35 otherwise |
| Leapfrog (BRIX) | within 2.8 m, level, grounded | 0.03 / 0.08 / 0.14 per check |
| Bomb lob | 4-11 m, he is not above | 0.05 per tick |

Trigger discipline: shotgun < 8.5 m; Uzi < 13 m; rockets > 3.2 m (self-splash), aimed at the feet of a grounded rival; rail only after `acquire` + 0.25 s of continuous sight. Reload only when he is down or hidden for 20+ ticks and the magazine is under 45 % (TAVO 25 %). Easy never reloads early.

### 3.4 Range bands (m)

| Gun | Pistol | SMG | Uzi | Shotgun | Rail | Rockets |
|---|---|---|---|---|---|---|
| near-far | 6-13 | 4-10 | 1.5-5 | 0.8-3.2 | 10-24 | 6-14 |
| Reason (from `GUNS`) | falloff from 2.5 m, best accuracy | falloff from 6 m | falloff 3-10 m, spread 0.15 | pellets live 0.32 s (≈ 9 m), falloff from 2 m | no falloff, instant | splash 2.8 m, speed 14 (dodgeable up close) |

### 3.5 Navigation

There is a surface graph per (arena, fighter). Its nodes are the floor and every platform top. Edges are analytic: rise ≤ jump + air jumps − 0.45 m (BRIX 5.3, ORMO 4.4, ZUZU 8.3, TAVO 5.1 m), with a sideways gap ≤ 2.2 m up or 3 m down. Take-off columns are clear of desk tops and box undersides. Boxes that stand on a plank can be climbed only from that plank. Routing is Dijkstra over about 25 nodes on every tick (cheap). On a hop the bot air-jumps near the apex until its feet clear the target top, then slides on. It drops through planks with Down, or walks off an edge toward the goal. `navCheck.ts`: OFFSITE 110/110 surface pairs for all four fighters (mean 1.9-2.1 s per route); office 385-418 of 420.

---

## 4. Difficulty table (data; values in the prototype `LEVELS`)

| Parameter | Unit | Easy | Normal | Hard | Reason | Safe range |
|---|---|---|---|---|---|---|
| think | ticks (+ jitter) | 20 (+0-8) | 12 (+0-6) | 8 (+0-4) | Decision rhythm 300 / 200 / 130 ms ≈ human choice reaction [Assumption] | 6-24 |
| acquire | ticks | 24 | 15 | 10 | First shot 400 / 250 / 170 ms after you reappear | 8-30 |
| aim0 → aimMin | rad | 0.24 → 0.12 | 0.16 → 0.05 | 0.09 → 0.02 | The aim tightens while you stay in view; a newcomer's auto-aim is 0 | see §6.4 |
| aimHalfLife | s | 2.5 | 1.5 | 1.0 | How fast it "settles" | 0.8-3 |
| lead | share | 0 | 0.3 | 0.4 | Leading a target. **0.9 was worse** (overshoots the A/D masher): 85 % vs 69 % (hard vs masher) | 0-0.5 |
| trigger | chance per decision | 0.7 | 0.85 | 0.97 | Holds fire sometimes, like a person | 0.5-1 |
| jink | chance per decision | 0.1 | 0.35 | 0.5 | Hops while trading shots | 0-0.6 |
| dodge / deflect / duck | chance | 0.1 / 0 / 0.1 | 0.45 / 0.2 / 0.3 | 0.7 / 0.4 / 0.45 | Reflex quality | — |
| splat / leapfrog | chance | 0.15 / 0.03 | 0.5 / 0.08 | 0.8 / 0.14 | Uses the kit | — |
| power guns | on/off | **off** | on | on | Easy never goes for the one-shot guns (playtest: it closed matches with rockets) | — |
| high ground / retreat | on/off | off / off | on / on | on / on | Easy fights in the open and stays | — |
| feint | chance per decision | 0 | 0.08 | 0.12 | × persona 0.5-1.5 | 0-0.2 |
| noise / mistake | score jitter / 2nd-best chance | 0.3 / 0.2 | 0.15 / 0.08 | 0.08 / 0.03 | Decision quality | — |
| aggression | m toward him | −1 | 0 | +0.5 | Plus the persona's ±1.2 | −2 to +2 |
| gun grace (kept) | s | 15 | 0 | 0 | `EASY_GUN_GRACE_TICKS`, unchanged | — |

The first match is always easy (`firstMatch.ts botLevelFor`), and that stays.

---

## 5. Acceptance: scripted test players and target numbers

### 5.1 Players (`tools/balance/smartbot/players.ts`), all on auto-aim like a default keyboard player
- **masher**: the playtest masher. Alternates A/D every ~1.1 s, taps fire every 140 ms (held 4 of 8 ticks) and jumps every ~0.4 s. It never presses Pick up (walking onto a gun with the pistol takes it).
- **strafer**: holds fire whenever it has a shot, strafes at 5-12 m, follows the rival up and down at random, hops boxes and reloads when the rival is down.
- **decent**: decides every 200 ms. It walks real platform routes to better guns and the power gun, keeps gun range bands, dashes out of rockets, pushes in reach, lobs bombs, falls back below 45 % HP and has perfect auto-aim.

### 5.2 Targets (per arena, n ≥ 300 matches per row, both side orders, random character pairs)

| Level | vs masher | vs strafer | vs decent | Also |
|---|---|---|---|---|
| easy | bot wins ≤ 10 % | ≤ 15 % | ≤ 5 % | bot still scores ≥ 1.5 KOs per match vs the masher (a real fight, not a dummy) |
| normal | **bot wins ≥ 70 %** (playtest target) | 55-80 % | 35-55 % | a decent human should still win about half |
| hard | ≥ 85 % | ≥ 80 % | **> 50 %, target ≥ 55 %** | — |
| every level | — | — | — | bot vs same bot: every matchup 46-54 % (`--roster`), 0 stuck > 8 s, 0 replay mismatches |

Commands:
```
npx tsx tools/balance/smartbot/vs.ts --grid --bots smart:easy,smart:normal,smart:hard --seeds 150 --arenas offsite,office
npx tsx tools/balance/smartbot/vs.ts --roster smart:normal --seeds 400 --arenas offsite
npx tsx tools/balance/smartbot/navCheck.ts ; npx tsx tools/balance/smartbot/detCheck.ts
```

---

## 6. Results (simulated, 2026-11-28)

### 6.1 Baseline: today's bot vs the scripted players (100 seeds × 2 sides = 200 matches per row, traits on)

| Bot | vs | OFFSITE bot win % | office bot win % | KOs bot:player (OFFSITE) | Power guns per match (bot) |
|---|---|---|---|---|---|
| easy | masher | 3.0 ±2.4 | 4.0 ±2.7 | 1.94:4.97 | — |
| easy | strafer | 3.5 ±2.5 | 3.0 ±2.4 | 2.02:4.96 | — |
| easy | decent | 0.5 ±1.0 | 0.5 ±1.0 | 1.40:4.99 | — |
| **normal** | **masher** | **32.0 ±6.5** | 51.5 ±6.9 | 3.50:4.48 | 0.1 |
| normal | strafer | 22.5 ±5.8 | 36.0 ±6.7 | 3.50:4.67 | — |
| normal | decent | 12.5 ±4.6 | 16.5 ±5.1 | 2.82:4.82 | — |
| hard | masher | 48.5 ±6.9 | 66.0 ±6.6 | 4.01:4.08 | — |
| hard | strafer | 51.5 ±6.9 | 63.0 ±6.7 | 4.27:4.20 | — |
| hard | decent | 28.5 ±6.3 | 22.0 ±5.7 | 3.65:4.49 | — |

Raw table: `tools/balance/results/smartbot-baseline.md`. This matches the playtest: the masher beats today's normal bot about 2 times in 3 on OFFSITE. **Even hard is a coin flip against the masher.**

### 6.2 Smart bot prototype (150 seeds × 2 sides = 300 matches per row; `tools/balance/results/smartbot-grid.md`)

| Bot | vs | OFFSITE bot win % | office bot win % | KOs bot:player (OFFSITE) | Bot accuracy / player accuracy (OFFSITE) | Power guns bot:player |
|---|---|---|---|---|---|---|
| easy | masher | 2.7 ±1.8 ✅ | 2.3 ±1.7 ✅ | 1.73:4.96 ✅ | 29 % / 19 % | 0.1:0.3 |
| easy | strafer | 2.7 ±1.8 ✅ | 4.0 ±2.2 ✅ | 2.22:4.96 | 37 % / 39 % | 0.0:0.0 |
| easy | decent | 1.0 ±1.1 ✅ | 0.0 ✅ | 1.48:4.99 | 35 % / 37 % | 0.0:1.1 |
| **normal** | **masher** | **73.0 ±5.0** ✅ | **69.3 ±5.2** ⚠ (−0.7) | 4.38:3.04 | 31 % / 15 % | 2.0:0.2 |
| normal | strafer | 69.7 ±5.2 ✅ | 66.0 ±5.4 ✅ | 4.45:3.38 | 41 % / 28 % | 1.7:0.0 |
| normal | decent | 44.3 ±5.6 ✅ | 28.7 ±5.1 ❌ | 3.69:4.01 | 41 % / 27 % | 1.2:1.0 |
| hard | masher | 89.3 ±3.5 ✅ | 78.0 ±4.7 ❌ | 4.79:2.31 | 32 % / 14 % | 2.0:0.2 |
| hard | strafer | 89.7 ±3.4 ✅ | 81.7 ±4.4 ✅ | 4.82:2.69 | 42 % / 25 % | 1.6:0.0 |
| **hard** | **decent** | **67.3 ±5.3** ✅ | 48.3 ±5.7 ❌ | 4.28:3.18 | 42 % / 25 % | 1.2:1.0 |

Behaviour telemetry per match (normal, OFFSITE): 4.0-4.9 dashes, 2.5-2.8 Force Pushes (old bot 0.1-0.8), 4.6-5.6 gun pickups, 1.2-2.0 power guns (old bot 0.1). Match length median 45-54 s (old 37-60 s), so pacing is unchanged.

**Online case** (office, traits off, as the server bot will play; 200 matches per row): old normal vs masher / strafer / decent **48.0 / 35.0 / 14.0 %**, smart normal **61.0 / 68.0 / 32.0 %**. The smart bot is better online too, but still under the 70 % masher target.

**Read:** on OFFSITE (the default offline arena) every target is met. On the office, easy passes, but normal vs masher is 0.7 under, and normal vs decent and hard vs everything are under target. The cause is the office navigation gaps (§0.4).

### 6.3 What moved the numbers (tuning log, smart normal vs masher on OFFSITE unless noted; 60-300 matches each, CI ±5-12)
1. The first prototype (no lead, sight reset on every blink, power guns weighted like any gun): **28.7 %**. That is worse than the old bot.
2. Diagnostic with perfect aim, trigger 1 and no acquire delay: 57.5 %. With the tactics off as well: 33.8 %. So positioning and tactics were worth about +24 points, and aim alone could not reach 70.
3. Adding lead 0.6 and jink: 48.8 %. Fixing sight memory (a 0.5 s blink keeps the engagement clock): 56.7 %.
4. **Power guns weighted to be worth a climb**: decent 28 → 38 %, **masher 50 → 77 %**. This is the largest single lever.
5. Rail fires after a settle time instead of an error gate; shotgun reach 8.5 m: normal 65 / 68 / 48 % vs masher / strafer / decent.
6. **Lead sweep** (hard vs masher / strafer / decent): 0.9 → 69 / 75 / 53; **0.5 → 85 / 90 / 66**; 0.3 → 91 / 87 / 68. Normal: 0.6 → 65; **0.3 → 77**; 0 → 71. Leading a target that reverses every second overshoots.
7. Easy: aim 0.30 → 0.24 / 0.16 → 0.12 and trigger 0.55 → 0.7 raised its KOs from 1.36 to 1.76 per match vs the masher, while the masher still wins 96-97 %.

### 6.4 Why the trigger time looks low (`why.ts`, normal vs decent, 20 matches)
The bot has a shot 63 % of fight time and fires in 27-45 % of it. The rest of the visible time goes to: trigger dice 15 %, rail settle 19 % (now relaxed), shotgun out of reach 10 %, acquire delay 10 %. The "decent" script fires in 47-58 % of its time at 27-29 % accuracy. The bot fires less but hits 40-42 %. That is the intended "fewer, better shots" profile. If normal turns out too soft with humans, raise the trigger chance first, not aim.

### 6.5 Roster balance (bot vs the same bot, OFFSITE): see §7

---

## 7. Fighter balance at each level (46-54 % band)

Quick pass at 200 matches per cell (CI ±6.9 per cell, vs-field ±2.8; `tools/balance/results/smartbot-roster.txt`):

| Level | Arena | BRIX | ORMO | ZUZU | TAVO | Worst cell off 50 |
|---|---|---|---|---|---|---|
| easy | OFFSITE | 50.5 | **60.0** | **41.8** | 47.7 | 12.0 |
| easy | office | 45.7 | 52.7 | 48.2 | 53.5 | 6.0 |
| normal | OFFSITE | 49.8 | 49.5 | **56.0** | 44.7 | 10.0 |
| normal | office | 47.2 | 49.0 | **54.7** | 49.2 | 5.5 |
| hard | OFFSITE | 48.2 | 47.0 | **56.3** | 48.5 | 7.5 |
| hard | office | 45.8 | 51.2 | **58.0** | 45.0 | 10.5 |

**Not inside the band yet.** Two patterns:
- **ZUZU +4-8 at normal and hard.** Her two air jumps reach the tower deck in one go, and the smart bot now uses high ground. A rush-press weight of 0.15 instead of 0.4 did not move her (57.4 %), so the cause is mobility, not the press. HP does move her (§7.1).
- **ORMO 60 % on easy OFFSITE.** Easy fights are long, with poor aim on both sides, so 115 HP plus Tea Break count double. The old easy bot showed the same on the office (58-59 %, `traits-balance.md` §4.2). Easy bot-vs-bot is not what any player sees (a newcomer plays easy against a human), so I rate this low priority. If it must be in band, the lever is easy-only and bot-side: the easy ORMO bot does not hold still to heal.

### 7.1 Large confirming runs (400 seeds per ordered pair = 800 matches per cell)
OFFSITE, `tools/balance/results/smartbot-roster-400.txt`. Cell CI ±3.5, vs-field ±2.0.

| Level | HP set | BRIX | ORMO | ZUZU | TAVO | Cells outside 46-54 | Worst cell off 50 |
|---|---|---|---|---|---|---|---|
| easy | shipped (ZUZU 85) | 50.2 | **56.2** | **44.5** | 49.1 | 6 of 12 (ORMO vs ZUZU 59.0) | 9.0 |
| easy | ZUZU 82 | 51.7 | **56.8** | **40.8** | 50.8 | 8 of 12 | 10.8 |
| normal | shipped | 46.9 | 49.6 | **56.3** | 47.3 | 6 of 12 (ZUZU vs ORMO 58.3) | 8.3 |
| **normal** | **ZUZU 82** | 47.6 | 51.3 | 52.8 | 48.3 | **2 of 12** (BRIX vs ORMO 45.5/54.5) | **4.5** |
| hard | shipped | 47.7 | 48.0 | **56.3** | 48.1 | 6 of 12 (ZUZU vs TAVO 57.5) | 7.5 |
| **hard** | **ZUZU 82** | 49.0 | 49.5 | 52.3 | 49.2 | **2 of 12** (TAVO vs ZUZU 45.8, ZUZU vs TAVO 54.3) | **4.2** |

Verdict:
- With ZUZU 82, normal and hard sit at the edge of the band: 2 cells each, 0.2-0.5 points outside, inside the CI.
- Easy is out either way, in the opposite direction (ZUZU weak, ORMO strong). An HP change cannot fix both.
- Recommendation: (1) ZUZU 82, decided by the traits owner, and confirmed with humans before shipping, because HP is felt by players, not just bots. (2) An easy-only bot fix, specified but untested: the easy ORMO bot does not stand still to heal, and easy ZUZU uses her air jumps only on routes, not on jinks. (3) Accept a looser band at easy, since no player meets easy bot-vs-bot, and say so in `traits-balance.md` if the CD agrees.

---

## 8. Implementation plan for engineering (no `src/` edits were made here)

The API stays stable for the `online-bots` merge. `createBot(myId: number, seed = 42, level: BotLevel = 'normal') => (state: GameState) => InputState` keeps its name, file (`src/game/sim/bot.ts`) and signature. `BotLevel` and `EASY_GUN_GRACE_TICKS` stay exported from the same file. `server/DuelRoom.ts` and `game.ts` need no change. The brain moves behind that entry point.

| Step | Work | Files | Tests | Estimate |
|---|---|---|---|---|
| 1 | Port `nav.ts` as is (pure, cached per arena × fighter) | `src/game/sim/botNav.ts` | Port `navCheck` as a vitest: every OFFSITE pair reachable for every fighter; office ≥ 92 % now, 100 % of non-box-top pairs after step 3 | 0.5 d |
| 2 | Port `smartBot.ts` into `bot.ts` behind `createBot`. Remove `process.env` (SMART_TUNE, SMART_RUSH) and keep `LEVELS` as an exported const for tests. Keep the old crouch-duck projectile maths (`thinkCrouch`), which is better than the prototype's duck. Remove the `DEBUG` counters | `src/game/sim/bot.ts` | Existing `botGrace`, `botOffsite`, `crouch`, `arena`, `arenas` tests must pass unchanged. New `bot.behaviours.test.ts`: the §2 one-line tests | 1.5 d |
| 3 | Office navigation: routes to the beam (10.6) and the rack/metal box tops. Most failures are box tops; allow box-top goals only via `spotsFor` when reachable, and add a beam edge from the cabinets/ledges | `botNav.ts` | Office `navCheck` ≥ 98 %; office A7 stuck test | 0.5-1 d |
| 4 | Balance gate: port `vs.ts` + `players.ts` into `tools/balance/` (keep them out of the client bundle) and add an npm script `balance:bot` | `tools/balance/smartbot/*` (already there) | §5.2 table, both arenas; §7 band | 0.5 d |
| 5 | Server cost: slice the spot scoring (score 1/3 of the spots per tick over 3 ticks, then decide) so no tick spends > 1 ms | `bot.ts` | `detCheck` max call < 1 ms on the server box | 0.25 d |
| 6 | Online case: state without `traits` (no `trait`, base HP), office only. Run the grid with `traits: false` on the office | — | Normal vs masher ≥ 70 % on office without traits | 0.25 d |
| 7 | ZUZU HP decision (traits owner / CD). If 82 is accepted, it is one line in `TRAIT_HP`, then rerun `run.ts --mode real` and `--roster` | `src/game/sim/traits.ts` | Roster band | 0.25 d |
| 8 | Telemetry for real players (game-data-analyst): win rate per level, rematch rate, KO spread | `game.ts` analytics hooks | — | 0.5 d |

Total: **about 4-5 engineer days** [Estimate]. The prototype already does about 70 % of steps 1-2. Merge order: land this on `portal-build` after the online-bots merge or before it, either way. Because the entry point is unchanged, the only conflict surface is `bot.ts` itself, which `online-bots` does not touch (its diff has no `bot.ts` changes).

Risk to watch: the old bot's `game.ts` demo mode (`demoBot`) uses the same `createBot`. With the smart bot the menu demo will look smarter, which is good, but check that its camera framing still works when bots spend more time high up.

---

## 9. A/B candidates and the human test (hand to game-data-analyst)

Bots cannot measure fun. These need humans:
1. **Old normal vs smart normal** (CrazyGames, after the update): rematch rate (plays per visit), average play time, share of matches the player wins. Hypothesis: smart normal lowers the player win rate from about 60-70 % to about 30-45 % and raises rematches. **Kill criterion:** play time down ≥ 15 % → soften normal (trigger 0.85 → 0.7 first).
2. **Adaptive step** (candidate, not built): after 2 straight player losses on normal, the next match uses normal with hard's `retreat` off and `aim0` +0.04. A/B on D1 retention.
3. **5-person session, within-subjects** (cheapest real proof, about 1 hour): each person plays 3 matches vs old normal and 3 vs smart normal, in random order. Record wins, KOs and a one-word answer to "the bot felt: dumb / fair / cheating". Pass: smart normal scores "fair" ≥ 3/5, "cheating" ≤ 1/5, and the player wins 25-60 % of matches.
4. **"It reads as smart" check**: in the same session, ask after a match "did the bot do anything clever?" Behaviours named unprompted show which of §2 are actually visible.

---

## 10. What I did not verify

- **Humans.** Every win rate is against scripts. "Decent player" ≠ decent human.
- Leapfrog is measured and **fails** its target (0.18-0.26 per BRIX match, target ≥ 1.0). The `leap` goal fix is specified, not built.
- Office navigation to box tops and the beam (§3.5). The office acceptance rows fail.
- The online case was simulated with traits off on the office (§6.2), but not with real network delay or the server's tick pacing.
- Visual readability of the behaviours. I did not watch a single frame. CD/playtest critic should review a captured match: does a retreat read as a retreat, does a feint read as a feint?
- Roster balance on the **office** at 800 per cell (only 200 per cell, §7), and ZUZU 82 on the office.
- That ZUZU 82 does not upset human-vs-human or human-vs-bot balance. It came only from bot-vs-bot.
