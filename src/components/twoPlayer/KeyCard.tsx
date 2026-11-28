'use client';

import { useEffect, useRef, useState } from 'react';

import { FD_COPY } from '~/components/fieldday/copy';
import { Icon } from '~/components/fieldday/Icon';
import { Keycap } from '~/components/fieldday/parts';
import { Frame, Stage } from '~/components/fieldday/Stage';
import { menuSound } from '~/components/menu/menuSound';
import { ROSTER } from '~/game/roster';
import { padPlayers } from '~/game/twoPlayer';

import { BigKeycap, TAG_GRAPE, useKeyLabel } from './shared';

import type { Action2P, Bindings2P, Player } from '~/game/twoPlayer';
import type { CharacterId, InputState } from '~/game/sim/types';
import type { CSSProperties, ReactNode } from 'react';

/** What the key card reads each frame: the keys held and both fighters' buttons (keys and pads). */
export interface Peek2P {
  held: ReadonlySet<string>;
  inputs: [InputState, InputState];
  pads: number;
}

/** Both players ready: the two READY! slabs stay up this long before the match starts (R-030 1.4). Enter starts at once. */
export const BOTH_READY_HOLD_MS = 250;

const C = FD_COPY.keyCard;
/** Card geometry (design px, R-030 1.1). */
const CARD = { top: 134, w: 520, h: 420, hView: 300, gap: 40 } as const;
/**
 * The pre-match key card (spec local-2p.md 4.1, Field Day look R-030 section 1 / F-070): both players' keys drawn as clusters
 * that light up while held, so a combo the keyboard cannot take shows up before the fight, not during it. `start` mode waits
 * for both Shoot keys (or Enter); `view` mode (Pause > Controls) only shows the keys. Rendered in a Field Day `Stage`, so it
 * scales uniformly like every other `.fd` screen.
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
  const readyRef = useRef<[boolean, boolean]>([false, false]);
  const prevFire = useRef<[boolean, boolean] | null>(null);
  const done = useRef(false);
  const startRef = useRef(onStart);
  startRef.current = onStart;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = peek();
      if (p) {
        setSnap(p);
        const fire: [boolean, boolean] = [p.inputs[0].fire, p.inputs[1].fire];
        // A Shoot already held when the card opened does not count: it needs a fresh press.
        if (prevFire.current && mode === 'start') {
          const r = readyRef.current;
          const next: [boolean, boolean] = [r[0] || (fire[0] && !prevFire.current[0]), r[1] || (fire[1] && !prevFire.current[1])];
          if (next[0] !== r[0] || next[1] !== r[1]) {
            menuSound.confirm();
            readyRef.current = next;
            setReady(next);
          }
        }
        prevFire.current = fire;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [peek, mode]);

  // Both ready: hold 250 ms with both READY! slabs showing, then start (R-030 1.4).
  useEffect(() => {
    if (mode !== 'start' || !ready[0] || !ready[1] || done.current) return;
    const t = window.setTimeout(() => {
      if (done.current) return;
      done.current = true;
      startRef.current();
    }, BOTH_READY_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [ready, mode]);

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

  const start = mode === 'start';
  const pads = padPlayers(snap?.pads ?? 0);
  const pill: CSSProperties = {
    left: '50%',
    transform: 'translateX(-50%)',
    height: 34,
    padding: '0 18px',
    borderRadius: 17,
    background: TAG_GRAPE,
    color: '#fff',
    font: "700 15px/34px 'Baloo 2', sans-serif",
    whiteSpace: 'nowrap',
  };
  return (
    <div data-testid="key-card" data-mode={mode} className="absolute inset-0 z-40" role="dialog" aria-modal="true" aria-label={start ? C.titleStart : C.titleView}>
      <Stage>
        <div className="fd-veil" aria-hidden="true" />
        <Frame>
          <div
            className="fd-abs fd-titan fd-ol"
            style={{ top: 22, left: 0, right: 0, textAlign: 'center', fontSize: 44, lineHeight: '56px', ['--o' as string]: '4px', ['--d' as string]: '5px' }}
          >
            {start ? C.titleStart : C.titleView}
          </div>
          <div className="fd-abs" style={{ ...pill, top: 88 }}>
            {C.hint}
          </div>
          {(['p1', 'p2'] as Player[]).map((p, i) => (
            <Half
              key={p}
              player={p}
              index={i as 0 | 1}
              fighter={fighters[i]}
              bindings={bindings}
              held={snap?.held ?? EMPTY}
              input={snap?.inputs[i]}
              pad={pads.includes(i as 0 | 1)}
              start={start}
              ready={ready[i]}
            />
          ))}
          {start && (
            <div className="fd-abs" data-testid="key-card-warn" style={{ ...pill, top: 574, fontWeight: 600 }}>
              {C.warnLead}
              <b style={{ fontWeight: 800, color: '#fff' }}>{C.warnPath}</b>
              {C.warnEnd}
            </div>
          )}
          <div className="fd-abs" style={{ left: '50%', top: 664, transform: 'translateX(-50%)' }}>
            <div className="fd-hints" style={{ height: 38, padding: '0 16px', background: TAG_GRAPE, color: '#fff' }}>
              {start && (
                <HintButton k="ENTER" label={C.startNow} onClick={() => {
                  if (done.current) return;
                  done.current = true;
                  menuSound.confirm();
                  onStart();
                }} />
              )}
              <HintButton k="ESC" label={C.back} onClick={() => {
                menuSound.back();
                onBack();
              }} />
            </div>
          </div>
        </Frame>
      </Stage>
    </div>
  );
};

const EMPTY: ReadonlySet<string> = new Set();

/** One hint-strip pair (`[ENTER] start now`), clickable for a pointer; the keys do the same thing. */
const HintButton = ({ k, label, onClick }: { k: string; label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
  >
    <Keycap k={k} style={{ boxShadow: 'none', border: 0, height: 24, fontSize: 12 }} />
    {label}
  </button>
);

/** One line arrow for all four arrow keys (the font draws ↑ ↓ as small triangles and ← → as long lines). */
const ARROW_TURN: Record<string, number> = {
  ArrowRight: 0,
  ArrowDown: 90,
  ArrowLeft: 180,
  ArrowUp: 270,
};
const ArrowGlyph = ({ turn }: { turn: number }) => (
  <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden style={{ transform: `rotate(${turn}deg)` }}>
    <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The pad caps, in one centred row (R-030 1.3). `X` is the pad's Shoot (the status bar shows it). */
const PAD_ROWS: { label: string; glyph: string; action: Action2P }[] = [
  { glyph: 'Stick', label: C.keys.stick, action: 'left' },
  { glyph: 'A', label: C.keys.jump, action: 'up' },
  { glyph: 'X', label: C.keys.shoot, action: 'fire' },
  { glyph: 'B', label: C.keys.push, action: 'push' },
  { glyph: 'RB', label: C.keys.dash, action: 'dash' },
];
const PAD_SHOOT = 'X';

const Half = ({
  player,
  index,
  fighter,
  bindings,
  held,
  input,
  pad,
  start,
  ready,
}: {
  player: Player;
  index: 0 | 1;
  fighter: CharacterId;
  bindings: Bindings2P;
  held: ReadonlySet<string>;
  input?: InputState;
  pad: boolean;
  start: boolean;
  ready: boolean;
}) => {
  const label = useKeyLabel();
  const r = ROSTER.find((x) => x.id === fighter)!;
  const b = bindings[player];
  const glyph = (code: string): ReactNode => (ARROW_TURN[code] !== undefined ? <ArrowGlyph turn={ARROW_TURN[code]} /> : label(code));
  const cap = (a: Action2P, text: string) => (
    <BigKeycap lit={held.has(b[a])} label={text}>
      {glyph(b[a])}
    </BigKeycap>
  );
  const cross = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 52px)', columnGap: 8, rowGap: 10 }}>
      <span />
      {cap('up', C.keys.jump)}
      <span />
      {cap('left', C.keys.move)}
      {cap('down', C.keys.crouch)}
      {cap('right', C.keys.move)}
    </div>
  );
  // Mirrored by finger: P1 F G H to the right of WASD, P2 K L ; to the left of the arrows (Shoot nearest the arrows).
  const actions = index === 0 ? (['fire', 'push', 'dash'] as const) : (['dash', 'push', 'fire'] as const);
  const names = { fire: C.keys.shoot, push: C.keys.push, dash: C.keys.dash } as const;
  // Sit (V / M) sits on the row under the action keys, on the side it is on the keyboard (under Shoot for P1, under Dash
  // for P2). The action block sits 44 px lower than the cross top (Shoot row level with the cross's middle).
  const col = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 44 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {actions.map((a) => (
          <span key={a}>{cap(a, names[a])}</span>
        ))}
      </div>
      <div style={{ display: 'flex' }}>{cap('crouch', C.keys.sit)}</div>
    </div>
  );
  const padLit = (a: Action2P) => !!input && (a === 'left' ? input.left || input.right || input.down : input[a]);
  const shootKey = pad ? PAD_SHOOT : label(b.fire);
  return (
    <section
      data-testid={`key-half-${player}`}
      className="fd-abs fd-drop"
      style={{
        top: CARD.top,
        left: index === 0 ? `calc(50% - ${CARD.w + CARD.gap / 2}px)` : `calc(50% + ${CARD.gap / 2}px)`,
        width: CARD.w,
        height: start ? CARD.h : CARD.hView,
        boxSizing: 'border-box',
        background: 'var(--paper)',
        border: `4px solid ${TAG_GRAPE}`,
        borderRadius: 26,
        boxShadow: `0 7px 0 ${TAG_GRAPE}`,
        overflow: 'hidden',
        animationDelay: index === 1 ? '60ms' : undefined,
      }}
    >
      {/* The header is grape (structure); the fighter owns only the 6 px foot strip and the dot (as select-2p). */}
      <div
        style={{
          height: 60,
          background: TAG_GRAPE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 22px 6px',
          boxShadow: `inset 0 -6px 0 ${r.accent}`,
        }}
      >
        <span className="fd-titan" style={{ fontSize: 26, color: '#fff' }}>
          {FD_COPY.twoPlayer.player(index + 1)}
        </span>
        <span className="fd-titan" style={{ fontSize: 22, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i style={{ width: 16, height: 16, boxSizing: 'border-box', borderRadius: '50%', background: r.accent, border: '2.5px solid #fff' }} />
          {r.name.toUpperCase()}
        </span>
      </div>
      {pad ? (
        <div style={{ position: 'absolute', top: 140, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 8 }}>
          {PAD_ROWS.map((row) => (
            <BigKeycap key={row.glyph} lit={padLit(row.action)} label={row.label} wide={row.glyph.length > 1} fontSize={18}>
              {row.glyph}
            </BigKeycap>
          ))}
        </div>
      ) : (
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 30 }}>
          {index === 0 ? (
            <>
              {cross}
              {col}
            </>
          ) : (
            <>
              {col}
              {cross}
            </>
          )}
        </div>
      )}
      {start && (
        <>
          <div style={{ position: 'absolute', top: 286, left: 0, right: 0, textAlign: 'center', font: "700 14px/1 'Baloo 2', sans-serif", color: 'var(--gray-ink)' }}>
            {C.tester}
          </div>
          <div
            data-testid={`ready-${index}`}
            data-ready={ready}
            key={ready ? 'r' : 'w'}
            className={ready ? 'fd-kc2-pop' : undefined}
            style={{
              position: 'absolute',
              left: 18,
              right: 18,
              bottom: 20,
              height: 62,
              boxSizing: 'border-box',
              borderRadius: 16,
              border: `4px solid ${TAG_GRAPE}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              color: TAG_GRAPE,
              ...(ready
                ? { background: 'var(--sun)', boxShadow: 'inset 0 -6px 0 var(--sun-lo)' }
                : { background: '#fff', boxShadow: `0 5px 0 ${TAG_GRAPE}`, font: "800 19px/1 'Baloo 2', sans-serif" }),
            }}
          >
            {ready ? (
              <>
                <Icon name="check" size={26} />
                <span className="fd-titan fd-ol" style={{ fontSize: 30, ['--o' as string]: '3px', ['--d' as string]: '3px' }}>
                  {C.ready}
                </span>
              </>
            ) : (
              <>
                {C.press}
                <kbd
                  data-testid={`ready-key-${index}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 34,
                    height: 32,
                    boxSizing: 'border-box',
                    padding: '2px 8px 0',
                    border: `3px solid ${TAG_GRAPE}`,
                    borderRadius: 8,
                    background: '#fff',
                    boxShadow: `0 3px 0 ${TAG_GRAPE}`,
                    font: "800 17px/1 'Baloo 2', sans-serif",
                    color: TAG_GRAPE,
                  }}
                >
                  {pad ? shootKey : ARROW_TURN[b.fire] !== undefined ? <ArrowGlyph turn={ARROW_TURN[b.fire]} /> : shootKey}
                </kbd>
                {C.toFight}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
};
