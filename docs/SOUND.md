# Sound budget

All sound is in `src/game/sfx.ts` (synthesised, plus recorded guns and reloads); the menus use the same engine through
`src/components/menu/menuSound.ts`. The limits live in `src/game/audioBudget.ts`, and `src/game/audioBudget.test.ts`
fails if a gated sound has no row or a row goes unused.

## The graph

```
voices ─> sfx (Effects) / ui (UI) / amb (0.5, ducked) / guns (Guns) ─┬─> compressor ─> master (Master, mute) ─> limiter ─> out
                                          └─ room reverb send ─────────┘
```

- Compressor: threshold -14 dB, ratio 5. Limiter: threshold -3 dB, ratio 20, 1 ms attack.
- No ambience bed: a noise loop read as old-TV static, so the room is quiet between fights. Keep it that way unless a
  bed is low-passed and at or under -55 dBFS.

## Limits

| Sound | Cooldown | Voices | Note |
| --- | --- | --- | --- |
| gunshots | - | 6 (SHOT_BUDGET) | |
| bullet impact | 30 ms | 3 | a shotgun blast is three ticks, not eight |
| hit | - | 3 | |
| deflect / jump / dash / land | 60-80 ms | 2 | |
| push | 120 ms | 2 | |
| glass (wall splat) | 150 ms | 1 | ducks the room |
| explosion / KO | 90 / 150 ms | 2 | duck the room |
| reload | - | 2 | |
| empty (out of ammo) | 250 ms | 1 | the mistake click, once |
| menu tick / confirm / back | 40 / 80 / 80 ms | 2 / 1 / 1 | menuSound also keeps 40 ms between ticks |
| stamp / stampBig | 60 / 150 ms | 2 / 1 | `<Stamp>` md-lg / xl; ui bus |
| doorSlam / liftDing / floorTick | 150 / 300 / 70 ms | 1 / 1 / 2 | lift doors, ui bus |
| winSting / lossSting | 300 ms | 1 | old result screen, ui bus |
| resultWhoosh / drumroll / partyHorn / wahwah / thud / slideWhistle | 150-300 ms | 1 | Field Day result reveal (spec 4), ui bus, synth stand-ins |
| ding / softPop | 100 / 40 ms | 2 | award dings (3 rising), button pops |
| crowd | 1000 ms | 2 | murmur under the result idle, repeated to 8 s |

## Adding a sound

1. Does a visual or an existing sound already say it? Then no new sound.
2. Add a row to `BUDGET` and here; gate the function with `may('name')`.
3. Pick the bus (sfx, ui, amb, guns). Never connect to `ctx.destination`.
4. Vary pitch and gain (`tone` and `noise` already do).
5. Dev check: `sfx.stats()` gives plays and drops per gated sound.
