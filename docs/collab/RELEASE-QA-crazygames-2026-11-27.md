# Release QA: Floor 42 on CrazyGames (Basic Launch), 2026-11-27

Verdict: **SUBMITTABLE TODAY AFTER 3 blockers (B1-B3, about 1 hour).** Do not mark it PASS until B1-B3 are closed and the checks below are run again on the zip you actually upload.

Build: `portal-build` @ 420f4c5 (+ an uncommitted REQUESTS.md edit). `npm run build:portal` OK, zip `dist/floor-42-crazygames.zip` 0.51 MB, 30 files. Vitest: 18 files, 424 tests pass.
Test: headless Chromium 1255 (Playwright), the game served from 127.0.0.1:8601 inside a cross-origin iframe on localhost:8602 (1216x714), plus a phone at 844x390 and 390x844 (touch, DPR 3). The CrazyGames SDK script was stubbed so every SDK call was logged. Script: scratchpad `qa/run.mjs`. Screenshots: `shots/release-qa-cg-2026-11-27/`.

Docs (fetched 2026-11-27): https://docs.crazygames.com/requirements/intro/ , /requirements/technical/ , /requirements/gameplay/ , /requirements/game-covers/ , /requirements/quality/ , /sdk/game/

## Blockers

- **B1. The upload folder is stale.** `crazygames/upload/floor-42` is from 2026-11-21 23:45 (`index-CpmEVyex.js`, and no local 2-player: the string "One keyboard, two fighters" appears 0 times). Today's build is `index-CMeYmsqU.js`. Fix: upload `dist/floor-42-crazygames.zip` or copy `dist/portal` over the folder. Owner: Reis. Effort: 5 min.
- **B2. Neither preview video opens on the static cover.** Required by /requirements/game-covers. Frame 0 of both `floor-42-cg-*.mp4` is gameplay with the HUD (`shots/.../vidL0.png`). Fix: put 0.5 s of the chosen cover in front of each video with ffmpeg, keep the total under 20 s and keep the videos silent. Owner: game-video-lead / Claude Code. Effort: 20 min.
- **B3. iOS audio stays dead after an interruption.** `src/game/sfx.ts:97,102` calls `resume()` only when the state is `'suspended'`. On iOS the state becomes `'interrupted'` after the app goes to the background or a call comes in. /requirements/technical (Audio) says to resume on a user gesture. Fix: resume whenever `state !== 'running'`, then rebuild. Owner: Claude Code. Effort: 15 min. Not tested on a real iPhone.

## Checklist

| Requirement | Result | Evidence |
|---|---|---|
| Total size ≤250 MB, initial download ≤50 MB (≤20 MB for the mobile homepage), ≤1500 files | PASS | 1.33 MB on disk, 530 KB gzip, 30 files (portal-report) |
| Relative paths only | PASS | portal-report check; `base: './'` |
| SDK v3: init, loadingStart/Stop | PASS | log: init 79 ms, loadingStart 131, loadingStop 163 (`portal/main.tsx:17`, `App.tsx:75`) |
| gameplayStart/Stop at every break, not on focus change | PASS | start 7982 ms; Esc gives stop, a second Esc gives start; clicking outside the iframe made no SDK call (`ArenaGame.tsx:699-704`) |
| Portal mute switch | PASS (unit test only) | listener registered; `settings.ts:317`, `settings.test.ts:101`. Audio output was not measured |
| Ads, mute during ads, audio after an ad break | N/A | Basic Launch: monetization is off and no ad code is in the build (`platform/types.ts:8`) |
| happytime | N/A | optional; not called |
| No external hosts | PASS | the only external request is sdk.crazygames.com; no fly.dev, no WebSocket, no colyseus in the JS |
| No cross-promotion or outbound links | PASS | portal-report; the menu shows the text "Nalbaki Games · v0.1.0 · Credits" with no link |
| No custom fullscreen button | PASS | none found |
| user-select: none on body | PASS | computed `none` (`portal.css:54-57`) |
| Device detection through the SDK, not touch detection | FAIL (risk) | `input.ts:13` and `quality.ts:56` use `pointer: coarse` / `ontouchstart`, so a Windows touch laptop may get touch controls. Effort: 1 h |
| Same physics at any refresh rate | PASS | fixed-step accumulator with dt clamped to 0.1 s (`game.ts:1001-1005`) |
| Pause when the tab is hidden | PASS (by code) | requestAnimationFrame stops and the clamp prevents a catch-up jump; headless could not hide the tab |
| Keyboard focus inside the iframe | PASS | 5 of 5 keys reached the frame; focus sits on the key-trap input; the host page did not scroll on Space or the arrows |
| Restricted keys | WARN | Esc is the only keyboard pause, and Esc also leaves fullscreen (/requirements/quality) |
| Touch on a phone | PASS | 844x390: stick plus Fire, Jump, Dash, Push, Crouch, Swap, Pause; 60 fps; no errors |
| Orientation | SET LANDSCAPE in the form | 390x844 shows "Turn your phone sideways… The match keeps running": the bot keeps playing while the player turns the phone |
| Console errors | PASS | 0 errors in 3 sessions, including 20 s of input |
| Loading time and first input | PASS / RISK | menu at 163 ms (local, no throttling); 2 clicks plus a 5.1 s lift and card before control. The Full Launch rule asks for 0-1 clicks |
| Covers 1920x1080, 800x1200, 800x800, title only | PASS (NEW set) | sizes measured. Risk: AI-illustrated art (`crazygames/covers/AI-PROMPTS.md`) is far more detailed than the low-poly game, and the portrait and square crops drop the rival |
| Videos 15-20 s, ≤50 MB, silent, 1080p 16:9 and 2:3 | PASS, except B2 | 16.7 s and 16.5 s; 18.9 MB and 10.5 MB; no audio stream; no black frames (lowest average luma 38, last frame of the portrait video) |
| Description and controls fields | UNKNOWN | no draft text found in the repo; Reis must write it in the form |
| Readable at an 800x450 iframe | RISK | the HUD reads; the fighters are about 34 CSS px tall at 844x390 |

Not done: a real iPhone, Safari, Firefox, Edge, a 4 GB Chromebook, throttled load, the real SDK in the CrazyGames QA tool, and the side-by-side 30-second comparison with 3 top games (the Creative Director's basic-launch-kpi.md covers that ground).

Disagreement, stated once: basic-launch-kpi.md says to hold the submission until The Climb ships. That is a KPI risk, not a reject reason. Nothing in the written requirements blocks a bot-only build. The decision belongs to Reis and the kill committee.

## Re-check, 2026-11-27 21:30-21:40 (final, before today's upload)

Verdict: **SUBMITTABLE NOW.** B1-B3 are closed. No open blocker. Two WARNs stay (below), neither is a reject reason in the written requirements.

Build: working tree on `portal-build` @ 420f4c5 plus uncommitted R-011/F-018/F-019 changes (not committed: commit before or right after upload so the shipped build can be rebuilt). `npm run build:portal` re-run: checks pass, 30 files, 1.34 MB, 533 KB gzip. The fresh zip is byte-identical (unzipped `diff -r`) to the `dist/floor-42-crazygames.zip` that existed before the rebuild. sha256 `3b62c598e9672c569e42ca24c43ef918e4e335b337df78341cc6c079ed24c39e`. Vitest 443/443 pass.
Test: Chromium 1255 headless with the real GPU (ANGLE Metal, Apple M1 Pro), the unzipped upload served on 127.0.0.1:8601, desktop inside a cross-origin iframe of 1280x720 on localhost:8602; phone 844x390, touch, DPR 3, iPhone UA. SDK stubbed and logged. Script: scratchpad `qa/rematch.mjs`. Evidence: `shots/release-qa-cg-recheck-2026-11-27/` (screens, `desktop.log`, `phone.log`, video frames).
Docs re-fetched today: https://docs.crazygames.com/requirements/quality/ , https://docs.crazygames.com/requirements/technical/

| Check | Result | Evidence |
|---|---|---|
| B1 zip = current tree, has 2 PLAYER | PASS | rebuild identical; bundle `index-B7zh-nSD.js` contains "2 PLAYER" x1, "One keyboard, two fighters" x1. `crazygames/upload/floor-42` is still the stale 21 Nov folder: do not upload from it |
| B2 videos open on the NEW cover | PASS | SSIM vs NEW cover: landscape 0.992 at 0 s and 0.45 s, portrait 0.992 / 0.992; gameplay from 0.6 s (0.53 / 0.55). 17.2 s / 17.0 s, 13.7 MB / 8.9 MB, h264, no audio stream, 1920x1080 and 1080x1620 (2:3) |
| B3 iOS 'interrupted' audio | PASS (code) | `sfx.ts:97-99` resumes on any state except running/closed, called from the gesture path `ensure()`. Not tested on a real iPhone |
| SDK init / loading | PASS | desktop init 104, loadingStart 156, loadingStop 189 ms; phone 117 / 168 / 397 ms |
| gameplayStart / Stop through a full match with slow-mo and result delay | PASS | desktop: match ended on KOs (bot 5-0, finale slow-mo path), gameplayStop at 108003 ms, the result card was seen by the 0.5 s poll at 108083 (stop fires with the card, not before the slow-mo). Phone: match ended on time (0-4), stop 158675, card seen 158910. Exactly one start and one stop per match; Rematch gives gameplayStart again (113344 / 164336) |
| First match vs easy | PASS | HUD shows `BOT · easy` on both runs |
| External hosts | PASS | only `sdk.crazygames.com/crazygames-sdk-v3.js`; no WebSocket. `react.dev` in the bundle is an error-message string, never requested |
| Console errors, full match | PASS | 0 errors, 0 page errors at 1280x720 and 844x390. Warnings: 2x three.js "PCFSoftShadowMap has been removed" (harmless) |
| FPS / memory | PASS | 60 fps both (M1 Pro GPU; not a low-end device); heap 28 MB / 20 MB after the match |
| Covers NEW set | PASS | NEW-landscape 1920x1080 (2.1 MB), NEW-portrait 800x1200 (0.96 MB), NEW-square 800x800 (0.73 MB) |

Earlier WARNs, re-judged against today's docs:
- **Esc-only pause: WARN, not a blocker.** /requirements/quality lists "Escape closes fullscreen" under keys to avoid, as a guideline, and says nothing about pause. Effect: in CrazyGames fullscreen the first Esc only leaves fullscreen; a second Esc pauses. Cheap fix later: add P as a second pause key and a small clickable pause icon on desktop. Owner: Claude Code, 30 min.
- **Touch detection instead of SDK device info: WARN, not a blocker.** /requirements/technical: "We strongly recommend to rely on our system info" and "Don't rely on touch detection (for example `ontouchstart` ...) to show mobile controls". Strong recommendation, not a "must"; the risk is a touch laptop getting the phone layout and a QA comment. Fix in the next update: `SDK.user.systemInfo.device.type` first, `pointer: coarse` as fallback (`input.ts:13`, `quality.ts:56`). Owner: Claude Code, 1 h.

Files to upload:
- Game: `floor-42/dist/floor-42-crazygames.zip`
- Covers: `crazygames/covers/floor-42/NEW-landscape-1920x1080.png`, `NEW-portrait-800x1200.png`, `NEW-square-800x800.png`
- Videos: `crazygames/videos/floor-42/floor-42-cg-landscape-1920x1080-cover-first.mp4`, `floor-42-cg-portrait-1080x1620-cover-first.mp4`
- Form: orientation Landscape; description and controls text still to write (Reis).

Still not verified: a real iPhone / Safari / Firefox, a low-end Chromebook, throttled network, the real SDK in the CrazyGames QA tool (run it after upload, before submitting), the side-by-side 30-second comparison with top CrazyGames fighters.

## Final check, 2026-11-27 22:45-22:55 (desktop only, after R-013 "Doors and Stamps" and the R-014 fixes)

Verdict: **SUBMITTABLE NOW (desktop only).** No blocker. Three WARNs below, none is a reject reason in the written requirements.

Build: `portal-build` @ 420f4c5 plus the uncommitted R-011..R-014 tree (commit it right after upload so the shipped build can be rebuilt). Re-ran `npm run build:portal` at 22:46: checks passed, 28 files, 1418 KB on disk, 601 KB gzip, zip 0.58 MB (608 KB). The unzipped rebuild is identical (`diff -r`) to the zip that was there before, so **zip == current tree**. New zip sha256 `dceccca9ed0dc22431f8e5b44f6ff0e9fc8b8270a28e11475421e50646fe0ab1` (differs from the earlier `736f5f87...` only in zip timestamps). Bundle `index-D7nFESds.js`. Vitest 22 files, 448/448 pass.
Test: Chromium 1255 headless, real GPU (ANGLE Metal, Apple M1 Pro). The unzipped zip served on 127.0.0.1:8601 inside a cross-origin iframe on localhost:8602 at exactly 1280x720 (run A) and 1920x1080 (run B), both runs in parallel. CrazyGames SDK script stubbed and every call logged with `performance.now()`. Fresh profile (first match = easy bot). Script: scratchpad `qa/final.mjs`. Evidence: `shots/release-qa-cg-final-2026-11-27/` (`A-1280.log`, `B-1920.log`, cold load, intro frames every 400 ms, pause, results, rematch frames).

| Check | Result | Evidence (times are ms in the game frame) |
|---|---|---|
| SDK init / loadingStart / loadingStop | PASS | A: 109 / 161 / 202. B: 882 / 933 / 1083 |
| Poster on cold load | PASS | `main` background is `menu-poster.webp` 150 ms after navigation; `*-0-coldload.png` already shows the home screen, no blank frame |
| PLAY path: no gameplayStart during VS doors or the countdown | PASS | A: PLAY click 5131, VS text 6159, READY 7656, gameplayStart 9464 (READY to start 1.8 s = the 2.0 s offline countdown). Click-to-control 4.3 s |
| Select -> ArrowDown -> Enter path | PASS | B: FIGHTER opened the select with focus on a BUTTON; Enter 6614 (lock-in, doors, countdown), gameplayStart 11015 (4.4 s). Fought as Legacy, so ArrowDown + Enter picked the second fighter |
| Exactly one start/stop per match (KOs, respawn pick, slow-mo, result delay) | PASS | A match 1: start 9464, stop 82403, result card seen 82848. A match 2: start 86743, stop 158963, card 159069. B: start 11015, stop 58769, card 59008. No extra calls during the 5 KOs, the "Back in 2 · come back as" respawn pick or the final slow-mo |
| Rematch (Enter) with the short VS doors | PASS | Enter 84500, gameplayStart 86743 (2.2 s, doors + countdown); one start, no stray stop |
| Esc pause sends stop / start | PASS | Esc at ~14.9 s: gameplayStop 15737 and the PAUSED menu (`A-1280-5-paused.png`); second Esc: gameplayStart 16727 |
| Blur does not send SDK calls | PASS | clicking the host page's input: 0 SDK calls; one click back in the frame restores `document.hasFocus()` = true |
| Keyboard focus in the iframe | PASS | after the PLAY click: frame has focus, active element is the game's key-trap INPUT; Space, ArrowDown and PageDown left the host page at scrollY 0 |
| Easy bot first | PASS | HUD `BOT · easy` on both runs |
| No external hosts | PASS | only request outside localhost: `https://sdk.crazygames.com/crazygames-sdk-v3.js`. No WebSocket. 0 failed requests, 0 HTTP >= 400. Bundle has no `fly.dev`/`wss://`; only `w3.org` (SVG namespace) and `react.dev` (error string), never requested |
| Console, two full bot matches (three in total) | PASS | 0 errors, 0 page errors, **0 warnings** in both runs (the old PCFSoftShadowMap warning is gone) |
| FPS / memory | PASS | 58 fps at 1280x720, 54 fps at 1920x1080 with both browsers running at once on an M1 Pro; heap 51 MB after match 1, 27 MB after match 2 (GC; no growth). Not measured on a low-end machine |
| File count / size | PASS | 28 files (31 zip entries incl. folders), 1.42 MB unpacked, well under 250 MB / 1500 files |

WARNs (not reject reasons; fix in the next update):
- **W1. Respawn pick panel overlaps the first-match key strip** (new with R-013/R-014). At 1920x1080 the "Back in 2 · come back as" panel sits on top of the A / D / W / SPACE caps and cuts them (`B-1920-4-fight-bottom-crop.png`). First match only, during a respawn. Owner: Creative Director (placement) then Claude Code, 15 min.
- **W2. HUD and result card read small at 1920x1080** (F-024, already open): result title and stat rows use about half the card height they get at 1280 (`B-1920-6-result1.png`). Owner: Claude Code per F-024.
- **W3. (carried) Esc-only pause and touch detection instead of SDK device info.** Desktop-only form reduces the touch risk to touch laptops; the Esc-closes-fullscreen guideline still applies. Same fixes as in the re-check above.
- Note: the store videos predate the VS doors and stamps. They still show this game and open on the cover, so they are valid; recapture later for the KPI, not for review.

Files to upload (final):
- Game: `/Users/hacaghahasanli/Desktop/projects/games-studio/floor-42/dist/floor-42-crazygames.zip`
- Covers: `/Users/hacaghahasanli/Desktop/projects/games-studio/crazygames/covers/floor-42/NEW-landscape-1920x1080.png`, `.../NEW-portrait-800x1200.png`, `.../NEW-square-800x800.png`
- Videos: `/Users/hacaghahasanli/Desktop/projects/games-studio/crazygames/videos/floor-42/floor-42-cg-landscape-1920x1080-cover-first.mp4`, `.../floor-42-cg-portrait-1080x1620-cover-first.mp4`
- Form: desktop only (do not tick mobile / touch); orientation Landscape; controls: A/D move, W jump, Space shoot, Esc pause (plus dash/push keys as shown in How to play).

Still not verified: the real SDK in the CrazyGames QA tool (run it after upload, before submitting), Firefox / Edge / Safari desktop, a low-end Windows laptop or Chromebook, throttled network, sound by ear, the side-by-side 30-second comparison with top CrazyGames fighters.

## Pre-update check, 2026-11-28 01:00-01:30 (desktop only; weight pass v2, OFFSITE default arena + Arena row, OFFSITE review fixes)

Verdict: **SUBMITTABLE AS AN UPDATE.** No blocker. Two new WARNs (W4, W5) plus the carried W1-W3; none is a reject reason in the written requirements.

Build: `portal-build` @ `6b68a4c` (clean tree; only `docs/collab/shots/` untracked), so the zip can be rebuilt from a commit. `npm run build:portal`: checks passed, **28 files, 1456 KB on disk, 615 KB gzip, zip 0.59 MB** (31 entries incl. folders). **zip == tree**: unzipped `diff -r` against `dist/portal` is empty. sha256 `48d279bb03e1f6e3e8180848378827eee449c262043ccd695791d30aeb4936cd`, bundle `index-sUda52jd.js` (contains "OFFSITE" and "Mandatory team-building"). Vitest 28 files, **534/534 pass**.
Test: Chromium 1255 headless, real GPU (`ANGLE Metal Renderer: Apple M1 Pro`), the unzipped zip on 127.0.0.1:8611 inside a cross-origin iframe on localhost:8612 sized exactly 1280x720 and 1920x1080. SDK script stubbed, every call logged. Four runs, **one at a time** (clean frame times), each a fresh profile: OFFSITE 1280, OFFSITE 1920, office 1280, office 1920. Each run: PLAY, Esc pause/resume, blur, full match, Enter rematch, second full match, then reloads to test the Arena setting. Script and logs: `shots/release-qa-cg-update-2026-11-28/` (`upd.mjs.txt`, `<arena>-<w>.log`, screenshots).
Docs re-fetched 2026-11-28: https://docs.crazygames.com/requirements/technical/ (no change to size 250 MB / initial 50 MB / 1500 files / gameplay start-stop), https://docs.crazygames.com/requirements/game-covers/

| Check | Result | Evidence (ms in the game frame) |
|---|---|---|
| zip == tree, size, file count | PASS | see Build; 28 files, 1.46 MB, far under 250 MB / 1500 files |
| SDK init / loadingStart / loadingStop | PASS | OFFSITE 1280: 96 / 147 / 181. Office 1920: 51 / 103 / 138. Every reload: one init, one loadingStart, one loadingStop |
| Default arena is OFFSITE on a fresh profile | PASS | PLAY from the main menu went to `#/arena?...&bot=easy&arena=offsite`; HUD shows "OFFSITE" and its card line; `floor42:settings` has no `arena` key until the player picks |
| Office through the Arena row | PASS | FIGHTER screen -> Arena row: `offsite:true` -> click FLOOR 42 -> `office:true`, line "The office, after hours.", stored `arena: "office"`; after a reload PLAY went to `arena=office`, HUD "FLOOR 42 open office" |
| Arena choice persists | PASS | round trip in one profile: reload -> stored `office` -> pick OFFSITE -> reload -> stored `offsite`. Office runs: still `office` after two matches and a reload |
| gameplayStart/Stop exactly once per match, both arenas, both sizes | PASS | OFFSITE 1280: start 4467, [Esc stop 11121, start 12079], stop 49912 (card 50066), rematch start 53998, stop 86232 (card 86592). Office 1920: 4624, [11322, 12446], 51625, 55955, 114672. OFFSITE 1920 and office 1280 the same pattern. No calls during KOs, respawn pick or slow-mo; stop lands with the result card |
| Rematch keeps the arena | PASS | rematch URL and HUD unchanged in all four runs (OFFSITE stays OFFSITE, office stays office) |
| PLAY to control | PASS | 2.4-2.8 s (doors + countdown), first match vs `BOT · easy` in all runs |
| Esc pause | PASS | stop on the first Esc, start on the second (all four runs) |
| Blur sends no SDK call; keys stay in the frame | PASS | 0 calls after clicking the host input; focus on the key-trap INPUT; host scrollY 0 after Space / ArrowDown / PageDown |
| External hosts | PASS | only `https://sdk.crazygames.com/crazygames-sdk-v3.js`; no WebSocket; 0 failed requests, 0 HTTP >= 400. Bundle URL strings: `w3.org` (SVG ns), `react.dev` (error text), the SDK |
| Console, two full matches per arena | PASS | 0 errors, 0 page errors, 0 warnings in all four runs (8 matches, 10 page loads) |
| Frame time | PASS (headroom not measured) | every run, idle 5 s and fighting 6 s: 60 fps, p50 16.7 ms, p95 16.7, p99 16.8, max 16.8 ms, 0 frames > 33 ms. The headless rAF is capped at 60 Hz, so this shows no hitches on an M1 Pro, not the margin on a weak laptop |
| Memory | PASS | heap after match 1 / 2: 25/31, 31/23, 25/28, 32/24 MB (no growth) |

New WARNs (fix in a later update; not reject reasons):
- **W4. Menu tagline now contradicts the default arena.** The home screen says "ONE OFFICE. TWO FIGHTERS. NO MERCY." over the office backdrop, then PLAY drops the player in a desert (`offsite-1280-1-menu.png` vs `offsite-1280-4-fight.png`). Owner: Creative Director (copy / backdrop), then Claude Code.
- **W5. Fighter screen at 1280x720: the credits line touches the FIGHT bar.** "Nalbaki Games · v0.1.0 · Credits" sits directly under "FIGHT AS HOTFIX" with no gap (`office-1280-pick-office.png`). Cosmetic. Owner: Claude Code, 10 min.
- W1 (respawn panel over the first-match key strip) is still there, now also at 1280x720 on OFFSITE (`offsite-1280-4-fight.png`). W2, W3 unchanged.
- Signal, not a defect: the scripted player (mashing move/shoot/jump) lost every match 0:5; on OFFSITE in 30-41 s, on the office in 32-59 s (the 27 Nov office run took ~73 s). A script is not a player; check with a human whether the easy bot on OFFSITE is still a fair first match (KPI risk, owner game-playtest-critic).

Covers and videos after the default-arena change:
- **Not required for the update.** /requirements/game-covers: "Game covers don't have to be an accurate representation of the gameplay"; videos must represent the gameplay "and not misleading". The office is still in the game and still selectable, so the current covers and videos stay valid.
- **Advisable, video first.** The same page: "If you update your game by adding new content, this is a great time to update your cover and show something new", but also not to change it too often. Recommendation: re-cut the landscape and portrait videos so OFFSITE (what PLAY now shows) appears in the first seconds, keeping the cover-first 0.5 s; keep the NEW covers until the first CrazyGames CTR numbers exist, then test an OFFSITE cover as a deliberate variant rather than swapping blind. Owner: game-video-lead (video), Creative Director (cover).

Files to upload: `/Users/hacaghahasanli/Desktop/projects/games-studio/floor-42/dist/floor-42-crazygames.zip` (sha256 above). Covers and videos: unchanged from the 27 Nov final list.

Still not verified: the real SDK in the CrazyGames QA tool, Firefox / Edge / Safari, a low-end Windows laptop or Chromebook (frame-time headroom), throttled network, sound by ear, a human playing OFFSITE.
