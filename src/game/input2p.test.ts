import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createControls2P } from './input';
import { DEFAULT_BINDINGS_2P } from './twoPlayer';

/** A stand-in window: the 2-player controls only add and remove listeners on it. */
type Listener = (e: { code: string; repeat?: boolean; preventDefault: () => void }) => void;
let listeners: Record<string, Listener[]>;
const fire = (type: string, code = '', repeat = false) => {
  const preventDefault = vi.fn();
  listeners[type]?.forEach((l) => l({ code, repeat, preventDefault }));
  return preventDefault;
};

beforeEach(() => {
  listeners = {};
  vi.stubGlobal('window', {
    addEventListener: (t: string, l: Listener) => (listeners[t] ??= []).push(l),
    removeEventListener: (t: string, l: Listener) =>
      (listeners[t] = (listeners[t] ?? []).filter((x) => x !== l)),
  });
  vi.stubGlobal('navigator', { getGamepads: () => [] });
});
afterEach(() => vi.unstubAllGlobals());

describe('2-player controls (keyboard routing)', () => {
  it('routes both players at the same time from one keyboard', () => {
    const c = createControls2P(DEFAULT_BINDINGS_2P);
    for (const k of ['KeyD', 'KeyF', 'ArrowLeft', 'Semicolon', 'KeyK']) fire('keydown', k);
    const [a, b] = c.read();
    expect([a.right, a.fire, a.left]).toEqual([true, true, false]);
    expect([b.left, b.fire, b.dash, b.right]).toEqual([true, true, true, false]);
    c.dispose();
  });

  it('swallows every 2-player key, the arrows and Space (no page scroll, no Firefox find), and nothing else', () => {
    const c = createControls2P(DEFAULT_BINDINGS_2P);
    for (const k of ['KeyW', 'KeyH', 'ArrowUp', 'ArrowDown', 'Semicolon', 'KeyL', 'Space'])
      expect(fire('keydown', k)).toHaveBeenCalled();
    for (const k of ['Escape', 'Enter', 'Tab', 'KeyR'])
      expect(fire('keydown', k)).not.toHaveBeenCalled();
    c.dispose();
  });

  it('M is P2 sit in 2-player (swallowed, routed), V is P1 sit', () => {
    const c = createControls2P(DEFAULT_BINDINGS_2P);
    expect(fire('keydown', 'KeyM')).toHaveBeenCalled();
    fire('keydown', 'KeyV');
    const [a, b] = c.read();
    expect([a.crouch, b.crouch]).toEqual([true, true]);
    c.dispose();
  });

  it('never turns 1-player keys into 2-player actions', () => {
    const c = createControls2P(DEFAULT_BINDINGS_2P);
    for (const k of ['Space', 'ShiftLeft', 'KeyR', 'KeyQ', 'KeyC']) fire('keydown', k);
    const [a, b] = c.read();
    expect(Object.values(a).some((v) => v === true)).toBe(false);
    expect(Object.values(b).some((v) => v === true)).toBe(false);
    c.dispose();
  });

  it('a tap shorter than a tick still counts once, for the sim and for the key card separately', () => {
    const c = createControls2P(DEFAULT_BINDINGS_2P);
    fire('keydown', 'KeyF');
    fire('keyup', 'KeyF');
    expect(c.read()[0].fire).toBe(true);
    expect(c.read()[0].fire).toBe(false);
    expect(c.peek().inputs[0].fire).toBe(true);
    expect(c.peek().inputs[0].fire).toBe(false);
    c.dispose();
  });

  it('lets go of everything on blur and after dispose', () => {
    const c = createControls2P(DEFAULT_BINDINGS_2P);
    fire('keydown', 'KeyA');
    fire('keydown', 'ArrowRight');
    c.read();
    fire('blur');
    const [a, b] = c.read();
    expect(a.left || b.right).toBe(false);
    c.dispose();
    expect(Object.values(listeners).every((l) => l.length === 0)).toBe(true);
  });

  it('follows new bindings from Settings at once', () => {
    const c = createControls2P(DEFAULT_BINDINGS_2P);
    c.setBindings({ ...DEFAULT_BINDINGS_2P, p1: { ...DEFAULT_BINDINGS_2P.p1, fire: 'KeyE' } });
    fire('keydown', 'KeyE');
    expect(c.read()[0].fire).toBe(true);
    c.dispose();
  });
});
