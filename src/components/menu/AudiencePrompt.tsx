'use client';

import { useEffect, useRef, useState } from 'react';

import { shouldAskAudience } from '~/game/copy';
import { getSettings } from '~/game/settings';

import { menuSound } from './menuSound';
import { useSettings } from './useSettings';

import type { CopyVariant } from '~/game/copy';

const CHOICES: { id: CopyVariant; label: string; line: string; accent: string }[] = [
  { id: 'developer', label: 'DEVELOPER', line: 'Merge conflicts, code review and office in-jokes', accent: '#3ddc84' },
  { id: 'regular', label: 'PLAYER', line: 'Straight-up fighting, no jargon', accent: '#ffd23f' },
];

/** True once the player has not answered yet and the page is on the client (never in the server HTML). */
export const useAskAudience = () => {
  const s = useSettings();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && shouldAskAudience(s.audience);
};

/**
 * Asked once, on first entry: developer (the merge-conflict jokes) or regular player (plain fighting-game words).
 * The answer is saved in Settings and can be changed there (Accessibility). ←/→ or ↑/↓ move, Enter picks.
 */
export const AudiencePrompt = () => {
  const ask = useAskAudience();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const i = buttons.findIndex((b) => b === document.activeElement);
      const dir = e.code === 'ArrowRight' || e.code === 'ArrowDown' ? 1 : -1;
      buttons[(i + dir + buttons.length) % buttons.length]?.focus();
      menuSound.tick();
    };
    // Capture, so the menu behind does not move its own focus while the question is open.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [ask]);

  if (!ask) return null;
  const choose = (id: CopyVariant) => {
    menuSound.confirm();
    getSettings().set({ audience: id });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-deep/80 px-4 backdrop-blur-sm [animation:fadeIn_0.3s_ease-out]">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audience-q"
        className="panel-cut flex w-full max-w-2xl flex-col gap-6 border border-gold/25 bg-[linear-gradient(180deg,rgba(20,26,43,0.98),rgba(10,13,24,0.98))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)] [animation:riseIn_0.4s_ease-out] sm:p-8 [@media(max-height:500px)]:gap-3 [@media(max-height:500px)]:p-4"
      >
        <div className="flex flex-col gap-2">
          <h2 id="audience-q" className="-skew-x-6 font-display text-2xl leading-tight text-cream sm:text-4xl [@media(max-height:500px)]:text-xl">
            Are you a developer or a regular player?
          </h2>
          <p className="text-sm text-cream/70">So the jokes land. Same fight either way; you can switch in Settings.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHOICES.map((c, i) => (
            <button
              key={c.id}
              type="button"
              autoFocus={i === 0}
              onClick={() => choose(c.id)}
              onMouseEnter={(e) => e.currentTarget.focus()}
              className="focus-ring group relative flex min-h-24 -skew-x-[8deg] flex-col items-start justify-center gap-1 overflow-hidden border-l-4 bg-cream/[0.06] px-5 py-4 text-left transition hover:bg-cream/[0.1] focus-visible:bg-cream/[0.12] [@media(max-height:500px)]:min-h-16 [@media(max-height:500px)]:py-2"
              style={{ borderColor: c.accent }}
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ background: `linear-gradient(90deg, ${c.accent}33, transparent 75%)` }}
              />
              <span className="relative skew-x-[8deg] font-display text-3xl leading-none sm:text-4xl [@media(max-height:500px)]:text-2xl" style={{ color: c.accent }}>
                {c.label}
              </span>
              <span className="relative skew-x-[8deg] text-sm text-cream/75">{c.line}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
