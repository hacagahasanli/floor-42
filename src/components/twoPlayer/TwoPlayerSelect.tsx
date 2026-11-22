'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { menuSound } from '~/components/menu/menuSound';
import { useCopy } from '~/components/menu/useCopy';
import { useSettings } from '~/components/menu/useSettings';
import { ROSTER } from '~/game/roster';
import { nextLength, padPlayers, saveLength, sessionStore, stepCursor } from '~/game/twoPlayer';

import { PlayerChip, SmallKey, useKeyLabel, usePlayerColours } from './shared';

import type { CursorDir as Dir, MatchLength, Player } from '~/game/twoPlayer';
import type { CharacterId } from '~/game/sim/types';
import type { CSSProperties } from 'react';

/**
 * The split fighter select for local 2-player (spec local-2p.md 3.2): P1's panel left, P2's right, each a 2x2 grid of
 * the four fighters with the player's own cursor. Shoot locks in (READY), moving unlocks, Push cycles First to 3 / 5 /
 * 7, Esc goes back. When both are READY the match starts after a 500 ms beat.
 */

const idx = (id: CharacterId) => ROSTER.findIndex((r) => r.id === id);

export const TwoPlayerSelect = ({
  initial,
  length: initialLength,
  portraits,
  onBack,
  onFight,
}: {
  initial: [CharacterId, CharacterId];
  length: MatchLength;
  portraits: Record<CharacterId, string> | null;
  onBack: () => void;
  onFight: (p1: CharacterId, p2: CharacterId, n: MatchLength) => void;
}) => {
  const settings = useSettings();
  const b = settings.bindings2p;
  const [cursor, setCursor] = useState<[number, number]>([idx(initial[0]), idx(initial[1])]);
  const [ready, setReady] = useState<[boolean, boolean]>([false, false]);
  const [length, setLength] = useState<MatchLength>(initialLength);
  const [pops, setPops] = useState<[number, number]>([0, 0]);
  const [narrow, setNarrow] = useState(false);
  /** Under 640 px wide the two panels stack; otherwise they sit side by side. */
  const [stack, setStack] = useState(false);
  const [pads, setPads] = useState(0);
  const state = useRef({ cursor, ready, narrow });
  state.current = { cursor, ready, narrow };
  const going = useRef(false);

  useEffect(() => {
    const on = () => {
      setNarrow(window.innerWidth < 1024);
      setStack(window.innerWidth < 640);
    };
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  useEffect(() => saveLength(sessionStore(), length), [length]);

  const move = useCallback((p: 0 | 1, dir: Dir) => {
    const s = state.current;
    const next = stepCursor(s.cursor[p], dir, s.narrow);
    if (next === s.cursor[p] && !s.ready[p]) return;
    menuSound.tick();
    setCursor((c) => (p === 0 ? [next, c[1]] : [c[0], next]));
    // Moving after locking unlocks.
    setReady((r) => (p === 0 ? [false, r[1]] : [r[0], false]));
  }, []);
  const pick = useCallback((p: 0 | 1, i: number) => {
    menuSound.tick();
    setCursor((c) => (p === 0 ? [i, c[1]] : [c[0], i]));
    setReady((r) => (p === 0 ? [false, r[1]] : [r[0], false]));
  }, []);
  const lock = useCallback((p: 0 | 1) => {
    if (state.current.ready[p]) return;
    menuSound.confirm();
    setReady((r) => (p === 0 ? [true, r[1]] : [r[0], true]));
    setPops((n) => (p === 0 ? [n[0] + 1, n[1]] : [n[0], n[1] + 1]));
  }, []);
  const toggleReady = (p: 0 | 1) => {
    if (state.current.ready[p]) {
      menuSound.back();
      setReady((r) => (p === 0 ? [false, r[1]] : [r[0], false]));
    } else lock(p);
  };
  const cycle = useCallback(() => {
    menuSound.tick();
    setLength((n) => nextLength(n));
  }, []);

  // Both READY: a 500 ms beat, then the lift.
  useEffect(() => {
    if (!ready[0] || !ready[1] || going.current) return;
    const t = window.setTimeout(() => {
      going.current = true;
      onFight(ROSTER[cursor[0]].id, ROSTER[cursor[1]].id, length);
    }, 500);
    return () => window.clearTimeout(t);
  }, [ready, cursor, length, onFight]);

  // Keyboard: each player's own keys. Every 2-player key, the arrows and Space are swallowed (no page scroll).
  useEffect(() => {
    const map = new Map<string, [0 | 1, string]>();
    (['p1', 'p2'] as Player[]).forEach((p, i) =>
      Object.entries(b[p]).forEach(([a, code]) => code && map.set(code, [i as 0 | 1, a])),
    );
    const onKey = (e: KeyboardEvent) => {
      if (going.current) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        menuSound.back();
        onBack();
        return;
      }
      const hit = map.get(e.code);
      if (hit || e.code === 'Space') e.preventDefault();
      if (!hit || e.repeat) return;
      const [p, a] = hit;
      if (a === 'left' || a === 'right' || a === 'up' || a === 'down') move(p, a);
      else if (a === 'fire') lock(p);
      else if (a === 'push') cycle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [b, move, lock, cycle, onBack]);

  // Pads drive their player's panel: d-pad / stick move, A ready, B back, X or LB change the length.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let raf = 0;
    const held = new Map<string, number>();
    const poll = (now: number) => {
      const list = (navigator.getGamepads() ?? []).filter((p): p is Gamepad => !!p);
      setPads((n) => (n === list.length ? n : list.length));
      padPlayers(list.length).forEach((player, i) => {
        const pad = list[i];
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        const btn = (k: number) => !!pad.buttons[k]?.pressed;
        const inputs: [string, boolean, () => void][] = [
          ['l', btn(14) || ax < -0.6, () => move(player, 'left')],
          ['r', btn(15) || ax > 0.6, () => move(player, 'right')],
          ['u', btn(12) || ay < -0.6, () => move(player, 'up')],
          ['d', btn(13) || ay > 0.6, () => move(player, 'down')],
          ['a', btn(0), () => lock(player)],
          ['b', btn(1), () => onBack()],
          ['x', btn(2) || btn(4), () => cycle()],
        ];
        for (const [k, down, fire] of inputs) {
          const id = `${pad.index}:${k}`;
          if (down && !held.has(id)) {
            held.set(id, now);
            if (!going.current) fire();
          } else if (!down) held.delete(id);
        }
      });
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [move, lock, cycle, onBack]);

  const padFor = padPlayers(pads);
  return (
    <section
      aria-label="2 player fighter select"
      data-testid="select-2p"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-ink-deep/70 px-4 py-4 [animation:fadeIn_0.25s_ease-out] sm:px-8"
    >
      <div
        className={`grid w-full max-w-6xl items-start ${stack ? 'grid-cols-1 gap-3' : narrow ? 'grid-cols-[1fr_auto_1fr] gap-3' : 'grid-cols-[1fr_auto_1fr] gap-6'}`}
      >
        <Panel
          player="p1"
          index={0}
          cursor={cursor}
          ready={ready[0]}
          pop={pops[0]}
          narrow={narrow}
          pad={padFor.includes(0)}
          portraits={portraits}
          onPick={(i) => pick(0, i)}
          onReady={() => toggleReady(0)}
        />
        <LengthChip length={length} onCycle={cycle} p1Push={b.p1.push} p2Push={b.p2.push} />
        <Panel
          player="p2"
          index={1}
          cursor={cursor}
          ready={ready[1]}
          pop={pops[1]}
          narrow={narrow}
          pad={padFor.includes(1)}
          portraits={portraits}
          onPick={(i) => pick(1, i)}
          onReady={() => toggleReady(1)}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          menuSound.back();
          onBack();
        }}
        className="focus-ring -skew-x-12 bg-cream/10 px-5 py-2 text-xs font-bold uppercase tracking-wider hover:bg-cream/20"
      >
        <span className="inline-flex skew-x-12 items-center gap-2">
          <kbd className="border border-cream/30 px-1 text-[10px]">Esc</kbd> Back
        </span>
      </button>
    </section>
  );
};

const LengthChip = ({
  length,
  onCycle,
  p1Push,
  p2Push,
}: {
  length: MatchLength;
  onCycle: () => void;
  p1Push: string;
  p2Push: string;
}) => {
  const label = useKeyLabel();
  return (
    <div className="flex flex-col items-center gap-1.5 self-center">
      <button
        type="button"
        data-testid="length-chip"
        onClick={onCycle}
        className="focus-ring panel-cut -skew-x-6 bg-gold px-5 py-2 font-display text-xl text-ink-deep shadow-[0_0_30px_rgba(255,210,63,0.3)] hover:brightness-110"
      >
        <span className="inline-block skew-x-6">First to {length}</span>
      </button>
      <span className="text-[11px] text-cream/55">
        {label(p1Push)} / {label(p2Push)} to change
      </span>
    </div>
  );
};

const Panel = ({
  player,
  index,
  cursor,
  ready,
  pop,
  narrow,
  pad,
  portraits,
  onPick,
  onReady,
}: {
  player: Player;
  index: 0 | 1;
  cursor: [number, number];
  ready: boolean;
  pop: number;
  narrow: boolean;
  pad: boolean;
  portraits: Record<CharacterId, string> | null;
  onPick: (i: number) => void;
  onReady: () => void;
}) => {
  const copy = useCopy();
  const label = useKeyLabel();
  const colours = usePlayerColours();
  const colour = colours[index];
  const b = useSettings().bindings2p[player];
  const mine = cursor[index];
  const r = ROSTER[mine];
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (!pop) return;
    setPopping(true);
    const t = window.setTimeout(() => setPopping(false), 120);
    return () => window.clearTimeout(t);
  }, [pop]);
  return (
    <div
      data-testid={`panel-${player}`}
      data-ready={ready}
      className="panel-cut relative flex flex-col gap-3 bg-ink/85 p-4 backdrop-blur-sm [@media(max-height:500px)]:gap-1.5 [@media(max-height:500px)]:p-2"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <PlayerChip index={index} colour={colour} className="text-lg" />
          {pad && (
            <span className="text-cream/70" title="Gamepad" aria-label="Gamepad">
              <svg viewBox="0 0 24 16" width="22" height="15" aria-hidden>
                <path
                  d="M6 2h12a5 5 0 0 1 5 5l-1 6a3 3 0 0 1-5 1l-2-3H9l-2 3a3 3 0 0 1-5-1L1 7a5 5 0 0 1 5-5z"
                  fill="currentColor"
                />
              </svg>
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-cream/70">
          <SmallKey k={label(b.left)} />
          <SmallKey k={label(b.right)} /> move · <SmallKey k={label(b.fire)} /> ready
        </span>
      </header>
      <div
        className={`grid gap-2 ${narrow ? 'grid-cols-4' : 'grid-cols-2'}`}
        role="radiogroup"
        aria-label={`P${index + 1} fighter`}
      >
        {ROSTER.map((f, i) => {
          const me = i === mine;
          const other = i === cursor[1 - index];
          // Picked by both: a split border, left half P1's colour, right half P2's.
          const frame: CSSProperties =
            me && other
              ? { background: `linear-gradient(90deg, ${colours[0]} 50%, ${colours[1]} 50%)` }
              : me
                ? { background: colour }
                : { background: 'rgba(230,235,245,0.08)' };
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={me}
              data-testid={`card-${player}-${f.id}`}
              onClick={() => onPick(i)}
              className="relative p-[3px] transition-transform duration-100"
              style={{ ...frame, transform: me && popping ? 'scale(1.06)' : undefined }}
            >
              <span
                className={`relative flex flex-col justify-end overflow-hidden bg-ink-deep ${narrow ? 'h-24 [@media(max-height:500px)]:h-16' : 'h-36 [@media(max-height:760px)]:h-28 [@media(max-height:600px)]:h-20'}`}
              >
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: f.accent }} />
                <span
                  className="absolute inset-0 opacity-30"
                  style={{
                    background: `radial-gradient(circle at 50% 40%, ${f.accent}, transparent 65%)`,
                  }}
                />
                {portraits && (
                  // A rendered portrait, not a photo: a plain <img> is right here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={portraits[f.id]}
                    alt=""
                    className="absolute inset-x-0 top-1 mx-auto h-[80%] w-auto object-contain"
                  />
                )}
                <span
                  className={`relative bg-gradient-to-t from-ink-deep to-transparent pb-1 pt-3 text-left font-display leading-none ${narrow ? 'px-1 text-[10px]' : 'px-2 text-sm'}`}
                  style={{ color: f.accent }}
                >
                  {f.name.toUpperCase()}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="relative flex min-h-[3.25rem] flex-col justify-center">
        {ready ? (
          // Locked in: READY stamped across the bottom of the panel in the player colour.
          <span
            data-testid={`ready-stamp-${player}`}
            className="flex -rotate-3 justify-center border-4 py-0.5 font-display text-4xl leading-none [animation:riseIn_0.15s_ease-out] [@media(max-height:600px)]:text-3xl"
            style={{ color: colour, borderColor: colour }}
          >
            READY
          </span>
        ) : (
          <>
            <span
              className="font-display text-3xl leading-none [@media(max-height:600px)]:text-2xl"
              style={{ color: r.accent }}
            >
              {r.name.toUpperCase()}
            </span>
            <span className="text-sm text-cream/70">{copy.fighters[r.id].role}</span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onReady}
        className="focus-ring -skew-x-12 border px-4 py-2 text-sm font-bold tracking-wider transition hover:brightness-110"
        style={
          ready
            ? { background: colour, borderColor: colour, color: '#0a0d18' }
            : { borderColor: colour, color: colour }
        }
      >
        <span className="inline-block skew-x-12">Ready</span>
      </button>
    </div>
  );
};
