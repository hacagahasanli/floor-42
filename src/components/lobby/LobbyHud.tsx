'use client';

import Link from 'next/link';

import { useEffect, useState } from 'react';

import { menuSound } from '~/components/menu/menuSound';
import { isTouchDevice } from '~/game/input';

import { IconBack } from './LobbyControls';
import { backKeyDisabled, showEscChip } from './lobbyView';

import type { LobbyView } from './lobbyView';

/**
 * The top of the lobby is the match HUD before the match: your plate, the lift display (home), the rival's plate.
 * No bar behind it. The rival side is the one live region, so a state change is announced once.
 */
export const LobbyHud = ({
  name,
  character,
  view,
  onHome,
  onBack,
}: {
  name: string;
  character: string;
  view: LobbyView;
  onHome: () => void;
  /** The Back key: leaves a search or room first when there is one, then goes home. */
  onBack: () => void;
}) => {
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouchDevice()), []);
  const off = backKeyDisabled(view.panel);
  return (
    <header className="lb-hud">
      <div className="lb-hud-left">
        <button
          type="button"
          className="lb-back"
          aria-label="Back to main menu"
          aria-disabled={off}
          data-nav
          onMouseEnter={() => !off && menuSound.tick()}
          onFocus={() => !off && menuSound.tick()}
          onClick={() => {
            if (off) return;
            menuSound.back();
            onBack();
          }}
        >
          <span className="lb-back-ico" aria-hidden>
            <IconBack size={18} />
          </span>
          <span className="lb-back-label" aria-hidden>
            Back
          </span>
          {showEscChip(view.panel, touch) && (
            <kbd className="lb-key lb-back-chip" aria-hidden>
              Esc
            </kbd>
          )}
        </button>
        <div className="lb-plate lb-plate-me">
          <span className="lb-plate-name">{name.toUpperCase()}</span>
          <span className="lb-bar" aria-hidden>
            <span key={character} className="lb-bar-fill" />
          </span>
          <span className="lb-plate-line">You · ready</span>
        </div>
      </div>

      <div className="lb-lift">
        <Link
          href="/"
          aria-label="Main menu"
          className="lb-lift-link"
          onMouseEnter={() => menuSound.tick()}
          onFocus={() => menuSound.tick()}
          onClick={(e) => {
            e.preventDefault();
            menuSound.confirm();
            onHome();
          }}
        >
          <span className="lb-tri" aria-hidden>
            ▲
          </span>
          <span className="lb-num" aria-hidden>
            42
          </span>
        </Link>
        <span className="lb-lift-tip" aria-hidden>
          Main menu
        </span>
        <p className="lb-conn">
          <span className="lb-dot" data-c={view.dot} data-pulse={view.pulse} aria-hidden />
          <span>{view.centre}</span>
        </p>
      </div>

      <div className="lb-plate lb-plate-rival" data-found={view.rivalFound} aria-live="polite">
        <span className="lb-plate-name">{view.rivalFound ? 'RIVAL FOUND' : 'RIVAL'}</span>
        <span className="lb-bar" aria-hidden>
          <span className="lb-bar-rival" />
          {view.rivalSearching && <span className="lb-bar-sweep" />}
        </span>
        <span className="lb-plate-line">{view.rival}</span>
      </div>
    </header>
  );
};
