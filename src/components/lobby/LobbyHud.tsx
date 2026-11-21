'use client';

import Link from 'next/link';

import { menuSound } from '~/components/menu/menuSound';

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
}: {
  name: string;
  character: string;
  view: LobbyView;
  onHome: () => void;
}) => (
  <header className="lb-hud">
    <div className="lb-plate lb-plate-me">
      <span className="lb-plate-name">{name.toUpperCase()}</span>
      <span className="lb-bar" aria-hidden>
        <span key={character} className="lb-bar-fill" />
      </span>
      <span className="lb-plate-line">You · ready</span>
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
