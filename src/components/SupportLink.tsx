'use client';

import { SUPPORT_URL } from '~/lib/links';
import { track } from '~/lib/telemetry';

/*
 * Support is one small "Support us" button that opens the studio's support page (nalbakigames.com/support) in a new tab.
 */

type Variant = 'menu' | 'pause' | 'results';

const VARIANT_WHERE: Record<Variant, string> = { menu: 'menu', results: 'results', pause: 'pause' };

/** F-082 (R-032): on the result screen the pill is the Field Day info pill (grape-deep 86 %, cream), no tomato: tomato is KO and errors only. */
const RESULTS_CLASS =
  'inline-flex items-center gap-2 self-start rounded-full bg-[rgba(38,18,74,.86)] px-4 py-2 text-sm font-bold text-[#FFF3D6] transition hover:-translate-y-0.5 hover:bg-[#5A3596] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_#fff,0_0_0_6px_#3B1F6B] motion-reduce:transition-none motion-reduce:hover:translate-y-0';
const DEFAULT_CLASS =
  'inline-flex items-center gap-2 self-start rounded-full border-[1.5px] border-[#FF4D2E] bg-black/50 px-4 py-2 text-sm font-bold text-[#F2EFE8] backdrop-blur transition hover:-translate-y-0.5 hover:bg-[#FF4D2E]/20 hover:shadow-[0_6px_22px_-6px_rgba(255,77,46,0.7)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2EFE8] motion-reduce:transition-none motion-reduce:hover:translate-y-0';

export const Support = ({ variant, className = '' }: { variant: Variant; className?: string }) =>
  process.env.NEXT_PUBLIC_PORTAL === '1' ? null : (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    onClick={() => track('support_click', { where: VARIANT_WHERE[variant] })}
    className={`${variant === 'results' ? RESULTS_CLASS : DEFAULT_CLASS} ${className}`}
    data-testid={`support-${variant}`}
  >
    <span aria-hidden="true" style={{ color: variant === 'results' ? '#FFF3D6' : '#FF4D2E' }}>
      &hearts;
    </span>{' '}
    Support us
  </a>
);
