'use client';

import { asset } from '~/lib/portal';

import type { ArenaId } from '~/game/sim/constants';

/**
 * The soft menu backdrop of the select screens (b03, b04): the arena's clean poster blurred 7 px, with a grape tint on top. A
 * static image, so the live 3D scene behind it costs nothing visible. Fills the whole stage.
 */
export const SoftBackdrop = ({ arena, tint }: { arena: ArenaId; tint: number }) => (
  <>
    <div
      aria-hidden="true"
      className="fd-abs"
      style={{
        inset: -24,
        background: `#26124a url(${asset(arena === 'office' ? 'menu-poster-office.webp' : 'menu-poster.webp')}) center / cover`,
        filter: 'blur(7px) saturate(1.05) brightness(.92)',
      }}
    />
    <div className="fd-abs" aria-hidden="true" style={{ inset: 0, background: `rgba(38,18,74,${tint})` }} />
  </>
);
