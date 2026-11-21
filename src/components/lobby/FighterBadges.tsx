'use client';

import { menuSound } from '~/components/menu/menuSound';
import { useCopy } from '~/components/menu/useCopy';
import { ROSTER } from '~/game/roster';

import type { CharacterId } from '~/game/sim/types';
import type { CSSProperties, KeyboardEvent } from 'react';

/**
 * Four staff ID badges on lanyards. A radio group: arrows move and pick, 1-4 pick from anywhere (handled by the
 * page). While a search or room is open the strip is dimmed and inert: changing fighter mid-search would
 * desync what the server has.
 */
export const FighterBadges = ({
  value,
  onPick,
  portraits,
  disabled,
}: {
  value: CharacterId;
  onPick: (id: CharacterId) => void;
  portraits: Record<CharacterId, string> | null;
  disabled: boolean;
}) => {
  const fighters = useCopy().fighters;
  const pick = (id: CharacterId) => {
    if (disabled || id === value) return;
    menuSound.confirm();
    onPick(id);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    if (disabled) return;
    const i = ROSTER.findIndex((r) => r.id === value);
    const next = ROSTER[(i + dir + ROSTER.length) % ROSTER.length];
    pick(next.id);
    requestAnimationFrame(() => document.getElementById(`lb-badge-${next.id}`)?.focus());
  };
  return (
    <div
      className="lb-badges"
      role="radiogroup"
      aria-label="Choose your fighter"
      data-disabled={disabled}
    >
      {ROSTER.map((r, n) => {
        const on = r.id === value;
        return (
          <button
            key={r.id}
            id={`lb-badge-${r.id}`}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled}
            tabIndex={on ? 0 : -1}
            className="lb-badge"
            style={{ '--a': r.accent } as CSSProperties}
            onClick={() => pick(r.id)}
            onKeyDown={onKey}
            onMouseEnter={() => !disabled && menuSound.tick()}
            onFocus={() => !disabled && menuSound.tick()}
          >
            <span className="lb-strap" aria-hidden>
              <i />
            </span>
            <span className="lb-card">
              <span className="lb-portrait">
                {portraits && (
                  // A rendered portrait, not a photo: a plain <img> is right here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={portraits[r.id]} alt="" />
                )}
              </span>
              <span className="lb-badge-name">{r.name}</span>
              <span className="lb-badge-role">{fighters[r.id].role}</span>
              <kbd className="lb-key" aria-hidden>
                {n + 1}
              </kbd>
            </span>
          </button>
        );
      })}
    </div>
  );
};
