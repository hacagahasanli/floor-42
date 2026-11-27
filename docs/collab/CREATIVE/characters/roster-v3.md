# Roster v3: every one a fighter (R-022b)

Creative Director, 2026-11-28. Supersedes the look, poses and Kessa/Tavo concepts in `roster-v2.md`. Still valid from v2: the rules in section 3 (theme, adults, mix), the accent colours and their contrast/colour-blind checks (section 4, accents unchanged), the copy pass (section 6), the engineering notes (section 7).

- Overview: `roster-v3/sheet-overview.png` (lineup of all six options, A/B brackets, all six defeat poses side by side, silhouette row)
- Sheets (1920x1080): `roster-v3/sheet-brix.png`, `sheet-margo.png`, `sheet-ormo.png`, `sheet-zuzu.png`, `sheet-tavoA.png`, `sheet-tavoB.png`
- Source: `roster-v3/sheets.html` (live three.js, same joint layout as `src/game/render/characters.ts`; every angle on a sheet is the value in `POSES`). Re-render: `cd roster-v3 && node render.mjs`.

## 0. The owner picks two letters

| Slot (stats unchanged) | Option A | Option B | CD pick |
|---|---|---|---|
| hotfix (tallest, light, highest jumps) | **BRIX**, The Jammer: roller-derby skater, black helmet with one scarlet racing stripe, pads, skates (R-024: no star). Trait **LEAPFROG** | **MARGO**, The Black Belt: power suit with huge shoulder pads, black belt tied over it, top-knot, barefoot. Trait **AXE DROP** | **A, Brix** |
| legacy (widest, heaviest) | **ORMO**, The Office Dad, pushed: silver quiff, silver mutton chops into a walrus moustache, argyle vest (R-024), sumo-wide stance, ham fists, sips tea mid-fight. Trait TEA BREAK (unchanged) | - | - |
| standup (smallest, fastest, 2 air jumps) | **ZUZU**, The Tiny Coach, improved: gold punch mitts, headband. Trait SUGAR RUSH (unchanged) | - | - |
| intern (balanced) | **TAVO**, The Trailblazer: same pack and spill, plus headlamp, rolled sleeves, frying pan, brawler crouch | **TAVO**, The Snack Guard: team cooler on his back, cap backwards, boxer's guard | **A** |

Why my picks: **Brix** is the only fighter on wheels and the only one in armour, nothing else in the roster or in the obvious competitors looks like her, and her trait creates the highlight play (jumping over the rival's head). Margo is strong, but "martial artist in office clothes" is a more familiar joke. **Tavo A** keeps everything the owner liked in v2 (the towering pack, the spilled-lunch defeat) and only changes his attitude; B loses the tall pack hump, which was his silhouette, and its snack joke overlaps Tavo A's sandwich gag.

## 1. What was wrong with v2 (owner verdict + my own read of the v2 sheets)

1. **Nobody stood like a fighter.** v2 idles were standing, hands loose or behind the back. In a fighting game the idle is the character's first sentence: weight forward, knees bent, hands up.
2. **Faces had no attitude.** Two dot eyes and no brows or mouth on every fighter. v3 adds a face kit (section 3): angled brows and a mouth per expression, X eyes for knockouts. It is the cheapest attitude upgrade there is.
3. **Kessa's hook (a scarf) was decoration, not a fight.** A scarf says "jogger". Both new options wear their fighting on the body: armour and skates, or a belt and a guard.
4. **Tavo looked nervous** (glasses, bucket hat, thumbs in straps). His defeat was the best pose in v2 because it told a story with props. v3 makes that the bar for every defeat.

## 2. What makes a fighter instantly lovable (principles used)

Research from v2 still applies (Valve TF2 silhouette and rim light, Overwatch/Blizzard shape language, Supercell's brawler pillars); sources listed in `roster-v2.md` section 2. Added for v3, my interpretation, not a cited finding:

- **Stance is attitude.** Fighting-game idles never stand straight; the idle is the pose players see most on select and between exchanges.
- **Shape language for aggression:** an upside-down triangle (big shoulders, small waist) reads as power; big hands on a small body read as a boxer; armour and pads read as "dressed for contact".
- **The gimmick is the job, not a costume:** a jammer jumps over blockers, so her trait is jumping over the rival. The personality, the look and the trait are one idea (Supercell's "physical gag becomes a mechanic", v2 section 2).
- **Defeat and victory are stories with props** (owner, 2026-11-28, using Tavo's v2 defeat as the bar): what falls out, what breaks, what they cling to. Every defeat in v3 has one prop that tells it, and each one is readable without text (overview strip).

## 3. Face kit (all fighters)

Built in `face()` in `sheets.html`. On the head, front: eyes 0.042 x 0.06 boxes at x ±0.37 headR; brows 0.085 x 0.026 at y +0.085 (Ormo 0.12 x 0.045, moustache colour); mouth at y -0.075.

| Expression | Brows (z on the +x brow; mirrored) | Eyes | Mouth | Used for |
|---|---|---|---|---|
| angry | +20 (inner ends down) | normal | flat line 0.085 | idles (Margo, Ormo, Tavo B) |
| grin | +14 | normal | dark 0.12 x 0.05 with teeth 0.1 x 0.03 (Brix: gold mouthguard) | Brix, Tavo A idle; victories |
| smug | one up, one down | normal | grin tilted 6 | taunts |
| shout | +26 | normal | open 0.09 x 0.07 | Zuzu idle/taunt/defeat |
| shock / sad | -6 / -20 (worried) | tall / normal | small open / frown | Margo / Ormo, Tavo B defeats |
| closed | -4 | lines | small line | Ormo victory and taunt |
| ko | -10 | X (two 0.075 bars at ±45) | frown | Brix, Tavo A defeats |

Engineering: switch the expression by state (idle → angry/grin, hit → shock for 0.2 s, KO → ko, result → victory/defeat set). Two extra boxes per eye/brow/mouth; merge per expression if draw calls matter.

## 4. The fighters

Joint conventions as v2 (shoulder/hip x < 0 swings forward/up; z > 0 lifts the left limb sideways, mirrored; elbow x < 0 folds forward; knee x > 0 folds back). Exact angles for every pose are in `POSES` in `sheets.html` and on the sheets.

### 4.1 KESSA SLOT, OPTION A: BRIX, The Jammer

- **Who:** runs the mailroom on roller skates, plays roller derby every weekend. Trash talk, laughs with her mouthguard in.
- **Catchphrases:** "Catch me." · "Too slow. Lap's mine." · "Lap two!"
- **Hook (R-024):** matte black helmet (`#1B1F2E`) with ONE raised scarlet racing stripe front to back, edged by two cream pinstripes; big black knee and elbow pads; cream skates with a scarlet cuff and scarlet wheels, black toe stop. Two short braids with gold beads. No star anywhere, no helmet cover, no gold discs. All armour is black, she is red.
- **Why a fighter:** dressed for contact, leaning forward on skates like the whistle just went.
- **Poses:** idle skater crouch, rolling 0.15 m side to side at 1 Hz, never still · victory: two-turn spin on one skate, arm up, leg out · **defeat (R-024): flat on her back, legs in the air, X eyes; her right skate has come off and lies upside down beside her, wheels to the sky (they keep spinning in motion), a cream sock with a red stripe where it was; mouthguard on the floor** (lost a skate: race over) · taunt: knocks twice on her helmet stripe, points two fingers at the rival.
- **Trait idea: LEAPFROG.** Jump clean over the rival's head (her feet pass above the rival's top while crossing their x) and her dash cooldown resets. Guard: once per jump, dash cooldown only, no damage. It rewards the riskiest play in the game, which is the jammer's job.
- **Colours:** jersey, helmet stripe, wheels `#E5392F` (slot accent), skates and trims `#FFF1DC`, helmet/pads/legs `#1B1F2E` (dark anchor), mouthguard `#FFC83D`, skin `#7A4A2E`, rim `#FFB3A8`.
- **Build:** height 2.0 m includes the skates (legLen 0.78 + 0.14 skate). Skates change the run: either a skate stride (push-glide, 2 strides/s, more work) or keep the run cycle and accept the look; my recommendation is the stride, it is half her character. Each skate is its own group so the right one can come off on KO.
- **Name check:** `"Brix" video game character`: an indie itch.io platformer (Mr. Brix) and a 1991 DOS puzzle game called Brix (no character); also the Brix sugar scale. Low risk. Backups: **Dottie** (`"Dottie" OR "Irma" video game character famous`: a minor 102 Dalmatians dog, nothing major), **Kessa** (v2 check, clean). Rejected: **Zetta** (Lord Zetta, Disgaea series), **Tika/Rava** (Tika Waylan in Dragonlance; Raava in Avatar), **Vesna** (a Genshin Impact 5-star released September 2026).

### 4.2 KESSA SLOT, OPTION B: MARGO, The Black Belt

- **Who:** the boss's assistant; runs his diary to the minute; black belt since she was nine. Wears the belt over the power suit, fights barefoot.
- **Catchphrases:** "You're not in my diary." · "Hai!" · "Next."
- **Hook:** huge square shoulder pads (0.3 x 0.15, sloped 14° up and out), black belt with two tails over a scarlet suit, a black top-knot. Upside-down triangle silhouette.
- **Why a fighter:** the most aggressive body shape, and a real side-on guard as her idle.
- **Poses:** idle side-on guard, switch-step bounce · victory: held high side kick at head height, leaning away · **defeat: kneels holding her untied black belt across both hands, in shock; the top-knot has flopped over one ear** · taunt: brushes dust off her shoulder pad, nose up, then a tiny bow.
- **Trait idea: AXE DROP.** Press down in the air to fall fast. Guard: movement only; it makes the tallest, floatiest fighter harder to read, not stronger.
- **Colours:** suit `#E5392F`, belt/hair `#14121A`, trousers `#2B2433` (dark anchor), blouse `#FFF1DC`, skin `#E2A27A`, rim `#FFB3A8`.
- **Name check:** `"Margo" video game character OR fighter`: minor hits (a Riddick NPC, a small indie point-and-click). Not on a search result but known to me: Margo is a daughter in *Despicable Me*; a common real first name, low risk. Backups: **Irma** (minor Queen's Blade fighter, low risk), **Dagny** (Dagny Taggart, heroine of *Atlas Shrugged*; medium risk, weakest backup).

### 4.3 ORMO, The Office Dad (pushed)

- **Changes vs v2:** sleeves rolled to the elbow, thicker forearms and bigger fists (fist 1.6 x armR); idle from hands-behind-back to a sumo-wide stance with ham fists low and forward; taunt sips tea mid-fight (attitude through calm).
- **Look after R-024 (IP pass):** full head of silver hair (`#CFC9BF`, shade `#A9A297`) with a swept quiff; silver mutton chops that run down the cheeks into a wide, bushy **walrus moustache** whose ends hang down (a silver horseshoe round the face, no pointed tips); brows silver, thinner (0.11 x 0.032) and at 55 % of the face-kit angle; **no round belly**: a broad square chest; **argyle sweater vest** (`#14A37F` with `#0B6B52` diamonds and small cream diamonds, diamonds also on both sides so the side camera sees them) over a cream shirt with collar points and a wide brick tie (`#A8483A`); grey slacks `#6B6F78`. Nose small. Thermos and red cup unchanged.
- **Defeat:** sits down hard; the thermos has tipped and spilled a tea puddle, the cap rolled away; he holds the empty cup upside down and peers into it; walrus ends droop 32°.
- **Victory:** toasts with the cup, eyes shut, walrus ends lift 18° into a smile, left fist thumps his chest.
- Trait, name, backups, slot accent `#14A37F`: unchanged.

### 4.4 ZUZU, The Tiny Coach (improved)

- **Changes vs v2:** gold punch mitts (0.2 x 0.22 x 0.13, white target ring, red centre) replace the fists: big hands on a small body; pink headband; shouting face.
- **Idle:** low crouch, mitts at the chin, bounce 0.05 m at 3 Hz, smacks the mitts together every 2 s.
- **Defeat (new):** sits on the floor and holds a **red card** (0.26 x 0.36, `#E5392F`) high at the camera, mouth wide open: she is protesting the call. Pure Zuzu: she never accepts a loss.
- **Taunt:** points a mitt and blows the whistle (whistle moves to the mouth).
- Trait, name, colours: unchanged; mitts and shoes `#FFC83D`. Owner: keep the name ZUZU.

### 4.5 TAVO, OPTION A: The Trailblazer (CD pick)

- **Kept from v2:** the towering orange pack with the green mat (his silhouette), Packed Extra, the spilled-lunch defeat.
- **Changed:** glasses and bucket hat out; short hair, green bandana with a headlamp; sleeves rolled, dark fingerless-glove fists; a frying pan hangs on the pack's side (a round shield shape that breaks the outline); brawler crouch with one fist up as the idle; grin.
- **Defeat (v2, upgraded):** sits, legs out, pack slid off, mug and sandwich spilled, **and the frying pan has landed on his head**, tilted, X eyes, three gold stars circling.
- **Taunt:** takes a slow bite of a sandwich, staring the rival down.
- **Name:** TAVO kept (owner: "Tavo isn't bad"). Backups as v2 (Benno, Fenn).

### 4.6 TAVO, OPTION B: The Snack Guard

- **Change:** the pack becomes the team cooler (white body `#F4F2EC`, cobalt lid and band, handle), orange cap backwards with the shades on it, short sleeves, shorts and high socks; boxer's guard idle; protective attitude ("Hands off the cooler.").
- **Defeat:** face down, the cooler burst open, ice cubes and juice boxes everywhere, one arm stretching for the last juice box just out of reach.
- **Victory:** sits on the cooler, fists on knees, chin up. **Taunt:** sips a juice box loudly.
- Weakness (why it is not my pick): the cooler top sits at head height, so he loses the "hump above the head" that made Tavo readable in v2.

## 5. Fighter copy (replaces roster-v2 section 6.3 once the owner picks)

| id | role | pitch (max 110 chars) |
|---|---|---|
| kessa slot A: brix | The Jammer | Tallest, highest jumps, on skates. Jump clean over the rival and her dash is ready again. |
| kessa slot B: margo | The Black Belt | Tallest jumper, and she stops on a dime: press down in the air to drop like a stone. |
| ormo | The Office Dad | Slow, wide and impossible to shove. Step away from the fight and he heals sooner. |
| zuzu | The Tiny Coach | Smallest, fastest, three jumps. Every hit she takes only makes her run faster. |
| tavo (A or B) | The Trailblazer / The Snack Guard | Balanced in every stat. Packs extra ammo into every gun he picks up. |

If the Kessa slot becomes Brix or Margo, the id map in v2 section 7 changes accordingly (`hotfix` → `brix` or `margo`; old links keep working through the map).

## 6. Acceptance criteria (additions to v2 section 8)

1. Every fighter's idle is a crouched or guarded stance with the angles on the sheet (±10°); no idle has both hands below the hips.
2. The face kit shows the expression per state (section 3); the KO frame shows X eyes for Brix / Tavo A.
3. Every defeat pose shows its story prop at 1280x720 on the result screen: Brix's upside-down skate on the floor, Margo's belt in her hands, Ormo's tea puddle and upturned cup, Zuzu's red card, Tavo's pan on his head, (B) the open cooler and the out-of-reach juice box. Check: crop the result-screen fighter to 300 px tall; a person who has not read this doc names the prop.
4. Brix's right skate and Tavo A's pan are separate meshes that can detach on KO.
5. (R-024) No star or coin shape on Brix; Ormo is never bald, his moustache never has upturned pointed tips, and his top is never plain green without the argyle.

## 7. Limitations

- Sheets are three.js builds in headless Chromium, not in-game captures; game lighting, tone mapping and camera will shift them. The silhouette tests on the sheets are the orthographic 50 px/m approximation, not in-game crops.
- Weak spots I see in my own renders: Margo's taunt (shoulder brush) does not read at thumbnail size; Brix's black helmet merges with her brows from the front (the scarlet stripe carries the read); Tavo B's victory reads as "sitting", not yet as "throne".
- Name checks are single web searches each (queries above), not trademark clearance; run EUIPO TMview / USPTO before store use.
- No player has seen these. Cheapest test: show `sheet-overview.png` to 5-10 non-developers, ask "which one is yours, and why?" and "what happened to each in the bottom row?"
- Traits are ideas; `game-systems-designer` sets numbers. LEAPFROG needs a clean-pass test (rival under her feet while crossing x) that is identical online and for bots.
- Roller-derby and martial-arts details were checked only against the WFTDA rulebook archive (helmet stars); no derby or martial-arts practitioner reviewed them.

## 8. R-024 IP pass (2026-11-28): why ORMO and BRIX no longer read as protected characters

Trigger: ip-guard check 2026-11-28 (not legal advice). This is a design note, not a legal opinion.

**ORMO.** The flag was the *combination* bald head + round belly + heavy dark brow + pointed dark moustache + green top, which together read near Wario (and weakly Luigi, Eggman). Every element of that set is now gone or inverted: he has a full silver head of hair with a quiff (all three references are bald or capped); the round belly is replaced by a square chest (all three are egg-shaped); the moustache is a silver walrus joined to mutton chops, hanging down and covering the mouth, where Wario's is a dark zigzag with upturned points and Eggman's a large ginger handlebar; the brows are silver and light; the green is now a patterned argyle sweater vest with shirt collar and tie, an office-dad garment none of them wear. The read is "grandad from accounts", not a plumber or a scientist. I did not make it a curled handlebar (ip-guard's option) because a big curled handlebar on a round man is the Eggman read. Residual risk I checked for: white hair + white moustache + string tie reads near a fast-food mascot, so the tie is a wide brick tie, there is no goatee, no glasses, no white suit.

**BRIX.** The flag was the red helmet with stars + red top (near Skylanders' Roller Brawl) and star motifs near Brawl Stars. The helmet is now matte black with a single scarlet racing stripe and cream pinstripes; there is no star or cover anywhere on her, in any pose, and the gold wheels became scarlet so no gold discs (coin read) appear, even on the upside-down skate in the defeat. The KO story moved from "star cover popped off" to "lost a skate", which is just as readable (a large cream boot, wheels up) and still pure roller derby. The red jersey stays because it is the slot accent used across the UI; with the helmet black she reads "black armour, red player". I removed a cream side-panel stripe I tried in this pass because it formed a white cross on red (protected emblem). I could not verify Roller Brawl's exact colours (one web search, no image access), so the change targets the cues ip-guard named.

Not verified: an ip-guard re-check of these sheets; in-engine look; player reactions.
