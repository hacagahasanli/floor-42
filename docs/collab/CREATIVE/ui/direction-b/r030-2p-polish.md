# R-030: 2P key card, 2P result lock, HUD pills at small sizes

Status: decided (Creative Director, 2026-11-28). P0, upload today. Rules: `spec.md` (Direction B) + `colour-balance.md` (60/30/10, one action colour, fighters own their colours, 8.5 grape P1/P2 tags). F-items: F-070 (key card), F-071 (result lock), F-072 (pills).

Evidence:
- Key card mockup: `keycard/keycard.html` -> `keycard/keycard.png` (1280x720, Chromium 1255, real Titan One + Baloo 2 files, `node keycard/render.mjs` also runs a safe-area/clip check: 0 real issues; the one flag is the full-width title box, whose text is centred). Background = a real 1280 fight frame blurred under the `.fd-veil` tint; the cards are hand-built HTML, not the live component.
- Pills: real build, portal-build dev server, `shots/r030/pills.mjs` -> `shots/r030/pills-<size>-built.png` / `-stacked.png` + the numbers in section 3.

## Problems first

1. **The key card is the only old-theme screen a 2P player meets** (`shots/colour-balance/impl2/keycard-2p.png`): navy panels, grey translucent keycaps, cream-on-navy small text, the fighter name in accent-coloured text. It sits between the Field Day select screen and the Field Day HUD, so the theme flips dark for 5-20 s and back. It also hides the one thing a new pair needs to read: *which key is my Shoot*. The ready line shows `P1` / `P2` chips with no key on them.
2. **2P rematch fires before the result has been seen.** In 2P, Shoot is both the fight key and the rematch key, and both players are mashing it at the final KO. A 0.6 s lock lets them leave at ~0.86 s (QA s8): the winner title (0.75 s) has barely landed, the awards (1.4-1.8 s) never show. The result is the owner's showpiece (spec section 4); in 2P it is skipped almost every time.
3. **Hiding AIM/SHAKE during the key strip** removes the aim-mode pill exactly in the first matches, when a new player is most likely to wonder why aiming works the way it does. Not a blocker, but a cheap layout fix exists and is measured below.

## 1. 2P key card in Field Day (F-070)

Mockup: `keycard/keycard.png` (state shown: P1 ZUZU ready and holding F, P2 BRIX not ready). It reuses the select-2p vocabulary on purpose, so the key card reads as the next step of the same screen: grape header bar with the fighter's foot strip, paper body, white `Press <key> when ready` bar that turns into the sun `READY!` slab.

### 1.1 Structure and exact values (1280x720 design px; render it in the Field Day `Stage` so it scales like every other `.fd` screen)

| Element | Position / size | Style |
|---|---|---|
| Backdrop | full screen | `.fd-veil` (`rgba(38,18,74,.5)`, blur 8 px, brightness .9). Replaces `bg-ink-deep/85 backdrop-blur-sm`. |
| Title | centred, top 22, line 56 | Titan One 44 px, white, the title outline (4 px grape outline + 5 px drop, as the `2 PLAYER` title). Copy below. |
| Hint pill | centred, top 88, h 34, padding 0 18, radius 17 | fill #3b1f6b, Baloo 2 700 15 px white |
| Two cards | top 134, w 520, h 420, x 100 and 660 (gap 40) | fill `--paper` #fffbf0, 4 px #3b1f6b border, radius 26, drop `0 7px 0 #3b1f6b`, overflow hidden |
| Card header | h 60 (inside the border), padding 0 22 | fill #3b1f6b, `box-shadow: inset 0 -6px 0 <fighter accent>` (the fighter's foot strip, as select-2p). Left: `PLAYER 1` / `PLAYER 2` Titan One 26 white. Right: a 16 px accent dot with 2.5 px white border, 8 px gap, fighter name Titan One 22 **white** (was accent text: the dot carries the accent now) |
| Key cluster | starts 80 below the card's top edge, centred, 30 px between the move cross and the action block | as today: P1 = cross left + F G H / V right; P2 = K L ; / M left + arrows right. Action block sits 44 px lower than the cross top (Shoot row level with the cross's middle) |
| Keycap (`BigKeycap`) | 52 x 48, gap 8 horizontal, 10 vertical | fill #ffffff, 3 px #3b1f6b border, radius 10, `box-shadow: inset 0 -5px 0 #d9cfee, 0 4px 0 #3b1f6b`, Titan One 22 #3b1f6b (arrow glyph 22 px, stroke 2.6, currentColor) |
| Keycap lit (held) | same box, `translateY(3px)` | fill `--sun` #ffc83d, `box-shadow: inset 0 -5px 0 #e08a00, 0 1px 0 #3b1f6b`; text stays grape. 75 ms. Sun is allowed: a momentary event (colour-balance 8.2) |
| Key label | 5 px under the cap | Baloo 2 800 12 px, uppercase, letter-spacing .6 px, #5a3596 (`--grape-2`, 8.52:1 on paper) |
| Tester line | 286 below card top, centred | Baloo 2 700 14 px `--gray-ink` #5a5274 (7.0:1 on paper) |
| Status bar, not ready | inset 18 left/right, 20 from the card bottom, h 62, radius 16 | fill #ffffff, 4 px #3b1f6b border, drop `0 5px 0 #3b1f6b`; Baloo 2 800 19 px grape: `Press [key] to fight`; the inline key is a `.fd-kc`-style cap 34 x 32, 3 px grape border, radius 8, Baloo 2 800 17 |
| Status bar, ready | same box | fill `--sun`, `box-shadow: inset 0 -6px 0 #e08a00` (no drop: pressed in, as select-2p READY), check icon 26 px + `READY!` Titan One 30 white with the 3 px grape outline |
| Warning pill | centred, top 574, h 34 | fill #3b1f6b, Baloo 2 600 15 px white; the path `Settings → Controls → 2 Player` in 800 white (no sun: it is not an action) |
| Hint strip | centred, top 664, h 38 | the existing `HintStrip`: `[ENTER] start now` `[ESC] back` |

Sun marks on screen: one READY! slab per ready player (the "picked thing" rule, as select-2p) and lit keys while held (momentary). Nothing else is sun. No player colours anywhere (8.5); the only hue besides grape/sun is each fighter's accent in its own header strip and dot.

### 1.2 Copy

| Where | Start mode | View mode (Pause > Controls) |
|---|---|---|
| Title | `BOTH PRESS SHOOT TO FIGHT` | `2 PLAYER KEYS` |
| Hint pill | `Shoot is the key next to your hand. Push is next to that. Dash is the far one.` (unchanged) | same |
| Tester line | `Hold your keys. They light up.` | hidden |
| Status bar | `Press [<that player's Shoot key>] to fight` -> `READY!` | hidden (the card shrinks to fit: no empty band at the bottom) |
| Warning pill | `A key stays dark? Your keyboard can't take that combo. Change it in Settings → Controls → 2 Player.` | hidden |
| Hint strip | `[ENTER] start now` `[ESC] back` | `[ESC] back` |

The key in the status bar is the player's own Shoot binding through `useKeyLabel` (F / ; by default, the AZERTY label when remapped). A player on a gamepad: `Press [X] to fight` (the pad's Shoot glyph from `PAD_ROWS`).

The old `P1` / `P2` ready chips and the `or Enter` line go: the status bars carry ready state, the hint strip carries Enter. Keep `data-testid="ready-0"` / `ready-1` + `data-ready` on the two status bars, and `key-card`, `key-half-p1` / `key-half-p2` on the root and cards.

### 1.3 Pad half

Same card. The five pad caps (`Stick Move`, `A Jump`, `X Shoot`, `B Push`, `RB Dash`) in one centred row, same 52 x 48 keycap (min-width 52, padding 0 10 for `Stick`), Titan One 18 for the glyphs. Lit rule unchanged.

### 1.4 Motion and sound

- In: veil fades 120 ms (`.fd-veil`), cards drop with `.fd-drop` (260 ms spring), P2's card 60 ms after P1's.
- A player readies: the status bar swaps to the sun slab with a 160 ms pop (scale .96 -> 1.04 -> 1), `menuSound.confirm()` as today.
- Both ready: **hold 250 ms** with both READY! slabs showing, then `onStart()`. Enter starts at once (no hold).
- Reduced motion: no drop, no pop; 120 ms fade only.

### 1.5 Small windows

Uniform `Stage` scale like the other Field Day screens (at 800x450, s = .625). Drop the old `max-height:560px` compaction rules. Acceptance at 1280x720, 821x462 and 800x450: the layout check used for the other screens reports 0 issues; nothing outside the 12 px safe area.

### 1.6 Acceptance

1. Screenshot at 1280x720 matches `keycard/keycard.png` within 4 px and the same tokens (state: P1 ready + F held, P2 waiting).
2. No `bg-ink`, `text-cream`, `panel-cut`, `PlayerChip` player colour or `#e6ebf5` left in `KeyCard.tsx` / `BigKeycap`; no `PLAYER_COLOURS` in the card.
3. Fresh-press rule, Esc/Enter capture and view mode behave as today; testids above still pass the existing tests.
4. Send screenshots: start mode (none ready, one ready + a key held), view mode from Pause, pad half, 800x450.

## 2. 2P result: Shoot rematch lock (F-071)

**Decision: in 2P the Shoot+Shoot rematch opens when the buttons are on screen, not at 0.6 s.**

| Mode / input | Opens at | Why |
|---|---|---|
| 2P, Shoot (P1) + Shoot (P2) | **2.2 s** after the cut (`BEATS.choice`, when REMATCH and its P1/P2 chips bounce up), or **at once when the reveal is skipped** (Enter / Space -> final layout), but never before 0.6 s | The chips that show who pressed live inside the REMATCH button. A press counted before that button exists is invisible input. By 2.2 s the winner, loser box, score tiles and all 3 awards (1.4 / 1.6 / 1.8 s) have landed. |
| 2P, Enter / Space | unchanged: skips the reveal before 2.6 s, REMATCH after | A deliberate key, not the fight key |
| 1P vs bot, online | unchanged, 0.6 s | Shoot is not a rematch key there; Enter is deliberate; the buttons are not clickable before 2.2 s anyway |
| Reduced motion | 0.6 s (the final layout is up after the 300 ms fade) | |

Rules that stay: a Shoot press before the lock opens is thrown away; a Shoot held at the moment the lock opens needs a fresh press (`stepBothPress`).

Implementation hint (engineering's choice): export `SHOOT_REMATCH_AT_MS = 2200` beside `INPUT_AT_MS`, and let the result screen report `choiceUp` (step >= choice, including a skip) so `useBothPress` opens on `choiceUp && t >= 600`.

Acceptance: QA s8 rerun (mash Shoot through the KO, 2P, 821x462): no rematch before 2.2 s unless Enter skipped; the 3 award medallions are visible in a frame taken just before the rematch fires. Mash for 3 s then stop, press once: rematch fires on that press.

Cost accepted: two players who want to go again at once wait 1.6 s more than today, or press Enter to skip. The result screen is 2.2 s of the reward loop, not a wall.

## 3. HUD AIM / SHAKE pills at small sizes (F-072)

**Decision: stack, do not hide.** When the pills in a row would touch the visible key strip or hint, switch the corner group to a column: `flex-direction: column; align-items: flex-end; gap: 6px`, AIM on top, SHAKE below, same bottom-right anchor (`bottom-3 right-3`). Hide only if the stacked column would still clash (the current `useClearOf` rule as the fallback).

Measured on the real build (portal-build dev server, Chromium 1255, 1P fight, key strip up, stacked layout injected as CSS, `shots/r030/pills.mjs`):

| Viewport | Strip right edge | Row pills left edge (built) | Stacked column box | Clear gap to strip |
|---|---|---|---|---|
| 907x510 | 704 | 696 (clash, hidden) | 791-895 x 440-498 | **87 px** |
| 821x462 | 637 | 610 (clash, hidden) | 705-809 x 392-450 | **68 px** |
| 800x450 | 621 | 589 (clash, hidden) | 684-788 x 380-438 | **63 px** |
| 1280x720 | 994 | 1069 (no clash, row) | not needed | row stays |

Frames: `shots/r030/pills-800x450-stacked.png` viewed: both pills whole, right-aligned, clear of `ESC Pause`, nothing over the fighters' HP or the score. The column is 58 px tall and sits over the arena floor in the bottom-right corner, where the row already sat.

Implementation: decide from the row geometry (row clashes -> stacked; then measure stacked; still clashes -> hidden). Keep the decision stable while the strip is up (no flip-flop on re-render): re-evaluate only on resize and when the strip/hint appears or goes. Touch and 2P layouts unchanged (2P centres its pills; not in scope).

Acceptance: at 907x510, 821x462, 800x450 in the first match with the strip up, both pills visible and stacked, 0 overlaps (s9 rerun); after 2 KOs (strip gone) they return to the row; 1280x720 unchanged.

## 4. Not verified

- The key card was not built in the live component: the mockup is static HTML over a real frame. Pad half, view mode and 800x450 for the key card are specified, not rendered.
- The bomb hint (`hud-hint`) with stacked pills: no frame with the hint was captured; the fallback (hide) covers a clash.
- The 2P result timings come from `ResultScreen.tsx` `BEATS`, not from a timed capture.
- Phones, colour-blind mode, a real two-person playtest of the longer lock.
