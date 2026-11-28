'use client';

import { useEffect, useRef, useState } from 'react';

import { menuSound } from '~/components/menu/menuSound';
import { ROSTER } from '~/game/roster';
import { padPlayers } from '~/game/twoPlayer';

import { BigKeycap, PlayerChip, TAG_GRAPE, useKeyLabel } from './shared';

import type { Action2P, Bindings2P, Player } from '~/game/twoPlayer';
import type { CharacterId, InputState } from '~/game/sim/types';

/** What the key card reads each frame: the keys held and both fighters' buttons (keys and pads). */
export interface Peek2P {
  held: ReadonlySet<string>;
  inputs: [InputState, InputState];
  pads: number;
}

/**
 * The pre-match key card (spec local-2p.md 4.1): both players' keys drawn as clusters that light up while held, so a
 * combo the keyboard cannot take shows up before the fight, not during it. `start` mode waits for both Shoot keys (or
 * Enter); `view` mode (Pause > Controls) only shows the keys.
 */
export const KeyCard = ({
  bindings,
  fighters,
  mode,
  peek,
  onStart,
  onBack,
}: {
  bindings: Bindings2P;
  fighters: [CharacterId, CharacterId];
  mode: 'start' | 'view';
  peek: () => Peek2P | null;
  onStart: () => void;
  onBack: () => void;
}) => {
  const [snap, setSnap] = useState<Peek2P | null>(null);
  const [ready, setReady] = useState<[boolean, boolean]>([false, false]);
  const prevFire = useRef<[boolean, boolean] | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = peek();
      if (p) {
        setSnap(p);
        const fire: [boolean, boolean] = [p.inputs[0].fire, p.inputs[1].fire];
        // A Shoot already held when the card opened does not count: it needs a fresh press.
        if (prevFire.current && mode === 'start') {
          const pressed = [fire[0] && !prevFire.current[0], fire[1] && !prevFire.current[1]];
          if (pressed[0] || pressed[1]) {
            menuSound.confirm();
            setReady((r) => [r[0] || pressed[0], r[1] || pressed[1]]);
          }
        }
        prevFire.current = fire;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [peek, mode]);

  useEffect(() => {
    if (mode === 'start' && ready[0] && ready[1] && !done.current) {
      done.current = true;
      onStart();
    }
  }, [ready, mode, onStart]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        menuSound.back();
        onBack();
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (mode === 'view') onBack();
        else if (!done.current) {
          done.current = true;
          menuSound.confirm();
          onStart();
        }
      }
    };
    // Capture: the card owns Esc and Enter while it is up (the pause handler under it must not see them).
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, onBack, onStart]);

  const pads = padPlayers(snap?.pads ?? 0);
  return (
    <div
      data-testid="key-card"
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-ink-deep/85 px-4 py-4 backdrop-blur-sm [animation:fadeIn_0.25s_ease-out] [@media(max-height:560px)]:gap-2"
    >
      <p className="max-w-xl text-center text-sm text-cream/80 [@media(max-height:560px)]:text-xs">
        Shoot is the key next to your hand. Push is next to that. Dash is the far one.
      </p>
      <div className="grid w-full max-w-4xl grid-cols-2 gap-4 sm:gap-8">
        {(['p1', 'p2'] as Player[]).map((p, i) => (
          <Half
            key={p}
            player={p}
            index={i as 0 | 1}
            fighter={fighters[i]}
            bindings={bindings}
            held={snap?.held ?? new Set()}
            input={snap?.inputs[i]}
            pad={pads.includes(i as 0 | 1)}
            tester={mode === 'start'}
          />
        ))}
      </div>
      {mode === 'start' ? (
        <>
          <p className="max-w-xl text-center text-xs text-cream/45">
            A key stays dark? Your keyboard can&apos;t take that combo. Change keys in Settings →
            Controls → 2 Player.
          </p>
          <StartLine ready={ready} />
        </>
      ) : (
        <button
          type="button"
          autoFocus
          onClick={onBack}
          className="focus-ring -skew-x-12 bg-cream/10 px-6 py-2.5 text-sm font-bold uppercase tracking-wider hover:bg-cream/20"
        >
          <span className="inline-flex skew-x-12 items-center gap-2">
            <kbd className="border border-cream/30 px-1 text-[10px]">Esc</kbd> Back
          </span>
        </button>
      )}
    </div>
  );
};

const StartLine = ({ ready }: { ready: [boolean, boolean] }) => {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-display text-2xl text-gold [@media(max-height:560px)]:text-xl">
        Both press SHOOT to fight
      </span>
      <div className="flex items-center gap-3">
        {[0, 1].map((i) => (
          <span
            key={i}
            data-testid={`ready-${i}`}
            data-ready={ready[i]}
            className="px-2 py-0.5 font-display text-base transition"
            style={
              // R-028 (8.5, the rematch-chip rule): ready = grape, white text and check (white border on the dark card);
              // not ready = white, grape text, grape border.
              ready[i]
                ? { background: TAG_GRAPE, color: '#fff', border: '2px solid #fff' }
                : { background: '#fff', color: TAG_GRAPE, border: `2px solid ${TAG_GRAPE}` }
            }
          >
            P{i + 1} {ready[i] ? '✓' : ''}
          </span>
        ))}
        <span className="text-[11px] text-cream/45">
          or <kbd className="border border-cream/30 px-1 text-[10px]">Enter</kbd>
        </span>
      </div>
    </div>
  );
};

/** One line arrow for all four arrow keys (the font draws ↑ ↓ as small triangles and ← → as long lines). */
const ARROW_TURN: Record<string, number> = {
  ArrowRight: 0,
  ArrowDown: 90,
  ArrowLeft: 180,
  ArrowUp: 270,
};
const ArrowGlyph = ({ turn }: { turn: number }) => (
  <svg
    viewBox="0 0 20 20"
    width="20"
    height="20"
    aria-hidden
    style={{ transform: `rotate(${turn}deg)` }}
  >
    <path
      d="M3 10h13M11 5l5 5-5 5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PAD_ROWS: { label: string; glyph: string; action: Action2P }[] = [
  { glyph: 'Stick', label: 'Move', action: 'left' },
  { glyph: 'A', label: 'Jump', action: 'up' },
  { glyph: 'X', label: 'Shoot', action: 'fire' },
  { glyph: 'B', label: 'Push', action: 'push' },
  { glyph: 'RB', label: 'Dash', action: 'dash' },
];

const Half = ({
  player,
  index,
  fighter,
  bindings,
  held,
  input,
  pad,
  tester,
}: {
  player: Player;
  index: 0 | 1;
  fighter: CharacterId;
  bindings: Bindings2P;
  held: ReadonlySet<string>;
  input?: InputState;
  pad: boolean;
  tester: boolean;
}) => {
  const label = useKeyLabel();
  const r = ROSTER.find((x) => x.id === fighter)!;
  const b = bindings[player];
  const cap = (a: Action2P, text?: string) => (
    <BigKeycap lit={held.has(b[a])} label={text}>
      {ARROW_TURN[b[a]] !== undefined ? <ArrowGlyph turn={ARROW_TURN[b[a]]} /> : label(b[a])}
    </BigKeycap>
  );
  const cross = (
    <div className="grid grid-cols-3 gap-1">
      <span />
      {cap('up', 'Jump')}
      <span />
      {cap('left', 'Move')}
      {cap('down', 'Crouch')}
      {cap('right', 'Move')}
    </div>
  );
  // Mirrored by finger: P1 F G H to the right of WASD, P2 K L ; to the left of the arrows (Shoot nearest the arrows).
  const actions =
    index === 0 ? (['fire', 'push', 'dash'] as const) : (['dash', 'push', 'fire'] as const);
  const names: Record<string, string> = { fire: 'Shoot', push: 'Push', dash: 'Dash' };
  // Sit (V / M) sits on the row under the action keys, on the side it is on the keyboard (under Shoot for P1,
  // under Dash for P2).
  const row = (
    <div className="flex flex-col gap-1.5 pt-6">
      <div className="flex items-start gap-1.5">
        {actions.map((a) => (
          <span key={a}>{cap(a, names[a])}</span>
        ))}
      </div>
      <div className="flex">{cap('crouch', 'Sit')}</div>
    </div>
  );
  return (
    <section
      data-testid={`key-half-${player}`}
      className="panel-cut flex flex-col items-center gap-3 border-t-4 bg-ink/90 px-3 py-4 sm:px-6 [@media(max-height:560px)]:gap-1.5 [@media(max-height:560px)]:py-2"
      // R-028: the top band is this half's fighter (accent), not the player colour (8.5: no player hue in UI chrome).
      style={{ borderColor: r.accent }}
    >
      <div className="flex items-center gap-2">
        <PlayerChip index={index} />
        <span className="font-display text-xl leading-none" style={{ color: r.accent }}>
          {r.name.toUpperCase()}
        </span>
      </div>
      {pad ? (
        <div className="flex flex-wrap justify-center gap-2">
          {PAD_ROWS.map((row) => {
            const lit =
              !!input &&
              (row.action === 'left' ? input.left || input.right || input.down : input[row.action]);
            return (
              <BigKeycap key={row.label} lit={lit} label={row.label}>
                <span className="text-sm">{row.glyph}</span>
              </BigKeycap>
            );
          })}
        </div>
      ) : (
        <div className={`flex items-start gap-3 sm:gap-5 ${index === 1 ? 'flex-row' : ''}`}>
          {index === 0 ? (
            <>
              {cross}
              {row}
            </>
          ) : (
            <>
              {row}
              {cross}
            </>
          )}
        </div>
      )}
      {tester && <span className="text-xs text-cream/60">Hold your keys. They light up.</span>}
    </section>
  );
};
