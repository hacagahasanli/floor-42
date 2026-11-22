'use client';

import { useEffect, useRef } from 'react';

import { Support } from '~/components/SupportLink';
import { asset } from '~/lib/portal';
import { GAME_VERSION, STUDIO_NAME } from '~/lib/studio';

import type { ReactNode } from 'react';

/**
 * The Credits side panel, and the side panel How to play shares. Credits opens from the main-menu footer link and from
 * the last row of Settings (spec local-2p.md section 7); its content does not change.
 */

/** A side panel for How to play and Credits: same slide and Back as Settings. */
export const SidePanel = ({
  title,
  kicker,
  onClose,
  children,
}: {
  title: string;
  kicker: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-deep/40 [animation:fadeIn_0.25s_ease-out]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full flex-col border-r border-gold/20 bg-[linear-gradient(180deg,rgba(20,26,43,0.97),rgba(10,13,24,0.98))] shadow-[30px_0_80px_rgba(0,0,0,0.6)] [animation:slideInLeft_0.32s_cubic-bezier(.2,.9,.2,1)] sm:w-[min(600px,100vw)]"
      >
        <header className="flex flex-col px-5 pb-3 pt-5 sm:px-8 sm:pt-8 [@media(max-height:500px)]:pt-3">
          <h2 className="font-display text-4xl leading-none sm:text-5xl [@media(max-height:500px)]:text-3xl">
            {title}
          </h2>
          {kicker && <span className="mt-2 text-sm text-cream/60">{kicker}</span>}
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2 sm:px-8">{children}</div>
        <footer className="border-t border-cream/10 bg-ink-deep/60 px-5 py-3 sm:px-8">
          <button
            ref={ref}
            type="button"
            onClick={onClose}
            className="focus-ring flex -skew-x-12 items-center gap-2 bg-cream/10 px-5 py-2.5 text-sm font-bold uppercase tracking-wider hover:bg-cream/20"
          >
            <span className="inline-flex skew-x-12 items-center gap-2">
              <kbd className="hidden border border-cream/30 px-1 text-[10px] sm:inline">Esc</kbd>{' '}
              Back
            </span>
          </button>
        </footer>
      </aside>
    </div>
  );
};

const Credits = () => (
  <div className="flex flex-col gap-5 text-sm text-cream/80">
    <div className="flex items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset('nalbaki-mark.svg')} alt="" width={64} height={64} className="h-16 w-16" />
      <div className="flex flex-col">
        <span className="font-display text-2xl text-cream">{STUDIO_NAME}</span>
        <span className="text-cream/60">Floor 42 · version {GAME_VERSION}</span>
      </div>
    </div>
    <p>
      Design, code, models, office and most sounds made in code by {STUDIO_NAME}. Every character,
      gun and room is original.
    </p>
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold/90">Thanks</span>
      <p>Gun sounds by Snake (f8studios), from Snake&apos;s Authentic Gun Sounds.</p>
      <p>
        Fonts: Bungee by David Jonathan Ross and Chakra Petch by Cadson Demak (SIL Open Font
        License).
      </p>
      <p>Built with three.js, React and Next.js.</p>
    </div>
    <Support variant="pause" className="self-start" />
  </div>
);

export const CreditsPanel = ({ onClose }: { onClose: () => void }) => (
  <SidePanel title="CREDITS" kicker={`Floor 42 · ${STUDIO_NAME}`} onClose={onClose}>
    <Credits />
  </SidePanel>
);
