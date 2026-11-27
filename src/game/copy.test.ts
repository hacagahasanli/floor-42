import { describe, expect, it } from 'vitest';

import { ARENA_MATCH_COPY, COPY, copyFor } from './copy';
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

/** Developer-themed words (roster-v2 section 8, criterion 1). None may reach the player. */
const JARGON = /\b(merge[ds]?|conflict(ed)?|git|commits?|branch|code review|deploy|refactor|on-call|scrum|stand-?up|hotfix|legacy|intern|developers?|pushed to main|production|module|maintainer|page[rd]?)\b|<<<|>>>/i;
const JARGON_CASE = /\bHEAD\b/;

describe('copy table', () => {
  it('every line is filled in, except the optional lines around the title card', () => {
    const optional = new Set(['introAbove', 'introBelow']);
    for (const [key, entry] of Object.entries(COPY)) {
      const lines = strings(entry);
      expect(lines.length, key).toBeGreaterThan(0);
      if (!optional.has(key)) for (const l of lines) expect(l.trim(), key).not.toBe('');
    }
  });

  it('is one flat table: no voice variants, no hidden alias in the enumerable keys', () => {
    for (const [key, entry] of Object.entries(COPY)) expect(Object.keys(entry as object), key).not.toContain('developer');
    expect(Object.keys(COPY.fighters).sort()).toEqual(ROSTER.map((r) => r.id).sort());
  });

  it('has flavour for every fighter', () => {
    for (const r of ROSTER) {
      expect(COPY.fighters[r.id].role, r.id).toBeTruthy();
      expect(COPY.fighters[r.id].pitch, r.id).toBeTruthy();
    }
  });

  it('roles are the roster-v3 section 5 roles', () => {
    expect(ROSTER.map((r) => COPY.fighters[r.id].role)).toEqual(['The Jammer', 'The Office Dad', 'The Tiny Coach', 'The Trailblazer']);
  });

  it('no developer jargon anywhere, in the table or in any fighter name or one-liner', () => {
    for (const [key, entry] of Object.entries(COPY)) {
      for (const line of strings(entry)) {
        expect(line, key).not.toMatch(JARGON);
        expect(line, key).not.toMatch(JARGON_CASE);
      }
    }
    for (const r of ROSTER) for (const line of [r.name, r.personality, r.trait, r.traitLine]) expect(line, r.id).not.toMatch(JARGON);
    expect(copyFor().tagline).toBe('Two coworkers. One grudge. No mercy.');
  });

  it('a saved audience answer from an old build is dropped: one voice for everyone', () => {
    const storage = memory();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ audience: 'developer', largeHud: true }));
    const s = createSettingsStore(storage).get();
    expect('audience' in s).toBe(false);
    expect(s.largeHud).toBe(true);
    expect('audience' in sanitize({ audience: 'developer' })).toBe(false);
  });
});

describe('per-arena match copy (F-043)', () => {
  it('Offsite names the place in the regular voice; the office keeps its lines', () => {
    const o = copyFor('offsite');
    expect(o.introTitle).toEqual(['TEAM-BUILDING', 'NO MERCY']);
    expect(o.introLine).toBe('Two fighters. One canyon of guns. First to 5 KOs wins.');
    expect(o.knockoutLine).toBe('{NAME} WINS THE OFFSITE');
    expect(o.resultWin).toBe('You survived the offsite.');
    expect(o.resultLoss).toBe('The offsite got you.');
    expect(o.resultDemo).toBe('{NAME} survived the offsite.');
    expect(copyFor('office')).toEqual(copyFor());
    expect(copyFor().knockoutLine).toBe('{NAME} TAKES THE FLOOR');
  });
  it('no "office" or "floor" word in any Offsite place line, and no developer jargon', () => {
    for (const line of strings(ARENA_MATCH_COPY.offsite)) {
      expect(line).not.toMatch(/\b(office|floor)\b/i);
      expect(line).not.toMatch(JARGON);
    }
  });
  it('no tip says "top floor"', () => {
    expect(strings(COPY.tips).some((l) => /top floor/i.test(l))).toBe(false);
  });
});
