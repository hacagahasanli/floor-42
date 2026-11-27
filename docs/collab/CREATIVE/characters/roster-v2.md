# Roster v2: Kessa, Ormo, Zuzu, Tavo (R-022)

Creative Director, 2026-11-28. Status: ready for the owner to pick by eye, then for engineering and the systems designer.

- Overview sheet: `roster-v2/sheet-overview.png`
- One sheet per fighter: `roster-v2/sheet-kessa.png`, `sheet-ormo.png`, `sheet-zuzu.png`, `sheet-tavo.png` (1920x1080 each)
- Source: `roster-v2/sheets.html` (live three.js, built from the same primitives and proportions as `src/game/render/characters.ts`). Re-render: `cd roster-v2 && node render.mjs`.

## 0. Decision in one table

| Slot (id today) | New name | Backups | Who they are | Hook (silhouette) | Trait idea | Accent |
|---|---|---|---|---|---|---|
| hotfix (tall, high flyer) | **KESSA** | Tova, Sela | The Overachiever: signed up for every event, keeps score of all of them | Long striped scarf that always streams behind her | **Hang Time**: hold jump at the apex to float briefly, once per jump | Scarlet `#E5392F` |
| legacy (wide, heaviest) | **ORMO** | Hollis, Barlo | The Office Dad: never runs, never panics, always has tea | Dark handlebar moustache wider than his head, on the squarest body | **Tea Break**: health starts coming back sooner after a fight | Teal `#14A37F` |
| standup (small, fastest, 2 air jumps) | **ZUZU** | Nuni, Tizi | The Tiny Coach: shortest in the company, self-appointed coach, whistle | Two big round hair puffs (round head, two round ears) | **Sugar Rush**: a short speed burst every time she is hit | Bubblegum `#F25CB8` |
| intern (balanced, backpack) | **TAVO** | Benno, Fenn | The Over-Packer: packed for a week, it is a day trip | Towering orange hiking pack with a rolled mat above his head | **Packed Extra**: a bit more ammo in every regular gun he picks up | Cobalt `#2456D6` (pack `#F08A24`) |

Stats (speed, jump, weight, size, air jumps) do not change: each new fighter takes over one slot's numbers exactly. The trait is the only new rule, and it is an idea for `game-systems-designer` to turn into numbers, not a number.

## 1. Problems with the current roster (why this exists)

1. **The identity is a developer joke.** Hotfix, Legacy, Standup and Intern only mean something to people who work in software, and their pitches ("Pushed to main on day one", "Has been awake since the 3 a.m. page") need that context. The owner wants every player to say "that one is my guy"; a joke you do not get cannot be your guy.
2. **One body plan, four accessories.** All four are the same box torso and cylinder limbs; the difference is a hood, a beard, hair, a backpack (`shots/offsite/fighter-*-close-sand.png`). At play distance the beard and the headset are a few pixels.
3. **Three of four accents disappear on Offsite, the default arena** (WCAG luminance ratio, measured from the hex values): Intern yellow `#ffd23f` on sand `#efcf98` = **1.04:1**, Standup blue `#3ec5ff` on sky `#6fbbe3` = **1.08:1**, Legacy green `#3ddc84` on sand = **1.19:1**. They were picked for the dark office.
4. **No playable personality.** Stats differ, nothing else does. Nothing in a match tells you who someone is.

## 2. Research: what makes players pick a fighter and recognise it

Verified findings (sources at the end of the section), then what we take.

- **Readability is the first requirement, and silhouette carries it.** Valve's *Illustrative Rendering in Team Fortress 2* (Mitchell, Francke, Eng, NPAR 2007) says the classes were built to be told apart by silhouette first, from body proportions, weapons, hats and footwear, and that rim light (not black outlines) separates characters from the scene. Overwatch's art leads (Petras and Tsang, GDC 2017, as reported by PC Gamer and Kotaku) put "is the silhouette too close to an existing one?" above all other needs, and exaggerated attributes on purpose. Blizzard's own art write-up uses shape language: squares read sturdy, circles friendly. A secondary analysis notes tanks are blocky or round and fast precise heroes are thin and tight.
- **Every brawler must say role, silhouette, personality and function almost at once** (GDC Festival of Gaming session on Brawl Stars' Shade, via the session description). Supercell's brawler pillars, per Fernanda Oliveira: humour, nostalgia that does not copy, intentional diversity, "less is more", Saturday-morning-cartoon appeal. Their Shade case turned physical gags into mechanics.
- **Why players pick a main:** I found no peer-reviewed study on fighting-game mains. Fighting-game press and player threads say looks, personality, archetype and toolkit; that is opinion and anecdote. The one academic source I found (a qualitative study of 34 League of Legends players on how they justify champion choice) supports that preference is explained by players in their own terms, not by stats alone. Treat "personality drives the pick" as plausible, not proven.

What we take (my interpretation):
- One **big** hook per fighter that changes the outline, not a detail inside it. Test it as a flat silhouette at game scale.
- Shape language matched to the stat: tall line (Kessa), square (Ormo), circles (Zuzu), a hump (Tavo).
- The personality and the trait are the same idea seen twice (Shade's rule): the overachiever shows off in the air, the calm dad heals when calm, the hyper coach speeds up when hit, the over-packer has more ammo.
- Light rim in each fighter's tint, as TF2 does, because mid-tone accents cannot all separate from sand, sky and cliff by brightness alone (section 4).

Sources: [Mitchell et al., NPAR 2007 PDF](https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf) · [Valve NPAR07 slides](https://cdn.fastly.steamstatic.com/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2_Slides.pdf) · [Valve GDC 2008 Stylization with a Purpose](https://cdn.fastly.steamstatic.com/apps/valve/2008/GDC2008_StylizationWithAPurpose_TF2.pdf) · [PC Gamer: Torbjorn and Overwatch's art](https://www.pcgamer.com/how-torbjrn-became-the-art-inspiration-for-all-of-overwatch) · [Blizzard: Overwatch 2 art panel recap](https://news.blizzard.com/en-us/article/23189038/2) · [Medium: readability in TF2 and Overwatch (secondary)](https://medium.com/@xavierck/character-readability-in-team-fortress-2-and-overwatch-68c41d454465) · [PocketGamer.biz: 5 creative pillars for Brawl Stars brawlers](https://www.pocketgamer.biz/5-creative-pillars-for-designing-brawlers-in-supercells-brawl-stars/) · [GDC: inside Brawl Stars design](https://gdconf.com/news/go-inside-design-supercells-new-hit-game-brawl-stars-gdc-2019) · [Red Bull: how pros choose a main (opinion)](https://redbull.com/us-en/maining-character-balance-fgc-pros) · [LoL champion preference study (HICSS-58)](https://aisel.aisnet.org/hicss-58/in/esports/5). I read search summaries and the PocketGamer article; I did not watch the GDC talks or open the full NPAR paper.

## 3. Roster rules (all four)

- **Theme:** coworkers at a company field day / offsite. Everybody has worked somewhere or been to a team day; nobody needs to know what a merge is. No profession that only one industry knows, no brands, no real people, no tech words.
- **All four are adults.** Zuzu is small, not a child: keep her head ratio no larger than today's Standup (headR 0.19-0.21 on a 1.5 m body), adult clothes, no childish lines. A child with a gun would also be a portal and age-rating problem.
- **Mix:** two women (Kessa, Zuzu), two men (Ormo, Tavo); four different skin tones (`#C68A63`, `#E9B48F`, `#8D5A3B`, `#F1C7A0`).
- **Colours:** four hues spaced around the wheel and away from the Offsite's own (sand 38°, cliff 22°, cactus green, sky 200°). Checked under simulated colour blindness (Machado 2009 matrices, CIELAB distance between every pair): the minimum pair distance is 19.6 (deuteranopia), 27.1 (protanopia), 28.6 (tritanopia). The first candidate with violet for Zuzu failed (cobalt vs violet 4.4 under deuteranopia), so Zuzu is pink.
- **Every fighter keeps dark legs or dark hair** as a luminance anchor against the light Offsite.

## 4. Colour and contrast (measured from hex values)

Luminance ratio of the flat accent against each background. These are low against Offsite sky and cliff for every mid-tone colour; that is why rule 3 adds the dark anchor and the light rim. Old values for comparison in section 1.

| Accent | Sand `#efcf98` | Sky `#6fbbe3` | Cliff `#b97c57` | Office `#1b1f2e` |
|---|---|---|---|---|
| Kessa `#E5392F` | 2.83 | 2.00 | 1.23 | 3.87 |
| Ormo `#14A37F` | 2.14 | 1.50 | 1.08 | 5.13 |
| Zuzu `#F25CB8` | 2.01 | 1.41 | 1.15 | 5.46 |
| Tavo `#2456D6` | 4.16 | 2.93 | 1.80 | 2.63 |
| Tavo pack `#F08A24` | 1.68 | 1.18 | 1.38 | 6.53 |

Weakest cases and their fix: Kessa against the cliff (close hue): her dark leggings and the cream scarf stripes carry her. Tavo on the dark office: his orange pack carries him (6.53). `RIM_COLOR` per fighter = the "rim tint" on each sheet (`#FFB3A8`, `#9FF0D8`, `#FFC4E6`, `#A9C2FF`), not the accent: a light rim separates from both dark and mid backgrounds.

UI use: the accent is a fill colour. As text it always sits on or inside the R-021 grape outline (`#3B1F6B`); contrast with grape is 3.11 / 4.12 / 4.39 / 2.12. Tavo's cobalt is never text on grape; use white text on a cobalt fill.

## 5. The four

Joint conventions for poses (same as `characters.ts`): shoulder/hip x < 0 swings the limb forward and up; z lifts it out sideways (mirrored right); elbow/knee x folds the joint. Angles in degrees. Every pose on the sheets is built with exactly these values (`POSES` in `sheets.html`); copy them.

### 5.1 KESSA (replaces hotfix)

- **Name check:** searched `"Kessa" video game character` and `"Marlet" OR "Kessa" brand name company`. No game character, brand or public figure named Kessa; nearest were Kensa (an Assassin's Creed minor NPC), Kess (a fan wiki), and a 1997 KESS SPORTSWEAR trademark (different word). Backups: **Tova** (searched `"Tova" game character OR brand`: nothing), **Sela** (searched `"Sela" video game character OR brand`: only Korr Sella, Star Wars, different spelling).
- **Personality:** The Overachiever. Signed up for every event at the field day, keeps score of all of them, and will tell you hers.
- **Catchphrases:** "Watch this." · "Did anyone film that?" · "Again. Faster."
- **Hook:** a long striped scarf (two tails, 6 and 5 segments of 0.2 x 0.21 m, scarlet and cream `#FFF1DC` alternating) that always streams back 60-90° from the neck, even standing still. It is her flag: in the air it draws every jump. Supporting: cream sweatband, short dark bob, white side stripe on the leggings. Silhouette test (sheet, 50 px/m): the side view is the only one of the four with a horizontal line behind the head; front view is the thinnest and tallest.
- **Build deltas vs today's Hotfix:** remove hood, headset, cable and mic. Same body spec. Scarf = a chain on the existing `hang` springs (Secondary) so it trails the motion; merge each tail into one geometry if draw calls matter.
- **Poses**
  - Idle: on her toes, root y +0.03 m bob at 2 Hz; torso -5°; arms loose (L shoulder x 8 z 10, elbow -18; R x -10 z -10, elbow -25); scarf base 70°.
  - Victory: hop +0.16 m; right shoulder x -172 (points straight up), elbow -4; left shoulder x -5 z 42, elbow -105 (fist on hip); left hip x -72, knee 85; head -14; scarf whips up to 88°.
  - Defeat: drops to one knee (root y -0.42; left hip -88 knee 88; right hip 0 knee 92); hands on head (shoulders x -25 z ±140, elbows z ±112 folded in); torso 14; head 24.
  - Taunt: checks an imaginary stopwatch on her left wrist (left elbow -110, head down 25), taps it twice.
- **Trait idea: HANG TIME.** Holding jump at the top of a jump makes her fall slower for a short moment, once per jump (ground or air). Fairness guard: while floating she cannot dash and moves slower sideways, so it is a pose, not an escape; she is the tallest target hanging in the air.

### 5.2 ORMO (replaces legacy)

- **Name check:** searched `"Ormo" character OR brand OR game`: nothing. Backups: **Hollis** (searched `"Hollis" video game character famous`: only game designers Martin and Andy Hollis, not characters; low risk), **Barlo** (searched `"Barlo" character OR brand OR celebrity`: nothing; note it sounds like the surname Barlow, e.g. a well-known British singer, so it is the weakest backup).
- **Personality:** The Office Dad. Never runs, never panics, always has a thermos of tea and a folding chair. Everyone's favourite uncle.
- **Catchphrases:** "Easy now." · "Tea's still warm." · "I've seen worse."
- **Hook:** a dark brown `#4A2E22` handlebar moustache, about 0.75 m tip to tip (the head is 0.46 m wide), with curled tips, on the widest and squarest body. A horizontal bar on a block. Supporting: bald crown with grey sides, bushy brows, teal knit vest over a cream shirt, thermos on the right hip. Silhouette test: the moustache tips break the head outline on both sides in the front view.
- **Build deltas vs Legacy:** remove the beard and the glasses (the moustache must be the only thing on the face); vest = the top colour; belly stays (scaled flatter, 1.12 x 0.8 x 0.3 of r 0.34 so it is a curve, not a ball); add the thermos (cylinder r 0.07 x 0.3, red cap).
- **Poses**
  - Idle: hands behind his back (shoulders x +38 z ±8, elbows -72); slow heel-to-toe rock ±2° at 0.5 Hz; moustache twitch (scale y 1.15 for 80 ms) every 3-5 s.
  - Victory: toasts with the thermos cup (right shoulder x -112 z -10, elbow -48; the cup is the thermos cap in his hand), left hand pats the belly (shoulder x -28 z 22, elbow -80); belly bounces twice (existing jiggle).
  - Defeat: sits down heavily (root y -0.5), legs in a V (hips x -86 z ±22), hands on knees (shoulders x -48, elbows -20), head 18. One long sigh.
  - Taunt: smooths the moustache with one finger (right elbow -140, hand at the lip), slow nod.
- **Trait idea: TEA BREAK.** His health starts coming back sooner after he stops taking and dealing damage (everyone else waits `RULES.regenAfter` = 4 s). Fairness guard: same regen rate as everyone, and it only shortens the wait, so a fighter who keeps pressure on him gets nothing from it.

### 5.3 ZUZU (replaces standup)

- **Name check:** searched `"Zuzu" game character famous`. Hits: a minor NPC in *Freshly-Picked Tingle's Rosy Rupeeland* (Nintendo DS spin-off), a small hidden-object game heroine, a VTuber; also known as a child's name in the 1946 film *It's a Wonderful Life*. None is well known as a game character, but it is the least clean of the four primaries; if the owner wants zero hits, take a backup. Backups: **Nuni** (searched `"Nuni" character OR brand OR game`: nothing; near Bandai Namco Nui and League of Legends' Nunu, different words), **Tizi** (searched `"Tizi" character game OR brand OR celebrity`: a kids' app series "Tizi Town" exists, so it is a weak backup).
- **Personality:** The Tiny Coach. Shortest person in the company and its self-appointed coach. Blows her whistle at everything, especially you.
- **Catchphrases:** "Too slow!" · "Keep up!" · "*TWEEEET*" (a whistle sound, not a word)
- **Hook:** two big round hair puffs (r 0.19 each, dark `#2B2230`) on top of the head: a round head with two round ears. Supporting: gold whistle on a gold lanyard, cream chest band, knee socks with a pink stripe, gold shoes. Silhouette test: the only outline with two bumps above the head; it holds at 75 px (her height at 50 px/m).
- **Build deltas vs Standup:** replace the hair cloud with the two puffs (each its own `hang` spring so they bounce); replace the red strap and badge with the lanyard and whistle; headR 0.19 -> 0.21 allowed, no larger (adult rule).
- **Poses**
  - Idle: ready crouch (hips -28 / -12, knees 40 / 32, root y -0.04), fists up (shoulders x -52 / -60, elbows -112 / -115), torso 10; bounce 0.04 m at 3 Hz; puffs jiggle.
  - Victory: star jump +0.34 m, arms z ±150, legs z ±24, then whistle to the mouth (head back 10).
  - Defeat: flat on her back like a starfish (root x -90, y 0.17), arms z 75 / -70, legs z ±28; the whistle rolls off her chest.
  - Taunt: blows the whistle and points at the rival (right shoulder x -90, elbow 0): foul!
- **Trait idea: SUGAR RUSH.** Each time she takes damage she runs faster for a moment. Fairness guard: no damage bonus; the boost does not stack and has a cooldown; she is already the smallest and fastest, so the systems designer should keep it small and check bot matches for "impossible to finish" frustration first.

### 5.4 TAVO (replaces intern)

- **Name check:** searched `"Tavo" character game OR brand OR famous`: nothing. Backups: **Benno** (searched `"Benno" video game character OR famous Benno`: no game character; real people include the German actor Benno Fürmann, moderately known in Germany), **Fenn** (searched `"Fenn" video game character OR famous person`: minor game characters, a *The Witcher* TV character and Star Wars' Fenn Rau; low risk, not zero). Rejected on the way: **Rafi** (sounds exactly like Raffi, a well-known children's singer), **Dovo** (a razor brand).
- **Personality:** The Over-Packer. Packed for a week. It is a day trip. Earnest, helpful, a bit worried, and he has a spare of everything.
- **Catchphrases:** "I brought a spare." · "Good thing I packed this." · "Plaster, anyone?"
- **Hook:** a towering orange `#F08A24` hiking pack (0.62 x 0.98 x 0.42 m) with a rolled green mat on top, reaching above his head, and a mug hanging off the side. Supporting: khaki bucket hat, round glasses, cobalt fleece, cargo pants with pockets. Silhouette test: the only outline with a block above and behind the head; the side view is unmistakable.
- **Build deltas vs Intern:** remove the beanie and pom; bucket hat (cylinder r 0.2, brim r 0.29); pack taller (0.74 -> 0.98 m) and orange, plus the mat (cylinder r 0.13 x 0.78 across the top); top = cobalt; pants khaki.
- **Poses**
  - Idle: thumbs in the pack straps (shoulders x -14 z ±6, elbows -118); weight shifts side to side; glances back at the pack every 4 s (head y 25 for 0.4 s).
  - Victory: pulls a tiny yellow flag from a side pocket and waves it high (right shoulder x -165 z -15, ±15° wave at 3 Hz); left thumb up (shoulder x -50, elbow -90).
  - Defeat: sits, legs straight out (root y -0.6, hips -88); the pack has slid off beside him and spilled a mug and a sandwich; head turned to them (head x 22 y -30).
  - Taunt: holds out a sandwich to the rival (right shoulder x -80, elbow -20), head tilt 10. Peace offering.
- **Trait idea: PACKED EXTRA.** Every regular gun he picks up (SMG, Uzi, shotgun) has a bit more ammo. Power guns (railgun, rocket launcher) and the pistol are excluded. Fairness guard: no damage or fire-rate change; it wins long fights only.

## 6. Copy pass: every developer-themed string and its replacement

The `developer` audience is removed. One voice remains (today's `regular`, revised). Engineering removes the variant plumbing (`CopyVariant`, `Audience`, `resolveVariant`, `shouldAskAudience`, `Settings.audience`, the `PORTAL_BUILD` copy branch) and keeps one flat table. Storage keys and code identifiers (`merge-conflict:character`, `mergeStatic`, etc.) are invisible to players and are out of scope.

### 6.1 `src/game/copy.ts`

| Key | Developer line (delete) | Line to ship |
|---|---|---|
| tagline | Code review got personal. | Two coworkers. One grudge. No mercy. (unchanged; R-023 may rewrite with the new game name) |
| goal | First to 5 KOs takes the merge | First to 5 KOs wins |
| playSub | ...first to 5 takes the merge | Fight the {level} bot as {name} · first to 5 |
| vsFirstTo | FIRST TO {n} · TAKES THE MERGE | FIRST TO {n} |
| introAbove / introBelow | `<<<<<<< HEAD` / `>>>>>>> their-branch` | (none) |
| introTitle | CODE REVIEW / GOT PERSONAL | ONE FLOOR / NO MERCY (Offsite: TEAM-BUILDING / NO MERCY) |
| introLine | Two developers. One floor of guns... takes the merge. | Two fighters. One floor of guns. First to 5 KOs wins. |
| countdownReady / Go | git merge / CONFLICT! | READY / FIGHT! |
| hudRoom | agents-know · merge room | open office (Offsite: the canyon) |
| resultWin / resultLoss | Conflict resolved, your way / their way. | The floor is yours. / They took the floor. (Offsite lines unchanged) |
| knockoutStamp / Line | MERGED / {NAME}'S BRANCH WINS | KNOCKOUT / {NAME} TAKES THE FLOOR |
| resultDemo | Merged by {NAME}. | {NAME} took the floor. |
| resultDraw / drawSub | Still conflicted. / Time ran out with nothing resolved. | Dead even. / Time ran out with the score level. |
| howTo[0] | ...takes the merge. | ...First to 5 KOs wins. |
| howTo[2] | Use the office ... like a bad commit. | Use the cover: Desks and the meeting table stop bullets. The glass breaks: push them through it. |
| tips | "Works on rivals, not on main." / "production access, six shots." / "Like a weekend." | drop the dev tails: the regular tips as they are today |
| fighters (role, pitch) | On-call engineer / Senior maintainer / Scrum lead / First week + dev pitches | see 6.3 |

### 6.2 Everywhere else

| File:line (today) | String | Change |
|---|---|---|
| `components/menu/AudiencePrompt.tsx:14,68` | "Are you a developer or a regular player?", "DEVELOPER · Merge conflicts, code review and office in-jokes" | Delete the first-entry question and the component. |
| `components/menu/SettingsPanel.tsx:682-687` | Row "Game words", hint "Developer: merge-conflict jokes. Regular: plain fighting-game words. Same game.", option "Developer" | Delete the row. |
| `components/ArenaGame.tsx:1110` | `{name} merged first.` (developer branch) | Always `{name} takes the floor.`; on Offsite `{name} wins the offsite.` |
| `components/lobby/lobbyView.ts:64` + `OnlineLobby.tsx:185` | `1v1 · first to {kos} takes the merge` | Always `1v1 · first to {kos} wins`; remove the `developer` flag. |
| `components/menu/MainMenu.tsx:611` | sub "Hotfix, Legacy, Standup or Intern" | "Kessa, Ormo, Zuzu or Tavo" (build it from `ROSTER` names, not a literal). |
| `game/sim/constants.ts:328-358` | names 'Hotfix', 'Legacy', 'Standup', 'Intern' | 'Kessa', 'Ormo', 'Zuzu', 'Tavo' |
| `game/roster.ts` | silhouette lines and accents | Kessa "Tall and thin, scarf streaming behind" `#E5392F`; Ormo "Wide block, giant moustache" `#14A37F`; Zuzu "Small, two round hair puffs" `#F25CB8`; Tavo "Huge pack higher than his head" `#2456D6` |
| `game/render/arena.ts:766-790` (office whiteboard) | `<<<<<<< HEAD`, `return "tabs";`, `=======`, `return "spaces";`, `>>>>>>> their-branch`, circled FIGHT | Same board, same fonts and colours: green line "WHO TOOK MY", ink line "LUNCH?!", grey line "not me", ink line "not me either", red tally marks; keep the circled FIGHT. |
| `game/render/arena.ts:179-196` (desk monitors) | coloured syntax-highlighted code lines | P2: spreadsheet look: white cells in a grid on `#0f1420`, one row in gold, one in teal. Players do not read it as code; only developers do. |
| `game/render/arena.ts:539-566` (wall monitors) | "build graphs and a burndown" | P2: keep the bar chart and the line (they read as generic office charts); change the red/green build colours to the four fighter accents. |
| `components/ArenaGame.tsx:1387` (lift loading checklist) | "Game code" | "The game" (it is a progress line, but "code" is the one dev word players see while waiting). |
| `README.md` lines 5, 11 | "Code review got personal...", "takes the merge" | Belongs to R-023 (rename); flag only. |
| `lib/links.ts:4` | support URL on an itch account named `mergeconflictgames` | Not copy; an account name the owner controls. Flag to Reis. |

Not developer copy, keep: "office", "coworkers", "floor", the office arena itself (an office is not a developer joke), Credits text, "Floor 42" (R-023 handles the name).

### 6.3 Fighter copy (role, pitch) for the select screen and nameplates

| id | role | pitch (max 110 chars) |
|---|---|---|
| kessa | The Overachiever | Tallest jumper on the team, and she will tell you. Hold jump at the top to hang in the air. |
| ormo | The Office Dad | Slow, wide and impossible to shove. Step away from the fight and he heals sooner. |
| zuzu | The Tiny Coach | Smallest, fastest, three jumps. Every hit she takes only makes her run faster. |
| tavo | The Over-Packer | Balanced in every stat. Packs extra ammo into every gun he picks up. |

Pitch lines name the trait; if the systems designer cuts a trait, cut that sentence.

## 7. Engineering notes

- **Ids.** `hotfix|legacy|standup|intern` appear in URLs (`/arena?p1=hotfix`), saved settings (`merge-conflict:character`), the online protocol and asset names. Recommended: rename to `kessa|ormo|zuzu|tavo` with an old-to-new map applied when reading saved settings and query strings, so old links still work. Online: both sides must ship together (or map on the server). If renaming is too costly now, keep the ids internal and change only the names: players never see ids. Engineering decides; the names are what matter creatively.
- **Re-render after the rigs change:** VS door portraits, menu poster(s), `WinnerSlab` / `LoserFace` art, the showcase, lobby scene, `public/` OG images if they show fighters.
- **Rim:** `RIM_COLOR` = the rim tints in section 4.
- **Traits:** do not implement before `game-systems-designer` writes the numbers (a separate request to the systems designer; not filed by me). They touch the shared sim, so online and bots must use the same values.

## 8. Acceptance criteria

1. No player-visible string anywhere in the game contains: merge, commit, branch, git, HEAD, code review, conflict (as a dev joke), main (as a branch), production, on-call, scrum, standup, hotfix, legacy, intern, developer. Check: grep the built `out/` HTML and JS strings for these words, list every hit, each must be an identifier or a storage key.
2. The first-entry audience question and the Settings "Game words" row are gone; a returning player with `audience: 'developer'` saved sees the one voice.
3. In-game at 1280x720 on Offsite, a screenshot cropped to each fighter at 50-55 px/m and turned into a flat black silhouette is identifiable by its hook alone (scarf line, moustache bar, two puffs, pack hump), from the side and the front.
4. Each fighter's top colour is within ΔE 2 of the accent hex; rim colour = the rim tint.
5. Idle, victory, defeat poses match the angle tables within ±10°; the scarf, puffs and pack hang on springs (they lag the body by at least 3 frames on a turn).
6. Old links (`?p1=hotfix`) still start a match with Kessa.

## 9. Limitations

- The concept sheets are three.js builds in headless Chromium, not in-game captures: game lighting, tone mapping and the follow camera will shift colours somewhat. Criterion 3 must be checked in the game.
- Name checks are single web searches (listed per fighter), not trademark clearance. Before the names go on a store page, run them through EUIPO TMview / USPTO (free, about 15 minutes for all four).
- No player has seen these. The cheapest test: show `sheet-overview.png` to 5-10 people who are not developers and ask "which one is yours, and why?" If the answers name the hook or the personality, it works.
- I did not watch the GDC talks or play the competitor games for this pass; the research comes from the papers, slide decks and articles cited.
