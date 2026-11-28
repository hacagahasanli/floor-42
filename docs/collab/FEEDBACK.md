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

## F-016 — Home and select: fighter name and `Your fighter` overlap the 3D fighter (P1, ship today)
- What is wrong: in shots/aliveness-2026-11-27/a6 and a7 (1280x720), the right column (`Your fighter` / `HOTFIX` / `High flyer`, x ≈ 990-1240, y ≈ 410-520) sits on top of the showcase fighter's arm and the planter. The name's letters cross the model.
- Why it matters: this is the first screen a CrazyGames player sees. Text on top of the hero reads as broken layout.
- What should change: put the right info column (label, name, tagline and the stat card) in one panel 260 px wide, with background `rgba(10,13,24,0.72)`, a 2 px left border in the fighter's colour, 16 px padding, and the same slanted corner as the stat card. Leave the 3D scene as it is.
- Expected result: the name reads over a solid panel, and the fighter's body stays fully visible to the left of the panel at 1280, 1440 and 1024 wide.
- Related spec: CREATIVE/specifications/aliveness-audit.md T7.
- Status: closed at 1280 and wider (R-012 review, 2026-11-27); narrow screens continue as F-018.

## F-017 — A KO'd body comes to rest outside the glass wall (P2, next)
- What is wrong: in shots/aliveness-2026-11-27/a2, Legacy's ragdoll lies at the far left at about y 265, beyond the building's glass edge.
- Why it matters: it reads as a clipping bug, not as a splat, and it weakens the "glass cracks when you hit it" promise.
- What should change: clamp ragdoll and body positions to the inner face of the glass (x within ARENA.left/right minus the body's half width). A body that hits the glass at speed splats against it and slides down; it never passes through.
- Expected result: no body is ever drawn outside the building outline.
- Related spec: aliveness-audit.md section 3, item 5.
- Status: open

---

# Review R-012: R-011 TODAY build (T1-T8), portal build, 2026-11-27

Verdict: **ship today. No P0.** Nothing below should block the CrazyGames upload. F-018 and F-019 are about 20 minutes together and worth doing before the upload if there is time. If there is not, upload anyway.

Played: `npm run build:portal`, served with `scripts/portal-serve.mjs` under `/games/floor-42/`, in headless Chromium with SwiftShader. I captured home at 1280x720, 1024x768 and 844x390, and one full `#/arena?p1=legacy&p2=standup&bot=hard&demo` match at 1280x720, shot every 3 s from the loader to the result screen (it ended 2:5, Standup won). No page errors and no console errors. I also reviewed every shot listed in R-012. Evidence: `shots/review-r012/`.

On spec, verified in the portal build:
- **T1 follow camera:** it holds the wide view through `ONE FLOOR / NO MERCY` and then leans in. Fighters are about 80-100 px tall in play (`portal-demo-follow.png`), against about 45 px before. This is the change that matters most, and it landed.
- **T2 and T3:** the final KO is framed close, with the burst, `-110` and `LEGACY IS OUT` all in shot (`portal-demo-final-ko.png`). The 0.3x timing is not verifiable at SwiftShader frame rates, but its maths are unit-tested.
- **T5 result slab:** the winner portrait slab, the grey loser face and the bot-wins title (`They took the floor.`) all read well. **T6 callouts:** they show (`UZI`, `SHOTGUN` on the sheet). **T7 panel:** it is clean at 1280 and 1440.
- **Accepted engineering deviations:** RAILGUN/ROCKETS naming, no KO beat or slow-mo in 2P, no sfx rate change, `easy` for the whole first session.

Not verified: real-GPU timing (slow-mo, card delay, governor steps), sound, the CrazyGames iframe sizes, real touch, and the WebGL-lost overlay in a live state (I reviewed its copy from the source only).

## F-018 — Narrow screens: the name panel covers the showcase fighter (P1, before upload if time)
- What is wrong: at 1024x768 the 260 px panel (x ≈ 752-1012) covers Hotfix's hands, gun and legs (fighter at x ≈ 790-905, `portal-1024x768-home.png`). At 844x390 it covers the hands, gun and legs again (fighter at x ≈ 555-620, panel at x ≈ 573-832, `portal-844x390-home.png`). This is the F-016 overlap, moved rather than fixed.
- Why it matters: on CrazyGames the game runs in an iframe that is often narrower than the window. [Assumption: a 1366-wide laptop gives an iframe of about 1000 px.] So the narrow case is a common first screen, not an edge case.
- **Decision: move the fighter, not the panel.** The panel stays exactly as built: 260 px, 12 px from the right edge, same everywhere. The panel is the constant; the 3D picture slides.
- What should change (`showcase.ts`, landscape only, i.e. `!portrait`):
  - After `camera.lookAt(look)`, project the fighter's bounding box (or `SPOT` plus a half-width of 0.45 m, whichever is simpler) to screen space.
  - `panelLeft = w - 12 - 260`. `shift = max(0, fighterRightPx - (panelLeft - 24))`.
  - Then call `camera.setViewOffset(w, h, shift, 0, w, h)`, or `clearViewOffset()` when `shift` is 0. A positive x offset slides the picture left.
  - Smooth `shift` with `k = 1 - exp(-4 * dt)` so the slow camera arc never makes the fighter twitch.
  - Leave it at 0 at 1280 and wider, where the overlap is already clear. Portrait and 2P (fighter hidden) stay unchanged.
- Expected result: at 1024x768, 844x390 and any width in between, the whole fighter (head to shoes, gun included) sits at least 24 px left of the panel, and stays clear of the menu column: the left edge is right of the PLAY highlight bar at 844x390, and right of the rival chips on select. Re-shoot the 8 `aliveness-today-ui/portal-*` shots.
- Related spec: aliveness-audit.md T7, F-016.
- Status: open. F-016 is closed for 1280 and wider and continues here.

## F-019 — WebGL-lost overlay copy (P1, a one-line change)
- What is wrong: the body copy says "Your graphics card took a break." That is not always true: the context is also lost when a phone backgrounds the tab or the driver resets. It also does not warn that reloading ends the match in progress.
- **Decision (final copy):**
  - Title: `Graphics paused`. Keep it: it is short and calm, and nobody is blamed.
  - Body: `Your browser stopped drawing the game. Reload to jump back in. This match will start over.`
  - Button: `Reload`. Keep it.
- Expected result: the copy is exactly as above, with the layout and styles unchanged. For an online match the last sentence still holds, because a reload leaves the room. If that is not true, tell me and I will change the copy.
- Related spec: none (engineering-owned overlay, copy approved here).
- Status: open

## F-020 — Pickup callout sits on the gold FLOOR 42 neon (P2, next)
- What is wrong: in `aliveness-today/callout-1.png`, `SHOTGUN` lands on the `FLOOR 42` neon sign and reads as "FL SHOTGUN 2". Gold on gold, and the ink stroke does not separate them.
- What should change: give the callout text a soft ink backing, a rounded box at `#0A0D18` 60 %, 6 px padding, drawn into the same canvas texture. No new draw call.
- Expected result: the gun name reads against the sign, against windows and against the sky.
- Related spec: aliveness-audit.md T6.
- Status: open

## F-021 — Cold first load: home shows no 3D scene for 6+ s under SwiftShader (P2, verify on real hardware)
- What is wrong: on the first cold load of the portal build at 1280x720, the home screen after 6 s showed only the UI on flat dark navy, with no office and no fighter (`portal-1280x720-home-cold6s.png`). Warm loads were fine (`portal-1280x720-home-warm.png`). This is probably SwiftShader being slow, not the build. [Unverified on a GPU.]
- What should change: release QA times "first 3D frame on home" on a low-end laptop inside the CrazyGames QA tool. If it is over 2 s, show the rendered Hotfix portrait (as on the result slab) in the showcase spot until the canvas fades in, as the lobby's CSS fallback already does.
- Status: open (measure first)

---

# Review R-014: R-013 "Doors and Stamps" TODAY build, portal (2026-11-27)

Verdict: **ship to CrazyGames today after one P0 (F-022, a CSS value).** Doors and Stamps landed. I played `dist/portal` (fresh `npm run build:portal`) in headless Chromium + SwiftShader at 1280x720 and 1920x1080: cold home, PLAY -> doors -> a full first match against the easy bot (won 5:3) with live `INTERN IS OUT` stamps and the live `KNOCKOUT / HOTFIX TAKES THE FLOOR` band, result, REMATCH (short doors), select -> ArrowDown -> Enter (locked Legacy, doors, Legacy vs Standup), How to play, 2 PLAYER select -> both ready -> 2P doors. I also read the playtest critic's real-GPU set `shots/playtest-2026-11-27-b/`. My shots: `shots/review-r014/`.

On spec (acceptance list section 8): 1 poster from first paint (no empty gradient frame seen); 3 doors at 1280 and 1920, names clear of the VS plate; 4 Enter on a row locks in and fights, footer `ENTER FIGHT`; 5 no title card, key strip shown; 7 `KNOCKOUT` in the winner's accent and no `IS OUT` for the final KO; 9 How to play opaque. Engineering deviations accepted: doors only for offline/2P/rematch (online and demo keep LiftLoading until N3); random rival picked at PLAY; counter by the clock to 41, then 42 with the ding; `LOCKED IN` outside the clipped plate; easy-bot 15 s gun grace; EASY on the menu until a match is finished.

Not verified: sound by ear (nothing heard), real-GPU timings of my own (I used the critic's real-GPU frames for that), 1024x768, Shake OFF / reduced-motion paths, online, the CrazyGames iframe. Acceptance 2 (doors in 100 ms) and 10 (no wait on portraits) cannot be timed under SwiftShader (doors appeared about 450-800 ms after Enter there, with the 3D backdrop running at a few fps).

## F-022 — First-match key strip covers the player's own fighter at FIGHT! (P0, blocks the upload, a CSS change)
- What is wrong: at 1280x720 the strip sits 120 px above the bottom, which is on the arena floor in the wide opening shot. The player spawns behind the `W` cap for about 3 s (critic, real GPU: `playtest-2026-11-27-b/1280-08`, `1280-10`; also my `review-r014/1280x720-b03-arena`). At 1920x1080 it sits on the floor next to the desks (`1920-12`).
- Why it matters: it is the first second of the first match for every new CrazyGames player, and they cannot see themselves. My spec value (120 px) was wrong. It did not account for the wide opening view.
- What should change: anchor the strip in the dark band under the floor. `bottom: 12px` (was 120 px). Caps 48 px tall with Bungee 24 px when the viewport is under 800 px tall, 56 px / Bungee 28 px from 800 px up. Labels stay below the caps, Chakra 14 px, 4 px gap. The groups stay 40 px apart. Everything else (gold flash, leave rule, hiding the bottom key bar) is unchanged.
- Expected result: at 1280x720 the strip's top edge is at or below y 640 (floor edge is about 615). At no time between the doors opening and the strip leaving does it overlap either fighter, at 1280x720, 1366x768 and 1920x1080.
- Related spec: fight-feel-pages.md 4.5 (value superseded here).
- Status: open

## F-023 — Stamp volume decision: lower the thumps, retire the "ui peak <= confirm" rule (P1, today if 5 min; does not block)
- Decision: the recipe wins over the rule, but at lower values. `confirm` (0.16, a 660 Hz triangle) is the wrong yardstick for a 48-110 Hz thump: at 0.16 the stamp disappears on laptop speakers, which is where CrazyGames players are. But 0.5/0.45 (and x1.4 for `stampBig`) puts `VS`, `FIGHT!` and `KNOCKOUT` close to an explosion, and it drives the -14 dB compressor at the exact moment the KO sound should own the mix.
- New rule (replaces the 3.3 mix rule): **no UI voice is louder than the game event it announces; `ko()` is the reference.**
- Exact values in `sfx.ts`:
  - `stampVoices`: sine `0.5 -> 0.3`, lowpass noise `0.45 -> 0.28`, bandpass click `0.16` unchanged (the click is what laptop speakers carry).
  - `stampBig`: `stampVoices(1.4) -> stampVoices(1.2)`, sub tone `0.45 -> 0.3`.
  - `doorSlam`: lowpass noise `0.6 -> 0.4`. The square and triangle voices stay the same.
  - `liftDing`, `floorTick`, `winSting`, `lossSting`: unchanged (they already sit near `confirm`).
  - Update the matching rows in `audioBudget.ts` and `docs/SOUND.md`.
- Expected result: a stamp sums to about 0.74 before the ui bus (0.52 after it), under `ko()` (0.8). `stampBig` sits at about `ko()`. [Design arithmetic. Not heard: someone has to check it once by ear on laptop speakers before NEXT.]
- Related spec: fight-feel-pages.md 3.3.
- Status: open

## F-024 — HUD text does not scale at 1920x1080 (P1, next build)
- What is wrong: at 1920x1080 the weapon/ammo line is about 11 px and the names about 16 px (critic `1920-12`, my `1920x1080-g05-arena`). It is the 1280 HUD at the same pixel size.
- What should change: scale the HUD corner blocks (names, health bars, weapon/ammo, dash/push) and the bottom key bar by `s = min(1.5, max(1, innerHeight / 720))`, each with `transform-origin` set to its own anchor corner. The score block in the centre top and the stamps are excluded (they already scale).
- Expected result: at 1080 the names are about 24 px and the weapon line about 16 px. Nothing changes at 720.
- Status: open

## F-025 — The camera is still wide at FIGHT! (P1, next build)
- What is wrong: with the 2.0 s offline countdown, the follow ease-in (0.8 s from FIGHT) means the fighters are about 45 px at the moment control starts (critic, real GPU).
- What should change: start the follow ease-in when `READY` shows (offline: 1.0 s before FIGHT; online: from 1.6 s, as now), keeping the 0.8 s smoothstep. The first 1.0 s of the countdown stays wide, to show the floor.
- Expected result: at FIGHT! the fighters are at follow size (about 80-100 px at 720p). This keeps R-011 T1 except for the start time.
- Status: open

## F-026 — PLAY sub-label hides the bot level (P1, copy)
- Copy: `Fight the {level} bot as {Fighter} · first to 5`, where `{level}` is the level that will actually run, in lowercase (`easy` on the first match whatever the setting; then `easy`/`normal`/`hard`). Developer audience: `Fight the {level} bot as {Fighter} · first to 5 takes the merge`.
- Status: open

## F-027 — On a slow machine the VS stamp and counter wait for the arena to mount (P2, verify on low-end)
- What is wrong: only the arena-side `VsRun` draws the VS plate, the counter and `FIRST TO 5`. The menu-side doors carry only the portraits and names. Under SwiftShader the doors sat shut with no VS for seconds, and the stamps were stuck at opacity 0 while the main thread was busy loading (`review-r014/1280x720-b01`, `i02`; DOM probe: VS mounted, opacity 0, for about 6 s). On the critic's real GPU the VS lands on time (`1280-03`, `1280-29`), so this only bites low-end machines.
- What should change (next): render the floor plate and the `VS` stamp in the menu-side doors too, at 260 ms on the shared clock, and let `VsRun` take them over without re-landing them.
- Status: open

## F-028 — How to play footer still says `ENTER SELECT` (P2)
- What should change: there is nothing to select on that panel, so the footer shows only `ESC BACK`.
- Status: open

## F-029 — Weight pass is correct in kind but too small to see in play (P0, owner complaint, R-015)
- What is wrong: I played `/arena?p1=hotfix&p2=legacy&bot=hard` at 1280x720 on a real GPU (headless Chromium, --use-angle=metal; my shots in the CD scratchpad, not kept). With the follow camera a fighter is about 100-110 px tall. At that size: landing squash 0.85 for 80 ms moves the head ~15 px for 5 frames, flinch 12 deg for 90 ms is 5 frames, idle rise `th*0.022` is ~2 px, secondary springs lag 2-4 frames on parts ~10 px big. None of these survive normal viewing. In the 6-frame stills (`still-land*`, `still-hit*`, `still-jump*`) before and after are almost indistinguishable except the landing dust. The owner is right.
- Why it matters: the brief promise is weight. A first-time player must see the body react without being told to look.
- Visibility rule (applies to every one-shot character effect from now on): the peak pose holds at least 100 ms, and the silhouette moves at least 8 px at 1280x720 follow distance. Recovery uses one overshoot (spring), not a linear return.
- What should change (exact values; offline and online visual only, sim untouched):
  1. Landing: squash y 0.85 -> **0.70**, x 1.10 -> **1.22** at full speed (keep the `(|vy|-4)/12` ramp). Hold the bottom **50 ms**, return by **170 ms** with one overshoot to y **1.06**. Add knee bend: poseSide squat load **0.75** for **130 ms**, eased out. Knees are what make low-poly read as weight, scale alone reads as a glitch.
  2. Take-off (sim cannot pre-delay, accepted): make the rise read instead of the crouch. Crouch load 0.5 -> **0.9** and root dip 10 % -> **18 %** for the first 60 ms, then stretch y **1.22** / x **0.85** peaking at 100 ms, back to 1.0 by **200 ms**. Air jumps: stretch only, y 1.15.
  3. Flinch: pivot the **torso at the hips 22 deg** plus the **whole body 6 deg at the feet** (feet stay planted). Peak at **40 ms**, hold to **110 ms**, recover by **260 ms** with overshoot to **-5 deg**. Head adds **+12 deg** on the same envelope. Torso also shifts **0.06 m** away from the shot. Heavy hits (shotgun point blank, rocket, railgun, any damage >= 50) x **1.5** angle and hold.
  4. Secondary motion: spring w 20-28 -> **11-15**, zeta 0.3-0.4 -> **0.22**, drive gain **x2.5**, clamp **28 deg** (5-8 frames of lag, one visible swing). Legacy belly: scale y **+/-10 %** jiggle on landing and on hit (w 18, zeta 0.25).
  5. Idle: breathing rise `th*0.022` -> **th*0.045**, arms swing **+/-4 deg** in phase, weight shift **+/-3 deg** over 3.5 s. Blink stays (it only reads in the menu, that is fine).
  6. Dust: puff size **x1.8**, count 12 -> **16** on a full-speed landing (scale count with the same ramp, min 4), life 0.28-0.42 -> **0.40-0.60 s**, opacity 0.55 -> **0.7**, spread to **1.4x** fighter width. Dash: **3 puffs every 60 ms** for the dash duration, behind the feet.
  7. Blob shadow: visible, keep (0.55, 1.5x). Only change: opacity **0.65** on the light wooden floor if it measures paler than 15 % darker than the floor around it.
- Expected result: in a 10 s clip at 1280x720 a person who has never seen the game can point to the landing, the flinch and the idle breath without being told.
- Related: aliveness-audit.md section 4.
- Status: implemented (R-015 v2, see LOG.md and shots/weight-pass-v2/)

## F-030 — Rim light recolours whole faces (P1, R-015 c)
- What is wrong: `still-menu-home-1`: Hotfix's black trousers turn brick red and the orange hoodie washes to pastel. Additive `pow(1-NdotV, 2.4)` on flat-shaded boxes tints entire faces that sit at a grazing angle, so it changes material colour instead of drawing an edge. Black trousers turning red is **not right**: the palette fixes trousers as dark ink, the read of each character depends on it. In the arena at 100 px the same rim is barely visible, so today it is too much in close-ups and too little in play.
- What should change:
  - Band, not gradient: `rim = smoothstep(0.60, 0.80, rimF)`; only faces turned away from the camera light up, as a thin edge.
  - Top-back mask so it reads as a light behind them: multiply by `saturate(0.35 + dot(normalView, normalize(vec3(-0.3, 0.9, -0.2))))`.
  - Colour: `mix(accent, #FFF1D6, 0.5)` (orange on Hotfix's orange hoodie is invisible otherwise).
  - Strength: arena **0.8**, menu/showcase/lobby close-ups **0.35**.
  - Never on eyes, face skin or the gun.
- Expected result: in the menu the trousers stay near-black with a lighter edge on the back/top faces; in the arena each fighter has a visible coloured outline-like edge on the shoulders, head and back against the blue city.
- Status: implemented (R-015 v2)

## F-031 — Three more high-visibility life effects (P1, after F-029)
1. **Run lean and bob** (always on screen, highest value): lean into motion **10 deg** at full run speed (scaled by |vx|/max), head/root bob **0.035 x height** at step frequency, arms counter-swing **+/-25 deg**. Turnaround/skid: lean back **12 deg** for **120 ms** + 3 dust puffs.
2. **Gun recoil body kick** per shot: gun arm **+14 deg** up, torso **-5 deg** back, root **0.03 m** opposite the aim, recover by **120 ms** (spring). Shotgun, rocket, railgun: x **2.2** and a **60 ms** white muzzle flash quad at the barrel. SMG/Uzi: x 0.5 per shot, accumulating to a max of 9 deg torso.
3. **KO winner pose** during the KO slow-motion beat, **0.9 s**, one per fighter: Hotfix fist pump (free arm to 150 deg, small hop 0.15 m); Legacy arms crossed + belly bounce (y +/-10 % twice); Standup air spin 360 deg in 0.4 s; Intern thumbs up + backpack hitch (pack up 0.08 m). Cancelled by any input of the winner. Offline and online (visual only, from the `ko` event).
- Hit flash already exists (white body flash in `still-hit*`), keep it, do not add another.
- Status: implemented (R-015 v2)

---

# R-018 review — OFFSITE as built (CD, 2026-11-28)

Seen: every still and both videos in `shots/offsite/` (frame sheets at 1 fps / 0.5 fps), pixel samples of `wide-arena.png` and `wide-arena-hud.png`, and my own play on the dev build (:3310, `/arena?p1=hotfix&p2=legacy&bot=hard`, headless Chromium 1255 --use-angle=metal, 1280x720 and 1920x1080, follow camera, a few scripted inputs; shots in the CD scratchpad, not kept). Not seen: the wide demo played live by me (judged from engineering's clips), a phone, a weak GPU, sound, reduced motion, online.

**Verdict: accept OFFSITE as the default arena after the three P0 items below (all render/CSS only, about an hour together).** The arena does what the spec promised: at the follow camera the fighters are the most saturated thing on screen, the dark trousers read on sand and sky, the layout reads in one glance, and the ambient life is calm. Weight pass v2 on sand: accepted (landing dust and blob shadow read on sand; the rim is near-invisible against the bright sky, which is fine because the silhouettes already carry). Intern's backpack against the dune is the weakest read, as forecast in arena-2.md §0.2; no change.

Deviations in the LOG: **accepted** 1 (mesa tops 47-57 %), 2 (rope z -1.12), 4 (final-KO tumbleweed 4 m left of the winner), 5 (vulture return), 6 (pill shows OFFSITE + card line), 8 (first gust at 2-5 s), the floor albedo tint (R-018 f). **Rejected** 3 (tumbleweed as built, F-033). 7 (water tower x 8.5) accepted at the wide camera, follow-camera problem in F-036. 9 (sift) in F-037.

## F-032 — HUD top scrim turns the Offsite sky into night (P0)
- What is wrong: `ArenaGame.tsx` HUD bar `bg-gradient-to-b from-ink-deep/90` was made for the dark office. On Offsite the top row is (19,30,44) against the canvas (111,187,227); the sky is not back within 10 of `#6fbbe3` until y 180 (`wide-arena-hud.png`). At 1920x1080 follow camera the gold roof flag sits inside it and goes brown. The top quarter of every frame looks like dusk, which is the opposite of the arena's reason to exist.
- What should change (Offsite only; the office keeps its scrim):
  1. Replace the scrim with `linear-gradient(180deg, rgba(38,104,150,0.45) 0px, rgba(38,104,150,0) 120px)` (a deeper sky blue, so the top reads as zenith, not night). Expected top row about (78,150,192); clean canvas from y 120.
  2. Legibility moves from the scrim to the text: on the timer, both names, the BOT/YOU labels, the weapon/ammo lines and `FIRST TO 5`, `text-shadow: 0 1px 0 rgba(10,13,24,0.9), 0 0 6px rgba(10,13,24,0.7)`. White on the new scrim alone is only 2.1-3.3:1, so the shadow is required, not optional. Health-bar tracks keep their ink fill.
- A3 (amended for HUD screenshots): with the HUD on at 1280x720, the top row within ±12 of (78,150,192), and from y 130 down within ±10 of the canvas value. Check also at 1920x1080 with F-024 scaling.
- Expected result: a blue sky to the top edge; names, timer and score as readable as in the office.
- Related: arena-2.md §5.1, A3.
- Status: implemented (Engineering, 2026-11-28, R-018 round 2; see LOG.md)

## F-033 — The tumbleweed reads as a ⊗ marker in the fight space (P0)
- What is wrong: `timber` #7a5c43 with four tube rings draws a dark circle with a cross through it, about 25 px at 1280 and 40 px at 1920 follow camera (my 1920 shot: at screen (262,658), level with a fighter's chest beside the boulder). At play distance it looks like a UI glyph (a "no" sign or a target reticle), not a plant. That is exactly the "looks like a pickup or hazard" risk of §5.6.
- What should change: rebuild it as a tangle: **7 rings** of radius 0.45 m, tube **0.035 m**, each on a fixed seeded random axis (no two within 25° of each other, none aligned with the view axis), plus a solid low-poly core (icosahedron, r **0.22 m**). Colour **`rock.side` #b97c57** for rings and core. Still one merged mesh, same path, speed, hops and gag.
- Expected result: a light-brown scribbled ball with no straight line through its centre. If it disappears against the dune again, darken to `cliff.shade` #a86d50 and keep the tangle; never go back to 4 rings.
- Status: implemented (Engineering, 2026-11-28, R-018 round 2; see LOG.md)

## F-034 — Sky shows through the floor's front corners at the wide camera (P0)
- What is wrong: at the wide start the floor box (`W + 1.2`, x ±18.6) ends inside the frame. Sky (152,205,232) shows in a wedge about 30 x 12 px at both bottom corners (`wide-arena.png` around (0-25, 580-592) and (1255-1280, 580-592)). It is a hole in the world in the first frame of every match.
- What should change: floor box, ripple texture repeat and front lip strip to **`W + 10`** (x ±23), the same width as the under-floor block. No collision change.
- Expected result: at the wide camera at 1280x720 and 1920x1080, no sky-coloured pixel in the bottom 25 % of the frame.
- Status: implemented (Engineering, 2026-11-28, R-018 round 2; see LOG.md)

## F-035 — The bottom band (engineering lead's flag): keep it, make it ground (P1)
- Judgement: the lead is right that it carries nothing visually: 105 px of flat (130,69,40) under the sand lip at the wide camera (y 615-720, 14.6 %). The error is mine: §5.2 copied the office's "building below the floor", but a desert floor has no underside. It is not P0: at the follow camera it is about 5 % and it holds the key-hint bar and the respawn panel, so the HUD needs a quiet zone there. Do not reframe the camera for it (shared with the office, and the footer would land on the sand).
- What should change: the front face of the under-floor block becomes a sandstone cut bank: unlit (`MeshBasicMaterial`, `toneMapped: false`), vertical vertex-colour gradient from **`sand.edge` #c9a070** directly under the lip to **`cliff.shade` #a86d50** at 3 m below; two **`cliff.strata` #e8c29a** bands 0.08 m high at y **-1.2** and **-2.6**, offset ±0.15 m in a slight 2-step wobble along x so they are not ruler lines. Merged with the static mesh, 0 extra draw calls.
- Expected result: the band reads as the same rock as the cliffs, warmer and lighter at the top, and ties the floor to the canyon. The key bar stays readable on it (its plates already carry their own background).
- Status: implemented (Engineering, 2026-11-28, R-018 round 2; see LOG.md)

## F-036 — The water tower hides behind the tower deck at the follow camera (P2)
- What is wrong: at x 8.5, z -30, the follow camera's parallax puts the tank right behind the deck plank and the right tower post (`play-1p` frame at 9.5 s; my 1920 shot), so the "42" is cut or covered most of the time the fight is centre-right.
- What should change: try x **12-14** (z -30, height unchanged). Pick the value where, with a fighter on the deck at the follow camera, the tank does not touch the deck plank on screen, and at the wide camera it stays under the lookout R plank and out of the HUD's top 120 px. Report the value; if no x satisfies both, keep 8.5.
- Status: implemented (Engineering, 2026-11-28, R-018 round 2; see LOG.md)

## F-037 — Explosion sift: invisible as specified (P2)
- Decision on deviation 9: pale on pale was my mistake. Change the sift to **`cliff.shade` #a86d50**, **0.08 x 1.0 m**, opacity 0.55, same life and fall. It is behind the fighters (z -1.2) and lasts 0.7 s, so the darker colour is safe.
- Status: implemented (Engineering, 2026-11-28, R-018 round 2; see LOG.md)

## F-038 — Wall splat sound on cliffs (P2, SOUND.md owner)
- Ship with `land` + `impact` (no glass): accepted for this update. File the rock crunch with the SOUND.md owner: one short dry crunch, 120-180 ms, low-mid body, with a small gravel tail, no glass and no ring.
- Status: open

## F-039 — Respawn panel covers the floor lane (P2, all arenas, noticed here)
- What is wrong: "Back in 3 · come back as" sits bottom centre over the floor; at 1280x720 it hid the bot standing on the floor (my shot). On Offsite the floor lane is the main lane.
- What should change: background at 80 % opacity, and when a fighter's on-screen box overlaps the panel, move the panel to the side away from that fighter (left or right third, same bottom offset). Not needed for this update.
- Status: open

## F-040 — Offsite: power weapon at a spawn (P0, R-020 item 4)
- What is wrong: rev. 1 spawns S5/S6 (±15.5, 7.8) stand 0.5 m from the G4 lookout spot (±16, 7.8); S4 (0, 7) is 3.4 m under the roof spot; S0–S3 sit exactly on G1/G2 spots. The sim picks start spots at random (not entries 0/1 as my §4.3 assumed), so a lookout start hands you a launcher: KO at 1.6 s, 3:0 standing still (playtest R-020).
- What should change (arena-2.md §4.3/§4.4, exact):
  - `spawns`: (-11,0), (11,0), (-7.5,4.0), (7.5,4.0), (-4.5,0), (4.5,0). Boulder, deck and lookout spawns removed.
  - G1 spots ±7.5 → **±5.5** (y 4.0); (0,7.0) stays. G0, G2, G3 unchanged. G4 unchanged plus **`firstAt: 10`** (first power gun 10 s after FIGHT; Offsite only, office hash untouched).
  - Cactus x 9.6 → **7.5** (decor; it stood behind the new S1).
- Expected result: min spawn → power 9.26 m, min spawn → regular gun 2.0 m, no power gun in the first 10 s; new test A10. Rerun A6/A7 (botOffsite uses `spawns.slice(0,4)`).
- Status: implemented (Engineering, 2026-11-28, R-020 round 3; see LOG.md)

## F-041 — Offsite: tracers are pale on pale (P0, R-020 item 2)
- Disagreement, once: the cited "sand streaks" at b1080-12 (510,628) and d-standstill-101 (935,325) sit on the muzzle lines of Hotfix's and Standup's shots: they are most likely the **real tracers** (`#ffe9a0`, 0.7 × 0.06 m, game.ts) blending into a cream world. The skitter quads (1.2 × 0.15 m, 8:1) share the bullet's shape, so both directions confuse. Confirm cheaply: set tracerMat to magenta for one dev run and re-shoot the same frames.
- What should change: §5.7 — Offsite tracer `ink #1b1f2e` 0.9 × 0.08 m with a 0.22 m `canvas #f3ede0` head; pellet `ink` 0.35 × 0.08 m; office unchanged. Sand (§5.6 item 4): skitter `dune #ebc790`, 0.7 × 0.30 m, opacity 0.22, y 0.02–0.20, grows 1 → 1.6 in y; streamers aspect 2:1, opacity 0.35. New rule R8: no ambient quad above 2.5:1 or faster than 6 m/s below y 13.5.
- Expected result: in a 1080p follow-cam shot every bullet is a dark dash with a light tip; nothing pale and thin crosses the fight band.
- Status: implemented (Engineering, 2026-11-28, R-020 round 3; see LOG.md)

## F-042 — Offsite: cliff strata read as ledges (P1, R-020 item 3)
- What is wrong: the three `cliff.strata #e8c29a` bands are 0.1 m boxes on the ±x face, 5.7 m deep in z, so in perspective they are pale slanted lines the colour of a plank lip (`#e8cf9e`). Fighters wall-sliding (`PHYS.wallSlide` 4 m/s) beside them look perched or floating (d-standstill-101 right cliff, b1080-12 left). There is no ledge there; the decoration lies.
- What should change (§3.2, §5.3): remove the ±x-face strata. Add two `cliff.groove #b98463` bands 0.18 m high on each cliff box's **front (+z) face** at y 2.2/3.9, 6.1/8.3, 10.9/13.0. Nothing on a cliff lighter than `cliff.lit` inside x ±18. Optional P2: while a fighter hugs a wall and falls, 1 `vfx.puff` in `cliff.shade` every 80 ms at the feet (low tier off) so the slide reads as a slide.
- Expected result: the only pale horizontal edges near the cliffs are the lookout plank lips; a wall-sliding fighter reads as sliding on rock.
- Status: implemented (Engineering, 2026-11-28, R-020 round 3; see LOG.md)

## F-043 — Copy and menu backdrop per arena (P1, R-020 item 1)
- What should change: arena-2.md §7 table (per-arena `introTitle`, `introLine`, `knockoutLine`, `resultWin`, `resultLoss`, `resultDemo`, regular voice only); tagline → `Two coworkers. One grudge. No mercy.`; "top floor" → "up top". Menu backdrop follows `Settings.arena` (Offsite default, low-tier set, `menuSpotX` 5.2) with the left scrim in §8; A9 amended. R-019 may restyle the menu; the backdrop decision stands.
- Expected result: no "office"/"floor" line ever shows around an Offsite match; the first screen is the place you then play in.
- Status: implemented (Engineering, 2026-11-28, R-020 round 3; see LOG.md)

## F-044 — HUD faint on the bright sky; name card stays all match (P1, R-020 item 5; minimal, R-019 supersedes)
- What should change (Offsite only, under the current HUD; F-032 scrim and shadows stay):
  - FighterPanel label (`BOT · easy`, `YOU`, `RIVAL`): `text-cream/50` → **`text-cream`**, 10 px → **11 px**.
  - Second row (gun, ammo `mag/reserve`, Dash/Push labels): `text-cream/70` → **`text-cream`**; keep `font-semibold` on the gun name, add it to the ammo.
  - Arena pill (OFFSITE + card line): fade to opacity 0 over 300 ms **3 s after FIGHT at every viewport size** (today only when `short`); back to 1 on pause/menu. Applies to the office pill too.
- Expected result: at 1920x1080 over sky.top, every HUD string is pure cream with the F-032 shadow; the top centre holds only timer and score after 3 s.
- Status: implemented (Engineering, 2026-11-28, R-020 round 3; see LOG.md)

---

# Review R-025: roster-v3 in the game (BRIX, ORMO, ZUZU, TAVO A), portal-build uncommitted, 2026-11-28

Verdict: **accepted, no P0.** The four builds match the sheets in proportion, palette and pose under the game light on both arenas; R-024 holds in the game (no star or gold disc on BRIX, ORMO has hair, a walrus moustache that hangs down and the argyle on every side). I found nothing that still evokes a protected character (my visual judgement, not an ip-guard re-run). Four items keep it from finished: BRIX's defeat does not tell its story, the select/menu cards swallow each fighter's body, TAVO's pan reads as a cap, ORMO's toast reads as a hat. All P1/P2.

Reviewed from: the engineering shots in `shots/roster-v3-ingame/` (all four `*-vs-sheet`, `overview-4x4`, all four `poses-*`, both office shots, full size) and my own run of the portal dev build (Vite, real GPU, 1280x720 at 1x, follow camera, OFFSITE and the office, both pairings: idle, jump, hit, KO, menu, select). My captures: `shots/roster-v3-review-cd/`. Not seen: motion (stills only, so springs, BRIX's roll, ZUZU's bounce and the spinning wheels are unjudged), phones and the low tier, the result screen (in progress, ignored as asked). The 50 px/m flat-silhouette test was **not** run as a threshold pass; the notes below are a visual estimate from 1x crops.

Decisions on the R-025 asks:
- (a) Likeness: accepted. At 1x play distance a head is about 10 px, so the face kit reads only as ORMO's white moustache and BRIX's gold mouthguard; that is expected, not a fault. Idle stances read as crouched.
- (b) Criterion 3: ZUZU's red card **passes**; ORMO's cup passes, the puddle shows in the portrait but is hidden behind his legs on a deck in play (accepted); TAVO's pan and BRIX's skate **fail** (F-046, F-047). Props on the facing axis: accepted for play; the portrait/result pose must turn them to the camera (F-046).
- (c) Spirals: kept, with the change in F-047.
- (d) Deviations: all **accepted** for release (normal run on skates, mitts on the grip, idle arms only in portraits, no taunt in a match, stat-true pitch lines). Push-glide stride stays a P2 wish, not a blocker.
- (e) Whiteboard and monitors: accepted. The board copy reads at play distance; dashboards read as office charts.
- Silhouette estimate: ZUZU (two puffs), TAVO (pack hump) and ORMO (wide block + quiff) read by shape; BRIX reads by colour more than shape at 50 px/m (skates are about 10 px). Acceptable because her red is unique in the roster.

## F-045 — Select and menu cards: the fighter melts into a card of their own colour (P1)
- What is wrong: every select card fills the portrait box with the slot accent, the same hex as the fighter's top (BRIX red jersey on red, ORMO green vest on green, ZUZU pink on pink, TAVO blue on blue). The torso and arms disappear; only heads and props read. The menu showcase card does the same for BRIX. Also inconsistent framing: ZUZU is shown full-body and small while the others are chest-up; BRIX's helmet crown and TAVO's pack top touch or cross the top edge (`shots/roster-v3-review-cd/select.png`).
- Why it matters: the select screen is where a player picks "theirs"; v2 criterion 4 made the top colour = the accent precisely so it carries the identity, and the card background now cancels it.
- What should change: portrait box background = **cream `#FFF1DC`** with a radial burst of the accent at **22 % opacity** from behind the head (same burst as the sheets), plus a 4 px accent band along the bottom edge of the box. Framing: the `ready` pose framed so the **top of the head (incl. hair, helmet, pack) sits 8 % below the box top** and the head height is the same for all four (ZUZU then shows chest-up like the others; her smallness reads from the stat card, not from distance). Same rule for the menu showcase card.
- Expected result: in a 1280x720 select shot every torso, arm and prop is distinct from its background; the four heads line up at one height.
- Related spec: roster-v2.md §4 / §8.4, roster-v3.md §0.
- Status: implemented (2026-11-28, engineering; shots in `shots/roster-v3-polish/`, see LOG.md)

## F-046 — BRIX defeat: the lost skate is a 10 px speck (P1)
- What is wrong: at play distance the defeat is a black/red tangle and the skate a cream dot (about 10 px, `offsite-hotfix-legacy-ko.png`); in the defeat portrait the skate is a small box with the wheels barely visible (`poses-hotfix.png`, 4th). Nobody would name "a skate". Criterion 3 fails.
- What should change: (1) Skate prop at **1.35x** scale (cheat, prop only), lying **wheels up and side-on to the camera** (boot profile + all four scarlet wheels visible), placed **0.55 m from her hip toward the camera side**, never on the facing axis behind her body. (2) The sock foot points up beside it, so the eye links foot and skate. (3) Portrait/result `defeat` framing includes the skate inside the box with 6 % margin. (4) Wheels spin (as built).
- Expected result: in a 300 px tall crop of the defeat portrait, the upside-down skate is at least 45 px wide with four red wheels visible; at play distance it is at least 18 px wide.
- Related spec: roster-v3.md §4.1, §6 criterion 3.
- Status: implemented (2026-11-28, engineering; shots in `shots/roster-v3-polish/`, see LOG.md)

## F-047 — TAVO defeat: the pan reads as a cap with a badge (P1)
- What is wrong: on the head the pan shows its light underside (portrait) or a dark dome with a gold spiral overlapping it (play), so it reads as a sailor cap or a beret with a logo. The handle is not visible. The gold spirals overlap the pan and read as gold coins in the portrait.
- What should change: pan **face down** on his head (dark top `#1B1F2E` up, a 0.03 m lighter rim `#6B6F78`), tilted **18°** toward the camera, the **handle sticking out sideways toward the camera side at 0.32 m**, never hidden behind the head. Spirals: orbit radius **0.45 m** centred 0.2 m above the pan, orbit plane tilted 20° toward the camera, each spiral **0.12 m**, colour stays `#FFC83D`, line weight doubled so they read as spirals, not discs.
- Expected result: in the defeat portrait and at play distance the pan's handle is visible and the spirals never overlap the pan.
- Related spec: roster-v3.md §4.5, §6 criterion 3.
- Status: implemented (2026-11-28, engineering; shots in `shots/roster-v3-polish/`, see LOG.md)

## F-048 — ORMO victory: the raised red cup reads as a hat (P2)
- What is wrong: at play distance the cup lifted above the crown sits on top of his silhouette like a fez (`overview-4x4.png`, ORMO victory).
- What should change: toast at **face height, in front of the face toward the camera side** (cup centre about 0.15 m beside the head, not above it); the chest thump unchanged.
- Expected result: the cup is never above the top of his hair in the victory pose.
- Related spec: roster-v3.md §4.3.
- Status: implemented (2026-11-28, engineering; shots in `shots/roster-v3-polish/`, see LOG.md)

## F-049 — TAVO on the office: blue on the blue night (P2)
- What is wrong: the `#2456D6` flannel sits on the navy city windows; TAVO reads by his orange pack alone there (`office-standup-intern-hit.png`). Not a blocker: the pack is his hook and his rim helps.
- What should change: office only, raise TAVO's rim intensity **x1.3** (rim tint unchanged); no colour change to the accent.
- Expected result: the flannel's edge separates from the windows in a 1x office crop.
- Status: implemented (2026-11-28, engineering; shots in `shots/roster-v3-polish/`, see LOG.md)

## F-050 — BRIX on the office: helmet merges with the night (P2)
- What is wrong: the matte black helmet is lost on the dark office background; her head reads only by the stripe (`office-hotfix-legacy-jump.png`). Known weak spot (roster-v3 §7).
- What should change: the cream pinstripes on the helmet from 0.02 m to **0.035 m** wide; nothing else.
- Expected result: the helmet outline reads in a 1x office crop.
- Status: implemented (2026-11-28, engineering; shots in `shots/roster-v3-polish/`, see LOG.md)

# Review R-026 (CD, 2026-11-28): traits on screen + phase 2a/2b open items
Spec: `CREATIVE/ui/direction-b/spec.md` §11; sheet `CREATIVE/ui/direction-b/traits/traits-sheet.png`; icons `traits/icons/`. Looked at fieldday-p1/p2a/p2b shots and a 5 fps contact sheet of `result-reveal-win-1280.webm`. Did not play the build this turn.

## F-051 — Traits fire with nothing on screen (P0)
- What is wrong: the `trait` events have no VFX, sound, callout or HUD cue; Leapfrog and Tea Break are invisible to a player.
- What should change: §11.1-11.2: world callout (word for fires 1-3, disc after), HUD trait badge with ready/firing/cooldown, the per-trait VFX and sounds, Sugar Rush callout +120 ms, Packed Extra +150 ms and pack icon on the weapon chip. All hidden when traits are off.
- Expected result: in a 1280x720 capture, each trait fire shows its callout above the fighter and its badge pop; Sugar Rush's callout never overlaps the damage number; low tier adds at most 1 draw call per fighter (speed lines).
- Related spec: §11.1, §11.2. Status: done (in-match part) (in-match half done 2026-11-28 (engineering): callouts, VFX, sounds, badge, pack icon; see LOG R-026 in-match)

## F-052 — Menus do not explain traits or HP (P0)
- What should change: §11.3: home trait chip (replaces weight), select trait sticker + HEALTH pip row + focused-fighter line pill, how-to SIGNATURE MOVES strip, new `traitLine` copy, `copy.ts:57` health line, two tips.
- Expected result: a new player can name each fighter's trait from select alone; layout check 0 issues at 1280 and 1920.
- Related spec: §11.3. Status: implemented (2026-11-28, engineering; shots in `shots/traits-menus/`, see LOG.md)

## F-053 — Health bar length must show max HP (P1)
- What is wrong: segments = round(maxHp/20) at a fixed bar width, so ZUZU's 85 looks like 4 full segments and a segment is not the same damage for everyone.
- What should change: 2.52 px per HP, 20 HP per segment, partial last segment (§11.4).
- Expected result: ZUZU's full bar is 214 px, ORMO's 290 px; a 20 HP hit removes the same width on everyone.
- Status: done (done 2026-11-28: 2.52 px per HP, 20 HP segments (ZUZU 214, ORMO 290 measured))

## F-054 — Phase 2a/2b decisions (P1)
- What should change: (1) respawn COME BACK AS row, 1P only (§11.5.1); (2) draw subtitles, sound, rays (§11.5.2); (3) online `CANCEL` → `LEAVE`, pill `If either of you leaves, the match ends.`; (4) rival chip `DECIDING…` without a number, `STILL DECIDING…` after 20 s; (5) 2P key strips per §11.5.9. Accepted as built: draw layout, IRON SPONGE wording, NEXT ARENA hidden online, mag+reserve chips, credits without Support us / studio mark.
- Related spec: §11.5. Status: done (in-match part) (in-match items done 2026-11-28: respawn COME BACK AS (1P) and 2P key strips; draw, LEAVE and DECIDING items belong to the menu engineer / not done here); MENU part done (item 3: LEAVE + info pill, item 4: DECIDING… / STILL DECIDING…, see LOG.md), the in-match items (1, 2, 5) are with the other engineer

## F-055 — Star icons in the UI (P1, ip-guard follow-up)
- What is wrong: star icons on YOUR PICK (sun chip), the home arena ribbon, the credits ribbon and the Settings Credits button; ip-guard flagged gold star/coin motifs.
- What should change: §11.6: YOUR PICK → `check`; ribbon, credits ribbon and Credits button → `pennant`; delete `star` from `Icon.tsx`; the result white 16-point burst stays (rename class `fd-res-burst`).
- Expected result: `grep -ri "name=\"star\"\|icon=\"star\"\|★" src` returns nothing.
- Related spec: §11.6. Status: implemented (2026-11-28, engineering; shots in `shots/traits-menus/`, see LOG.md); `grep` for star icons and ★ in `src` is empty

## F-056 — Colour balance: one action colour, fighters own their colours (P0, R-027)
- What is wrong: up to 8 saturated hue families per screen; four button tones (sun/tang/sky/teal) for two levels of importance; UI teal/sky/tang/pink collide with ORMO/TAVO/BRIX/ZUZU; decor (bunting, rays, ribbons, track, confetti, medals) as loud as actions. Owner: "too many colours, balance lost, messy".
- Why it matters: nothing leads the eye, and the fighters stop owning their colours, which hurts readability in a fight.
- What should change: `CREATIVE/ui/direction-b/colour-balance.md` sections 3 and 4 in one pass: ButtonTone `sun | white | warn`; delete sky/teal tokens; white chips (HUD ready = white, cooling = #d9d3e6); grape ribbons; bunting sun/cream/tang; grape pips; 2P grape headers with accent foot, READY sun, VS white; result medals white with holder-accent ring, mist balloon, muted track #c9765c, confetti sun/white/winner.
- Expected result: frames match `shots/colour-balance/after/*.png`; acceptance criteria 1-5 and 7 of the spec.
- Related spec: colour-balance.md. Status: implemented (11b6915); reviewed by CD 2026-11-28 (R-028): accepted, follow-ups F-058, F-059, F-061, F-062, F-063, F-064

## F-057 — PEWFIELD wordmark too small on home (P1, R-027)
- What is wrong: art about 272x118, smaller than PLAY (372x96); the tang subtitle ribbon under the tang FIELD ribbon reads as one orange block.
- What should change: wordmark slot 420x160 (art ~369x160) at left 34 / top 34; grape arena ribbon at left 64 / top 184; menu column top 252, gap 16 (colour-balance.md section 5).
- Expected result: `shots/colour-balance/after/home-pewfield.png`; layout check 0 issues at 1280 and 1920.
- Related spec: colour-balance.md section 5. Status: implemented (3a4a61d); reviewed by CD 2026-11-28 (R-028): accepted, the ribbon tuck is intended, layout-check follow-up F-060

## F-058 — Settings: four sun marks; selected states become grape-2 (P1, R-028)
- What is wrong: `impl/settings.png` shows sun on the selected tab, the AUTO segment, the ON toggle and DONE (and `.fd-slider b` fills sun on Audio). Sun stops meaning "the action".
- Why it matters: one action colour per screen is the core of R-027; Settings is the screen players open to find DONE.
- What should change: colour-balance.md 8.2. Selected tab: fill #5a3596, white Titan text without `.fd-ol`, `inset 0 -5px 0 #26124a`, drop `0 4px 0 #3b1f6b`. `.fd-seg button[aria-checked='true']`: #5a3596, white text, `inset 0 -3px 0 #26124a`. `.fd-toggle[aria-checked='true']`: track #5a3596. `.fd-slider b`: #5a3596. Keep sun on DONE and on `.fd-kc.fd-listening`.
- Expected result: Settings (every tab) has exactly one sun element at rest (DONE); white on #5a3596 = 8.81:1; toggle ON vs OFF track 4.34:1. Re-capture Controls, Graphics, Audio and Accessibility.
- Related spec: colour-balance.md 8.2. Status: open

## F-059 — Contrast: cooling DASH/PUSH and `+ ADD` text (P1, R-028)
- What is wrong: `.fd-chip.fd-cool` text #8c84a3 on #d9d3e6 = 2.42:1; `.fd-kc.fd-empty` #8c84a3 on #ffffff = 3.53:1. WCAG text minimum is 4.5:1.
- What should change: new token `--gray-ink: #5a5274`. Cooling chip text #5a5274 (fill #d9d3e6 and border #8c84a3 unchanged); empty keycap text #5a5274 (dashed border #8c84a3 unchanged). `--gray-lo` is never used for text again.
- Expected result: cooling 4.98:1, `+ ADD` 7.26:1; greyscale ready vs cooling still distinct by fill (255 vs 215) and border (48 vs 138) plus the seconds label. Re-capture `hud-offsite-grey.png`.
- Related spec: colour-balance.md 8.3. Status: open

## F-060 — Home PEWFIELD: whitelist the wordmark/ribbon lock-up (P2, R-028)
- What is wrong: the strict layout check flags wordmark slot x arena-ribbon (18.2 px vertical box overlap) at 1280 and 1920. The tuck is intended.
- What should change: do not move the ribbon. In the layout check, exempt only the pair `wordmark` x `arena-ribbon` on home, and only while the vertical overlap of their boxes is <= 20 design px; every other overlap still counts.
- Expected result: home-pewfield 0 issues at 1280x720 and 1920x1080 with the whitelist; frames unchanged from `impl-pewfield/`.
- Related spec: colour-balance.md 8.4. Status: open

## F-061 — Pennant on grape ribbons reads as two quote marks (P2, R-028)
- What is wrong: on the home arena ribbon and the Credits title ribbon the sticker pennant loses its grape stroke against grape; only two white specks remain.
- What should change: add the on-dark pennant from `CREATIVE/ui/direction-b/traits/icons/ui-pennant-on-dark.svg` (string #FFF3D6, flags #FFC83D and #FFF3D6, no grape stroke) and use it on every grape surface: home ribbon at 24 px, Credits ribbon at 30 px. The Settings Credits button (white) keeps the sticker pennant.
- Expected result: both ribbons show a small string of two flags, readable at 1280x720.
- Related spec: colour-balance.md 8.6. Status: open

## F-062 — SHARPSHOOTER pistol is a speck in its medal (P2, R-028, pre-existing)
- What is wrong: in `impl/result-loss.png` the pistol is about 32x16 inside the 92 px medal disc (WeaponIcon's inline size beats `.fd-wide`).
- What should change: any weapon icon inside `.fd-res-disc` renders at 56 x 28 px, centred, grape like the other award icons.
- Expected result: the SHARPSHOOTER medal reads as a gun at a glance, same visual weight as BOOMERANG and PIÑATA.
- Related spec: colour-balance.md 8.6. Status: open

## F-063 — P1 / P2 tags in UI chrome: grape and white, no player hue (P1, R-028)
- What is wrong: `impl/result-2p.png`: P1 tag #ff4d4d and P2 tag #4d7cff above the cards, the same colours in `Tonight: P1 3 - 2 P2`, and a red `P1 ✓` chip inside the sun REMATCH. They collide with BRIX red and TAVO blue and add two hues to the busiest screen.
- What should change: every UI-chrome consumer of `PlayerChip` / `usePlayerColours()` (result tags, Tonight pill, rematch chips, HUD 2P key strips, Settings 2P keys, KeyCard): tag fill #3b1f6b, text #ffffff (2px white border where it sits on 3D or a photo); in the grape Tonight pill: P1/P2 white text, digits sun; rematch chip ready = #3b1f6b fill, white text and check; not ready = #ffffff fill, #3b1f6b text, 2px #3b1f6b border. Do NOT change the in-world over-head tags in `render/game.ts` (they keep `PLAYER_COLOURS` and the colour-blind pair).
- Expected result: no red/blue in 2P UI chrome except fighter-owned parts; all tag text 13.17:1. Re-capture result-2p and the 2P HUD with key strips.
- Related spec: colour-balance.md 8.5 (supersedes the strip-tag colour in spec.md 11.5.9). Status: open

## F-064 — Reset confirm label too long for its button (P3, R-028)
- What is wrong: `impl/settings-reset-confirm.png`: "PRESS AGAIN TO RESET ALL" fills the warn button edge to edge.
- What should change: label `PRESS AGAIN TO RESET` (the row title already says "Reset all settings"); keep the 12 px clear space rule.
- Expected result: label with >= 12 px clear space each side at 1280x720.
- Related spec: colour-balance.md 8.7. Status: open

---

# R-029: PEWFIELD CrazyGames covers + store copy (2026-11-28)

Covers in `~/Desktop/projects/games-studio/crazygames/covers/pewfield/`, copy in `CREATIVE/brand/crazygames-store.md`, site art in `~/Desktop/projects/games-studio/brand/pewfield/site/` (INTEGRATE.md). Capture kit and source frames: `shots/r029/`. F-065 blocks today's zip; the rest can ship after.

## F-065 — Portal meta description: replace; title suffix approved (P0, R-029)
- What is wrong: `portal/index.html` 14: "Pewfield is a 1v1 shootout. Pick a fighter, grab a gun, first to five KOs wins." It leaves out what people search for (bot, 2 players) and the four fighters.
- What should change: content = `Pewfield is a fast 1v1 shootout. Pick one of four fighters, grab guns off the field and race to five KOs against the bot or a friend on one keyboard.` (149 characters). Title suffix in `vite.portal.config.ts` 53 ("Pewfield — 1v1 shootout") is approved as is.
- Expected result: built `dist` index has the new description; `fieldday.test.ts` still finds `%GAME_TITLE%` in the source.
- Related spec: `CREATIVE/brand/crazygames-store.md` section 6. Status: open

## F-066 — Retire the office tagline (P1, R-029)
- What is wrong: `COPY.tagline` (`src/game/copy.ts`) is "Two coworkers. One grudge. No mercy." and feeds the Next site's `<meta description>` (`src/app/layout.tsx` 19). It sells the office story; the game is now a field-day duel and the README already says "Two fighters. One field. First to five KOs."
- What should change: `tagline: 'Two fighters. One field. First to five KOs.'`; layout description = `${COPY.tagline} A fast 1v1 shootout from ${STUDIO_NAME}: play the bot or a friend on one keyboard.` Keep the office lines that belong to the FLOOR 42 arena (`introTitle`, `resultWin` etc.).
- Expected result: no "coworkers"/"grudge" in player-facing or meta text; copy tests updated.
- Related spec: crazygames-store.md sections 6 and 8. Status: open

## F-067 — Wordmark SVG viewBox clips the burst's bottom point (P2, R-029)
- What is wrong: `public/brand/logo.svg`, `logo-light.svg`, `logo-mono.svg` and the `portal/static/brand/` copies use `viewBox="0 0 1200 520"`; the grape drop under the burst's lowest point runs past y=520 by about 12 units, so it is cut flat (rendered at 2400 px wide the art touches the bottom row; with a 544 viewBox it ends at 531.5). Same in my source `CREATIVE/brand/svg/a-wordmark.svg` (my fault: I will fix `build.mjs` next CD turn).
- What should change: `width="1200" height="544" viewBox="0 0 1200 544"` on all brand logo SVGs (the site copy in `brand/pewfield/site/logo.svg` already uses the tight `2 14 1178 524`). The home wordmark slot is height-bound, so the art shrinks about 4 %: re-run the F-060 layout check at 1280 and 1920.
- Expected result: the burst's bottom point and its drop are whole in every logo use; home layout check unchanged.
- Related spec: `CREATIVE/brand/README.md` section 2. Status: open

## F-068 — Portal theme-color is the old dark theme (P3, R-029)
- What is wrong: `portal/index.html` 6 `<meta name="theme-color" content="#0B0F1E">` (developer-era navy); the boot screen and the brand are sky and grape.
- What should change: `#3B1F6B` (grape) in the portal and the Next layout/manifest if they carry #0B0F1E.
- Expected result: mobile browser chrome matches the brand. Status: open

## F-069 — Shotgun damage numbers stack into an unreadable smear (P3, R-029)
- What is wrong: one shotgun blast spawns one "-16" per pellet at the same spot; four overlap into "-1166"-like mush (`shots/r029/f069-floater-overlap-crop.png`, from `src-HUD-038.jpg`, a real 1P match).
- What should change: pellets of one blast that hit the same target within 50 ms add into ONE number (e.g. "-64"), spawned once; the number scale tier follows the summed damage.
- Expected result: every shotgun hit shows one readable number. Status: open

## F-070 — 2P key card is still the old dark developer theme (P0, R-030)
- What is wrong: `KeyCard.tsx` / `BigKeycap` use navy panels, translucent grey keycaps, cream-on-navy text and the fighter name in accent text (`shots/colour-balance/impl2/keycard-2p.png`). It is the only old-theme screen in the 2P flow, between Field Day select and the Field Day HUD, and the ready line never shows which key is each player's Shoot.
- Why it matters: the theme flips dark for the 5-20 s before every 2P match, and a new pair has to hunt for their Shoot key on the cards.
- What should change: rebuild it to `CREATIVE/ui/direction-b/r030-2p-polish.md` section 1 (exact values, copy, motion, testids): `.fd-veil`, Titan title `BOTH PRESS SHOOT TO FIGHT`, select-2p style cards (grape header + fighter foot strip, paper body, white grape keycaps, sun when held), per-card status bar `Press [<Shoot key>] to fight` -> sun `READY!`, warning pill, hint strip `[ENTER] start now [ESC] back`; view mode titled `2 PLAYER KEYS`; 250 ms hold after both ready.
- Expected result: matches `CREATIVE/ui/direction-b/keycard/keycard.png` at 1280x720; layout check 0 issues at 1280x720, 821x462, 800x450. Status: open

## F-071 — 2P Shoot+Shoot rematch skips the result (P0, R-030)
- What is wrong: the 0.6 s lock lets mashing players leave at ~0.86 s (QA s8), before the winner lands and long before the awards (1.4-1.8 s).
- Why it matters: in 2P the result screen, the reward of every match, is almost never seen.
- What should change: Shoot+Shoot opens at 2.2 s (`BEATS.choice`, when REMATCH and its P1/P2 chips are up) or at once after Enter/Space skips the reveal, never before 0.6 s. Presses before opening are thrown away; a held Shoot needs a fresh press. 1P, online and Enter unchanged. Spec: `r030-2p-polish.md` section 2.
- Expected result: QA s8 rerun shows the three medallions before the rematch; no rematch before 2.2 s without a skip. Status: open

## F-072 — AIM/SHAKE pills: stack instead of hide at small sizes (P1, R-030)
- What is wrong: at 907x510, 821x462 and 800x450 the pills are hidden while the key strip or hint is up, so new players lose the aim-mode pill in their first matches.
- Why it matters: the strip is up exactly when a player is learning; the AIM pill (with its T hint) is part of that.
- What should change: when the row would clash, switch the corner group to a right-aligned column (`flex-direction: column; align-items: flex-end; gap: 6px`, AIM on top); hide only if the column still clashes. Measured on the real build: column clears the strip by 87 / 68 / 63 px at the three sizes (`shots/r030/pills-*-stacked.png`). Spec: `r030-2p-polish.md` section 3.
- Expected result: s9 rerun: pills visible and stacked with the strip up, back to a row after 2 KOs, 0 overlaps; 1280x720 unchanged. Status: open

## F-073 — Office-joke copy left on the default arena and one fighter role (P1, R-030 follow-up)
- What is wrong: spec section 7 bans office and developer jokes, but the default arena still shows them. "Mandatory team-building." is the OFFSITE intro card line (HUD arena card, `ArenaGame.tsx:567`). "{NAME} WINS THE OFFSITE" is the final-KO band line (`ArenaGame.tsx:603`). "The Office Dad" is ORMO's role on home, select, 2P select and the VS doors. Checked: `src/game/arenaChoice.ts`, `src/components/fieldday/copy.ts` (clean, nothing to change), plus `src/game/copy.ts` (where the KO band and the roles live).
- Why it matters: the CrazyGames build opens on OFFSITE, so these are the first and last lines a new player reads. They carry the retired office tone that F-066 removed from the store copy.
- What should change (exact strings):

| File:line | Now | New | Length |
|---|---|---|---|
| `src/game/arenaChoice.ts:15` `ARENA_COPY.offsite.line` | `Mandatory team-building. 41°C in the shade.` | `High noon on the planks. 41°C in the shade.` | 43 -> 43 |
| `src/game/copy.ts:104` offsite `knockoutLine` | `{NAME} WINS THE OFFSITE` | `{NAME} TAKES THE FIELD` | 23 -> 22 |
| `src/game/copy.ts:105` offsite `resultWin` | `You survived the offsite.` | `The field is yours.` | |
| `src/game/copy.ts:106` offsite `resultLoss` | `The offsite got you.` | `They took the field.` | |
| `src/game/copy.ts:107` offsite `resultDemo` | `{NAME} survived the offsite.` | `{NAME} took the field.` | |
| `src/game/copy.ts:23` `legacy.role` (ORMO) | `The Office Dad` | `The Grandad` (fits the white hair and moustache, and the slow, wide, unshovable kit) | 14 -> 11 |

  Lines 105-107 may no longer be rendered by the Field Day result. Change them anyway so the old copy cannot come back through a fallback. Update `arenaChoice.test.ts:50` and any copy test that pins these strings.
- Kept on purpose (setting, not a joke): the arena name `OFFSITE` and the `OFFSITE FIELD DAY` ribbon (renaming an arena is out of scope today), and the office arena's `FLOOR 42` / `The office, after hours.` / `open office` / `One floor of guns`. That arena IS an office, so describing it is world-building. The fighter ids (`hotfix`, `legacy`, ...) are internal and never shown.
- Expected result: `grep -rn "team-building\|WINS THE OFFSITE\|survived the offsite\|offsite got you\|Office Dad" src` returns nothing; the OFFSITE intro card and the final KO band show the new lines (screenshot one of each); the role reads `THE GRANDAD · 2× JUMP` on select. Status: open

## F-074 — Awards: the winner always gets at least one, and never fewer than the loser (P0, R-031)
- What is wrong: `chooseAwards` (`src/game/awards.ts`) picks the three highest-scoring awards with a 2-per-player cap, then a second pass fills any free slot even if it all goes to one player. Two of the five awards reward being hit (PIÑATA = rockets taken, IRON SPONGE = damage taken), and nothing in the pool rewards hitting. So the player who lost usually wins most categories. Playtest evidence: after a 5–3 player win all three awards went to the bot ("Zuzu jumped 62 times", "soaked up 456 damage", "hit 40% of shots"); at 907, 2 of 2 went to the bot (`docs/playtest/2026-11-28-old-vs-new.md` R2).
- Why it matters: the result screen is where the win is paid out. If the winner stands on the podium with nothing named, the win feels taken away, and the reason to press REMATCH is weaker.
- What should change (exact rule):
  1. **Two new pool awards that reward the attacker** (they mirror IRON SPONGE and balance the pool). Same mechanics as today: whoever has the bigger number holds it, a tie gives it to nobody, and it needs at least `min`.

     | id | title | value | ref | min | icon |
     |---|---|---|---|---|---|
     | `hitter` | HEAVY HITTER | `Math.round(stats.damage)` (damage dealt, from the sim) | 400 | 100 | weapon `shotgun` |
     | `streak` | HOT STREAK | `stats.bestStreak` (KOs in a row without going down) | 3 | 2 | icon `flag` |

     `AWARD_ORDER` becomes `['pinata', 'boomerang', 'streak', 'sharpshooter', 'hitter', 'bouncy', 'sponge']`. `AwardInput` gains `damage`, `bestStreak` and `kos` (all already in `ResultFighter`, so `resultModel.ts` passes them through).
  2. **Fallback award, outside the pool: BLUE RIBBON** (`ribbon`, icon `pennant`). It is used only when step 3 finds that the winner holds no pool award. Value = the winner's KOs. It never competes on score.
  3. **Selection.** Let `w` be the winner (0 or 1) and `l` the loser, or `w = null` for a draw. Build the candidates as today (pool of 7, sorted by score desc, then by `AWARD_ORDER`).
     - **Decisive match (`w` is not null):**
       a. Slot A = the winner's highest-scoring candidate. If the winner has none, slot A = BLUE RIBBON for the winner.
       b. Then walk the rest of the candidates in sorted order and add each one while: total < 3, the winner has at most 2, and the **loser has at most 1**.
       c. No fill pass. A screen with 1 or 2 medallions is correct (`slotsFor` already handles it).
       d. Result: the winner has 1–2 awards, the loser has 0–1, and the winner never has fewer than the loser.
     - **Draw (`w` is null):** sorted candidates, at most 3 in total and at most 2 per player, no fill pass, no BLUE RIBBON.
     - **2P and demo:** the exact same rule. It is symmetric by slot index (P1/P2), so there is no bias toward P1 or toward the local player. Only the names differ ("You" / fighter name / "P1"/"P2", as today).
  4. **Order of the returned list:** the winner's awards first (by score), then the loser's. On a draw, by score. This puts the winner's award in the first medallion slot.
  5. Delete the "second pass" in `chooseAwards`.
- Expected result (add these as unit tests in `awards.test.ts`):
  - The playtest case: winner `w = 0` with KOs 5, damage 520, bestStreak 2, jumps 20, accuracy 31 % (30 shots), damage taken 300; rival with KOs 3, damage 300, bestStreak 1, jumps 62, accuracy 40 % (25 shots), damage taken 456. Result: `[hitter (0), streak (0), bouncy (1)]`. Holder 0 has 2, holder 1 has 1.
  - The winner holds no pool award: winner gets exactly `[ribbon (w)]` plus at most 1 for the loser.
  - The loser never gets more than 1 award in a decisive match; the winner never gets 0 in a decisive match (test both slot indices, so 2P is checked both ways).
  - A draw with every candidate held by one player shows at most 2 awards.
- Strings for the new awards are in F-075. Related: `CREATIVE/ui/direction-b/spec.md` b12–b15 and section 7 (award pool). This supersedes the "up to three most remarkable" rule there. Status: open

## F-075 — Result pill copy by margin, and the new award strings (P0, R-031)
- What is wrong: the loss pill picks a random line from `FD_COPY.result.lossLines` whatever the score, so a 1–5 loss can say "1 – 5 · so close! · one more?" (playtest R3, `shots/new-normal-result2.png`). The win pill is a stat list with no line, and the draw pill uses `copy.drawSub` ("Time ran out with the score level."), which is sentence case and off-voice next to the others.
- Why it matters: copy that lies about the score reads as cheap, and players stop trusting the rest of the screen.
- What should change (exact rule and strings, `src/components/fieldday/copy.ts` + `resultModel.ts`):
  - **Margin** `m = |kos[0] − kos[1]|`. **Bands:** `close` = 1; `clear` = 2 or 3; `big` = 4 or more. **Shutout** = a decisive match where the loser has 0 KOs (it overrides the band on a win).
  - **Pill format for every outcome:** `{a} – {b} · {line}` (score as today, en dash with spaces, then one line). The win pill no longer lists accuracy and best streak. They are in the TAB stats card, and the awards now carry the winner's numbers (F-074).
  - **Which table:** `solo` and `online` use the **win table** when the local player wins and the **loss table** when they lose. `twoPlayer` and `demo` always use the **win table** (it names nobody, so it is neutral). Draws use the draw line in every mode.
  - **Rotation:** where a cell has two lines, pick one per match with the existing `lossLine` random index, modulo that cell's length. Replace `lossLines` with the tables below. Stop passing `drawLine={copy.drawSub}` to the result (leave `copy.drawSub` itself alone, other screens may use it).

  | Outcome | Band | Line(s) | Example pill |
  |---|---|---|---|
  | Win | shutout (5–0, any x–0) | `flawless!` | `5 – 0 · flawless!` |
  | Win | big (m ≥ 4) | `total control` | `5 – 1 · total control` |
  | Win | clear (m 2–3) | `clean win` | `5 – 3 · clean win` |
  | Win | close (m 1) | `by a whisker!` | `5 – 4 · by a whisker!` |
  | Loss | close (m 1) | `so close! · one more?` / `one KO short · run it back?` | `4 – 5 · so close! · one more?` |
  | Loss | clear (m 2–3) | `run it back?` / `shake it off · go again?` | `2 – 5 · run it back?` |
  | Loss | big (m ≥ 4, includes 0–5) | `tough one · go again?` / `try another fighter?` | `1 – 5 · tough one · go again?` |
  | Draw | any | `all square · one more?` | `3 – 3 · all square · one more?` |

  Suggested shape: `winLines: { shutout: [...], big: [...], clear: [...], close: [...] }`, `lossLines: { close: [...], clear: [...], big: [...] }`, `drawLine: 'all square · one more?'`.
  - Banned on any loss with m ≥ 2: "so close", "next one's yours", any word that says the loser nearly won. "next one's yours" is retired (it is a promise the game cannot keep).
  - **New award strings** (same shape as the existing `awards` entries):

  | id | title | line |
  |---|---|---|
  | `hitter` | `HEAVY HITTER` | `` `${who} dealt ${n} damage` `` |
  | `streak` | `HOT STREAK` | `` `${who} scored ${n} KOs in a row` `` |
  | `ribbon` | `BLUE RIBBON` | `` `${who} took the field, ${n} KOs` `` (n is never 1 on a first-to-5 win; if it is, write `1 KO`) |

  The titles fit the 224 px label card at Titan 18 (HEAVY HITTER is 12 characters, one fewer than BOUNCY CASTLE).
- Expected result: `resultModel.test.ts` cases: 1–5 loss → a big-band line, never "so close"; 4–5 loss → a close-band line; 5–0 win → `5 – 0 · flawless!`; 5–3 win → `5 – 3 · clean win`; 2P 5–4 → `5 – 4 · by a whisker!` with title `P1 WINS!` (or P2); 3–3 draw → `3 – 3 · all square · one more?`. A screenshot of a real 1P big loss and a real 1P win at 1280 shows the pill on one line (the longest pill, `1 – 5 · tough one · go again?`, is 30 characters, shorter than today's `5 – 2 · 57% accuracy · best streak 3` at 36). Related: `CREATIVE/ui/direction-b/spec.md` b15 and section 7 (the loss rotation there is superseded by this table). Status: open
