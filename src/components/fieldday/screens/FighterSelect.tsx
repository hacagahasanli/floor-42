'use client';

import { useEffect, useRef } from 'react';

import { FdButton } from '../Button';
import { FD_COPY } from '../copy';
import { fighterView, FIGHTER_IDS } from '../fighters';
import { useSpatialNav } from '../nav';
import { Chip, HintStrip, Keycap, StatRow, TraitLine, TraitSticker } from '../parts';
import { Portrait } from '../Portrait';
import { fdSound } from '../sound';
import { Frame } from '../Stage';
import { Sunburst } from '../Sunburst';

import { SoftBackdrop } from './Backdrop';

import type { ArenaId } from '~/game/sim/constants';
import type { CharacterId } from '~/game/sim/types';

/**
 * Fighter select, 1 player (b03). Four cards 226x356, 26 apart, centred; the picked one is lifted with the focus ring, a
 * YOUR PICK chip and rays behind it. Focus moves the pick (arrows or pad); ENTER, or a click on the picked card, fights.
 * Bottom row: BOT level (white, arrows cycle it), FIGHT! (sun, the one primary) and the arena (sky, cycles it).
 */
export interface FighterSelectProps {
  fighter: CharacterId;
  onFighter: (id: CharacterId) => void;
  onFight: () => void;
  onBack: () => void;
  arena: ArenaId;
  arenaName: string;
  onArena: () => void;
  /** Bot level label (EASY, NORMAL, HARD) and its cycling; `locked` is the first match (always easy). */
  level: string;
  onLevel: (dir: 1 | -1) => void;
  levelLocked?: boolean;
  pad: boolean;
  /** False while an overlay is open. */
  active?: boolean;
  busy?: boolean;
}

const CARD_W = 226;
const GAP = 26;

export const FighterSelect = (p: FighterSelectProps) => {
  const root = useRef<HTMLDivElement>(null);
  useSpatialNav(root, { active: p.active ?? true, onBack: p.busy ? undefined : p.onBack });
  const t = FD_COPY.select;
  const index = FIGHTER_IDS.indexOf(p.fighter);
  const focused = fighterView(p.fighter);
  /** Whether a pointer press landed on an already-picked card (then the click fights; otherwise it only picks). */
  const wasPicked = useRef(false);
  const total = FIGHTER_IDS.length * CARD_W + (FIGHTER_IDS.length - 1) * GAP;
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-card][aria-checked="true"]')?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <SoftBackdrop arena={p.arena} tint={0.38} />
      <Frame>
        <div ref={root} className="fd-enter" style={{ position: 'absolute', inset: 0 }} data-testid="select-1p">
          {/* Rays behind the picked card; they glide with the pick (transform only). */}
          <div className="fd-abs" style={{ left: '50%', top: 96, width: 0, height: 0 }} aria-hidden="true">
            <Sunburst
              size={460}
              left={-total / 2 + index * (CARD_W + GAP) + CARD_W / 2 - 230}
              top={0}
              opacity={0.85}
              style={{ transition: 'left 220ms var(--ease-spring)' }}
            />
          </div>
          <FdButton tone="white" size="sm" icon="back" iconSize={20} sound="back" data-nav data-testid="back" style={{ position: 'absolute', left: 24, top: 24 }} onClick={p.onBack} after={<Keycap k="ESC" />}>
            {t.back}
          </FdButton>
          <h2 className="fd-abs fd-titan fd-ol" style={{ left: '50%', top: 30, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 46, margin: 0, ['--o' as string]: '3.5px', ['--d' as string]: '5px' }}>
            {t.title}
          </h2>

          <div role="radiogroup" aria-label={t.title} className="fd-abs" style={{ left: 0, right: 0, top: 146, display: 'flex', justifyContent: 'center', gap: GAP }}>
            {FIGHTER_IDS.map((id) => {
              const v = fighterView(id);
              const on = id === p.fighter;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-card
                  data-nav
                  data-nav-pref={on || undefined}
                  data-testid={`card-${id}`}
                  tabIndex={on ? 0 : -1}
                  className={`fd-ring ${on ? 'fd-ring-on' : ''}`}
                  style={{
                    position: 'relative',
                    width: CARD_W,
                    height: 356,
                    padding: 0,
                    border: 0,
                    background: 'none',
                    textAlign: 'left',
                    ['--rr' as string]: '22px',
                    transform: on ? 'translateY(-12px) scale(1.04)' : undefined,
                    transition: 'transform 220ms var(--ease-spring)',
                    ['--ring-inset' as string]: '-12px -12px -17px',
                  }}
                  onPointerDown={() => {
                    wasPicked.current = on;
                  }}
                  onFocus={() => {
                    if (!on) p.onFighter(id);
                  }}
                  onClick={(e) => {
                    // Enter and a pad's A arrive with detail 0: they fight. A mouse click on an unpicked card only picks it.
                    if (e.detail === 0 || wasPicked.current) {
                      fdSound.confirm();
                      p.onFight();
                    } else p.onFighter(id);
                  }}
                >
                  <span className="fd-card" style={{ display: 'block', position: 'relative', width: '100%', height: '100%' }}>
                    <Portrait id={id} w={218} h={180} head={0.3} card style={{ width: '100%', borderBottom: '4px solid var(--grape)' }} />
                    {/* The trait sticker sits on the seam between photo and body (R-026 11.3). */}
                    <TraitSticker id={v.trait.id} accent={v.accent} label={v.trait.label} style={{ position: 'absolute', right: 10, top: 184 - 13, zIndex: 2 }} />
                    <span style={{ display: 'block', padding: '10px 14px 0' }}>
                      <span className="fd-titan" style={{ display: 'block', fontSize: 25 }}>
                        {v.name}
                      </span>
                      <span style={{ display: 'block', font: "800 13px/1 'Baloo 2', sans-serif", color: 'var(--grape-2)', letterSpacing: 1, margin: '6px 0 10px' }}>
                        {v.role} {'·'} {v.stats.jumps}
                        {'×'} JUMP
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <StatRow label={t.stats.health} n={v.stats.health} color={v.accent} />
                        <StatRow label={t.stats.speed} n={v.stats.speed} color={v.accent} />
                        <StatRow label={t.stats.jump} n={v.stats.jump} color={v.accent} />
                        <StatRow label={t.stats.weight} n={v.stats.weight} color={v.accent} />
                      </span>
                    </span>
                  </span>
                  {on && (
                    <Chip color="var(--sun)" icon="check" style={{ position: 'absolute', left: '50%', top: -26, transform: 'translateX(-50%)', zIndex: 4 }}>
                      {t.yourPick}
                    </Chip>
                  )}
                </button>
              );
            })}
          </div>

          {/* The focused fighter's trait, one line, changing with focus (120 ms crossfade). */}
          <div className="fd-abs" style={{ left: 0, right: 0, top: 524, display: 'flex', justifyContent: 'center', minHeight: 38 }} aria-live="polite">
            <TraitLine id={focused.trait.id} accent={focused.accent} label={focused.trait.label} line={focused.trait.line} />
          </div>

          <div className="fd-abs" style={{ left: 0, right: 0, top: 572, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22 }}>
            <FdButton
              tone="white"
              size="md"
              fontSize={20}
              icon="left"
              iconAfter="right"
              iconSize={20}
              disabled={p.levelLocked}
              sound="none"
              data-nav
              data-testid="bot-level"
              onKeyDown={(e) => {
                if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
                e.preventDefault();
                e.stopPropagation();
                if (!p.levelLocked) {
                  fdSound.tab();
                  p.onLevel(e.code === 'ArrowRight' ? 1 : -1);
                }
              }}
              onClick={() => {
                fdSound.tab();
                p.onLevel(1);
              }}
            >
              {t.bot(p.level)}
            </FdButton>
            <FdButton tone="sun" height={84} fontSize={42} primary data-nav data-testid="fight" style={{ ['--o' as string]: '3px', ['--d' as string]: '4px' }} after={<Keycap k="ENTER" />} disabled={p.busy} onClick={p.onFight}>
              {t.fight}
            </FdButton>
            <FdButton tone="sky" size="md" fontSize={20} icon="flag" iconSize={22} data-nav data-testid="select-arena" onClick={p.onArena}>
              {p.arenaName}
            </FdButton>
          </div>
          <div className="fd-abs" style={{ left: '50%', bottom: 14, transform: 'translateX(-50%)' }}>
            <HintStrip
              items={
                p.pad
                  ? [
                      { keys: ['D-PAD'], label: t.hint.choose },
                      { keys: ['A'], label: t.hint.fight },
                      { keys: ['B'], label: t.hint.back },
                    ]
                  : [
                      { keys: ['←', '→'], label: t.hint.choose },
                      { keys: ['ENTER'], label: t.hint.fight },
                      { keys: ['ESC'], label: t.hint.back },
                    ]
              }
            />
          </div>
        </div>
      </Frame>
    </>
  );
};
