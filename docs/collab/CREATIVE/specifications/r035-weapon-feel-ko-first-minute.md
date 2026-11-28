# R-035 · Weapon feel, the KO moment, the first minute and a solo loop

Creative Director, 2026-11-28. Branch `portal-build`. For the CrazyGames resubmission window (9 Dec). This is about feel and fun, not looks.
F-items: **F-090 to F-099** in `FEEDBACK.md`. (F-085 to F-087 are taken on `online-bots`, so this range starts at F-090 to avoid a merge clash.)
Mockups: `specifications/r035/` (`mockups.html` -> `node render.mjs` -> `after-muzzle-flash.png`, `after-ko-400ms.png`, `ko-timeline.png`).
BEFORE evidence from the real build: `shots/r035/before/` and the sheets `shots/r035/before-guns-sheet.png`, `before-muzzle-zoom.png`, `before-ko-sheet.png`, `before-first-minute-sheet.png`. The capture script is `shots/r035/capture.mjs` (portal dev server, `window.__mc`).

---

## 0. Problems first (what I saw in the build, not what I assumed)

1. **The muzzle flash is a flat grey hexagon.** It is `IcosahedronGeometry(0.18, 0)` with an unlit `MeshBasicMaterial`, pale yellow `#fff1a8`, or white at 2.2x for heavy guns (`render/game.ts` ~l.378 and ~l.1117). On OFFSITE's pale sand and sky it reads as a grey sign beside the head, not as fire (`before-muzzle-zoom.png`, all four rows). Every gun has the same shape, and only its size and colour change.
2. **Four of the six guns feel like the same gun.** Pistol, SMG and Uzi are all "hold Space and a number goes down": the same ink tracer with a paper head, the same yellow spark puff, the same generic `hit()` thud and the same muzzle. **The Uzi plays the SMG recording at 1.12x speed** (`sfx.ts` `RECORDED.uzi`), so even the ear cannot tell them apart. Body recoil is 0.5 for both (`SHOT_KICK`).
3. **The shooter never hears or sees that they hit.** The only confirmation is the victim's white flash and a damage number. Both are on the *victim*, which at 1280 is a 45–70 px figure (`before-ko-sheet.png`). There is no hit marker, no hit tick and no kill sound for the shooter.
4. **The KO is a chip, and the body just drops.** At the KO the fallen fighter falls straight down (`downY - 0.5·30·t²`) into the defeat pose. The only centred signal is a small pale burst on pale sand. The "who KO'd whom" chip sits under the score. For a whole frame sequence nothing in the middle of the screen says KO (`before-ko-sheet.png`, +103 to +2858 ms). The Field Day redesign dropped the old `KoStamp` (`FightStamps.tsx`; it is still defined but no longer mounted).
5. **A real overlap bug at the first KO:** the KO feed chip (`top: 120`) slides over the arena name card (`top: 120`) while the card is still fading out. In `ko-01.png` it reads "OFFSIT[feed]he shade."
6. **A wrong tip on OFFSITE:** the respawn card said "Tip: Push your rival into the glass for a wall splat." on the desert map (`before/gun-shotgun-01.png`, an earlier run). OFFSITE has cliffs, not glass. Three of the nine `COPY.tips` are office-only.
7. **Surface hits barely exist.** An `impact` is 3 dust bits for 0.25 s plus a quiet tick. Shells, smoke and anything else that stays on screen are missing. That leaves no "permanence" after a firefight.
8. **Guns are realistic gunmetal props at 1.3x life.** On the floor they are dark specks, and in the hand they are a few pixels. That is a mismatch with the toy cast. I only touch their size (F-099, P2), because R-027 forbids adding colours.

What is good and must stay: the trauma shake (summed sines, real-time decay), the tier table in `feedback()`, the flinch and squash in `rig.life`, the damage numbers with the shotgun merge (F-069), the final-KO slow-motion and KNOCKOUT band, the KO camera beat, the ink-and-paper tracer readability on OFFSITE (F-041), the shot voice budget and the `audioBudget` gate.

## 1. What the leaders do (grounding)

Labels: **[Verified]** = I read a source today. **[Memory]** = from my own knowledge of the games, not replayed today.
- [Verified] Vlambeer's "The Art of Screenshake" (Jan Willem Nijman, 2013) takes a plain side-on shooter through 30 small tweaks. One named tweak is that the screen shakes slightly *opposite* to your gunfire ([Game Developer](https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games)). The talk is the canonical source for camera kick, muzzle flash, shells, bigger explosions, hit pause and "permanence". Only the opposite-shake detail is confirmed by that article; the rest of the list is [Memory].
- [Verified] On CrazyGames, Rooftop Snipers is listed as a 2-player game "where you can only shoot and jump". Ragdoll Archers is ranked the most popular 2-player game ([crazygames.com/t/2-player](https://www.crazygames.com/t/2-player), [rooftop-snipers-2](https://crazygames.com/game/rooftop-snipers-2)).
- [Memory] Rooftop Snipers: one hit knocks a fighter off the roof in a ragdoll fall. That fall *is* the KO and the joke, and the next round starts within about 2 s. Gun Mayhem 2: KOs come from knockback off the stage, each gun has its own loud cartoon sound, and shells fly. Ragdoll Archers: the hit is sold by the body reacting, not by a number.
- **Principle I take:** in the leaders, the *body* reports the hit and the KO, and the KO has a physical comic beat. Every gun has an identity you can hear with your eyes closed. Our sim stays as it is: the KO beat is render-only and costs at most about 0.3 s of real time per KO.

## 2. Gun identities (the one line engineering should remember)

| Gun | Verb | Sound idea | What sets it apart on screen |
|---|---|---|---|
| Pistol | the steady tap | "pap!" | a crisp 5-point star, a brass shell per shot, a 2-tick hit-stop on hit |
| SMG | the hose | "tuk-tuk-tuk", rising in pitch through a burst | a thin 4-point flash that alternates, a medium tracer, a shell stream |
| Uzi | the buzzsaw | "brrrt", thin and buzzy, its own synth | a tiny strobing 3-point flash, short dashes, hand jitter |
| Shotgun | the door-kicker | "BOOM - chk-chk", +3 dB over the rest | a big orange 7-point burst, smoke, a hard body kick, a red hull on the pump |
| Sniper rail | the line | "zzzt-PING", then a recharge whine and a ready blip | a long spike and ring, a fat two-tone beam, coils that glow then cool |
| Rockets | the slow threat | "fwoomp" plus an in-flight whistle | flame out of the *back* of the tube, smoke both ways |
| Bomb | the timer | "beep...beep.beep.beep BOOM" | the fuse sparks and the red blink speeds up as the fuse runs out |

## 3. Weapon feel per gun (F-090 to F-094, F-098)

All of this is render and sound only. It reads sim events and never changes positions, health or timers. The one exception is the sim hit-stop ticks in 3.3, which already live in the sim (offline only, `state.net` excluded).

### 3.1 Muzzle flash (F-090, replaces the hexagon)
- **Shape:** a flat star polygon in the fight plane (`ShapeGeometry`, z = +0.15 in front of the gun), its long axis along the aim, built **once per gun at load**. It is one vertex-coloured merged geometry of three layers, back to front: ink outline `#1B1F2E` (the shape grown by 0.03 m), rim colour, and cream core `#FFF6D0` (the same star at 55 % size, pushed 0.1 x length forward). One `MeshBasicMaterial({ vertexColors: true, depthWrite: false })`. One mesh per fighter, and its geometry is swapped per gun (a geometry swap does not compile a shader).
- **Timing:** for the first half of its life it shows at 100 %. For the second half it shows at 65 %, rolled by +20°, and the core drops out (swap to a second "no core" geometry, or scale the core to 0). Each shot gets a random roll of ±12° and a random scale of 0.9–1.1. It is anchored at the gun tip as now (`fwd`).

| Gun | Points | Length x width (m) | Life (ms) | Rim colour | Extra |
|---|---|---|---|---|---|
| pistol | 5 | 0.56 x 0.38 | 50 | sun `#FFC83D` | - |
| smg | 4 | 0.62 x 0.26 | 40 | sun | roll alternates 0° / 45° shot to shot |
| uzi | 3 | 0.40 x 0.28 | 33 | sun | roll ±10° alternating; core off |
| shotgun | 7 | 1.05 x 0.75 | 70 | orange `#F2542D` (`PALETTE.orange`) | 3 smoke puffs (`vfx.puff` size 1.1, forward 1.5 m/s, life 0.5 s) |
| railgun | spike (2-point star, inner 0.25) + ring r 0.26 m | 1.5 x 0.20 | 90 | coil blue `#6AA8FF` | ring = ink 0.07 m stroke + blue 0.03 m |
| launcher | 6, **pointing backwards from the rear of the tube** (0.80 m behind the hand) | 0.88 x 0.62 | 80 | orange | a small pistol-shape flash at the front (0.6x); 5 smoke puffs backwards (size 1.4, 2 m/s, life 0.7 s) |
| bomb | none | - | - | - | the pin pops (see 3.5) |

- **Reduce motion / shake off:** the flash stays (it is not motion), at 60 % size. The shotgun and rocket screen exposure flash (3.2) is off.
- **Draw cost:** 2 meshes (one per fighter), the same as today.

### 3.2 Recoil: fighter, gun and camera (F-091)
The sim's `recoil` (m/s of push on the shooter) stays as it is. This adds the visual kick.

| Gun | Gun pitch up per shot | Torso lean back | Gun slides back (visual) | Cap while firing | Spring back (ω, critically damped) | Camera kick opposite the aim (m) | Kick recovery τ | Trauma added (local shooter) |
|---|---|---|---|---|---|---|---|---|
| pistol | 9° | 3° | 0.04 m | - | 30 rad/s (~150 ms) | 0.06 | 60 ms | 0 |
| smg | 4° | 1.5° | 0.02 m | 12° pitch | 34 rad/s | 0.03 | 50 ms | 0 |
| uzi | 3° + yaw jitter ±3° random | 1° | 0.015 m | 10° pitch | 38 rad/s | 0.025 | 40 ms | 0 |
| shotgun | 24° | 10° | 0.12 m | - | 16 rad/s (~280 ms) | 0.18 | 90 ms | 0.20 (replaces `light`) |
| railgun | 18° | 8° | 0.10 m | - | 14 rad/s | 0.25 | 110 ms | 0.30 + exposure flash 0.05 |
| launcher | 10° + shoulder dip 0.05 m | 6° | 0.08 m (forward: the tube kicks the shoulder) | - | 18 rad/s | 0.15 | 90 ms | 0.20 |
| bomb | throw arm swing (existing) | - | - | - | - | 0 | - | 0 |

- Implement the per-gun values as a table that replaces `SHOT_KICK` (`characters.ts`). Pitch and lean are added on top of the aim pose, in render space only.
- **Camera kick** is a separate offset vector from trauma: `kick += -aimDir * value` at the shot, decaying by `exp(-dt/τ)`, added to `camera.position` and `lookAt` together. It applies only to the **local** shooter. In 2P both shooters kick at 50 %. Online it plays from the predicted step only. It scales with `motion` (0 when shake is off or reduced motion is on).
- **Acceptance:** fire 1 s with each gun. The camera returns to rest within 4τ of the last shot. Every bone and the gun are back to rest exactly (same check as `game-feel` verify).

### 3.3 Hit-stop per hit (F-091, offline only, sim side)
Today only `k > 10` hits freeze (up to 6 ticks). Add a per-gun floor, taking the max with the existing rule:

| Gun | Ticks on a hit (60 Hz) | Rule |
|---|---|---|
| pistol | 2 (33 ms) | every hit |
| smg | 0 | - |
| uzi | 0 | - (a freeze per Uzi bullet stutters the game) |
| shotgun | 3 (50 ms) | once per blast (the first pellet that lands), not per pellet |
| railgun | 6 | as today via k (k = 14/weight); make it explicit |
| launcher, bomb | 6 | as today via k |

Online (`state.net`) gets no hit-stop, as today. During a freeze, shake, kick, flash and UI keep running on real time (already true).

### 3.4 Tracers and projectiles (F-094)
OFFSITE keeps its ink body + paper head (F-041). The office keeps its cream tracer. Change the size per gun:

| Gun | Tracer length x thickness (m) | Notes |
|---|---|---|
| pistol | 1.0 x 0.09 | - |
| smg | 0.8 x 0.07 | - |
| uzi | 0.5 x 0.06 | short dashes, so the stream reads as a buzz |
| shotgun pellet | 0.35 x 0.08 (as now) | plus a fading ink streak 0.6 m behind each pellet, opacity 0.5 -> 0 over its 0.32 s life |
| railgun beam | core 0.06 m paper `#FFFBF0` + outer 0.22 m coil blue `#6AA8FF` | frame 1 at 1.6x thickness; the outer shrinks to 0 over 300 ms, the core over 180 ms; replaces today's single pale blue box |
| rocket | as now + an in-flight whistle (3.6) | smoke puff every 30 ms (as now), and the flame 1.3x longer |
| bomb | as now + fuse sparks: 1 sun spark every 40 ms from the fuse tip, life 0.25 s, gravity 6 | a red blink on the bomb (emissive `#F0533A`); blink period runs from 300 ms at the throw down to 80 ms at 0.4 s before the fuse ends |

### 3.5 Impacts, shells and smoke (F-094)
**On fighters** (the `hit` event), replacing the pale `spark` burst on OFFSITE, where `#FFF1A8` on sand is invisible:
- Bullets (pistol, SMG, Uzi): 4 sun chips + 2 ink chips (`vfx.burst`, speed 3 + power x 0.3, life 0.3), **thrown in the bullet's direction** (`dirX` = sign of the shot), plus the existing ring only for damage >= 25.
- Shotgun: one combined burst per blast (merge as F-069 does), 12 chips (8 sun, 4 ink). No extra visual slide on a living fighter: the drawn body must stay on its hitbox. More shove is a stats question (R-036).
- Railgun: 20 chips (14 coil blue, 6 paper) along the beam's direction plus a blue ring (grow 8, life 0.3).
- Rocket and bomb: the existing explosion.
- The office keeps its own colours (the cream spark reads on the dark office). `vfx.setColors` per arena is already the hook: add `spark` and `ink` to OFFSITE's set.

**On surfaces** (the `impact` event). The renderer picks the surface from where the impact is: on the floor (y within 0.1 of `A.floor`) = ground, on a platform top = wood, at the side walls = wall.

| Surface | OFFSITE | Office | Sound |
|---|---|---|---|
| ground | `vfx.puff` 2 at size 0.8 + 4 dust chips, up 2 m/s | 3 dust chips (as now) | `impact` as now |
| wood (planks, crates) | 4 walnut `#6B4226` chips (splinters, speed 4, life 0.45) + 1 puff at size 0.5 | same | `noise('bandpass', 1800, 900, 0.04, 0.14, 2.5)` "tock" |
| wall (cliff / glass) | 5 rock chips `#9A7B5C` + dust | glass glints (`glass`, 4) | cliff: as ground; glass: `tone('sine', 3800, 3200, 0.05, 0.05)` |
| metal (water-tower legs, if engineering can tell) | 5 sun sparks, speed 6, life 0.2 | - | `tone('triangle', 2900, 2500, 0.06, 0.06)` "ting" |

**Shells** (one `InstancedMesh` per shell type; pool of 40 each; **off on the low tier and when the governor cuts puffs**):
- pistol, SMG: 1 brass casing per shot (box 0.05 x 0.05 x 0.12 m, existing `M.brass`). Spawned at the gun receiver, `vx = -facing x (2.5 ± 0.8)`, `vy = 4 ± 1`, spin 15 rad/s, gravity 26, bounce 0.35 twice, rests 1.5 s, fades over 0.3 s.
- uzi: 1 casing per 2 shots, at 0.8x size.
- shotgun: 1 red hull (0.07 x 0.07 x 0.16 m, `#F0533A` body with a brass end), ejected **on the pump** (0.38 s after the shot, in sync with the pump sound), rests 2.5 s.
- railgun: no shell. The coils' emissive goes 1.2 -> 3.0 at the shot and back to 1.2 over 1.4 s (the rate), plus 4 coil-blue particles venting up from the coils. This shows "recharging" with no UI.
- launcher: no shell; the back-blast smoke (3.1).
- bomb: a pin ring (grey torus r 0.04 m) pops off the hand at the throw: vy 3, spin 20, rests 1 s.
- **Permanence (P2, only if the budget allows):** up to 24 ink bullet-hole decals (0.08 m discs) on wood and rock, faded after 8 s. Not on fighters, not on the sky.

### 3.6 Sound per gun (F-092, `src/game/sfx.ts`)
Keep the recordings (they give weight) and the guns bus at Reis's 0.45. Add a **character layer** per gun, in the file's own `tone(type, f0, f1, dur, vol, opts)` and `noise(filter, f0, f1, dur, vol, q, opts)` terms, scheduled inside `shot()` after the sample (bus override stays `guns`). Pan = `panOf(x)`. All layers obey `SHOT_BUDGET`.

- **pistol** (sample `pistol` 0.55 as now) + `tone('square', 620, 180, 0.05, 0.10)` + `noise('bandpass', 2400, 1200, 0.03, 0.22, 2)`. The square pop is the toy "pap".
- **smg** (sample `smg` 0.5) + `tone('triangle', 330 x b, 140 x b, 0.035, 0.12)` where `b = 1 + 0.03 x n`, n = shots in this burst (cap n = 5, so +15 %). The burst resets after 250 ms with no shot. Plus `click(0.02, 3200, 0.06, pan)`. The rising pitch makes a held SMG feel like it is building.
- **uzi**: its own voice. Sample `smg` at **rate 1.35, gain 0.30** (thinner, higher) + `noise('highpass', 5200, 3000, 0.012, 0.40, 0.7)` + `tone('square', 520, 260, 0.025, 0.08)`, with detune alternating +40 / -40 cents shot to shot (a buzz, not a hose). Never the same rate as the SMG.
- **shotgun** (sample `shotgun` 0.6 + `pump` as now) + `tone('sine', 90, 35, 0.28, 0.55, { room: 0.5 })` + `duck(-6, 0.3)`. This is the loudest small arm, about +3 dB over the pistol. Shell hull on the ground at 0.9 s: `tone('sine', 2600, 2400, 0.06, 0.04, { delay: 0.9 })`.
- **railgun** (sample `sniper` 0.5 + `bolt` as now; zap `tone('sawtooth', 2600, 140, 0.25, …)` volume **0.12 -> 0.18**) + ring tail `tone('sine', 3800, 3800, 0.5, 0.05, { room: 0.8 })` + recharge whine `tone('sine', 400, 1600, 1.2, 0.03, { delay: 0.2 })` + ready blip `tone('triangle', 1600, 1600, 0.04, 0.06, { delay: 1.4 })`. The blip doubles as a gameplay cue for both players.
- **launcher** (synth as now) + in-flight whistle per live rocket: one oscillator `sine` 1200 -> 900 Hz over the rocket's life, vol 0.05, pan following the rocket, stopped on explode (one voice per rocket, at most 2).
- **bomb** (throw synth as now) + a beep per red blink (3.4): `tone('square', 1800, 1800, 0.03, 0.05)`, panned to the bomb. Through the `audioBudget` gate as a new name `bombBeep` (max 1 per 60 ms).
- **Hit sounds:** keep `hit()` for the victim. The shooter gets a separate confirmation (3.7).

### 3.7 Hit confirmation for the shooter (F-093)
For hits where `e.by === me` and `e.fighter !== me` (offline 1P; in 2P for both players, each tick panned to its shooter's side at ±0.3):
- **Hit tick:** `tone('triangle', 1900, 2300, 0.035, 0.09, { room: 0, bus: 'ui' })`, at most 1 per 50 ms (Uzi). Heavy hits (damage >= 50 or rail/rocket) add `tone('sine', 1200, 1200, 0.06, 0.06, { bus: 'ui' })`. Dry and centred: it is a UI confirmation, not a world sound.
- **Hit marker:** 4 short strokes (ink 0.045 m under paper 0.022 m), forming an X with a gap, 0.35 m across, at the hit point (`e.x, e.y`), screen-facing. It scales 1.25 -> 1.0 over 40 ms, holds, and is gone at 90 ms. Heavy hits: 0.5 m and 120 ms. One pooled sprite set of 4, `depthTest: false`. The shooter only (in 1P, never for the bot's hits on you).
- **Kill confirm** (your KO): `tone('triangle', 1047, 1047, 0.08, 0.13, { bus: 'ui' })` then `tone('triangle', 1568, 1568, 0.12, 0.13, { delay: 0.07, bus: 'ui' })`. When **you** are KO'd: `tone('sine', 330, 196, 0.25, 0.08, { bus: 'ui' })` (a soft "womp", quieter than the kill confirm).
- **Acceptance:** with eyes on your own fighter (not the victim), a tester can tell hit from miss for every gun at 1280x720.

## 4. The KO moment (F-095 normal KO, F-096 final KO)

Budget: a match is 42–60 s with 5–9 KOs (playtest §2). The normal KO beat adds **about 0.28 s of real time per KO** (hit-stop 150 ms as now + a 250 ms tail at half speed = +125 ms). Over 9 KOs that is at most +2.5 s of a match. The final KO stays at 1.5 s from KO to result (today 0.15 + 0.9 + 0.4 = 1.45 s). Timeline: `r035/ko-timeline.png`.

### 4.1 Normal KO (every KO that does not end the match; offline 1P and 2P; online gets the render parts only, no sim change)
| t (ms from the `ko` event) | Channel | What happens |
|---|---|---|
| 0–150 | sim | hit-stop 9 ticks (as now). The victim shudders (as now). |
| 150–400 | sim | **slow tail:** sim speed 0.5x for 250 ms of real time (same mechanism as `finaleScale`, a new `koTailScale`). Offline only. |
| 0–180 | camera | **kick** of 0.30 m along the killing shot's direction (the "push" sells the blow), τ 60 ms. Trauma `huge` as now, exposure flash as now. |
| 0–450 hold, 450–850 ease back | camera | KO beat: `KO_BEAT = { hold: 0.45, back: 0.4, pull: 0.35, zoom: 0.80 }` (was 0.6 / 0.5 / 0.35 / 0.85: tighter and quicker). |
| 0–150 | body | frozen in the hit pose (flinch at peak), white flash. |
| 150–683 | body | **launch and tumble** (render only, the sim fighter is out): `vx = dir x 6 m/s x L`, `vy = 8 m/s x √L`, gravity 30 (the existing fall), spin about z at 1.25 turns over the arc (direction = dir). `L` per killing weapon: pistol, SMG, Uzi, push, wall splat 1.0; shotgun 1.3; rail 1.6; rocket, bomb 1.8. `dir` = sign(victim.x - scorer.x), or -facing when there is no scorer. Clamp x to the arena walls. If the body reaches a wall it **sticks for 120 ms** (squash x 0.8) and slides down: the wall gag. |
| 683 | body | it lands on the ground or the platform under it (the existing `groundBelow`). Bounce: vy x -0.3 once, then the defeat pose settles over 600 ms as now (`poseDeath`, its timer starting at landing, not at the KO). Dust puff at landing: OFFSITE 10 puffs size 1.4; office 8 dust chips. The `land` sound at landing. |
| 60–170 | stamp | **KO! stamp in** (see 4.2) |
| 170–760 | stamp | hold |
| 760–900 | stamp | exit 140 ms |
| 0 | sound | **BONK:** `tone('sine', 180, 60, 0.18, 0.9, { room: 0.3 })` + `click(0, 900, 0.3)` layered with the existing `ko()` (keep its duck -14 dB). |
| 60 | sound | `stamp()` (exists) |
| 150–683 | sound | launch whistle: `tone('sine', 900, 2200, 0.35, 0.07)` then `tone('sine', 2200, 700, 0.18, 0.05, { delay: 0.35 })` (up and over) |
| 0 / 683 | sound | the kill confirm or "womp" (3.7) at 0; `land()` at 683 |

- The `IS OUT` body stays visible until 0.35 s of respawn are left, as now. The respawn timer itself (3 s) is untouched.
- **Reduce motion / shake off:** no camera kick, no trauma, zoom 0.9 instead of 0.80. The launch still plays at 0.6x height and with no spin (the arc carries the joke). The slow tail and hit-stop are unchanged (they are not camera motion).

### 4.2 The KO! stamp (Field Day version of the old `KoStamp`)
- Position: centred, top at **23 % of the stage height** (168 px at 720). **Collision rule:** if either *living* fighter's head is inside the stamp's screen box at the KO, place it at 58 % height instead. The stamp never covers the fighter who is still playing.
- Plate: paper `#FFFBF0`, 6 px grape `#3B1F6B` border, radius 26, drop shadow `0 8px 0` grape, padding 2/34/10 px. Rotation alternates -4° / +3° per KO.
- Line 1: `KO!` in Titan One 92 px, fill **tomato `#F0533A`** (R-027: tomato is the KO token), grape outline 8 px (paint-order stroke).
- Line 2: `{VICTIM} IS OUT` in Titan One 26 px, fill = the victim's accent (roster `fighterView().accent`), grape outline 6 px. In 2P, `P1 IS OUT` / `P2 IS OUT` uses the 2P colours as elsewhere.
- In: scale 1.6 -> 0.94 -> 1.0 over 110 ms (`--ease-spring`), opacity 0 -> 1 over the first 40 ms. Out: scale 1.0 -> 0.9, opacity -> 0, 140 ms. Reduced motion: fade only.
- Stage scale like every Field Day overlay. At 800x450 the plate is about 0.625x and must stay within 16 px of the edges (layout check).
- **The KO feed chip goes** (`Feed` in `FdHud.tsx`): it repeats the stamp, sits 120 px from the top where the eye is not, and it caused overlap bug 5. Who got you and with which gun is already on the respawn card. Keep the score tile pop. Mockup: `r035/after-ko-400ms.png`.

### 4.3 The final KO (F-096)
- Hit-stop **12 ticks (200 ms)** instead of 9 for the match-winning KO (offline only).
- The slow-motion stays (`FINALE = { scale: 0.3, slow: 0.9, hold: 0.4 }`).
- The body launch uses **sim-scaled time** during the slow-motion, so the loser hangs in the air at 0.3x: the money shot. It uses `L` x 1.2.
- Camera: the KO beat on the final uses `zoom 0.70, pull 0.5` and holds through the slow-motion and hold (it does not ease back before the result).
- The KNOCKOUT band as now (its delay already waits for the hit-stop). **No KO! stamp** (rule kept from fight-feel-pages 4.6).
- Sound: BONK + `stampBig()` (exists) instead of `stamp()`, then the existing result stings.
- Total KO to result: 0.2 + 0.9 + 0.4 = **1.5 s** (today 1.45 s). Hard cap: never more than 1.6 s.

## 5. The first minute (F-097)

"First-timer" = `readFinishedMatch()` is false (the existing flag). Everything below is gated on it unless noted.
1. **Home speech bubble:** for a first-timer, the bubble never shows the trait line ("Jump over your rival's head and your dash is ready again"). It shows only the fighter's plain quips. The trait line becomes eligible once the first match is finished (the same once-per-session rule as now). Reason: a stranger does not know what a dash is yet (playtest R7).
2. **Arena name card in the first match:** show the card through the VS doors and the countdown with the **title only** (`OFFSITE`, no flavour line), and hide it **the moment FIGHT! lands** (fade 300 ms) instead of 3 s into the fight. From the second match on, as now (title + line, until 3 s). This also removes the overlap with the KO area.
3. **Respawn card tip:** none on the player's **first death of their first match**. The card shows BACK IN, who got you with what, and COME BACK AS. Tips start from the second death. In every match, **filter tips by arena**: the three office-only tips (desks and table, glass splat, kick off glass) never show on OFFSITE. OFFSITE replacements (true by the sim: the cliffs use the same wall rules as the glass, and boulders and crates are solid styles):
   - `Push your rival into the cliff for a wall splat.`
   - `Kick off the cliff walls to climb fast.`
   - `Boulders and crates stop bullets: fight from behind them.` (**only if** engineering confirms bullets stop on `desk` / `crate` styles on OFFSITE after the debugger's platform fix; otherwise leave this one out).
4. **The respawn card never sits over the key strip:** in the first match it already replaces the strip (`stripShown = !down`). Keep that, and add a check at 1280x720 and 907x510 that the two are never both visible (R6).
5. Not changed: the key strip (8 s / until move, jump and shoot) and the VS doors.

## 6. A solo loop for 1P (F-098)

Playtime = matches x about 50 s. The only lever after match 1 is a reason to play the next one.
1. **Session tally, 1P vs bot** (the twin of the 2P "Tonight" pill), on the result screen under the score pill: `TODAY  YOU {w} – {l} BOT`. It is the same `Pill` + `fd-tally` style. Counts decided matches this page visit (in memory; draws do not count). It is hidden after the first match of the session (1–0 says nothing) and shown from match 2.
2. **Win streak:** when the player has won 2 or more in a row, a sun chip `WIN STREAK {n}` sits next to the tally. When it breaks, the chip shows `STREAK ENDED AT {n}` once, in grey (`--gray-ink`), on that loss screen only. The best streak is saved in localStorage (`pewfield:best-streak`). When a streak beats it, the chip reads `NEW BEST · {n}` with the `ding(2)` sound at the award beat.
3. **Result push after a 1P win:**
   - Bot level below hard: the **primary sun button** becomes `HARDER BOT?` (Enter), with a small chip showing the next level (`NORMAL` / `HARD`). It starts the rematch at the next level, same fighters, same arena. `REMATCH` moves to the white secondary slot (first), then `NEXT ARENA`, then `CHANGE FIGHTER`. Font: if the label is longer than 8 characters, use 34 px instead of 40 (check with `layout-check.mjs` at 1280, 907x510 and 800x450; it must fit on one line).
   - Already on hard: the primary is `NEXT ARENA` (when `canNextArena`), and REMATCH goes secondary.
   - **REMATCH always means the same level as the match just played.** Today the rematch after the first match jumps to the menu's level, so an easy-bot win silently becomes normal. Climbing is now the player's choice through `HARDER BOT?`. Enter mashers climb because Enter fires the primary.
   - After a loss: the primary stays `REMATCH` (same level). The step-down after losses is a systems call (R-036); the UI only shows the level chip on the BOT plate as now.
   - 2P and demo: unchanged.
4. Copy (exact): `HARDER BOT?`, `TODAY`, `YOU`, `BOT`, `WIN STREAK {n}`, `STREAK ENDED AT {n}`, `NEW BEST · {n}`.
5. **Do not** promise "beat all 3 arenas": there are 2 arenas today.

## 7. Gun variety beyond feel (handed to the systems designer as R-036)

I believe part of "plain" is the numbers, not only the juice:
- **SMG and Uzi overlap.** Both are hold-to-spray autos with low knockback (2.5 / 1.2) and short-to-middle falloff. With auto-aim on by default, the player's choice between them barely matters. Ask: give the Uzi one behavioural twist (for example, the carrier moves faster, or wider spread with more knockback up close), **or** retire one of them from `GUN_TABLE`.
- **Hits do not move bodies.** A pistol hit pushes 4 / weight m/s, so the victim barely shifts. The leaders' fun is knockback. Ask: whether the small arms can carry more knockback without breaking the 46–54 % balance band.
- **The bot ladder for "HARDER BOT?"**: what normal and hard must be (playtest R1: normal lost 2 of 3 to a masher) and the quiet step-down after losses.
I am **not** changing any stats. F-090..F-098 do not depend on R-036.

## 8. Order, effort and acceptance

| Order | F | What | Effort [Estimate] |
|---|---|---|---|
| 1 | F-095 | KO! stamp, feed removed, launch and tumble, slow tail, BONK | 3–4 h |
| 2 | F-093 | hit tick, hit marker, kill confirm | 1 h |
| 3 | F-090 | muzzle flash geometry per gun | 2 h |
| 4 | F-092 | per-gun sound layers (Uzi split, SMG pitch walk, rail recharge, bomb beeps, rocket whistle) | 2 h |
| 5 | F-091 | recoil table, camera kick, per-gun hit-stop | 2 h |
| 6 | F-097 | first-minute text diet + arena tips | 1 h |
| 7 | F-098 | solo tally, streak, HARDER BOT? push | 2–3 h |
| 8 | F-094 | impacts by surface, shells, tracer sizes, rail beam, bomb fuse | 3 h |
| 9 | F-096 | final KO: 12 ticks, airborne slow-mo body, zoom 0.70 | 1 h |
| 10 | F-099 | gun in-hand scale 1.3 -> 1.6 (P2) | 20 min |

F-099 detail: `S = 1.3` -> `1.6` in `guns.ts` for guns in hand and on the floor. Condition: the flash sits at the drawn tip, and tracers start at the sim `muzzle()` (0.7 m from the chest). If the scaled tip ends more than 0.15 m past the sim muzzle for any gun (a tracer would appear to start inside the barrel), use 1.45 for that gun. If it still fails, skip F-099. It is the least important item.

**Global acceptance (I review from captures):**
1. A frame sheet per gun at 1280x720 on OFFSITE (`shots/r035/capture.mjs` gives the "before" harness): the flash reads as fire on sky and on sand, and no hexagon is left.
2. A KO frame sheet at 0 / 150 / 300 / 450 / 700 / 900 ms: the stamp is centred and does not cover the living fighter, the body is in the air at 300 ms and down by 700 ms, and no feed chip is shown.
3. Final KO: the body is airborne during the slow-motion and the result appears no later than 1.6 s after the KO (measure `gameplayStop` against the `ko` event).
4. **No new first-use hitch** (R4): every new material and geometry is compiled in the existing pre-compile pass. The QA scripts' longest frame in the first KO, the first shot of each gun and the first shell must stay under 50 ms on the M1 rig.
5. Reduce motion: no camera kick and no shake. Flashes, stamps and the tumble still play, reduced as stated.
6. Draw calls in a fight with everything firing: at most +6 over today (2 flashes unchanged, 2 shell instanced meshes, the hit-marker pool, the beam's second box).
7. `vitest`: rematch and result tests extended for the 1P tally and the HARDER BOT? primary. Sound: every new voice obeys `SHOT_BUDGET` / `audioBudget`.

## 9. Must not change
- Sim rules, damage, stats, respawn 3 s, kos-to-win, the round timer.
- Online behaviour (it is parked; when it returns, effects come from the predicted step only).
- The Field Day palette: no new UI colours. In-world VFX use the existing `PALETTE.orange`, sun, ink, paper, coil blue and walnut.
- The KNOCKOUT band, the result showpiece and the awards (F-074/F-075).
- The guns' volume default (0.45, Reis).

## 10. Not verified (be honest)
- **No sound was heard.** The sound parameters are written from the synth code and my judgement. Every one needs a human listen at the default mix before shipping.
- The flash, stamp and arc are **mockups** (SVG over a real frame), not built. Sizes at 1280 were judged against a 45–70 px fighter. The 1.25x flash size was chosen for that and still needs a look in the build.
- The surface detection (ground, wood, wall, metal) assumes the renderer can classify impacts from position. Metal may not be separable.
- That bullets stop on OFFSITE crates and boulders (the debugger is fixing pass-through now). Tip 5.3c depends on it.
- The time cost per KO is from the timing table, not measured in play.
- The leader behaviours marked [Memory] were not replayed today.
- Whether the slow tail (0.5x for 250 ms) feels like lag to a human. If a playtest says so, drop the tail first and keep the hit-stop.
