# Floor 42: aliveness audit and ship-today cut (R-011)

CD, 2026-11-27. Played on the local dev build (localhost:3310, the dev server already running from this repo) in headless Chromium with SwiftShader WebGL: menu, fighter select, `/arena?p1=legacy&p2=standup&bot=hard` driven by scripted keys, two `&demo` bot matches through to the result screen, phone landscape with touch. Evidence shots: `docs/collab/shots/aliveness-2026-11-27/` (a1-a9).

**Limits (not verified):** real GPU frame pacing and smoothness (SwiftShader is software rendering, so I judged nothing about fps); sound; real hands on a keyboard (my inputs were scripted and blind, so they say nothing about control feel beyond what the frames show); the CrazyGames iframe. The 3D home scene took more than 6 s to appear on the first cold dev load. That was the dev compile, not a bug: it showed fine warm (a6).

## 0. Verdict in one line

The game already has more juice than it shows. Hit-stop, trauma shake, FOV punch, damage numbers, ragdoll KOs and wall splats all exist. **On desktop the camera is fixed and wide, so the fighters are about 40-50 px tall in a 720 px frame, roughly 6-7 % of the screen (a1, a3).** Every effect happens to a speck, inside a dollhouse. The phone build already has a follow camera (a5, `updateCamera` in `src/game/render/game.ts`, branch `touch && !tp`), and there the fight reads at once. The biggest liveliness gain for today is to **turn that camera on for desktop**, not to add new effects.

The cover sells big faces and an explosion. The first frame of play shows a wide office with two dots in it. That mismatch between click and first frame is the main CTR-to-retention risk.

## 1. Ranked problems per area

### Feel and camera
1. **P0. Fixed wide camera on desktop.** The fighters take about 6-7 % of the screen height. About 14 % of the frame under the floor is an empty dark band (a1, a9, y 620-720 at 1280x720). Hits, push and KOs read small, and the HUD is larger than the fighters.
2. **P1. The match-winning KO looks like every other KO.** It gets the same 9-tick hit-stop as any KO, then cuts to the result card. There is no slow-motion and no closing beat (a3, then a4).
3. **P2. Time to control is about 4.6 s.** That is about 1 s of elevator, then the 2.0 s `ONE FLOOR / NO MERCY` card, then 1.6 s of READY and FIGHT (a8, frames every 0.5 s). That is acceptable for the first match and too long for every rematch.

### Controls
4. **P1. A blind first match against `hard` lost 0:2 in about 12 s** (a2, scripted inputs, so this is not proof of real difficulty). The menu defaults to `normal`, which is right. The portal's first match should be gentler still: a first-time player who goes 0:3 in 20 s leaves. [Assumption: typical portal first-session behaviour, not measured here.]
5. **P2. The key strip shows 10 bindings at once** (a1, bottom). It is fine as a reference, but it is visual noise during a fight. NEXT.

### Arena
6. **P1. A KO'd body ends up outside the glass**, left of the building edge at x ≈ 0-70, y ≈ 265 (a2). It reads as a clipping bug, not as a splat.
7. **P2. The office is readable and well dressed:** desks, kitchen, mezzanine, cable tray, the HEAD/their-branch whiteboard. Do not redesign it. The only problem is how small it is on screen, which the camera fixes.

### Fighters ("realism", see section 4)
8. **P1. The four fighters' silhouettes are strong in the menu (a6, a7) and invisible in play** at 45 px. The fix is the camera first, the models second.
9. **P2. Motion lacks weight:** there is no landing squash, no directional flinch and no secondary motion on the hood, backpack or headset (judged from stills and frame sheets only).

### Guns
10. **P2. Held guns are thin dark sticks at play scale** (a3, a9). A pickup has no moment: the gun just swaps. A railgun or rockets pickup should be an event, because it is the biggest swing in a match.

### Pages
11. **P1. Home and select: the fighter name `HOTFIX` and `Your fighter` sit on top of the 3D fighter's arm and the planter** (a6, a7, right column x ≈ 990-1240, y ≈ 410-520). This is the first screen a CrazyGames player sees.
12. **P1. The result screen is dead** (a4). A stats table on a blurred backdrop, with no fighter, no winner moment and no reason to smile before Rematch.
13. **P2. Menu, select and lobby are otherwise solid** (clean slanted type, yellow accent, live office behind). No redesign today.

### Site card
14. **P0, and it is not an art problem.** The live `card-floor-42-960.webp` is already the NEW art: the MD5 of the local file and of `https://nalbakigames.com/assets/img/card-floor-42-960.webp` match (b0e0e454…). But `vercel.json` serves `/assets/(.*)` with `max-age=2592000` (30 days) under an unchanged filename, so any browser that saw the old card keeps showing it for up to a month. That is what Reis is seeing.

## 2. TODAY (about 3-4 h of engineering, in this order; cut from the bottom)

**T1. Desktop follow camera (about 60-75 min). The highest-value change.**
- Use the existing phone branch for desktop too: `touch && !tp` becomes `!tp` (2-player keeps the fixed full view, since both players need the whole floor).
- Desktop values: minimum distance `dist / 1.6` (phones stay at `/1.8`), `hwNeed = |a.x - b.x| / 2 + 4.0`, `hhNeed = |a.y - b.y| / 2 + 3.0`. Keep the same clamps to the arena edges.
- Smoothing: `k = 1 - exp(-2.5 * dt)` for x and y, `k = 1 - exp(-1.8 * dt)` for z, so zooming out feels slower than panning. No snapping.
- During `countdown`, hold the current full establishing view. Start following at FIGHT, easing in over about 0.8 s. This is the "the camera leans in" beat.
- `&demo` uses the same camera, so the preview video gets it for free.
- Acceptance: at 1280x720 with the fighters within 8 units of each other, each fighter is at least 80 px tall. With the fighters at opposite walls, both stay fully on screen with no gap under the floor below the HUD. No jitter while standing still.

**T2. KO camera beat (about 30 min).** On any KO, offline only: for 0.6 s, move the camera target 35 % of the way toward the victim and multiply `tz` by 0.85, then ease back over 0.5 s. This stacks with the existing hit-stop and FOV kick.

**T3. Final-KO slow-motion (about 45 min; cut this first if time runs out).** Offline only. On the KO that wins the match, run the sim accumulator at 0.3x for 0.9 s of real time, then hold 0.4 s before the result card fades in. Hit-stop and trauma keep their current values. Set the sfx playbackRate to 0.6 during the slow-motion if that is trivial; otherwise skip it.

**T4. Gentler first match on the portal (about 15 min).** If the player has never finished a match (no saved result), the first `PLAY` starts the bot at `easy`. After that, use the menu choice (default `normal`). The menu does not change.

**T5. Result screen winner moment (about 45 min).**
- Left of the stats card, at desktop 1024 px and wider: the winner's portrait (from `portraits.ts`) at 280 px tall, rotated -4°, on a slanted slab in the winner's colour at 85 % opacity, with a 4 px ink `#0A0D18` outline.
- The loser's portrait sits at 72 px beside the loser's name, grayscale at 55 % opacity.
- The title keeps its current copy.
- Entry: the slab slides in from x -40 px with a scale of 0.92 → 1.0 over 260 ms (ease-out-back, overshoot 1.4), then the stat rows stagger in at 40 ms each.
- Narrower than 1024 px: no portrait, only a 6 px top bar in the winner's colour on the card.

**T6. Pickup callout (about 20 min).** When a player takes a non-pistol gun, show the gun's name above that fighter for 0.9 s: `SMG`, `SHOTGUN`, `UZI`, `RAILGUN`, `ROCKETS`, `BOMB`. Use the display font at 22 px (28 px for RAILGUN and ROCKETS), in the pickup ring's gold `#FFD23F` with a 3 px ink stroke. It rises 18 px and fades out over the last 0.3 s. It appears for the bot too, so you see the threat.

**T7. Home and select name overlap (about 15 min), filed as F-016.**

**T8. Site card cache-bust (about 10 min, in the nalbaki-games repo).** Copy the current files to `card-floor-42-960-v2.avif` and `card-floor-42-960-v2.webp`. Point `index.html` lines 118-119 (and any other page that references them, found with grep) at the new names. Redeploy. No new art is needed.

Not in TODAY: anything that touches models, the arena layout, gun meshes, the lobby or online play.

## 3. NEXT (1-2 weeks, in order)
1. **The Climb** (R-007 / basic-launch-kpi.md): a ladder of floors 1-42 against the bot. This is the main retention hook and the reason to come back. Build it first.
2. **Follow-camera preview videos** (15-20 s per format) from `&demo` once T1 has shipped. Hook in the first second: a rocket or wall splat at follow-camera scale.
3. **Weight pass on motion** (section 4): landing squash, directional flinch, secondary motion, contact shadows.
4. **Guns:** held guns 15-20 % thicker on screen (silhouette only, same proportions), a stronger muzzle flash for the rail and rockets, and gun-coloured tracers per type.
5. **F-017:** keep KO bodies inside the glass.
6. **Key strip:** full for the first match, then hidden after the first KO in later matches. It returns on pause.
7. **Rematch countdown:** skip the title card, so READY and FIGHT take 1.6 s only.
8. **Arena variants:** night and morning light on the same floor. Hold this until The Climb needs per-floor variety.

## 4. Realism decision

**No realistic look.** No realistic proportions, textures, military gear or real-world guns. Those break the goofy-but-competitive low-poly identity and turn the game into a generic shooter.

**"More real" here means weight and consequence, not resolution.** In order of priority:
1. **Camera scale** (T1). You cannot feel weight on a 45 px figure.
2. **Anticipation and impact:** a 60 ms crouch before a jump, landing squash (scale y 0.85 / x 1.1 for 80 ms), and a directional flinch on a hit (torso tilts 12° away from the shot for 90 ms).
3. **Secondary motion:** Hotfix's hood and headset cable, Legacy's belly, Intern's backpack lag the body by 2-4 frames.
4. **Grounding:** a soft blob contact shadow under each fighter, and dust puffs on landing and dash.
5. **Light:** a rim light in each fighter's colour, so they separate from the city backdrop.

The models themselves stay as they are.

## 5. Covers
- **CrazyGames: the NEW set** (`NEW-landscape-1920x1080`, `NEW-portrait-800x1200`, `NEW-square-800x800`). It reads best at small sizes: one action, two large faces, the title top-right. Against A (wall splat), Legacy is a blur in the glass in A, while in NEW both faces read. I compared NEW against A and the current card only. B and C were not re-inspected today. Known weakness: the square crop shows only Hotfix and loses Legacy. That is acceptable today.
- **Studio site card: the NEW art, textless**, which is already live. The only action is T8 (cache-bust).
