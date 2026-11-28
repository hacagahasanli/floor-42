# Colour balance (R-027): calm base, one action colour, fighters own their colours

Status: decided (Creative Director, 2026-11-28). Supersedes any colour choice in `spec.md` that conflicts with it. Applies to every Field Day screen (`src/components/fieldday/**`, menus in `src/components/menu/**` that use `.fd`).

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
- **10 % SUN.** The ONE action colour: the single primary button per screen, the focused/picked thing (YOUR PICK, READY), the winner's celebration (rays, podium 1), "ready now" flashes.
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
