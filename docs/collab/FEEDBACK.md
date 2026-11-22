# Feedback (Creative Director -> Claude Code)

Format: `## F-001 — title` then What is wrong, Why it matters, What should change, Expected result, Related spec, Status.

---

# Review R-004: lobby v2 build 4bc9ad1 (2026-11-21)

Verdict: **accepted with changes.** The direction landed: front-facing fighter, the HUD top, the badges, the standee, the button hierarchy, every state and its copy, Cancel. No grid, streaks, skyline, neon, emoji or tracked uppercase labels (checked the shots and grepped `src/components/lobby` for `tracking|uppercase|letter-spacing`). Four things stop it from reading as finished: the desktop info column is unreadable over the desk, the clouds read as grey rocks, phone portrait panels leave a dead half-screen, and phone landscape puts the orange name on the orange floor glow. F-001 to F-004 are P0/P1; F-005 and F-006 are polish.

Reviewed from: the 30 PNGs + contact sheet in `~/.agents-know/personal/feedback4/shots/f42-lobby-v2/` (opened desktop menu/invite/error, portrait menu/invite/quick, landscape menu/offline/invite at full size, the rest on the contact sheet), `lobbyScene.ts` (clouds, slab, props, cables), `lobby.css` (scrims, breakpoints). Not seen: motion (stills only), 360x740 and 667x375 fits, a real phone.

Deviations from LOG "R-002 built": 1 (wider desktop shot), 2 (portrait fighter at x 40 %, rival 1.3 m away), 3 (no railgun), 5 (two-mesh slab), 6 (shared exports), 7 (gamepad nav) are **accepted** and written into the spec (lobby-v2.md section 14). Deviation 4 (portrait hides the left info in panel states) is **replaced** by F-003.

## F-001 — Desktop: fighter info is unreadable over the desk and monitors (P0)
- What is wrong: at 1440x900 the stat values (`9.4 m/s`, `2× jump`, `average`) and the pitch sit directly on the white desk top, the monitors and the glass frame. `2× jump` is on top of a monitor. The 60 % left scrim is not enough against the near-white desk.
- Why it matters: this is the "who you are" column; spec 10 requires 4.5:1 for body text. It also makes the left third look cluttered, the opposite of "nothing busy around the fighter".
- What should change (both):
  1. `.lb-scrim-left`: width 560 px; `linear-gradient(90deg, rgba(10,13,24,.82) 0, rgba(10,13,24,.82) 340px, transparent 560px)`. Unchanged on the tablet/phone breakpoints.
  2. Move the office set +1.0 m in x toward the fighter: glass `gx` -3.0 → -2.0, desk -3.0 → -2.0, paper-sheet spawn x -3.0 → -2.0. The glass then frames the fighter's head from behind as spec 3.1 intended, and the desk clears the text column.
- Expected result: at 1440x900 no part of the desk, monitors or glass frame is behind any text of the left column (x 40-380 px); every left-column text passes 4.5:1. The desk is still fully visible and readable as a desk.
- Related spec: lobby-v2.md 3.1, 5.1 (left column), 10.
- Status: done (Engineering, 2026-11-21; see LOG.md)

## F-002 — The cloud sea reads as grey boulders (P0)
- What is wrong: under the slab on desktop (bottom-left and bottom-right) the cloud puffs show as large dark grey faceted masses. Next to the grey stone chunks they look like a rocky mountain the slab sits on. Nothing on screen says "clouds", so "floor 42, above the clouds" does not read. Cause in code: puff underside `#a3abd0`, `emissive: 0x6a6070` (greys every face), puffs scaled 2.6-5.2 with `sy` 0.5, and we mostly see their sides.
- Why it matters: the floating-above-the-clouds idea is the whole concept of the screen and the reason deviation 1 (wider shot) was accepted.
- What should change (same InstancedMesh, same 52 instances, no extra draw calls):
  1. Colours by height: top `#fff2e0`, middle (0.5) `#f6c9a6`, underside `#c7a9be` (warm lilac, not blue-grey). Add the mid stop to `puffGeometry`.
  2. Emissive `0x6a6070` → `0x4a3a40` at `emissiveIntensity` 0.6, so the shaded sides go warm, not grey.
  3. Flatter, more puffs per cluster: `sy` = s × 0.38, s range 1.8-3.8, 5 puffs per cluster for all 10 clusters (50 instances).
  4. Move 3 of the clusters closer and lower so cloud tops are seen right under the slab: x within ±12, y -4 to -6, z -2 to -8.
  5. Torn-edge chunks and wedge stay `PALETTE.stone`: the contrast "dark stone slab, bright cloud" is what sells it.
- Expected result: in desktop-menu, the bottom 25 % of the screen around the slab is mostly bright, warm cloud tops fading into the fog; no single grey faceted shape larger than the crate on screen; a person seeing the shot for the first time says "clouds", not "rocks". Same check in portrait and landscape where the area below the slab shows.
- Related spec: lobby-v2.md 3.1 (Clouds row), 3.2 (fog), 2.
- Status: done (Engineering, 2026-11-21; see LOG.md)

## F-003 — Phone portrait panel states: dock the panel to the bottom, bring the info back (P0)
- What is wrong: in connecting, joining, quick, quick30, linking, error and join-error the panel sits right under the scene and the bottom 30-40 % of the screen is empty ink (portrait-quick: blank from y 66 % down). The fighter's name and stats are gone, so the screen loses "who you are" while you wait.
- Why it matters: the empty half reads as a layout bug; thumbs live at the bottom, so Cancel and Try again are where the thumb can't reach easily.
- What should change:
  1. In every panel state on phone portrait, the panel is docked to the bottom: `margin-top: auto`, bottom gap 24 px + safe-area inset, full width minus 32 px.
  2. The ink scrim (`.lb-scrim-bottom`) starts 80 px above the panel's top instead of a fixed 44 % (solid from 24 px above the panel). A CSS variable set from the panel's measured height is fine.
  3. Show the left info block (role, name, compact stats) directly above the panel, left-aligned, in every panel state **except invite** (B is the tall one; there it stays hidden, as now). If the remaining height between the HUD and the panel is under 300 px on a given device, hide it there too (rule: fighter visibility beats the info block).
  4. Badge strip stays hidden in panel states (inert anyway; the deviation stays for the strip).
- Expected result: portrait-quick shows HUD, fighter + standee, `High flyer / HOTFIX / stats`, then the panel ending 24 px above the bottom with Cancel as its last line; no empty band taller than 40 px anywhere. Portrait-invite looks as now but bottom-docked. Must also hold at 360x740.
- Related spec: lobby-v2.md 5.2, 7.2.
- Status: done (Engineering, 2026-11-21; see LOG.md)

## F-004 — Phone landscape: name on the floor glow, connection line missing (P1)
- What is wrong: (a) the orange `HOTFIX` name and the stats line sit over the orange floor glow and lit oak (landscape-menu, -invite, -offline): orange on orange. There is no scrim on the left half. (b) `.lb-conn` is hidden, so in landscape the HUD never shows `No internet`, `Searching · 0:12`, `Room open` etc.
- Why it matters: the name is the fighter's identity line; the connection line is the only status read on the idle screen (spec 6 acceptance relies on it).
- What should change:
  1. Add a bottom-left scrim on landscape: left 48 %, bottom 0, height 180 px, `linear-gradient(to top, rgba(10,13,24,.85) 0, rgba(10,13,24,.6) 90px, transparent 180px)`.
  2. Show the connection line in landscape inline, to the right of the `▲ 42` plate on the same row (12 px, dot + text, max one line, ellipsis), not under it, so the 44 px HUD height holds.
- Expected result: name and stats line pass 3:1 (name) and 4.5:1 (stats line) in all landscape shots; landscape-offline shows `● No internet` next to ▲ 42.
- Related spec: lobby-v2.md 4.2, 4.4, 5.3, 10.
- Status: done (Engineering, 2026-11-21; see LOG.md)

## F-005 — Desktop: the cables hang behind the badge strip (P2)
- What is wrong: the gold cable drops between the Hotfix badge and the slab, the blue one through the Intern badge. Two moving lines behind the four pick targets add noise exactly where the eye needs to compare portraits.
- What should change: cable pivots from x -1.1 / 1.9 to x -3.4 (under the desk end) and +2.8 (towards the crate). Length unchanged.
- Expected result: at 1440x900 neither cable passes behind any badge (badge strip spans about x 470-930 px); both still visible and swaying.
- Related spec: lobby-v2.md 3.1, 3.4.
- Status: done (Engineering, 2026-11-21; see LOG.md)

## F-006 — Error: the tipped standee shows its "?" mirrored, plus a second "?" piece (P2)
- What is wrong: desktop-error shows the cutout lying face-up with the "?" upside down and a second small "?" shape standing behind it (looks like the base/foot or the back face also carries the print).
- What should change: one object only (the foot goes down with the board or is hidden); the board tips **forward onto its face** (spec 3.5 "tips over forward"), so after the fall only the plain kraft back `#b98a5a` is visible, with one small bounce (rotate 90° in 400 ms, back 6°, settle 120 ms). Print the "?" on the front face only.
- Expected result: in the error and join-error shots one flat brown board lies on the grey ring, no "?" visible. The linking flip (backwards, face up, "?" readable) stays as it is.
- Related spec: lobby-v2.md 3.5, 9.
- Status: done (Engineering, 2026-11-21; see LOG.md)

---

# Review R-005: lobby v2 after F-001..F-006 (dc3cba1, 2026-11-21)

Verdict: **accepted, good enough to show Reis after F-007** (a 10-minute CSS fix). F-008 is polish and can follow.

Checked at full size: desktop-menu, desktop-quick, desktop-error, portrait-360-menu/quick/invite/error, landscape-667-menu/invite/offline, landscape-menu (844). Read `lobby.css` scrims and the puff placement in `lobbyScene.ts`. Not seen: motion, real phones.

What now works: F-001 the left column is clean over the dark scrim, desk sits behind the fighter as the spec intended. F-003 portrait panels dock to the bottom with the info above; 360x740 fits every state with the primary button and Cancel in thumb reach, no dead band. F-004 landscape name and stats are readable, `● No internet` / `Room open` show inline next to ▲ 42. F-005 cables are clear of the badges. F-006 error shows one plain board, no mirrored "?". The 360 px secondary-button size change and distant floors off on low tier are accepted.

Engineering flags: (1) dark bottom-left clouds on desktop -> F-008.1. (2) far cloud floating near the fighter's head -> F-008.2. (3) low tier 70-76 of 80 draw calls: accepted; rule from lobby-v2.md section 14 stands, nothing new enters the lobby scene without a cut from that list first.

## F-007 — Phone landscape: hard vertical seam at the edge of the bottom-left scrim (P1)
- What is wrong: in landscape-667-menu/offline/invite and landscape-menu (844) the F-004 scrim ends with a hard vertical edge at 48 % width (x 320 of 667, x 422 of 844). It cuts straight through the floor glow and the lit oak from y ~55 % down to the bottom, so the scene looks split in two. My F-004 spec gave it only a vertical gradient; that was the mistake.
- Why it matters: it reads as a rendering bug on the first screen a phone player sees in landscape.
- What should change: in the landscape rule for `.lb-root[data-mode] .lb-scrim-bottom` keep the vertical gradient and height 180 px, set `width: 62%`, and fade it horizontally with `mask-image: linear-gradient(90deg, #000 0, #000 55%, transparent 100%)` (plus `-webkit-mask-image`, same value).
- Expected result: no straight vertical edge anywhere in the 10 landscape shots at 844x390 and 667x375; the name and stats line still pass 3:1 / 4.5:1 (they end at about 30 % width, inside the solid part).
- Related spec: lobby-v2.md 5.3, F-004.
- Status: done (engineering, 2026-11-21)

## F-008 — Clouds: lighten the desktop bottom-left, no cloud above the slab's back edge (P2)
- What is wrong: (1) on desktop the full-height left scrim darkens the cloud tops in the bottom-left, so that corner still reads as grey rock. (2) One far cluster projects at head height to the right of the fighter (desktop x ~790-1010, y ~360-440; same cloud in portrait and landscape). Alone in the blue sky, sharp and beige, it reads as a floating rock or a paper scrap, and it competes with the fighter's head.
- What should change:
  1. `.lb-scrim-left` (desktop only): add `mask-image: linear-gradient(to bottom, #000 0, #000 480px, transparent 680px)` (plus `-webkit-mask-image`). The stat bars end at y ~410, so text contrast does not change; the bottom-left clouds get their warm tops back.
  2. Far clusters (c >= 3): lower them so the sky above the slab is clean: `cy = -14 - cr() * 4` (was -8 to -12). Rule: over a full drift cycle, no puff top projects above the slab's back edge in the desktop, portrait and landscape cameras; if one still does, lower that cluster further rather than removing it. Near clusters unchanged.
- Expected result: desktop-menu bottom-left shows warm cloud tops under the slab like the bottom-right; the sky between the fighter's head, the panel and the HUD holds only the gradient (and the standee when it is up).
- Related spec: lobby-v2.md 3.1, 3.2, F-002.
- Status: done (engineering, 2026-11-21)

---

# Review R-010: local 2-player build 24e7135..215299b (2026-11-23)

Verdict: **accepted with changes.** The mode reads as a real couch-duel feature: 2 PLAYER sits second in the menu with the right sub, the split select with player cursors, the mirror split border and the `First to 5` chip is clear, the key card works as a tester (one key lit per player, ticks), the HUD carries P1/P2 chips, red/blue score digits, head tags and the two key strips, results show `P1 WINS`, the column heads and the `Tonight:` tally, Credits lives in the footer and in Settings, How to play has the 2 player rows, AZERTY reads Z Q S D (and P2 Shoot correctly reads M, the physical `;` key; mute is bound by `KeyM`, so no clash), and the phone menu hides 2 PLAYER. No P0. Four P1 items before it goes to CrazyGames, three P2 polish items.

Reviewed from: 1440x900 shots 02, 04-12, 14, 15, 17, 18, 21, 22; 1280x720 06, 09 (top crop), 10; 1024x768 06; 1280x720-azerty 07; p844x390 01 and pad-02; portal-d1280x720-match. The rest are the same screens at other sizes. Not seen: motion (pops, stamp, fades), sound, the < 1024 single-row select, real keyboards, real pads, Firefox/Safari, the CrazyGames iframe.

Deviations (LOG 2026-11-23):
- (a) Pause line only after a pad's Start: **accepted.** No line is better than a wrong one.
- (b) 2 Player as a `1 Player | 2 Player` switch inside Controls: **accepted**; it reads well and keeps the tab row short. The swap message `K was P2 Dash: swapped, that is now H.` is fine.
- (c) Pads on select: A ready, B back, X or LB cycles length: **accepted.** A is the confirm every pad player expects.
- (d) Rings leaning 0.38 rad toward the camera: **accepted.** They are faint but present; the head tags carry identity.
- (e) Caps in the pause menu (`PAUSED`, `CONTROLS`): **accepted**; it matches the existing menu caps style. Spec copy table updated in spirit: menu items and headlines are caps.
- (f), (g), (h), (i): **accepted.** (j) telemetry: not creative; file a P3 engineering follow-up if you want the 2P share number (I do want it for the tablet-split decision in spec section 6).

Pre-existing `FLOOR 42 · open office` vs `FIRST TO N` at 1280x720: confirmed, see F-010.

## F-009 — 2P select: locking in hides the fighter's name, and READY appears twice (P1)
- What is wrong: in 04/06 (all sizes) the READY stamp takes the place of the big fighter name + description, and the filled `Ready` button stays under it. A locked panel shows `READY` + `Ready` and no name; in 06 neither player can read what they locked except from the small card label.
- Why it matters: the moment two friends lock in is the moment they say "Hotfix vs Legacy". The name is the payoff; the duplicate word is noise.
- What should change:
  1. The name (fighter accent) and description line stay visible in every state, locked or not, in the same position.
  2. The `Ready` button slot becomes the stamp when locked: hide the button, draw the existing READY stamp (same tilt, player-colour outline, same size as now) in that slot, so the panel height does not change. The stamp keeps the 1.06x card pop and its 120 ms entry.
  3. Clicking the stamp unlocks (same as moving the cursor). Mouse hover on it: cursor pointer, stamp at 85 % opacity. No new copy.
- Expected result: 06 shows, per panel, the grid, `HOTFIX / High flyer`, then a READY stamp; no `Ready` button while locked; no layout shift between 03, 04 and 06.
- Related spec: local-2p.md 3.2.
- Status: done (engineering, 2026-11-23; see LOG.md)

## F-010 — Top HUD at 720 px tall: floor pill crowds `FIRST TO N` and covers the top walkway (P1, also 1P)
- What is wrong: at 1280x720 (09, 10, portal shot) the arena starts at y ~105, so `FIRST TO N` sits grey on the light ceiling band (barely legible) and the `FLOOR 42 · open office` pill touches it and covers the centre of the top walkway, where a gun and a fighter can be.
- Why it matters: 1280x720 is a common CrazyGames iframe size; the HUD must never hide play space, and the match length must read.
- What should change:
  1. When the viewport is under 800 px tall, the floor pill shows during the title card / countdown, then fades out (200 ms) when the round starts; it shows again in pause and results. At 800 px and taller nothing changes.
  2. `FIRST TO N`: add `text-shadow: 0 1px 2px rgba(0,0,0,.85)` and cream at 70 % (from the current grey), all sizes.
  3. Applies to 1P and 2P alike.
- Expected result: 1280x720 mid-match shows nothing between the score and the arena except `FIRST TO 5`, readable over the ceiling; 1440x900 unchanged.
- Related spec: local-2p.md 4.2 (and the existing match HUD).
- Status: done (engineering, 2026-11-23; see LOG.md)

## F-011 — P1 must start on the left (P1)
- What is wrong: in portal-d1280x720-match (timer 149, one second in) and d1280x720-10, P1 Hotfix is on the right and P2 Legacy top-left, under the P2 plate. The plates say P1 left / P2 right; the fighters disagree.
- Why it matters: in 2P the first second is "which one am I?". Spawning under your own plate and on your own side of the keyboard answers it with no reading. Stills only; if the 1280 shot is just movement, the portal shot at 149 still shows a swapped start.
- What should change: in 2P, the match start (and any full-round reset) puts P1 on the left-half spawn and P2 on the right-half spawn of the same spawn pair used today. Respawns after a KO keep today's rule. 1P and online unchanged.
- Expected result: every 2P match starts with P1 under the P1 plate (left) and P2 under the P2 plate (right).
- Related spec: local-2p.md 3.3, 4.2.
- Status: done (engineering, 2026-11-23; see LOG.md)

## F-012 — Touch device with one pad: P1 has no controls; pad panel shows keyboard hints (P1)
- What is wrong: p844x390-pad-01/02: one pad on a phone shows 2 PLAYER and the pad drives P2, but a touch-only device has no keyboard, so P1 cannot move. My spec 1.6 (one pad = P2) assumed a keyboard; section 6 did not cover one pad. Also the pad-driven panel still shows `← → move · ; ready`.
- What should change:
  1. On touch-only devices, 2 PLAYER appears only when **two** pads are connected; pad 1 = P1, pad 2 = P2. Sub: `Two pads, two fighters`. With one pad it stays hidden. Keyboard devices unchanged (one pad = P2).
  2. If a pad disconnects mid-match on a touch-only device, pause at once with the pause line `Pad disconnected` (new string).
  3. In a panel driven by a pad, replace the key hint with `Stick move · A ready` (pad glyph already shown keeps its place).
- Expected result: no state where a player on screen has no input; pad panels show pad hints.
- Related spec: local-2p.md 1.6, 3.2, 6, 8 (two new strings: `Two pads, two fighters`, `Pad disconnected`, plus `Stick move · A ready`).
- Status: done (engineering, 2026-11-23; see LOG.md)

## F-013 — 2P select: the menu fighter's legs stick out under the P2 panel (P2)
- What is wrong: 04-06 at 1440/1280/1024: the main-menu showcase fighter and floor glow stay behind the select; his legs and shoes poke out below the P2 panel.
- What should change: while the 2P select is open, hide the menu showcase fighter and its floor glow (backdrop room stays, dimmed as now). Restore on Esc.
- Expected result: nothing but the dimmed office behind the two panels.
- Related spec: local-2p.md 3.2 ("no new 3D rigs" meant none at all on this screen).
- Status: done (engineering, 2026-11-23; see LOG.md)

## F-014 — Results: Rematch button grows when a tick appears; idle ticks too faint (P2)
- What is wrong: 14 vs 15: the Rematch button widens ~14 px when `P1 ✓` appears and pushes CHANGE FIGHTERS sideways. The idle `P1 P2` marks on yellow are low contrast.
- What should change: reserve the ticked width from the start (both chips always rendered at full size); idle chips: ink `#16110E` text at 45 % with a 1 px ink 30 % outline; ticked: player-colour fill as now.
- Expected result: no layout shift on either tick; both idle marks readable at arm's length.
- Related spec: local-2p.md 4.5.
- Status: done (engineering, 2026-11-23; see LOG.md)

## F-015 — Pause in 2P dims P1's side of the HUD only; key card arrows mismatched (P2)
- What is wrong: (1) 11: the pause scrim fades left to right, so P1's plate and key strip go dark while P2's stay full bright; in 2P that reads as "P2 is still playing". (2) Key card: ↑ ↓ are small filled triangles, ← → are long line arrows.
- What should change: (1) in 2P pause, both plates and both key strips sit at the same dim level (keep the left scrim for the menu text, add a flat 55 % ink layer over the HUD). 1P unchanged. (2) Key card ↑ ↓ ← → all use the same line-arrow glyph at the same size (as ← → now).
- Related spec: local-2p.md 4.1, 4.4.
- Status: done (engineering, 2026-11-23; see LOG.md)
