'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { menuSound } from '~/components/menu/menuSound';
import { useSettings } from '~/components/menu/useSettings';
import { fdSound } from '~/components/fieldday/sound';
import { Stage } from '~/components/fieldday/Stage';
import { useFighterPortraits } from '~/components/fieldday/Portrait';
import { TwoPlayerView } from '~/components/fieldday/screens/TwoPlayerScreen';
import { ROSTER } from '~/game/roster';
import { nextLength, padPlayers, saveLength, sessionStore, stepCursor } from '~/game/twoPlayer';

import { useKeyLabel } from './shared';

import type { PlayerKeys } from '~/components/fieldday/screens/TwoPlayerScreen';
import type { ArenaId } from '~/game/sim/constants';
import type { CursorDir as Dir, MatchLength, Player } from '~/game/twoPlayer';
import type { CharacterId } from '~/game/sim/types';

/**
 * The split fighter select for local 2-player (spec local-2p.md 3.2), skinned as Field Day b04 (fieldday/screens/TwoPlayerScreen.tsx):
 * P1's panel left, P2's right, each with a row of the four fighters and the player's own cursor. Shoot locks in (READY), moving
 * unlocks, Push cycles First to 3 / 5 / 7, Esc goes back. When both are READY "Starting in 3" counts down and the match starts
 * (moving a cursor in that time unlocks and cancels it).
 */

const idx = (id: CharacterId) => ROSTER.findIndex((r) => r.id === id);

export const TwoPlayerSelect = ({
  initial,
  length: initialLength,
  arena,
  onBack,
  onFight,
}: {
  initial: [CharacterId, CharacterId];
  length: MatchLength;
  arena: ArenaId;
  onBack: () => void;
  onFight: (p1: CharacterId, p2: CharacterId, n: MatchLength) => void;
}) => {
  const settings = useSettings();
  const b = settings.bindings2p;
  const [cursor, setCursor] = useState<[number, number]>([idx(initial[0]), idx(initial[1])]);
  const [ready, setReady] = useState<[boolean, boolean]>([false, false]);
  const [length, setLength] = useState<MatchLength>(initialLength);
  const [count, setCount] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [pads, setPads] = useState(0);
  const state = useRef({ cursor, ready });
  state.current = { cursor, ready };
  const latest = useRef({ cursor, length, onFight });
  latest.current = { cursor, length, onFight };
  const going = useRef(false);

  useEffect(() => saveLength(sessionStore(), length), [length]);

  const move = useCallback((p: 0 | 1, dir: Dir) => {
    const s = state.current;
    const next = stepCursor(s.cursor[p], dir, true);
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

  // Both READY: "Starting in 3", 2, 1, then the lift. Moving a cursor unlocks, which cancels the count.
  useEffect(() => {
    if (!ready[0] || !ready[1]) {
      setCount(null);
      return;
    }
    setCelebrate((n) => n + 1);
    fdSound.celebrate();
    let n = 3;
    setCount(n);
    fdSound.count();
    const t = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(t);
        if (going.current) return;
        going.current = true;
        fdSound.count(true);
        const l = latest.current;
        l.onFight(ROSTER[l.cursor[0]].id, ROSTER[l.cursor[1]].id, l.length);
      } else {
        setCount(n);
        fdSound.count();
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [ready]);

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

  const label = useKeyLabel();
  useFighterPortraits(initial[0], { eager: true });
  const padFor = padPlayers(pads);
  const keysOf = (p: Player): PlayerKeys => {
    const k = b[p];
    const cluster = [k.left, k.right, k.up, k.down];
    const name =
      cluster.join() === 'KeyA,KeyD,KeyW,KeyS' ? 'WASD' : cluster.join() === 'ArrowLeft,ArrowRight,ArrowUp,ArrowDown' ? 'ARROWS' : cluster.map(label).join('');
    return { chips: [name, label(k.fire), label(k.push), label(k.dash)], move: [label(k.left), label(k.right)], ready: label(k.fire) };
  };
  return (
    <Stage className="z-20" testId="select-2p-stage">
      <TwoPlayerView
        cursor={cursor}
        ready={ready}
        keys={[keysOf('p1'), keysOf('p2')]}
        pad={[padFor.includes(0), padFor.includes(1)]}
        length={length}
        onLength={cycle}
        lengthKeys={[label(b.p1.push), label(b.p2.push)]}
        count={count}
        celebrate={celebrate}
        arena={arena}
        onPick={pick}
        onReady={toggleReady}
        onBack={() => {
          menuSound.back();
          onBack();
        }}
      />
    </Stage>
  );
};
