'use client';

import { useEffect, useRef, useState } from 'react';

import { Bunting } from '../Bunting';
import { FdButton } from '../Button';
import { FD_COPY } from '../copy';
import { fighterView, FIGHTER_IDS } from '../fighters';
import { Icon } from '../Icon';
import { useSpatialNav } from '../nav';
import { Card, Chip, HintStrip, Keycap, Pill, Ribbon, TraitDisc, Wordmark } from '../parts';
import { Portrait } from '../Portrait';
import { Frame } from '../Stage';
import { Sunburst } from '../Sunburst';

import type { CharacterId } from '~/game/sim/types';

/**
 * Home (b02). The live 3D backdrop (without the fighter) sits behind; this is the Field Day layer: bunting, the wordmark slot,
 * the arena ribbon, the button column, and the big fighter card in the turning sunburst disc with its speech bubble and pager.
 * All state lives in MainMenu (the owner of fighter, arena, settings and the match start); this screen only draws and reports.
 */
export interface HomeProps {
  fighter: CharacterId;
  onFighter: (id: CharacterId) => void;
  /** The arena name shown in the ribbon (ARENA_COPY name, upper case). */
  arenaName: string;
  koToWin: number;
  onPlay: () => void;
  onTwoPlayer?: () => void;
  /** Absent in the portal build (bot play only). */
  onOnline?: () => void;
  onFighterSelect: () => void;
  onArena: () => void;
  onSettings: () => void;
  onHowTo: () => void;
  onCredits: () => void;
  muted: boolean;
  onMute: () => void;
  studio: string;
  version: string;
  pad: boolean;
  /** False while an overlay (Settings, How to play, the audience question) is open: no arrow navigation, and focus returns on close. */
  active?: boolean;
  busy?: boolean;
  /** Focus PLAY on mount (not on a touch device). */
  autoFocus?: boolean;
  /** Which entry had focus last time (so coming back from a sub-screen lands where you left). */
  lastFocus?: string;
  onFocusEntry?: (id: string) => void;
}

const STUDIO_PILL: React.CSSProperties = { fontSize: 13 };

/** The speech bubble pops in 0.8 s after the screen appears, stays 4 s, goes away and returns 10 s later (spec 5). */
/** The fighter's long trait line is one of the lines and is the first one shown per session (R-026 11.3). */
let traitLineShown = false;
const useBubble = (lines: readonly string[], traitLine: string) => {
  const [state, setState] = useState<{ n: number; on: boolean; trait: boolean }>({ n: 0, on: false, trait: false });
  const latest = useRef(traitLine);
  latest.current = traitLine;
  useEffect(() => {
    let n = 0;
    let t = 0;
    const show = () => {
      const trait = !traitLineShown;
      traitLineShown = true;
      setState({ n, on: true, trait });
      t = window.setTimeout(hide, 4000);
    };
    const hide = () => {
      setState((s) => ({ ...s, on: false }));
      n += 1;
      t = window.setTimeout(show, 10000);
    };
    t = window.setTimeout(show, 800);
    return () => window.clearTimeout(t);
  }, []);
  return { line: state.trait ? latest.current : lines[state.n % lines.length], on: state.on };
};

export const HomeScreen = (p: HomeProps) => {
  const root = useRef<HTMLDivElement>(null);
  const active = p.active ?? true;
  useSpatialNav(root, { active });
  const v = fighterView(p.fighter);
  const index = FIGHTER_IDS.indexOf(p.fighter);
  const step = (d: number) => p.onFighter(FIGHTER_IDS[(index + d + FIGHTER_IDS.length) % FIGHTER_IDS.length]);
  const bubble = useBubble(FD_COPY.home.bubble, v.trait.line);
  const h = FD_COPY.home;
  const focusProps = (id: string) => ({
    'data-nav': true,
    onFocus: () => p.onFocusEntry?.(id),
  });
  // Land on the entry that had focus (PLAY by default), on mount and when an overlay closes.
  useEffect(() => {
    if (!p.autoFocus || !active) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-entry="${p.lastFocus ?? 'play'}"]`);
    el?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <>
      {/* The spec's left scrim: grape, 0.62 at the edge to 0 at 54 % of the width. Stage-wide, behind everything else. */}
      <div className="fd-abs" aria-hidden="true" style={{ inset: 0, background: 'linear-gradient(90deg, rgba(38,18,74,.62) 0, rgba(38,18,74,.38) 32%, rgba(38,18,74,0) 54%)' }} />
      <Bunting variant={2} />
    <Frame>
      <div ref={root} className="fd-enter" style={{ position: 'absolute', inset: 0 }} data-testid="home">
        <div className="fd-abs" style={{ left: 40, top: 58 }}>
          <Wordmark />
        </div>
        <Ribbon
          color="var(--tang)"
          lip="var(--tang-lo)"
          tail="#C2410C"
          height={44}
          tilt={-3}
          maxWidth={340}
          style={{ position: 'absolute', left: 62, top: 170 }}
          data-testid="arena-ribbon"
        >
          <Icon name="pennant" /> {h.ribbon(p.arenaName)} <Icon name="pennant" />
        </Ribbon>

        <div className="fd-abs" style={{ left: 56, top: 244, width: 372, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FdButton
            tone="sun"
            size="lg"
            primary
            pointer
            icon="play"
            data-entry="play"
            data-testid="play"
            style={{ width: '100%' }}
            {...focusProps('play')}
            data-nav-pref
            disabled={p.busy}
            onClick={p.onPlay}
          >
            {h.play}
          </FdButton>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: -2 }}>
            <Pill>
              {h.playLine(p.koToWin)} <Keycap k="ENTER" />
            </Pill>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            {p.onTwoPlayer && (
              <FdButton tone="tang" size="md" icon="2p" fontSize={21} data-entry="2p" data-testid="open-2p" style={{ flex: '1 1 0', minWidth: 0, padding: '0 12px' }} {...focusProps('2p')} onClick={p.onTwoPlayer}>
                {h.twoPlayer}
              </FdButton>
            )}
            {p.onOnline && (
              <FdButton tone="teal" size="md" icon="globe" fontSize={21} data-entry="online" style={{ flex: '1 1 0', minWidth: 0, padding: '0 12px' }} {...focusProps('online')} onClick={p.onOnline}>
                {h.online}
              </FdButton>
            )}
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <FdButton tone="sky" size="md" icon="fighter" fontSize={21} data-entry="fighter" data-testid="open-fighter" style={{ flex: '1 1 0', minWidth: 0, padding: '0 12px' }} {...focusProps('fighter')} onClick={p.onFighterSelect}>
              {h.fighter}
            </FdButton>
            <FdButton tone="sky" size="md" icon="flag" fontSize={21} data-entry="arena" data-testid="cycle-arena" style={{ flex: '1 1 0', minWidth: 0, padding: '0 12px' }} {...focusProps('arena')} onClick={p.onArena}>
              {h.arena}
            </FdButton>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <FdButton tone="white" size="md" iconOnly icon="gear" iconSize={32} aria-label="Settings" data-entry="settings" data-testid="open-settings" {...focusProps('settings')} onClick={p.onSettings} />
            <FdButton tone="white" size="md" icon="help" fontSize={22} data-entry="howto" data-testid="open-howto" style={{ flex: '1 1 0', minWidth: 0 }} {...focusProps('howto')} onClick={p.onHowTo}>
              {h.howTo}
            </FdButton>
          </div>
        </div>

        {/* The fighter cluster, anchored to the right edge: disc 372, card 252x356, bubble, pager. */}
        <div className="fd-abs" style={{ right: 82, top: 0, width: 372, height: 720 }}>
          <div className="fd-abs" style={{ left: 0, top: 62, width: 372, height: 372, borderRadius: '50%', overflow: 'hidden', border: '5px solid var(--grape)', boxShadow: '0 8px 0 var(--grape)' }}>
            <Sunburst size={492} left={-60} top={-60} soft={false} />
          </div>
          <Card className="fd-sway" style={{ position: 'absolute', left: 61, top: 92, width: 252, height: 356, transform: 'rotate(3deg)' }} data-testid="home-card" key={p.fighter}>
            <Portrait id={p.fighter} w={244} h={226} head={0.3} card style={{ borderBottom: '4px solid var(--grape)', width: '100%' }} />
            <div className="fd-titan fd-ol" style={{ fontSize: 32, textAlign: 'center', marginTop: 10, ['--o' as string]: '3px', ['--d' as string]: '4px' }} data-testid="home-name">
              {v.name}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px 6px', marginTop: 10 }}>
              {v.traits.map((t) => (
                <Chip key={t.text} color={`var(--${t.tone})`} height={26} fontSize={12}>
                  {t.text}
                </Chip>
              ))}
              {/* The signature trait replaces the weight chip (R-026 11.3): the accent disc and the name. Weight moved to select. */}
              <Chip color="#fff" height={26} fontSize={12} style={{ paddingLeft: 2 }} data-testid="home-trait">
                <TraitDisc id={v.trait.id} accent={v.accent} size={20} />
                {v.trait.label}
              </Chip>
            </div>
          </Card>
          {bubble.on && (
            <div className="fd-bubble fd-pop" aria-hidden="true" style={{ left: -176, top: 150, width: 196, transform: 'rotate(-3deg)', textWrap: 'balance' }} data-testid="bubble">
              {bubble.line}
              <svg className="fd-abs" style={{ right: -26, top: 22 }} width="30" height="30">
                <path d="M0 4 L28 14 L0 24Z" fill="#fff" stroke="#3B1F6B" strokeWidth="4" strokeLinejoin="round" />
                <rect x="0" y="7" width="5" height="14" fill="#fff" />
              </svg>
            </div>
          )}
          <div className="fd-abs" style={{ left: 54, top: 486, width: 266, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <FdButton tone="sky" size="sm" iconOnly icon="left" iconSize={24} aria-label="Previous fighter" {...focusProps('prev')} data-entry="prev" onClick={() => step(-1)} />
            <Pill style={{ fontSize: 15, padding: '6px 16px 5px' }} data-testid="pager">
              {v.role} {'·'} {index + 1} / {FIGHTER_IDS.length}
            </Pill>
            <FdButton tone="sky" size="sm" iconOnly icon="right" iconSize={24} aria-label="Next fighter" {...focusProps('next')} data-entry="next" onClick={() => step(1)} />
          </div>
        </div>

        <FdButton tone="white" size="sm" iconOnly icon={p.muted ? 'mute' : 'sound'} iconSize={24} aria-label="Sound" aria-pressed={p.muted} data-entry="mute" {...focusProps('mute')} sound="none" onClick={p.onMute} style={{ position: 'absolute', right: 24, top: 84 }} />

        <div className="fd-abs" style={{ left: 24, bottom: 16 }}>
          <Pill style={STUDIO_PILL}>
            {p.studio} {'·'} v{p.version} {'·'}{' '}
            <button
              type="button"
              data-testid="credits-link"
              data-nav
              onClick={p.onCredits}
              className="fd-ring"
              style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, ['--rr' as string]: '10px', ['--ring-inset' as string]: '-6px -8px' }}
            >
              {h.credits}
            </button>
          </Pill>
        </div>
        <div className="fd-abs" style={{ right: 24, bottom: 16 }}>
          <HintStrip
            items={
              p.pad
                ? [
                    { keys: ['D-PAD'], label: h.hint.move },
                    { keys: ['A'], label: h.hint.select },
                    { keys: ['B'], label: h.hint.back },
                  ]
                : [
                    { keys: ['↑', '↓'], label: h.hint.move },
                    { keys: ['ENTER'], label: h.hint.select },
                    { keys: ['ESC'], label: h.hint.back },
                  ]
            }
          />
        </div>
      </div>
    </Frame>
    </>
  );
};
