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

/**
 * The office coffee machine, drawn small. The cup fills while you look at the card (hover or focus), and the steam
 * curls up into a little heart. Reduced motion: a full cup, no steam animation.
 */
const CoffeeMachine = () => (
  <svg viewBox="0 0 64 76" width="64" height="76" aria-hidden className="h-[88px] w-[74px] shrink-0">
    <defs>
      <linearGradient id="f42-mach" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a2a22" />
        <stop offset="1" stopColor="#1e1612" />
      </linearGradient>
      <clipPath id="f42-cupin">
        <path d="M22 50h20v9a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" />
      </clipPath>
    </defs>
    <rect x="6" y="4" width="52" height="66" rx="8" fill="url(#f42-mach)" stroke="#ffb35c" strokeOpacity="0.45" strokeWidth="1.5" />
    <rect x="13" y="10" width="38" height="11" rx="3" fill="#0f0b09" />
    <text x="32" y="18.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#ffd23f" className="f42-led">
      FLOOR 42
    </text>
    <rect x="27" y="25" width="10" height="6" rx="1.5" fill="#c9a27a" />
    {/* The pour: a thin stream that only runs while the card is hovered or focused. */}
    <rect x="31" y="31" width="2" height="19" rx="1" fill="#7a4524" className="f42-pour" />
    <rect x="14" y="36" width="36" height="28" rx="3" fill="#0f0b09" opacity="0.55" />
    <path d="M22 50h20v9a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" fill="#fff6e8" />
    <g clipPath="url(#f42-cupin)">
      <rect x="22" y="50" width="20" height="16" fill="#8a4f2a" className="f42-fill" />
    </g>
    <path d="M42 53c5 0 5 7 0 7" stroke="#fff6e8" strokeWidth="2.2" fill="none" />
    <g className="f42-steam" fill="none" stroke="#ffe7c7" strokeOpacity="0.75" strokeWidth="1.6" strokeLinecap="round">
      <path d="M32 47c-3.5-2.5-5-5.5-2.6-7.2 1.4-1 2.6 0 2.6 1.2 0-1.2 1.2-2.2 2.6-1.2 2.4 1.7 0.9 4.7-2.6 7.2z" />
    </g>
  </svg>
);

/**
 * The main menu's support card: the office coffee machine on the 42nd floor, top right of the menu where it never covers
 * PLAY. Warm, short and true (the facts come from nalbakigames.com/support). Phones get the compact pill instead.
 * The whole card is the link.
 */
export const SupportCard = () => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    className="focus-ring group relative flex w-[360px] items-center gap-4 overflow-hidden rounded-2xl border border-[#ffb35c]/30 bg-[linear-gradient(135deg,rgba(58,36,24,0.92),rgba(20,16,22,0.92))] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-[#ffb35c]/60 hover:shadow-[0_18px_50px_rgba(255,160,70,0.22)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
  >
    {/* A warm glow behind the machine, like the light from the office kitchen. */}
    <span
      aria-hidden
      className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,179,92,0.28),transparent_70%)] transition-opacity duration-300 group-hover:opacity-100 opacity-70"
    />
    <span className="relative">
      <CoffeeMachine />
    </span>
    <span className="relative flex min-w-0 flex-col items-start gap-1.5">
      <span className="font-display text-[1.05rem] leading-tight text-[#fff1dc]">Enjoying the fight?</span>
      <span className="text-sm leading-snug text-[#f3e3cf]/80">
        Floor 42 is free, no account, no paywall. A coffee keeps the duel servers quick and the next update brewing.
      </span>
      <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#ffd23f] px-3.5 py-1.5 text-sm font-bold text-ink-deep shadow-[0_0_18px_rgba(255,210,63,0.35)] transition group-hover:brightness-110">
        <span aria-hidden className="f42-cup inline-block">☕</span> Buy us a coffee
        <span aria-hidden className="transition group-hover:translate-x-1 motion-reduce:transition-none">→</span>
      </span>
      <span className="text-xs text-[#f3e3cf]/55">From $1. Every supporter gets a wallpaper as a thank-you.</span>
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
    className={`focus-ring inline-flex min-h-10 items-center gap-2 rounded-full border border-[#ffb35c]/50 bg-[linear-gradient(135deg,rgba(58,36,24,0.92),rgba(20,16,22,0.9))] py-1.5 pl-1.5 pr-4 text-sm font-semibold text-[#fff1dc] shadow-[0_6px_20px_rgba(0,0,0,0.4)] backdrop-blur-sm transition hover:border-[#ffb35c] motion-reduce:transition-none ${className}`}
  >
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-[#ffd23f] text-base">
        <span className="f42-cup inline-block">☕</span>
      </span>
      Buy us a coffee
    </span>
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);
