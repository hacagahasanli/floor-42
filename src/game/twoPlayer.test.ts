import { describe, expect, it } from 'vitest';

import { createSettingsStore, DEFAULT_BINDINGS, RESERVED_KEYS, sanitize } from './settings';
import {
  ACTIONS_2P,
  addToTally,
  allowed2P,
  DEFAULT_BINDINGS_2P,
  DEFAULT_LENGTH,
  keys2P,
  mergeInput,
  nextLength,
  padInput,
  padPlayers,
  parseLength,
  playerColour,
  PLAYERS,
  readTally,
  rebind2P,
  resetTally,
  route2P,
  sanitizeBindings2P,
  show2PMenuItem,
  stepCursor,
  unbound2P,
} from './twoPlayer';
import { EMPTY_INPUT } from './sim/types';

import type { StorageLike } from './settings';
import type { PadLike } from './twoPlayer';

const memory = (
  init: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

const all = (b = DEFAULT_BINDINGS_2P) =>
  PLAYERS.flatMap((p) => ACTIONS_2P.map(({ id }) => b[p][id]));

/** Keys spec 1.3 rules out for 2-player play: they open browser or OS behaviour, or are the 1P shoot key. */
const FORBIDDEN = [
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'Enter',
  'NumpadEnter',
  'Tab',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'Escape',
  'Quote',
  'Slash',
  'Numpad0',
  'Numpad5',
  'NumpadAdd',
  'F1',
  'F5',
  'F11',
  'CapsLock',
  'ContextMenu',
];

describe('2-player default keys', () => {
  it('match the spec: P1 WASD + F G H, P2 arrows + ; L K', () => {
    expect(DEFAULT_BINDINGS_2P.p1).toEqual({
      left: 'KeyA',
      right: 'KeyD',
      up: 'KeyW',
      down: 'KeyS',
      fire: 'KeyF',
      push: 'KeyG',
      dash: 'KeyH',
    });
    expect(DEFAULT_BINDINGS_2P.p2).toEqual({
      left: 'ArrowLeft',
      right: 'ArrowRight',
      up: 'ArrowUp',
      down: 'ArrowDown',
      fire: 'Semicolon',
      push: 'KeyL',
      dash: 'KeyK',
    });
  });

  it('never share a key between P1 and P2 or between two actions', () => {
    const keys = all();
    expect(keys).toHaveLength(14);
    expect(new Set(keys).size).toBe(14);
    const p1 = new Set(Object.values(DEFAULT_BINDINGS_2P.p1));
    for (const k of Object.values(DEFAULT_BINDINGS_2P.p2)) expect(p1.has(k)).toBe(false);
  });

  it('use no reserved key (Esc, M, T, 1-4, Enter, Tab, Meta)', () => {
    for (const k of all()) expect(RESERVED_KEYS.has(k)).toBe(false);
  });

  it('use none of Space, Shift, Enter, Tab, Ctrl, Alt, Meta, the numpad, function keys, quote or slash', () => {
    for (const k of all()) {
      expect(FORBIDDEN).not.toContain(k);
      expect(k.startsWith('Numpad')).toBe(false);
      expect(/^(Shift|Control|Alt|Meta)/.test(k)).toBe(false);
    }
  });

  it('leave J free between the two players hands', () => {
    expect(all()).not.toContain('KeyJ');
  });

  it('keep the 1-player keys unchanged', () => {
    expect(DEFAULT_BINDINGS.fire).toEqual(['Space', '']);
    expect(DEFAULT_BINDINGS.dash).toEqual(['ShiftLeft', 'ShiftRight']);
    expect(DEFAULT_BINDINGS.pickup).toEqual(['KeyF', '']);
  });
});

describe('allowed2P', () => {
  it('refuses every forbidden and reserved key', () => {
    for (const k of [...FORBIDDEN, ...RESERVED_KEYS]) expect(allowed2P(k)).toBe(false);
  });
  it('accepts letters, arrows and letter-row punctuation', () => {
    for (const k of [
      'KeyJ',
      'KeyZ',
      'ArrowUp',
      'Semicolon',
      'Comma',
      'Period',
      'BracketLeft',
      'Digit7',
    ])
      expect(allowed2P(k)).toBe(true);
  });
});

describe('2-player rebinding', () => {
  it('refuses reserved and forbidden keys', () => {
    for (const k of ['Space', 'ShiftLeft', 'Escape', 'KeyM', 'Digit1', 'Numpad4', 'Quote', 'Slash'])
      expect(rebind2P(DEFAULT_BINDINGS_2P, 'p1', 'fire', k)).toEqual({
        ok: false,
        reason: 'reserved',
      });
  });

  it('swaps a key taken by the other player, so no key is ever on two actions', () => {
    const r = rebind2P(DEFAULT_BINDINGS_2P, 'p1', 'dash', 'KeyK');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bindings.p1.dash).toBe('KeyK');
    expect(r.bindings.p2.dash).toBe('KeyH');
    expect(r.swapped).toEqual({ player: 'p2', action: 'dash', code: 'KeyH' });
    const keys = all(r.bindings);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('puts a free key on without touching anything else', () => {
    const r = rebind2P(DEFAULT_BINDINGS_2P, 'p2', 'fire', 'KeyJ');
    expect(r.ok && r.swapped).toBe(null);
    expect(r.ok && r.bindings.p2.fire).toBe('KeyJ');
    expect(DEFAULT_BINDINGS_2P.p2.fire).toBe('Semicolon');
  });

  it('repairs saved maps: bad codes fall back, duplicates clear, forbidden keys never load', () => {
    const b = sanitizeBindings2P({
      p1: { fire: 'Space', push: 'KeyK', left: 42 },
      p2: { left: 'KeyZ' },
    });
    expect(b.p1.fire).toBe('KeyF');
    expect(b.p1.left).toBe('KeyA');
    expect(b.p1.push).toBe('KeyK');
    expect(b.p2.dash).toBe(''); // KeyK went to P1's push first
    expect(b.p2.left).toBe('KeyZ');
    expect(unbound2P(b)).toEqual([{ player: 'p2', action: 'dash' }]);
    expect(sanitizeBindings2P(null)).toEqual(DEFAULT_BINDINGS_2P);
  });

  it('lives in the settings store: saved, reset on its own, 1P keys untouched', () => {
    const storage = memory();
    const store = createSettingsStore(storage);
    expect(store.get().bindings2p).toEqual(DEFAULT_BINDINGS_2P);
    store.rebind2P('p1', 'fire', 'KeyE');
    expect(createSettingsStore(storage).get().bindings2p.p1.fire).toBe('KeyE');
    store.rebind('fire', 0, 'KeyX');
    store.resetBindings2P();
    expect(store.get().bindings2p).toEqual(DEFAULT_BINDINGS_2P);
    expect(store.get().bindings.fire[0]).toBe('KeyX');
    expect(sanitize({}).bindings2p).toEqual(DEFAULT_BINDINGS_2P);
  });
});

describe('2-player input routing', () => {
  it('sends each player only their own keys', () => {
    const [a, b] = route2P(['KeyA', 'KeyF', 'ArrowRight', 'KeyL'], DEFAULT_BINDINGS_2P);
    expect(a).toEqual({ ...EMPTY_INPUT, left: true, fire: true });
    expect(b).toEqual({ ...EMPTY_INPUT, right: true, push: true });
  });

  it('takes both players at full load at once (6+ keys: the ghosting worst case)', () => {
    const [a, b] = route2P(
      ['KeyA', 'KeyW', 'KeyF', 'KeyH', 'ArrowLeft', 'ArrowUp', 'Semicolon', 'KeyK'],
      DEFAULT_BINDINGS_2P,
    );
    expect([a.left, a.up, a.fire, a.dash]).toEqual([true, true, true, true]);
    expect([b.left, b.up, b.fire, b.dash]).toEqual([true, true, true, true]);
    expect(a.right || a.push || b.right || b.push).toBe(false);
  });

  it('ignores keys outside the 2-player maps (Space, Shift, 1P pick up / reload / crouch)', () => {
    const [a, b] = route2P(['Space', 'ShiftLeft', 'KeyR', 'KeyC', 'KeyQ'], DEFAULT_BINDINGS_2P);
    expect(a).toEqual(EMPTY_INPUT);
    expect(b).toEqual(EMPTY_INPUT);
  });

  it('follows a rebound map', () => {
    const r = rebind2P(DEFAULT_BINDINGS_2P, 'p1', 'dash', 'KeyK');
    if (!r.ok) throw new Error('rebind failed');
    const [a, b] = route2P(['KeyK'], r.bindings);
    expect(a.dash).toBe(true);
    expect(b.dash).toBe(false);
  });

  it('lists every key it handles, so all of them get preventDefault', () => {
    const keys = keys2P(DEFAULT_BINDINGS_2P);
    for (const k of ['ArrowUp', 'ArrowDown', 'Semicolon', 'KeyF']) expect(keys.has(k)).toBe(true);
  });
});

describe('gamepads', () => {
  const pad = (pressed: number[] = [], axes: number[] = [0, 0]): PadLike => ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
    axes,
  });

  it('one pad plays P2, two pads play P1 and P2, extra pads are ignored', () => {
    expect(padPlayers(0)).toEqual([]);
    expect(padPlayers(1)).toEqual([1]);
    expect(padPlayers(2)).toEqual([0, 1]);
    expect(padPlayers(3)).toEqual([0, 1]);
  });

  it('maps the standard layout: A jump, X/RT shoot, B/LB push, RB/LT dash', () => {
    expect(padInput(pad([0]))).toMatchObject({ up: true, fire: false });
    expect(padInput(pad([2])).fire).toBe(true);
    expect(padInput(pad([7])).fire).toBe(true);
    expect(padInput(pad([1])).push).toBe(true);
    expect(padInput(pad([4])).push).toBe(true);
    expect(padInput(pad([5])).dash).toBe(true);
    expect(padInput(pad([6])).dash).toBe(true);
  });

  it('stick up does not jump; stick down crouches only past 0.5', () => {
    expect(padInput(pad([], [0, -1])).up).toBe(false);
    expect(padInput(pad([], [0, 0.4])).down).toBe(false);
    expect(padInput(pad([], [0, 0.6])).down).toBe(true);
    expect(padInput(pad([13])).down).toBe(true);
    expect(padInput(pad([], [-0.8, 0])).left).toBe(true);
    expect(padInput(pad([], [0.2, 0])).right).toBe(false);
  });

  it('merges with the keyboard: either source holds a button', () => {
    const into = { ...EMPTY_INPUT, left: true };
    mergeInput(into, { fire: true, left: false });
    expect(into.left).toBe(true);
    expect(into.fire).toBe(true);
  });
});

describe('2-player menu, colours, length and tally', () => {
  it('shows 2 PLAYER on keyboards, and on touch-only devices only with two pads', () => {
    expect(show2PMenuItem(false, 0)).toBe(true);
    expect(show2PMenuItem(false, 1)).toBe(true);
    expect(show2PMenuItem(true, 0)).toBe(false);
    expect(show2PMenuItem(true, 1)).toBe(false);
    expect(show2PMenuItem(true, 2)).toBe(true);
  });

  it('uses red / blue, or the colour-blind pair', () => {
    expect(playerColour(0, false)).toBe('#ff4d4d');
    expect(playerColour(1, false)).toBe('#4d7cff');
    expect(playerColour(0, true)).toBe('#e69f00');
    expect(playerColour(1, true)).toBe('#56b4e9');
  });

  it('cycles first to 3 -> 5 -> 7 -> 3, default 5', () => {
    expect(DEFAULT_LENGTH).toBe(5);
    expect(nextLength(3)).toBe(5);
    expect(nextLength(5)).toBe(7);
    expect(nextLength(7)).toBe(3);
    expect(parseLength('7')).toBe(7);
    expect(parseLength('9')).toBe(5);
    expect(parseLength(null)).toBe(5);
  });

  it('counts decided matches only and resets', () => {
    const s = memory();
    expect(readTally(s)).toEqual({ p1: 0, p2: 0 });
    addToTally(s, 0);
    addToTally(s, 0);
    addToTally(s, 1);
    addToTally(s, -1);
    addToTally(s, null);
    expect(readTally(s)).toEqual({ p1: 2, p2: 1 });
    resetTally(s);
    expect(readTally(s)).toEqual({ p1: 0, p2: 0 });
    expect(readTally(memory({ 'floor42:2p-tally': '{bad' }))).toEqual({ p1: 0, p2: 0 });
  });
});

describe('select screen cursor', () => {
  it('walks the 2x2 grid with each player own directions', () => {
    expect(stepCursor(0, 'right', false)).toBe(1);
    expect(stepCursor(1, 'right', false)).toBe(1);
    expect(stepCursor(0, 'down', false)).toBe(2);
    expect(stepCursor(3, 'up', false)).toBe(1);
    expect(stepCursor(3, 'left', false)).toBe(2);
  });
  it('walks one row of four on a narrow window', () => {
    expect(stepCursor(0, 'left', true)).toBe(0);
    expect(stepCursor(2, 'right', true)).toBe(3);
    expect(stepCursor(3, 'right', true)).toBe(3);
    expect(stepCursor(1, 'down', true)).toBe(1);
  });
});
