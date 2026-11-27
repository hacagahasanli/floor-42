# Floor 42: fight-game feel on every page (R-013, desktop only)

Owner: Creative Director. 2026-11-27. Scope: desktop 1024x768 to 1920x1080, keyboard/mouse/gamepad. Phone layouts: none in this pass (Reis, 2026-11-27). R-011 realism decision stands: weight and consequence, not a realistic look.

## 0. What I looked at

Verified (played myself, dev server :3310, headless Chromium + SwiftShader, `PLAYER` audience):
- `/` at 1280x720 and 1920x1080: audience prompt, home, Settings, How to play, Fighter, PLAY -> select, FIGHT AS -> lift loader `▲ 01` -> match.
- `/arena?p1=legacy&p2=standup&bot=hard`: title card, fight, pause (1280x720). The first-match rule ran it as `BOT · easy`.
- Existing shots: `shots/playtest-2026-11-27/` (cold load d01/d02, final KO fin00-09, result m19), `shots/local-2p/` (2P select, key card), `shots/aliveness-today-ui/` (result slab), `shots/review-r012/` (final KO).
- Code I read (read-only): `ArenaGame.tsx` (countdown, title card, KO banner), `Elevator.tsx` (lift loader), `menuSound.ts`, `sfx.ts` (`tone()`/`noise()` voices), `copy.ts`, the `globals.css` tokens and the door keyframes `f42DoorClose*/Open*`.
- Playtest critic input (coordinator, 2026-11-27), items (a)-(e). These are covered in section 1 and in TODAY.

Research (what I could and could not access):
- Smash Bros. Ultimate versus splash ([ssbwiki](https://ssbwiki.com/Versus_splash_screen), fetched): it is the loading screen, with both fighters as large renders, names on top, "Vs." between them in 1v1, and the background coloured by player slot (grey for CPU). Tips show only when loading runs long. **I take from it:** the VS screen hides the load, uses colour by slot and has no clutter.
- Giant Bomb "Versus Screen" concept (search snippet only; the page returned 403): "typically masks the load time of an upcoming matchup". Confirms the first point.
- Persona 4 Arena, from a TV Tropes snippet (not verified first-hand): the VS screen is laid out like a fight poster, then zooms in on the portraits before the cut. **I take from it:** a slow push-in on the portraits during the hold.
- Street Fighter 6's interactive versus screen (news headline only; page 403). **Not adopted:** it adds input to a screen that should last 1.5 s.
- Street Fighter II menus, from a fan-project UI wiki snippet: very fluid, with short screen changes. Voices of UX case studies (snippets; pages 403): fighting-game menus are often confusing and mislabelled. **I take from it:** speed and honest labels count more than ornament. Our footer said `ENTER SELECT` and Enter did nothing (critic a).
- Limitations: I watched no video. Cloudflare/Medium pages returned 403. Everything above comes from text and screenshots, not from motion I saw. All timings below are my own design values, not measured from any game.

## 1. Problems, ranked by first-impression cost

1. **Cold load is a black void.** At 7.4 s after a cold load (`d02`) and at about 9.5 s in my 1280 run, the home is a dark gradient with a floating fighter card and no 3D yet. This is SwiftShader, so a real GPU will be faster (not measured), but on a slow CrazyGames laptop the first picture players see is empty.
2. **No match moment.** Select -> a generic loader (`▲ 01`, checklist `Game code · Fonts · The office`) -> a title card that covers the arena for 2.0 s (`ONE FLOOR / NO MERCY`). It never shows *who is fighting whom*. That is the single beat every fighting game has and we skip.
3. **Too slow to control** (critic b): about 7.2 s from a cold load to the first input. PLAY opens select instead of a fight (critic a); the PLAY -> FIGHT path is 6 arrow-downs.
4. **Enter lies** (critic a): `ENTER SELECT` on select does nothing on the picked fighter.
5. **The final KO is the same banner as any KO** (critic c): `X IS OUT`, 36 px, plain gold, no impact. The match ends without a peak.
6. **Text announcements have no weight.** `READY`, `FIGHT!`, `X IS OUT` and `YOU WIN` fade or sit there. Nothing lands. No sound comes with them except `start()`.
7. **Copy bugs:** the bot-vs-bot demo result says `They took the floor.` (critic d). The menu showed `BOT: NORMAL` while the first match ran easy (critic e; engineering is fixing it).
8. **How to play bleeds through:** the menu labels (`SETTINGS`, `HOW TO PLAY`) show faintly behind the translucent rule cards at 1280x720. It looks unfinished.
9. Pause, Settings and How to play are clean but neutral web panels. This is lower priority: players spend seconds there.

What is good and must stay: the lift/floor-counter concept and door keyframes, the slanted cut-corner panels, Bungee + gold on ink, per-fighter colours, the result winner slab (T5), the follow camera and slow-mo final KO (R-011), and the 2P READY stamp. The new idea grows out of these. It does not replace them.

## 2. The one idea: **Doors and Stamps**

Fighting games use two devices to make menus feel like a fight: an **impact transition** that shuts the world before the match, and an **announcer beat** that lands each important word. Ours have to come from the office, not from an arcade:

- **The lift doors are our impact transition and our VS screen.** Every match starts with the lift doors *slamming shut* with the two fighters painted on them, left door and right door, with VS on the seam. The floor counter races to 42 while the match loads, *ding*, and the doors open on the arena. We already own the lift, the counter and the door keyframes. We swap a generic loader for a matchup poster that does the same job.
- **The rubber stamp is our announcer.** Every word that matters lands like an office rubber stamp: oversized and slightly rotated, it hits in 110 ms with a thunk and a 1-frame flash, and stays rough-edged on the paper. `LOCKED IN`, `VS`, `READY`, `FIGHT!`, `X IS OUT`, `KNOCKOUT`, `YOU WIN`. 2P already has a `READY` stamp, so this makes it the system.

Why this and not lightning, slashes or a voice: it is ours (an office, a lift, paperwork) and cheap (CSS + synth). It reads at a glance, it costs no draw calls, and it repeats every match without getting old because it stays short. No synthetic speech announcer: `speechSynthesis` sounds different in every browser and OS and would read as a bug.

## 3. Shared kit (build once, use everywhere)

### 3.1 Tokens (existing, do not add new colours)
ink-deep `#0a0d18`, ink `#141a2b`, cream `#e6ebf5`, paper `#f4f6fb`, gold `#ffd23f`, orange/red `#ff3d6e`, fighter accents Hotfix `#ff6a3d`, Legacy `#3ddc84`, Standup `#3ec5ff`, Intern `#ffd23f`. 2P slot colours as already built (P1 red, P2 blue). Colour-blind palette overrides (`globals.css` l. 89-90) apply as today.

### 3.2 `<Stamp>` component
- Text: Bungee, uppercase, `paint-order: stroke fill`, `-webkit-text-stroke: var(--stamp-stroke) #0a0d18`, fill = `--stamp-colour` (default gold).
- Plate (optional, `plate` prop): ink-deep 92 % box, padding `0.18em 0.45em`, 4 px border in `--stamp-colour`, the cut-corner clip-path, slightly uneven: `border-radius: 2px 6px 3px 5px`.
- Rotation: `--stamp-rot`, default -6deg (alternate +4deg for the second stamp in a pair).
- **Land** (`f42StampIn`, 110 ms, `cubic-bezier(.2,1.6,.4,1)`): from `scale(1.7) rotate(calc(var(--stamp-rot) - 8deg))`, opacity 0 -> 1 in the first 40 ms, to `scale(1) rotate(var(--stamp-rot))`.
- **Flash**: a pseudo-element, paper `#f4f6fb` at 0.55 opacity over the stamp box, 0 -> 0.55 -> 0 over 70 ms, starting at 60 ms.
- **Kick**: the page/HUD root wrapper gets `f42Kick` 160 ms: translate (0,0) -> (0,6px) -> (0,-3px) -> (0,0), ease-out. Only on `size="xl"` stamps. Must respect Settings > Camera shake OFF (no kick).
- **Exit** (`f42StampOut`, 140 ms ease-in): opacity 1 -> 0, scale 1 -> 1.06.
- Sizes (desktop, `clamp` on the shorter side): `md` `clamp(28px, 4.4vh, 44px)` stroke 4px; `lg` `clamp(48px, 8vh, 80px)` stroke 5px; `xl` `min(14vh, 12vw, 140px)` stroke 6px.
- Reduced motion: no scale, rotation fixed, no kick, no flash; opacity 0 -> 1 in 120 ms. Sound still plays.

### 3.3 UI sounds (add to `sfx.ts`, `bus: 'ui'` unless noted, in the existing `tone(type,f0,f1,dur,vol,opts)` / `noise(filter,f0,f1,dur,vol,q,opts)` terms; gate each with `may()`)
| name | recipe | used by |
|---|---|---|
| `stamp()` | `tone('sine',110,48,0.16,0.5,{room:0.15})` + `noise('lowpass',900,200,0.09,0.45,1,{room:0.15})` + `noise('bandpass',2400,1600,0.02,0.16,4)` | every stamp `md`/`lg` |
| `stampBig()` | `stamp()` at 1.4x vol + `tone('sine',62,32,0.5,0.45,{room:0.4})` | `xl` stamps: VS, FIGHT!, KNOCKOUT |
| `doorSlam()` | `noise('lowpass',600,90,0.22,0.6,0.8,{room:0.3})` + `tone('square',70,42,0.12,0.16)` + `tone('triangle',2200,2100,0.05,0.05,{delay:0.02})` | doors shut |
| `liftDing()` | `tone('sine',1319,1319,0.9,0.2,{room:0.5})` + `tone('sine',1047,1047,1.1,0.18,{delay:0.14,room:0.5})` | counter hits 42 |
| `floorTick(n)` | `tone('triangle',700+n*14,700+n*14,0.025,0.05)`, at most every 70 ms | counter steps |
| `winSting()` | `tone('triangle', f, f, 0.12, 0.12)` for f = 523, 659, 784, 1047 at delays 0, .07, .14, .21 s | result, a player won (1P win, 2P any) |
| `lossSting()` | `tone('sine',392,311,0.45,0.14,{room:0.4})` | result, 1P loss |
Mix rule: UI stings sit under gunfire. The `ui` bus peak stays at or below the existing `confirm`.

### 3.4 Motion rules
In fast (90-140 ms) and out faster (≤ 140 ms). Nothing on a page moves after 600 ms unless it carries information (counter, timer) or idles at ≤ 4 % scale. No easing longer than 300 ms on anything the player waits for.

## 4. Per page

### 4.1 Cold load -> home (TODAY T1)
- Problem 1. Ship a **still poster** of the home backdrop: engineering renders the showcase scene once at 1920x1080 (same camera, Hotfix idle, high tier) and saves `public/menu-poster.webp` (target ≤ 120 KB, quality 70). It is used as the CSS background of the menu root from first paint (`background: #0a0d18 url(/menu-poster.webp) center / cover`). When the three.js backdrop renders its first frame, the canvas fades in over it in 400 ms. The poster always shows Hotfix, because the poster is a picture of the place. The live scene then shows the player's fighter.
- No new loading UI on the home. The menu is usable at once (it already is).

### 4.2 Home (TODAY T2 + small parts)
- **PLAY starts a fight** (critic a, agreed): PLAY -> doors (4.4) with the current fighter vs the rival rule (RANDOM unless set) at the current bot level (first match forces easy, as built). Sub-label under PLAY (focused): `Fight the bot as {Fighter} · first to 5` (dev audience: `… · first to 5 takes the merge`).
- `FIGHTER` stays the way to change fighter, rival and bot.
- On PLAY confirm: `menuSound.confirm()`, the focused bar flashes gold 100 % for 80 ms, then the doors start (no other delay).
- Fighter card bottom right: unchanged.

### 4.3 Fighter select, 1P (`/characters`) (TODAY T3)
- **Enter or click on a fighter row = pick + fight.** Arrow keys preview (as now), Enter locks. `FIGHT AS {NAME}` stays for mouse users and for after changing the rival/bot rows. The footer `ENTER SELECT` then tells the truth. Rename it `ENTER FIGHT`.
- **Lock-in beat (300 ms, then doors):** the row fills with the fighter accent at 100 % for 80 ms, then back to the picked style. On the big name panel (bottom right), a `<Stamp size="lg" plate colour=accent>` `LOCKED IN` lands across the name at -6deg, with `stamp()`. 180 ms later the doors start closing (4.4).
- Fix the confusing double state: when the focused row differs from the picked fighter, the panel caption reads `Preview` (as now) and its name stays at 60 % opacity. The picked fighter's row keeps `PICKED`.
- Bot row while the first-match rule applies: `EASY` shown selected and a cream 60 % 12 px note under the row: `First match is on easy`. Copy only, on top of engineering's fix for (e).

### 4.4 VS doors (new; replaces the `▲ 01` loader for every offline match start and rematch) (TODAY T4)
Layout (all sizes; values scale with `vh`, see 5):
- Two door halves, each 50vw x 100vh, ink `#141a2b`, with 1 px cream 6 % vertical lines every 24 px (brushed steel) and an ink-deep 10 px inner edge on the seam side. They use the existing `f42DoorClose*`/`f42DoorOpen*` keyframes.
- **Left door = P1 / YOU, right door = rival / P2.** On each door:
  - A slanted slab in the fighter's accent at 85 % opacity, skewX(-8deg) on the left and +8deg on the right, 62 % of the door width, full height, tight to the seam side, with a 4 px ink outline. It is the result screen's slab language.
  - The fighter portrait (`portraits.ts`, the same renders as the result slab) at 78vh tall, bottom-anchored on the slab, facing the seam. The right portrait is mirrored (`scaleX(-1)`). It idles with a push-in, scale 1.00 -> 1.04 over 1200 ms, linear.
  - Name: `<Stamp size="lg">` in cream fill with an ink stroke, bottom outer corner, 48 px from the outer edge and 56 px from the bottom, rotated -4deg on the left and +4deg on the right.
  - Under the name, a Chakra Petch 18px cream 75 % line: class (`High flyer`) + ` · ` + tag (`YOU` / `BOT · EASY` / `BOT · HARD` / `P1` / `P2`).
- **Seam:** `<Stamp size="xl" plate>` `VS` in gold, centred at 46 % height, rotated -6deg.
- **Top centre:** the existing floor plate (`▲ 01` -> `▲ 42`, Bungee 32px, gold) and the gradient progress bar under it. Remove the step checklist (`✓ Game code · Fonts…`) and the tips from this screen; the counter is the progress.
- **Bottom centre:** `FIRST TO 5` Bungee 18px cream 70 %.

Timeline (ms from the trigger):
| t | event |
|---|---|
| 0 | doors slide in, 220 ms `cubic-bezier(.7,0,.9,.4)`; portraits and slabs ride on them |
| 220 | `doorSlam()`, `f42Kick`, existing seam flare |
| 260 | `VS` stamp lands, `stampBig()` |
| 260 -> ready | counter races as loading progresses (existing logic), `floorTick` |
| max(ready, 1100) | counter lands on 42, `liftDing()` |
| +160 | doors open, 300 ms ease-in (existing), `menuSound.whoosh()` |
Warm total about 1.5 s (critic b's limit). Cold first match: as long as loading needs; the poster holds the screen. A key or click skips to the open once t ≥ 700 ms. **Rematch:** the same doors at a short tempo: close 180 ms, VS at 200, open at 900 (no loading). Reduced motion: doors appear shut (opacity 120 ms), no slide, no kick, minimum hold 900 ms, then a 200 ms fade.

Where: 1P PLAY, select lock-in, Change fighter -> fight, rematch, 2P after both READY (then the existing key card inside the arena). Online keeps its own lobby flow for now (NEXT N3).

Copy, developer audience: identical, except the bottom line `FIRST TO 5 · TAKES THE MERGE`.

### 4.5 Match opening and countdown (TODAY T5)
- **Remove the title card** (`ONE FLOOR / NO MERCY` + `introLine` + the radial scrim) during the countdown. The VS doors now say what the match is. The arena must be visible from the moment the doors open.
- **First match only** (`floor-42:finished-match` not set, 1P): a key strip, bottom centre 120 px above the bottom, from the doors opening until the player has pressed all three or 8 s into the fight, then fade out over 300 ms. Three groups, 40 px apart: `A` `D` + `move`, `W` + `jump`, `Space` + `shoot`. Keycaps 64 px tall (Bungee 28px, ink-deep cap with a 2 px cream 30 % border and a 4 px bottom edge), label Chakra 16px cream 85 % below. A pressed key's cap turns gold for 200 ms (the 2P key card language). Labels come from the live bindings (`getLayoutMap`, as the key card does). The bottom key-hint bar is hidden while the strip shows.
- **READY / FIGHT!:** same timing as now (`READY` while 1.6 ≥ t > 0.8, `FIGHT!` from 0.8). `READY` = `<Stamp size="lg">` cream with `stamp()`. `FIGHT!` = `<Stamp size="xl">` gold with `stampBig()` + kick, exit at fight start. Developer copy unchanged (`git merge` / `CONFLICT!`). Drop the `Keep moving. Furniture stops bullets: use it.` line from the countdown (the first-match strip and How to play carry it).
- **Countdown length** (critic b): I want the offline countdown at 2.0 s (READY 1.0 s, FIGHT! on 0). The 2.0 s title card is gone, so the extra 1.6 s is dead air. It is a sim constant (`RULES.countdownSeconds` 3.6), shared with the online server. **Engineering decides:** do it only if offline (bot, 2P, demo) can take its own value without touching the online protocol. Otherwise keep 3.6 and show `READY` from 1.6 s as now. Online stays 3.6 for this pass either way.

### 4.6 KO and final KO (TODAY T6)
- **Normal KO:** replace the plain `X is out` with `<Stamp size="md" plate>` `{NAME} IS OUT` in the **KO'd fighter's** accent, rotation alternating -5deg / +4deg per KO, top third (where it is now). `stamp()` 30 ms after the existing `ko` sfx. Hold 700 ms, exit 140 ms.
- **Final KO** (the match-winning KO, during the R-011 slow-mo, 1P/demo/2P/online):
  - At slow-mo start + 150 ms real time: a full-width ink-deep 85 % band, 22vh tall, skewY(-3deg), centred at 45 % height, slides in from the left in 140 ms (ease-out).
  - In the band: `<Stamp size="xl">` **`KNOCKOUT`** in the **winner's** accent, rotated -4deg, with `stampBig()` + kick (respecting shake OFF). Under it, a Bungee 28px cream line: `{WINNER} TAKES THE FLOOR`, which fades in 120 ms after the stamp.
  - Developer copy: stamp `MERGED`, line `{WINNER}'S BRANCH WINS`.
  - Hold through the slow-mo and the 0.4 s hold, then the band exits right in 160 ms as the result screen mounts. The normal `IS OUT` stamp does not show for the final KO.
  - Online and 2P (no slow-mo today): the band holds 1.1 s, then the result card.

### 4.7 Results (TODAY T7, small; the T5 slab stays)
- Title (`YOU WIN` / loss title / `{NAME} WINS`) becomes `<Stamp size="lg">` (no plate), gold for a win, cream for a loss, landing 120 ms after the slab entry ends, with `winSting()` / `lossSting()` (2P and demo: `winSting()`).
- Stats count up from 0 in 400 ms (`easeOutCubic`), rows staggered 40 ms. Keep the existing colours (winner column gold, loser column grey).
- `REMATCH (ENTER) →`: one glint 1.2 s after mount (a white 20 % diagonal sheen crossing in 380 ms), then still.
- **Copy fix (critic d, confirmed in my demo run: `LEGACY WINS` / `They took the floor.` in the loss pink):** demo and bot-vs-bot, line colour = the winner's accent, not the loss pink: title `{NAME} WINS`, line regular `{NAME} took the floor.`, developer `Merged by {NAME}.` 2P: title `P1 WINS` / `P2 WINS` with the fighter name in the line, as built; same line rule.
- Rematch -> short doors (4.4).

### 4.8 Pause (NEXT)
The doors close halfway: each door slides in to 22vw from its side in 180 ms, so the frozen arena stays visible between them. The pause menu sits on the left door, the right door shows the score (`2 : 1`, Bungee 96px, fighter accents) with `FIRST TO 5`. Resume: the doors open 140 ms.

### 4.9 Settings / How to play (NEXT, except the bug)
- **Bug, in TODAY T8:** the How to play rule cards and any panel over the menu must be opaque (ink `#141a2b` at 100 %, or hide the menu list while the panel is open). Nothing from the menu may show through.
- NEXT: How to play rule cards get a 56 px icon each (KO stamp, a gun, a desk) as inline SVG in the stamp style. The `01 02 03` numbers become small `md` stamps (no animation after the first open).
- Settings: no change beyond the opaque fix. It is a tool and should stay calm.

### 4.10 2P select and key card (TODAY within T4; rest NEXT)
- Both READY -> the 2P doors (P1 left, P2 right, tags `P1`/`P2`, slabs in the fighter accent, not the slot colour; the slot shows in the tag chip). Then the existing key card.
- NEXT: the existing READY stamp uses `<Stamp>` + `stamp()` so it lands like the rest.

### 4.11 HUD (NEXT)
- Health: add a cream "damage trail" bar behind each health bar, held 350 ms after a hit and then draining to the new value over 300 ms. It shows the size of the hit.
- Score: on a point, the scoring digit lands as a `md` stamp in the fighter accent (in place of the current pop).
- Portrait chip (36 px) beside each name, from `portraits.ts`.

## 5. Desktop sizes

| size | VS portrait | VS name (lg) | VS stamp (xl) | KNOCKOUT (xl) | key strip caps | notes |
|---|---|---|---|---|---|---|
| 1920x1080 | 842 px | 80 px | 140 px | 140 px | 64 px | |
| 1440x900 | 702 px | 72 px | 126 px | 126 px | 64 px | |
| 1366x768 | 599 px | 61 px | 108 px | 108 px | 56 px | |
| 1280x720 | 562 px | 58 px | 101 px | 101 px | 56 px | reference |
| 1024x768 | 599 px | 61 px (name may wrap: allow 2 lines, `line-height: .9`) | 108 px | 108 px | 56 px | doors 512 px wide; slab 62 % = 317 px; portrait may overlap the seam by ≤ 40 px under the VS plate |
Rule: the `xl` size = `min(14vh, 12vw, 140px)`. Under 800 px tall the key strip caps are 56 px.

## 6. TODAY (about 3-4 h, in this order; cut from the bottom)

| # | item | est. | first-impression gain |
|---|---|---|---|
| T1 | Menu poster `menu-poster.webp` behind the menu root from first paint, canvas fades in over it (4.1) | 25 min | the black void is gone |
| T2 | PLAY starts the match at once + sub-label (4.2) | 15 min | fight in one click |
| T3 | Select: Enter/click on a fighter row = lock-in + fight, `LOCKED IN` stamp, footer `ENTER FIGHT`, first-match bot note (4.3) | 30 min | Enter tells the truth, plus the first stamp |
| T4 | `<Stamp>` component + `stamp`/`stampBig`/`doorSlam`/`liftDing`/`floorTick` sounds; **VS doors** replacing the `▲ 01` loader for offline starts, rematch (short) and 2P (4.4, 3.2, 3.3) | 75 min | the matchup moment; the core of R-013 |
| T5 | Remove the title card; first-match key strip; READY/FIGHT! stamps; offline countdown 2.0 s if engineering agrees (4.5) | 35 min | control sooner, arena visible |
| T6 | KO stamp + final `KNOCKOUT` band (4.6) | 30 min | the match ends on a peak |
| T7 | Results: stamp title + stings + count-up + demo copy fix (4.7) | 20 min | the payoff lands |
| T8 | How to play / panels opaque (4.9 bug) | 10 min | no unfinished look |

Total about 4 h. If time is short, cut T7 first, then T8, then the count-up. **T4 is not cuttable**, but its rematch short tempo and 2P doors may slip to NEXT if T4 runs over 75 min (1P PLAY/select doors are the must).

## 7. NEXT (in order)
- N1 Pause doors (4.8).
- N2 HUD damage trail + score stamp + portrait chips (4.11).
- N3 Online: VS doors when the rival is found (the lobby `linking` state), with the rival's name and `ONLINE` tag.
- N4 How to play icons and number stamps (4.9). 2P READY on `<Stamp>` (4.10).
- N5 Home showcase reacts: when PLAY is focused, the fighter raises the gun (showcase anim), with an idle shift every 6-9 s. Needs the showcase rig, so it is not today.
- N6 Per-fighter VS taunt line under the name (one line each, my copy, to write after Reis approves the doors): e.g. Hotfix `Ships on Fridays.`, Legacy `Was here before git.`, Standup `Has a quick update.`, Intern `First week. No fear.` Developer audience only at first.
- N7 Re-shoot all sizes on a real GPU and time cold load -> first input (target ≤ 4.5 s on a mid laptop).

## 8. Acceptance (I will review against these, from shots at 1280x720 and 1024x768, plus a frame sheet of the VS and the final KO)
1. Cold load: the poster is visible at the first screenshot after the HTML paints. There is no frame where the home is an empty gradient.
2. One click on PLAY (or Enter on it) shows the doors within 100 ms. Warm: the arena is visible ≤ 1.6 s after the click.
3. On the doors both fighters are fully visible on their slabs, the names do not touch the VS plate, and nothing overflows at 1024x768.
4. Enter on a fighter row in select starts the match. `LOCKED IN` lands. The footer says `ENTER FIGHT`.
5. No `ONE FLOOR / NO MERCY` card. The first match shows the key strip, and it leaves once all three actions were done.
6. Every stamp lands with its sound. Shake OFF removes every kick. Reduced motion removes the scale, rotation and kick.
7. The final KO shows `KNOCKOUT` + `{WINNER} TAKES THE FLOOR` in the winner's colour, and the normal `IS OUT` stamp does not show for it.
8. The demo result never says `They took the floor.`
9. Nothing from the menu shows through How to play.
10. Low tier: the VS doors add 0 draw calls (DOM only). The portraits are pre-rendered before the first match (in idle time on the home after the backdrop's first frame), so the doors never wait on a portrait render.

## 9. Must not change
Gameplay, the sim (except the optional offline countdown in T5, engineering's call), the online protocol, the follow camera and slow-mo (R-011), the result slab layout (T5), the fonts and palette, the 2P key bindings and key card, Settings content, telemetry events (add `vs_skip` only if cheap).
