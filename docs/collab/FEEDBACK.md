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
