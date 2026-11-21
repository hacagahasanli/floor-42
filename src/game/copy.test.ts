import { describe, expect, it } from 'vitest';

import { COPY, copyFor, DEFAULT_VARIANT, resolveVariant, shouldAskAudience } from './copy';
import { ROSTER } from './roster';
import { createSettingsStore, sanitize, SETTINGS_KEY } from './settings';

import type { StorageLike } from './settings';

const memory = (data: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => ({
  data,
  getItem: (k) => (k in data ? data[k] : null),
  setItem: (k, v) => {
    data[k] = v;
  },
});

/** Every string inside a value (strings, arrays, nested objects). */
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

/** The same shape: arrays of the same length, objects with the same keys, all the way down. */
const shape = (v: unknown): unknown =>
  typeof v === 'string' ? 'string' : Array.isArray(v) ? v.map(shape) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v;

/** Words a non-developer would not get. None may reach the regular variant. */
const JARGON = /\b(merge|conflict(ed)?|git|commit|branch|HEAD|code review|deploy|refactor|on-call|scrum|stand-?up meeting|pushed to main|production|module|maintainer|page[rd]?)\b|<<<|>>>/i;

describe('copy table', () => {
  it('every key has a developer and a regular variant of the same shape', () => {
    for (const [key, entry] of Object.entries(COPY)) {
      expect(Object.keys(entry).sort(), key).toEqual(['developer', 'regular']);
      expect(shape(entry.regular), key).toEqual(shape(entry.developer));
    }
  });

  it('every variant line is filled in, except the optional lines around the title card', () => {
    const optional = new Set(['introAbove', 'introBelow']);
    for (const [key, entry] of Object.entries(COPY)) {
      for (const variant of ['developer', 'regular'] as const) {
        const lines = strings(entry[variant]);
        expect(lines.length, `${key}.${variant}`).toBeGreaterThan(0);
        if (!optional.has(key)) for (const l of lines) expect(l.trim(), `${key}.${variant}`).not.toBe('');
      }
    }
  });

  it('has flavour for every fighter in both variants', () => {
    for (const variant of ['developer', 'regular'] as const) {
      for (const r of ROSTER) {
        expect(COPY.fighters[variant][r.id].role, `${variant}.${r.id}`).toBeTruthy();
        expect(COPY.fighters[variant][r.id].pitch, `${variant}.${r.id}`).toBeTruthy();
      }
    }
  });

  it('the regular variant has no developer jargon; the developer variant keeps its jokes', () => {
    for (const [key, entry] of Object.entries(COPY)) {
      for (const line of strings(entry.regular)) expect(line, key).not.toMatch(JARGON);
    }
    expect(strings(copyFor('developer')).some((l) => JARGON.test(l))).toBe(true);
    expect(copyFor('developer').tagline).toBe('Code review got personal.');
  });

  it('copyFor picks one variant of every key', () => {
    const regular = copyFor('regular');
    expect(Object.keys(regular).sort()).toEqual(Object.keys(COPY).sort());
    for (const key of Object.keys(COPY) as (keyof typeof COPY)[]) expect(regular[key]).toBe(COPY[key].regular);
  });
});

describe('audience choice', () => {
  it('unset by default: the question is asked, and the plain words show until it is answered', () => {
    const store = createSettingsStore(memory());
    expect(store.get().audience).toBe('unset');
    expect(DEFAULT_VARIANT).toBe('regular');
    expect(resolveVariant(store.get().audience, false)).toBe('regular');
    expect(shouldAskAudience(store.get().audience, false)).toBe(true);
  });

  it('the answer is saved, survives a reload, and is not asked again', () => {
    const storage = memory();
    createSettingsStore(storage).set({ audience: 'developer' });
    expect(JSON.parse(storage.data[SETTINGS_KEY]).audience).toBe('developer');
    const reloaded = createSettingsStore(storage);
    expect(reloaded.get().audience).toBe('developer');
    expect(resolveVariant(reloaded.get().audience, false)).toBe('developer');
    expect(shouldAskAudience(reloaded.get().audience, false)).toBe(false);
    reloaded.set({ audience: 'regular' });
    expect(createSettingsStore(storage).get().audience).toBe('regular');
  });

  it('a junk saved value falls back to unset; Reset all keeps the answer', () => {
    expect(sanitize({ audience: 'hacker' }).audience).toBe('unset');
    const store = createSettingsStore(memory());
    store.set({ audience: 'developer', largeHud: true });
    store.resetAll();
    expect(store.get().largeHud).toBe(false);
    expect(store.get().audience).toBe('developer');
  });

  it('a portal build never asks and always shows the plain words', () => {
    expect(shouldAskAudience('unset', true)).toBe(false);
    expect(resolveVariant('developer', true)).toBe('regular');
  });
});
