# Requests (Claude Code -> Creative Director)

Format: `## R-001 — title` then Context, Expected deliverable, Priority (P0-P3), Status (open | in-progress | done | blocked).

## R-001 — Initial creative audit and direction
- Context: First run. See CREATIVE_DIRECTOR.md section 12.
- Expected deliverable: BRIEF.md, CREATIVE/ core docs, CREATIVE/research/, creative audit, prioritized roadmap.
- Priority: P0
- Status: deferred (Reis 2026-11-21: do R-002 first; run a light audit later)

## R-002 — Online lobby redesign v2 (low-poly sky arena, NO cyberpunk)
- Context: Reis's full brief, verbatim: ~/.agents-know/personal/feedback4/spec-f42-lobby.md (read it fully — it is the source of truth; the previous concept was rejected as too cyberpunk). Inspect the existing game first: characters (Hotfix, Legacy, Standup, Intern), arena (docs/ARENA.md, docs/arena.png, docs/characters.png, docs/home.png), current lobby UI in src/. Run the game locally at http://localhost:3205 if useful (read-only). All existing lobby functions must stay: online status, character select + stats, auto-aim/mouse toggle, invite friend, quick match, play vs bot, join by room code. Engineering constraints: three.js scene is OK but must stay light (phones first-class), reuse existing character rigs/arena pieces, no new heavy assets, no copied assets from other games. No eyebrow labels (small uppercase spaced tags above titles).
- Expected deliverable: CREATIVE/ui/lobby-v2.md — layout for desktop and phone portrait/landscape, background scene composition (what objects, camera, light, small animations), top section redesign (in-game HUD feel, not a navbar), character presentation + selection state + idle animation intent, per-character colour identity, button hierarchy, copy for every label, states (connecting, offline, searching, room created, error). Add an SVG/ASCII wireframe in CREATIVE/ui/ if helpful.
- Priority: P0
- Status: done (spec ready for implementation, 2026-11-21) -> CREATIVE/ui/lobby-v2.md + lobby-v2-wireframe.svg + CREATIVE/assets/icon-{invite,quick,bot}.svg. CD review of the build follows in FEEDBACK.md against spec section 12.

## R-003 — Technical limits found while building R-002 (info for the Creative Director, no action needed unless you disagree)
- Context: see LOG.md 2026-11-21 "R-002 built".
- Limits: (1) draw-call budget on the low tier is about 70 of 80; the fighter rig alone is about 38 calls, so adding props or more guns to the lobby scene needs something else to go. The railgun idle was dropped for this. (2) Medium and high tiers show 130-140 calls in renderer.info because it counts the shadow pass; the visible-scene cost is the same as low. (3) Phone portrait cannot show both the left info and the badges next to a tall status panel (invite state is about 400 px tall); the panel states hide them there. (4) Signature idle beats (P2) need rig poses that do not exist yet (hand to headset, crossed arms, wrist check, strap hitch).
- Priority: P3
- Status: done (CD 2026-11-21): all four limits accepted. Budget rule and cut order written into CREATIVE/ui/lobby-v2.md section 14. (3) is superseded by F-003. (4) signature beats deferred to the R-001 backlog; tempo fallback is final for now.

## R-004 — Review lobby v2 build (4bc9ad1)
- Context: R-002 spec implemented in 4bc9ad1; deviations in LOG.md (latest entry). Shots of all 10 states x desktop/portrait/landscape: ~/.agents-know/personal/feedback4/shots/f42-lobby-v2/ (contact-sheet.png + per-state PNGs). Engineering notes to check: desktop stat bars/description overlap the desk and window in the scene (readability); phone portrait panel states leave the lower half of the screen empty.
- Expected deliverable: accept, or F-xxx items in FEEDBACK.md with exact changes.
- Priority: P0
- Status: done (review complete, CD 2026-11-21): accepted with changes. F-001 desktop left-column readability (P0), F-002 clouds read as rocks (P0), F-003 portrait panels bottom-docked (P0), F-004 landscape name scrim + connection line (P1), F-005 cables behind badges (P2), F-006 error standee (P2). Re-review after F-001..F-004 with fresh shots of the same 30 states.

## R-005 — Re-review lobby v2 after F-001..F-006 (dc3cba1)
- Context: fixes + deviations in LOG.md (latest entry). 50 shots incl. 360x740 and 667x375: ~/.agents-know/personal/feedback4/shots/f42-lobby-v2/ (contact-sheet.png). Engineering flags: desktop bottom-left clouds still read dark grey under the left scrim; one far cloud floats above the slab's back edge near the fighter's head and reads like a floating rock; low-tier draw calls now 70-76 of 80.
- Expected deliverable: accept, or F-xxx items with exact changes.
- Priority: P0
- Status: done (CD 2026-11-21): accepted; show Reis after F-007 (P1, landscape scrim seam). F-008 (P2, cloud tidy: desktop bottom-left mask, far clusters lowered) can follow. Draw-call level 70-76/80 accepted.
