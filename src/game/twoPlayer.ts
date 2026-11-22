/**
 * Local 2-player (same keyboard) rules that are not drawing: key maps, which keys are allowed, routing held keys and
 * gamepads to the two fighters, player colours, match length and the session tally.
 * Spec: docs/collab/CREATIVE/specifications/local-2p.md. Pure (no DOM): unit-tested in twoPlayer.test.ts.
 */
import { RESERVED_KEYS } from './reservedKeys';
import { EMPTY_INPUT } from './sim/types';

import type { StorageLike } from './settings';
import type { InputState } from './sim/types';

export type Player = 'p1' | 'p2';
export const PLAYERS: Player[] = ['p1', 'p2'];

/** The seven things a 2-player fighter does. Pick up, reload, crouch-anywhere and throw bomb are automatic. */
export type Action2P = 'left' | 'right' | 'up' | 'down' | 'fire' | 'push' | 'dash';

/** One key per action per player. */
export type Bindings2P = Record<Player, Record<Action2P, string>>;

/** The order the 2 Player tab and the key card list the actions in, with their key card labels. */
export const ACTIONS_2P: { id: Action2P; label: string }[] = [
  { id: 'left', label: 'Move left' },
  { id: 'right', label: 'Move right' },
  { id: 'up', label: 'Jump' },
  { id: 'down', label: 'Crouch' },
  { id: 'fire', label: 'Shoot' },
  { id: 'push', label: 'Push' },
  { id: 'dash', label: 'Dash' },
];

/** Spec 1.1: P1 = WASD + F G H, P2 = arrows + ; L K (a mirror by finger, J empty between the two players' hands). */
export const DEFAULT_BINDINGS_2P: Bindings2P = {
  p1: {
    left: 'KeyA',
    right: 'KeyD',
    up: 'KeyW',
    down: 'KeyS',
    fire: 'KeyF',
    push: 'KeyG',
    dash: 'KeyH',
  },
  p2: {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    fire: 'Semicolon',
    push: 'KeyL',
    dash: 'KeyK',
  },
};

/**
 * Keys a 2-player map may use: letters, digits, arrows and the punctuation on the letter rows. Left out on purpose
 * (spec 1.3): Space (the 1P shoot key, reached by both thumbs), Shift (Sticky Keys), Enter, Tab, Ctrl, Alt, Meta,
 * Fn, ' and / (Firefox Quick Find), the numpad (absent on laptops), function keys and Esc.
 */
const ALLOWED_2P =
  /^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Semicolon|Comma|Period|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote|IntlBackslash)$/;

/** True when `code` can go on a 2-player action (and is not one the game keeps: Esc, M, T, 1-4, Enter, Tab). */
export const allowed2P = (code: string) => ALLOWED_2P.test(code) && !RESERVED_KEYS.has(code);

const clone2P = (b: Bindings2P): Bindings2P => ({ p1: { ...b.p1 }, p2: { ...b.p2 } });

/**
 * Bindings from storage, repaired: bad or forbidden codes fall back to the default, and a key is never on two actions
 * across both players (the later one gives way: empty, shown as unbound in Settings).
 */
export const sanitizeBindings2P = (raw: unknown): Bindings2P => {
  const out = clone2P(DEFAULT_BINDINGS_2P);
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  for (const p of PLAYERS) {
    const side = r[p] && typeof r[p] === 'object' ? (r[p] as Record<string, unknown>) : {};
    for (const { id } of ACTIONS_2P) {
      const v = side[id];
      if (v === '' || (typeof v === 'string' && allowed2P(v))) out[p][id] = v;
    }
  }
  const seen = new Set<string>();
  for (const p of PLAYERS)
    for (const { id } of ACTIONS_2P) {
      const c = out[p][id];
      if (!c) continue;
      if (seen.has(c)) out[p][id] = '';
      else seen.add(c);
    }
  return out;
};

export type Rebind2PResult =
  | {
      ok: true;
      bindings: Bindings2P;
      swapped: { player: Player; action: Action2P; code: string } | null;
    }
  | { ok: false; reason: 'reserved' };

/** Put `code` on one player's action. If another action (either player's) has it, the two trade keys. */
export const rebind2P = (
  b: Bindings2P,
  player: Player,
  action: Action2P,
  code: string,
): Rebind2PResult => {
  if (!allowed2P(code)) return { ok: false, reason: 'reserved' };
  const next = clone2P(b);
  const previous = next[player][action];
  let swapped: { player: Player; action: Action2P; code: string } | null = null;
  for (const p of PLAYERS)
    for (const { id } of ACTIONS_2P) {
      if ((p !== player || id !== action) && next[p][id] === code) {
        next[p][id] = previous;
        swapped = { player: p, action: id, code: previous };
      }
    }
  next[player][action] = code;
  return { ok: true, bindings: next, swapped };
};

/** Every 2-player action with no key. */
export const unbound2P = (b: Bindings2P) =>
  PLAYERS.flatMap((p) =>
    ACTIONS_2P.filter(({ id }) => !b[p][id]).map(({ id }) => ({ player: p, action: id })),
  );

/** Every key a 2-player map uses (to preventDefault them all). */
export const keys2P = (b: Bindings2P) =>
  new Set(PLAYERS.flatMap((p) => Object.values(b[p]).filter(Boolean)));

/** Key code -> [player index, action]. */
export const lookup2P = (b: Bindings2P) => {
  const m = new Map<string, [0 | 1, Action2P]>();
  PLAYERS.forEach((p, i) =>
    ACTIONS_2P.forEach(({ id }) => b[p][id] && m.set(b[p][id], [i as 0 | 1, id])),
  );
  return m;
};

/** The two fighters' buttons from the keys held down. Aim is filled in later (auto-aim, always on in 2P). */
export const route2P = (down: Iterable<string>, b: Bindings2P): [InputState, InputState] => {
  const out: [InputState, InputState] = [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }];
  const map = lookup2P(b);
  for (const code of down) {
    const hit = map.get(code);
    if (hit) out[hit[0]][hit[1]] = true;
  }
  return out;
};

/** A gamepad's buttons, read as plain numbers so this stays testable: `buttons[i]` pressed, `axes` the sticks. */
export interface PadLike {
  buttons: readonly { pressed: boolean; value?: number }[];
  axes: readonly number[];
}

/** Stick deadzone for moving, and the deeper one for crouch / drop (spec 1.6). */
export const PAD_MOVE_DEAD = 0.35;
export const PAD_DOWN_DEAD = 0.5;

/**
 * Standard mapping (spec 1.6): left stick or d-pad moves, stick or d-pad down crouches/drops, A jumps (stick up does
 * not), X or RT shoots, B or LB pushes, RB or LT dashes. Start (9) is pause and is read by the caller.
 */
export const padInput = (pad: PadLike): Partial<InputState> => {
  const b = (i: number) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.5;
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  return {
    left: b(14) || ax < -PAD_MOVE_DEAD,
    right: b(15) || ax > PAD_MOVE_DEAD,
    down: b(13) || ay > PAD_DOWN_DEAD,
    up: b(0),
    fire: b(2) || b(7),
    push: b(1) || b(4),
    dash: b(5) || b(6),
  };
};

export const padStart = (pad: PadLike) => !!pad.buttons[9]?.pressed;

/** Which player each connected pad drives (by order): one pad plays P2, two pads play P1 and P2, more are ignored. */
export const padPlayers = (count: number): (0 | 1)[] =>
  count <= 0 ? [] : count === 1 ? [1] : [0, 1];

/** Merge pad buttons into keyboard input (either source holds a button down). */
export const mergeInput = (into: InputState, extra: Partial<InputState>) => {
  for (const [k, v] of Object.entries(extra))
    if (v === true) (into as unknown as Record<string, boolean>)[k] = true;
  return into;
};

/** Spec 3.4: red / blue, or the colour-blind pair. Only for tags, rings, cursors, READY, score digits, results. */
export const PLAYER_COLOURS = {
  normal: ['#ff4d4d', '#4d7cff'],
  colourBlind: ['#e69f00', '#56b4e9'],
} as const;
export const playerColour = (index: 0 | 1, colourBlind: boolean) =>
  PLAYER_COLOURS[colourBlind ? 'colourBlind' : 'normal'][index];

/** First to 3, 5 or 7 (spec 3.2); Push cycles 3 -> 5 -> 7 -> 3. Default 5. */
export const MATCH_LENGTHS = [3, 5, 7] as const;
export type MatchLength = (typeof MATCH_LENGTHS)[number];
export const DEFAULT_LENGTH: MatchLength = 5;
export const nextLength = (n: number): MatchLength =>
  MATCH_LENGTHS[(MATCH_LENGTHS.indexOf(n as MatchLength) + 1) % MATCH_LENGTHS.length];
export const parseLength = (v: unknown): MatchLength => {
  const n = Number(v);
  return (MATCH_LENGTHS as readonly number[]).includes(n) ? (n as MatchLength) : DEFAULT_LENGTH;
};

/** Session keys: the tally, the chosen match length and whether the key card was seen (once per browser session). */
export const TALLY_KEY = 'floor42:2p-tally';
export const LENGTH_KEY = 'floor42:2p-length';
export const KEYCARD_KEY = 'floor42:2p-keycard';

export interface Tally {
  p1: number;
  p2: number;
}

const read = (s: StorageLike | null, key: string) => {
  try {
    return s?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const write = (s: StorageLike | null, key: string, v: string) => {
  try {
    s?.setItem(key, v);
  } catch {
    /* storage blocked: the tally lives for this page only */
  }
};

export const readTally = (s: StorageLike | null): Tally => {
  try {
    const t = JSON.parse(read(s, TALLY_KEY) ?? '{}') as Partial<Tally>;
    const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);
    return { p1: n(t.p1), p2: n(t.p2) };
  } catch {
    return { p1: 0, p2: 0 };
  }
};

/** Count a decided match (winner 0 = P1, 1 = P2). A draw (-1 or null) does not count (spec 5). */
export const addToTally = (s: StorageLike | null, winner: number | null): Tally => {
  const t = readTally(s);
  if (winner === 0) t.p1 += 1;
  else if (winner === 1) t.p2 += 1;
  write(s, TALLY_KEY, JSON.stringify(t));
  return t;
};

export const resetTally = (s: StorageLike | null) =>
  write(s, TALLY_KEY, JSON.stringify({ p1: 0, p2: 0 }));

export const readLength = (s: StorageLike | null): MatchLength => parseLength(read(s, LENGTH_KEY));
export const saveLength = (s: StorageLike | null, n: MatchLength) =>
  write(s, LENGTH_KEY, String(n));

export const keyCardSeen = (s: StorageLike | null) => read(s, KEYCARD_KEY) === '1';
export const markKeyCardSeen = (s: StorageLike | null) => write(s, KEYCARD_KEY, '1');

/** The browser's sessionStorage, or null where it is blocked. */
export const sessionStore = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

/**
 * Spec 6 + F-012: 2 PLAYER shows on keyboard devices; on touch-only devices only while two pads are connected (there is
 * no keyboard for P1 there).
 */
export const show2PMenuItem = (touch: boolean, pads: number) => !touch || pads >= 2;

export type CursorDir = 'left' | 'right' | 'up' | 'down';

/** The select screen's cursor step: a 2x2 grid of the four fighters (wide), or one row of four (narrow). */
export const stepCursor = (i: number, dir: CursorDir, narrow: boolean): number => {
  if (narrow) return dir === 'left' ? Math.max(0, i - 1) : dir === 'right' ? Math.min(3, i + 1) : i;
  const row = i >> 1;
  const col = i & 1;
  if (dir === 'left' || dir === 'right') return row * 2 + (dir === 'left' ? 0 : 1);
  return (dir === 'up' ? 0 : 1) * 2 + col;
};
