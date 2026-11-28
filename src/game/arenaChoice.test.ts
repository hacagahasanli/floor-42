import { describe, expect, it } from 'vitest';

import { ARENA_COPY, arenaFromQuery, resolveArena } from './arenaChoice';
import { createSettingsStore, DEFAULT_SETTINGS, loadSettings, sanitize, SETTINGS_KEY } from './settings';
import { ARENA_IDS, DEFAULT_ARENA } from './sim/constants';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('arena selection (R-016 section 8)', () => {
  it('offline matches default to the one config constant, OFFSITE', () => {
    expect(DEFAULT_ARENA).toBe('offsite');
    expect(DEFAULT_SETTINGS.arena).toBe(DEFAULT_ARENA);
    expect(resolveArena({})).toBe(DEFAULT_ARENA);
  });

  it('a known arena in the URL wins over the remembered pick; an unknown one is ignored', () => {
    expect(resolveArena({ query: 'office', saved: 'offsite' })).toBe('office');
    expect(resolveArena({ query: 'offsite', saved: 'office' })).toBe('offsite');
    expect(resolveArena({ query: 'moon', saved: 'office' })).toBe('office');
    expect(resolveArena({ query: null, saved: 'office' })).toBe('office');
    expect(arenaFromQuery('nope')).toBeUndefined();
  });

  it('online is always the office, whatever the URL or the settings say', () => {
    expect(resolveArena({ online: true, query: 'offsite', saved: 'offsite' })).toBe('office');
  });

  it('the pick is remembered in settings, survives a reload and a bad value falls back to the default', () => {
    const storage = memory();
    const store = createSettingsStore(storage);
    expect(store.get().arena).toBe(DEFAULT_ARENA);
    store.set({ arena: 'office' });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).arena).toBe('office');
    expect(loadSettings(storage).arena).toBe('office');
    expect(sanitize({ arena: 'lava' }).arena).toBe(DEFAULT_ARENA);
    // Old saves (no arena field) get the default.
    storage.setItem(SETTINGS_KEY, JSON.stringify({ shake: false }));
    expect(loadSettings(storage).arena).toBe(DEFAULT_ARENA);
    // Reset all keeps the pick (it is a game choice, not a tuning knob).
    store.set({ arena: 'office' });
    store.resetAll();
    expect(store.get().arena).toBe('office');
  });

  it('the picker has a name and a card line for every arena, from the spec (section 7)', () => {
    expect(ARENA_IDS.every((id) => ARENA_COPY[id].name && ARENA_COPY[id].line)).toBe(true);
    expect(ARENA_COPY.offsite).toEqual({ name: 'OFFSITE', line: 'High noon on the planks. 41°C in the shade.' });
    expect(ARENA_COPY.office).toEqual({ name: 'FLOOR 42', line: 'The office, after hours.' });
  });
});
