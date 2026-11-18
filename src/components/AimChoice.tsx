'use client';

import { useEffect, useState } from 'react';

import { isTouchDevice } from '~/game/input';

import type { AimMode } from '~/game/input';

/** Auto-aim stays the default; mouse aim is a choice kept in this browser (T switches in a match). */
export const AIM_KEY = 'merge-conflict:aim';

export const readAim = (): AimMode => {
  try {
    return window.localStorage.getItem(AIM_KEY) === 'mouse' ? 'mouse' : 'auto';
  } catch {
    return 'auto';
  }
};

export const saveAim = (m: AimMode) => {
  try {
    window.localStorage.setItem(AIM_KEY, m);
  } catch {
    /* no storage */
  }
};

/**
 * Auto-aim or mouse aim, chosen before the match. Phones always auto-aim, so it isn't shown there.
 */
export const AimChoice = () => {
  const [value, setValue] = useState<AimMode>('auto');
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setValue(readAim());
    setTouch(isTouchDevice());
  }, []);
  if (touch) return null;
  return (
    <div className="panel-cut flex flex-col gap-1.5 bg-ink/80 p-3 backdrop-blur">
      <span className="text-[10px] font-semibold tracking-widest text-cream/50">AIM AND SHOOT</span>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Aim and shoot">
        {(
          [
            ['auto', 'Auto-aim', 'Space shoots your rival when you can see them'],
            ['mouse', 'Mouse', 'Point to aim, left click (or Space) to shoot'],
          ] as const
        ).map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => {
              setValue(id);
              saveAim(id);
            }}
            className={`panel-cut flex flex-col gap-0.5 px-3 py-2 text-left ${value === id ? 'bg-gold text-ink-deep' : 'bg-cream/10 text-cream hover:bg-cream/15'}`}
          >
            <span className="text-sm font-bold">{label}</span>
            <span className={`text-[10px] leading-tight ${value === id ? 'text-ink-deep/75' : 'text-cream/50'}`}>{hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
