import { DEFAULT_BINDINGS } from './settings';
import { EMPTY_INPUT } from './sim/types';

import type { Bindings } from './settings';
import type { InputState } from './sim/types';

export type Button = Exclude<keyof InputState, 'aimX' | 'aimY'>;

/** True on phones and tablets: the game shows touch controls and always auto-aims. */
export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);

export type AimMode = 'auto' | 'mouse';

/**
 * Keyboard first. By default the game aims for you (auto-aim) and Space shoots.
 * In mouse mode the mouse aims and left click also shoots. The keys come from Settings > Controls.
 */
export const KEYMAP: Record<Button, string[]> = Object.fromEntries(
  Object.entries(DEFAULT_BINDINGS).map(([a, codes]) => [a, codes.filter(Boolean)]),
) as Record<Button, string[]>;

/** Key code -> action, from the player's bindings. */
export const buildKeyLookup = (bindings: Bindings) =>
  new Map<string, Button>(Object.entries(bindings).flatMap(([action, codes]) => codes.filter(Boolean).map((c) => [c, action as Button] as const)));

/** The buttons held, given the keys held down. */
export const applyKeys = (down: Iterable<string>, lookup: Map<string, Button>, into: InputState = { ...EMPTY_INPUT }) => {
  for (const code of down) {
    const action = lookup.get(code);
    if (action) into[action] = true;
  }
  return into;
};

export const createControls = (canvas: HTMLCanvasElement, listen = true, bindings: Bindings = DEFAULT_BINDINGS) => {
  let lookup = buildKeyLookup(bindings);
  const down = new Set<string>();
  /** Mouse in normalised device coordinates (-1..1). */
  const mouse = { x: 0, y: 0 };
  let clicking = false;
  /**
   * Touch buttons. A press is latched until the game has read it once, so a quick tap shorter
   * than one tick still counts.
   */
  const touchHeld = new Set<Button>();
  const touchLatched = new Set<Button>();

  const onDown = (e: KeyboardEvent) => {
    if (!lookup.has(e.code)) return;
    e.preventDefault();
    down.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 0) clicking = true;
    onMove(e);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.button === 0) clicking = false;
  };
  const onBlur = () => {
    down.clear();
    clicking = false;
    touchHeld.clear();
  };

  if (listen) {
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
  }

  return {
    mouse,
    read: (aimX: number, aimY: number, mode: AimMode): InputState => {
      const s: InputState = { ...EMPTY_INPUT, aimX, aimY, fire: mode === 'mouse' && clicking };
      applyKeys(down, lookup, s);
      for (const b of touchHeld) s[b] = true;
      for (const b of touchLatched) s[b] = true;
      touchLatched.clear();
      return s;
    },
    /** New keys from Settings: applied at once; keys held under the old map are let go. */
    setBindings: (b: Bindings) => {
      lookup = buildKeyLookup(b);
      down.clear();
    },
    /** A touch button went down (true) or up (false). */
    setTouch: (b: Button, on: boolean) => {
      if (on) {
        touchHeld.add(b);
        touchLatched.add(b);
      } else touchHeld.delete(b);
    },
    dispose: () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    },
  };
};
