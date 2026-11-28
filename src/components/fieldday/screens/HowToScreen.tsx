'use client';

import { useKeyLabel } from '~/components/twoPlayer/shared';
import { useSettings } from '~/components/menu/useSettings';
import { keyLabel } from '~/game/settings';
import { RULES } from '~/game/sim/constants';

import { FdButton } from '../Button';
import { FD_COPY } from '../copy';
import { fighterView, FIGHTER_IDS } from '../fighters';
import { Card, Keycap, Pill, TraitDisc } from '../parts';

import { arrowNote, capLabel, KOS_TEXT, moveGroup } from './howToKeys';
import { Modal } from './Modal';

import type { Bindings } from '~/game/settings';
import type { Bindings2P } from '~/game/twoPlayer';
import type { ReactNode } from 'react';

/**
 * How to play (b11): the goal in a pill, three cards (move and jump, shoot and grab, dash and push) whose keycaps are the CURRENT
 * bindings (never hard-coded), the 2-player keys in a pill, and GOT IT. Used by the main menu and, over the paused match, by the
 * pause menu. Esc and BACK close it; Enter on GOT IT closes it.
 */
const KeyRow = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>{children}</div>;
const Big = ({ k }: { k: string }) => <Keycap k={k} className="fd-big" />;

/**
 * `traits` is false online (signature traits are offline only today): the SIGNATURE MOVES strip is hidden and the layout is the old one.
 * With traits (R-026 11.3) the card headers are 130 high, the strip sits at y 450-514, the 2-player pill at 528 and GOT IT at 584.
 */
export const HowToScreen = ({ onClose, touch = false, z = 60, kos = RULES.kosToWin, traits = true }: { onClose: () => void; touch?: boolean; z?: number; kos?: number; traits?: boolean }) => {
  const s = useSettings();
  const label = useKeyLabel();
  const b = s.bindings;
  const k = (a: keyof Bindings) => capLabel(keyLabel(b[a][0] || b[a][1]));
  const twoP = (side: Bindings2P['p1']) => (
    <>
      <Keycap k={moveGroup(side, label)} />
      <Keycap k={label(side.fire).toUpperCase()} />
      <Keycap k={label(side.push).toUpperCase()} />
      <Keycap k={label(side.dash).toUpperCase()} />
    </>
  );
  const cards: { title: string; keys: ReactNode; text: string; note: string | null }[] = [
    {
      title: 'MOVE & JUMP',
      keys: touch ? (
        <Big k="STICK" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gap: 6, justifyContent: 'center' }}>
          <span />
          <Big k={k('up')} />
          <span />
          <Big k={k('left')} />
          <Big k={k('down')} />
          <Big k={k('right')} />
        </div>
      ),
      text: 'Jump again in the air. Some fighters jump three times.',
      note: touch ? 'Push the stick up to jump' : arrowNote(b),
    },
    {
      title: 'SHOOT & GRAB',
      keys: touch ? (
        <KeyRow>
          <Big k="FIRE" />
          <Big k="SWAP" />
        </KeyRow>
      ) : (
        <div style={{ width: 200, margin: '0 auto' }}>
          <KeyRow>
            <Big k={k('fire')} />
            <Big k={k('pickup')} />
            <Big k={k('reload')} />
            <Big k={k('throwBomb')} />
          </KeyRow>
        </div>
      ),
      text: 'Shoot, pick up or swap a gun, reload, throw a bomb.',
      note: 'Power weapons wait up top',
    },
    {
      title: 'DASH & PUSH',
      keys: (
        <KeyRow>
          <Big k={touch ? 'DASH' : k('dash')} />
          <Big k={touch ? 'PUSH' : k('push')} />
        </KeyRow>
      ),
      text: 'Dash out of trouble. Force Push shoves your rival and sends bullets back.',
      note: 'Watch the chips under your health',
    },
  ];
  const L = traits ? { cardsTop: 152, head: 130, cardH: 282, pill: 528, done: 584 } : { cardsTop: 150, head: 150, cardH: 306, pill: 488, done: 560 };
  return (
    <Modal label="How to play" tint={0.42} onBack={onClose} escCapture z={z} testId="howto">
      <div className="fd-abs" style={{ inset: 0 }}>
        <FdButton tone="white" size="sm" icon="back" iconSize={20} sound="back" data-nav data-testid="howto-back" style={{ position: 'absolute', left: 24, top: 24 }} onClick={onClose} after={<Keycap k="ESC" />}>
          BACK
        </FdButton>
        <h2 className="fd-abs fd-titan fd-ol" style={{ left: '50%', top: 28, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 46, margin: 0, ['--o' as string]: '3.5px', ['--d' as string]: '5px' }}>
          HOW TO PLAY
        </h2>
        <div className="fd-abs" style={{ left: '50%', top: 94, transform: 'translateX(-50%)' }}>
          <Pill style={{ fontSize: 17, padding: '7px 20px 6px' }}>
            Knock your rival out. <b style={{ color: 'var(--sun)' }}>{KOS_TEXT(kos)}</b>
          </Pill>
        </div>
        <div className="fd-abs" style={{ left: 0, right: 0, top: L.cardsTop, display: 'flex', justifyContent: 'center', gap: 28 }}>
          {cards.map((c) => (
            <Card key={c.title} style={{ position: 'relative', width: 340, height: L.cardH }} data-testid="howto-card">
              {/* R-027: every header is grape; the cards differ by keys and text, not hue. */}
              <div className="fd-howhead" style={{ background: 'var(--grape)', height: L.head }}>
                <div>{c.keys}</div>
              </div>
              <div style={{ padding: '16px 22px 0' }}>
                <div className="fd-titan" style={{ fontSize: 26 }}>
                  {c.title}
                </div>
                <div style={{ font: "700 16px/1.3 'Baloo 2', sans-serif", marginTop: 10 }}>{c.text}</div>
                {c.note && (
                  <div className="fd-note" style={{ marginTop: 10 }}>
                    {c.note}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
        {traits && (
          <div className="fd-abs" style={{ left: 102, top: 450, width: 1072, display: 'flex', gap: 16 }} role="list" aria-label={FD_COPY.howTo.signature} data-testid="howto-signature">
            {FIGHTER_IDS.map((id) => {
              const v = fighterView(id);
              return (
                <div key={id} className="fd-sig" role="listitem" data-testid={`sig-${id}`}>
                  <TraitDisc id={v.trait.id} accent={v.accent} size={40} />
                  <span>
                    <span className="fd-titan" style={{ fontSize: 16, lineHeight: 1 }}>
                      {v.trait.label}
                    </span>
                    <small>
                      {v.name} {'·'} {v.trait.short}
                    </small>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {!touch && (
          <div className="fd-abs" style={{ left: '50%', top: L.pill, transform: 'translateX(-50%)' }}>
            <Pill style={{ fontSize: 14, padding: '7px 18px 6px', gap: 8 }} data-testid="howto-2p">
              2 PLAYER on one keyboard: P1 {twoP(s.bindings2p.p1)} · P2 {twoP(s.bindings2p.p2)}
            </Pill>
          </div>
        )}
        <div className="fd-abs" style={{ left: 0, right: 0, top: L.done, display: 'flex', justifyContent: 'center' }}>
          <FdButton tone="sun" size="md" fontSize={28} icon="check" primary data-nav data-nav-pref data-testid="howto-done" after={touch ? undefined : <Keycap k="ENTER" />} onClick={onClose}>
            GOT IT!
          </FdButton>
        </div>
      </div>
    </Modal>
  );
};
