# Baseline: today's bot (src/game/sim/bot.ts) vs scripted players, 2026-11-28
`npx tsx tools/balance/smartbot/vs.ts --grid --seeds 100 --arenas offsite,office` (traits on, 200 matches per row)

| A | B | arena | A win % ±95% | KOs A:B | len p10/p50/p90 s | A dodges/push/splat/pickups per match |
|---|---|---|---|---|---|---|
| bot:easy | masher | offsite | 3.0 ±2.4 | 1.94:4.97 | 43/60/86 | 2.5/0.4/0.10/3.9 |
| bot:easy | strafer | offsite | 3.5 ±2.5 | 2.02:4.96 | 31/40/48 | 1.5/0.3/0.04/3.0 |
| bot:easy | decent | offsite | 0.5 ±1.0 | 1.40:4.99 | 27/34/42 | 1.2/0.1/0.01/2.4 |
| bot:normal | masher | offsite | 32.0 ±6.5 | 3.50:4.48 | 46/60/80 | 6.4/0.6/0.14/4.9 |
| bot:normal | strafer | offsite | 22.5 ±5.8 | 3.50:4.67 | 34/41/48 | 3.7/0.6/0.05/4.7 |
| bot:normal | decent | offsite | 12.5 ±4.6 | 2.82:4.82 | 29/37/44 | 3.0/0.2/0.01/4.5 |
| bot:hard | masher | offsite | 48.5 ±6.9 | 4.01:4.08 | 44/57/73 | 8.6/0.8/0.13/4.7 |
| bot:hard | strafer | offsite | 51.5 ±6.9 | 4.27:4.20 | 35/43/50 | 6.1/0.7/0.07/4.5 |
| bot:hard | decent | offsite | 28.5 ±6.3 | 3.65:4.49 | 31/39/45 | 4.9/0.3/0.03/4.4 |
| bot:easy | masher | office | 4.0 ±2.7 | 2.00:4.95 | 42/64/93 | 2.7/0.6/0.04/3.7 |
| bot:easy | strafer | office | 3.0 ±2.4 | 2.00:4.97 | 32/40/54 | 1.5/0.3/0.04/3.0 |
| bot:easy | decent | office | 0.5 ±1.0 | 1.00:5.00 | 27/33/43 | 1.0/0.1/0.02/2.2 |
| bot:normal | masher | office | 51.5 ±6.9 | 3.90:3.91 | 45/63/100 | 7.3/0.5/0.06/4.7 |
| bot:normal | strafer | office | 36.0 ±6.7 | 3.67:4.38 | 34/44/53 | 4.0/0.4/0.08/4.6 |
| bot:normal | decent | office | 16.5 ±5.1 | 2.66:4.71 | 29/38/48 | 2.9/0.2/0.03/4.3 |
| bot:hard | masher | office | 66.0 ±6.6 | 4.35:3.45 | 42/59/91 | 9.4/0.7/0.10/4.5 |
| bot:hard | strafer | office | 63.0 ±6.7 | 4.41:3.85 | 34/43/51 | 6.0/0.6/0.09/4.4 |
| bot:hard | decent | office | 22.0 ±5.7 | 3.02:4.58 | 31/39/47 | 4.9/0.2/0.02/4.3 |

Online case (office, traits OFF, 200 matches per row): bot:normal vs masher 48.0 ±6.9, strafer 35.0 ±6.6, decent 14.0 ±4.8.
Smart normal, same case: masher 61.0 ±6.8, strafer 68.0 ±6.5, decent 32.0 ±6.5.
Leapfrog triggers per BRIX match vs decent (OFFSITE): bot:normal 0.06, smart:normal 0.26, smart:hard 0.18 (smart normal with leapfrog chance 0.5: 0.22).
