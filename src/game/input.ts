import { EMPTY_INPUT } from './sim/types';

import type { InputState } from './sim/types';

export type Button = Exclude<keyof InputState, 'aimX' | 'aimY'>;

/** True on phones and tablets: the game shows touch controls and always auto-aims. */
export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);

export type AimMode = 'auto' | 'mouse';

/**
 * Keyboard first. By default the game aims for you (auto-aim) and Space shoots.
 * In mouse mode the mouse aims and left click also shoots.
 */
export const KEYMAP: Record<Button, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  fire: ['Space'],
  dash: ['ShiftLeft', 'ShiftRight'],
  push: ['KeyQ'],
  pickup: ['KeyE'],
  reload: ['KeyR'],
};

const CODE_TO_ACTION = new Map<string, Button>(
  Object.entries(KEYMAP).flatMap(([action, codes]) => codes.map((c) => [c, action as Button])),
);

export const createControls = (canvas: HTMLCanvasElement) => {
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
    if (!CODE_TO_ACTION.has(e.code)) return;
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

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);

  return {
    mouse,
    read: (aimX: number, aimY: number, mode: AimMode): InputState => {
      const s: InputState = { ...EMPTY_INPUT, aimX, aimY, fire: mode === 'mouse' && clicking };
      for (const code of down) {
        const action = CODE_TO_ACTION.get(code);
        if (action) s[action] = true;
      }
      for (const b of touchHeld) s[b] = true;
      for (const b of touchLatched) s[b] = true;
      touchLatched.clear();
      return s;
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
