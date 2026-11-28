'use client';

import { useEffect, useRef, useState } from 'react';

import { Confetti } from '../Confetti';
import { FdButton } from '../Button';
import { FD_COPY } from '../copy';
import { fighterView, FIGHTER_IDS } from '../fighters';
import { Icon } from '../Icon';
import { Chip, Keycap, Panel, Pill, StatRow, TraitLine, TraitSticker } from '../parts';
import { Portrait } from '../Portrait';
import { fdSound } from '../sound';
import { Frame, useStage } from '../Stage';

import { SoftBackdrop } from './Backdrop';

import type { ArenaId } from '~/game/sim/constants';
import type { CharacterId } from '~/game/sim/types';
import type { MatchLength } from '~/game/twoPlayer';

/**
 * Fighter select, 2 players (b04): two paper panels (556x474) with an accent header showing the player's keys, a big picture, name,
 * role, pips, a row of four head thumbnails (the cursor) and a status slot: READY! (teal) or "Press [key] when ready". A VS medallion
 * sits between them, a pill below tells who is still deciding, and when both are ready it counts "Starting in 3" down. The logic
 * (keys, pads, ready, length) stays in TwoPlayerSelect.tsx; this file only draws.
 */
export interface TwoPlayerViewProps {
  cursor: [number, number];
  ready: [boolean, boolean];
  /** Per player: the key chips of the header and the key that readies. */
  keys: [PlayerKeys, PlayerKeys];
  /** Per player: a pad drives this panel. */
  pad: [boolean, boolean];
  length: MatchLength;
  onLength: () => void;
  lengthKeys: [string, string];
  /** The 3-2-1 once both are ready (null = not counting). */
  count: number | null;
  /** Bumps once when both become ready (the confetti puff). */
  celebrate: number;
  arena: ArenaId;
  onPick: (player: 0 | 1, index: number) => void;
  onReady: (player: 0 | 1) => void;
  onBack: () => void;
}

export interface PlayerKeys {
  /** The header chips (cluster name and the action keys). */
  chips: string[];
  /** Left and right, for the hint strip. */
  move: [string, string];
  ready: string;
}

const PlayerPanel = ({ player, index, ready, keys, pad, onPick, onReady, popKey }: { player: 0 | 1; index: number; ready: boolean; keys: PlayerKeys; pad: boolean; onPick: (i: number) => void; onReady: () => void; popKey: number }) => {
  const id = FIGHTER_IDS[index];
  const v = fighterView(id);
  const t = FD_COPY.twoPlayer;
  return (
    <Panel style={{ position: 'relative', width: 556, height: 474, overflow: 'hidden', flex: 'none' }} data-testid={`panel-p${player + 1}`} data-ready={ready}>
      {/* R-027: the header is grape (structure); the fighter owns only the 6 px foot strip. */}
      <div style={{ height: 58, background: 'var(--grape)', borderBottom: '4px solid var(--grape)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', boxShadow: `inset 0 -6px 0 ${v.accent}` }} data-testid={`head-p${player + 1}`}>
        <span className="fd-titan fd-ol" style={{ fontSize: 26, ['--o' as string]: '2.5px', ['--d' as string]: '3px' }}>
          {t.player(player + 1)}
        </span>
        <span style={{ display: 'flex', gap: 5 }}>
          {(pad ? ['STICK', 'A'] : keys.chips).map((k, i) => (
            <Keycap key={i} k={k} />
          ))}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 20, padding: '18px 20px 0' }}>
        <div style={{ position: 'relative', flex: 'none' }}>
          <Portrait id={id} w={200} h={248} head={0.26} card style={{ border: '4px solid var(--grape)', borderRadius: 18 }} />
          <TraitSticker id={v.trait.id} accent={v.accent} label={v.trait.label} style={{ position: 'absolute', right: 10, bottom: -13, zIndex: 2 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
          <div className="fd-titan" style={{ fontSize: 32 }} data-testid={`name-p${player + 1}`}>
            {v.name}
          </div>
          <div style={{ font: "800 14px/1 'Baloo 2', sans-serif", color: 'var(--grape-2)', letterSpacing: 1 }}>
            {v.role} {'·'} {v.stats.jumps}
            {'×'} JUMP
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
            <StatRow label={FD_COPY.select.stats.health} n={v.stats.health} />
            <StatRow label={FD_COPY.select.stats.speed} n={v.stats.speed} />
            <StatRow label={FD_COPY.select.stats.jump} n={v.stats.jump} />
            <StatRow label={FD_COPY.select.stats.weight} n={v.stats.weight} />
          </div>
          <div role="radiogroup" aria-label={t.player(player + 1)} style={{ display: 'flex', gap: 9, marginTop: 14 }}>
            {FIGHTER_IDS.map((fid, i) => {
              const on = i === index;
              return (
                <button
                  key={fid}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={fighterView(fid).name}
                  data-testid={`card-p${player + 1}-${fid}`}
                  className="fd-ring"
                  onClick={() => onPick(i)}
                  style={{ position: 'relative', width: 52, height: 52, padding: 0, border: 0, background: 'none', ['--rr' as string]: '14px', ['--ring-inset' as string]: '-12px' }}
                >
                  <Portrait
                    id={fid}
                    w={52}
                    h={52}
                    head={0.78}
                    ty={0.5}
                    style={{
                      borderRadius: 14,
                      border: '3px solid var(--grape)',
                      opacity: on ? 1 : 0.75,
                      ...(on ? { outline: `4px solid ${v.accent}`, outlineOffset: 2, boxShadow: '0 0 0 9px var(--grape)' } : null),
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '22px 20px 0' }}>
        <TraitLine id={v.trait.id} accent={v.accent} label={v.trait.label} line={v.trait.line} fontSize={13} />
      </div>
      <button
        type="button"
        data-testid={`ready-p${player + 1}`}
        aria-pressed={ready}
        onClick={onReady}
        className="fd-ring"
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: 20,
          height: 64,
          borderRadius: 18,
          border: '4px solid var(--grape)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          ['--rr' as string]: '18px',
          ['--ring-inset' as string]: '-10px',
          ...(ready ? { background: 'var(--sun)', boxShadow: 'inset 0 -6px 0 var(--sun-lo)' } : { background: 'var(--btn2)', boxShadow: 'inset 0 -6px 0 var(--btn2-lo)' }),
        }}
      >
        {ready ? (
          <span key={popKey} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, animation: 'fd-ready-pop 120ms var(--ease-spring) both' }}>
            <Icon name="check" size={30} />
            <span className="fd-titan fd-ol" style={{ fontSize: 30, ['--o' as string]: '2.5px', ['--d' as string]: '3px' }}>
              {t.ready}
            </span>
          </span>
        ) : (
          <>
            <span style={{ font: "800 17px/1 'Baloo 2', sans-serif" }}>{t.press}</span>
            <Keycap k={pad ? 'A' : keys.ready} />
            <span style={{ font: "800 17px/1 'Baloo 2', sans-serif" }}>{t.whenReady}</span>
          </>
        )}
      </button>
    </Panel>
  );
};

export const TwoPlayerView = (p: TwoPlayerViewProps) => {
  const t = FD_COPY.twoPlayer;
  const { w } = useStage();
  const pops = useRef<[number, number]>([0, 0]);
  const [, force] = useState(0);
  const prev = useRef<[boolean, boolean]>([false, false]);
  useEffect(() => {
    ([0, 1] as const).forEach((i) => {
      if (p.ready[i] && !prev.current[i]) pops.current[i] += 1;
    });
    prev.current = p.ready;
    force((n) => n + 1);
  }, [p.ready]);
  const waitingFor = p.ready[0] && !p.ready[1] ? 2 : p.ready[1] && !p.ready[0] ? 1 : 0;
  const pill = p.count !== null ? t.starting(p.count) : waitingFor ? t.waiting(waitingFor) : null;
  const [k1, k2] = p.keys;
  return (
    <>
      <SoftBackdrop arena={p.arena} tint={0.42} />
      <Frame>
        <Confetti kind="ready" burst={p.celebrate} width={w} height={720} accents={[fighterView(FIGHTER_IDS[p.cursor[0]]).accent, fighterView(FIGHTER_IDS[p.cursor[1]]).accent]} />
        <div className="fd-enter" style={{ position: 'absolute', inset: 0 }} data-testid="select-2p">
          <FdButton tone="white" size="sm" icon="back" iconSize={20} sound="back" data-testid="back" style={{ position: 'absolute', left: 24, top: 24 }} onClick={p.onBack} after={<Keycap k="ESC" />}>
            {FD_COPY.select.back}
          </FdButton>
          <h2 className="fd-abs fd-titan fd-ol" style={{ left: '50%', top: 30, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 46, margin: 0, ['--o' as string]: '3.5px', ['--d' as string]: '5px' }}>
            {t.title}
          </h2>
          <FdButton tone="white" size="sm" fontSize={18} sound="none" data-testid="length-chip" style={{ position: 'absolute', right: 24, top: 24 }} onClick={p.onLength}>
            {t.firstTo(p.length)}
          </FdButton>
          <div className="fd-abs" style={{ left: '50%', top: 112, width: 1200, marginLeft: -600, display: 'flex', gap: 88 }}>
            <PlayerPanel player={0} index={p.cursor[0]} ready={p.ready[0]} keys={k1} pad={p.pad[0]} onPick={(i) => p.onPick(0, i)} onReady={() => p.onReady(0)} popKey={pops.current[0]} />
            <PlayerPanel player={1} index={p.cursor[1]} ready={p.ready[1]} keys={k2} pad={p.pad[1]} onPick={(i) => p.onPick(1, i)} onReady={() => p.onReady(1)} popKey={pops.current[1]} />
          </div>
          <div
            className="fd-abs"
            style={{ left: '50%', top: 312, width: 72, height: 72, marginLeft: -36, borderRadius: '50%', background: 'var(--btn2)', border: '4px solid var(--grape)', boxShadow: 'inset 0 -5px 0 var(--btn2-lo), 0 5px 0 var(--grape)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-hidden="true"
          >
            <span className="fd-titan fd-ol" style={{ fontSize: 30, ['--o' as string]: '2.5px', ['--d' as string]: '3px' }}>
              {t.vs}
            </span>
          </div>
          <div className="fd-abs" style={{ left: 0, right: 0, top: 612, display: 'flex', justifyContent: 'center', minHeight: 36 }} role="status" aria-live="polite">
            {pill &&
              (p.count !== null ? (
                <Chip color="var(--sun)" height={36} fontSize={17} style={{ padding: '1px 20px 0' }} data-testid="countdown">
                  {pill}
                </Chip>
              ) : (
                <Pill style={{ fontSize: 16, padding: '8px 20px 7px' }} data-testid="waiting">
                  <Icon name="clock" size={18} />
                  {pill}
                </Pill>
              ))}
          </div>
          <div className="fd-abs" style={{ left: '50%', bottom: 14, transform: 'translateX(-50%)' }}>
            <div className="fd-hints">
              <span>
                P1 <Keycap k={k1.move[0]} />
                <Keycap k={k1.move[1]} />
                {t.hint.choose} <Keycap k={k1.ready} />
                {t.hint.ready}
              </span>
              <span>
                P2 <Keycap k={k2.move[0]} />
                <Keycap k={k2.move[1]} />
                {t.hint.choose} <Keycap k={k2.ready} />
                {t.hint.ready}
              </span>
              <span>
                <Keycap k={p.lengthKeys[0]} />
                <Keycap k={p.lengthKeys[1]} />
                {t.hint.length}
              </span>
              <span>
                <Keycap k="ESC" />
                {t.hint.back}
              </span>
            </div>
          </div>
        </div>
      </Frame>
    </>
  );
};
