# R-019 - Fun directions (owner picks one)

Status: three directions mocked and rendered. Waiting on Reis. **Engineering builds nothing until he picks.**
Compare by eye: `compare-sheet.png` (2580x2330). Each `dir-*/` folder has `index.html` plus six 1280x720 PNGs: home, buttons, HUD and result frames 1-3. Re-render everything with `node render.mjs` (or `node render.mjs dir-a`).

## 0. What is wrong today (seen in shots/fight-feel-today-menu, playtest-offsite, aliveness-today-ui)

1. **It reads like a settings app.** The menu is text on a dark gradient, the panels are dark glass and the stats are thin bars. Nothing on screen looks like an object you could press.
2. **The dark ink UI clashes with OFFSITE.** The bright desert is the default arena, so the dark corporate panels now sit on top of a sunny sky.
3. **The result screen is a spreadsheet.** "STANDUP WINS", five rows of numbers and two buttons. It has no moment, no loser reaction and no joke. The owner called this out specifically (2026-11-28).
4. **The humour lives only in small copy** ("Mandatory team-building. 41°C in the shade."). Nothing visual carries it.
5. **What works and must stay:** the VS doors (the colour split, the slammed VS card and the big outlined names) are the energy benchmark. Also keep fighter accent colours (Hotfix orange, Standup blue and so on), the keyboard hints, first-to-5, Enter = rematch, and the yellow as the "do this now" colour.

## 1. Reference study: why UI reads as "game" rather than "app"

What each source shows, and what we take from it. Verified facts are cited. Lines marked [Interpretation] are mine.

| Source | What it shows | Our rule |
|---|---|---|
| Beastieball UI deep dive, Game Developer ([link](https://gamedeveloper.com/art/deep-dive-developing-a-clear-and-consistent-visual-language-in-the-ui-of-beastieball)) | Parallelograms and looping patterns are used everywhere, all colours come from one small indexed palette, and menus move with a "lazy tween" that covers a fraction of the remaining distance each frame (their favourite factor is 0.3). They accept some awkwardness in exchange for consistency. | **One motif, applied everywhere** is what makes UI feel designed for this game. Pick a material (paper / plastic / putty) and never break it. Colours are palette slots. |
| Brawl Stars design critique, Pratt IxD ([link](https://ixd.prattsi.org/2025/02/design-critique-brawl-stars/)) | The Play button is "big and bold in bright yellow". Action buttons are "obvious signifiers". Feedback during play comes from damage numbers and haptics. | One huge primary button in one colour. Every pressable thing looks like a physical object. |
| Fall Guys level art, GameSpot on Ash Kerins' thread ([link](https://gamespot.com/articles/fall-guys-heres-how-the-developers-make-its-levels/1100-6481433/)) | A colour and pattern system tells players which elements they can interact with. | Colour = meaning, consistently: yellow = do it now, blue = move on, cream/white = back / change. |
| Splatoon: Nintendo UI designer recruiting page ([link](https://www.nintendo.co.jp/jobs/keyword/18.html)) | The team made a custom "Squid Font" that was used in the game, on the web, in ads and on packaging, and it shaped the series identity. | Type is identity. Each direction picks one display face and uses it for logo, buttons, stamps and results. |
| Springs explained, Game Developer ([link](https://gamedeveloper.com/game-platforms/instant-game-feel---springs-explained)) | A button that "flattens out when pressed" on a spring. The same squash-and-stretch spring is reused for an attract animation by "nudging" its velocity. | Hover = lift, press = squash onto its shadow, release = spring back. One spring per button; nudge it for idle "look at me" pulses. |
| Post-game screen research, Game Developer ([link](https://gamedeveloper.com/design/how-post-game-screens-keep-us-playing-or-don-t-)) | In uncontrolled observation, Overwatch players left the post-game screen early. The revised hypothesis is that they want the next match sooner and the screen gives no quick way to skip the timer. | The result is a show, but **REMATCH is pressable from t = 0.6 s**, and Enter skips the reveal. |

[Interpretation] Win/loss contrast and "celebrate, then inform" on the result screen are my design rules, not a cited finding (the results-screen guide I found could not be fetched). Across these, the "fun game" signals are: (1) thick dark outlines and hard shadows, so things look like stickers or toys, not glass; (2) a slight tilt on panels (nothing perfectly level); (3) one shouting primary colour; (4) every press gets a squash and a sound; (5) jokes are visual, not only in copy; (6) the end of a match is staged like a reveal.

**Limitations:** I did not play or screenshot Brawl Stars, Stumble Guys, Fall Guys, Smash Karts, Gang Beasts or the CrazyGames 2-player hits for this request. Their findings above come from the cited articles, not from my own inspection. No source gave measured retention effects of UI style, so none are claimed.

## 2. The three directions

All three use the same content: home (PLAY, 2 PLAYER, ONLINE 1v1, FIGHTER, SETTINGS, HOW TO PLAY), the HUD (health, dash/push, weapon, score, timer, KO feed) and the result (headline, winner, loser, score, 3 awards, REMATCH / NEXT ARENA / CHANGE FIGHTER). Backdrop: the real OFFSITE capture `shots/offsite/wide-arena.png`. I used this one rather than offsite-r2 because every offsite-r2 frame has the old HUD baked in. Fighter "photos" are crops of the real VS-door render `shots/fight-feel-today-menu/1920x1080-10-vs-doors-42.png` (`_shared/hotfix.png`, `_shared/standup.png`).

### A - STICKY SITUATION (CD pick)
- **Idea:** the office supply cupboard exploded onto the screen. Menus are sticky notes, the fighter is an ID badge on a lanyard, verdicts are rubber stamps, and asides are marker scribbles. The result is a **PERFORMANCE REVIEW** folder: the winner's polaroid stamped PROMOTED!, the loser's polaroid stamped SENT TO HR.
- **Palette:** ink #1E1B24, post-it #FFD84D (low #E9B92A), pink #FF8FB8, mint #9BE8C3, blue #8FD3FF, stamp red #E2412F, HR slate #5B6B8C, paper #FFF6E2, folder #EFCB86, cork #C99A63. Player accents unchanged (#FF6A2B, #2FA8E8).
- **Fonts:** Lilita One (display, SIL OFL), Permanent Marker (scribbles, Apache 2.0), Rubik 500-900 (UI text, SIL OFL). All on Google Fonts and self-hostable.
- **Button:** sticky note with a 3 px ink outline and a hard 6/7 px ink shadow, rotated -1.5° to +1.5°. Hover: lifts 6 px and straightens, shadow 10/14, 120 ms ease-out, paper flick sound. Pressed: drops onto its shadow and squashes 1.04/0.94 in 60 ms, stapler clack. Disabled: greyed, struck through with marker, and a stamp says why ("waiting for rival"). Keyboard focus: a dashed paper outline that pulses every 1.2 s.
- **Motion and sound:** paper flutter in, spring settle; a stamp slams in at scale 1.6 → 0.94 → 1 over 180 ms with a 2-frame hold, a 4 px camera kick, ink spray and a rubber THUNK. Score digits are re-written with a marker squeak.
- **Why it can win:** it is the only direction where the **office joke is in the visuals**, and it works on both the bright desert and the dark office.

### B - FIELD DAY
- **Idea:** the offsite is a corporate sports day run like a TV game show. Glossy candy-plastic buttons, sunburst rays, a podium, medals and confetti. The loser stands on a tiny PARTICIPATION box with a sad balloon.
- **Palette:** grape outline #3B1F6B, sun #FFC83D / lip #E08A00, tangerine #FF7A2F / #C2410C, teal #22C3A6 / #0E8A74, sky #4CB8FF / #1F7BC8, cream #FFF3D6, disabled #B9B3C9.
- **Fonts:** Titan One (display, SIL OFL), Baloo 2 600-800 (UI text, SIL OFL).
- **Button:** pill (radius 22) with a 4 px grape outline, glossy top half and a 7 px darker lip. Hover: scale 1.07, tilt -2°, spring overshoot. Pressed: sinks 6 px onto the lip and squashes 1.04/0.92. Disabled: grey plastic with a padlock, and a tap makes it wobble.
- **Motion and sound:** spring everything (about 12 % overshoot), letters pop in 25 ms apart, a confetti cannon fires on a win, a kazoo plays on a win and a slide-whistle on a loss.
- **Risk:** this is the safest "mobile game" read but the **least ownable**: glossy pills with outlines are what every casual game uses. Emoji in the mockup medals are placeholders for SVG icons.

### C - FLOOR42.EXE
- **Idea:** the game runs on a beige office computer that never existed. Bevelled putty buttons, WordArt logo, error dialogs as the joke delivery system. The result opens with "STANDUP.EXE HAS STOPPED WORKING - send an error report to HR? [SEND] [SEND LOUDER]". The loser's window then goes "(Not Responding)" and the awards arrive as AWARDS.ZIP.
- **Palette:** putty #E8DFC9 (hi #FFFDF5, lo #A89F8A), title bar #FFC93C → #FF9F1C, ink #1E1B24, tomato #F0533A, sky #3FA2F7, mint #5DD39E, WordArt gradient #FFF27A → #FF7A2F → #F0533A with a grape extrude #7A2E9E.
- **Fonts:** Bowlby One (WordArt, SIL OFL), Silkscreen (pixel labels, SIL OFL), IBM Plex Mono (body, SIL OFL).
- **Button:** bevelled rectangle, 2 px ink border, 3 px light/dark bevel. Hover: lighter, with a dotted focus rect. Pressed: the bevel inverts and the label shifts 4 px, with a mechanical clunk. Disabled: etched grey, and a click gives an error "bonk".
- **Risk:** it is the funniest of the three, but it is text-heavy, the pixel font is weaker at small sizes, and the joke depends on recognising old computers. It must never copy a real OS: we use yellow title bars, a "42" start button, our own icons and no product names.

## 3. Result screen: the showpiece (all directions)

The VS doors are the energy reference: full-screen, colour-split, one big object slammed in. Each direction stages the end of the match in three beats. The rendered frames are `*-4-result-f1`, `*-5-result-f2` and `*-6-result-f3`.

| Beat | t | A Sticky Situation | B Field Day | C FLOOR42.EXE |
|---|---|---|---|---|
| Impact | 0-0.45 s | The folder slides up (250 ms) and the winner polaroid drops. PROMOTED! slams over it with a kick, ink spray and the line "FINAL KO: ROCKET TO THE FACE" | Drumroll 0.3 s, then "AND THE WINNER IS…". Rays spin in, the winner card pops (0 → 1.25 overshoot) and confetti fires | The game freezes on the final KO with 2 glitch bars. The crash dialog drops in with a 2 px shake and a bonk |
| Reaction | 0.45-1.5 s | The loser polaroid flutters in, tilted and desaturated, with sweat drops. The headline is highlighted left to right and the score is written in marker | The card lands on podium 1. The loser's tiny box slides in and the "2" shrinks with a slide-whistle | The loser window greys out with an hourglass. "HOTFIX WINS!" WordArt flies in on an arc |
| Awards + choice | 1.5-2.6 s | 3 sticky-note awards flap in 150 ms apart, then REMATCH / NEXT ARENA / CHANGE FIGHTER | 3 medals drop 200 ms apart, then the buttons bounce up | AWARDS.ZIP unzips row by row and WHAT_NOW.EXE drops in |
| Idle | 2.6 s + | REMATCH breathes (1 → 1.03, 1.2 s) and the loser photo swings on its tape | Rays rotate slowly and the balloon bobs | REMATCH has focus with marching ants |

Rules for all three:
- REMATCH accepts input from t = 0.6 s. Enter at any time skips straight to the final state. In online play, REMATCH shows "waiting for rival" (disabled state) until both players agree.
- **Loss variant:** the same layout with the roles swapped. Your own photo gets SENT TO HR / PARTICIPATION / Not Responding. The loss must still be funny and never humiliating, and REMATCH stays the largest object on the screen.
- **Awards (3 per match):** chosen from a pool by "most extreme stat this match". The pool for the mockups: HUMAN PIÑATA (rockets taken), PER MY LAST EMAIL (bullets reflected by Force Push), CARDIO KING (jumps), plus SHARPSHOOTER (accuracy), BULLET SPONGE (damage taken) and DESK JOCKEY (time on one platform). **Engineering:** rockets taken, reflected bullets, jumps and time-per-platform are probably not tracked today (the current result shows KOs, damage, accuracy, best streak and times down). Confirm which are cheap to add, and I will write the final award list and copy to fit.
- **Winner in 3D:** the mockups use VS-door renders as "photos". In the build, the photo should be the real fighter rendered in a **victory pose** (and the loser in a **slump pose**) using the same render path as the VS doors. If that path cannot do poses, use the VS-door idle pose for now. Engineering: report the cost.

## 4. Recommendation: A - STICKY SITUATION

- **Why A:** it is the only one of the three where the **look itself is the office joke** (stamps, ID badges, performance review), so it pushes the identity rather than borrowing a genre's look. It turns the result screen into a moment with a built-in punchline (PROMOTED! / SENT TO HR) and keeps the yellow primary that players already know from today's UI. It works on both arenas, since paper is neither dark nor neon. Cost: it is CSS plus a few SVGs (tape, stamp texture, sweat drops) and needs no new 3D.
- **Why not B:** it is the most instantly "game", but it is the generic casual-mobile look, so it would make Floor 42 look like many other games. Its best part, the springy press physics, is already in A's buttons.
- **Why not C:** it has the strongest laughs, but it is the weakest for readability and in-match HUD, and the joke wears thin after the tenth crash dialog. Its best line can live inside A as copy: "STANDUP.EXE has stopped working" could appear as an award or a KO-feed line.
- **Weak points of A to fix before the build:** the HUD paper panels are too big. The final spec will cut them to about 70 px high with a smaller badge. The result score was enlarged to 92 px in the mockup and must stay at least that big. Permanent Marker is only for 1-2 short lines per screen, because it is hard to read in long text.

## 5. What must not change (any direction)
- Fighter accent colours and silhouettes, the VS doors and the arena art.
- Controls and hints, Enter = rematch, Esc = back, first to 5.
- No cyberpunk, no neon city, no military look. No logos, fonts or UI art copied from any game or real OS.

## 6. After Reis picks
I write `CREATIVE/ui/<direction>/spec.md` with exact tokens, the component list (button, panel, badge, stamp, HUD, result timeline), copy for every screen, a stamp texture SVG and acceptance criteria. Then engineering builds it, home and result first.
