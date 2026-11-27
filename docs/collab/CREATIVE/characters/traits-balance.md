# Signature traits: numbers, rules and balance proof

Systems design, 2026-11-28. Turns the four trait ideas in `roster-v3.md` (BRIX Leapfrog, ORMO Tea Break, ZUZU Sugar Rush, TAVO Packed Extra) into exact rules, and proves them with 96,000 headless bot matches on the real sim. Reference implementation and harness: `tools/balance/` (nothing in `src/` was edited). Slot map: `hotfix` = BRIX, `legacy` = ORMO, `standup` = ZUZU, `intern` = TAVO.

## 0. Problems first

1. **The roster is broken before any trait.** On today's sim, ZUZU wins 68-72 % against the field at every bot level and on both arenas; ORMO wins 33-41 %. At normal level on OFFSITE, ZUZU beats ORMO 81.7 % ±3.1. 9 of 12 matchups are outside 45-55 (section 4.1).
2. **The cause is body size, not speed.** Diagnostic runs (normal, OFFSITE, 3,000 matches each): give everyone Tavo's 1.7 x 0.8 m body and ZUZU drops from 72 % to 54 % (worst matchup 8 points off 50). Give everyone Tavo's speed, jump, weight and air jumps but keep the bodies and ZUZU stays at 67 %. A 1.5 m target is simply hit less often by spread guns.
3. **Traits cannot close a 35-point gap and stay small.** Measured alone, each trait moves its owner by 0 to 4 points (section 3.5). So I disagree with "traits only, identities untouched": the base needs one more lever. I propose **per-fighter max HP** (a field that already exists, `CharacterStats.hp`, all 100 today, and the HUD already reads it). Speed, jump, air jumps, weight and body size are unchanged, so every stat identity in the brief survives. HP becomes part of the identity instead: Zuzu is small and fragile, Ormo is the tank.
4. **HP above 100 breaks "the rail and the rocket always kill in one"** (`docs/BALANCE.md`, `GUNS` comment). Fix included: rail, rocket and bomb damage 100/110/110 → 120.
5. **Two traits are near-invisible to bots.** Leapfrog fires 0.2-0.9 times per match and Sugar Rush changes nothing measurable, because bots fight at gun range (6-15 m) and do not chase. Their value with human players is unmeasured; that is the main risk and the first A/B (section 7).
6. **The office arena (online's arena, and an offline option) is not inside 45-55 at normal level:** ZUZU 55-57 % against everyone. OFFSITE, the default offline arena, is inside the band everywhere. Easy bot on the office makes ORMO 58.5 % (Tea Break heals more behind desks).

## 1. Final numbers

| Name | Value | Unit | Reason | Safe range |
|---|---|---|---|---|
| `CHARACTERS.hotfix.hp` (BRIX) | **110** | hp | Tallest body (2.0 m) is hit most: +10 % evens her out (43.8 → 50.5 % vs field, normal OFFSITE, no traits) | 105-115 (105 left her at 42.6 %) |
| `CHARACTERS.legacy.hp` (ORMO) | **115** | hp | Widest (1.0 m) and slowest: the tank. 120 with Tea Break 2.5 s over-shot to 53.9-55.9 % | 110-120 |
| `CHARACTERS.standup.hp` (ZUZU) | **85** | hp | Smallest target: dies one SMG hit sooner (3 x 30 instead of 4). 80 under-shot (44.3 %), 90 over-shot (55.8 %) | 82-88 |
| `CHARACTERS.intern.hp` (TAVO) | 100 | hp | Reference body (`balance.ts` uses his height) | - |
| `GUNS.railgun.damage` | **120** | hp | One direct hit still kills anyone (max HP 115) | ≥ 115 |
| `GUNS.launcher.damage`, `GUNS.bomb.damage` | **120** | hp | Same; splash edge becomes 60 instead of 55 (falloff unchanged) | ≥ 115 |
| Leapfrog `maxClearance` | 2.5 | m | Feet at most 2.5 m above the rival's head at the crossing: over the head, not over the level from a walkway | 2-3 |
| Leapfrog `cooldown` | 2.5 | s | Spam guard: one reset per jump AND at most one per 2.5 s (= Force Push cooldown, half the dash cooldown) | 2-4 |
| Leapfrog `restoreAirDash` | yes | - | Without it a reset in the air after an air dash is useless until landing | - |
| Tea Break `regenAfter` (ORMO only) | **3.0** | s | Everyone else 4.0 s (`RULES.regenAfter`). 2.5 s was +3 points and pushed ORMO to 54-56 % on the office | 2.5-3.5 |
| Tea Break regen rate | 15 | hp/s | Unchanged, as roster-v2 asked: it only shortens the wait | - |
| Sugar Rush `speedMul` | 1.2 | x | 10.6 → 12.7 m/s top run speed; dash and jump untouched | 1.1-1.3 |
| Sugar Rush `duration` | 1.0 | s | Long enough to break line of sight (12 m), too short to chase | 0.8-1.5 |
| Sugar Rush `cooldown` | 4.0 | s | From trigger to next possible trigger; the burst does not refresh or stack | 3-6 |
| Packed Extra `magMul` / `reserveMul` | **1.25 / 1.25** | x | SMG 25+50 (was 20+40), Uzi 40+40 (32+32), Shotgun 5+10 (4+8). See 3.4 on why "more reserve" alone was worthless | 1.15-1.4 |

## 2. Rules per trait (what engineering builds)

All four are pure functions of the sim state: no RNG draws, no wall clock. Hook points are the six anchors in `tools/balance/patchStep.ts`; reference code is `tools/balance/traits.ts`.

### 2.1 BRIX: LEAPFROG
- **Trigger** (checked once per tick after both fighters moved, before projectiles): BRIX is alive and not on the ground; the rival is alive; phase is `fight`; the sign of (BRIX.x − rival.x) changed since last tick (both non-zero); BRIX's feet were at or above the rival's current top (`rival.y + bodyHeight(rival)`) on both ticks; and her feet are at most 2.5 m above that top.
- **Effect:** `dashCooldown = 0` and `airDashes = max(airDashes, 1)`. No damage, no knockback.
- **Limits:** once per airborne period (re-armed when she lands), and a 2.5 s trait cooldown after each trigger. Crossing a respawning or dead rival does nothing; crossing an invulnerable (just respawned) rival counts.
- **Reach (scripted, flat floor, `leapfrogReach.ts`):** running at full speed, one jump from 1.75-5.75 m before the rival clears every standing fighter; 0.75-6.5 m against a crouched one. Shorter rivals are slightly easier (Zuzu 1.25-6 m). No matchup is locked out.
- **Edge cases:** crossing during her own dash counts; wall-kick does not re-arm (only landing); 2-player and the bot obey the same rule.
- **On screen (CD to design):** dash meter snaps full, a short skate-wheel spark under her feet at the crossing point, a whoosh. Suggest a `trait` event `{ type: 'trait', trait: 'leapfrog', fighter, x, y }` so the renderer and audio do not poll.

### 2.2 ORMO: TEA BREAK
- **Rule:** his health starts coming back after **3.0 s** without taking damage (everyone else 4.0 s), at the same 15 hp/s, up to his max (115).
- **What resets the timer:** any damage applied through `applyHit` (bullets, pellets, splash, Force Push chip, his own rocket), exactly as today. Dealing damage does not reset it (I dropped roster-v2's "and dealing": it adds a rule to explain and the numbers above already sit in the band).
- **Existing bug to fix for everyone:** a wall splat (`WALL_SPLAT_DAMAGE`, step.ts glass-wall block) subtracts hp without `sinceHit = 0`, so a splatted fighter keeps healing. Not part of the trait; the harness kept today's behaviour.
- **Effect size:** 23-41 extra hp healed per match at normal/hard (telemetry), ~1 KO's worth of health over a match.
- **On screen:** the HUD `healing` flag (`src/game/render/game.ts`, now `sinceHit >= RULES.regenAfter`) must use his own delay. CD: a steam curl from the cup and a small "tea" tick on his health bar at 3 s, so players learn he heals first.

### 2.3 ZUZU: SUGAR RUSH
- **Trigger:** she takes ≥ 1 damage from the rival (not her own rocket, not a wall splat), survives the hit, and the trait is off cooldown.
- **Effect:** top run speed x1.2 (ground and air `maxSpeed` only) for 1.0 s. Acceleration, dash, jump and knockback unchanged.
- **Cooldown:** 4.0 s from the trigger. A hit during the burst neither refreshes nor stacks it.
- **Telemetry:** 4.7-6.4 triggers per match.
- **On screen:** pink speed lines behind her and a sugar-cube pop for 1.0 s; a whistle note on trigger. Must read at 50 px/m, she is the smallest body.

### 2.4 TAVO: PACKED EXTRA
- **Rule:** a regular gun he picks up (SMG, Uzi, shotgun) has a 25 % bigger magazine and 25 % more reserve (rounded): SMG 25+50, Uzi 40+40, shotgun 5+10. He also reloads to the bigger magazine. Pistol, rail, rockets and bombs are unchanged.
- **Engineering:** the weapon needs its own magazine size (e.g. `Weapon.cap`), used by both reload lines in `updateWeapon` (`g.mag - w.mag` and `w.mag >= g.mag`) and by `lowAmmo` (2-player assist) instead of `GUNS[kind].mag`.
- **Edge cases:** respawning or picking up a gun again creates a fresh weapon; a gun he takes from the floor after a swap is new, so nothing carries over.
- **On screen:** the ammo counter shows 25/50 naturally; CD to add a small pack icon next to it.

## 3. Why these numbers (tuning log)

All runs: bot vs bot, both bots the same level, each seed played twice with sides swapped (step() updates fighter 0 first; measured side bias 47.5-51.3 %, cancelled by the swap). Win = KO race or more KOs at 150 s; draws count 0.5. CI = 1.96 x SD / √n.

1. **Baseline** (36,000 matches): section 4.1.
2. **Diagnosis:** equal bodies → ZUZU 53.8 %, ORMO 42.8 %; equal movement → ZUZU 67.0 %. Size is the main lever, ORMO's slowness the second.
3. **Each trait alone, at today's HP** (normal OFFSITE, 6,000 matches each, compared with baseline vs-field rate): Leapfrog −0.1 (0.2 leaps/match; with a bot that tries to leapfrog, 0.23 and −1.2), Tea Break 2.5 s +3.2, Sugar Rush +0.2, Packed Extra (1.5x mag) +4.2.
4. **Packed Extra as written ("more reserve") was worthless:** in 252 regular-gun pickups by a TAVO bot, the gun ran dry once. Fights end, or he dies, long before the reserve matters. A bigger magazine means fewer reloads mid-fight, which is when you die. Hence 1.25x magazine and reserve.
5. **HP search** (traits on, normal OFFSITE): Zuzu/Ormo/Brix = 85/115/105 → worst cell 8.8; 80/120/110 → ZUZU 44.3 %; 90/115/105 → ZUZU 55.8 %; 85/120/110 → all cells 45.2-54.8 but ORMO 53.9 and 54-56 % on the office; Tea Break 2.5 → 3.0 brought ORMO to 48-52 % on both arenas.

## 4. Results (row win % against column, ±95 % CI; bold = outside 45-55)

### 4.1 Before: today's sim (300 seeds x 2 sides = 600 matches per cell)

Normal, OFFSITE

| | BRIX | ORMO | ZUZU | TAVO | vs field |
|---|---|---|---|---|---|
| BRIX | - | **56.7** ±4.0 | **29.2** ±3.6 | 45.5 ±4.0 | 43.8 ±2.3 |
| ORMO | **43.3** ±4.0 | - | **18.3** ±3.1 | **38.0** ±3.9 | 33.2 ±2.2 |
| ZUZU | **70.8** ±3.6 | **81.7** ±3.1 | - | **64.8** ±3.8 | 72.4 ±2.1 |
| TAVO | 54.5 ±4.0 | **62.0** ±3.9 | **35.2** ±3.8 | - | 50.6 ±2.3 |

Normal, office

| | BRIX | ORMO | ZUZU | TAVO | vs field |
|---|---|---|---|---|---|
| BRIX | - | 53.3 ±4.0 | **32.3** ±3.7 | **44.5** ±4.0 | 43.4 ±2.3 |
| ORMO | 46.7 ±4.0 | - | **25.7** ±3.5 | **42.0** ±3.9 | 38.1 ±2.2 |
| ZUZU | **67.7** ±3.7 | **74.3** ±3.5 | - | **62.7** ±3.9 | 68.2 ±2.2 |
| TAVO | **55.5** ±4.0 | **58.0** ±3.9 | **37.3** ±3.9 | - | 50.3 ±2.3 |

ZUZU vs field at easy/hard: 68.6/69.6 % (OFFSITE), 67.8/66.4 % (office). Worst cell per level: 24.8 / 31.7 / 25.5 points off 50.

### 4.2 After: proposed HP + power guns 120 + all four traits (400 seeds x 2 = 800 matches per cell)

Normal, OFFSITE (default offline arena): **all 12 cells inside 45-55** (46.0-54.0)

| | BRIX | ORMO | ZUZU | TAVO | vs field |
|---|---|---|---|---|---|
| BRIX | - | 49.8 ±3.5 | 46.0 ±3.5 | 47.3 ±3.5 | 47.7 ±2.0 |
| ORMO | 50.2 ±3.5 | - | 46.3 ±3.5 | 47.1 ±3.5 | 47.9 ±2.0 |
| ZUZU | 54.0 ±3.5 | 53.8 ±3.5 | - | 51.0 ±3.5 | 52.9 ±2.0 |
| TAVO | 52.8 ±3.5 | 52.9 ±3.5 | 49.0 ±3.5 | - | 51.5 ±2.0 |

Normal, office: 6 of 12 cells outside by 0.1-1.9 points, all ZUZU's row/column

| | BRIX | ORMO | ZUZU | TAVO | vs field |
|---|---|---|---|---|---|
| BRIX | - | 47.9 ±3.5 | **43.1** ±3.4 | 48.5 ±3.5 | 46.5 ±2.0 |
| ORMO | 52.1 ±3.5 | - | **44.3** ±3.4 | 47.0 ±3.5 | 47.8 ±2.0 |
| ZUZU | **56.9** ±3.4 | **55.8** ±3.4 | - | **55.1** ±3.4 | 55.9 ±2.0 |
| TAVO | 51.5 ±3.5 | 53.0 ±3.5 | **44.9** ±3.4 | - | 49.8 ±2.0 |

Other levels, worst cell / vs-field range: easy OFFSITE 55.0 / 46.7-51.5; easy office **ORMO 58.3-59.0** / 45.5-58.5; hard OFFSITE 54.3 / 46.4-52.2; hard office 54.9 / 46.8-52.9. Full tables: `tools/balance/results/final.md` (and `final.txt`, `final.json`).

### 4.3 HP alone vs HP + traits (same 800 matches per cell, normal OFFSITE, vs field)

| | Today | HP + power 120, no traits | + traits | Trait effect |
|---|---|---|---|---|
| BRIX | 43.8 | 50.5 | 47.7 | −2.8 ±2.8 |
| ORMO | 33.2 | 46.2 | 47.9 | +1.7 ±2.8 |
| ZUZU | 72.4 | 52.0 | 52.9 | +0.9 ±2.8 |
| TAVO | 50.6 | 51.3 | 51.5 | +0.2 ±2.8 |

HP fixes the roster; the traits stay within ±3 points of each other in bot play, which is the "close in strength" target. Brix's negative is the others' traits, not hers costing anything. Match length is unchanged (median 42-43 s normal OFFSITE).

## 5. Determinism and online

- `npx tsx tools/balance/determinism.ts`: **290 checks, 0 failures.** (1) Traits off: the patched sim gives bit-identical final states to `src/game/sim/step.ts` on 288 matches (16 matchups x 3 levels x 3 seeds x 2 arenas): the hooks change nothing for anyone without a trait. (2) Traits on: every match repeats exactly. (3) A JSON snapshot round-trip mid-match (what the server sends) continues identically.
- **Online needs gating.** The server runs the same `step` (`server/DuelRoom.ts`), snapshots carry the whole `GameState`, and clients predict with their own copy. In the direct-line mode slot 0's browser is the authority. A client and server (or two browsers) on different builds would disagree about HP, ammo, regen and speed: constant mispredictions, and in direct mode two different rule sets. The client today accepts any server with `v >= 2` (`client.ts:124`), so a version check does not exist yet.
- **Recommendation: offline-only first, protocol bump second.**
  1. Add `GameState.traits?: true`, set only through `createGame`'s `extra` (the same pattern as `arena` and `gunGrace`): absent online, so online states and snapshots are unchanged. Gate all of it on the flag: per-fighter HP (`maxHp(state, f)` instead of `CHARACTERS[c].hp`), power-gun damage, and the four traits. Do not change `CHARACTERS.hp` or `GUNS` globally, or online changes the day it ships.
  2. When online should get them: `PROTOCOL_VERSION = 3`, the server creates games with `traits: true`, the client refuses a server whose `v` differs from its own (not `>=`), and direct-line peers exchange versions before slot 0 hosts.
- Cost of step 1: online keeps today's imbalance (ZUZU ~68 % in bot play on the office) until step 2.

## 6. Engineering checklist

1. `Fighter` gains trait fields (`rush`, `rushCd`, `leapUsed`, `leapCd`, previous x/y/alive for the crossing test) and `Weapon` gains `cap`. Keep them plain numbers/booleans (no object references: the harness's telemetry `lastW` reference is not for production).
2. Hooks: trait timers next to the other timers in `updateFighter`; `regenAfter(f)`; `speedMul(f)` in `maxSpeed`; `onHit` after `sinceHit = 0` in `applyHit`; `pickupWeapon` in `takePickup`; `magSize(w)` in both reload lines and `lowAmmo`; `afterMove(state)` after the fighter loop in `step`.
3. HUD: `healing` flag per fighter delay; `copy.ts` line "Everyone has 100 health" must change (CD copy); `docs/BALANCE.md` table re-run at 85/100/110/115 hp; `balance.test.ts` bands may move with rail/rocket at 120.
4. Port `determinism.ts` checks to vitest (traits off == old golden hashes, traits on repeatable), plus unit tests: Leapfrog triggers over a standing rival and not from a walkway 4 m above; Sugar Rush does not trigger on self-damage or refresh inside 4 s; Tea Break heals at 3.0 s for Ormo only; Tavo reloads to 25.

## 7. A/B candidates (hand to game-data-analyst; human players only, bots cannot measure these)

| # | Question | A | B | Metric |
|---|---|---|---|---|
| 1 | Is Leapfrog worth anything to people? | as specified | Leapfrog off | BRIX pick rate, BRIX win rate vs bot, leaps per match (log the `trait` event) |
| 2 | Is Leapfrog spammable? | cooldown 2.5 s | cooldown 1.0 s | leaps per minute for the top 10 % of BRIX players; flag > 20/min |
| 3 | Does Sugar Rush frustrate? | 1.2x for 1.0 s | 1.3x for 1.0 s | "she ran away" rate: ZUZU escapes at < 30 hp followed by full regen; quit rate vs ZUZU |
| 4 | Is ZUZU at 85 hp too fragile to pick? | 85 | 90 | ZUZU pick share; win rate vs normal bot |
| 5 | Is the office arena acceptable for ZUZU? | as is | ZUZU 82 hp on the office only | ZUZU win rate on the office |

## 8. Harness (`tools/balance/`)

- `npx tsx tools/balance/run.ts --seeds 400 --levels easy,normal,hard --arenas offsite,office --mode both --proposed --out tools/balance/results/final.json` (96,000 matches, ~11 min on 9 threads). `--mode before|after|both`, `--cfg '<json>'` overrides trait numbers, `--stats` / `--guns` override tables, `--leap` makes BRIX bots try to leapfrog.
- `patchStep.ts` builds `.gen/step.ts` from the real `step.ts` with the hooks; it throws if an anchor stops matching, so the harness never runs a stale copy.
- `determinism.ts` (section 5), `leapfrogReach.ts` (2.1), `report.ts` (markdown tables).

## 9. Limitations

- Bots are not people: they keep gun range, never chase, aim at the chest with fixed error. Size advantage may be smaller (or larger) for humans; Leapfrog and Sugar Rush are almost unmeasured. Treat section 4 as "no bot-detectable imbalance", not as proof of human balance.
- Bot vs bot uses the same level on both sides; the player-vs-bot experience (one human, one bot) is not simulated.
- Office results miss the 45-55 band for ZUZU by up to 1.9 points; easy-office ORMO is 58.5 %.
- Cheapest real check: 10 people x 10 matches against the normal bot with each fighter on OFFSITE, logging winner and the trait events (2 hours of playtesting, no new code beyond the event log).
