# Direction B "Field Day": UI spec (R-021)

Status: **ready for engineering** (2026-11-28, CD). Supersedes the B mockups in `../fun-directions/dir-b/`, which stay as history and must not be built from.
Source of truth: `index.html` (every screen is a 1280x720 frame). Renders: `png/1280/*.png`, `png/1920/*.png`, overview `overview.png`, idle motion clip `home-idle.webm`, automated layout report `layout-check.txt`. Re-render: `node render.mjs` in this folder.

**Placeholders, do not ship as-is:** fighter names are "FIGHTER 1..4" and their roles are derived from today's stats (R-022 will replace names, roles and maybe accents). The wordmark is a swappable slot that shows the current name (R-023). Fighter pictures in the mockups are crops of real renders (VS doors and `shots/offsite/fighter-*-close-sand.png`). In the build they are live 3D renders or render-to-texture. Match backdrops are real captures from `shots/offsite-r3/` (`shooting`, `wide-start`), and the menu backdrop is the clean OFFSITE poster from the same capture run (`public/menu-poster.webp`, captured by `shots/offsite-r3/capture-poster.mjs`). Stats and award numbers in the result mockups are sample data.

---

## 0. What was wrong with the B mockups (R-019 dir-b) and how each bug was fixed

| # | Screen | Bug | Fix |
|---|---|---|---|
| 1 | Home | The "42" sat on top of the "R" of FLOOR, so the wordmark collided with itself | The wordmark is a flex row with a 10 px gap, bottom-aligned, `white-space: nowrap`, and it auto-scales to fit its slot (§3.1) |
| 2 | Home | The speech bubble's tail and the fighter card overlapped the sunburst disc and each other. The card was clipped by the disc | Removed the 2D card from home. The real 3D fighter stands in the scene, with a bubble beside the head and a nameplate under the feet. Rays are not used on home (they cannot sit between the 3D backdrop and the fighter) |
| 3 | Home | The "1 / 4" pager was off-centre between its arrows and the "‹ ›" glyphs sat low | The pager is one flex row: arrow button, nameplate, arrow button, with `space-between`. The arrows are SVG icons, not text glyphs |
| 4 | Home | The stat chips were wrong for that fighter, and the settings icon looked like a sun | Roles come from `CHARACTERS` (speed, jump, airJumps, weight). The gear is a real gear icon |
| 5 | Home | The footer text was 12 px white on sand, so contrast was poor. There were no key hints | The footer sits in a grape pill (cream on grape-deep, 15:1). A key-hint strip sits bottom-right |
| 6 | Home | No focus state was shown, so a keyboard user could not see where they were | PLAY shows the focus ring and a bouncing pointer (§2.2) |
| 7 | Buttons | The focus ring was white on cream, so it was invisible | The focus ring is a double ring: 4 px white inside 4 px grape. It reads on cream, sky, the arena and grape (proof on `b18-sheet-components`) |
| 8 | Buttons | Labels touched the outline ("REMATCH" edge to edge) | Padding is 0.42 x height on each side, and the checker requires at least 12 px of clear space each side |
| 9 | Buttons | Disabled was white text on grey (about 1.9:1) | Disabled uses grape text on grey (6.5:1) with a padlock icon |
| 10 | Buttons | The gloss was a hard band across the label, which made the text look washed out | The gloss is a separate rounded highlight drawn behind the label. Labels are always wrapped in their own element, so they render above it |
| 11 | HUD | Annotation text was baked into the game frame | Notes live only in this spec, never on screen |
| 12 | HUD | The P2 portrait showed only hair, with the face cut off | Portraits are framed on the head (a per-fighter head anchor), §3.6 |
| 13 | HUD | Chips were 12 px, and "PUSH 2s" was white on grey (low contrast) | Chips are at least 12 px Baloo 800, grape on sun or grey (8.5:1 and 6.5:1) |
| 14 | HUD | The KO feed was off-centre (left 478) and used emoji | The feed is centred under the score and uses weapon silhouette icons, not emoji |
| 15 | HUD | There was no key strip and no respawn panel | Both exist (`b06`, `b07`) |
| 16 | Result f2 | The podium ran off the bottom of the screen, the PARTICIPATION box was clipped and covered by the caption, and the loser card floated 60 px above its box | Podiums stand on a running-track strip that is part of the layout. Each card stands on its box, and nothing is clipped |
| 17 | Result f2 | The "5 – 2" tiles were misaligned (the scaled tile dropped off the baseline) | The tiles are a flex row aligned on centres, and the loser tile is smaller by size, not by `scale()` |
| 18 | Result f3 | The REMATCH label and ENTER keycap overflowed the button | The button sizes to its content (inline-flex), with the keycap inside the padding |
| 19 | Result f3 | The button row was centred on x 810, not the screen | The row is a centred flex row (verified) |
| 20 | Result f3 | Award labels had different heights, "4 / bullets" left an orphan, layout was 2 left and 1 right, and icons were emoji | Awards are a column of 3 rows of the same height, with rosette SVGs and one-line descriptions. A stats card on the right balances them |
| 21 | Result f3 | The balloon was not attached to anything and "PARTICIPATION" was 11 px | The balloon string is tied to the box corner, and the label is at least 12 px |
| 22 | Result f1 | "AND THE WINNER IS…" was off-centre (left 300) | The ribbon is centred |
| 23 | All | Confetti was drawn over titles and buttons | Confetti renders behind all UI text (z-order: rays, confetti, track, content) |
| 24 | Copy | There was developer and office-joke copy ("PER MY LAST EMAIL" etc.) | Awards are renamed to field-day words (§7). There are no developer words anywhere |
| 26 | Home, Result (owner review 2026-11-28) | My first fix replaced the big fighter card with a small 3D fighter and the medallions with a list plus a stats table. The owner found both less fun | Restored the card in the sunburst (with every bug fix kept) and the scattered medallions. Stats moved behind Hold TAB |
| 25 | Fonts | Fonts loaded from the Google CDN | Fonts are self-hosted from `fonts/` (OFL), and the render fails visibly if they are missing |

---

## 1. Identity in one paragraph

A summer company **field day**: bunting, a running track, podiums, prize rosettes and a PARTICIPATION ribbon. Everything looks like **candy-plastic toys with a thick grape outline** that you could press. The sun-yellow button is always "do it now". **What makes it ours and not generic casual-mobile:** (1) the bunting string on menu screens, (2) bright round **award medallions** around the podium, (3) the **running-track** strip under the podium, (4) the **PARTICIPATION** box and the sad balloon for the loser, and (5) the grape ink colour (not black) on every outline. If a new element does not fit "something you would find at a sports day", it does not belong.

## 2. Foundations

### 2.1 Scale and layout
- Design frame **1280x720**. UI scale `s = min(viewportW / 1280, viewportH / 720)`. Every px value in this spec is multiplied by `s` (1920x1080 means s = 1.5, which is what `png/1920` shows).
- Anchors: HUD plates anchor to the top-left and top-right corners. The score anchors top-centre, the key strip bottom-centre, and modal panels the centre. Wider aspect ratios add space between anchors and never stretch components.
- Safe area: 12 px minimum and 24 px default from each edge (focus rings included). Phones in portrait are out of scope for this spec.

### 2.2 Tokens (CSS custom properties, exact)
`--grape #3B1F6B` (outline, ink) · `--grape-2 #5A3596` (secondary ink) · `--grape-deep #26124A` (pills at 86 % and scrims) · `--sun #FFC83D` / `--sun-lo #E08A00` (primary) · `--sun-hi #FFE38A` (rays) · `--tang #FF7A2F` / `--tang-lo #C2410C` (local) · `--teal #22C3A6` / `--teal-lo #0E8A74` (online, ready) · `--sky #4CB8FF` / `--sky-lo #1F7BC8` (move on) · `--tomato #F0533A` (KO) · `--track #E0603F` · `--cream #FFF3D6` · `--paper #FFFBF0` (panels) · `--mist #E6DEF5` (wells) · `--gray #B9B3C9` / `--gray-lo #8C84A3` (disabled). Fighter accents (unchanged from `roster.ts` until R-022): `--f1 #FF6A3D`, `--f2 #3DDC84`, `--f3 #3EC5FF`, `--f4 #FFD23F`.
- **Colour means:** yellow = do it now · sky = move on · white = back or change · orange = local · teal = online or ready · tomato = KO only.
- Measured contrast (WCAG): grape on paper 12.7, on sun 8.5, on mist 10.1, on white 13.2, on disabled grey 6.5; grape-2 on paper 8.5, on mist 6.8; cream on grape-deep 15.0; sun on grape-deep 10.7. White display text is never used without the grape outline.
- Risk flagged for R-022: `--f4` yellow is close to `--sun`. Fighter 4's accent must never be used on a button.

### 2.3 Type
- **Titan One** (display): logo, titles, buttons, names and numbers. `letter-spacing 0.5px`, `line-height 1`. White text always gets the outline: an 8-direction `--o` stroke plus a `--d` drop in grape (the `.ol` class in `index.html`), with `--o`/`--d` of 2.5/3 px at 20-30 px, 3.5/5 at 46 px and 4.5-5/6-7 at 62-78 px.
- **Baloo 2** 600/700/800 (UI text). Minimum 12 px (18 px at 1080p). Labels in caps use 800 with 1-2 px tracking.
- Scale: Display XL 62-78 (result title) · L 46 (screen titles) · M 20-30 (names, buttons) · body bold 15-17 · body 13-14 · label caps 12.

### 2.4 Shapes and components (all in `index.html` CSS, copy the values)
- **Button** `.btn`: height `h` (52 / 64 / 68 / 84-88 / 96), radius 0.34h, 4 px grape border, fill `--c`, inner lip `inset 0 -7px 0 --lo`, drop `0 7px 0 grape`. Highlight: a rounded white 42 % bar, 10 px from each side and 5 px from the top, 36 % of h tall, **behind** the label. Padding 0.42h each side, gap 10, icon 1.12 x font size. White buttons use grape text with no outline.
- **States:** hover = translateY -3, scale 1.05, rotate -1.5°, brightness 1.06, spring 180 ms. Pressed = translateY +5, scale 1.03/0.94, lip shrinks to 2 px, drop to 2 px, 60 ms. Disabled = grey plastic, grape label, padlock, and a press makes it wobble ±4° 3x over 300 ms. **Focus (keyboard or pad)** = ring at inset -12 px (-17 bottom, to clear the lip): 4 px white border + 4 px grape outer + 3 px grape inner, pulsing scale 1 to 1.025 over 1.2 s. On vertical menus the focused item also gets the pointer: a sun triangle 24x28 at x -46 that nudges 6 px every 0.8 s. Focus and hover can stack. Mouse hover never moves focus away from the keyboard item.
- **Panel:** paper, 4 px grape border, radius 28, drop 8. **Ribbon** (titles of modals): sun, 62 px high, radius 14, notched tails (SVG `#tail`), tilted -1.5° to -2°, and allowed to overlap the panel's top edge (the only intended overlap besides focus rings, podium cards and VS names).
- **Keycap** `.kc`: white, 2.5 px border, radius 7, drop 3, Baloo 800 13. Arrow keys are SVG chevrons, not text glyphs (Baloo has no arrows). A keycap that is listening for a key is sun-filled with the text "PRESS A KEY" and pulses. An empty binding is a dashed grey "+ ADD".
- **Chip** (HUD and status): 28 high (24 in the HUD), 3 px border, pill. **Pill** (info line): grape-deep 86 %, cream text. **Hint strip:** a pill holding keycap + verb pairs.
- **Toggle** 64x34, teal when on. **Slider:** 22 px track with a sun fill and a 30 px knob. **Segmented:** a pill with a sun "on" segment.
- **Score tile:** fighter accent fill, radius 18, a split-flap line at 50 % and a top gloss. **Award medallion:** a 92 px disc in the award colour, 4 px grape ring, lip and gloss, white sticker icon, with a label card under it (`medal()` in `index.html`). The rosette (`rosette()`) stays only as a small badge. **Podium:** sun (1st) or mist (PARTICIPATION), with an open bottom that stands in the track.

### 2.5 Icons
24 px grid, grape stroke of about 2.4, white fill, round joins ("sticker" icons). The set is drawn in `index.html` `<symbol>`s and shown on `b19`: play, 2P, globe, fighter, flag, gear, help, back, left, right, pause, sound, mute, check, lock, again, home, clock, keys and star, plus weapon silhouettes (pistol, smg, shotgun, rocket) and award icons (burst, jump). Engineering: export the symbols to `public/ui/icons.svg` as they are. No icon fonts, no emoji.

## 3. Screens (see the PNG with the same id)

| id | Screen | Must have | Notes |
|---|---|---|---|
| b01 | Boot / loading | Sky gradient, two drifting clouds, mesa silhouettes, sand; centred wordmark (s 1.25); progress pill 520x36 with moving sun stripes and a % label; one tip in a pill; studio pill bottom-left | Tips rotate every 4 s and must be true to the game |
| b02 | Home | 3D OFFSITE backdrop framed **without** the fighter (camera pans so the showcase fighter is off-frame or hidden); bunting; left scrim `90deg rgba(38,18,74,.62) 0 → .38 32 % → 0 54 %`; wordmark slot (§3.1); **arena ribbon** under the logo (tangerine, 44 high, -3°, text `★ <SELECTED ARENA NAME> FIELD DAY ★`, follows the arena pick and auto-fits like the wordmark); column 372 px at x 56, y 244: PLAY (96, focused by default) + "VS BOT · FIRST TO 5 KOs [ENTER]" pill; 2 PLAYER / ONLINE; FIGHTER / ARENA (equal halves); settings + HOW TO PLAY; **fighter card in a sunburst circle**: disc 372 Ø at (826, 62), 5 px grape ring, rays turning 1 per 60 s; card 252x356 at (887, 92), base tilt 3° plus an idle sway of ±1.5° (3.2 s), portrait = the VS-door portrait render (`vsPortraits.ts` path) on the fighter's door colour, name 32 white outlined, 3 trait chips (speed / jumps / weight, from stats); speech bubble left of the card (it never touches the card); pager ‹ [ROLE · n / 4] › under the card; mute button; studio pill; hint strip | Owner decision 2026-11-28: the big card has more pull than the small 3D fighter. Card over the disc is an intended layer |
| b03 | Fighter select 1P | Blurred backdrop + 38 % grape tint; BACK [ESC]; title; 4 cards 226x356, 26 apart, centred (photo 196 high on the accent colour, name, role · jumps, 3 pip rows); the selected card is lifted -12 px at scale 1.04 with the focus ring, a "YOUR PICK" chip and rays behind it; bottom row: BOT: NORMAL ‹ › (white) · FIGHT! [ENTER] (sun, 84) · ARENA (sky) | Pips: speed 7.6/9.0/9.4/10.6 → 1/3/4/5 · jump (incl. airJumps) → 2/3/4/5 · weight 0.8/0.92/1.0/1.38 → 1/2/3/5 |
| b04 | Fighter select 2P | Two panels 556x474: accent header with the player's keys; photo 200x280; name, role, pips; roster thumbnails (cursor = the player's accent ring + grape halo); status bar READY! (teal) or "Press [;] when ready"; VS medallion between the panels; waiting pill; hint strip for both players | When both are ready, the waiting pill becomes "Starting in 3" (sun) and counts down 3-2-1 |
| b05 | VS doors | Two accent doors split by a 14 px grape seam with a 4 px white core at about 10°; rays (20 s per turn) behind a 200 px sun VS medallion tilted -6°; arena ribbon top-centre; names 66 px bottom-left and bottom-right with role pills; "FIRST TO 5" pill | Keeps today's VS energy and timing; only the skin changes |
| b06 | HUD | Plates 372x94 in the top corners: portrait 66, name 22 + YOU/BOT tag, 5-segment health bar 290x22 (each segment = 20 HP, partial = clipped), chips weapon · DASH · PUSH (sun = ready, grey + seconds = recharging); score: two tiles 82x66 + white timer disc 78 + FIRST TO 5 chip; KO feed under the score; key strip bottom-centre | The HUD keeps the F-032 offsite scrim. Key strip: only when Settings › Key hints is on, and it fades out after the first 2 KOs of a match |
| b07 | HUD, you were KO'd | Your portrait greyscale with a tomato "KO" tag; health shows empty; respawn card bottom-centre: countdown ring (sun disc, white arc that drains), "BACK IN n…", "FIGHTER x got you with a WEAPON", one tip line; the rival's score tile squash-pops with a 6-piece confetti puff beside it (never on the digit) | The card sits over the floor band (F-039). The key strip hides while it shows |
| b08 | Pause | Blurred match + 50 % grape tint; panel 460x536; PAUSED ribbon; score well (portraits + 2 – 1); RESUME (focused), SETTINGS, HOW TO PLAY, QUIT TO MENU; 26 px gap so focus rings never touch | Online pause behaviour is unchanged (engineering owns the rule); only the skin changes |
| b09 / b10 | Settings | Panel 1152x568; ribbon; 5 tabs (active = sun); Controls: action list with 2 key cells each, a listening state and "+ ADD"; Aim segmented, Key hints toggle, 2 Player keys EDIT; RESET KEYS + DONE. Audio: 4 sliders (focused card has the ring), Mute toggle, DONE | Same tab and keyboard behaviour as `SettingsPanel.tsx`: [ ] / PageUp / PageDown switch tabs. Camera, Graphics and Accessibility reuse the same toggle, slider and segmented rows |
| b11 | How to play | Title + goal pill; 3 cards 340x306 (header in sky / tangerine / teal with diagonal stripes and the real keycaps; Titan heading; two lines); 2P keys pill; GOT IT! [ENTER] | Keys are read from the current bindings, not hard-coded |
| b12-b14 | Result (win) | §4 timeline. Final frame: title + score pill (score, accuracy, best streak); podium + PARTICIPATION on the track; **3 round award medallions scattered around the podium** (2 on the left, staggered, 1 on the right): disc 92 Ø in a bright colour with a gloss and a white sticker icon, label card 224x70 under it (Titan 18 title + one line), each tilted -3° to +3° and swaying ±1.5°; `[TAB] Hold for stats` pill top-right: holding Tab (or the pad's View button) shows the full stats card (KOs, damage, accuracy, best streak, times down) over the right side, and releasing hides it | Owner decision 2026-11-28: no report-style list or table on the main view |
| b15 | Result (loss) | Same layout. Your card is on PARTICIPATION with a "YOU" chip and an orange balloon. Lighter rays (opacity .55). Subtitle "4 – 5 · so close! · one more?". REMATCH is still the largest object | Never mocking: no "LOSER" word, no laughing |
| b16 | Rematch (online) | Over the result: tint 50 %; panel 600x400; REMATCH? ribbon; two slots (YOU READY! teal chip; RIVAL "DECIDING… 0:12" sun chip with a clock); CANCEL [ESC] focused; info pill | Local and bot matches skip this screen: REMATCH starts at once |
| b17 | Credits | Bunting; panel 700x452; CREDITS ribbon; A GAME BY / SOUND / FONTS / BUILT WITH (sound credit copied from `Credits.tsx`); BACK | Add new credits as sections of the same shape |

### 3.1 Wordmark slot (R-023)
Box 420x118 at home (x 40, y 58), scale 1.25 on boot. Two words: a white word at 60 px and an accent word at 104 px in sun, tilted -4° inside a block tilted -3°. If the name is wider than the slot, scale the whole wordmark down to fit (never wrap, never shrink below 0.6). The stress test is on `b19`. A one-word name uses only the big sun style.

### 3.6 Portraits
Circular portraits are framed on the head. The mockup uses `headBg()` with head anchors per fighter. In the build, render each fighter's head and shoulders from the VS-door camera to a 128 px texture once per session (or ship 4 PNGs), so HUD, pause, rematch and stats use the same image.

## 4. Result timeline (the showpiece). `t` from the final KO's hit-stop end

| t (s) | Beat | What happens | Sound |
|---|---|---|---|
| 0.00 | Cut | The match freezes and blurs to 8 px over 200 ms, with a 15 % grape tint | whoosh down |
| 0.00-0.30 | Drumroll | The "AND THE WINNER IS…" grape ribbon drops from y -80 to 40 (spring 400/18) | snare drumroll 0.3 s |
| 0.30 | Impact | Rays scale 0 → 1 and start spinning (1 turn per 60 s). The starburst pops. The winner card pops scale 0 → 1.25 → 1.18 (spring, 220 ms), tilted -5°. Confetti cannons fire from both lower corners: 34 pieces, life 2.6-4.4 s | pop + party horn |
| 0.45 | (frame b12) | | |
| 0.60 | Input on | REMATCH and Enter work from here. Enter or Space at any time before 2.6 skips to the final layout (300 ms ease-out) | |
| 0.75-1.05 | Land | The ribbon is replaced by the title "FIGHTER x WINS!" (letters pop 25 ms apart, scale 0 → 1.15 → 1). The track slides up from below (250 ms). The card shrinks and flies onto podium 1 (350 ms ease-out, squash 1.06/0.94 on landing) | thud on landing |
| 1.05-1.30 | Loser | The PARTICIPATION box slides in from the right (200 ms). The loser card drops onto it, tilted 9°, desaturated 45 %. The balloon floats up on its string. The score tiles 5 – 2 stamp in, and the loser tile shrinks 1 → 0.74 | slide-whistle down |
| 1.30 | (frame b13) | | |
| 1.40-2.20 | Awards | The layout settles into its final positions (cards to the smaller podium, 300 ms). 3 medallions drop from -60 px, 200 ms apart (left-high, left-low, right), each landing with a squash of 1.08/0.92 and a 6° wobble | 3 rising "ding"s |
| 2.20-2.60 | Choice | The buttons bounce up from +40 px, 60 ms apart: REMATCH first (focused), then NEXT ARENA, then CHANGE FIGHTER | soft pop each |
| 2.60+ | Idle (frame b14) | Rays keep turning. REMATCH bobs 4 px every 2.4 s and its shine sweeps every 4 s. The balloon sways ±4° over 3 s. Confetti thins to 14 pieces, then stops at 8 s | crowd murmur loop at -24 dB, stops at 8 s |

Loss: the same beats, with the kazoo "wah-wah" swapped in for the party horn, rays at opacity .55, and no confetti cannon on the player's side.

## 5. Liveliness layer (idle motion: always on unless Reduced motion is set)

| Element | Motion | Rule |
|---|---|---|
| Bunting (boot, home, credits) | Each pennant swings ±5° around its top, period 2.6 s alternate, with delays staggered 0.37 s per pennant | The string never moves; 24 pennants per 1280 px |
| Primary button | Bob 4 px (2.4 s sine) + white shine sweep every 4 s | Only on the one primary button per screen |
| Focus ring | Pulse 1 → 1.025 (1.2 s); pointer nudge 6 px (0.8 s) | |
| Rays | 1 turn per 60 s (menus and result) or per 20 s (VS) | Never on home (they would cover the 3D fighter) or in a match |
| Clouds (boot) | Drift 120 px over 40-55 s | |
| Fighter on home (3D) | Idle breathe (chest scale 1.02, 2 s) + a look-around every 6-9 s + a wave at 12 s if there is no input | Use the existing rig; no new animation rig needed beyond the wave. Engineering: report the cost |
| Speech bubble | Pops in 0.8 s after home appears (scale 0 → 1.1 → 1), stays 4 s, disappears, and returns with the next line 10 s later | Lines come from R-022 |
| Confetti | Only for: win (cannon at 0.30, a thinner rain until 8 s), a KO score pop (a 6-piece puff by the tile), and 2P "both ready" | Never on loss, never idle on menus |
| Loading stripes | 40 px per 0.8 s | |
| Screen transitions | Menu to menu: the old screen slides 40 px and fades out (150 ms), the new one springs in from 40 px (220 ms, spring 400/18). Menu to match: VS doors (unchanged timing). Match to result: §4. Any screen to pause: tint fades in 120 ms and the panel drops from -30 px with a spring | Nothing longer than 350 ms except the result reveal |

**Reduced motion** (Settings › Accessibility): no bob, shine, rays spin, bunting sway or confetti. Focus ring is static. Transitions become 120 ms fades. The result reveal collapses to its final frame in 300 ms.

**Motion curves:** `--ease-spring cubic-bezier(.34,1.56,.64,1)` (about 12 % overshoot) for pops and entrances; `--ease-out cubic-bezier(.22,1,.36,1)` for exits and slides; real springs (stiffness 400, damping 18) where a tween library is used.

## 6. UI sound personality
Toy-like, short, never harsh: the menu is a toy box, not a computer. Focus move = soft wooden "tok" (pitch +2 semitones per step down a list, reset after 1 s). Hover (mouse) = the same at -6 dB. Confirm = rubber "boop". Back = descending "bwip". Disabled press = "nuh-uh" kazoo blip. Toggle = click + spring. Slider = soft tick every 10 %. Tab switch = card flick. Countdown = woodblock per number with a whistle on GO. Result: drumroll, party horn, slide-whistle, dings (§4). Bus: all of this goes through the existing **Menus** volume slider. Peak at least 6 dB below gunshots. Sources: original recordings or CC0 only, credited in Credits.

## 7. Copy rules (no developer theme)
- No developer or office-joke words anywhere (merge, commit, bug, review, HR, deadline, email…). The tone is sports day plus friendly rivalry.
- Award pool (3 per match, chosen by the most extreme stat): **PIÑATA** (rockets taken), **BOOMERANG** (bullets reflected by Force Push), **BOUNCY CASTLE** (jumps), **SHARPSHOOTER** (accuracy), **IRON SPONGE** (damage taken and survived), **KING OF THE HILL** (time on one platform). Description format: "<Name> <did> <number> <thing>". Use "You" for the local player. The R-019 note still applies: engineering confirms which stats are cheap to track; until then, use KOs, damage, accuracy, best streak and times down.
- The loser box always says PARTICIPATION. The loss subtitle rotates: "so close! · one more?", "run it back?", "next one's yours".

## 8. Fonts and licences
- Titan One: Rodrigo Fuenzalida, SIL Open Font License 1.1, Reserved Font Name "Titan" (`fonts/OFL-TitanOne.txt`). Baloo 2: The Baloo 2 Project Authors (Ek Type), SIL OFL 1.1 (`fonts/OFL-Baloo2.txt`). The files in `fonts/` are the latin woff2 subsets served by Google Fonts. Self-host them, ship the two OFL texts in the build, and list them in Credits (done on b17). If you subset or modify Titan One further, do not ship it under the name "Titan".
- **Trade dress statement:** nothing here copies Brawl Stars, Fall Guys or Stumble Guys. There is no logo, font, icon, colour pairing, button shape or screen layout taken from them. Their games use other display faces (we use Titan One and Baloo 2), and our identity elements (grape ink outlines, bunting, running track, prize rosettes, PARTICIPATION box) are not their signature elements. Thick outlines, gloss and springy buttons are a genre convention, not anyone's trade dress. I did not do a legal review. Before launch, run `agents-know:ip-guard` (or a human check) on the built screens.

## 9. Acceptance criteria (engineering)
1. Every screen matches its PNG at 1280x720 and 1920x1080 within 4 px of position and the same tokens (screenshot compare).
2. Nothing overlaps unless listed as intended (ribbon over panel edge, focus rings, VS names over the fighters, cards on podiums, YOU chip). No text is clipped. Every element sits 12 px or more inside the viewport. Use `render.mjs`'s checks as the model for a Playwright test on the real UI.
3. Every interactive element shows the focus ring when reached by keyboard or pad. Tab order follows the visual order. Enter, Esc and arrows work as the hint strips say.
4. All text is at least 12 px at s = 1. Contrast meets §2.2.
5. REMATCH accepts input from t = 0.6 s. Enter skips the reveal. REMATCH is the largest button on win and on loss.
6. Reduced motion removes all idle motion as §5 says.
7. No developer-themed string appears anywhere (the R-022 copy pass is the list).
8. Fonts are self-hosted and the OFL texts ship with the build.

## 10. What was checked (CD, 2026-11-28)
Rendered all 19 frames with headless Chromium 1255 at 1280x720 and 1920x1080 (the same layout at UI scale 1.5) and looked at every PNG after the fixes. In each, I checked: overlaps, clipped text, alignment of rows and centring, contrast, focus visibility, crop of fighter faces, and leftover annotations. Automated (`layout-check.txt`): fonts loaded; text and icons inside each button, chip, keycap, pill, strip and ribbon, with at least 12 px of clear space each side in buttons; no text clipped by an overflow ancestor; every UI box and focus ring inside a 12 px safe area; no partial overlap between unrelated UI boxes. Result: **0 issues on all 19 frames.** Two rounds of fixes were needed. Round 1 raised 58 automated flags (most of them were the checker counting buttons placed on a panel as overlaps, so I taught it that full containment is intended; the real ones were 2 titles and 1 key strip outside the safe area and 2 titles colliding with BACK) and I found 14 more by eye (uneven home row widths, wrong portrait crops, invisible arrow glyphs, gloss over tab labels, a stray VS-card sliver, a gap under the podium, confetti over titles, a token sheet label colliding with a header, the wordmark stress test wrapping).
**Not verified:** the motion timings in a real build (only `home-idle.webm` shows idle motion, and the result timeline exists as 3 frames plus the table above); other aspect ratios and phones; sounds (none exist yet); screen-reader labels.
