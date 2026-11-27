'use client';

import { FdButton } from '../Button';
import { fighterView } from '../fighters';
import { Icon } from '../Icon';
import { HintStrip } from '../parts';
import { Portrait } from '../Portrait';

import { Modal, TitleRibbon } from './Modal';

import type { HudFighter } from '~/game/render/game';

/**
 * Pause (b08): the match blurred under a 50 % grape tint, a 460x536 panel with the PAUSED ribbon, a score well (portraits and
 * "2 – 1"), then RESUME (focused, the one primary), SETTINGS, HOW TO PLAY and QUIT TO MENU with 26 px between them so the focus
 * rings never touch. Online, pausing needs both players: until the rival agrees the ribbon asks "PAUSE?" and the game keeps going.
 * Local 2-player adds CONTROLS and says who paused. The rules for pausing belong to ArenaGame; this only draws and calls back.
 * Esc is NOT handled here: ArenaGame's own Esc resumes.
 */
export interface PauseScreenProps {
  paused: boolean;
  online: boolean;
  fighters: [HudFighter, HudFighter];
  /** Local 2-player: who paused (a pad's Start says who; Esc is shared, so it is not known then), or a lost pad. */
  pausedBy?: 0 | 1 | 'pad' | null;
  onResume: () => void;
  onSettings: () => void;
  onHowTo: () => void;
  onQuit: () => void;
  /** Local 2-player: the key card in view mode. */
  onControls?: () => void;
  pad: boolean;
  /** The item that had focus when a sub-screen (settings, how to play) opened: focus returns to it when this screen comes back. */
  initial?: string;
  onFocusItem?: (id: string) => void;
}

const Side = ({ f, right }: { f: HudFighter; right?: boolean }) => {
  const v = fighterView(f.character);
  const face = <Portrait id={f.character} w={28} h={28} circle head={0.78} ty={0.56} className="fd-portrait" style={{ width: 34, height: 34, borderWidth: 3, boxShadow: 'none' }} />;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, font: "800 15px/1 'Baloo 2', sans-serif" }}>
      {!right && face}
      {v.name}
      {right && face}
    </span>
  );
};

export const PauseScreen = (p: PauseScreenProps) => {
  const two = !!p.onControls;
  const note =
    p.pausedBy !== null && p.pausedBy !== undefined && two
      ? p.pausedBy === 'pad'
        ? 'Pad disconnected'
        : `P${p.pausedBy + 1} paused`
      : !p.paused && p.online
        ? 'Waiting for your rival to pause too. The game keeps going until they do.'
        : null;
  const items = [
    { id: 'resume', icon: 'play' as const, label: p.paused ? 'RESUME' : 'KEEP PLAYING', onClick: p.onResume, sun: true },
    ...(p.onControls ? [{ id: 'controls', icon: 'keys' as const, label: 'CONTROLS', onClick: p.onControls, sun: false }] : []),
    { id: 'settings', icon: 'gear' as const, label: 'SETTINGS', onClick: p.onSettings, sun: false },
    { id: 'howto', icon: 'help' as const, label: 'HOW TO PLAY', onClick: p.onHowTo, sun: false },
    { id: 'quit', icon: 'home' as const, label: p.online ? 'LEAVE MATCH' : 'QUIT TO MENU', onClick: p.onQuit, sun: false },
  ];
  // Four buttons: 68 high, 26 apart (the spec). More (2-player) or a note: tighter, so the panel still ends above the hint strip.
  const tight = items.length > 4 || !!note;
  const h = tight ? 56 : 68;
  const gap = tight ? 18 : 26;
  const top = note ? 288 : 254;
  const panelBottom = Math.max(640, top + items.length * h + (items.length - 1) * gap + 30);
  return (
    <Modal label="Pause" tint={0.5} z={10} testId="pause-menu">
      <div className="fd-abs fd-drop" style={{ inset: 0 }}>
        <div className="fd-panel" style={{ left: '50%', marginLeft: -230, top: 104, width: 460, height: panelBottom - 104 }} />
        <TitleRibbon top={76} tilt={-2} icon={<Icon name="pause" size={30} />}>
          {p.paused ? 'PAUSED' : 'PAUSE?'}
        </TitleRibbon>
        <div
          data-testid="pause-score"
          className="fd-abs"
          style={{ left: '50%', marginLeft: -190, top: 170, width: 380, height: 56, borderRadius: 16, background: 'var(--mist)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}
        >
          <Side f={p.fighters[0]} />
          <span className="fd-titan" style={{ fontSize: 28 }}>
            {p.fighters[0].kos} – {p.fighters[1].kos}
          </span>
          <Side f={p.fighters[1]} right />
        </div>
        {note && (
          <div className="fd-abs" role="status" data-testid="paused-by" style={{ left: '50%', marginLeft: -190, top: 236, width: 380, textAlign: 'center' }}>
            <span className="fd-note">{note}</span>
          </div>
        )}
        <nav aria-label="Pause menu" className="fd-abs" style={{ left: '50%', marginLeft: -174, top, width: 348, display: 'flex', flexDirection: 'column', gap }}>
          {items.map((it) => (
            <FdButton
              key={it.id}
              tone={it.sun ? 'sun' : 'white'}
              height={h}
              fontSize={it.sun ? 30 : 22}
              icon={it.icon}
              primary={it.sun}
              data-nav
              data-nav-pref={it.id === (p.initial ?? 'resume') || undefined}
              data-testid={`pause-${it.id}`}
              onFocus={() => p.onFocusItem?.(it.id)}
              style={{ width: '100%' }}
              onClick={it.onClick}
            >
              {it.label}
            </FdButton>
          ))}
        </nav>
        <div className="fd-abs" style={{ left: '50%', bottom: 20, transform: 'translateX(-50%)' }}>
          <HintStrip
            items={
              p.pad
                ? [
                    { keys: ['D-PAD'], label: 'Move' },
                    { keys: ['A'], label: 'Select' },
                    { keys: ['B'], label: 'Resume' },
                  ]
                : [
                    { keys: ['↑', '↓'], label: 'Move' },
                    { keys: ['ENTER'], label: 'Select' },
                    { keys: ['ESC'], label: 'Resume' },
                  ]
            }
          />
        </div>
      </div>
    </Modal>
  );
};
