import { DEFAULT_BINDINGS } from './settings';
import { EMPTY_INPUT } from './sim/types';
import { keys2P, mergeInput, padInput, padPlayers, padStart, route2P } from './twoPlayer';

import type { Bindings } from './settings';
import type { Bindings2P } from './twoPlayer';
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
  /** Keys pressed since the last read, latched like touch so a tap shorter than one tick still counts (playtest 2026-11-28). */
  const keyLatched = new Set<string>();

  const onDown = (e: KeyboardEvent) => {
    if (!lookup.has(e.code)) return;
    e.preventDefault();
    down.add(e.code);
    if (!e.repeat) keyLatched.add(e.code);
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
    keyLatched.clear();
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
      applyKeys(keyLatched, lookup, s);
      keyLatched.clear();
      for (const b of touchHeld) s[b] = true;
      for (const b of touchLatched) s[b] = true;
      touchLatched.clear();
      return s;
    },
    /** New keys from Settings: applied at once; keys held under the old map are let go. */
    setBindings: (b: Bindings) => {
      lookup = buildKeyLookup(b);
      down.clear();
      keyLatched.clear();
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

/**
 * Local 2-player controls: one keyboard (two maps) plus up to two gamepads. Every key of either map, the arrows and
 * Space are swallowed (preventDefault) so the page never scrolls and Firefox never starts a find. The mouse never
 * shoots. Blur lets go of everything.
 */
export const createControls2P = (bindings: Bindings2P, listen = true) => {
  let b = bindings;
  let swallow = new Set([...keys2P(b), 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const down = new Set<string>();
  /**
   * A press is latched until each reader has seen it once (the sim's next tick, the key card's next frame), so a tap
   * shorter than a tick or a frame still counts.
   */
  const tapSim = new Set<string>();
  const tapPeek = new Set<string>();
  /** Start on a pad, by player index, as an edge (read once). */
  const startPressed: [boolean, boolean] = [false, false];
  const startHeld = new Map<number, boolean>();

  const onDown = (e: KeyboardEvent) => {
    if (!swallow.has(e.code)) return;
    e.preventDefault();
    down.add(e.code);
    if (!e.repeat) {
      tapSim.add(e.code);
      tapPeek.add(e.code);
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if (swallow.has(e.code)) e.preventDefault();
    down.delete(e.code);
  };
  const onBlur = () => {
    down.clear();
    tapSim.clear();
    tapPeek.clear();
  };
  if (listen) {
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
  }

  const pads = (): Gamepad[] => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
    try {
      return (navigator.getGamepads() ?? []).filter((p): p is Gamepad => !!p && p.connected !== false);
    } catch {
      return [];
    }
  };

  const gather = (trackStart: boolean): [InputState, InputState] => {
    const tap = trackStart ? tapSim : tapPeek;
    const out = route2P(tap.size ? new Set([...down, ...tap]) : down, b);
    tap.clear();
    const list = pads();
    padPlayers(list.length).forEach((player, i) => {
      const pad = list[i];
      mergeInput(out[player], padInput(pad));
      if (!trackStart) return;
      const start = padStart(pad);
      if (start && !startHeld.get(pad.index)) startPressed[player] = true;
      startHeld.set(pad.index, start);
    });
    return out;
  };

  return {
    /** Both fighters' buttons this tick, from the keys and the pads. Aim is set by the caller (auto-aim). */
    read: () => gather(true),
    /** The same, without consuming a pad's Start press (the key card and the results screen look, they don't play). */
    peek: () => {
      const held = new Set([...down, ...tapPeek]);
      return { held: held as ReadonlySet<string>, inputs: gather(false), pads: Math.min(2, pads().length) };
    },
    /** Which player pressed Start on a pad since the last call (null: nobody). */
    takeStart: (): 0 | 1 | null => {
      const who = startPressed[0] ? 0 : startPressed[1] ? 1 : null;
      startPressed[0] = startPressed[1] = false;
      return who;
    },
    /** How many pads are connected right now (at most two count). */
    padCount: () => Math.min(2, pads().length),
    /** The keys held right now (the key card's tester lights them). */
    held: () => down,
    setBindings: (next: Bindings2P) => {
      b = next;
      swallow = new Set([...keys2P(b), 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
      down.clear();
      tapSim.clear();
      tapPeek.clear();
    },
    dispose: () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    },
  };
};

export type Controls2P = ReturnType<typeof createControls2P>;
