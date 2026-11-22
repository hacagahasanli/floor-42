# Basic Launch KPI plan: Floor 42 (CrazyGames build, bot-only)

Owner: Creative Director. Date: 2026-11-22. Request: R-007.
Target for Full Launch: average playtime 10+ min, D1 retention 10-15 %, conversion (opened -> 1+ min played) 80 %+,
thumbnail CTR in the top 20 % of Action.

## Sources and how this was judged

- Verified (CrazyGames docs, fetched 2026-11-22): docs.crazygames.com/resources/basic-launch-metrics (the four KPIs and
  their benchmarks; **CTR is scored only for games that start Basic Launch on or after 23 Nov 2026, so it counts for us**),
  docs.crazygames.com/requirements/game-covers (main character or big stylized title, title is the only text, no
  borders; preview video 15-20 s, opens on the static cover frame, **no black bars**, intense battles for action games),
  docs.crazygames.com/requirements/quality (reach gameplay quickly, visuals over text), and the Basic Launch rule that
  only some metrics passing means improve and request another Basic Launch.
- Played: `dist/portal` served locally, headless Chromium 1280x720 and 390x844, cold start, then 7 min of scripted play
  (random A/D/W, Space held in bursts, Q, F; not a skilled human) against the default `normal` bot. Read: portal/App.tsx,
  menu/MainMenu.tsx, ArenaGame.tsx result screen, sim/constants.ts, roster.ts. Viewed both covers (3 sizes) and both
  preview videos (1 fps frame sheets plus a full frame).
- Not verified: real CrazyGames traffic, real phones, sound, a skilled first-timer. Impact numbers are my estimates.

## What a new player gets today

- **First 60 s.** Menu paints fast (good, light build). Play opens **Choose your fighter**, then `Fight as Hotfix` starts:
  two clicks and a lift ride before control. "One floor, no mercy" card, then the fight. Fights are fast and readable at
  desktop size; the first KO happens within ~10 s. Clicking the scene first (common on a portal iframe) drops menu focus,
  and Enter then does nothing.
- **First 10 minutes.** First to 5 KOs or 150 s: a match takes 45-90 s. Same rival every rematch (the random pick is
  kept), same floor, same five guns. The scripted player won some and lost most against `normal`; the result screen is a
  stat table and `Rematch (Enter)`. By match 4 everything the game has has been seen once.
- **Why they quit.** Nothing changes between match 1 and match 6, and nothing is earned; one arena, one opponent per
  session; the fighters are ~7 % of screen height at 1280x720 (smaller on phones), so the action reads small.
- **Why they would come back tomorrow.** Nothing today: only the last fighter and settings are saved. No level, ladder,
  unlocks, stats history or daily goal.
- **Covers.** A fighter standing idle on the roof with the logo. Follows the "main character + title" rule, but an idle
  pose with no rival and no gun in use reads as a character viewer, not Action. Hotfix (orange on navy) is the stronger of
  the two; Legacy's green on navy is muddy at thumbnail size.
- **Preview videos.** Landscape: the whole office in a wide static shot, fighters ~50 px tall of 720, a `X IS OUT`
  banner on ~half the frames. At hover-preview size the fighters are a few pixels. Portrait: the same landscape frame
  letterboxed over a blurred copy, the game fills ~25 % of the frame; this breaks the "no black bars" rule in spirit and
  shows nothing. Neither opens on the cover frame.

## Ranked changes (top 3 first: 1-2 days together)

### 1. The Climb: floors 1 to 42 as a bot ladder, saved (Playtime, D1) - M

The title already promises it: you are fighting your way up to floor 42. This is the single change that turns a bot
match into a session and a reason to return. Expected impact: playtime +4-6 min per session, D1 +4-6 pts.

- **Structure.** Floor N = one match vs one bot on the existing arena. Beat it to unlock floor N+1. Progress, best floor
  and stars saved (see #3). Menu `Play` becomes `Climb · Floor 7` (sub: `Rival: Legacy · Normal`) and starts that floor
  directly (fighter = last picked, change it from Fighter). Free play vs a chosen bot stays under Fighter.
- **Ramp (data table, no new systems):**
  - Floors 1-3: `easy`, first to **3** KOs, rival = the three other fighters in turn.
  - Floors 4-10: `easy` -> `normal` from floor 6, first to 3 until floor 7, then first to 5.
  - Floors 11-25: `normal`, first to 5; every 5th floor (15, 20, 25) is a **modifier floor** (below).
  - Floors 26-41: `hard`, first to 5; modifier on 30, 35, 40.
  - Floor 42: `hard`, first to 7, rival = random, all guns spawn top tier. Clearing it: `You own floor 42`, a gold badge
    on the menu, `platform.happytime()`.
- **Modifier floors (sim rule toggles that already exist as tuning values):** `Rockets only` (every floor gun is a
  rocket launcher), `Rail day` (sniper rail only), `Low gravity` (jump x1.3), `Pistols only` (no floor guns),
  `Double push` (Force Push cooldown halved), `Bomb rain` (ceiling vents drop bombs x3). One per modifier floor,
  named on the floor card.
- **Stars.** 1 star = win, 2 = win by 2+ KOs, 3 = win without being KO'd more than once. Stars show on the floor list;
  replaying a cleared floor for stars is allowed.
- **Lose.** `Retry floor 7` is the focused default (Enter); no lives, no lockout.
- **Floor card (replaces the "One floor, no mercy" card in Climb):** the lift display `▲ 7` large (existing ▲ 42 lift
  style from the lobby), rival name in their accent, difficulty word, modifier name if any. 1.6 s, then FIGHT.
- **HUD plate:** in the Climb the top plate reads `FLOOR 7` instead of `FLOOR 42 open office` (same style); the floor-42
  match keeps today's plate.
- **Between floors:** the existing lift-door transition with the counter rolling up `7 -> 8` (0.8 s). This is the
  signature moment; keep it short.
- Acceptance: a fresh profile starts on Floor 1 vs an easy bot, first to 3; clearing it goes to Floor 2 with the lift
  roll; reload keeps the floor; floors 1-3 take 45-70 s each.

### 2. Covers and preview videos that show a fight (CTR) - S-M

Expected impact: CTR from likely bottom half to top 30-20 % of Action (estimate; A/B test on CrazyGames).

- **Covers (three sizes, one composition):** title lockup as today (it is good), no other text. Two fighters, large,
  mid-action, in the real office (not the roof): Hotfix left mid-jump firing the pistol toward camera-right, Intern or
  Legacy right being hit by a **Force Push**, back against the glass wall with the crack star visible, a few glass shards.
  Fighters fill 50-60 % of the frame height (today ~45 % for one idle fighter). Camera lower and closer than gameplay,
  slight three-quarter. Warm desk light on the fighters, city night behind (keeps the yellow/navy identity; no neon).
  Real in-engine render of posed rigs; no damage numbers, no HUD.
- **A/B second cover:** a rocket mid-flight between the two fighters with the blast lighting the floor.
- **Preview video (15 s):** 0-0.5 s the static cover; then a **video-only follow camera** framing both fighters with
  fighters at 25-35 % of frame height (engineering: a capture mode, `?capture` or a dev flag, never in the shipped
  game's defaults); content: a Force Push into the glass, a rocket jump, a railgun shot through a desk, two KOs, the
  `FLOOR 42` match point. Portrait: a native 2:3 capture with the same follow camera (crop the arena around the
  fighters), **no blurred bars**. No cursor, no hint bar, no text overlays.

### 3. Profile, stats and unlocks saved in the portal cloud (D1) - M

Expected impact: D1 +2-3 pts on top of #1 (progress that survives a cleared browser or another device).

- Floor 42's platform adapter has no `storage` yet (LCS's has one). Add the same `KeyValue` over the CrazyGames data
  module, localStorage on the web. One JSON `f42.profile`: `{ v:1, floor, bestFloor, stars:{[floor]:0-3}, wins, kos,
  matches, fighter, cosmetics:{unlocked:[], equipped:{}}, daily:{...}, streak:{days,lastDay} }`.
- **Unlocks on floors** (colourways of existing rigs, no new meshes; each fighter keeps their silhouette and accent
  family): floor 5 Hotfix `Night shift` hoodie, 10 Legacy `Mainframe` cardigan, 15 Standup `Sprint` jacket,
  20 Intern `First day` beanie colour, 25 / 30 / 35 / 40 one each in a second colourway, 42 `Gold badge` (gold lanyard
  badge on any fighter). Shown in Fighter as swatches under the stats; locked ones show `Floor 15`.
- Menu: under the logo, `Floor 7 of 42` with a 42-step thin bar (gold fill), no label above it.

### 4. Daily floor and daily goals (D1) - M

Expected impact: D1 +2-3 pts.

- **Daily floor:** one special match per local day, seeded by the date: a random rival, bot level by the player's best
  floor, one modifier from #1. Reward: a star toward a weekly cosmetic (7 daily stars = one colourway).
- **Three goals a day** from a fixed list: `Win 2 floors`, `KO with a rocket`, `Force Push a rival into the glass`,
  `Win without dashing`, `Land 3 railgun hits`, `Win with Legacy`. Progress across matches; a `Today` card on the menu
  with `2/3` and `New goals in 7 h` when done. A finished goal flashes gold on the result screen. No pop-ups.

### 5. Result screen that pulls you upward (Playtime) - S

- Win: big `Floor 8 unlocked`, stars earned animating in, primary `Next floor (Enter) →`, secondary `Replay for stars`.
- Loss: primary `Retry floor 7 (Enter)`, one line of help from the match, the first that applies:
  `Use the desks: bullets stop at furniture.` (if you took > 70 % of your damage on open floor - else)
  `Force Push sends bullets back.` (if you never used Q) / `Grab the gold ring: a better gun.` (if you never picked a gun).
- Keep the stat table but shrink it to three rows (KOs, Damage, Accuracy); move Best streak and Times down into a
  collapsed `More` on phones.

### 6. Camera closer to the fight (Conversion, Playtime) - M

- Today the camera shows the whole office; fighters are ~7 % of a 720 px frame and smaller on phones. Add a framing
  camera that keeps both fighters and 3 m around them in view, zooming between 1.0x (full office, today) and 1.6x when
  fighters are close, eased (0.6 s time constant, no zoom pumping: only change zoom when the needed framing differs by
  > 10 %). On phones (portrait and landscape) default to the framing camera; desktop default framing too, with
  `Camera: Full office` in Settings > Camera for players who prefer today's view.
- Acceptance: at 844x390 and 667x375 a fighter is never under 60 px tall in close fights.

### 7. One-click start and robust menu focus (Conversion) - S

- With #1, Play starts the next floor immediately (no fighter screen first time; fighter = Hotfix, changeable in Fighter).
- Clicking anywhere on the menu background must not drop the menu's keyboard focus: Enter always activates the
  highlighted item.
- First match ever: skip the rules card, show the three key glyphs `A D move · W jump · Space shoot` over the arena for the
  first 6 s (fade at the first shot); the full hint bar from match 2 on.

### 8. Rival variety inside a session (Playtime) - S

- Outside the Climb, Rematch currently keeps the same rival forever. After a win, the next rematch picks a different
  rival (not your own fighter) unless one was chosen explicitly. Cheap variety until more arenas exist.

## Floor 42 bot-only now, or hold for online?

**Hold the submission until #1 (The Climb), #2 (covers and video) and #7 ship, about 2-3 days of work, then submit
bot-only. Do not wait for online.**

- As it is today, a one-arena, one-bot match loop with nothing saved will not reach 10 min average or 10 % D1; the
  likely outcome is a failed Basic Launch, and a failed first test hurts the title more than a few days' delay.
- Online would not fix it: Basic Launch sends a limited audience, so quick match queues would be empty most of the time,
  and an empty queue is worse for conversion than a good bot. Online helps after Full Launch, not before.
- With The Climb the game has a goal the title already promises (get to floor 42), short early matches that convert,
  and a saved number to return to. That is the minimum honest shot at all four KPIs.

## Must not change

The art direction (low-poly/voxel office, yellow on dark UI, no cyberpunk or neon city), the lobby v2 work, the sim's
determinism (all Climb rules are match-setup inputs), the light build size.
