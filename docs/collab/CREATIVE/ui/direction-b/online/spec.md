# Online screens in Field Day (R-032)

Status: **ready for engineering** (Creative Director, 2026-11-28). Branch `online-bots` at f251b2a (browser bot by default + standby offer).
Rules that apply on top of this file: `../spec.md` (Direction B), `../colour-balance.md` (60/30/10, one sun per screen, selected = grape-2, fighter accents only for fighters, tomato only for KO and errors).

Source of truth: `index.html` (18 frames, 1280x720 design px). Renders: `png/<id>.png`. Re-render: `node render.mjs` in this folder (layout check: `layout-check.txt`, 0 issues at the last render).
Before shots (the real build, dev `?lobbyState=` switch, 1280x720, captured by the CD this turn): `before/lobby-*.png`, `before/hud-unstable.png`.
Fighter pictures in the mockups are crops of the live 1P select screen (`_src/p-*.png`); in the build use the same portrait renders as select / home (`vsPortraits.ts`). `o12`, `o17`, `o18` are the real build's HUD / result screenshots with the new parts drawn on top (marked `data-layer`), not paint-overs of the whole screen.

---

## 0. Problems first

1. **The old lobby is a different game.** Office 3D scene with desk and monitors, the old "▲ 42" logo, navy panels, a red-on-navy "RIVAL FOUND", raw `WebSocket connection failed` shown to players, and online now plays OFFSITE. Nothing of it is kept: the lobby is rebuilt on the Field Day frame (section 2). `before/lobby-invite.png`: the invite panel also overflows its box at 1280x720 (Cancel row cut at the panel's bottom edge).
2. **A quick match that silently becomes a bot match is the biggest honesty risk**, and f251b2a adds a path that does exactly that: when no server answers, `go()` starts the browser bot with no message (`BOT_MODE === 'client'` branch in the catch). The player thinks online worked. Fix in 3.4 (state `bot-offline`): it must say so.
3. **"Playing a bot while we look"** (the coordinator's wording): with the server bot it would have been false (the room locks, the search stops). With f251b2a it is true only in a narrow sense: you stay on standby and a free player is offered **after** the bot match, never during it. The copy says exactly that and never "we'll swap you in" (3.3, o08).
4. **The 30 s "quiet" suggestion is dead logic.** `isQuiet(elapsed)` in `QuickPanel` can never show: the bot comes at 8.5 s. Delete it (F-077).
5. **Room codes are case-sensitive** (`AbC12`). Read out loud ("capital A, small b…") that fails. The look below handles it (letter-spaced, "read it out with the capitals"), but the right fix is engineering's: an uppercase 5-character code without 0/O/1/I/L that maps to the room id. Recommended, not blocking (R-033 if engineering agrees).
6. **"CONNECTION UNSTABLE · direct · 0 ms"** (`before/hud-unstable.png`) contradicts itself: a red alarm next to a perfect number. The ms leaves the warning (7.2).
7. **Result vs a bot says "ZUZU WINS!" with no bot mark** (`_src/bot-3-full-match-result.png`). Online, where players expect people, the bot must be marked there too (8.1).
8. Not mine, seen on the way: the result screen's `Support us` pill uses a tomato heart and tomato border. Tomato is KO and errors only (F-082, low).

## 1. Decisions

| # | Question (R-032) | Decision | Why |
|---|---|---|---|
| D1 | Lobby look | Rebuild on the Field Day frame: blurred OFFSITE poster, title, left action column, right **face-off**: your card vs a RIVAL card | One picture tells the whole story: you, and who you'll fight. The rival card is the search status (mystery → bot → person), so the state is readable without reading |
| D2 | Primary action | QUICK MATCH is the one sun. INVITE A FRIEND, JOIN WITH A CODE are white | Most players want a fight now. Invite is a second, deliberate path |
| D3 | "Play vs bot" in the online menu | **Removed** from the menu. Bot appears only in errors and in the invite wait | Home PLAY is already "vs bot"; quick match itself falls back to a bot; a third bot door was noise |
| D4 | Search status | A 3-step tracker (NEAR YOU · NEXT REGION · BOT BACKUP) + elapsed clock + a fuse bar that fills to the bot moment | Honest and predictable: the player sees how long until the bot, and that the bot is a backup |
| D5 | Bot label | Approved: `BOT · NORMAL` chip, never `RIVAL`. Plus: the bot's lobby card says `PLAYED BY A BOT`, the VS doors read `BOT · NORMAL`, the result card gets a `BOT · NORMAL` chip | Every surface a player could screenshot says BOT |
| D6 | "VS BOT" before the countdown | Yes: the same VS doors as offline, tags `YOU` vs `BOT · NORMAL` (already true for the browser bot via `VsRun`), and for a human `YOU` vs `RIVAL` | One hand-off for every match type |
| D7 | Online loading screen | **Retire `LiftLoading` for online.** Online human matches use `VsRun mode="load"` like offline. No tips on online loading | The office tips are false on OFFSITE; the doors already carry progress; a second loading look is inconsistency |
| D8 | Ping readout | Bottom-right corner pill group, signal bars + `42 MS`. Bands by bar count only, no colour. Mode (Server / Direct / Relay / you host) never shown to players; it stays in the `title` tooltip | Players read bars and ms. "Direct / TURN / relay" is engineering vocabulary |
| D9 | Ping bands | Accept engineering's: ≤ 60 good (3 bars), 61-100 ok (2), > 100 slow (1). Use the median of the last 2 s; change band only after crossing the edge by 10 ms (hysteresis) | Stops a pill that flickers between 2 and 3 bars at 60 ms |
| D10 | Connection unstable look | White chip top-centre `SHAKY CONNECTION · MOVES MAY LAG`, 1 tomato bar pulsing; no ms | Says what the player feels, without the contradiction of problem 6 |
| D11 | Standby offer (f251b2a) | White card `A PLAYER IS FREE!` with a sun `FIGHT THEM [F]`; while it shows, REMATCH turns white (focus unchanged) | The offer is the reason they came online; the sun follows the best action. Enter still does what has focus (REMATCH by default), so nobody is pulled into a human match by a mash |

## 2. The lobby frame (shared by o01-o11)

All values in 1280x720 design px, scaled by the existing Field Day `Stage` (uniform scale, same as select / home).

| Part | Value |
|---|---|
| Backdrop | `menu-poster.webp` (OFFSITE), `inset -24px`, `filter: blur(7px) saturate(1.05) brightness(.92)` (= `.bg-poster.soft` of `../index.html`); left scrim `linear-gradient(90deg, rgba(38,18,74,.55) 0, rgba(38,18,74,.30) 36%, rgba(38,18,74,0) 52%)`. **No 3D lobby scene** (`LobbyScene` / office) on this route |
| Back | `.btn.w.sm` (52 high) at (24, 24): back icon + `BACK` + `[ESC]` keycap. During search, connecting and found it is hidden (the panel's CANCEL is the one way out) |
| Title | Titan One 52, white, `.ol` outline 3.5 / drop 5, centred, top 30. Text per state (table 3) |
| Left column | x 64, width 452. Menu: buttons. Other states: one paper panel (`.panel`: #FFFBF0, 4 px grape border, radius 28, drop `0 8px 0` grape) top 150, width 452, height per frame; ribbon centred on its top edge (`top -30`, height 56, Titan 26, padding 0 34) |
| Face-off | Your card 240x340 at (628, 120), rotate -3°. Rival card 240x340 at (952, 120), rotate +3°. VS disc 92 Ø at (864, 262), white, 4 px grape, `inset 0 -7px 0 #D9CFEE, 0 6px 0 grape`, Titan 40 grape `VS`, rotate -6°. Rays (`.rays`, sun-hi / sun, mask radial 22 % → 68 %) 540 Ø at (640, 20), opacity .5 (menu, search), .85 and 12 s per turn on RIVAL FOUND, .3 on errors |
| Card | white, 4 px grape border, radius 22, drop `0 8px 0` grape, overflow hidden. Photo 196 high (portrait on the fighter's wash), bottom border 4 px grape, `inset 0 -6px 0 <accent>` = the 4 px accent band. Name Titan 34 grape at (16, 212). Role Baloo 800 13, tracking 1.2, grape-2 at (16, 252). Tag chip at (14, bottom 16) |
| Your tag | `.chip` grape fill, white text: `YOU` |
| Mystery card | fill `--mist` #E6DEF5; photo = 135° stripes #EFE9FA / #E6DEF5 (14 px), a white outlined `?` Titan 150 (outline 5, drop 7) centred; name Titan 34 grape-2; during a search the `?` rocks ±4° (1.4 s alternate) and a white sweep crosses the photo every 1.6 s |
| Fighter picker (menu only) | Under your card at (636, 492): 4 head discs 52 Ø (4 px grape border, drop 4) 12 apart, keycaps 1-4 under them (8 gap). Picked: `outline 4px #5A3596, offset 3px`, lifted 4 px, scale 1.08 (grape-2, not sun: colour-balance 8.2). Click or 1-4 picks; the card swaps with a 200 ms flip (rotateY 0 → 90° → 0, `--ease-out`) |
| Aim | Menu only, at (64, 506): label `AIM` Baloo 800 12 white (2 px grape drop) + segmented `AUTO-AIM | MOUSE` (`.seg`, selected = #5A3596 + white, as Settings 8.2). Same setting as Settings › Aim |
| Hint strip | `.hints` centred, bottom 20: menu `[1]-[4] Fighter · [ENTER] Quick match · [ESC] Back`; code row `[ENTER] Join · [ESC] Close` |

One sun per frame (checked on every render): o01 QUICK MATCH · o02 JOIN · o03 none · o04-o06 the active step dot · o07 RIVAL FOUND! ribbon (event) · o08 none · o09 COPY LINK · o10 TRY AGAIN · o11 QUICK MATCH · o15 COPY THE LINK AGAIN · o16 NEW ROOM · o18 FIGHT THEM (REMATCH turned white).

## 3. States and copy (every string, exact)

`…` is the single ellipsis character. Player-facing copy only; no "WebSocket", "region id", "TURN", "relay", "authority".

### 3.1 Menu (o01) and code row (o02)

| Element | Copy |
|---|---|
| Title | `PLAY ONLINE` |
| Sun button (lg, 96 high, Titan 36 (R-034: 38 did not clear the ENTER keycap in 452 px), bolt icon, `[ENTER]`) | `QUICK MATCH` |
| Promise pill under it (`.pill`, BOT in sun) | `A player near you. Nobody free? A BOT steps in.` |
| White md button 1 (two lines: Titan 24 + Baloo 800 13 grape-2) | `INVITE A FRIEND` / `Send a link. No bot, ever.` |
| White md button 2 | `JOIN WITH A CODE` / `Got a code or link from a friend?` |
| Rival card | name `RIVAL`, role `WHO'S NEXT?` |
| Offline (browser offline): QUICK MATCH + INVITE + JOIN disabled (`.is-disabled`: fill #B9B3C9, text #5A5274), pill text | `You're offline. Bot matches on the home screen still work.` |
| Portal build (no invite): hide INVITE and JOIN, keep QUICK MATCH and the pill | — |
| Code row (replaces the 3 buttons in place; ribbon) | `JOIN WITH A CODE` |
| Line | `Type the code or paste the link your friend sent.` |
| Field (52 high, 3 px grape, radius 14, Baloo 800 28, tracking 5; focus = white + grape double ring) placeholder | `Code or link` |
| Small line (R-034, F-087; codes are case-free since R-033) | `5 letters or numbers. Small letters work too.` |
| Sun | `JOIN` `[ENTER]` (disabled grey until the field has text) |
| White sm | `CLOSE` |
| Joining (panel line while connecting with a code) | ribbon `JOINING…`, line `Getting you into your friend's room.`; full frame in F-085 (code well, hug height, rival card role `KNOCKING…`) |

### 3.2 Connecting (o03)

Title `QUICK MATCH`. Ribbon `WARMING UP` (multi-region probe or first contact).
- 0-1.5 s: line `Finding the fastest server for you.` (multi-region) / `Reaching the game server.` (one region).
- After 1.5 s still connecting (cold Fly machine): line `Waking up the game server.` + small `It naps when nobody's playing. A few seconds, tops.`
- Fuse bar fills with the real elapsed share of the 6 s warm-up. CANCEL `[ESC]` (white sm).

### 3.3 Searching (o04-o06) and found (o07, o08)

Panel ribbon `FINDING A RIVAL`; elapsed clock Titan 60 grape at (28, 46) (`0:02`, from the press, as today's `useElapsed`); status line Baloo 800 20 grape at (184, 52), right 24.

Step tracker at (28, 130), rows 16 apart: dot 36 Ø + title Titan 18 + sub Baloo 700 13 grape-2.
- Dot states: **now** = sun fill, 3 px grape border, a sun pulse ring (0 → 12 px, 1.2 s, ease-out, infinite); **waiting** = white, 3 px dashed #8C84A3; **skipped** = #D9D3E6 fill, 3 px #8C84A3, title #5A5274; **done** = grape fill, white check. The BOT row's dot carries the bot icon.
- Region names: `fra` → `EUROPE`, `iad` → `US EAST`, `sin` → `ASIA`, `syd` → `AUSTRALIA`, `gru` → `SOUTH AMERICA`; unknown id → the id upper-cased. One region: hide the NEXT REGION row and drop the region name (`NEAR YOU`).

| Leg (`LegKind`) | Status line | Row subs (near · next · bot) | Rival card |
|---|---|---|---|
| `home` | `Looking for a player near you.` | now `The fastest connection for you` · waiting `Only if it's still quick to reach` · waiting `Nobody free by about 0:09? A BOT plays you` | `?` rocking, role `SEARCHING…` |
| `fallback` | `Nobody near you yet. Checking next door.` | skipped `Nobody free` · now `Still quick to reach from you` · waiting (same) | same |
| `bot` (multi) | `Nobody free right now. A BOT is on its way.` | skipped · skipped · now `A player can still grab the seat first` | `?` + chip `BOT INCOMING` (white, bot icon) |
| `bot` (one region, today) | `Looking for a player. Nobody by about 0:09? A BOT steps in.` | (two rows) now `NEAR YOU` / waiting `BOT BACKUP` | `?` rocking |

`0:09` is `ceil(BOT_DUE_MS / 1000)`; read it from `MATCH_TIMING`, never hard-code.

Fuse bar at (28, 312), right 46: 20 high, 3 px grape, radius 999, track mist, fill #5A3596 = elapsed / `BOT_DUE_MS`, capped at 100 %; a 34 Ø white disc with the bot icon sits on the right end. Under it (small): `Bar full = the BOT steps in.` CANCEL `[ESC]` white sm at (28, 384).

**Found a player (o07, `linking`)**: ribbon turns sun `RIVAL FOUND!` (Titan 26 white outlined); line `A player from Europe is in. Shaking hands…` (region name from the leg; one region: `A player is in. Shaking hands…`); the tracker collapses to the matched row (done) with sub `Matched. Doors close in a moment.`. Rival card flips (rotateY, 360 ms, `--ease-out`) to the rival's fighter: name, role, chip `RIVAL` (grape fill, white). Rays go to opacity .85 and 12 s per turn. Sound: the existing `menuSound.confirm()` chime. No cancel.

**Bot steps in (o08, `localBot`)**: ribbon grape `A BOT STEPS IN`; line `Nobody free yet, so you're playing a BOT.`; small `It runs on your device: zero lag. We keep looking, and if a player frees up we offer them after this match.` (only when a standby room exists). Rival card flips to the bot's fighter, role `PLAYED BY A BOT`, chip white `BOT · NORMAL` with the bot icon. Hold 900 ms, then the doors.

**Bot because the server is down (`bot-offline`, the silent branch of problem 2)**: same frame, ribbon `A BOT STEPS IN`, line `Online isn't answering, so it's you vs a BOT.`, small `Nothing here goes online. Try QUICK MATCH again after this match.` Hold **1600 ms** (they must be able to read it), then the doors. No standby, so no offer later.

### 3.4 Invite (o09)

Title `INVITE A FRIEND`. Back = `CANCEL [ESC]` (closes the room). Ribbon `YOUR ROOM IS OPEN`.
- Line: `Send this to your friend. The match starts the moment they open it.`
- Code well (mist, radius 18, padding 12/18): label `ROOM CODE` (Baloo 800 12, tracking 2, grape-2) over the code Baloo 800 44, tracking 7, grape; right side small `Read it out` / `or send the link` (R-034, F-087).
- Link field (read-only, 52 high, Baloo 700 15 grape-2, ellipsis; selects all on focus).
- Sun md `COPY LINK` (copy icon, 220 wide, Titan 22) → for 1.5 s: `COPIED!` with the check icon, same sun; `aria-live` says `Link copied`.
- White md `SHARE` (share icon, 160 wide), only when `navigator.share` exists; share text `Fight me in PEWFIELD`.
- White sm `BOT WHILE YOU WAIT` (bot icon): opens the offline bot as today (`botHref`). Leaving the room is implied by the navigation, so it is not a sun.
- Rival card: name `FRIEND`, role `NOT HERE YET`, chip white with clock `WAITING 0:41` (elapsed since the room opened).
- Friend joins: same as o07 with line `Your friend is in. Shaking hands…` and the card's chip `RIVAL`.

### 3.5 Lobby errors (o10, o11)

Error ribbon: `--tomato` #F0533A fill, lip #B8321C, white Titan outlined text (large text, white on tomato 3.5:1 ≥ 3:1; the grape outline carries it). Rival card falls: rotate 12°, at (944, 150), photo greyscale, names in #5A5274.

| Case (engineering trigger) | Ribbon | Line | Small | Buttons (first = sun, focused) |
|---|---|---|---|---|
| Server down / can't connect (`error`, not joinFailed) | `CAN'T REACH ONLINE` (plug icon) | `The game server isn't answering. It may be down, or your network is blocking it.` | `Bot matches don't need the server. They work right now.` | `TRY AGAIN` · `PLAY VS BOT` |
| Lost connection mid-search (`onLeave`, before a match) | `LOST THE CONNECTION` | `The line to the game server dropped while we were looking.` | same | `TRY AGAIN` · `PLAY VS BOT` |
| Room gone / link old (`joinFailed`) | `THAT ROOM IS GONE` | `This link is old, or the match already started without you.` | `Ask your friend for a fresh link, or jump into a quick match.` | `QUICK MATCH` · `ENTER ANOTHER CODE` |
| Room full (if engineering can tell it apart) | `THAT ROOM IS FULL` | `Two players are already in there.` | same as above | same |
| Old page vs new server (protocol refused) | `NEW VERSION OUT` | `PEWFIELD just got an update. Reload to play online.` | — | `RELOAD` · `BACK` |

The technical detail (`WebSocket connection failed` etc.) is **never** shown as a line. Show a short code in #5A5274 Baloo 700 14 at the panel's foot, `Code: E-WS · for support` (E-WS socket, E-JOIN join failed, E-VER version, E-LEFT lost); put the full text in `title`. Card copy on errors: server down `NOBODY` / `NO SIGNAL` (plug icon in the photo); room gone `FRIEND` / `ROOM CLOSED`.

## 4. Found → VS hand-off (timeline from the `start` message)

| t (ms) | Human (`playing`) | Bot (`localBot`) |
|---|---|---|
| 0 | RIVAL FOUND! frame (o07), chime | A BOT STEPS IN frame (o08) |
| 360 | rival card flip done | flip done |
| 900 (bot-offline: 1600) | doors close: `useVsTo` slam, same as offline | same |
| then | `VsRun mode="load"` with `vsTags`: `['YOU', 'RIVAL']` (add a `'online'` kind to `vsTags`) | `['YOU', 'BOT · NORMAL']` (already so) |
| loaded | ding, doors open, countdown | same |

Arena ribbon on the doors: `OFFSITE` (from `start`). Role pills: `<ROLE> · YOU` and `<ROLE> · RIVAL` / `<ROLE> · BOT NORMAL` as offline. Reduced motion: no flip (cross-fade 150 ms), doors as offline reduced.

**Loading (D7):** delete the `LiftLoading` branch for `online`; online human matches go through `VsRun mode="load"` with the same 4 load steps as progress. The office tips are not shown anywhere online. If the first frame takes longer than 4 s after the doors shut, show one `.pill` under `FIRST TO 5` on the doors: `Syncing with your rival…` (no percentage, no tips).

## 5. In-match (o12-o16)

### 5.1 Ping pill (o12, o13)
- Place: the bottom-right corner group, after `AIM` and `SHAKE` (desktop) / in the touch group at top-right; it follows the existing `cornerLayout` row/stack/hide rules.
- Look: `.netpill` 27 high, padding 1/12, radius 999, `rgba(38,18,74,.86)`, Baloo 800 12, tracking 1, cream #FFF3D6 text (≈ 13:1 on the pill over sand). Signal bars: three 4 px wide bars 5/9/13 high, 2 apart, radius 1.5, lit = cream, unlit = cream at 25 %.
- Text `42 MS` (integer, the median of the last 2 s). Bands D9. No colour change between bands.
- `title` / `aria-label`: `Round trip 42 ms` + the mode in words for the curious (`· server`, `· direct line`, `· relay`); `you host` is dropped.
- Browser-bot match: **no pill** (there is no network). Server-bot (`NEXT_PUBLIC_SERVER_BOT=1`): the pill shows as for a human.

### 5.2 Shaky connection (o12)
- Shows when `net.unstable` has been true for ≥ 300 ms; stays ≥ 2 s after it turns false. Not during pause or the result.
- Place: centred, top 154 (under the arena line pill; when that line has faded, same place).
- Look: `.warnchip` 36 high, white, 3 px grape, radius 999, drop `0 4px 0` grape, Baloo 800 15 grape, tracking .8; leading bars with 1 lit bar in tomato (`--tomato`, non-text 3.5:1 on white), the bars pulse to 35 % opacity at 1 Hz (reduced motion: no pulse). Enter: 200 ms fade + 6 px drop; leave: 200 ms fade.
- Copy: `SHAKY CONNECTION · MOVES MAY LAG`. Nothing else (no ms, no mode).

### 5.3 Pause request (online)
Chip centred at top 154 in the warnchip shape, no bars, clock icon: `YOUR RIVAL WANTS A PAUSE · PRESS ESC TO AGREE` (touch: `· TAP PAUSE TO AGREE`). Replaces the gold slab.

### 5.4 Rival's connection dropped (o14)
Blurred match + tint .5 (as pause b08). Paper panel 520 wide centred, grape ribbon `ON HOLD`. Line `Your rival's connection dropped. The match is frozen while they get back.`; countdown Titan 72 grape `0:08` (`dropLeft`); small `Nothing counts while it's on hold.` No buttons (behaviour unchanged).

### 5.5 Rival left / still not back / link expired (o15, o16)
Same panel shape. Invite rooms (link exists):
- Left: ribbon `YOUR RIVAL LEFT`; line `Holding the room. They can come back with the same link.`; clock Titan 64 `0:52` (`waitLeft`); last round adds small `Last wait. After this the link closes.`; sun `COPY THE LINK AGAIN` (→ `COPIED!` 1.5 s); white `LEAVE` `[ESC]`.
- Still not back (asking): ribbon `STILL NOT BACK`; line `Keep the room open another minute?` (last: `One more minute? After that the link closes.`); sun `KEEP WAITING` (last: `WAIT ONE LAST MINUTE`); white `LEAVE` `[ESC]`.
- Expired: tomato ribbon `LINK EXPIRED`; line `Your rival didn't come back, so the room is closed.`; small `Open a new room and send a fresh link, or find someone new.`; sun `NEW ROOM`; white `QUICK MATCH`.
- Portal build (no links): drop the link lines/buttons; left = `YOUR RIVAL LEFT` / `Waiting a moment in case they come back.` + white `LEAVE`.
- Quick-match room (no link to share): ribbon `YOUR RIVAL LEFT`; line `They're gone. Find someone new?`; sun `QUICK MATCH`; white `BACK TO MENU`. (Built this way, accepted in R-034.)

### 5.6 Graphics lost (`glLost`, all modes)
Not online-only, but the same dark slab: paper panel, grape ribbon `GRAPHICS PAUSED`, line `Your browser stopped drawing the game. Reload to jump back in.`, small `This match starts over.`, sun `RELOAD`.

## 6. Result vs the bot, and the standby offer (o17, o18)

- **BOT chip** (`o17`): on the bot's podium / participation card, the same chip shape as the `YOU` tag, white with the bot icon, `BOT · NORMAL`, rotated with the card (-4° on the winner card). Online browser bot and server bot both; recommended offline too (same truth).
- **Offer card** (`o18`, `localBot.offer`): white paper card 380x150, radius 24, 4 px grape, drop 8, rotate 2°, at (872, 384) on 1280x720 (right of the podium, below the right medal slot, clear of the title, the button row and the medals; the loss balloon may tuck behind its left edge, intended). Never at the top: engineering's placeholder covers the title (`docs/online/shots/standby-1-offer.png`). Title Titan 24 grape `A PLAYER IS FREE!`; small `Fight them next instead of the BOT.`; sun md (56 high, Titan 22) `FIGHT THEM` `[F]` with the bolt icon. While the card shows, REMATCH renders `white` (keeps focus, keeps Enter). Enter: drop from 24 px above with `--ease-spring` 420 ms + the `confirm` chime once.
- After FIGHT THEM: the button turns white, disabled, `CONNECTING…`; on success the o07 → doors flow (from the result screen: doors close over it). If the human is gone: card text `They just got snapped up.` / `Rematch the BOT or search again.`, button white `SEARCH AGAIN`, REMATCH back to sun.
- Offer withdrawn (`offer` false before a press): the card leaves with a 200 ms fade, REMATCH back to sun.

## 7. Motion and sound (summary)
Card flip 360 ms `--ease-out`; `?` rock ±4° 1.4 s alternate; sweep 1.6 s; step pulse 1.2 s; fuse bar linear with time (no easing: it is a clock); rays 60 s / 12 s on found. Reduced motion: no rock, no sweep, no pulse (the now-dot keeps its sun fill), cross-fades instead of flips. Sounds: existing `menuSound` only (focus tok, confirm on found / offer, back on cancel, door slam).

## 8. Acceptance criteria
1. `/play` shows no 3D office scene, no `▲ 42` logo, no navy panel; `grep -rn "Desks and the meeting" src/components` finds no online use; online loading never mounts `LiftLoading`.
2. Each frame at 1280x720 has exactly the sun listed in section 2; matches `png/o*.png` in layout within a few px.
3. Every string in section 3-6 appears verbatim (tests on `legLine` / its replacement for the 4 leg rows, both region counts).
4. A quick match that ends in the browser bot shows o08 (or `bot-offline` when no server answered) for ≥ 900 / 1600 ms before the doors; HUD, VS doors, lobby card and result all say BOT.
5. Ping pill: bars 3/2/1 at 40/80/140 ms, no flicker at 58-62 ms (hysteresis); absent in browser-bot matches.
6. Shaky chip has no ms and stays ≥ 2 s.
7. `layout-check` (direction-b method) 0 issues on the built lobby at 1280x720, 907x510 and 800x450.
8. Contrast (WCAG 2.x, hex): grape on paper 12.74:1; grape-2 on paper 8.52:1; grape-2 on mist 6.77:1; #5A5274 on paper 7.02:1; grape on sun 8.52:1; cream on the 86 % grape pill ≈ 13:1; tomato bar on white 3.5:1 (non-text, ≥ 3:1).

## 9. Not verified
- Phones and portrait: the lobby frame is designed at 1280x720 only. Use the existing portrait rule of `OnlineLobby` (panel docks to the bottom, face-off scales above it); engineering screenshots needed at 390x844 and 844x390.
- The live search with real legs and real timing (seen only through `?lobbyState=` forced states and the engineering shots; no server was run this turn).
- f251b2a's offer and browser-bot flows were read in the diff, not seen running.
- 1920x1080 renders, colour-blind mode, gamepad focus order in the code row.
- Region display names assume the ids in the matchmaking doc; any other id falls back to upper-case.
