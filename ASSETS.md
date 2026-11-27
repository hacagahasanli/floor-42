# Assets

Almost everything in Floor 42 is built in code: the office, the fighters, the guns, the effects and
most sounds (synthesised with WebAudio in `src/game/sfx.ts`). The exceptions are listed here.

| What | Source | Author | Licence | Files |
| --- | --- | --- | --- | --- |
| Gunshots (9mm, 5.56, 20 gauge, 7.62x54R), pump, bolt, magazine change | [Snake's Authentic Gun Sounds](https://f8studios.itch.io/snakes-authentic-gun-sounds) 1 and 2 | Snake (f8studios) | Free, commercial use allowed, credit not required (author's terms on the itch.io page) | `public/assets/sounds/*.m4a` |

The sounds are edited for the game: trimmed to 1.1–2.2 s with a fade-out and encoded as AAC. Credit is
not required, but the author asked for it, so: gun sounds by Snake (f8studios.itch.io). Thank you.

## Fonts (Field Day UI)

| What | Source | Author | Licence | Files |
| --- | --- | --- | --- | --- |
| Titan One (display) | Google Fonts, latin subset as served (11 KB) | Rodrigo Fuenzalida | SIL Open Font License 1.1, Reserved Font Name "Titan" (do not ship a modified copy under that name) | `src/components/fieldday/fonts/TitanOne-Regular.woff2`, licence `public/licenses/OFL-TitanOne.txt` |
| Baloo 2 (UI text), weights 500/600/700/800 | Google Fonts, latin subsets as served (about 19 KB each) | The Baloo 2 Project Authors (Ek Type) | SIL Open Font License 1.1 | `src/components/fieldday/fonts/Baloo2-*.woff2`, licence `public/licenses/OFL-Baloo2.txt` |

Self-hosted (no request leaves the bundle). The two licence texts ship in the build: `public/licenses/` is served by the site and copied to `dist/portal/licenses/` by `vite.portal.config.ts`. Total font weight is 87 KB, so no further subsetting was done.
