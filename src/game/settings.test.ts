import { describe, expect, it } from 'vitest';

import { applyKeys, buildKeyLookup } from './input';
import { renderProfile } from './render/quality';
import { createSettingsStore, DEFAULT_BINDINGS, DEFAULT_SETTINGS, keyLabel, loadSettings, rebind, sanitize, SETTINGS_KEY, unboundActions } from './settings';

import type { StorageLike } from './settings';

const memory = (init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe('settings store', () => {
  it('starts from the defaults', () => {
    const s = createSettingsStore(memory()).get();
    expect(s).toEqual(sanitize({}));
    expect(s.quality).toBe('auto');
    expect(s.shake).toBe(true);
    expect(s.bindings.fire).toEqual(['Space', '']);
  });

  it('saves every change and loads it back', () => {
    const storage = memory();
    const a = createSettingsStore(storage);
    a.set({ quality: 'low', showFps: true });
    a.setAudio({ master: 0.3, muted: true });
    a.setTouch({ leftHanded: true });
    const b = createSettingsStore(storage).get();
    expect(b.quality).toBe('low');
    expect(b.showFps).toBe(true);
    expect(b.audio.master).toBe(0.3);
    expect(b.audio.muted).toBe(true);
    expect(b.touch.leftHanded).toBe(true);
  });

  it('tells subscribers about changes and stops when unsubscribed', () => {
    const store = createSettingsStore(memory());
    const seen: boolean[] = [];
    const off = store.subscribe((s) => seen.push(s.reducedMotion));
    store.set({ reducedMotion: true });
    off();
    store.set({ reducedMotion: false });
    expect(seen).toEqual([true]);
  });

  it('survives blocked or broken storage', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createSettingsStore(throwing);
    expect(() => store.set({ quality: 'high' })).not.toThrow();
    expect(store.get().quality).toBe('high');
    expect(createSettingsStore(memory({ [SETTINGS_KEY]: '{not json' })).get()).toEqual(sanitize({}));
    expect(createSettingsStore(null).get().quality).toBe('auto');
  });

  it('clamps and repairs bad saved values', () => {
    const s = sanitize({ resScale: 9, quality: 'ultra', audio: { master: -1, guns: 'loud' }, touch: { size: 0 } });
    expect(s.resScale).toBe(1);
    expect(s.quality).toBe('auto');
    expect(s.audio.master).toBe(0);
    expect(s.audio.guns).toBe(DEFAULT_SETTINGS.audio.guns);
    expect(s.touch.size).toBe(0.75);
  });

  it('seeds from the older single-purpose keys', () => {
    const s = loadSettings(memory({ 'merge-conflict:motion': '0', 'merge-conflict:muted': '1', 'merge-conflict:aim': 'mouse', 'floor42:volume': '{"master":0.5,"guns":0.2}' }));
    expect(s.shake).toBe(false);
    expect(s.audio.muted).toBe(true);
    expect(s.aimMode).toBe('mouse');
    expect(s.audio.master).toBe(0.5);
    expect(s.audio.guns).toBe(0.2);
  });

  it('Pick up is F: a save from when it was E moves over once, a later choice of E stays', () => {
    expect(DEFAULT_BINDINGS.pickup[0]).toBe('KeyF');
    const old = { ...DEFAULT_BINDINGS, pickup: ['KeyE', ''] };
    const storage = memory({ [SETTINGS_KEY]: JSON.stringify({ bindings: old }) });
    expect(loadSettings(storage).bindings.pickup).toEqual(['KeyF', '']);
    storage.data[SETTINGS_KEY] = JSON.stringify({ bindings: old });
    expect(loadSettings(storage).bindings.pickup).toEqual(['KeyE', '']);
    // F already on another action: left alone.
    const taken = memory({ [SETTINGS_KEY]: JSON.stringify({ bindings: { ...old, push: ['KeyF', ''] } }) });
    expect(loadSettings(taken).bindings.pickup).toEqual(['KeyE', '']);
  });

  it('reset all goes back to the defaults; external mute wins but is not saved', () => {
    const storage = memory();
    const store = createSettingsStore(storage);
    store.set({ largeHud: true });
    store.rebind('fire', 0, 'KeyJ');
    store.resetAll();
    expect(store.get()).toEqual(sanitize({}));
    store.setExternalMute(true);
    expect(store.effectiveMute()).toBe(true);
    expect(JSON.parse(storage.data[SETTINGS_KEY]).audio.muted).toBe(false);
  });
});

describe('key hints and the bomb key', () => {
  it('Show key hints is on by default, saved when switched off, and repaired when junk', () => {
    const storage = memory();
    expect(createSettingsStore(storage).get().showKeyHints).toBe(true);
    createSettingsStore(storage).set({ showKeyHints: false });
    expect(createSettingsStore(storage).get().showKeyHints).toBe(false);
    expect(sanitize({ showKeyHints: 'no' }).showKeyHints).toBe(true);
    expect(sanitize({}).showKeyHints).toBe(true);
  });

  it('Throw bomb is G by default and can be rebound like the others', () => {
    expect(DEFAULT_BINDINGS.throwBomb).toEqual(['KeyG', '']);
    const r = rebind(DEFAULT_BINDINGS, 'throwBomb', 0, 'KeyB');
    expect(r.ok && r.bindings.throwBomb[0]).toBe('KeyB');
    expect(applyKeys(['KeyG'], buildKeyLookup(DEFAULT_BINDINGS)).throwBomb).toBe(true);
  });
});

describe('rebinding', () => {
  it('puts a free key on an action', () => {
    const r = rebind(DEFAULT_BINDINGS, 'fire', 1, 'KeyJ');
    expect(r.ok && r.bindings.fire).toEqual(['Space', 'KeyJ']);
    expect(r.ok && r.swapped).toBeNull();
  });

  it('swaps on a conflict: the other action gets the old key', () => {
    const r = rebind(DEFAULT_BINDINGS, 'push', 0, 'KeyF');
    if (!r.ok) throw new Error('expected ok');
    expect(r.bindings.push[0]).toBe('KeyF');
    expect(r.bindings.pickup[0]).toBe('KeyQ');
    expect(r.swapped).toEqual({ action: 'pickup', slot: 0, code: 'KeyQ' });
  });

  it('moving a key between the two slots of one action leaves no duplicate', () => {
    const r = rebind(DEFAULT_BINDINGS, 'left', 1, 'KeyA');
    if (!r.ok) throw new Error('expected ok');
    expect(r.bindings.left).toEqual(['', 'KeyA']);
    expect(r.swapped).toBeNull();
  });

  it('refuses keys the game keeps (Esc, M, T, 1-4, Enter)', () => {
    for (const code of ['Escape', 'KeyM', 'KeyT', 'Digit1', 'Enter']) expect(rebind(DEFAULT_BINDINGS, 'fire', 0, code).ok).toBe(false);
  });

  it('no key is ever on two actions, even after loading a hand-edited save', () => {
    const s = sanitize({ bindings: { fire: ['KeyA', ''], left: ['KeyA', 'ArrowLeft'] } });
    const all = Object.values(s.bindings).flat().filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
    expect(s.bindings.left).toEqual(['KeyA', 'ArrowLeft']);
    expect(s.bindings.fire).toEqual(['', '']);
  });

  it('reset to default restores every key, and unbound actions are reported', () => {
    const store = createSettingsStore(memory());
    store.clearBinding('fire', 0);
    expect(unboundActions(store.get().bindings)).toEqual(['fire']);
    store.resetBindings();
    expect(store.get().bindings).toEqual(DEFAULT_BINDINGS);
  });

  it('labels keys like keycaps', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('ShiftLeft')).toBe('L-Shift');
    expect(keyLabel('')).toBe('—');
  });
});

describe('key bindings applied to input', () => {
  it('the default keys drive the default buttons', () => {
    const i = applyKeys(['KeyA', 'Space'], buildKeyLookup(DEFAULT_BINDINGS));
    expect(i.left).toBe(true);
    expect(i.fire).toBe(true);
    expect(i.right).toBe(false);
  });

  it('a rebound key drives its new action and the old key does nothing', () => {
    const r = rebind(DEFAULT_BINDINGS, 'fire', 0, 'KeyJ');
    if (!r.ok) throw new Error('expected ok');
    const lookup = buildKeyLookup(r.bindings);
    expect(applyKeys(['KeyJ'], lookup).fire).toBe(true);
    expect(applyKeys(['Space'], lookup).fire).toBe(false);
  });

  it('a swap moves both actions', () => {
    const r = rebind(DEFAULT_BINDINGS, 'push', 0, 'KeyF');
    if (!r.ok) throw new Error('expected ok');
    const lookup = buildKeyLookup(r.bindings);
    expect(applyKeys(['KeyF'], lookup)).toMatchObject({ push: true, pickup: false });
    expect(applyKeys(['KeyQ'], lookup)).toMatchObject({ push: false, pickup: true });
  });
});

describe('graphics quality', () => {
  const desktop = { touch: false, cores: 8, memory: 8, dpr: 2 };
  const weakPhone = { touch: true, cores: 4, memory: 2, dpr: 3 };
  it('auto picks high on a desktop and low on a weak phone', () => {
    expect(renderProfile({ quality: 'auto', shadows: true, resScale: 1 }, desktop)).toMatchObject({ tier: 'high', pixelRatio: 2, shadows: true });
    expect(renderProfile({ quality: 'auto', shadows: true, resScale: 1 }, weakPhone)).toMatchObject({ tier: 'low', pixelRatio: 1, shadows: false });
  });
  it('a forced preset, the shadow switch and resolution scale apply', () => {
    expect(renderProfile({ quality: 'medium', shadows: false, resScale: 0.5 }, desktop)).toMatchObject({ tier: 'medium', pixelRatio: 0.75, shadows: false });
  });
});
