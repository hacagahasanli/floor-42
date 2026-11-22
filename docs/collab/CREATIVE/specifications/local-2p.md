# Local 2-player (same keyboard) — spec

R-009 · CD · 2026-11-23 · Status: ready for implementation (P0)

Goal: two friends at one laptop can start a Floor 42 duel in two clicks with keys they already know from the 2-player browser games they play. In-match look, arena, rules and 1P keys do not change.

---

## 0. Research: what 2-player browser games have taught players

Verified on 2026-11-23 from each game's "Controls" section on crazygames.com (quoted, fetched today):

| Game | P1 | P2 |
| --- | --- | --- |
| Stickman Clash (39.6M plays) | W jump, A/D move, S shield | Arrow keys (same roles) |
| Puppet Fighter 2 Player | WASD move, **F action** | Arrow keys move, **L action** |
| Stickman Kombat 2D | WASD move, **F attack, G special** | IJKL move, **; attack, ' special** |
| Ragdoll Archers (2P mode) | WASD, Left Shift jump | Arrow keys, Right Shift jump |
| Ragdoll Arena 2 Player | WASD move, **G** jump/shoot | Arrow keys move, **P** jump/shoot |
| Basket Random | W | Up arrow |
| Getaway Shootout | W, E jump, R power-up | I, O jump, P power-up |
| Gun Mayhem (older Flash port) | Arrow keys, [ shoot, ] bomb | WASD, T shoot, Y bomb |
| Gun Mayhem 2 | Arrow keys, Z / X weapons | WASD, T / Y weapons |
| Fireboy & Watergirl | (CrazyGames page lists arrows for Fireboy, A/D for Watergirl; the jump line on the page looks garbled, not relied on) | |

CrazyGames quality guidelines, "Restricted keys" (docs.crazygames.com/requirements/quality): controls must be intuitive; bindings should adapt to the keyboard layout (AZERTY: WASD becomes ZQSD); avoid keys with web behaviour: Escape (closes fullscreen), Ctrl/Cmd+W (closes the tab). Onboarding: "show the user how to control the game with a keyboard overlay".

What this tells us (interpretation):
1. **P1 = WASD on the left, P2 = arrow keys on the right** is the dominant modern convention (Stickman Clash, Puppet Fighter, Ragdoll Archers, Ragdoll Arena). Gun Mayhem's reverse order is a Flash-era outlier; we follow the majority.
2. **P1's action keys sit just right of WASD on the home row (F, G)**: Puppet Fighter F, Stickman Kombat F + G, Ragdoll Arena G.
3. **P2's action keys sit on the right of the letter block (L, ;)**: Puppet Fighter L, Stickman Kombat ; + '.
4. The hits use **1 to 3 action keys per player**. None uses Space, Enter, Ctrl, Alt or the numpad.

Not verified: real play of these games, key ghosting on specific laptops, Poki pages (poki.com timed out).

---

## 1. Key maps

### 1.1 Decision

| Action | P1 (left side) | P2 (right side) |
| --- | --- | --- |
| Move left / right | **A / D** | **← / →** |
| Jump (double jump, wall kick) | **W** | **↑** |
| Crouch / drop through a walkway | **S** | **↓** |
| Shoot (hold = automatic, auto-aim always on) | **F** | **;** |
| Force Push (or throw a carried bomb, see 2) | **G** | **L** |
| Dash | **H** | **K** |
| Pause (either player) | Esc | Esc |

Mnemonic printed on the key card: **"Shoot is the key next to your hand. Push is next to that. Dash is the far one."** Both maps are mirror images by finger: P1's right index finger on F, middle G, ring H; P2's left index finger on ;, middle L, ring K. Each player uses two hands: P1 left hand on WASD, right hand on F G H; P2 right hand on the arrows, left hand on K L ;. J is the empty buffer between the two players' hands.

### 1.2 Why these keys
- WASD/arrows: section 0, point 1. Every CrazyGames 2P regular already has them in their hands.
- F (shoot) is exactly Puppet Fighter's and Stickman Kombat's P1 action key; G is Stickman Kombat's special and Ragdoll Arena's shoot. ; is Stickman Kombat's P2 attack, L is Puppet Fighter's P2 action.
- Three action keys, not four: shoot, push, dash are the three skills that decide a Floor 42 fight. Everything else is automatic (section 2).
- All on letter rows: works on every laptop (no numpad), and physical codes (`KeyF`, `Semicolon`) keep the hand positions on AZERTY/QWERTZ.

### 1.3 Keys deliberately NOT used in 2P, and why
- **Space**: belongs to nobody (both thumbs reach it), and it is the 1P shoot key; in 2P it does nothing.
- **Shift (both)**: five Shift presses open the Windows Sticky Keys dialog, which steals focus mid-match. 1P keeps Shift dash; 2P does not use it.
- **Enter, Tab, Ctrl, Alt, Cmd, Fn**: Enter/Tab are reserved by the game (menus, focus); Alt focuses the browser menu on Windows; Ctrl/Cmd combine into browser shortcuts (Ctrl+W closes the tab).
- **' and /**: open Firefox's Quick Find when not suppressed. (Stickman Kombat uses ', we don't.)
- **Numpad**: absent on most laptops.
- **Esc**: pause only (it also leaves fullscreen on CrazyGames; acceptable, same as 1P today).
- **T (aim toggle), M (mute), 1-4**: T and 1-4 are inert in 2P (mouse aim is off, no mid-match fighter change). M still mutes.

### 1.4 Browser and frame safety (engineering acceptance)
- Call `preventDefault()` on keydown for every 2P key, on the 2P select screen, key card, match and results (arrows and Space must never scroll the CrazyGames page; letters must never start Firefox "search when typing").
- Bind by `KeyboardEvent.code` (physical position). Show labels from `navigator.keyboard.getLayoutMap()` where available (Chrome/Edge), US labels otherwise. On AZERTY the card must read Z Q S D, not W A S D.
- Window blur clears both players' held keys (already true for 1P).

### 1.5 Key ghosting
Worst realistic moment: each player holds a direction + shoot and taps jump = 6 keys down at once (8 with both dashes). Cheap membrane keyboards and some laptops drop or ghost keys in certain combinations; we cannot know which in advance. So:
- The pre-match key card is also a **key tester**: every key lights up while held (section 4.1). Players find a dead combo before the fight, not during it.
- Settings → Controls gets a **2 Player** tab: both maps rebindable, a key may be on only one action across both players, reserved keys refused, "Reset 2 player keys" button.
- Engineering test, recorded in LOG.md: on a MacBook keyboard and one cheap USB keyboard, hold `A W F H` + `← ↑ ; K` together and note which keys drop. If a common laptop drops one of our defaults, report in REQUESTS.md; do not change the map yourself.

### 1.6 Gamepads
In-match gamepad input does not exist yet (only menu nav); add it for 2P:
- **One pad connected**: the pad plays **P2** (the friend takes the controller, the keyboard player keeps the whole keyboard). Both keyboard maps keep working.
- **Two pads**: pad 1 = P1, pad 2 = P2 (order of `navigator.getGamepads()` index). Keyboard maps keep working.
- Map (standard layout): left stick / D-pad move, stick down or D-pad down crouch/drop (deadzone 0.5), **A jump**, **X or RT shoot**, **B or LB push**, **RB or LT dash**, **Start pause**. Stick up does NOT jump.
- The select screen shows a small pad glyph in the panel the pad drives; pads navigate the select screen like their player's keys (A = ready).

---

## 2. Simplified / automatic in 2P

| 1P action | In 2P |
| --- | --- |
| Pick up / swap gun (F) | **Automatic.** Walking over a floor gun takes it at once if you hold the pistol, or if your gun has under 25 % of its full ammo (mag + reserve) left. Otherwise **stand on the ring for 0.5 s**: a ring fills under your feet in your player colour, then you swap. Moving off cancels. |
| Reload (R) | **Automatic.** Empty mag reloads itself (already true); also a part-empty mag reloads itself after 1.2 s without shooting. |
| Crouch anywhere (C) | **Dropped.** S / ↓ crouches on the floor and desks and drops through walkways. |
| Throw bomb (G) | **On the Push key.** While you carry a bomb, Push (G / L) throws the bomb instead of pushing. Push comes back the moment the bomb leaves your hand. The push-cooldown ring on the HUD plate shows a bomb icon while one is carried. |
| Aim | Auto-aim for both, always. Mouse aim and T are off. |
| Mouse | Click works in menus and on buttons only; never shoots. |

---

## 3. Main menu and 2P flow

### 3.1 Main menu
New order (desktop, keyboard/pad devices):

1. PLAY — `Fight the bot as {fighter}` (unchanged)
2. **2 PLAYER** — `One keyboard, two fighters`
3. PLAY ONLINE — unchanged (non-portal builds only)
4. FIGHTER — unchanged
5. SETTINGS — unchanged
6. HOW TO PLAY — unchanged

CREDITS leaves the list (section 7). 2 PLAYER takes the second slot because it is the second reason people open a CrazyGames duel game, and it sits right under PLAY where the eye already is. Same MenuItem component, same slant, focus bar, tick and entry animation as the others; no badge, no "NEW" tag.

When a gamepad is connected the sub reads `One keyboard or two pads`.

### 3.2 2P fighter select (new screen, reached from 2 PLAYER)
Layout desktop (≥ 1024 wide): the screen splits into two panels with the menu backdrop dimmed behind (existing backdrop, no new 3D rigs).
- **Left panel P1, right panel P2.** Header chip `P1` / `P2` in the player colour (3.4), under it the player's keys in keycaps: `A D move · F ready`, `← → move · ; ready`.
- Each panel: the four fighters as a 2x2 grid of the existing staff-badge cards (portrait, name, accent stripe). The player's cursor is a 3 px border in their player colour.
- Under the grid: big fighter name in the fighter accent + the one-line description already used in FIGHTER.
- Default picks: P1 = the saved 1P fighter, P2 = the next fighter in the roster order.
- Same fighter for both is allowed (mirror match). A card picked by both shows a split border: left half P1 colour, right half P2 colour.

Controls on this screen:
- Move cursor: A/D/W/S for P1, arrows for P2 (2x2 grid).
- **Lock in: the player's Shoot key (F / ;)** → the panel shows `READY` stamped across the bottom in the player colour, the fighter card pops 1.06x for 120 ms. Moving the cursor after locking unlocks.
- **Match length:** a centre chip between the panels `First to 5`; either player's Push key (G / L) cycles 3 → 5 → 7 → 3. Default 5 (the game's identity line is "first to five"). Remembered for the session. Clickable with the mouse.
- Esc / pad B: back to the main menu.
- Mouse: click a card in a panel to pick for that panel; click `Ready` button under each panel.
- When both are READY: 500 ms hold, then the key card (4.1) the first time in this browser session, otherwise straight into the match (lift doors as today).

Narrow desktop (< 1024 wide, keyboard device): panels stack fighter grids as single rows of 4 small cards; everything else the same.

### 3.3 Match rules
- First to N KOs (N = 3, 5, 7 from the select screen), same 150 s timer and same time-out rule as vs bot.
- Same arena, same guns, same spawns. No bot.

### 3.4 Player colours (2P only)
| | Normal | Colour-blind mode |
| --- | --- | --- |
| P1 | `#ff4d4d` red | `#e69f00` |
| P2 | `#4d7cff` blue | `#56b4e9` |

Red/blue is the universal 2P code (Stickman Clash, Fireboy & Watergirl). Used only for: P1/P2 tags, ground rings, select cursors, READY stamps, score digits, results headline. **Never** on HP bars (HP bars keep fighter accent → low-HP colour as today), so colour never means two things on one plate.

---

## 4. In-match

### 4.1 Key card (before the first round, once per session; also from Pause → Controls)
Full-screen overlay on the dimmed arena, before the countdown.
- Two halves. Left: `P1` chip, the fighter name, and a drawn key cluster: W A S D as a cross, then F G H in a row with labels under each cap: `Shoot`, `Push`, `Dash`. Right: same for P2 with ↑ ← ↓ →, then ; L K (mirrored order: Shoot nearest the arrows). Keycaps reuse the existing `Keycap` style at 44 px.
- **Key tester:** a keycap fills with the player colour while its key is held. Under each half: `Hold your keys. They light up.`
- Footer line (small, cream 45 %): `A key stays dark? Your keyboard can't take that combo. Change keys in Settings → Controls → 2 Player.`
- Start: `Both press SHOOT to fight` with two ready ticks (`P1 ✓` `P2 ✓`); Enter also starts. Esc goes back to the select screen.
- After that the normal 3.6 s countdown/title card runs.
- Pad players see pad glyphs instead of keycaps in their half.

### 4.2 HUD
- Plates: **P1 always left, P2 always right** (matches where they sit). Plate name line: `P1` chip in player colour + fighter name in fighter accent, e.g. `[P1] HOTFIX`. Replaces the `YOU` / `BOT` labels.
- Score digits in the centre use the player colours (not fighter accents), so a mirror match still reads.
- Over each fighter's head: a small tag `P1` / `P2` (player colour fill, ink text, 12 px font, 8 px above the head) and a thin ground ring (ellipse, player colour, 35 % opacity) under the feet. Both always on in 2P. Cost: 4 quads.
- Key strip at the bottom: two strips, P1 bottom-left, P2 bottom-right (mirrored), showing `move · F shoot · G push · H dash` and the P2 equivalent. Full opacity until the first KO, then 40 %. Hidden when "Key hints" is off.
- Camera shake: same events, but trauma is capped at 0.6 in 2P (one player's hit must not blind the other). Hit-stop unchanged.

### 4.3 Camera
Desktop already uses the fixed full-office camera, so both players are always on screen: **keep it, no follow camera in 2P**, even if the 1P framing camera from basic-launch-kpi.md ships later. The touch follow camera never runs in 2P (2P is off on touch, section 6).

### 4.4 Pause
Esc (or Start on a pad) by either player pauses at once; no agreement step. The existing pause panel, with: title `Paused`, a line `{P1 or P2} paused`, buttons `Resume` (Esc), `Controls` (opens the key card in view mode, no tester footer), `Settings`, `Quit to menu`. No "rival" wording.

### 4.5 Results / rematch
- Headline: `P1 WINS` / `P2 WINS` in the winner's player colour (draw: existing draw headline).
- Coloured line under it (both audiences): `{Fighter} takes the floor.` (developer audience: `{Fighter} merged first.`)
- Stats table: column heads `P1 · {Fighter}` and `P2 · {Fighter}` instead of YOU / BOT. Same rows.
- **Session tally** under the table: `Tonight: P1 2 – 1 P2` (counts matches since the 2P select screen was opened; resets when you leave to the main menu). This is the couch rivalry hook.
- The rival-picker row (bot rival chooser) is hidden in 2P.
- Buttons: `Rematch` (primary, gold, `Enter` hint), `Change fighters` (back to 3.2 with both picks kept, unlocked), `Main menu`.
- Rematch also starts when **both players press Shoot** (ready ticks `P1 ✓ P2 ✓` appear on the button). Rematch skips the key card.

---

## 5. Who wins
First to N KOs, N from the select screen (default 5). On time-out, the existing vs-bot rule applies unchanged. The tally counts only decided matches.

---

## 6. Touch devices — decision: hide 2 PLAYER

- On touch-only devices (`isTouchDevice()` true and no gamepad connected) the **2 PLAYER item is not shown** and the menu keeps its current touch order.
- If a gamepad connects on a touch device (tablet + pads), the item appears; pads play P1 and P2 (1.6).
- Why: Floor 42 needs a stick + 4 buttons per player; two players on one phone, or even a 10" tablet, would cover the fighters with buttons and both players' hands. Stickman Clash and Basket Random work on one phone because they are 1-3 button games; ours is not, and a cramped 2P would be a worse first impression than none. CrazyGames' 2P shelf is mostly desktop traffic (assumption, not verified).
- Backlog (not now): a tablet-landscape split layout (each player a half-height stick + Shoot/Push on their own edge, dash removed). Re-evaluate after 2P ships on desktop and we see 2P share.

---

## 7. Credits

- **Removed from the main menu list.** Its slot goes to 2 PLAYER (net item count unchanged in non-portal builds: 6).
- **Where it lives now:**
  1. Main-menu footer (desktop): the existing line becomes `Nalbaki Games · v{version} · Credits`; `Credits` is a text button (cream 45 %, underline on hover/focus, reachable with Tab) that opens the existing Credits side panel, unchanged.
  2. Settings panel, last row of the last tab: a `Credits` button with the same style as the panel's other secondary buttons, opens the same panel. This covers phones and short landscape, where the footer is hidden.
- Credits panel content does not change.

---

## 8. New copy (all strings)

| Where | String |
| --- | --- |
| Menu item | `2 PLAYER` |
| Menu sub | `One keyboard, two fighters` |
| Menu sub (pad connected) | `One keyboard or two pads` |
| Select chips | `P1`, `P2` |
| Select key hints | `A D move · F ready` / `← → move · ; ready` (labels follow layout) |
| Select stamp | `READY` |
| Select mouse button | `Ready` |
| Length chip | `First to 3` / `First to 5` / `First to 7` |
| Length chip hint | `G / L to change` |
| Key card labels | `Shoot`, `Push`, `Dash`, `Move`, `Jump`, `Crouch` |
| Key card mnemonic | `Shoot is the key next to your hand. Push is next to that. Dash is the far one.` |
| Key card tester line | `Hold your keys. They light up.` |
| Key card footer | `A key stays dark? Your keyboard can't take that combo. Change keys in Settings → Controls → 2 Player.` |
| Key card start | `Both press SHOOT to fight` |
| Key card ticks | `P1 ✓`, `P2 ✓` |
| Key strip P1 | `A D move · W jump · F shoot · G push · H dash` |
| Key strip P2 | `← → move · ↑ jump · ; shoot · L push · K dash` |
| Pause sub | `P1 paused` / `P2 paused` |
| Pause button | `Controls` |
| Results headline | `P1 WINS` / `P2 WINS` |
| Results line (regular) | `{Fighter} takes the floor.` |
| Results line (developer) | `{Fighter} merged first.` |
| Results tally | `Tonight: P1 {a} – {b} P2` |
| Results buttons | `Rematch`, `Change fighters`, `Main menu` |
| Settings tab | `2 Player` |
| Settings reset | `Reset 2 player keys` |
| Settings row (credits) | `Credits` |
| Footer link | `Credits` |
| How to play, new section title | `2 player keys` (the two strips above as rows) |

Copy rules: sentence case except menu items and headlines (existing caps style); no emoji; `✓` is the only symbol added.

---

## 9. Must not change
- 1P bindings, defaults and the Settings → Controls 1P tab.
- Arena, guns, damage, cooldowns, timer, countdown/title card.
- Online and vs-bot flows and their screens.
- Touch layout and touch menu order.

## 10. Acceptance
1. From a cold start on desktop, Enter on 2 PLAYER → both press their Shoot key twice (lock in, start) → fighting in under 15 s.
2. All keys in 1.1 work for both players at the same time; no page scroll, no find bar, no Sticky Keys prompt in Chrome, Firefox, Safari, Edge (Windows and macOS), including inside the CrazyGames iframe (QA tool).
3. AZERTY layout in Chrome: key card shows Z Q S D.
4. Mirror match (Hotfix vs Hotfix) is readable from tags, rings and score colours alone.
5. 2 PLAYER is absent on a phone and appears when a gamepad is connected.
6. Credits opens from the desktop footer and from Settings; it is not in the menu list.
7. Ghosting test results (1.5) logged.
8. Shots for CD review: main menu (desktop), 2P select (both unlocked, one READY, both READY, mirror), key card (one key lit per player), HUD mid-match, pause, results with tally, Settings → 2 Player tab, footer with Credits. 1440x900 and 1024x768.
