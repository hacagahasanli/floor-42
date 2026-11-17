import { EMPTY_INPUT } from './sim/types';

import type { InputState } from './sim/types';

/** Desktop keyboard layout. Two keys per action where it helps. */
export const KEYMAP: Record<keyof InputState, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp', 'Space'],
  down: ['KeyS', 'ArrowDown'],
  dash: ['ShiftLeft', 'ShiftRight'],
  attack: ['KeyJ'],
  grab: ['KeyK'],
  push: ['KeyL'],
};

const CODE_TO_ACTION = new Map<string, keyof InputState>(
  Object.entries(KEYMAP).flatMap(([action, codes]) => codes.map((c) => [c, action as keyof InputState])),
);

export const createKeyboard = (target: Window) => {
  const down = new Set<string>();
  const onDown = (e: KeyboardEvent) => {
    if (!CODE_TO_ACTION.has(e.code)) return;
    e.preventDefault();
    down.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => {
    down.delete(e.code);
  };
  const onBlur = () => down.clear();
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);

  return {
    read: (): InputState => {
      const s: InputState = { ...EMPTY_INPUT };
      for (const code of down) {
        const action = CODE_TO_ACTION.get(code);
        if (action) s[action] = true;
      }
      return s;
    },
    dispose: () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
};
