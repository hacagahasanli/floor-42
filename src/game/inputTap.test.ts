import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createControls } from './input';

/** A stand-in window and canvas: the controls only add and remove listeners. */
type Listener = (e: { code: string; repeat?: boolean; preventDefault: () => void }) => void;
let listeners: Record<string, Listener[]>;
const fire = (type: string, code = '', repeat = false) =>
  listeners[type]?.forEach((l) => l({ code, repeat, preventDefault: vi.fn() }));
const target = () => ({
  addEventListener: (t: string, l: Listener) => (listeners[t] ??= []).push(l),
  removeEventListener: (t: string, l: Listener) => (listeners[t] = (listeners[t] ?? []).filter((x) => x !== l)),
});

beforeEach(() => {
  listeners = {};
  vi.stubGlobal('window', target());
});
afterEach(() => vi.unstubAllGlobals());

describe('keyboard taps (playtest 2026-11-28: taps shorter than a tick were lost)', () => {
  it('a key pressed and released between two reads still counts once', () => {
    const c = createControls(target() as unknown as HTMLCanvasElement);
    fire('keydown', 'Space');
    fire('keyup', 'Space');
    expect(c.read(0, 0, 'auto').fire).toBe(true);
    expect(c.read(0, 0, 'auto').fire).toBe(false);
    c.dispose();
  });

  it('a held key keeps counting; key repeat does not re-latch after release', () => {
    const c = createControls(target() as unknown as HTMLCanvasElement);
    fire('keydown', 'KeyD');
    expect(c.read(0, 0, 'auto').right).toBe(true);
    fire('keydown', 'KeyD', true);
    expect(c.read(0, 0, 'auto').right).toBe(true);
    fire('keyup', 'KeyD');
    expect(c.read(0, 0, 'auto').right).toBe(false);
    c.dispose();
  });

  it('blur drops a pending tap', () => {
    const c = createControls(target() as unknown as HTMLCanvasElement);
    fire('keydown', 'Space');
    fire('keyup', 'Space');
    fire('blur');
    expect(c.read(0, 0, 'auto').fire).toBe(false);
    c.dispose();
  });
});
