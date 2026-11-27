# Arena 2 — "OFFSITE" (bright desert, R-016)

Owner: Creative Director. Status: ready for engineering (2026-11-28). Blockout: `arena-2-blockout.svg` (same folder; side view, 1 m = 40 px, every number below is drawn there).

The office (Floor 42) stays as it is, as the second arena. Nothing in this spec changes the office.

---

## 0. Problems first (what this spec has to fix, and what it cannot)

1. **The office is not mainly a colour problem, it is a noise problem.** Measured (section 3): against the night office Hotfix's orange hood already reads well (ΔE 101–104 against the night wall and the city fog, contrast ratio 4.5 against the wall). It fails in two places: the **oak floor** (ΔE 47, contrast ratio 1.06, so the hood is the same brightness as the boards) and **every fighter's dark trousers against the dark room** (ink trousers against the night wall: ΔE 19, contrast ratio 1.04, so the lower body disappears). The rest is clutter. My screenshots of the live demo (`/arena?p1=hotfix&p2=legacy&bot=hard&demo`, 1280x720, real GPU) show hundreds of lit city windows, hanging rods, monitors, a whiteboard, wall monitors and pillars, all as bright as or brighter than the fighters. **Owner's premise, corrected once:** a desert alone does not make the red fighter "pop more" than a night sky does. It pops because the background goes quiet (low detail, low saturation) and because the dark trousers finally have a light background to show against. The spec is built around that, not around "yellow sand".
2. **The weakest read in a bright arena is Intern's white shirt** (`#eef1f6`): ΔE only 25–36 against the pale sky. Accepted: Intern still reads through the red beanie (ΔE ≥ 45 on every surface), the gold backpack (ΔE 87–102 against the sky) and the ink trousers (contrast ratio ≥ 3.3 on every surface). No fighter recolour is asked for in this request.
3. **The bot does not path-find** (TECHNICAL.md §bot). The lookouts (y 7.8) can only be reached from the boardwalks. A bot standing on the floor under a lookout cannot jump straight up to a rival on it, and the office's balconies have the same problem. Engineering must watch for it in the demo check (acceptance criterion A7).
4. **`menuSpotX()` looks up the `table` style.** Arena 2 has no table, so this crashes or returns garbage. It must become per-arena data (section 4.6).
5. **Draw calls:** the office measured 472–522 `renderer.info.render.calls` per frame in the demo URL above (5 samples, 1280x720, my run). Engineering's own raw-WebGL hook measured about 481–486 (LOG, weight pass). Arena 2 must come in at or under the office, measured the same way (section 6).

---

## 1. Reference study (what I looked at, what I took, what I left)

Verified = I read the source. Interpretation = my reading for this game.

| Reference | Verified | What it teaches Floor 42 (interpretation) |
| --- | --- | --- |
| **Super Smash Bros. "Battlefield"**, the standard competitive neutral stage | SSBWiki: "a simple, hazardless layout with three floating platforms arranged above a solid base platform"; legal starter in singles and doubles; StrategyWiki: "no character benefits significantly from its layout". [ssbwiki.com/Battlefield_(SSBU)](https://www.ssbwiki.com/Battlefield_(SSBU)), [ssbwiki.com/Legal_stage](https://www.ssbwiki.com/Legal_stage), [strategywiki 3DS stages](https://strategywiki.org/wiki/Super_Smash_Bros._for_Nintendo_3DS/Stages) | A solid base plus a few soft platforms in a symmetric triangle is the layout competitive players trust. Arena 2 uses the same idea: one ground, soft platforms in a symmetric pyramid, nothing that moves. |
| **Brawlhalla**: The Great Hall, Thundergard Stadium, Kung Foot Arena | Fan wiki (via search; the page itself returned 402 to my fetch): the small Great Hall is a flat main stage with three soft platforms, "intended for 1v1"; Kung Foot is "relatively flat, with two raised areas … and two small soft platforms in the middle". [brawlhalla.fandom.com/wiki/The_Great_Hall](https://brawlhalla.fandom.com/wiki/The_Great_Hall), [brawlhalla.wiki.gg/wiki/Kung_Foot_Arena](https://brawlhalla.wiki.gg/wiki/Kung_Foot_Arena) | A 1v1 map needs very few pieces: 3–5 soft platforms plus raised ends. The office's 23 pieces are about 3x what the genre's 1v1 maps use. |
| **TowerFall** (Matt/Maddy Thorson) | Gamedeveloper interviews: Thorson calls Melee his biggest influence and studied its level design; the game is "extremely simple and exceptionally fun", "designed … to be layered"; Thorson added trails and particles "to make it more readable". [Road to the IGF](https://www.gamedeveloper.com/design/road-to-the-igf-matt-thorson-s-i-towerfall-ascension-i-), [The magic of TowerFall](https://www.gamedeveloper.com/design/the-magic-of-i-towerfall-i-depth-simplicity-community) | Simple geometry, depth from the mechanics. Our mechanics (rocket jumps, push into walls, drop-through, power weapons on top) carry the depth, so the map can stay plain. |
| **Team Fortress 2**: readability art direction, and its desert maps | TF2 wiki summary of Valve's SIGGRAPH 2007 paper: characters have "distinct silhouettes that can be easily identified even with no lighting cues"; environments use "muted colours dominating and small areas of saturation"; characters "are always highlighted with an appropriate rim term". [wiki.teamfortress.com](https://wiki.teamfortress.com/wiki/Illustrative_Rendering_in_Team_Fortress_2), paper PDF [Princeton mirror](https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf) | The rule this spec follows: a **muted, low-detail world and saturated fighters**. The only saturated spots in Offsite are the gold flag and the "42" on the water tower. |
| **Rooftop Snipers** (New Eich Games, CrazyGames) | CrazyGames listing: two buttons (jump, shoot), first to 5, local 2P or bot; "many of its stages include physical objects that add chaos". [crazygames.com/game/rooftop-snipers](https://www.crazygames.com/game/rooftop-snipers) | The CrazyGames audience accepts, and likes, an arena you understand in one glance: one rooftop, two figures against a big plain sky. We take the plain sky, not the one-platform layout (our guns and pushes need height). |
| **Getaway Shootout** (New Eich Games, Poki) | Poki listing: race 3 rivals to an extraction point, jump obstacles, collect weapons; 4.3 from about 1.1 M ratings (PL page). [poki.com/pl/g/getaway-shootout](https://poki.com/pl/g/getaway-shootout) | Same audience: bright, flat-colour scenery with few objects, and characters that are the most saturated thing on screen. |
| **Duck Game, Gun Mayhem 2** | Searched; I found no first-party or reliable layout source. Not used. | — |

**Not copied:** no layout, silhouette, prop or colour from any of these. The pyramid of soft platforms is a genre convention. The cliffs, water tower, timber lookouts and offsite theme are ours.

---

## 2. Theme: "OFFSITE"

**The pitch:** the same four developers, dragged to a mandatory company team-building offsite in a desert canyon. A timber lookout tower, two scaffold boardwalks, two lookouts bolted to the canyon walls, a water tower with the company's "42" painted on it. Midday sun, open sky.

Why this theme and not plain "desert":
- **It keeps the game's identity.** Floor 42 is office comedy. "Offsite" stays office comedy: same people, same company, new place. A plain desert would read as a different game (a western). No cowboys, no saloon, no skulls.
- **It explains the geometry.** Cliffs are the walls (wall-kick, wall splat). Scaffold and lookouts are the one-way platforms. Boulders and supply crates are the solid cover. Every collision object looks like what it does.
- **It is the opposite of the office in every reading dimension:** day against night, warm-light against dark-blue, about 10 visible objects against about 60, sky against a city. A player who switches arenas feels a real change.

Rejected: **salt flat** (too white, Intern disappears), **dusk desert** (loses the "bright" brief, and the fighters' dark trousers vanish again), **beach** (blue sea fights Standup's blue top), **snow** (white, same Intern problem), **rooftop by day** (too close to Rooftop Snipers, and still a city).

---

## 3. Colour and readability (measured)

Method: sRGB → CIELAB (D65), ΔE76 and the WCAG contrast ratio (CR), computed with a script in my scratchpad (not in the repo). Rough guide: ΔE above 40 reads at a glance; below 25 is weak. These are flat material colours. Lighting and ACES tone mapping will shift them, so acceptance criterion A3 re-measures from a screenshot.

### 3.1 Fighter key colours against the Offsite backgrounds (ΔE / CR)

| Fighter colour | Sky top `#6fbbe3` | Sky low `#98cde8` | Far mesa `#e3bc9c` | Mid butte `#d49a78` | Sand `#efcf98` | Cliff lit `#d6a47c` | Rock top `#e6b884` | Plank top `#b8966b` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hotfix hood `#f2542d` | 109 / 1.6 | 103 / 2.0 | 63 / 2.0 | 51 / 1.4 | 65 / 2.3 | 54 / 1.6 | 57 / 1.9 | 59 / 1.3 |
| Legacy shirt `#2ec27e` | 65 / 1.1 | 61 / 1.3 | 64 / 1.3 | 71 / 1.1 | 60 / 1.5 | 67 / 1.0 | 65 / 1.3 | 61 / 1.2 |
| Standup top `#3e7bfa` | 58 / 1.8 | 66 / 2.3 | 95 / 2.2 | 97 / 1.6 | 107 / 2.6 | 99 / 1.8 | 105 / 2.1 | 99 / 1.4 |
| Intern shirt `#eef1f6` | **36** / 1.9 | **25** / 1.5 | **31** / 1.6 | 43 / 2.1 | **36** / 1.3 | 41 / 2.0 | 41 / 1.6 | 44 / 2.4 |
| Intern beanie `#e23d5c` | 93 / 2.0 | 89 / 2.4 | 61 / 2.4 | 50 / 1.7 | 70 / 2.8 | 55 / 1.9 | 61 / 2.3 | 59 / 1.5 |
| Intern pack `#ffc93c` | 102 / 1.4 | 93 / 1.1 | 52 / 1.2 | 50 / 1.6 | 41 / 1.0 | 47 / 1.5 | 41 / 1.2 | 49 / 1.8 |
| Trousers ink `#1b1f2e` | 65 / 7.7 | 69 / 9.5 | 74 / 9.3 | 69 / 6.8 | 84 / 11.0 | 71 / 7.4 | 79 / 9.0 | 65 / 5.9 |

The office for comparison: Hotfix against the oak floor ΔE 47 / CR 1.06; ink trousers against the night wall ΔE 19 / CR 1.04, against the city fog ΔE 29 / CR 1.8.

**What the numbers say:**
- **Hotfix (the red fighter)** sits on a complementary blue for most of the frame (ΔE 103–109). His worst Offsite case (the mid butte, 51) is still better than his worst office case (the oak floor, 47). Buttes are kept **out of the centre** of the frame for this reason (section 5.4).
- **Every fighter's dark trousers** go from invisible (office ΔE 19) to the strongest read on screen (CR 5.9–11). This is the single biggest readability gain, and it is why "bright" works here.
- **Legacy** separates by hue, not brightness (CR about 1.1–1.5, ΔE 60–71). Fine at our size, but this is why **no green appears anywhere in the arena** except the muted sage cactus (`#7d9466`, ΔE 39 to Legacy). Cacti never stand directly behind a spawn or a platform.
- **Intern's shirt** is the weak spot (bold values). Accepted, see section 0.2.

### 3.2 Palette (all of Offsite; nothing outside this list)

| Token | Hex | Use |
| --- | --- | --- |
| `sky.top` | `#6fbbe3` | sky gradient, top of the frame |
| `sky.low` | `#98cde8` | sky gradient bottom (meets the mesas), `scene.background` |
| `sun` | `#fff6dc` | sun disc and halo (upper left, matches the key light) |
| `mesa.far` | `#e3bc9c` | far butte silhouettes (hazed) |
| `mesa.mid` | `#d49a78` | mid buttes (only at the left and right thirds) |
| `dune` | `#ebc790` | near dune band behind the floor |
| `sand` | `#efcf98` | the floor top; ripple texture second tone `#e6c288` |
| `sand.edge` | `#c9a070` | floor front lip, pebbles |
| `cliff.lit` | `#d6a47c` | the canyon walls, faces toward the arena |
| `cliff.shade` | `#a86d50` | cliff faces away from the sun, under-ledges |
| `cliff.strata` | `#e8c29a` | the floor cut bank only (F-035). **Not on the cliff faces** (R-020: pale = plank lip = "you can stand here") |
| `cliff.groove` | `#b98463` | R-020: strata on the cliffs, darker than `cliff.lit`, so they read as cracks in the rock, never as ledges |
| `rock.top` / `rock.side` / `rock.lip` | `#e6b884` / `#b97c57` / `#f6d9aa` | the two boulders |
| `plank.top` / `plank.side` / `plank.lip` | `#b8966b` / `#6e5440` / `#e8cf9e` | boardwalks, lookouts, tower deck and roof |
| `timber` | `#7a5c43` | posts, braces, water tower legs, flag pole |
| `rope` | `#d9c7a0` | rope rails on the back edge of planks |
| `crate` | `#8a6a4a` | the two supply crates; straps in `ink` `#1b1f2e` |
| `canvas` | `#f3ede0` | water tower tank, bomb parachute |
| `cactus` | `#7d9466` | saguaros |
| `gold` | `#ffc93c` (= PALETTE.gold) | the only saturated accent: tower flag, "42" on the water tower, parachute stripe |

Rule: walkable tops are the lightest face of their object and carry a light lip (the same rule as docs/ARENA.md §6.1). Decor is thinner, darker or further back than anything you can stand on.

---

## 4. Layout (sim data)

Bounds are unchanged so the camera, HUD and drop code keep working: `left -18, right 18, floor 0, ceiling 13.5`. Symmetric about x = 0 (a 1v1 online map: either seat has to be fair). The only asymmetry is in decoration (the sun at the left, the water tower right of centre).

### 4.1 Platforms (10 pieces; the office has 23)

`style` is the collision rule. I reuse the office's rule styles so the sim needs no new rules; `skin` is what the renderer draws for `arena: 'offsite'`. If engineering prefers new style ids (`rock`, `plank`), they must behave exactly as the rule column says.

| # | Name | x0 | x1 | y (top) | base | style (rule) | skin | Class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Boulder L | -14.6 | -12.2 | 1.4 | — | `desk` | rock | solid from the floor; floor cover |
| 2 | Boulder R | 12.2 | 14.6 | 1.4 | — | `desk` | rock | solid from the floor |
| 3 | Boardwalk L | -11.4 | -3.4 | 4.0 | — | `walkway` | plank | one-way |
| 4 | Boardwalk R | 3.4 | 11.4 | 4.0 | — | `walkway` | plank | one-way |
| 5 | Supply crate L | -4.5 | -3.4 | 5.0 | 4.0 | `crate` | crate | closed box on boardwalk L, its inner end |
| 6 | Supply crate R | 3.4 | 4.5 | 5.0 | 4.0 | `crate` | crate | closed box on boardwalk R |
| 7 | Tower deck | -2.4 | 2.4 | 7.0 | — | `walkway` | plank | one-way |
| 8 | Lookout L | -17.9 | -10.6 | 7.8 | — | `walkway` | plank | one-way, bolted to the left cliff |
| 9 | Lookout R | 10.6 | 17.9 | 7.8 | — | `walkway` | plank | one-way, bolted to the right cliff |
| 10 | Tower roof | -3.6 | 3.6 | 10.4 | — | `walkway` | plank | one-way, the summit |

Paste-ready (same shape as today's `ARENA.platforms`):

```ts
platforms: [
  { x0: -14.6, x1: -12.2, y: 1.4, style: 'desk' },            // boulder L (skin: rock)
  { x0: 12.2, x1: 14.6, y: 1.4, style: 'desk' },              // boulder R
  { x0: -11.4, x1: -3.4, y: 4.0, style: 'walkway' },          // boardwalk L (skin: plank)
  { x0: 3.4, x1: 11.4, y: 4.0, style: 'walkway' },            // boardwalk R
  { x0: -4.5, x1: -3.4, y: 5.0, base: 4.0, style: 'crate' },  // supply crate L
  { x0: 3.4, x1: 4.5, y: 5.0, base: 4.0, style: 'crate' },    // supply crate R
  { x0: -2.4, x1: 2.4, y: 7.0, style: 'walkway' },            // tower deck
  { x0: -17.9, x1: -10.6, y: 7.8, style: 'walkway' },         // lookout L
  { x0: 10.6, x1: 17.9, y: 7.8, style: 'walkway' },           // lookout R
  { x0: -3.6, x1: 3.6, y: 10.4, style: 'walkway' },           // tower roof
],
```

Headroom: a 2.0 m fighter on the roof has its head at 12.4, 1.1 m under the ceiling (the office's beam leaves 0.9). Fine for jumping and shooting.

### 4.2 Reachability (checked with the real numbers)

Inputs: `PHYS.gravity 42`, `airAccel 50`, `maxFall 24`, ground jump `vy = CHARACTERS.jump`, air jump `vy = jump × 0.88` (step.ts:589–600), landing when the middle half of the body overlaps and the feet cross the top while falling (TECHNICAL.md §Platforms). Analytic single-jump apex `jump²/(2·42)`: Hotfix 3.24, Legacy 2.75, Standup 3.44, Intern 3.12 m. Single plus one air jump at the apex: Hotfix 5.75, **Legacy 4.88 (the limit case)**, Intern 5.54, Standup 8.77 (two air jumps).

I also ran a tick-by-tick simulation (60 Hz, every take-off point on the source in 0.25 m steps, both directions, standing and running starts, every air-jump tick and air-control release time; solid sides block). The result is the cheapest jump that lands **on the target first**:

| Move | Hotfix | Legacy | Standup | Intern |
| --- | --- | --- | --- | --- |
| floor → boulder (1.4) | single | single | single | single |
| boulder → boardwalk (+2.6, gap 0.8) | single | single* | single | single |
| floor → boardwalk (4.0) | double | double | double | double |
| boardwalk → crate (+1.0) | single | single | single | single |
| crate → tower deck (+2.0, gap 1.0) | single | single | single | single |
| boardwalk → tower deck (+3.0) | single | double | single | double |
| boardwalk → lookout (+3.8, 0.8 m overlap) | double | double | double | double |
| tower deck → roof (+3.4, straight up) | double | double | double | double |
| lookout → roof (+2.6, 7.0 m gap) | double | double | double | double |
| tower deck → lookout | double | double | double | double |
| boardwalk L → boardwalk R (6.8 m gap) | double | **no** (use the crates, the deck or a dash) | double | double |
| floor → tower deck directly | no | no | double | no (by design: go round) |

\* Legacy's single jump clears 2.75 against a 2.6 step: 0.15 m margin, so in practice he double-jumps. No route depends on it.

Every platform is reachable by every fighter without wall-kicks or dashes. The worst required step is 4.0 m (floor → boardwalk) against Legacy's 4.88 m. Main climb (blockout arrows): floor → boulder → boardwalk → crate → deck → roof, all single jumps except the last.

### 4.3 Spawns (R-020 rev. 2; the sim picks start and respawn spots at random among those > 12 m from the rival, so there is no fixed "start pair")

**Spawn rule (hard, R-020):** every spawn is **≥ 9.0 m** (straight line) from every power spot (G4) **and** needs at least one double jump onto another platform to reach it; every spawn is **≥ 2.0 m** from every regular gun spot (G0–G3), so you always walk to your first gun. Rev. 1 broke this: S5/S6 stood 0.5 m from the lookout launcher spot, S4 3.4 m under the roof spot, and S0–S3 sat exactly on G1/G2 spots (playtest R-020: spawned on a launcher, auto-picked, KO at 1.6 s).

```ts
spawns: [
  { x: -11, y: 0 },     // S0 floor L, under boardwalk L      (to lookout L power 9.26 m, roof 15.1)
  { x: 11, y: 0 },      // S1 floor R
  { x: -7.5, y: 4.0 },  // S2 boardwalk L                     (lookout L 9.31, roof 9.86)
  { x: 7.5, y: 4.0 },   // S3 boardwalk R
  { x: -4.5, y: 0 },    // S4 floor L, inner                  (roof 11.33, lookout L 13.9)
  { x: 4.5, y: 0 },     // S5 floor R, inner
],
```

Removed: boulder spawns (6.9 m under the lookout power spot; Standup reaches the lookout in one jump sequence), tower deck spawn (3.4 m under the roof), lookout spawns (on the power spot). Minimum spawn → power distance is now 9.26 m (S0/S1), minimum spawn → regular gun 2.0 m (S0 → G0 ±9; S2 → G1 ±5.5).

### 4.4 Gun spawns (same structure and tables as the office; the power entry stays last)

```ts
gunSpawns: [
  { spots: [{ x: 0, y: 0 }, { x: -9, y: 0 }, { x: 9, y: 0 }], kinds: GUN_TABLE },          // G0 floor
  { spots: [{ x: -5.5, y: 4.0 }, { x: 5.5, y: 4.0 }, { x: 0, y: 7.0 }], kinds: GUN_TABLE }, // G1 mid (R-020: was ±7.5, on the boardwalk spawns; 5.5 is 1.0 m clear of the crate)
  { spots: [{ x: -13.4, y: 1.4 }, { x: 13.4, y: 1.4 }], kinds: GUN_TABLE },                // G2 second floor gun, on the boulders
  { spots: [{ x: -10, y: 4.0 }, { x: 10, y: 4.0 }], kinds: GUN_TABLE },                    // G3 second mid gun, outer boardwalk
  { spots: [{ x: -16, y: 7.8 }, { x: 16, y: 7.8 }, { x: 0, y: 10.4 }], kinds: POWER_TABLE, respawn: 15, firstAt: 10 }, // G4 power: lookouts and roof
],
```

**R-020 `firstAt: 10` (new optional field, Offsite only, absent on the office so its data hash stays):** the power entry is not placed at match creation; it first appears 10 s after FIGHT (then `respawn: 15` after each pickup as before). The first 10 s of every match is a pistol/SMG fight, and the launcher becomes a visible mid-round event instead of a spawn gift. If engineering prefers not to add a field, the fallback is `respawn`-style: create the G4 pickup inactive with `respawn = 10`.

Every spot is on a surface (checked: each x lies inside its platform's x0..x1, each y equals its top). The office's floating-gun bug (ARENA.md mismatch 1) cannot recur.

### 4.5 Drops and walls
- `dropEvery 18`, `dropSlots 2`, `dropKinds ['bomb']`: unchanged. The x stays random (step.ts). Visual: the bomb appears just above the top of the frame under a small parachute (`canvas`, with one `gold` stripe, 0.6 m), falls at the sim's speed, and the chute detaches and fades in 0.3 s on landing. No ceiling object is drawn: Offsite has open sky.
- Walls at x = ±18: **sandstone cliffs replace the glass**. Same collision (clamp, wall-kick, wall splat at > 11 m/s). The wall splat effect: the crack decal (existing crack system, texture recoloured to crack lines `#7a4a32` on transparent), a dust burst (8–12 puffs `#f0d6a8`, 0.4 s, reuse `vfx.puff`) and 3 falling pebbles (`sand.edge`). Sound: rock crunch instead of glass. Engineering should file it with whoever owns SOUND.md, not invent it.

### 4.6 Other per-arena data
- `menuSpotX` for Offsite = **5.2** (open floor right of centre, under boardwalk R with 2 m of headroom above a 2.0 m fighter). Make it a field of the arena data, not a lookup of `table`.
- The menu backdrop stays **the office** (brand: "Floor 42", dark UI). Offsite is only the arena where matches are played (section 8).

### 4.7 Sight lines and cover (why this layout plays well)
- **Floor lane:** 24.4 m of open floor between the boulders, under the tower. The boulders (1.4 m) are the only floor cover. A crouched fighter (52 % of 1.5–2.0 m = 0.78–1.04 m) is fully hidden behind one; a standing fighter shows head and shoulders. The pistol's falloff (45 % at 20 m) makes a long floor duel a losing trade, which pushes players up.
- **Mid:** the crates at the inner ends of the boardwalks block flat shots between the two boardwalks (crate sides stop every shot), so the mid fight is about peeking over a crate or going up to the deck.
- **The tower is shade:** the deck and roof are one-way planks, and one-way planks stop every shot crossing them. A fighter under the tower is covered from above; a fighter on the deck is covered from the roof.
- **Power duel:** the railgun and rockets spawn only on the lookouts and the roof. Lookout ↔ roof is a long diagonal (blockout red line). The rail ignores furniture, so cover does not save you from it. Height and dashing do.
- **Wall splat zones:** both lookouts end against the cliffs (push someone off the outer end into the wall), and each boulder leaves 3.4 m of floor to the wall, enough to push someone into it.
- **Rocket jumps:** the open sky means there is no ceiling clutter to explode on. A rocket jump from a boardwalk reaches a lookout or the roof.

---

## 5. Art

### 5.1 Light (bright, warm, strong silhouettes)
Replace the office's 1 hemisphere + 2 directional + 3 point lights with **1 hemisphere + 2 directional, no point lights**:

| Light | Colour | Intensity | Position / setup |
| --- | --- | --- | --- |
| `HemisphereLight` | sky `#d8eefa`, ground `#e8c391` | 1.2 | — |
| Key (sun) `DirectionalLight` | `#fff0d4` | 2.0 | position (-12, 26, 14); `castShadow`; map 2048; shadow camera left -21, right 21, top 17, bottom -6, near 1, far 60 (as office); bias -0.0005 |
| Back rim `DirectionalLight` | `#ffc9a0` | 0.5 | position (8, 4, -18); no shadow. A warm rim that separates fighters from the sky |

- `scene.background = #98cde8`; `scene.fog = Fog(#e6cfb2, 70, 220)`. As in the office, the fog only reaches the backdrop and never tints the fight plane.
- Tone mapping stays ACES. **Exposure for Offsite: 0.95** (office 1.05). The hit-flash formula stays relative: `0.95 + flash * 3`.
- Sky and backdrop materials: `MeshBasicMaterial` with **`toneMapped: false`**, so the hex values above reach the screen as written. Otherwise ACES dulls the sky blue.
- Shadows: the sun is high and in front, so shadows fall down and to the right, short, onto the platforms below. The fighters' blob shadows stay.

### 5.2 Ground
Floor box exactly as the office (`W + 1.2` × 0.5 × 6.6 at (0, -0.25, -0.5)), material `sand`, roughness 1, metalness 0, with a 256×64 canvas texture of soft horizontal ripples (two tones `#efcf98` / `#e6c288`, repeat `W/4` × 1.6). Front lip strip `sand.edge` (replaces the office's ink strip). Under the floor, instead of "the building below floor 42": a block of `cliff.shade` (`W + 10` × 14 × 0.6 at (0, -7.5, 2.6)).

### 5.3 Fight-plane pieces (z as the office: fight plane z between -1.3 and +0.5)
- **Boulder:** a low-poly block with a flat top exactly at `y`, sides bevelled at most 0.15 m **below** the lip, never above it. Top `rock.top`, front and sides `rock.side`, 0.06 m `rock.lip` strip on the front top edge. Its collision box and its drawn box match to ±0.05 m (no overhang: ARENA.md mismatches 4–5).
- **Plank (boardwalks, lookouts, deck, roof):** 0.22 m thick, top `plank.top`, lip `plank.lip` 0.04 m, sides and underside `plank.side`. Rope rail **only on the back edge** (z -1.2, 0.9 m high, `rope`, 2 strands, 0.03 m). Supports, all `timber`, 0.18 m square, at z -1.1, behind the fighters:
  - boardwalks: posts from the floor at x ±9.5 and ±5.5;
  - lookouts: one diagonal brace each, from the cliff at (±17.9, 5.6) to (±13.2, 7.7);
  - tower: 4 posts at x ±2.2, two at z -1.1 and two at z -1.4 (so they read as a tower in perspective), from the floor to the roof underside. The posts pass **behind** the deck; they must not pierce any walking surface (ARENA.md mismatch 6).
  - **No hanger rods anywhere.** That is a large part of the office's visual noise.
- **Supply crate:** the office crate builder, recoloured `crate` with `ink` straps. Collision and drawn box match.
- **Cliffs:** per side, 3 stacked low-poly boxes (y 0–4.6, 4.6–9.2, 9.2–15), inner face exactly at x = ±18, 2–3 m thick outward, each box offset ±0.3 m in z for a broken edge. `cliff.lit` on the face toward the arena, `cliff.shade` on the others. **Strata (R-020 rev.):** no band on the arena-facing (±x) face at all: any horizontal line on that face recedes in z, reads as a slanted plank, and wall-sliding fighters look perched on it. Instead, on each box's **front (+z) face**, seen square-on: two `cliff.groove` `#b98463` bands, 0.18 m high, at y 2.2 / 3.9, 6.1 / 8.3, 10.9 / 13.0, flush (0.01 m proud), so they read as horizontal rock layers. Rule added: **nothing on a cliff is lighter than `cliff.lit` except the lit cap at each box top, and those caps stay outside x ±18.**

### 5.4 Background layers (back to front; each layer one merged mesh)
1. **Sky:** gradient plane `sky.top` → `sky.low` (the existing sky-plane approach), plus the sun disc (`sun`, radius equal to about 3 % of screen height, soft halo opacity 0.55) at the **upper left**, never behind the roof or the HUD score.
2. **Far mesas** (z about -140): 3–4 flat-topped butte silhouettes, `mesa.far`, flat colour; their tops sit at about 40 % of screen height at match start.
3. **Mid buttes** (z about -70): 2 buttes, `mesa.mid`, one in the left third and one in the right third. **The centre third stays sky**, so the tower and the roof fight read against blue.
4. **Near dunes** (z about -25): a soft rolling band, `dune`, reaching about 1.5–2 m above the floor line in screen terms.
5. **Water tower** (landmark, z about -30, right of centre at about x 5–6): 4 `timber` legs, a `canvas` tank, a `gold` "42" painted on the tank (Bungee, as in the HUD). Its top stays below the roof line and does not overlap the HUD score. It is the arena's one "this is our company" joke.

### 5.5 Props (4 types; the office has about 20)
| Prop | Count | Where | Colour | Collision |
| --- | --- | --- | --- | --- |
| Saguaro cactus | 3 | (x -16.2, z -2.6, h 3.0), (x -6.5, z -5.0, h 1.8), (x **7.5**, z -3.4, h 2.4) (R-020: was 9.6, 1.4 m from the new floor spawn S1) | `cactus`, flat shaded, no spines | none |
| Pebble scatter | 2 clusters per cliff foot + 1 per boulder | floor, z -2.0 to -0.5 | `sand.edge`, `rock.side` | none |
| Tower flag | 1 | pole from the roof at x 0, z -1.3, to y 12.6; flag 0.9 × 0.45 | pole `timber`, flag `gold`; waves (vertex sine, 1 Hz) | none |
| Water tower | 1 | section 5.4 | `canvas`, `timber`, `gold` | none |

Nothing else static. No signs, no text in the world apart from "42", no vehicles, no neon. Moving life (two vultures, one tumbleweed, blowing sand) is allowed **only** under the rules of section 5.6; that section replaces the earlier "no tumbleweeds, no animals" line (R-017).

### 5.6 Ambient life (R-017)

Owner: "I like it, it looks nice … but create liveliness." The canyon breathes through **one wind** that everything answers to, plus a few far-off living things. Seven elements, nothing more. Calm stays the rule: all motion lives **behind** the fight plane or above the ceiling, is pale or far away, and answers the fight only in short bursts.

**Problems first.**
- Liveliness is a readability risk. Anything that moves near the fighters looks like a projectile, a pickup or a hazard. The rules R1–R7 below are hard limits, not taste.
- I earlier banned tumbleweeds and animals (section 5.5). I'm keeping that ban for the fight plane and lifting it only for far layers: one tumbleweed on the dune band (z -25) and two vultures at z -60. A lizard on a rock, a water-tower drip and a team-building banner are **rejected**. The first two are under 20 px at our camera, so they cost work and nobody sees them. The banner needs text, and "42" is the only text in this world.
- Screen sizes below are [Estimate]: derived from the measured follow camera (fighter 1.85 m ≈ 100 px at about 20 m from the camera, LOG R-011), so about 54 px/m at the fight plane, 24 px/m at z -25, 13.5 px/m at z -60 and 7 px/m at z -140.
- Not verified: how any of this looks in the engine. This is a spec, and acceptance criteria L1–L5 check it.

**Wind (the driver, 0 draw calls).** One render-side value `wind` from 0 to 1, always blowing **+x** (from the sun side, left to right). Base 0.25 ± 0.05 (sine, 9 s period). A **gust** fires every 6–11 s (uniform random): it rises to its peak in 0.5 s (ease-out), holds 1.0 s and falls back in 1.8 s (ease-in). Peak 1.0 (60 % of gusts) or 0.7 (40 %). Use its own RNG seeded from the match seed, **never the sim RNG**. Wind is cosmetic, so online clients may disagree (accepted). Every element below reads `wind`. That shared timing is what makes the canyon feel alive and not just animated.

| # | Element | Where (world) | Size / colour | Motion (exact) | Low tier | Draw calls |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Tower flag** (existing, upgraded) | roof pole, x 0, z -1.3, top y 12.6 | 0.9 × 0.45 m, `gold` | Vertex sine: frequency `1.0 + 1.4·wind` Hz, tip amplitude `0.05 + 0.10·wind` m, droop 25° at wind 0.25 easing to 5° at wind 1. Always streams to +x. | on (same shader) | 0 extra |
| 2 | **Cloud shadows** on the mesas | inside the `mesa.far` and `mesa.mid` materials (fragment term) | 2 soft bands, Gaussian σ 12 m in world x, darken the colour by 15 % (`mesa.far` → about `#c1a085`) | Band centres `x = wrap(-120 + 2.0·t + k·110, -120..120)` for k = 0, 1 (2 m/s, about 14 px/s on the far layer). Clipped to the mesa silhouettes for free, so they never touch the sky. | on (one uniform) | 0 |
| 3 | **Heat shimmer** at the foot of far layers | vertex term in the dune, `mesa.mid` and `mesa.far` materials, vertices less than 2 m above each layer's base only | amplitude: dune 0.15 m, mid 0.35 m, far 0.6 m (each about 3–5 px) | `x += A · sin(2π·0.6·t + 1.7·y + 0.3·x)`. Independent of wind. No screen-space distortion pass. | off (static) | 0 |
| 4 | **Blowing sand**: cliff-top streamers + floor skitter, **one shared pool** | streamers: emitted at the cliff tops (x ±18 to ±21, y 14.8–15.2); skitter: floor, z **-2.4** (behind the fight plane), y **0.02–0.20** (R-020) | `InstancedMesh`, 40 camera-facing quads, `MeshBasicMaterial`, transparent, `depthWrite false`. **R-020 rev.:** streamer `#f0d6a8`, 0.6 → 1.4 m long, **aspect 2:1**, opacity **0.35** → 0; skitter **`dune` `#ebc790`**, **0.7 × 0.30 m** (aspect 2.3:1), opacity **0.22** → 0, scale y grows 1 → 1.6 over its life (a puff of haze, not a line). Rule R8 below. | Streamers: `10·(wind − 0.4)` per second per cliff while wind > 0.4, velocity (+4 m/s x, +0.6 m/s y), life 1.4 s, and **never below y 14.0** (above the 13.5 ceiling, over everyone's head). Skitter: `6·wind` per second while wind > 0.5, x -18..18, +6 m/s, life 0.9 s. | off | 1 |
| 5 | **Two vultures** | circling (-28, 22, -60): upper-left third, over the left mid butte, crossing the sun disc | wingspan 2.0 m (about 27 px close, 16 px wide), flat low-poly V with a 2-bone wing flap in the vertex shader, `plank.side` `#6e5440` (fog lightens it) | Circle radii 5.0 and 6.5 m, period 16 s, 140° apart, bank 15° into the turn; glide, with 3 flaps at 2 Hz once every 5–8 s. | off | 1 (InstancedMesh ×2) |
| 6 | **Tumbleweed** | rolls along the near dune crest, z -25 | 0.9 m open lattice (3 crossed low-poly rings, merged), `plank.top` `#b8966b`, about 22 px | Spawns at a gust start (40 % chance, at most one every 30 s), enters off-screen left, +3.5 m/s, hops 0.4 m every 1.1 s, spins at `v/r`. Leaves off-screen right, then is hidden (0 calls while idle). | off | 1 while visible |
| 7 | **Bomb parachute** (existing, upgraded) | on each dropping bomb | as section 4.5 | Canopy tilts `±6°·wind` toward +x and wobbles at 0.8 Hz. **The bomb's x stays the sim's**: only the canopy moves. | on | 0 extra |

**Fight reactions** (render-side, triggered by the sim events that already exist):

| Event | Reaction | Low tier |
| --- | --- | --- |
| `explosion` | (a) **Sand sift**: from every plank whose x-range lies within 5 m of the blast, 3 thin streams fall from its back edge (z -1.2): 0.06 × 0.8 m, `sand.edge` `#c9a070`, opacity 0.55, fall 1.5 m, life 0.7 s (from the element 4 pool). (b) If \|x\| > 11: 4 pebbles tumble down that cliff face from y 9–11 (reuse the wall-splat pebbles). (c) **Wind kick**: `wind` = 1.0 for 0.6 s, so the flag snaps and the skitter bursts. (d) The vultures scatter. | (a), (b), (d) off; (c) on (flag only) |
| `shot` from the launcher, and `rail` | The vultures scatter: 4 Hz flaps, climb +6 m and fly out toward -x at 6 m/s for 2.5 s (out of frame), then glide back into their circle 12 s later. Cooldown 20 s. | off |
| `wallSplat` | As section 4.5, plus a 6-streamer sand burst from the top of that cliff. | burst off |
| `ko` (each) | A dust cloud where the fallen fighter lies: `vfx.puff` × 14, size 1.6, spread 0.8, plus a 0.6 s wind kick. | puffs off (as today); wind kick on |
| Final KO | **The tumbleweed gag** (the arena's one joke after the "42"): a tumbleweed is forced in at the screen-left edge of the dune 0.15 s after hit-stop and rolls +5 m/s, so it crosses behind the winner during slow-mo and the KNOCKOUT band. It ignores the 30 s cooldown. | on (1 call, a few seconds once per match) |

**Readability rules (hard limits):**
- **R1** No ambient object between z -1.3 and +0.5 (the fight plane). The only exception is the explosion sand sift at z -1.2: thin, under 0.8 s, and only right after a blast the player already caused.
- **R2** Nothing ambient in front of the fight plane (z > 0.5), ever.
- **R3** Colours come only from the section 3.2 palette. No gold except the flag. Max opacity 0.55. Nothing ambient is more saturated than any fighter.
- **R4** Nothing ambient is round, dark **and** falling (that is the bomb's read). The tumbleweed is light, open and rolls sideways on the dune. The vultures are far, high and slow.
- **R5** The centre third of the frame and the HUD score area (top centre) never hold a vulture, and the tumbleweed never stops there.
- **R6** No shadows. No ambient mesh casts or receives shadows, so the shadow pass is unchanged.
- **R8** (R-020) No ambient quad has an aspect ratio above 2.5:1, and none moves faster than 6 m/s inside the frame below y 13.5. A thin fast pale line is a tracer's read; it belongs to projectiles only (section 5.7).
- **R7** Reduced motion: gusts peak at 0.6, no wind kicks, the vultures still circle but do not scatter. Shake OFF changes nothing here.

**Performance:**
- **High:** +2 draw calls at rest (sand pool, vultures) and +3 while a tumbleweed is on screen.
- **Low:** +0 draw calls. Flag, cloud shadows and parachute ride on existing meshes and uniforms.
- **Governor step-down order:** the sand pool goes first, then the vultures and tumbleweed (except the final-KO gag), then the shimmer.
- Section 6's ≤ 400 target is unchanged.

**Acceptance (CD reviews with a clip, not stills):**
- **L1** A 30 s no-input clip of the Offsite demo (1280x720) shows at least 3 gusts. On each gust the flag, the skitter and the streamers rise together, and nothing moves without the wind (except the vultures and the shimmer).
- **L2** Draw calls on high are at most the measured Offsite number + 3. On low there is no increase. Frame time on low is unchanged within noise.
- **L3** In a 3-minute `bot=hard&demo` run, no ambient element ever draws over a fighter at opacity above 0.35, except the sift.
- **L4** A rocket hit next to a boardwalk shows the sift and the wind kick, and the vultures scatter on the shot. A final KO shows the tumbleweed crossing behind the winner during the band.
- **L5** Section 9 A4 still passes with the ambient life running.

### 5.7 Projectiles on Offsite (R-020)
The office tracer `#ffe9a0` (0.7 × 0.06 m) and pellet `#ffb070` were made to pop on a night room. On sand `#efcf98` and sky `#98cde8` they are pale on pale: cream streaks read as ambient sand, and sand reads as bullets. Fix the projectile, not just the sand:
- **Tracer (Offsite):** `ink` `#1b1f2e`, **0.9 × 0.08 m**, plus a 0.22 m head in `canvas` `#f3ede0` at the leading end (second pooled mesh, or a 2-colour vertex-coloured box: 0 extra draw calls if both segments use one vertex-coloured material). Contrast: ink against sky about 8:1, against sand about 11:1 [computed from the hexes, before ACES; the tracer is `MeshBasicMaterial`, toneMapped false].
- **Pellet (Offsite):** `ink` `#1b1f2e`, 0.35 × 0.08 m, no head (the spread pattern tells it from a bullet).
- The office keeps its colours. The rail and the rocket are unchanged.
- Per-arena: a `projectileColors` field next to `vfxColors` in the arena render setup.

---

## 6. Budget and performance
- **Draw calls:** at or under the office, measured the same way. Office reference from my run: `renderer.info.render.calls` 472–522 per frame (demo URL, 1280x720, 5 samples); engineering's raw-WebGL hook gave about 481–486 on high. Target for Offsite: **≤ 400** with the same hook and URL. It should land well under that: about 19 merged materials (sand, rock ×3, plank ×3, timber, rope, crate, ink, cliff ×3, cactus, canvas, gold, plus sky, sun and 3 backdrop layers), no city windows, no point lights.
- **Lights:** 3, against the office's 6. Fewer lights mean cheaper fragment shaders for every lit mesh, fighters included.
- **Textures:** 2 canvas textures (sand ripples, the recoloured crack). Everything else is flat colour.
- Every static mesh goes through `mergeStatic`. Only the flag, the parachute, the crack decals and the section 5.6 ambient meshes (sand pool, vultures, tumbleweed) are dynamic.

---

## 7. Name and menu copy
- **Arena name:** OFFSITE
- **Card line:** "Mandatory team-building. 41°C in the shade."
- **Office card line, for the picker:** FLOOR 42 — "The office, after hours."
- **Loading/title card:** keep the current flow. The VS card may add a small subline "OFFSITE" in the HUD font, gold, 60 % opacity.
- **Per-arena match copy (R-020, `regular` voice; the `developer` voice is merge-themed and already arena-neutral, unchanged):**

| Key | Office (unchanged) | Offsite |
| --- | --- | --- |
| `introTitle` | ONE FLOOR / NO MERCY | TEAM-BUILDING / NO MERCY |
| `introLine` | Two fighters. One floor of guns. First to K KOs wins. | Two fighters. One canyon of guns. First to K KOs wins. |
| `knockoutLine` | {NAME} TAKES THE FLOOR | {NAME} WINS THE OFFSITE |
| `resultWin` | The floor is yours. | You survived the offsite. |
| `resultLoss` | They took the floor. | The offsite got you. |
| `resultDemo` | {NAME} took the floor. | {NAME} survived the offsite. |

- **Menu tagline (game-wide, both voices' `regular`):** `One office. Two fighters. No mercy.` → **`Two coworkers. One grudge. No mercy.`** True on every arena, keeps the workplace joke and the "No mercy" beat.
- `howTo` lines that say "top floor" (copy.ts lines with "wait on the top floor") → "wait up top". The "Use the office" rule card stays until R-019 redoes How to play.

---

## 8. Default arena: yes, Offsite (with one guard)

**Decision: Offsite is the default for every match** (bot, demo, quick match, invite). The office stays one pick away.

Why:
- **First impressions on CrazyGames:** aliveness-audit.md names the first frame of play ("a wide office with two dots in it") as the main CTR-to-retention risk. A bright, quiet arena with two saturated fighters reads at thumbnail size; the night office reads as a dark, busy picture with two small figures in it.
- **Readability for a new player:** 10 pieces you understand at a glance against 23 you have to learn.
- **The brand stays:** "Floor 42" (logo, name, lobby) stays. ~~The menu backdrop remains the office.~~ **R-020 reversal:** the playtest showed the night office menu followed by a desert match reads as a bug, not a reveal. The menu backdrop now **follows the selected arena** (`Settings.arena`, default Offsite): the showcase fighter stands on the Offsite floor at `menuSpotX` 5.2 under boardwalk R, built with the low-tier set (no sand pool, no vultures, no tumbleweed, no shimmer; flag and cloud shadows on). Over it, the menu text column gets a left scrim `linear-gradient(90deg, rgba(10,13,24,0.80) 0px, rgba(10,13,24,0.55) 520px, rgba(10,13,24,0) 900px)` (at 1920 wide; scale with the HUD scale). R-019 may replace the scrim; the backdrop choice stands.

**Guard:** basic-launch-kpi.md tracks conversion (opened → 1+ min played) and average playtime. If either comes in worse with Offsite as the default than the office's baseline over a comparable sample, swap the default back. The arena id should therefore be one config value, not code. Online: both seats play the arena the host or the quick-match room chooses. Offsite is the default, and the arena id travels with the match setup so the shared sim and the server agree.

---

## 9. Acceptance criteria (engineering checks; CD reviews with screenshots)
- **A1** `ARENA.platforms`, `spawns` and `gunSpawns` for `offsite` equal sections 4.1, 4.3 and 4.4 exactly. The office data is unchanged byte for byte.
- **A2** Every collision box matches its drawn box to ±0.05 m. No decor crosses a walkable surface or the fight plane in front of a fighter.
- **A3** In a 1280x720 screenshot of the demo, measured in the sky away from the sun: top of frame within ±10 per channel of `#6fbbe3`. Floor top within ±12 of `#efcf98` in a lit spot.
- **A4** In a screenshot with Hotfix on the floor lane and Legacy on a boardwalk, both fighters' trousers are visibly dark against the background, and nothing in the world is more saturated than the fighters except the gold flag and the "42".
- **A5** Draw calls ≤ 400 per frame with the same hook as the weight-pass measurement; frame time not worse than the office on high and low tiers.
- **A6** A sim test per platform in 4.2: Legacy (the limit case) reaches the boardwalk from the floor, the lookout from the boardwalk and the roof from the deck with a scripted double jump.
- **A7** A 3-minute `bot=hard&demo` run on Offsite: the bot is never stuck on one spot for more than 8 s (log positions). If it is, report it in REQUESTS.md. Do not move platforms to fix it without me.
- **A8** Wall splat on a cliff shows the crack, the dust and the pebbles. No glass shards or glass sound anywhere in Offsite.
- **A9** (R-020) The menu backdrop shows the selected arena (Offsite by default, the office when picked). `menuSpotX` is per-arena data. Report the menu's draw calls on low and high with the Offsite backdrop (budget 80 was set for the office; tell me the number before cutting anything).
- **A10** (R-020) A sim test: every Offsite spawn is ≥ 9.0 m from every G4 spot and ≥ 2.0 m from every G0–G3 spot; no G4 pickup is active before tick `firstAt × 60` after FIGHT.

## 10. Must not change
The office arena (data and visuals), arena bounds (±18, 13.5), gun tables, drop timing, fighter models and colours, the lobby look. (R-020 changes the menu backdrop, two HUD text opacities and the match copy; nothing else in the HUD or menu.)
