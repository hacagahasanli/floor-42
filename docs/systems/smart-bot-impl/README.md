# Smart bot: implementation evidence (2026-11-28)

Spec: `docs/systems/smart-bot.md`. Code: `src/game/sim/bot.ts` (createBot, API unchanged), `src/game/sim/botNav.ts`,
`src/game/sim/botOld.ts` (the old bot, baseline only, not in any bundle). Balance tables: `tools/balance/results/smartbot-impl-*.{md,txt}`.

## Videos and contact sheets (what is in this folder)

- `capture.mjs`: Chromium 1255, ANGLE Metal (real GPU), portal dev server on port 3471 (started in the background and
  killed by PID). A scripted keyboard player (TAVO, auto-aim, keeps 6-11 m, strafes, hops, walks onto guns, pushes in
  reach, dashes from rockets, decides every 150 ms) vs the bot for 50 s:
  `offsite-normal` (bot BRIX), `offsite-hard` (bot ZUZU), `office-normal` (bot ORMO), `office-hard` (bot BRIX).
- `<id>.mp4` (960 px, kept in git; the full 1280 webm stays local), `<id>-log.txt` (state sampled about once a second:
  positions, guns, HP, KOs; events only when a sample lands on their tick), `<id>-sheet.jpg` (one frame per 2 s,
  5 x 5, read left to right), `<id>-dense.jpg` (2-26 s, one frame per 0.5 s), `<id>-end.png`.
- `sheets.sh` rebuilds the sheets and mp4s (this ffmpeg has no drawtext, so tiles carry no time stamp).

## What reads on screen, and what looks wrong

Read clearly:
- Climbing for power guns: OFFSITE normal, BRIX walks to the left lookout at 13-15 s and takes the rail, then snipes from
  the lookout and the roof (KOs 2 and 3 of its 5 came while it held the rail, per the log). Office normal, ORMO goes up to the beam for the launcher at 8 s
  and, at 23 HP, climbs to the left balcony for the rail (37 s); the TEA BREAK callout shows while he heals 23 -> 51.
- High ground: the bots spend most of the fight on boardwalks, the water tower and the balconies, above the player.
- Sugar Rush press (offsite-hard): ZUZU drops off the tower and runs at TAVO right after the SUGAR RUSH callout.

Looks wrong or questionable:
1. Bouncy. The bot is in the air most of the time (harness: grounded 20-31 % of fight time vs 27-48 % for the scripted
   decent player), from jinks (hard: chance 0.5 per decision, roughly 2-3 hops per second [Estimate]) plus route hops. On the
   sheets it hops even when nothing is shooting at it. This is the old "it bounces" complaint in a new form; jink is
   also worth win rate (spec 6.3), so lowering it is a tuning call for a human session.
2. No Leapfrog was seen in either BRIX video, and the harness agrees: 0.03-0.24 Leapfrogs per BRIX match (target >= 1).
   The videos were taken with the Leapfrog set-up goal on (leapGoal 0.12); it is OFF in the committed bot because it
   cost BRIX about 5 points vs the field and still did not reach the target. Only the close-range reflex Leapfrog remains.
3. A retreat does not look different from "going for a gun": the hurt ORMO climbs AND grabs the rail, which reads as
   smart but not as "backing off to heal". The TEA BREAK callout is the only cue.
4. The bot uses the player's respawn window to climb and heal. Human-like and fair (the player does the same), but it
   means the player often respawns into a bot already on a balcony with a power gun.
5. Not seen at all in 200 s of video: a dodge of a rocket, a deflect, a wall splat, a feint. The scripted player rarely
   gets a rocket, and the log samples miss single-tick events. Not judged.

Nothing looked like cheating: the bot never shot through furniture, its aim visibly wanders before settling, and it
never knew more than the screen shows.
