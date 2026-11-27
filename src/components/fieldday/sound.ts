'use client';

import { menuSound } from '~/components/menu/menuSound';

/**
 * UI sound hooks (spec 6). Every Field Day control calls THESE, never menuSound directly, so the toy-box samples
 * (wooden "tok", rubber "boop", kazoo "nuh-uh", card flick...) can be swapped in here once they exist, without touching a
 * screen. Today each hook maps to the nearest existing synth voice on the Menus bus (sfx.ts through menuSound), which already
 * follows Settings > Audio (Menus slider, Mute). Hover is the same voice, throttled; the spec's -6 dB and the +2 semitone
 * steps need a gain/pitch argument on sfx.tick() and are not done yet.
 */
export const fdSound = {
  /** Focus moved (keyboard or pad). */
  focus: () => menuSound.tick(),
  /** Mouse hover: quieter than focus in the spec; for now the same tick. */
  hover: () => menuSound.tick(),
  confirm: () => menuSound.confirm(),
  back: () => menuSound.back(),
  /** A disabled control was pressed ("nuh-uh"). */
  denied: () => menuSound.back(),
  toggle: () => menuSound.tick(),
  /** One slider notch (every 10 %). */
  notch: () => menuSound.tick(),
  tab: () => menuSound.tick(),
  /** One 2P countdown number; `go` is the last. */
  count: (go = false) => (go ? menuSound.confirm() : menuSound.tick()),
  /** Both players are ready (the confetti puff). */
  celebrate: () => menuSound.stamp(),
  /** The result reveal (spec 4): whoosh at the cut, drumroll, pop + party horn (or the kazoo on a loss), landing thud, slide-whistle, 3 rising dings, soft pops, crowd murmur. */
  result: menuSound.result,
};
