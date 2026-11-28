# Field Day design system (Direction B)

Spec: `docs/collab/CREATIVE/ui/direction-b/spec.md` (mockups in `png/`, CSS source in `index.html`). Import from `~/components/fieldday`.
Everything is scoped to `.fd` and prefixed `fd-` (`fieldday.css`); old screens are untouched. All sizes are design px on a 1280x720 frame.

## Shell
- `<Stage>` scales the frame (s = min(w/1280, h/720)), sets `data-kbd` (focus ring shows after a key or pad, hides after a pointer press), `data-reduced` (Settings > Reduced motion or the OS: no bob, shine, spin, sway, confetti, static ring, 120 ms fades) and `--s`. It fills its parent (`position: relative` parent).
- `<Frame>` is the 720-high frame centred in the stage; anchor children with `left/right/top/bottom` in design px. Wider windows add space between anchors. Bunting hangs from the stage top (put `<Bunting/>` outside `Frame`). `useStage()` gives `{ s, w, h, reduced }`.
- Screen entrance: wrap content in `className="fd-enter"` (spring from 40 px, 220 ms).

## Parts
- Colour balance (R-027, `CREATIVE/ui/direction-b/colour-balance.md`): sun = the ONE action per screen, white = every other control, grape = structure, fighter accents only on things that ARE a fighter. Tang only for the bunting, the wordmark and the `warn` confirm; `--ok` only for tiny status marks.
- R-028 (colour-balance.md section 8): a persistent selected state (Settings tab `.fd-tab.fd-sel`, `Segmented`, `Toggle` ON, `Slider` fill) is `--grape-2` with white, never sun; sun stays for the one action and momentary events (a listening keycap). Grey text uses `--gray-ink` (#5a5274); `--gray-lo` is for borders and lips only. `PlayerTag` is the P1 / P2 tag in UI chrome (grape, white text, `onWorld` adds the 2 px white border); the player colours stay on the in-world tags in `render/game.ts`. On a grape surface use `<Icon name="pennantOnDark" />`, on white the sticker `pennant`.
- `FdButton` props: `tone` sun|white|warn (warn = Settings reset confirm only), `size` lg|md|sm (or `height`, `fontSize`), `icon`, `iconAfter`, `iconOnly` (give `aria-label`), `primary` (the ONE bobbing, shining button per screen), `pointer` (nudging triangle on focus, vertical menus), `disabled` (aria-disabled: grey, padlock, wobbles and says "nuh-uh" on press), `sound`, `after`. Hover, pressed and the double focus ring are CSS. Mark focusable things for arrows with `data-nav`.
- `Panel`, `Card`, `Chip`, `Pill`, `Keycap` (arrows as SVG; `state="listening|empty"`), `HintStrip`, `Ribbon` (grape by default, `labelColor` for a plain label; auto-fits with `maxWidth`), `Pips`/`StatRow` (grape pips), `Wordmark` (the Pewfield art, `WORDMARK_SLOT` 420x160, art about 369x160; boot shows it at 1.25), `Toggle`, `Slider`, `Segmented` (native semantics, they handle their own arrows), `Icon`/`WeaponIcon` (inline SVG sticker set, `ICON_NAMES`), `Sunburst` (`spin` 60 menus/result, 20 VS; never on home or in a match), `Bunting`.
- Give any custom focusable the ring with `className="fd-ring"` (set `--rr` radius and `--ring-inset`); `fd-ring-on` shows it always (a selected card).
- `Confetti kind="cannon|rain|puff|ready" accents={[...]}`: rules and colours (`confettiColors`: sun, white, the celebrated accents) in `confettiRules.ts` (`confettiAllowed`: only win, KO pop, 2P ready; never loss, never idle, never with Reduced motion). Mount it BEFORE the content so it stays behind text.

## Navigation and sound
- `useSpatialNav(rootRef, { active, onBack })`: arrows (and pad d-pad via `useGamepadNav`) move to the nearest `[data-nav]` by geometry; Esc calls `onBack`; `data-nav-pref` marks the landing spot. An element that needs an arrow itself calls `preventDefault()` on it.
- `fdSound.{focus,hover,confirm,back,denied,toggle,notch,tab,count,celebrate}`: the ONE place screens make UI sounds. Today mapped to `menuSound` (synth). Swap samples here. Not done: -6 dB hover and +2 semitone steps (need args on `sfx.tick`).

## Fighters (roster owner reads here)
`fighterView(id)` = name + accent (`roster.ts`), role (`copy.ts`, plain voice), pips and trait chips (`stats.ts`: `statsOf`, `traitsOf`). `Portrait`/`useFighterPortraits` use the VS-door render (`vsPortraits.ts`). Head framing: `HEAD_ANCHOR` in `fighters.ts` (per id, measured on the current models: RETUNE after the new roster renders).

## Screens (phase 1)
`screens/HomeScreen` (b02), `screens/FighterSelect` (b03), `screens/TwoPlayerScreen` (b04, logic in `twoPlayer/TwoPlayerSelect.tsx`), `portal/index.html` (b01 boot). State lives in `menu/MainMenu.tsx`. Strings: `copy.ts`.

## Screens (phase 2a)
`hud/FdHud` (b06 plates, score, KO feed, key strip; b07 respawn card; pure rules in `hud/hudMath.ts`), `screens/PauseScreen` (b08), `screens/Modal` (the shared shell: blurred veil + Stage + arrows / pad + Esc, `escCapture` so a screen opened over the match closes before the match's own Esc resumes it), `menu/SettingsPanel` (b09/b10 and the other three tabs), `screens/HowToScreen` (b11; key labels in `screens/howToKeys.ts`), `menu/Credits` (b17), `components/VsDoors` (b05, same timing and flow as before). `ArenaGame` mounts `FdHud`, `PauseScreen`, `HowToScreen` and `SettingsPanel`; `MainMenu` mounts `HowToScreen`, `SettingsPanel` and `CreditsPanel`.
Notes: a tab or card that needs an arrow itself stops it (Slider, Segmented, tabs); a Segmented's checked radio is its `data-nav` target; `.fd-setcard:focus-within` draws the settings card's focus ring. Tailwind utilities lose to the unlayered `.fd { color }` rule, so a Tailwind-styled element inside `.fd` sets its colour inline.

## Checks
`npx vitest run src/components/fieldday`; `docs/collab/shots/fieldday-p1/capture.mjs` and `fieldday-p2a/capture.mjs`; the colour-balance captures share `docs/collab/shots/colour-balance/layout-check.mjs` (with the F-060 home wordmark x arena-ribbon whitelist) (need `npm run dev:portal`; `BASE=` its URL) capture and run the layout check; `sheet.mjs` builds the mockup-vs-build sheets; `fieldday-p2a/behaviour.mjs` drives keyboard, a fake pad and reduced motion.
