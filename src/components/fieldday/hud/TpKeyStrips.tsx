'use client';

import { Keycap } from '../parts';
import { capLabel } from '../screens/howToKeys';

import './hudTraits.css';

import type { Action2P, Bindings2P, Player } from '~/game/twoPlayer';
import type { CSSProperties } from 'react';

/** The strip's verbs in the order of spec 11.5.9 (move, jump, shoot, dash, push). "Sit" stays in Settings; 2-player picks guns up by itself, so there is no grab key. */
const PARTS: { keys: Action2P[]; text: string }[] = [
  { keys: ['left', 'right'], text: 'move' },
  { keys: ['up'], text: 'jump' },
  { keys: ['fire'], text: 'shoot' },
  { keys: ['dash'], text: 'dash' },
  { keys: ['push'], text: 'push' },
];

/**
 * One player's key strip (sheet 8): a grape-deep pill, the P1 / P2 tag, keycaps and verbs. The tag is grape with white text and
 * a 2 px white border (R-028, colour-balance.md 8.5, supersedes the player-colour tag of spec 11.5.9).
 */
export const TpKeyStrip = ({
  player,
  bindings,
  label,
  shown,
  align,
}: {
  player: Player;
  bindings: Bindings2P;
  label: (code: string) => string;
  shown: boolean;
  align: 'left' | 'right';
}) => (
  <div
    className="fd-abs fd-tp"
    data-testid={`strip-${player}`}
    aria-hidden={!shown}
    style={{ bottom: 24, [align]: 24, opacity: shown ? 1 : 0 } as CSSProperties}
  >
    <b className="fd-tp-tag">{player === 'p1' ? 'P1' : 'P2'}</b>
    {PARTS.map((part) => (
      <span key={part.text}>
        {part.keys.map((a) => (
          <Keycap key={a} k={capLabel(label(bindings[player][a]))} />
        ))}
        {part.text}
      </span>
    ))}
  </div>
);
