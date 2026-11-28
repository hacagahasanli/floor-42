# PEWFIELD: CrazyGames store copy + site blurbs (R-029)

Owner: Creative Director, 2026-11-28. Every fact below was checked against `portal-build` 806345c+ (`src/game/roster.ts`, `sim/traits.ts`, `sim/constants.ts`, `settings.ts`, `twoPlayer.ts`, `input.ts`, `portal/App.tsx`, `menu/MainMenu.tsx`, README). Paste the text as written. Covers: `~/Desktop/projects/games-studio/crazygames/covers/pewfield/`.

## 0. Problems first

- **Online is not in the portal build.** No line below mentions online, invites or matchmaking. Do not add any until the portal build has it.
- **Gamepads work in 2 PLAYER only.** In 1P vs the bot a pad does not move the fighter (`padInput` is read only by the 2P input; the 1P pad support is menus and the LB/RB respawn pick). So the copy says gamepads for 2 players only. If engineering adds 1P pad play, add one line to Controls.
- **Mobile is not claimed.** The build has touch controls, but this upload was QA'd as a desktop build. Tick "mobile" on CrazyGames only after a phone pass; the copy has no mobile line, so it stays true either way.
- **I do not know CrazyGames' current form field limits.** Lengths are given so you can check them against the form; if a field is shorter, cut from the end of a paragraph, never mid-list.
- Health numbers per fighter (85-115) are a balance detail that may move; they are deliberately not in the copy.

## 1. Title

**Pewfield** (title case on the store and in `<title>`). The logo is all caps (PEW! + FIELD); store titles on CrazyGames are written in title case, and the build already uses `GAME_NAME_TITLE` = "Pewfield". Never "PewField", "Pew Field" or "PEWFIELD" in running text. Fighter and arena names stay in caps (BRIX, OFFSITE), as in the game.

## 2. Short description (one line, 99 characters)

> A fast 1v1 shootout: four fighters, guns on the field, first to five KOs. Play the bot or a friend.

## 3. Full description

> Pewfield is a fast side-on 1v1 shootout at a sun-baked company field day.
>
> Pick a fighter, grab the guns that turn up around the arena and knock your rival out five times before they do it to you. Your gun aims itself, so the fight is all about moving, jumping, dashing and timing your shots. Hide behind crates and boardwalks, shove your rival with a Force Push that even sends their bullets back, and climb for the rockets and the sniper rail waiting up top.
>
> **Four fighters, four tricks**
> - BRIX, the roller-skating jammer: jump over your rival's head and your dash is ready again.
> - ORMO, thirty years at the company and never ran once: starts healing a second sooner than anyone.
> - ZUZU, the tiny coach: every hit she survives gives her a second of extra speed.
> - TAVO, packed for a week on a day trip: carries 25% more ammo for the SMG, Uzi and shotgun.
>
> **Two arenas**
> - OFFSITE: a desert canyon of boardwalks, crates and a water tower.
> - FLOOR 42: the office after hours. Desks stop bullets, and the glass walls break.
>
> **Two ways to play**
> - 1 Player against the bot: easy, normal or hard.
> - 2 Players on one keyboard (gamepads work too): first to 3, 5 or 7 KOs.
>
> Seven weapons: pistol, SMG, Uzi, shotgun, sniper rail, rockets and the bomb.

About 1,250 characters (markdown bold included). Weapons line checked against `GUNS` in `sim/constants.ts` (pistol, smg, uzi, shotgun, railgun "Sniper rail", launcher "Rockets", bomb).

## 4. Controls text

> **1 Player (keyboard)**
> A / D: move
> W: jump (press again in the air to double jump)
> S: drop through a walkway
> Space: shoot (hold for automatic fire; your gun aims itself)
> Shift: dash (bullets can't hit you while it lasts)
> Q: Force Push
> F: pick up the gun you're standing on
> G: throw the bomb
> T: switch to mouse aim (left click shoots)
> Esc: pause
>
> **2 Players (one keyboard)**
> Player 1: A / D move, W jump, S drop, F shoot, G push, H dash
> Player 2: ← / → move, ↑ jump, ↓ drop, ; shoot, L push, K dash
> Guns are picked up by walking over them.
>
> **Gamepad (2 Players)**
> One pad plays Player 2, two pads play both. Stick or d-pad: move. A: jump. X or RT: shoot. B or LB: push. RB or LT: dash. Start: pause.

Sources: `DEFAULT_BINDINGS` and `DEFAULT_BINDINGS_2P`, `padInput` (twoPlayer.ts), `game.ts` 1358-1359 (T, M). Crouch keys (C; V / M in 2P), reload (R) and mute (M) are left out on purpose: the store box should hold what a new player needs in the first minute.

## 5. Tags and category (suggestion)

- Category: **Shooting** (first choice) [assumption: CrazyGames lists Shooting and 2 Player as browse sections; pick from the form's own list].
- Tags, in order: 2 Player, 1v1, Shooting, Gun, Fighting, Local Multiplayer, Platformer, Casual, Funny. Skip "Stickman" (our fighters are low-poly people, the tag would mislead).
- Do not use: Multiplayer/Online (no online in this build), Battle Royale, Sniper (one gun of seven), Zombie, any brand name.

## 6. Build title and meta description (engineering; F-065)

- **Title suffix "— 1v1 shootout": approved.** "Pewfield — 1v1 shootout" says the genre in two words a searcher uses, and it is true in both modes. Keep the em dash and lower case.
- **Meta description: replaced.** Current: "Pewfield is a 1v1 shootout. Pick a fighter, grab a gun, first to five KOs wins." It misses the two things people search for (2 player, bot) and the four fighters. New (149 characters):

> Pewfield is a fast 1v1 shootout. Pick one of four fighters, grab guns off the field and race to five KOs against the bot or a friend on one keyboard.

- The Next site layout (`src/app/layout.tsx` 19) builds its description from `COPY.tagline` "Two coworkers. One grudge. No mercy." That is the old office tagline. New tagline: **"Two fighters. One field. First to five KOs."** (already the README's), see F-066.

## 7. Studio site blurbs (nalbakigames.com)

- **Card tagline (one line):** 1v1 duel · bot or 2 players
  (replaces "1v1 duel · bot or online" on the home pick card; online is parked, so the card must not promise it. When online returns: "1v1 duel · bot, couch or online".)
- **Game page summary (2-3 sentences):**

> Pewfield is a fast side-on 1v1 shootout at a sun-baked company field day. Pick one of four fighters, each with a trick of their own, grab the guns that turn up around the arena and knock your rival out five times first. Play the bot on three levels or a friend on the same keyboard, free in your browser.

- **Hero / key-art alt text:** "Pewfield: TAVO, a hiker with a huge backpack, and BRIX, a roller-derby jammer in a red helmet, trade fire across a desert boardwalk under a water tower painted PEWFIELD"
- **GitHub repo description (235 characters):**

> Pewfield: a fast side-on 1v1 shootout in the browser. Four fighters with their own traits, two arenas, guns on the field, auto-aim, Force Push and dashes. Play a bot or a friend on one keyboard. three.js + TypeScript, by Nalbaki Games.

Topics: `browser-game`, `threejs`, `typescript`, `local-multiplayer`, `2-player`, `shooter`, `webgl`.

## 8. Voice rules for anything else written about Pewfield

- Plain, short, a little funny through the characters (the jammer, the office dad, the tiny coach, the over-packer), never through developer or office jokes ("code review", "hotfix", "merge").
- Field day words are ours: field, offsite, team-building, medals, bunting. Violence stays cartoon: "knock out", "KO", never "kill", "blood", "headshot".
- Numbers only when the build guarantees them (five KOs, four fighters, two arenas, three bot levels, 25% more ammo).
