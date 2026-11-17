import { EMPTY_INPUT } from './sim/types';

import type { InputState } from './sim/types';

type Button = Exclude<keyof InputState, 'aimX' | 'aimY'>;

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
      return s;
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
