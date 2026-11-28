# R-029 capture kit (Creative Director, 2026-11-28)

Real build: `floor-42` portal-build (806345c + 98d30a5 collab), `npx vite --config vite.portal.config.ts --port 3261`, Chromium 1255 with ANGLE Metal (real GPU), deviceScaleFactor 2.

- `frames.mjs <tag> <p1> <p2> <w> <h> <count> <fill> [yaw] [lift] [maxdx]`: a bot-vs-bot demo on OFFSITE (`#/arena?...&demo`), DOM hidden except the canvas, depth-test-free sprites hidden (damage numbers, pickup labels, trait callouts), and `__mc.renderer.render` wrapped to aim the camera at the two fighters (fill < 0 = tight mode, minimum visible height in world units; lift shifts the fighters down for logo headroom). No game code changed; `__mc` exists only in the dev build.
- `hud.mjs`: a 1P match vs the hard bot with the real HUD, the player driven by a script; 1920x1080 at DPR 4/3.
- `compose.py`: crops + the logo (engineering's outlined `public/brand/logo.svg` with the viewBox padded to 1200x544, rendered by `svg2png.mjs`).
- `src-*.jpg`: the source frames each deliverable is cut from (L1-028 landscape/key art/share/card, P4-041 portrait, S3-129 square, L2-078 duel, L2-005 dash, HUD-038 HUD).
- `f069-floater-overlap-crop.png`: evidence for F-069.
