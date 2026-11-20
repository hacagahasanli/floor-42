'use client';

import { useEffect, useState } from 'react';

/**
 * Gamepads drive the menus through the same keys the keyboard uses: the d-pad or left stick sends arrows,
 * A clicks the focused control, B sends Escape, the shoulder buttons switch Settings tabs.
 * Standard-mapping indices: 0 A, 1 B, 4 LB, 5 RB, 12-15 d-pad up/down/left/right.
 */
const press = (code: string) => {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
};

const MAP: [number, () => void][] = [
  [12, () => press('ArrowUp')],
  [13, () => press('ArrowDown')],
  [14, () => press('ArrowLeft')],
  [15, () => press('ArrowRight')],
  [0, () => (document.activeElement as HTMLElement | null)?.click()],
  [1, () => press('Escape')],
  [4, () => press('BracketLeft')],
  [5, () => press('BracketRight')],
];

export const useGamepadNav = (enabled = true) => {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let raf = 0;
    const held = new Map<string, number>();
    const poll = (now: number) => {
      const pads = navigator.getGamepads().filter(Boolean) as Gamepad[];
      setConnected((c) => (c === pads.length > 0 ? c : pads.length > 0));
      for (const pad of pads) {
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        const virtual: Record<number, boolean> = { 12: ay < -0.6, 13: ay > 0.6, 14: ax < -0.6, 15: ax > 0.6 };
        for (const [i, fire] of MAP) {
          const id = `${pad.index}:${i}`;
          const down = !!pad.buttons[i]?.pressed || !!virtual[i];
          const since = held.get(id);
          if (down && since === undefined) {
            held.set(id, now);
            fire();
          } else if (down && since !== undefined && i >= 12 && now - since > 380) {
            // Held direction repeats, like a held arrow key.
            held.set(id, now - 260);
            fire();
          } else if (!down) held.delete(id);
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
  return connected;
};
