/**
 * Every player setting in one place: controls, camera, graphics, audio and accessibility.
 * Pure (no DOM, no three.js): the storage is passed in, so the store runs in tests as it does in the browser.
 * The menu's Settings panel and the in-game pause menu edit this store; the game, the menu backdrop and the
 * sound engine subscribe to it and apply changes at once (no reload).
 */
import type { AimMode, Button } from './input';

export type Quality = 'auto' | 'low' | 'medium' | 'high';
/** Two keys per action: primary and secondary ('' = none). */
export type Bindings = Record<Button, [string, string]>;

export interface AudioSettings {
  master: number;
  effects: number;
  guns: number;
  ui: number;
  muted: boolean;
}

export interface Settings {
  bindings: Bindings;
  aimMode: AimMode;
  touch: { size: number; opacity: number; leftHanded: boolean };
  /** Camera shake and screen flashes on big hits. */
  shake: boolean;
  quality: Quality;
  shadows: boolean;
  /** 0.5..1, multiplies the tier's pixel ratio. */
  resScale: number;
  showFps: boolean;
  audio: AudioSettings;
  reducedMotion: boolean;
  colourBlind: boolean;
  largeHud: boolean;
}

/** The order the Controls tab lists the actions in, with their names. */
export const ACTIONS: { id: Button; label: string }[] = [
  { id: 'left', label: 'Move left' },
  { id: 'right', label: 'Move right' },
  { id: 'up', label: 'Jump' },
  { id: 'down', label: 'Drop down' },
  { id: 'fire', label: 'Shoot' },
  { id: 'dash', label: 'Dash' },
  { id: 'push', label: 'Force Push' },
  { id: 'reload', label: 'Swap gun / reload' },
  { id: 'pickup', label: 'Pick up' },
];

export const DEFAULT_BINDINGS: Bindings = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  fire: ['Space', ''],
  dash: ['ShiftLeft', 'ShiftRight'],
  push: ['KeyQ', ''],
  pickup: ['KeyE', ''],
  reload: ['KeyR', ''],
};

/** Keys the game keeps for itself: pause, mute, aim toggle, respawn picks, confirm. */
export const RESERVED_KEYS = new Set(['Escape', 'KeyM', 'KeyT', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Enter', 'Tab', 'MetaLeft', 'MetaRight']);

export const DEFAULT_SETTINGS: Settings = {
  bindings: DEFAULT_BINDINGS,
  aimMode: 'auto',
  touch: { size: 1, opacity: 0.9, leftHanded: false },
  shake: true,
  quality: 'auto',
  shadows: true,
  resScale: 1,
  showFps: false,
  audio: { master: 0.8, effects: 1, guns: 0.45, ui: 0.7, muted: false },
  reducedMotion: false,
  colourBlind: false,
  largeHud: false,
};

export const SETTINGS_KEY = 'floor42:settings';
/** Older single-purpose keys, read once when there are no saved settings yet. */
const LEGACY = { motion: 'merge-conflict:motion', muted: 'merge-conflict:muted', volume: 'floor42:volume', aim: 'merge-conflict:aim' };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{1,24}$/.test(v) && !RESERVED_KEYS.has(v);

const cloneBindings = (b: Bindings): Bindings => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]])) as Bindings;

/** Bindings from storage, repaired: unknown actions and bad codes drop out, a code is never on two actions. */
export const sanitizeBindings = (raw: unknown): Bindings => {
  const out = cloneBindings(DEFAULT_BINDINGS);
  if (!raw || typeof raw !== 'object') return out;
  const seen = new Set<string>();
  for (const { id } of ACTIONS) {
    const v = (raw as Record<string, unknown>)[id];
    if (!Array.isArray(v)) continue;
    const slots: [string, string] = ['', ''];
    for (let i = 0; i < 2; i++) {
      const c = v[i];
      if (isCode(c) && !seen.has(c)) {
        slots[i] = c;
        seen.add(c);
      }
    }
    out[id] = slots;
  }
  // Defaults that were not overwritten may now clash with a saved key: clear those.
  const owner = new Map<string, Button>();
  for (const { id } of ACTIONS) {
    out[id] = out[id].map((c) => {
      if (!c) return c;
      if (owner.has(c)) return '';
      owner.set(c, id);
      return c;
    }) as [string, string];
  }
  return out;
};

export const sanitize = (raw: unknown): Settings => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const d = DEFAULT_SETTINGS;
  const t = (r.touch ?? {}) as Record<string, unknown>;
  const a = (r.audio ?? {}) as Record<string, unknown>;
  return {
    bindings: sanitizeBindings(r.bindings),
    aimMode: pick(r.aimMode, ['auto', 'mouse'] as const, d.aimMode),
    touch: { size: clamp(t.size, 0.75, 1.35, d.touch.size), opacity: clamp(t.opacity, 0.3, 1, d.touch.opacity), leftHanded: bool(t.leftHanded, d.touch.leftHanded) },
    shake: bool(r.shake, d.shake),
    quality: pick(r.quality, ['auto', 'low', 'medium', 'high'] as const, d.quality),
    shadows: bool(r.shadows, d.shadows),
    resScale: clamp(r.resScale, 0.5, 1, d.resScale),
    showFps: bool(r.showFps, d.showFps),
    audio: {
      master: clamp(a.master, 0, 1, d.audio.master),
      effects: clamp(a.effects, 0, 1, d.audio.effects),
      guns: clamp(a.guns, 0, 1, d.audio.guns),
      ui: clamp(a.ui, 0, 1, d.audio.ui),
      muted: bool(a.muted, d.audio.muted),
    },
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    colourBlind: bool(r.colourBlind, d.colourBlind),
    largeHud: bool(r.largeHud, d.largeHud),
  };
};

const safeGet = (s: StorageLike | null, key: string) => {
  try {
    return s?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

/** Saved settings, or the defaults seeded from the older single-purpose keys. */
export const loadSettings = (storage: StorageLike | null): Settings => {
  const saved = safeGet(storage, SETTINGS_KEY);
  if (saved) {
    try {
      return sanitize(JSON.parse(saved));
    } catch {
      /* corrupt: fall through to defaults */
    }
  }
  const s = sanitize({});
  if (safeGet(storage, LEGACY.motion) === '0') s.shake = false;
  if (safeGet(storage, LEGACY.muted) === '1') s.audio.muted = true;
  if (safeGet(storage, LEGACY.aim) === 'mouse') s.aimMode = 'mouse';
  try {
    const v = JSON.parse(safeGet(storage, LEGACY.volume) ?? '{}') as { master?: unknown; guns?: unknown };
    s.audio.master = clamp(v.master, 0, 1, s.audio.master);
    s.audio.guns = clamp(v.guns, 0, 1, s.audio.guns);
  } catch {
    /* ignore */
  }
  return s;
};

export const saveSettings = (storage: StorageLike | null, s: Settings) => {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
};

export type RebindResult =
  | { ok: true; bindings: Bindings; swapped: { action: Button; slot: 0 | 1; code: string } | null }
  | { ok: false; reason: 'reserved' };

/**
 * Put `code` on `action`'s `slot`. If another action already has that key, the two trade: the other action
 * gets the key this slot had before (or nothing), and the caller is told so it can show the swap.
 */
export const rebind = (bindings: Bindings, action: Button, slot: 0 | 1, code: string): RebindResult => {
  if (RESERVED_KEYS.has(code)) return { ok: false, reason: 'reserved' };
  const next = cloneBindings(bindings);
  const previous = next[action][slot];
  let swapped: { action: Button; slot: 0 | 1; code: string } | null = null;
  for (const { id } of ACTIONS) {
    for (const s of [0, 1] as const) {
      if (next[id][s] === code && !(id === action && s === slot)) {
        next[id][s] = id === action ? '' : previous;
        if (id !== action) swapped = { action: id, slot: s, code: previous };
      }
    }
  }
  next[action][slot] = code;
  return { ok: true, bindings: next, swapped };
};

export const clearBinding = (bindings: Bindings, action: Button, slot: 0 | 1): Bindings => {
  const next = cloneBindings(bindings);
  next[action][slot] = '';
  return next;
};

/** Every action that has no key at all (shown as a warning in the Controls tab). */
export const unboundActions = (b: Bindings) => ACTIONS.filter(({ id }) => !b[id][0] && !b[id][1]).map((a) => a.id);

/** A short label for a key code, as printed on a keycap. */
export const keyLabel = (code: string): string => {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backspace: 'Bksp', CapsLock: 'Caps',
  };
  return named[code] ?? code;
};

/** The first key bound to an action, as a label (for HUD hints). */
export const primaryLabel = (b: Bindings, action: Button) => keyLabel(b[action][0] || b[action][1]);

type Listener = (s: Settings) => void;

/** A tiny observable store over `storage`. Every change is saved and pushed to subscribers. */
export const createSettingsStore = (storage: StorageLike | null) => {
  let current = loadSettings(storage);
  /** A platform (e.g. a games portal SDK) can force sound off; it wins over the player's setting, never saved. */
  let externalMute = false;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l(current));
  const commit = (next: Settings) => {
    current = sanitize(next);
    saveSettings(storage, current);
    emit();
  };
  return {
    get: () => current,
    set: (patch: Partial<Settings>) => commit({ ...current, ...patch }),
    setAudio: (patch: Partial<AudioSettings>) => commit({ ...current, audio: { ...current.audio, ...patch } }),
    setTouch: (patch: Partial<Settings['touch']>) => commit({ ...current, touch: { ...current.touch, ...patch } }),
    rebind: (action: Button, slot: 0 | 1, code: string) => {
      const r = rebind(current.bindings, action, slot, code);
      if (r.ok) commit({ ...current, bindings: r.bindings });
      return r;
    },
    clearBinding: (action: Button, slot: 0 | 1) => commit({ ...current, bindings: clearBinding(current.bindings, action, slot) }),
    resetBindings: () => commit({ ...current, bindings: cloneBindings(DEFAULT_BINDINGS) }),
    resetAll: () => commit(sanitize({})),
    /** Sound is off when the player muted it or the platform asked for silence. */
    effectiveMute: () => current.audio.muted || externalMute,
    setExternalMute: (on: boolean) => {
      externalMute = on;
      emit();
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
};

export type SettingsStore = ReturnType<typeof createSettingsStore>;

let browserStore: SettingsStore | null = null;
/** The page's one store, over localStorage (or memory only when storage is blocked). */
export const getSettings = (): SettingsStore => {
  if (browserStore) return browserStore;
  let storage: StorageLike | null = null;
  try {
    storage = typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    storage = null;
  }
  browserStore = createSettingsStore(storage);
  return browserStore;
};
