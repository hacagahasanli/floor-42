# Floor 42: weapon balance

Every gun has one job, and no gun is best everywhere. The numbers live in `GUNS` (`src/game/sim/constants.ts`).
`src/game/sim/balance.ts` computes time to kill (TTK) from them, and `src/game/sim/balance.test.ts` fails if a
change breaks a role. Change a gun, run the tests, then update this table.

## How TTK is computed

TTK is the time from the first shot to the KO of a fighter at full health (100 hp). The model follows the rules in
`step.ts`:

- **Falloff.** Full damage up to `near`, then a straight line down to `min` × damage at `far` and beyond.
- **Spread.** Each shot leaves at a random angle within ±`spread`. At range only some shots (or pellets) land on a
  body 1.7 m tall, so the model uses expected damage: hit chance × damage.
- **Reach.** A shot disappears after `life` seconds, so nothing lands past speed × life. The shotgun reaches about 9 m.
- **Time.** The first shot leaves at t = 0 and the rest follow every `rate` seconds. An empty magazine adds the
  reload. The last shot's flight time is included, which matters most for the slow rocket.
- **Not modelled:** knockback (each pistol hit pushes the target back about 5 cm), aim error, dodging, and health
  regen, which never starts mid-fight because every hit resets its 4 s timer.

Because spread and flight time are included, the "before" numbers are a little slower than a damage-only count.
For example, the old pistol shows 0.48 s at 3 m instead of 0.38 s.

## Before and after

Damage is per trigger pull (shotgun: 6 pellets). DPS is full damage ÷ rate, ignoring reloads. TTK is in seconds,
with shots needed in brackets; ∞ means the gun cannot kill at that range.

### Before

| Gun | Damage | Rate (s) | DPS | Mag | TTK 3 m | TTK 10 m | TTK 20 m | What it actually did |
|---|---|---|---|---|---|---|---|---|
| Pistol | 50 | 0.38 | 132 | 8 + ∞ | 0.48 (2) | 1.09 (3) | 1.81 (4) | Killed in two shots out to about 6 m: the starting gun was a top close-range gun |
| SMG | 34 | 0.11 | 309 | 20 + 40 | 0.31 (3) | 0.75 (5) | 2.05 (14) | Best gun at every range that mattered: fastest automatic kill close and mid |
| Uzi | 12 | 0.055 | 218 | 32 + 32 | 0.54 (9) | 1.60 (24) | 5.06 (59) | Worse than the SMG at every range |
| Shotgun | 6 × 20 | 0.9 | 133 | 4 + 8 | 0.11 (1) | ∞ | ∞ | One blast out to about 3 m |
| Sniper rail | 100 | 1.4 | 71 | 3 + 3 | 0.02 (1) | 0.06 (1) | 0.13 (1) | Power weapon |
| Rockets | 110 | 1.1 | 100 | 2 + 4 | 0.21 (1) | 0.71 (1) | 1.43 (1) | Power weapon |

### After

| Gun | Damage | Rate (s) | DPS | Mag | TTK 3 m | TTK 10 m | TTK 20 m | Role |
|---|---|---|---|---|---|---|---|---|
| Pistol | 50 | 0.38 | 132 | 8 + ∞ | 0.86 (3) | 1.09 (3) | **2.19 (5)** | Reliable baseline. Two hits only point blank (under 2.5 m), three across a room, and the most accurate small gun at long range |
| SMG | 30 | 0.14 | 214 | 20 + 40 | 0.51 (4) | **0.73 (4)** | 2.31 (13) | Mid-range sprayer. The best small gun across a room, never the fastest close kill |
| Uzi | 14 | 0.05 | 280 | 32 + 32 | **0.45 (8)** | 1.88 (32) | 5.02 (64) | Close-range shredder. The fastest kill at 3 m and the highest DPS, but sprays wide and fades fast |
| Shotgun | 6 × 18 | 0.8 | 135 | 4 + 8 | 0.91 (2) | ∞ | ∞ | Close burst. One blast point blank (under about 2.6 m), two blasts from 3 to 5 m, nothing past 9 m |
| Sniper rail | 100 | 1.4 | 71 | 3 + 3 | 0.02 (1) | 0.06 (1) | 0.13 (1) | Power weapon. Kills in one at any range; costs: top floor only, 6 shots, slowest to fire again, slows your run |
| Rockets | 110 | 1.1 | 100 | 2 + 4 | 0.21 (1) | 0.71 (1) | 1.43 (1) | Power weapon. Kills in one with splash; costs: slow enough to see and dodge at range (1.4 s to cross 20 m), 45 % self-damage, 6 shots |

Bold marks the fastest small gun at each range. Each range has a different winner (Uzi, SMG, pistol), and that is
the core of the balance.

Extra points from the same model, after the change:

| Gun | 1.5 m | 5 m | 15 m |
|---|---|---|---|
| Pistol | 0.43 (2) | 0.93 (3) | 1.64 (4) |
| SMG | 0.47 (4) | 0.58 (4) | 1.45 (8) |
| Uzi | 0.40 (8) | 0.57 (9) | 4.05 (48) |
| Shotgun | 0.05 (1) | 0.98 (2) | ∞ |

The Uzi and the SMG cross over at about 5 m.

## What changed and why

| Gun | Change | Reason |
|---|---|---|
| Pistol | falloff near 6 → 2.5 m, min 0.5 → 0.45 | Everyone spawns with it, so it should be dependable, not a top pick. It used to two-shot out to 6 m, beating every automatic gun up close. Now two hits only point blank. Damage stays at 50, its accuracy keeps it the best small gun at 20 m, and its ammo never runs out. |
| SMG | damage 34 → 30, rate 0.11 → 0.14 s, spread 0.10 → 0.08, falloff 5→16 m → 6→18 m | It was the best gun nearly everywhere. Slower fire costs it the close fight, where it now takes four hits and loses to the Uzi. Tighter spread and a later falloff make it the clear pick at 10 m. |
| Uzi | damage 12 → 14, rate 0.055 → 0.05 s, falloff 4→12 m min 0.5 → 3→10 m min 0.4 | It was worse than the SMG at every range. Now it has the highest DPS (280) and the fastest close kill, paid for by a wide spread and steep falloff: at 10 m it takes more than twice as long as the SMG. Each round still does less than half an SMG round, so it still feels like a spray gun. |
| Shotgun | damage 20 → 18 per pellet, rate 0.9 → 0.8 s, spread 0.26 → 0.20, falloff 2→7 m min 0.4 → 2→8 m min 0.35 | One blast at 3 m beat the Uzi's whole role. Now the one-shot is a point-blank reward. A faster pump and a tighter cone make it a dependable two-blast kill from 3 to 5 m (it used to need three blasts at 5 m). |
| Sniper rail, Rockets | none | Both already kill in one, and their costs are real: top floor only (15 s respawn), six shots, slow to fire again (1.4 s, 1.1 s), slower running (carry 0.88), heavy recoil. The rocket's speed of 14 m/s makes it dodgeable at range. The tests now pin these costs down. |
| Bot | preferred range: Uzi 3–8 → 2–5 m, shotgun 2.5–5 → 1.5–3.5 m | So the bot plays each gun where it is strong. |

Spawn weights are unchanged: lower floors SMG : shotgun : Uzi = 3 : 3 : 2, top floor rail : rockets = 2 : 3.

## What the tests guard (`balance.test.ts`)

- Pistol: two hits at 1.5 m, at least three at 3 m, at most three at 10 m, under 2.5 s at 20 m, and faster at 20 m
  than the SMG and the Uzi.
- Uzi: faster at 3 m than the pistol, SMG and shotgun; higher DPS than the SMG; more than 2× the SMG's TTK at 10 m
  and more than 2× the pistol's at 20 m.
- SMG: faster at 10 m than the pistol and the Uzi, under 1 s there; slower than the Uzi at 3 m; under 3 s at 20 m.
- Shotgun: one blast at 1.5 m and 2.5 m, two at 3 m, at most two at 5 m, no kill past its reach (under 10 m),
  pump of at least 0.7 s.
- Rail and rockets: one shot at 3, 10 and 20 m; at most 6 shots; at least 1 s between shots; slower running; the
  rocket takes over 1 s to cross 20 m; the rail is the slowest gun to fire again.
- Across the small guns, the fastest at 3, 10 and 20 m is the Uzi, the SMG and the pistol, in that order.

## Crouching

A crouched fighter is 52 % of their height (`CROUCH`, `constants.ts`). A shot fired at a standing chest or head
flies over it, but auto-aim and the bot aim at the crouched chest, so crouching dodges shots already in the air,
not the next ones. In the TTK model a crouched target only shrinks the vertical window (`CROUCHED_HALF_HEIGHT`):

| Gun | TTK 3 m standing / crouched | TTK 10 m standing / crouched | TTK 20 m standing / crouched |
|---|---|---|---|
| Pistol | 0.86 / 0.86 | 1.09 / 1.09 | 2.19 / 2.19 |
| SMG | 0.51 / 0.51 | 0.73 / 1.29 | 2.31 / 5.38 |
| Uzi | 0.45 / 0.45 | 1.88 / 4.53 | 5.02 / ∞ (out of ammo) |
| Shotgun | 0.91 / 0.91 | ∞ / ∞ | ∞ / ∞ |
| Sniper rail | 0.02 / 0.02 | 0.06 / 0.06 | 0.13 / 0.13 |
| Rockets | 0.21 / 0.21 | 0.71 / 0.71 | 1.43 / 1.43 |

Up close crouching changes nothing. The pistol, the rail and rockets ignore it at any range. Only the sprayers lose
shots on the smaller body across a room, which is already outside their role. Splash still finds a crouched
fighter (a rocket into the floor, a bomb), and shotgun pellets aimed at a standing chest still catch one up close.
`src/game/sim/crouch.test.ts` checks all of this in the real sim, including every gun knocking out a crouched
fighter it aims at.
