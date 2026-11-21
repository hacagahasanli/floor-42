# Lobby v2: "Floor 42, above the clouds"

Spec for R-002. Owner: Creative Director. Status: ready for engineering. Wireframe: `lobby-v2-wireframe.svg` (same folder).
Icons: `../assets/icon-invite.svg`, `../assets/icon-quick.svg`, `../assets/icon-bot.svg`.

Source brief: `~/.agents-know/personal/feedback4/spec-f42-lobby.md` (Reis, verbatim). Where this spec and the brief disagree, the brief wins and this file is corrected.

---

## 0. What I looked at (verified)

- Current `/play` rendered with headless Playwright at 1440x900, 390x844 (touch) and 844x390 (touch), audience set to developer.
- `src/components/OnlineLobby.tsx`, `MenuShell.tsx`, `AimChoice.tsx`, `Elevator.tsx`; `src/game/render/{showcase,gallery,arena,palette}.ts`; `src/game/roster.ts`, `src/game/copy.ts`.
- `docs/arena.png`, `docs/characters.png`, `docs/home.png`, `feedback4/shots/f42-arena-after.png`, `docs/ARENA.md`.
- Not looked at: any online state past the idle menu (I did not start rooms on the live server), real phone GPUs, competitor games (no web research this run; the direction is built from the game's own material, which is what the brief asks for).

## 1. Problems with the current lobby

1. **It reads as a web dashboard, not a game.** Seven bordered dark panels on a grid background, a navbar row (`<< FLOOR 42` left, pill right), a "Steps 01/02/03" marketing row at the bottom.
2. **The fighter turntable shows Hotfix from behind** in the desktop and phone captures (back of the hood, white plinth). The centerpiece shows the wrong side half the time, and the cream plinth is the brightest thing on screen.
3. **Two visual languages that don't belong to the game:** the perspective grid floor and the light streaks (the "cyberpunk" leftovers), and emoji icons (envelope, lightning, robot) that render differently on every OS.
4. **The status pill lies.** `ONLINE · 1 V 1` shows before anything has connected. It is also a spaced uppercase label (banned).
5. **The rival exists only after you click** (the Versus panel appears in the waiting states). Nothing on the idle screen says "this is a 1v1 and the other spot is empty".
6. **Phone landscape is broken:** the hero panel takes 50 % of the width, "Play vs bot" wraps to three lines, the actions fall below the fold.
7. **Intern's accent `#ffd23f` is the same yellow as the primary button.** See section 6.

What is good and stays: the four rigs, the portraits rendered from the real models, the Bungee + Chakra Petch pairing, the gold call to action with cut corners, the lift transition, the 3-bar stat idea, the room code shown big in a monospace face.

## 2. The idea (one sentence)

**The lobby is one slab of floor 42, broken off the building and floating above the clouds at last light: your fighter stands on it, the empty spot for your rival is on it, and the screen around it is the same HUD you see in a match.**

Why this and not a generic sky island:
- "Floor 42" is the game's name. Forty-two floors up you are above the clouds; showing just the floor, cut out of the building, says the name without a single word. It is also a bit absurd, which is the game's humour.
- Every object on the slab already exists in `arena.ts` (floor, desk, crate, glass panel, cables, gun ring). Nothing is invented, nothing is copied from another game.
- It answers the brief's "floating platform / arena in the sky / clouds / distant islands / warm sunlight" with our own material instead of fantasy rocks.
- It drops the city skyline (the brief bans skylines) and keeps the arena's blue-hour sky, so walking from lobby into the match (lift doors) feels like the same evening.

Rejected: a full office interior (that's the home page showcase; repeating it makes the lobby feel like the same screen), fantasy floating islands (different genre), abstract stage with spotlights (generic, no identity).

## 3. Background scene

One WebGL canvas, full-bleed, fixed behind the whole page. It **replaces** the `FighterHero` gallery canvas and the `LobbyBackdrop`/grid/streaks/huge "42" outline. Net cost goes down, not up: one renderer instead of gallery + backdrop CSS.

### 3.1 Objects (all from existing builders)

| Object | Source | Size / placement | Notes |
| --- | --- | --- | --- |
| The slab | arena floor material (the wood/tiles texture of `floor` in `buildArena`) on a box | 9 m wide, 4 m deep, 0.6 m thick, centre at origin | Irregular broken edge on the front and right: 3-4 extra low-poly chunks (stone `#7a8296`) along the cut so it reads as torn off, not a stage |
| Slab section | `PALETTE.stone` | front face, under the floor top | 3 rebar stubs (thin cylinders, `PALETTE.inkSoft`) sticking out 0.3 m from the broken face |
| Dangling cables | `tray` cable curve code | 2 tubes (gold, blue) hanging 1.2-1.6 m under the slab front | Sway, see 3.4. The single goofy detail; keep it to two |
| Glass panel | arena glass + one mullion | 3 m wide, 2.4 m tall, back-left edge | The only "wall": says office, frames the fighter's head from behind |
| Desk | `desk` prop builder | back-left, in front of the glass | With its monitor and mug. Hide the whiteboard and anything with text |
| Crate | `crate` builder | front-right corner, 0.9 m cube | Cover object from the game; gives the rival spot a sense of place |
| Gun ring | the in-game pickup ring | on the floor at the rival spot | The rival's spot. States in 3.5 |
| Clouds | new, tiny: merged `IcosahedronGeometry(r, 0)` puffs | a sea 6-10 m below the slab, 10-14 clusters, 3-5 puffs each | Flat shaded, top `#ffe2bf`, underside `#8d96b8` (vertex colour by height, one material) |
| Distant chunks | same slab code, scale 0.18-0.3 | 2 chunks, far left-high and far right-low, in fog | Floors 41 and 43. One carries a tiny desk. Silhouette only (fog does the work) |
| Sky | arena's blue-hour sky gradient texture | sky plane behind everything | Top `#1b2550` to horizon `#f2a65a`. Add a soft sun disc (sprite, `#ffd9a0`, 30 % opacity halo) low on the left, half hidden by clouds |

No neon, no skyline, no signage, no particles field, no grid.

### 3.2 Light

- Hemisphere: sky `#c9d4ff`, ground `#6b5446`, intensity 1.1.
- Sun (directional key): `#ffd2a1`, from the sun disc side (left, low, slightly front). Shadows on the slab only: tight shadow camera around the slab. 1024 map on high, 512 on medium, none on low.
- Fighter rim: point light in the fighter's accent colour, behind and above the fighter, intensity tuned so the rim is visible but the face stays sunlit. Crossfades 400 ms when the fighter changes.
- Accent floor glow: the existing glowing disc under the fighter (from `showcase.ts`), in the accent colour, 35 % opacity.
- Fog: exponential, colour `#c98a6a`-ish matching the horizon, so the clouds and distant chunks melt into the sky.
- The fight must be the brightest thing: the fighter and the slab top are the highest-value area. Sky top stays dark enough (`#1b2550`) that cream UI text on it passes 4.5:1.

### 3.3 Camera and framing

- Perspective, fov 32. Looks at the fighter's chest from front-right, about 12° above, slab rotated ~20° so its front cut and thickness show.
- The fighter **faces the camera** (three-quarter front, ~25° toward the rival spot). Never the back. No turntable spin in the lobby.
- Framing per layout (fighter's feet in screen space):
  - Desktop (wider than 1024): fighter at x 44 %, feet at y 70 %. Rival spot at x 60 %.
  - Phone portrait: fighter at x 50 %, feet at y 40 % of the viewport (the scene owns the top half).
  - Phone landscape: fighter at x 27 %, feet at y 80 %. Rival spot at x 42 %.
- Pointer parallax on desktop only: camera yaw ±1.5°, pitch ±0.8°, eased (critically damped spring, ~0.4 s). None on touch. None with reduced motion.

### 3.4 Small animations (the scene must feel alive, not busy)

| What | Motion | Period |
| --- | --- | --- |
| Slab (whole group incl. fighter) | bob 4 cm up/down, roll ±0.4° | 6 s sine |
| Clouds | drift +x at 0.15 m/s, wrap around | continuous |
| Distant chunks | bob 10 cm, out of phase | 8 s, 9.5 s |
| Cables | swing ±6° around their top point | 3.2 s, out of phase |
| Paper sheet | one A4 plane lifts off the desk, tumbles over the front edge, falls into the clouds | once every 10-14 s (random), 2.5 s flight |

That is the whole list. Reduced motion: everything static except the fighter's breathing.

### 3.5 Fighter and rival on the slab

- **Fighter idle (per character, the goofy-but-competitive part).** Base: the existing showcase idle (weight shift, breathing, glance, gun check). On top, one signature beat every 6-9 s:
  - Hotfix: taps the headset with the free hand and nods ("on a call"). Restless: small weight shifts every 2 s.
  - Legacy: crosses arms for 2 s, slow heavy breathing, barely moves. Heaviest idle.
  - Standup: bounces on the toes (fast, 0.5 s cycle), checks the wrist like a watch.
  - Intern: hitches the backpack straps up with both hands, quick nervous look at the rival spot.
  - Fallback if a beat needs rig work that isn't worth it now: same shared idle with per-character tempo and amplitude (Standup 1.6x speed, Legacy 0.6x amplitude, Hotfix more head motion, Intern more look-around). Ship the fallback first; beats are P2.
- **Changing fighter:** keep the showcase drop-in (falls from above, squash on landing). Add: a puff of 6 dust cubes on landing (cream, 0.3 s), the rim light and floor glow crossfade to the new accent.
- **Rival spot** (gun ring on the floor at the far end of the slab, in front of the crate):

| Lobby state | Rival spot |
| --- | --- |
| Idle (menu) | Ring dim (gold at 25 %), slow pulse 2 s |
| Searching / room created | A **cardboard standee** pops up on the ring (box 0.9 x 1.6 x 0.03 m, kraft brown `#b98a5a`, a big "?" painted on in ink, canvas texture). Sways ±3° on its base, 2.4 s. Ring at full gold |
| Rival found (linking) | Standee spins fast on its vertical axis (2 turns, 0.6 s) and flips flat backwards; ring flashes white then rival red `#ff3b4e`, a short rising chime |
| Error / offline | Standee (if up) tips over forward; ring goes grey |

The standee is cheap (one box, one texture), goofy, and office-flavoured (a cardboard cutout of "your rival").

### 3.6 Performance budget (phones first-class)

- One renderer for the lobby. Render tier from `renderProfile()` as the showcase does: low = DPR 1, no shadows, 30 fps cap, no antialias; medium = DPR 1.5, 512 shadows, 60 fps; high = DPR 2, 1024 shadows.
- Budget: under 80 draw calls, under 60k triangles, no new texture over 256 px except the reused floor texture. Clouds merged into one geometry (or one InstancedMesh).
- Stop rendering when the tab is hidden and when the match starts (`stage.kind === 'playing'`). Dispose on unmount.
- No WebGL or `still` mode: a CSS fallback: vertical gradient `#1b2550` to `#f2a65a`, a white-ish cloud band (two blurred ellipses), and the fighter's rendered portrait on top. Layout identical.
- First paint must not wait for WebGL: UI renders immediately over the CSS fallback, the canvas fades in over 400 ms when ready.

## 4. Top section: the match HUD, before the match

Not a navbar. It mirrors the in-match HUD exactly (`docs/arena.png`): player plate left, the big number in the centre with a small line under it, rival plate right. The lobby is "the fight, before the fight".

```
 HOTFIX                         ▲ 42                          RIVAL
 [██████████████████▶          Ready · first to 5          ◀ - - - - - - - - - ]
 You · ready                                                  Not here yet
```

### 4.1 Player plate (left)

- Name: Bungee, 24 px desktop / 18 px phone, the fighter's accent.
- Under it: the in-game health bar shape (the same skewed parallelogram as the match HUD), 300 px desktop / 120 px phone, filled 100 % in the accent. Fills from 0 to 100 % in 300 ms when the fighter changes.
- Under it: `You · ready` (Chakra 12 px, cream 60 %). No uppercase tracking.

### 4.2 Centre: the lift display (home button)

- `▲ 42` in Bungee 32 px desktop / 22 px phone, gold `#ffd23f`, on a small dark ink plate `#0a0d18` with a 1 px cream 10 % border and the cut corner. It is the lift's floor indicator: we're on 42.
- It is a link to `/` (the main menu). Hover/focus: the ▲ turns into ▼ (going down) and the number counts 42 → 41 in a 150 ms flick, cream tooltip "Main menu". Use the lift doors (`useLiftTo`) for that navigation.
- Line under it, like "FIRST TO 5" under the match timer but in sentence case: the **connection line** (section 7 has all values). Chakra 12 px, a 6 px status dot before it.

### 4.3 Rival plate (right, mirrored)

- Name slot: `RIVAL` in Bungee, cream 35 %, until found; then `RIVAL FOUND` in rival red `#ff3b4e`.
- Bar: same parallelogram mirrored, empty, dashed 1 px cream 25 % outline. Searching: a red segment (20 % width) sweeps across it, 1.2 s loop. Found: fills 100 % red in 250 ms.
- Line under it: state text from section 7.
- On phones the rival plate drops the bar and keeps the name + one short line.

### 4.4 Rules

- No panel/background behind the top section on desktop: plates sit on the dark top of the sky. Add a top scrim (`linear-gradient(#0a0d18cc, transparent)`, 120 px) to guarantee contrast.
- Height: 76 px desktop, 60 px phone portrait, 44 px phone landscape (plates collapse to name + bar, no third line).
- `<header>` landmark; plates are `aria-live="polite"` on the rival side only.

## 5. Layout

All coordinates for the default viewport of each class; the wireframe shows them.

### 5.1 Desktop (1024 px and wider; reference 1440x900)

Three zones over the full-bleed scene, max content width 1360 px, 40 px side padding:

1. **Left column, 340 px: who you are.** Top at 120 px.
   - Role line (Chakra 15 px, cream 70 %), e.g. `High flyer`.
   - Name (Bungee 72 px, accent). Animates in on change (`riseIn` 350 ms, existing).
   - Pitch (Chakra 15 px, cream 80 %, max 2-3 lines).
   - Stats: three rows, no panel behind them (a 60 % ink scrim on the left 420 px of the screen carries contrast). Row: label left (`Speed`, sentence case, 13 px cream 60 %), value right (`9.4 m/s`, cream 90 %), 6 px bar under. Bar colours stay as they are now (speed blue, jump green, weight gold). Bars animate width 500 ms on change.
2. **Centre: the scene.** Nothing on top of the fighter. The fighter badges sit at the bottom centre.
   - **Fighter badges:** 4 badges, 104 x 128 px each, 12 px gap, centred, bottom at 32 px from the screen bottom. Section 6.
3. **Right column, 380 px: how you play.** Top aligned with the left column.
   - Aim choice (segmented control, 48 px tall, section 8.3). Hidden on touch, as now.
   - 16 px gap.
   - Primary: Invite a friend (full width, 72 px).
   - Secondary row: Quick match | Play vs bot (2 columns, 64 px each, 8 px gap).
   - Code row (48 px): input + Join, section 8.4.
   - Install hint (existing `InstallHint`) under it, small, only when it shows today.

Removed from this page: the `Steps` (01 Pick / 02 Grab a gun / 03 Outplay them) row. It repeats the home page and the in-match how-to. The win condition stays, in the centre HUD line.

### 5.2 Phone portrait (reference 390x844; must fit 360x740 without scrolling past the primary button)

Top to bottom:
1. HUD, 60 px.
2. Scene window, the top ~46 % of the viewport (canvas is still full-screen; the UI below sits on an ink scrim that starts at 44 % and is solid by 56 %).
   - Over the bottom-left of the scene: role (12 px), name (Bungee 36 px, accent), and stats as one compact row of three: `Speed ▮▮▮▮▯` `Jump ▮▮▮▮▯` `Weight ▮▮▮▯▯` (label 11 px + 48 px bar each). Pitch is hidden on phones.
3. Badges: 4 across, full width minus 32 px, 8 px gaps (about 80 x 96 px each).
4. Invite a friend (full width, 60 px).
5. Quick match | Play vs bot (2 columns, 56 px).
6. Code row: a 44 px `Got a code?` button that expands in place into the input + Join (input autofocuses). Collapsed by default to save height.
7. 24 px bottom padding + safe-area inset.

### 5.3 Phone landscape (reference 844x390; must fit 667x375 with no scrolling)

- HUD 44 px.
- Left 48 %: the scene. Name (Bungee 28 px) + role over its bottom-left. No stats bars (one line instead: `9.4 m/s · 2 jumps · average weight`, 12 px cream 70 %).
- Right 52 %, 16 px padding, top to bottom: badges (4 across, 64 px tall: portrait + name, role hidden), Invite (48 px), Quick | Bot row (44 px), `Got a code?` (40 px, expands as in portrait; while open it replaces the Quick | Bot row to keep the height).
- Total stack about 260 px: fits 375 - 44.

### 5.4 Tablet portrait (768-1023)

Phone portrait structure, centred, max width 560 px, desktop font sizes for the name (56 px) and stats with labels.

## 6. Character selection and colour identity

### 6.1 Badges, not operator cards

Each pick is a **staff ID badge on a lanyard** (we are in an office): a rounded rectangle (6 px radius, the only rounded element; that difference marks it as a physical object, not a UI panel).

- Top: 6 px strap in the fighter's accent with a 14 x 6 px dark clip notch centred.
- Body: ink `#141a2c`, portrait (existing `usePortraits` render) filling the top 72 %, on a soft radial glow of the accent at 25 %.
- Bottom: name in Bungee 14 px (accent), and on desktop the role in Chakra 11 px cream 55 %.
- Keyboard digit in the bottom-right corner on desktop: `1` `2` `3` `4` as a tiny keycap (the same keycap style as the in-game F hint), 10 px. Keys 1-4 pick (same keys as the respawn pick in a match).

States:

| State | Look |
| --- | --- |
| Default | Portrait at 75 % brightness, no border, sits flat |
| Hover / focus | Lifts 4 px (150 ms ease-out), portrait 100 %, tick sound (existing `menuSound.tick`). Focus also gets the gold focus ring |
| Selected | Lifts 8 px and tilts -2° (it's been picked up off the desk), 2 px border in the **fighter's accent**, portrait 100 % with scale 1.06, strap 10 px tall. No "YOU" tag (the HUD says it) |
| Disabled (searching / waiting / linking) | Whole strip at 45 % opacity, not clickable, `aria-disabled`. Changing fighter mid-search would desync what the server has |

Selecting plays `menuSound.confirm` and drops the new fighter onto the slab (3.5).

### 6.2 Per-character colour identity

The accent is used in exactly five places, nowhere else: the name (left column + HUD plate), the HUD bar fill, the badge strap + selected border, the rim light, the floor glow under the fighter. The page background does not change hue (the current full-page radial wash goes).

| Fighter | Accent (unchanged) | Rim light | Idle tempo |
| --- | --- | --- | --- |
| Hotfix | `#ff6a3d` | `#ff7a4d` | restless |
| Legacy | `#3ddc84` | `#4be08f` | slow, heavy |
| Standup | `#3ec5ff` | `#58ceff` | fast |
| Intern | `#ffd23f` | `#ffc94a` | twitchy |

**Intern vs the gold button (known conflict, decision):** Intern's accent equals the UI gold. I'm not changing Intern's colour (it's in the match HUD and the model's backpack). In the lobby the two never touch: Intern's accent only appears in the five places above, and the gold button is a filled block with ink text, while Intern's marks are text, thin bars and outlines. Re-evaluate in the R-001 audit if it causes confusion in the match HUD.

### 6.3 Rival colour

Rival red `#ff3b4e` (the current VS red, the "incoming" side of the diff palette). Used for the rival plate's found state, the searching sweep and the found flash on the ring. Never for errors (errors are orange `#f2542d`, see 7).

## 7. States and copy

Copy uses the existing `useCopy()` variants where a line differs; otherwise one line for both. All sentence case. No uppercase tracked labels anywhere on this page.

### 7.1 Connection line (under ▲ 42) and right column per state

| Stage (code) | Dot | Centre line | Rival plate line | Right column |
| --- | --- | --- | --- | --- |
| menu, browser online | green `#3ddc84`, static | `1v1 · first to 5` (dev: `1v1 · first to 5 takes the merge`) | `Not here yet` | the menu (5.1) |
| menu, `navigator.onLine === false` | orange, static | `No internet` | `Can't reach anyone` | menu, but Invite and Quick match disabled with the reason under Invite: `You're offline. The bot is still here.` Play vs bot stays enabled |
| connecting | gold, pulsing | `Connecting…` | `Calling the lift…` | Status panel A |
| waiting, invite (room created) | gold, pulsing | `Room open` | `Waiting for them to open the link` | Status panel B |
| waiting, quick | gold, pulsing | `Searching · 0:12` (elapsed, m:ss) | `Searching` | Status panel C |
| linking (rival found) | rival red, solid | `Rival found` | `Connecting you directly…` | Status panel D |
| error | orange, static | `Disconnected` | `Can't reach anyone` | Status panel E |
| joining from a link (`?room=`) | gold, pulsing | `Joining room AbC12` | `Opening the door…` | Status panel A with title `Joining room` |

The green dot means "your browser is online", nothing more. Don't claim the server is up before it answered.

### 7.2 Right column content per state

All status panels: same column, same width, ink `#141a2c` at 92 % with the cut corner, 24 px padding, `riseIn` 300 ms. Fighter badges disabled (6.1). Every panel except D has a **Cancel** text button at the bottom (leaves the room, returns to menu; Esc does the same). Cancel is new behaviour: today the only way out of a search is leaving the page.

- **A. Connecting.** Title (Bungee 24): `Connecting`. Body: `Reaching the game server.` A gold indeterminate bar (the HUD bar shape, a segment sweeping) instead of the spinner.
- **B. Room created (invite).** Title: `Send this to your rival`. Body: `The match starts the moment they open it.`
  - Room code block: label `Room code` (13 px, cream 60 %), code in monospace bold 40 px gold, `select-all`. Codes are case-sensitive: keep the case, don't use Bungee.
  - Link field (read-only, selects on focus).
  - Buttons: `Copy invite link` (primary gold, full width; after click: `Link copied` with a check icon, green fill, 1.5 s) and, where `navigator.share` exists, `Share…` (secondary).
  - Footer: `Nobody yet? Play the bot` (text link) · `Cancel`.
- **C. Quick match searching.** Title: `Looking for a rival`. Body: `Anyone waiting gets matched with you.` Elapsed time in Bungee 32 px cream (`0:12`). After 30 s add a line: `Quiet right now. Invite a friend or play the bot while you wait.` with `Invite a friend` as a secondary button (switches to a private room) and the bot link. Footer: `Cancel`.
- **D. Rival found.** Title: `Rival found` (rival red). Body: `Connecting you directly…`. No cancel. Then the lift doors (`Elevator`) close and open on the arena, like every other big transition.
- **E. Error.** Title: `Lost the connection` (or `That room is gone` for a failed join). Body: the existing message text (`That room is full or gone. Ask for a new link.` / `Can't reach the game server.`; keep the technical detail out of the main line, put it in a 12 px cream 45 % line under it). Buttons: `Try again` (primary, repeats the same mode), `Play the bot` (secondary). Footer: `Back`.

### 7.3 Menu copy (every label)

| Element | Regular | Developer (only if different) |
| --- | --- | --- |
| Lift display tooltip / aria-label | `Main menu` | |
| Player plate line | `You · ready` | |
| Rival plate name | `Rival` | |
| Left column role/pitch/stats | existing `copy.fighters`, stat values as today (`9.4 m/s`, `2× jump`, `hard to shove` / `average` / `light`) | |
| Badge group aria-label | `Choose your fighter` | |
| Aim control label | `Aim` | |
| Aim options | `Auto-aim` / `Mouse` | |
| Aim hints (under the control, one line, changes with the choice) | `Space shoots your rival when you can see them.` / `Point to aim. Left click or Space shoots.` | |
| Primary | `Invite a friend` | |
| Primary sub | `Get a link and a code to send` | |
| Quick match | `Quick match` | |
| Quick match sub | `Fight whoever is waiting` | |
| Play vs bot | `Play vs bot` | |
| Play vs bot sub | `Start right now` | |
| Code row (collapsed) | `Got a code?` | |
| Code input placeholder | `Room code or invite link` | |
| Code button | `Join` | |
| Offline reason under Invite | `You're offline. The bot is still here.` | |

Decision on developer jokes here: none. The lobby is where people act fast; the jokes live in the match intro, results and tips.

## 8. Components

### 8.1 Buttons (hierarchy)

| Level | Use | Look |
| --- | --- | --- |
| Primary | Invite a friend; Copy invite link; Try again | Gold `#ffd23f` fill, ink `#0a0d18` text, Bungee 20 px title + Chakra 13 px sub (ink 75 %), the existing cut corner (`panel-cut`), icon 28 px left in a 44 px ink-15 % square, `→` right. Glow `0 0 40px rgba(255,210,63,.3)`. Only one primary visible at a time |
| Secondary | Quick match, Play vs bot, Share…, Invite (in panel C) | Ink `#141a2c` at 88 % fill, 1 px cream 12 % border, cream text, Bungee 17 px + 12 px sub. Icon 24 px |
| Tertiary | Cancel, Back, Play the bot links, Got a code? | Text only, Chakra 14 px semibold, cream 70 %, underline on hover |

States for primary and secondary: hover lifts 2 px and brightens 10 %, the existing light sweep stays on primary only; press: down 1 px, scale 0.98, 80 ms; focus: gold 2 px focus ring (existing `focus-ring`); disabled: 40 % opacity, no lift, cursor default, reason text visible somewhere (never a silent disabled button). Sounds unchanged (`tick` on hover/focus, `confirm` on click).

### 8.2 Icons

Replace the emoji with the three SVGs in `docs/collab/CREATIVE/assets/` (24 px grid, 2 px stroke, square caps and mitre joins: blocky like the voxel models, `currentColor`):
- `icon-invite.svg`: a paper plane (you send the link).
- `icon-quick.svg`: two arrows meeting head-on (a match).
- `icon-bot.svg`: a square bot head with an antenna.

### 8.3 Aim control

A two-option segmented control (one 48 px row, not two big tiles): ink background, the active half gold with ink text, 150 ms slide of the gold block between halves. The hint line sits under it, 12 px cream 60 %, and changes with the choice. Shortcut note at the end of the hint: `T switches in a match.`

### 8.4 Code row

Input (ink-deep, cut corner, monospace 15 px, keeps case) + `Join` secondary button. Join disabled until there's text. Accepts a full invite link or a bare code (existing parsing). Enter submits.

## 9. Motion summary

| Moment | Motion | Duration |
| --- | --- | --- |
| Page load | Scene fades in from the CSS fallback; HUD plates slide in from their sides 16 px; right column buttons `riseIn` staggered 50 ms | 400 ms total |
| Change fighter | Badge lifts/tilts; old fighter pops up and out (0.2 s), new one drops in with squash + dust; name `riseIn`; HUD bar refills; stats bars tween; rim/glow crossfade | 400 ms |
| Start search / create room | Badges dim; right column swaps to the panel (`riseIn`); standee pops up on the ring (overshoot scale 0 → 1.1 → 1, 300 ms) | 300 ms |
| Rival found | Standee spin + flip, ring flash, rival bar fills red, chime; 600 ms later the lift doors close | 600 ms + lift |
| Error | Standee tips over (rotate 90° forward, 400 ms, bounce), dot turns orange | 400 ms |
| Cancel | Reverse of start | 250 ms |

Reduced motion: no slides, lifts, tilts, spins or drops; fades only (150 ms). The scene holds still (3.4).

## 10. Accessibility

- Text on the sky only in the top scrim and the left scrim zones; minimum 4.5:1 for body text, 3:1 for Bungee 24 px+.
- Badges are a `radiogroup` with arrow-key navigation (existing pattern); digits 1-4 also pick.
- Esc cancels a search/room. Gamepad nav (`useGamepadNav`) covers badges, aim, buttons, code row in that order.
- State changes announced through the rival plate's `aria-live`.
- The canvas is `aria-hidden`.

## 11. Must not change

- Every function: online status, character select + stats, auto-aim/mouse toggle, invite friend (room, link, code, copy, share), quick match, play vs bot (with the picked fighter, `bot=normal`), join by code or link, join straight from `?room=`, install hint, audience prompt, the lift transition, the saved fighter (`CHAR_KEY`) and aim setting.
- Networking flow and stage machine in `OnlineLobby.tsx` (only Cancel is added).
- The character rigs, accents, names, stats, and `copy.ts` fighter text.
- Fonts (Bungee, Chakra Petch), gold `#ffd23f`, ink `#0a0d18`, cream `#e6ebf5`, the cut-corner panel shape.

## 12. Acceptance criteria (I will review against these)

1. At 1440x900, 390x844 and 844x390 the primary button is visible without scrolling, and nothing overlaps the fighter's body.
2. The fighter is seen from the front or three-quarter front in every capture; never from behind.
3. No grid, perspective floor, light streaks, skyline, neon or outlined "42" remain on `/play`. No emoji icons.
4. No uppercase letter-spaced label anywhere on the page (check `tracking-widest`, `tracking-[0.2em]`, `uppercase` in the lobby components).
5. The top section is three HUD elements (player plate, ▲ 42, rival plate) with no navbar bar behind them; ▲ 42 goes to the main menu through the lift.
6. The connection line never says the game is online before a server answered; offline shows `No internet` and disables the two online buttons with the reason shown.
7. Each of the 8 states in 7.1 can be captured and matches its row (engineering: a `?lobbyState=` dev-only override for screenshots would make my review exact; your call).
8. Switching fighters 4 times quickly never leaves two fighters on the slab and never leaks a WebGL context (one canvas for the whole page).
9. Low tier on a mid phone: 30 fps steady, under 80 draw calls (log `renderer.info` once in dev), no shadows.
10. The cardboard standee appears in searching/room-created, spins on found, tips over on error.
11. Reduced motion: scene static except breathing, no slides.

## 13. Priority inside R-002

- P0: scene (slab, glass, desk, crate, ring, clouds, sky, light), front-facing fighter, HUD top, layouts for the three sizes, badges, buttons + icons, all states and copy, Cancel, removal list.
- P1: standee animations, paper sheet, cables sway, distant chunks, pointer parallax, dust puff.
- P2: per-character signature idle beats (ship the tempo fallback in P0).

## 14. Changes after the build review (R-003, R-004, 2026-11-21)

Accepted engineering deviations (they override sections above):
- Desktop framing: fighter feet at y 66 %, fighter about 30 % of the viewport height; the wide shot carries "floating above the clouds" (requires F-002 so the clouds read).
- Phone portrait: fighter at x 40 %; rival spot 1.3 m from the fighter in every layout.
- Idle gun cycle: pistol, SMG, shotgun (no railgun; draw-call budget).
- Slab top = 0.1 m oak box over a stone body.
- Gamepad nav active in the lobby, DOM order, B cancels.
- Signature idle beats (3.5) stay P2 and move to the R-001 backlog; the per-character tempo fallback is the shipped idle.

Replaced: phone portrait panel states follow F-003 (panel docked to the bottom, info block shown except in the invite state). Scrims and prop positions: F-001, F-002, F-004, F-005 in FEEDBACK.md.

Lobby scene budget rule (from R-003): the low tier runs at about 70 of 80 draw calls. Any new prop must remove something of equal cost. Cut order if room is needed: distant floors, rebar stubs, paper sheet. Never cut: slab, fighter, ring, standee, glass, desk, crate, clouds.
