# Colour balance (R-027): calm base, one action colour, fighters own their colours

Status: decided (Creative Director, 2026-11-28; section 8 added for R-028). Supersedes any colour choice in `spec.md` that conflicts with it. Applies to every Field Day screen (`src/components/fieldday/**`, menus in `src/components/menu/**` that use `.fd`).

Evidence: `docs/collab/shots/colour-balance/`
- `before/*.png` real build (portal-build 51eacbf; home-pewfield from rename-pewfield c551245), 1280x720, Chromium 1255 ANGLE Metal. Script `capture.mjs`.
- `after/*.png` the SAME build with this document's rules injected (`calm.css` + DOM recolours in `after.mjs`). Not a paint-over: every after frame is the live UI.
- `before-after-sheet.png` home, select, 2P, HUD (OFFSITE), result side by side. The two HUD frames are different moments of a live bot fight (the HUD chrome is what to compare, not the fighters).

## 1. Diagnosis (what makes it "qarışıq")

Counted by eye on the before frames (hue families in UI chrome + fighters, desert excluded):

| Screen | Saturated hue families on screen | What competes |
|---|---|---|
| Home | 8: sun, tang, sky, teal, pink, red (BRIX), cream, grape | PLAY (sun), 2 PLAYER (tang), FIGHTER/ARENA + arrows (sky), FAST (sky) / 2x JUMP (teal) chips, tang ribbon right under the tang FIELD ribbon of the logo, 6-hue bunting, solid sun rays |
| Select | 7: 4 fighter colours x 16 pips each, sun, sky, grape | 64 coloured pips make four equal-weight colour blocks; OFFSITE in sky competes with FIGHT! |
| 2P | 6: red + green header slabs, teal READY, sun VS, 4 face tiles | Header slabs are the largest colour areas on screen; teal READY sits next to ORMO's green (#14A37F vs #22C3A6: two near-identical greens meaning different things) |
| HUD | 5: pink + red (fighters), sun x5 chips, sun pill | Four sun DASH/PUSH chips pull the eye to the corners every time they recharge |
| Result | 8: teal, sky, tang medal discs, sun rays + podium, sky NEXT ARENA, sky balloon, tomato track, 6-hue confetti, winner red | Everything is celebrating at once, the medals and the button fight the winner |

Root causes:
1. **Colour encodes nothing.** 2 PLAYER is orange and FIGHTER is blue for no reason; a player cannot learn "blue means X". Four button tones (sun/tang/sky/teal) for what is two levels of importance.
2. **UI hues collide with fighter hues.** UI teal vs ORMO green, UI sky vs TAVO blue, tang/tomato/track vs BRIX red, bunting pink vs ZUZU pink. When the UI uses the fighters' colours, the fighters stop owning them.
3. **Sky-blue UI on a sky-blue desert sky** and orange UI on an orange desert: the chrome blends into the world instead of sitting on it.
4. **Decor is as saturated as action.** Bunting, rays, ribbons, confetti and the track are all at full chroma, so nothing is louder than anything else.

What is NOT the problem (keep): the grape outline + drop system, Titan One, chunky buttons, tilts, bunting shape, sunburst, podium, track, confetti. The energy comes from shape and motion; the noise comes from hue count.

## 2. The rule

**60 / 30 / 10, with one action colour.**
- **60 % world + paper.** The arena/desert and white/cream surfaces (cards, panels, secondary buttons, chips).
- **30 % grape.** The one structural colour: outlines, text, pills, keycaps, headers, ribbons, filled pips.
- **10 % SUN.** The ONE action colour: the single primary button per screen, the focused/picked thing (YOUR PICK, READY), the winner's celebration (rays, podium 1), "ready now" flashes. Persistent selected states inside a group (tabs, segments, toggles, sliders) are grape-2, not sun: section 8.2.
- **Fighter accents belong to fighters.** They may appear only where the thing IS that fighter or was done BY that fighter: the model, portrait backdrops, the card's accent band, the trait disc, HUD portrait ring / HP bar / score block, a medal ring for the award holder, the 2P header foot strip. Never on a generic control.
- **Orange (tang) is brand decor only**: the wordmark and the bunting. Never a button, chip or ribbon.
- **Max saturated hue families visible at once in UI chrome: 2** (sun + grape-family), plus the accents of the fighters on screen. Select is the one screen allowed all four accents, and only inside the portraits, trait discs and the 4 px card bands.

Test for any new element: "Is it the action? sun. Is it a fighter? that fighter's accent. Otherwise: white/cream with grape."

## 3. Token changes (`fieldday.css` `.fd { }`)

| Token | Before | After | Note |
|---|---|---|---|
| `--grape`, `--grape-2`, `--grape-deep` | unchanged | unchanged | structure |
| `--sun` / `--sun-hi` / `--sun-lo` | unchanged | unchanged | the only action colour |
| `--cream`, `--paper`, `--mist`, `--gray`, `--gray-lo` | unchanged | unchanged | surfaces / disabled |
| `--tang` / `--tang-lo` | #ff7a2f / #c2410c | unchanged values, **use limited to bunting + destructive confirm** (Settings reset confirm) | not a button tone any more |
| `--sky` / `--sky-lo` | #4cb8ff / #1f7bc8 | **delete** | no UI use left |
| `--teal` / `--teal-lo` | #22c3a6 / #0e8a74 | **delete**; add `--ok: #0e8a74` for tiny status marks only (net-good dot, key-saved note) | collided with ORMO |
| `--tomato` | #f0533a | unchanged, **only** the KO tag and errors | |
| `--track` | #e0603f | **#c9765c**; track lane line #ffe8c9 -> **#f1d9bf** | muted terracotta, still a running track |
| NEW `--btn2` / `--btn2-lo` | - | #ffffff / #d9cfee | = today's white tone; name it so every secondary button reads from it |

## 4. Per-component rules (one pass)

**Button (`Button.tsx`, `.fd-btn`)**
- `ButtonTone` becomes `'sun' | 'white' | 'warn'`. Delete `.fd-t-tang`, `.fd-t-teal`, `.fd-t-sky`. `warn` = tang, only for Settings "Reset all settings" in its confirm state (`SettingsPanel.tsx:468`).
- Exactly one `tone="sun"` per screen (PLAY, FIGHT!, REMATCH, GOT IT, the pause RESUME). Every other button is `white`.
- Replace: Home 2 PLAYER (tang), ONLINE (teal, site build), FIGHTER, ARENA, prev/next arrows (sky) -> white. Select OFFSITE/arena (sky) -> white. Result NEXT ARENA (sky) -> white.

**Chip (`parts.tsx` Chip)**
- Default fill white (unchanged). `stats.ts traitsOf` returns no `tone`; home FAST / 2x JUMP chips render white. The trait chip keeps its accent `TraitDisc` (identity).
- HUD DASH / PUSH: ready = white, grape text (was sun); cooling = fill #d9d3e6, text and border `--gray-lo` (was gray fill). On the frame a chip becomes ready: a 300 ms sun flash (fill `--sun` easing back to white) — sun as an event, not a state. Reduced motion: no flash.
- HUD FIRST TO N pill: white (was sun). MATCH POINT: sun (was tang). Bomb badge: white with the bomb icon (was tang).

**Ribbon (`parts.tsx` Ribbon)**
- Home arena ribbon: `color="var(--grape)" lip="var(--grape-deep)" tail="#26124A"`, label sun with no outline (`.fd-ol` off, `color: var(--sun)`). The wordmark keeps the only orange ribbon on the screen. Default Ribbon colour becomes grape; any sun ribbon must be justified as celebration (result winner ribbon is already grape: keep).

**Bunting (`Bunting.tsx`)**: `COLORS = ['#FFC83D', '#FFF3D6', '#FF7A2F', '#FFF3D6']` (sun, cream, tang, cream). Pink, teal and sky gone. `variant` still rotates.

**Sunburst**: home card halo uses the soft mask (`soft` true) at opacity 0.75 (was solid). Result rays unchanged (that is the celebration).

**Fighter select (1P)**: `.fd-pips` filled pip = grape for every fighter (was the accent). Keep: accent portrait wash, 4 px accent band, trait disc. YOUR PICK chip: white with grape check (sun only on the focus ring of the picked card).

**2 player**: header bar background grape (was the fighter accent), plus `box-shadow: inset 0 -6px 0 <accent>` as the fighter's foot strip; label stays white. READY! = sun with `--sun-lo` lip (was teal). VS disc = white (was sun). Face tiles keep their accents.

**HUD**: no change to the fighter-owned parts (portrait ring, HP bar, score blocks). Everything else neutral per Chip rules above. Trait callout pills keep the accent disc only.

**How to play (`HowToScreen.tsx`)**: card headers sky/tang/teal -> all grape with white titles (cards differ by icon and text, not hue). Not captured this turn; rule applies.

**Result**
- Medal disc (`.fd-res-disc`): fill white, icon grape, `box-shadow: inset 0 0 0 6px <holder accent>, inset 0 -9px 0 rgba(59,31,107,.12), 0 6px 0 var(--grape)`. Drop `colour` from `resultModel.ts` AWARDS; pass the holder's accent (`ROSTER[holder].accent`) as `--ring`.
- Balloon: #E6DEF5 (mist) for win and loss (was #9AD9FF / #FFB27A).
- Confetti (`confettiRules.ts`): `['#FFC83D', '#FFFFFF', <winner accent>, '#FFE38A']`; draw = sun, white, both accents.
- Track: new `--track` values above.

**Site/Next menus** using `.fd`: same rules; no exceptions.

## 5. PEWFIELD wordmark on home (rename-pewfield)

Verdict: **too small.** The art is about 272x118 while the PLAY button below is 372x96: the button out-weighs the name, and the tang "OFFSITE FIELD DAY" ribbon right under the tang FIELD ribbon reads as one orange smear.

Change (`HomeScreen.tsx`, `Wordmark`): slot 420x**160** (art height-bound, about **369x160**, i.e. the width of the menu column), at `left 34, top 34`. Arena ribbon (now grape, section 4) at `left 64, top 184`, height 44. Menu column `top 252`, `gap 16` (was 244 / 18), so the column ends where it does today (bottom of HOW TO PLAY about y 652, footer untouched). Boot screen keeps `scale 1.25` of the new slot only if it still fits 12 px safe area at 1280x720 — check it.

## 6. Acceptance criteria

1. `grep -rn "fd-t-tang\|fd-t-teal\|fd-t-sky\|--sky\|--teal\b\|tone=\"tang\"\|tone=\"sky\"\|tone=\"teal\"" src` returns nothing (except `warn` in Settings).
2. Each screen at 1280x720 has exactly one sun button; screenshots of home, select, 2P, HUD, result match `after/*.png` in colour (layout may differ by a few px).
3. No UI control uses a fighter accent; every accent on screen can be traced to a fighter shown there.
4. The bunting shows only sun, cream and tang.
5. HUD: DASH/PUSH ready vs cooling is readable in greyscale (white vs #d9d3e6 + gray text); check one frame desaturated.
6. Home (PEWFIELD): wordmark art >= 360 px wide; layout check 0 issues at 1280x720 and 1920x1080.
7. Not dull: rays, bunting swing, button shine, confetti and the trait callouts all still animate.

## 7. Not changed / not verified

- The 3D arenas, fighter models and accents: untouched (the desert is the 60 % base and stays).
- Not seen: phones, the office arena HUD, pause, settings, how-to, credits, online lobby, boot. The rules cover them; engineering should send screenshots.
- No player test of "calmer but still fun": this is the director's judgement against the owner's note.

## 8. R-028 follow-ups after the F-056 / F-057 build (2026-11-28)

Reviewed: every frame in `shots/colour-balance/impl/` (portal-build 11b6915) and `floor-42-rename/docs/collab/shots/colour-balance/impl-pewfield/` (rename-pewfield 3a4a61d) against `after/*.png`, plus the engineering LOG entry of 2026-11-28. Home, select, 2P, HUD and result match `after/` in colour. Four problems remain, listed first.

### 8.1 Problems found in the build

1. **Settings has four sun marks** (selected tab, AUTO segment, ON toggle, DONE) and the Audio sliders fill with sun too (`.fd-slider b`, not captured). The rule "the picked thing is sun" was written for a single pick per screen (YOUR PICK, READY). A settings panel has a dozen picks at once, so sun stops meaning "do this". Fix in 8.2.
2. **Cooling DASH/PUSH text is 2.42:1** (#8c84a3 on #d9d3e6). The same grey on white, the `+ ADD` empty keycap (`.fd-kc.fd-empty`), is 3.53:1. Both fail WCAG 1.4.3 (4.5:1). Fix in 8.3.
3. **2P UI still uses the player colours**: on the 2P result the `P1` tag (#ff4d4d, reads orange-red next to BRIX) and `P2` tag (#4d7cff, reads as the deleted sky) above the cards, `Tonight: P1 3 - 2 P2` in the same two colours, and the red `P1 ✓` chip inside the sun REMATCH. Red and blue are BRIX's and TAVO's accents (section 2). Fix in 8.5.
4. **Pennant on grape ribbons** reads as two white quote marks (home arena ribbon, Credits title ribbon): the grape stroke vanishes on the grape ribbon and only the two white triangles are left. **SHARPSHOOTER** pistol draws about 32x16 inside the 92 px medal: an empty white disc with a speck. Fix in 8.6.

### 8.2 Selected states: grape-2, not sun (Settings and any panel)

Rule added to section 2: **sun = the one action, or a momentary event. A persistent selected state in a group (tab, segment, toggle, slider value) is grape-2.** One sun per screen holds without exceptions: on Settings that is DONE.

| Component / state | Fill | Text / knob | Lip / inset | Ratio (WCAG) |
|---|---|---|---|---|
| Tab, selected (`.fd-tab` with the selected tone) | `--grape-2` #5a3596 | #ffffff, Titan One, no `.fd-ol` outline | `inset 0 -5px 0 var(--grape-deep)` #26124a, drop `0 4px 0 var(--grape)` | white on #5a3596 = **8.81:1** |
| Tab, unselected | unchanged (#ffffff, lip #d9cfee) | grape #3b1f6b | unchanged | 13.17:1 |
| Segmented, selected (`.fd-seg button[aria-checked='true']`) | #5a3596 | #ffffff | `inset 0 -3px 0 #26124a` | **8.81:1** |
| Segmented, unselected | transparent on #ffffff | #3b1f6b | none | 13.17:1 |
| Toggle ON (`.fd-toggle[aria-checked='true']`) | track #5a3596 | knob #ffffff, border #3b1f6b (unchanged) | unchanged inset shadow | track vs OFF track #b9b3c9 = **4.34:1** (non-text, 1.4.11 needs 3:1) |
| Toggle OFF | track `--gray` #b9b3c9 (unchanged) | knob left | unchanged | knob position is the second cue |
| Slider value fill (`.fd-slider b`) | #5a3596 | knob unchanged (white, grape border) | none | #5a3596 vs white track = 8.81:1 |
| Keycap listening (`.fd-kc.fd-listening`, PRESS A KEY) | **sun, keep** | grape | unchanged | it is a momentary event, allowed |
| DONE | sun (the one action) | unchanged | unchanged | |

Greyscale check (luma 0.299/0.587/0.114): selected #5a3596 = 75, unselected white = 255, toggle OFF #b9b3c9 = 183. Selected reads as the dark one in every group. The focus ring (white + grape double ring) is unchanged and still marks keyboard focus separately from selection.

Not sun anywhere in Settings except DONE and a listening keycap. `warn` (tang, "PRESS AGAIN TO RESET") is allowed beside DONE because it only exists during the confirm.

### 8.3 Contrast: cooling chip and empty keycap

New token `--gray-ink: #5a5274` (a darker step of `--gray-lo`, same hue family). `--gray-lo` #8c84a3 stays for borders, lips and dashed outlines only, never for text.

| Component / state | Fill | Text | Border | Text ratio |
|---|---|---|---|---|
| HUD DASH/PUSH ready (`.fd-chip`) | #ffffff | #3b1f6b | 3px #3b1f6b | 13.17:1 |
| HUD DASH/PUSH cooling (`.fd-chip.fd-cool`) | #d9d3e6 (unchanged) | **#5a5274** (was #8c84a3) | 3px **#8c84a3** (unchanged) | **4.98:1** (was 2.42:1) |
| Empty keycap `+ ADD` (`.fd-kc.fd-empty`) | #ffffff | **#5a5274** | 3px dashed #8c84a3 (unchanged) | **7.26:1** (was 3.53:1) |

Ready vs cooling in greyscale, three cues: fill 255 vs 215, border 48 vs 138 (the strongest, a 90-step difference), plus the cooling chip's seconds label (`PUSH 2s`). Text alone is 48 vs 88, so the border carries the state, not the text. The 300 ms sun flash on becoming ready is unchanged.

Ratios computed with the WCAG 2.x relative-luminance formula, sRGB hex values as above, no alpha. The HUD chip text has no text-shadow inside the chip; if one is added the ratio only rises.

### 8.4 Home PEWFIELD: the ribbon tuck is intended

The arena ribbon tucked under the wordmark slot is deliberate: wordmark + ribbon read as one lock-up (the `after/home-pewfield.png` look, and the impl frames match it). Do NOT move the ribbon.

Layout check: whitelist exactly this pair, `wordmark` slot x `arena-ribbon`, on home only, with a bound: vertical overlap of the two boxes <= **20 design px** (measured today: ribbon box top 175.8 vs slot bottom 194 = 18.2 px, because of the -3 degree tilt), and horizontal overlap anything. Any other overlap with the wordmark, or this one above 20 px, is still an issue. Criterion 6 of section 6 then reads "0 issues with the lock-up whitelist".

Accepted as built: art 369.2 x 160 (>= 360 wide), PLAY at top 248, boot at scale 1.25 (462 x 200 at 1280, 56 px above the bar).

### 8.5 P1 / P2 tags in 2P UI chrome (result, HUD key strips, Settings 2P keys, KeyCard, rematch chips)

Today every `PlayerChip` / `usePlayerColours()` consumer fills with `PLAYER_COLOURS` (#ff4d4d / #4d7cff, colour-blind #e69f00 / #56b4e9). In UI chrome these add a red and a blue next to fighters who already own red (BRIX) and blue (TAVO): the exact collision section 1 removed. In the UI, P1 and P2 are identified by the label and by position (left/right plate, the portrait next to the tag), so they get no hue there.

**Scope:** UI chrome only. The in-world over-head tags drawn in `render/game.ts` (`recolourMarks`) keep the player colours and the colour-blind pair: in a mirror match they are the only way to tell two identical fighters apart in the 3D scene, so they are a gameplay marker, not decor.

| Element | Fill | Text | Border | Ratio |
|---|---|---|---|---|
| `P1` / `P2` tag on a light or world surface (result card tags, HUD, Settings 2P keys) | #3b1f6b | #ffffff | none (or 2px #ffffff where it sits on a photo/3D background) | 13.17:1 |
| `P1` / `P2` inside the grape "Tonight" pill | none | #ffffff, the score digits sun #ffc83d | - | white on #3b1f6b 13.17:1, sun on #3b1f6b 8.52:1 |
| Rematch chip inside the sun REMATCH button, player ready (`P1 ✓`) | #3b1f6b | #ffffff + white check | 2px #3b1f6b | 13.17:1 |
| Rematch chip, player not ready (`P2`) | #ffffff | #3b1f6b | 2px #3b1f6b | 13.17:1 |

This supersedes the "tag in Titan 13 on the player colour" line of spec.md section 11.5.9 (2P key strips): the strip tag becomes the grape/white pair above. `PLAYER_COLOURS` stays in code for the in-world tags only.

### 8.6 Icons

**Pennant on dark surfaces.** New asset `traits/icons/ui-pennant-on-dark.svg` (rendered and checked on #3b1f6b): string #FFF3D6 2.4 stroke, left flag #FFC83D, right flag #FFF3D6, no grape stroke. Use it whenever the pennant sits on grape (home arena ribbon at 24 px, Credits title ribbon at 30 px). The existing sticker pennant stays on white (Settings Credits button). Suggested API: `<Icon name="pennantOnDark" />` or a `tone="dark"` prop; engineering's choice.

**Weapon icon in a medal.** Inside `.fd-res-disc` (92 px) a weapon icon renders at **56 x 28 px** (2:1 weapon art), centred, grape fill as the other award icons. The WeaponIcon inline size must not override this.

### 8.7 Engineering deviations: verdicts

| Deviation | Verdict |
|---|---|
| Toggle ON = sun | **Rejected**, now #5a3596 (8.2) |
| Selected tab and AUTO segment = sun | **Rejected**, #5a3596 + white (8.2) |
| VS disc white with `--btn2-lo` lip (after frame had a sun lip) | Accepted. VS is a label, not an action; the after frame's sun lip was an artefact of my injection |
| READY = sun with `--sun-lo` lip, no extra grape drop | Accepted. A flat, pressed-in slab reads as "locked in", which is what READY means |
| How to play titles grape on the white card body; striped grape headers | Accepted (matches the rule: cards differ by icon and text) |
| Online rematch: grape ribbon, YOU READY sun chip, DECIDING white | Accepted, one sun on screen |
| 1P loss YOU chip white | Accepted |
| KO puff confetti sun/white/scorer accent/sun-hi; 2P ready sun/white/both accents | Accepted (not seen on screen) |
| Bomb chip keeps BOMB + key and adds the icon | Accepted |
| Grape default ribbon on pause, settings, credits, VS doors | Accepted (pennant fix 8.6 applies) |
| `--ok` with no consumer | Accepted; keep the token for the first status mark |
| Settings warn note text #c2410c | Accepted: 5.01:1 on #fffbf0 |
| P1/P2 player-colour chips untouched | **Rejected**, 8.5 |
| `--track-lane` token | Accepted |
| Reset confirm label "PRESS AGAIN TO RESET ALL" fills the button edge to edge (settings-reset-confirm.png) | Copy change: **PRESS AGAIN TO RESET** (the row title already says "all") |

### 8.8 Not verified

- Audio and Graphics tabs, the 2P HUD, MATCH POINT pill, bomb badge, KO puff and 2P-ready confetti: not in any frame; rules apply.
- 1920x1080 for the F-056 screens, phones, colour-blind mode.
- The 22-24 px pennant-on-dark inside the live ribbon (checked only as a standalone render on grape).
- Contrast is computed from hex values, not measured from pixels in the running build.
