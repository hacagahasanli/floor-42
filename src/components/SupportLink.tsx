import { SUPPORT_URL } from '~/lib/links';

/** A small warm pill to the studio's support page, for pause, results and credits. Opens in a new tab; never shown during play. */
export const SupportLink = ({ className = '' }: { className?: string }) => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    className={`inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold transition hover:bg-gold hover:text-ink-deep focus-visible:bg-gold focus-visible:text-ink-deep motion-reduce:transition-none ${className}`}
  >
    <span aria-hidden>☕</span> Buy us a coffee
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);

/** The office coffee machine, drawn small: a cup under the spout, steam rising unless motion is reduced. */
const CoffeeMachine = () => (
  <svg viewBox="0 0 56 64" width="56" height="64" aria-hidden className="h-20 w-[70px] shrink-0">
    <rect x="4" y="2" width="48" height="60" rx="5" fill="#1d2540" stroke="#3ec5ff" strokeOpacity="0.5" strokeWidth="1.5" />
    <rect x="10" y="8" width="36" height="10" rx="2" fill="#0a0d18" />
    <text x="28" y="16" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ffd23f" className="f42-led">
      COFFEE
    </text>
    <rect x="22" y="22" width="12" height="5" rx="1" fill="#8b93ad" />
    <rect x="10" y="27" width="36" height="28" rx="2" fill="#0a0d18" />
    <g className="f42-steam" stroke="#e6ebf5" strokeOpacity="0.6" strokeWidth="1.6" fill="none" strokeLinecap="round">
      <path d="M24 38c-2-3 2-4 0-7" />
      <path d="M31 38c-2-3 2-4 0-7" />
    </g>
    <path d="M20 40h16v8a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5z" fill="#f4f6fb" />
    <path d="M36 42c4 0 4 6 0 6" stroke="#f4f6fb" strokeWidth="2" fill="none" />
    <rect x="21" y="41" width="14" height="3" fill="#7a4524" />
  </svg>
);

/**
 * The main menu's support card: the office coffee machine on the 42nd floor, top right of the menu where it never covers
 * PLAY. Phones get the compact pill instead. The whole card is the link.
 */
export const SupportCard = () => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    className="focus-ring group flex w-[350px] -skew-x-[6deg] items-center gap-4 border-l-4 border-gold bg-ink-deep/85 p-3 pr-4 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm transition hover:bg-ink hover:shadow-[0_0_32px_rgba(255,210,63,0.25)] motion-reduce:transition-none"
  >
    <span className="skew-x-[6deg]">
      <CoffeeMachine />
    </span>
    <span className="flex min-w-0 skew-x-[6deg] flex-col items-start gap-1">
      <span className="font-display text-lg leading-tight text-cream">Refill the coffee machine</span>
      <span className="text-sm leading-snug text-cream/75">Floor 42 is free. Keep the office caffeinated and the next update coming.</span>
      <span className="mt-1.5 inline-flex items-center gap-1.5 bg-gold px-3 py-1.5 text-sm font-bold text-ink-deep transition group-hover:brightness-110">
        ☕ Buy us a coffee
        <span aria-hidden className="transition group-hover:translate-x-1 motion-reduce:transition-none">
          →
        </span>
      </span>
    </span>
    <span className="sr-only"> (opens the Nalbaki Games support page in a new tab)</span>
  </a>
);

/** Compact version for phones: one tap target with a cup and the words. */
export const SupportPill = ({ className = '' }: { className?: string }) => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    className={`focus-ring inline-flex min-h-10 -skew-x-[8deg] items-center gap-2 bg-gold px-3.5 py-2 text-sm font-bold text-ink-deep shadow-[0_0_24px_rgba(255,210,63,0.3)] transition hover:brightness-110 motion-reduce:transition-none ${className}`}
  >
    <span className="inline-flex skew-x-[8deg] items-center gap-2">
      <span aria-hidden className="f42-cup inline-block">
        ☕
      </span>
      Buy us a coffee
    </span>
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);
