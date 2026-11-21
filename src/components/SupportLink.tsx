'use client';

import { useEffect, useRef } from 'react';

import type { MouseEvent } from 'react';

import { SUPPORT_PAY_URL, SUPPORT_URL } from '~/lib/links';
import { track } from '~/lib/telemetry';

/*
 * The studio's shared support UI (Baki the mascot, $3 / $5 / $10 chips, a button to the real itch.io page), vendored in
 * src/vendor/nalbaki-support and synced by tools/sync-nalbaki-support.mjs. It is a web component, so it is loaded on
 * the client only, after the page has painted. Never shown during play.
 *   menu: the main menu card (wide screens). pause: one line, "Enjoying it? Support us" (pause, phones, credits).
 *   results: the card on the result screen.
 */

type Variant = 'menu' | 'pause' | 'results';

/** Space kept for each variant while the module loads, so nothing jumps. */
const RESERVE: Record<Variant, string> = { menu: 'min-h-[214px]', results: 'min-h-[190px]', pause: 'min-h-11' };

export const Support = ({ variant, className = '' }: { variant: Variant; className?: string }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let cleanup: (() => void) | undefined;
    void import('~/vendor/nalbaki-support/nalbaki-support.js').then(({ mountSupport }) => {
      if (gone || !host.current) return;
      cleanup = mountSupport(host.current, { variant, href: SUPPORT_PAY_URL, pageHref: SUPPORT_URL });
    });
    return () => {
      gone = true;
      cleanup?.();
    };
  }, [variant]);
  // A click on any link inside the module (its shadow DOM is open, so the event path shows the link): counted as a support click.
  const counted = (e: MouseEvent<HTMLDivElement>) => {
    if (e.nativeEvent.composedPath().some((n) => n instanceof HTMLAnchorElement)) track('support_click', { where: variant });
  };
  return <div ref={host} onClick={counted} className={`${RESERVE[variant]} ${className}`} />;
};
