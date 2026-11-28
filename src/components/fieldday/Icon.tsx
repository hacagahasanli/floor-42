import type { ReactNode, SVGProps } from 'react';

/**
 * The Field Day icon set (spec 2.5): 24 px grid, grape stroke about 2.4, white fill, round joins ("sticker" icons), plus weapon
 * silhouettes (40x20) and two award icons. Inline SVG, no icon font, no emoji. Drawn exactly as in the spec's index.html.
 * `<Icon name="play" />` is 1em square (weapons 2em x 1em): size it with font-size or `size`.
 */
const G = '#3B1F6B';
const sticker = { fill: '#fff', stroke: G, strokeLinejoin: 'round' } as const;

const ICONS = {
  play: <path d="M7 4.5 L19.5 12 L7 19.5Z" fill="#fff" stroke={G} strokeWidth="2.8" strokeLinejoin="round" />,
  '2p': (
    <g {...sticker} strokeWidth="2.4">
      <circle cx="8.5" cy="8" r="3.4" />
      <circle cx="16.5" cy="8" r="3.4" />
      <path d="M2.5 20c0-4 2.7-6.3 6-6.3s6 2.3 6 6.3z" />
      <path d="M10.5 20c0-4 2.7-6.3 6-6.3s6 2.3 6 6.3z" />
    </g>
  ),
  // R-032 online screens (online/index.html symbols).
  bolt: <path d="M13.5 2.5 L4.5 13.5 H11 L9.5 21.5 L19.5 9.5 H13 Z" fill="#fff" stroke={G} strokeWidth="2.4" strokeLinejoin="round" />,
  link: (
    <g fill="none" stroke={G} strokeWidth="2.6" strokeLinecap="round">
      <path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1.2 1.2" />
      <path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1.2-1.2" />
    </g>
  ),
  ticket: (
    <>
      <path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4z" fill="#fff" stroke={G} strokeWidth="2.3" strokeLinejoin="round" />
      <path d="M9 10h6M9 14h4" stroke={G} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  bot: (
    <>
      <g stroke={G} strokeWidth="2.3" strokeLinejoin="round">
        <path d="M12 3.5v3" strokeLinecap="round" />
        <circle cx="12" cy="3" r="1.4" fill={G} />
        <rect x="4" y="6.5" width="16" height="12.5" rx="3.5" fill="#fff" />
        <path d="M2 11v4M22 11v4" strokeLinecap="round" />
      </g>
      <circle cx="9" cy="12.5" r="1.7" fill={G} />
      <circle cx="15" cy="12.5" r="1.7" fill={G} />
      <path d="M9.5 16h5" stroke={G} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  checkOnDark: <path d="M4.5 12.5l5 5 10-11" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />,
  copy: (
    <g fill="#fff" stroke={G} strokeWidth="2.3" strokeLinejoin="round">
      <rect x="8" y="8" width="12.5" height="13" rx="2.5" />
      <path d="M16 8V5.5A2 2 0 0 0 14 3.5H6A2.5 2.5 0 0 0 3.5 6v8.5a2 2 0 0 0 2 2H8" />
    </g>
  ),
  share: (
    <g fill="none" stroke={G} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
      <path d="M5 12v6.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2V12" />
    </g>
  ),
  plug: (
    <g fill="#fff" stroke={G} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
      <path d="M7 3.5v4M12 3.5v4" />
      <path d="M4.5 7.5h10v3.5a5 5 0 0 1-10 0z" />
      <path d="M9.5 16v4.5" />
      <path d="M16 14l5 5M21 14l-5 5" fill="none" />
    </g>
  ),
  globeOnDark: (
    <g fill="none" stroke="#fff" strokeWidth="2.4">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3.5 9h17M3.5 15h17" />
    </g>
  ),
  globe: (
    <g fill="none" stroke={G} strokeWidth="2.4">
      <circle cx="12" cy="12" r="9" fill="#fff" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3.5 9h17M3.5 15h17" />
    </g>
  ),
  fighter: (
    <>
      <g {...sticker} strokeWidth="2.4">
        <rect x="7" y="2.8" width="10" height="8.4" rx="2.4" />
        <path d="M5 21.5v-5.5a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v5.5z" />
      </g>
      <rect x="9.6" y="6" width="1.6" height="2" fill={G} />
      <rect x="12.8" y="6" width="1.6" height="2" fill={G} />
    </>
  ),
  flag: (
    <g stroke={G} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M5.5 21.5V3" />
      <path d="M5.5 4h13l-3 4.5 3 4.5h-13z" fill="#fff" />
    </g>
  ),
  gear: (
    <g {...sticker} strokeWidth="2.3">
      <path d="M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z" />
      <circle cx="12" cy="12" r="3.3" />
    </g>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="#fff" stroke={G} strokeWidth="2.4" />
      <path d="M9.2 9.3a2.9 2.9 0 1 1 4.2 2.6c-.9.5-1.4 1.1-1.4 2.1v.6" fill="none" stroke={G} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="12" cy="17.6" r="1.5" fill={G} />
    </>
  ),
  back: <path d="M14.5 4.5 L6.5 12 L14.5 19.5 M7 12h11" fill="none" stroke={G} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  left: <path d="M15 4.5 L7 12 L15 19.5Z" fill="#fff" stroke={G} strokeWidth="2.6" strokeLinejoin="round" />,
  right: <path d="M9 4.5 L17 12 L9 19.5Z" fill="#fff" stroke={G} strokeWidth="2.6" strokeLinejoin="round" />,
  pause: (
    <g fill="#fff" stroke={G} strokeWidth="2.4">
      <rect x="5.5" y="4" width="4.6" height="16" rx="1.6" />
      <rect x="13.9" y="4" width="4.6" height="16" rx="1.6" />
    </g>
  ),
  sound: (
    <g stroke={G} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3.5 9h4l5-4.5v15l-5-4.5h-4z" fill="#fff" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.3 5.8a9 9 0 0 1 0 12.4" fill="none" />
    </g>
  ),
  mute: (
    <g stroke={G} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3.5 9h4l5-4.5v15l-5-4.5h-4z" fill="#fff" />
      <path d="M15.5 9l5 6M20.5 9l-5 6" fill="none" />
    </g>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" fill="none" stroke={G} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />,
  lock: (
    <g stroke={G} strokeWidth="2.4" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="11" rx="2.6" fill="#fff" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" />
    </g>
  ),
  again: (
    <g fill="none" stroke={G} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 3.8v4.6h-4.6" />
    </g>
  ),
  home: <path d="M3.5 11.5 12 4l8.5 7.5V20.5h-5.5v-5.5h-6v5.5H3.5z" fill="#fff" stroke={G} strokeWidth="2.4" strokeLinejoin="round" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="#fff" stroke={G} strokeWidth="2.4" />
      <path d="M12 7v5.3l3.4 2.2" fill="none" stroke={G} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  keys: (
    <>
      <rect x="2.5" y="6" width="19" height="12.5" rx="2.6" fill="#fff" stroke={G} strokeWidth="2.2" strokeLinejoin="round" />
      <g fill={G}>
        <rect x="5.5" y="9" width="2.4" height="2.2" rx=".6" />
        <rect x="9.5" y="9" width="2.4" height="2.2" rx=".6" />
        <rect x="13.5" y="9" width="2.4" height="2.2" rx=".6" />
        <rect x="17" y="9" width="1.8" height="2.2" rx=".6" />
        <rect x="7.5" y="13.4" width="9" height="2.2" rx=".6" />
      </g>
    </>
  ),
  /** Signature-trait icons and the bomb (R-026 section 11, traits/icons/*.svg). The icon name is the sim's `TraitId`. */
  leapfrog: (
    <g {...sticker} strokeWidth="2.4" strokeLinecap="round">
      <circle cx="12" cy="15.2" r="2.6" />
      <path d="M7.6 22v-.8a4.4 4.4 0 0 1 8.8 0v.8z" />
      <path d="M3.2 17.5Q11.5 -0.5 20.4 14.2" fill="none" />
      <path d="M20.3 10.2l.1 4-3.6-1.9" fill="none" />
    </g>
  ),
  teaBreak: (
    <g {...sticker} strokeWidth="2.4" strokeLinecap="round">
      <path d="M16 11.2h1.4a2.6 2.6 0 0 1 0 5.2H15.6" fill="none" />
      <path d="M4.6 9.8h11.6v4.6a5.2 5.2 0 0 1-5.2 5.2h-1.2a5.2 5.2 0 0 1-5.2-5.2z" />
      <path d="M3 21.6h15" fill="none" />
      <path d="M9 2.6c-1.6 1.4 1.6 2.6 0 4.4M12.8 3.4c-1.3 1.2 1.3 2.1 0 3.6" fill="none" />
    </g>
  ),
  sugarRush: (
    <g {...sticker} strokeWidth="2.4" strokeLinecap="round">
      <path d="M15 3.6l6 3-6 3-6-3z" />
      <path d="M9 6.6v7.4l6 3.2V9.6z" />
      <path d="M21 6.6v7.4l-6 3.2V9.6z" />
      <path d="M1.8 9.4h4.2M1.2 13.4h5M2.6 17.4h5.4" fill="none" />
    </g>
  ),
  packedExtra: (
    <g {...sticker} strokeWidth="2.4" strokeLinecap="round">
      <path d="M9.6 5V2.8h4.8V5" fill="none" />
      <path d="M5.4 9.2a4.2 4.2 0 0 1 4.2-4.2h4.8a4.2 4.2 0 0 1 4.2 4.2v12.4H5.4z" />
      <path d="M8.4 13.2h7.2v8.4H8.4z" />
      <path d="M12 15v4.4M9.8 17.2h4.4" fill="none" />
    </g>
  ),
  bomb: (
    <g {...sticker} strokeWidth="2.4" strokeLinecap="round">
      <circle cx="10.5" cy="14" r="7" />
      <path d="M14.2 8.4l1.6-1.6 2 2-1.6 1.6" />
      <path d="M17 7.6c.6-1.6 1.8-2.6 3.4-2.8M20.6 2.4v1M22.4 4.6h-1" fill="none" />
    </g>
  ),
  /** Two bunting flags on a string: the ribbon and Credits mark (replaces the star, R-026 section 11.6). */
  pennant: (
    <g {...sticker} strokeWidth="2.4" strokeLinecap="round">
      <path d="M1.8 5.2Q12 9.4 22.2 5.2" fill="none" />
      <path d="M3.8 6.4l7 1.6-4.6 9.6z" />
      <path d="M13.2 8l7-1.6-2.4 11.2z" />
    </g>
  ),
  /**
   * The pennant on a grape surface (R-028, CREATIVE/ui/direction-b/traits/icons/ui-pennant-on-dark.svg): cream string, sun and cream
   * flags, no grape stroke. Home arena ribbon and the Credits title ribbon; the sticker pennant stays on white.
   */
  pennantOnDark: (
    <>
      <path d="M1.8 5.2Q12 9.4 22.2 5.2" fill="none" stroke="#FFF3D6" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M3.4 6.2l7.8 1.8-5.1 10.4z" fill="#FFC83D" stroke="#FFC83D" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12.8 8l7.8-1.8-2.7 12z" fill="#FFF3D6" stroke="#FFF3D6" strokeWidth="1.2" strokeLinejoin="round" />
    </>
  ),
  /** The award burst (sun fill) and the jump arrow. */
  burst: <path d="M12 1.8l2.2 5 5.2-1.7-1.8 5.1 4.8 2.5-5 2 1.4 5.3-5-1.9L12 23l-1.8-4.9-5 1.9 1.4-5.3-5-2 4.8-2.5L4.6 5.1l5.2 1.7z" fill="#FFC83D" stroke={G} strokeWidth="2" strokeLinejoin="round" />,
  jump: (
    <g fill="none" stroke={G} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3.5M7 8l5-5 5 5" />
      <path d="M5 17c2 2.5 4 2.5 7 0s5-2.5 7 0" />
      <path d="M5 21c2 2.5 4 2.5 7 0s5-2.5 7 0" opacity=".5" />
    </g>
  ),
} satisfies Record<string, ReactNode>;

const WEAPONS = {
  pistol: <path d="M4 5h26v6H16l-2 7H8l2-7H4z" fill={G} />,
  smg: <path d="M2 5h32v3h3v3h-3v1H19l-1 6h-5l1-6h-3l-1 4H6l1-4H2z" fill={G} />,
  shotgun: <path d="M1 6h38v4H16l-4 7H5l4-7H1z" fill={G} />,
  rocket: (
    <>
      <path d="M2 6h30l6 4-6 4H2z" fill={G} />
      <rect x="12" y="13" width="4" height="6" fill={G} />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;
export type WeaponName = keyof typeof WEAPONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
export const WEAPON_NAMES = Object.keys(WEAPONS) as WeaponName[];

type Props = Omit<SVGProps<SVGSVGElement>, 'name'> & { size?: number | string };

/** A UI icon. Decorative by default (aria-hidden); give the button a text label. */
export const Icon = ({ name, size, className = '', ...rest }: Props & { name: IconName }) => (
  <svg
    viewBox="0 0 24 24"
    style={size === undefined ? undefined : { width: size, height: size }}
    className={`fd-ic ${className}`}
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {ICONS[name]}
  </svg>
);

/** A weapon silhouette (the HUD chips and the KO feed). 2:1. */
export const WeaponIcon = ({ name, size, className = '', ...rest }: Props & { name: WeaponName }) => (
  <svg
    viewBox="0 0 40 20"
    className={`fd-ic ${className}`}
    style={{ width: typeof size === 'number' ? size * 2 : '2em', height: typeof size === 'number' ? size : '1em' }}
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {WEAPONS[name]}
  </svg>
);

/** The ribbon's folded tail (fill follows `fill`), pointing left; flip it with CSS for the right side. */
export const RibbonTail = ({ fill = '#E08A00', className = '', style }: { fill?: string; className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 46 52" className={className} style={style} aria-hidden="true" focusable="false">
    <path d="M2 2h42v48H2l12-24z" fill={fill} stroke={G} strokeWidth="4" strokeLinejoin="round" />
  </svg>
);

/** The sun pointer that marks the focused item of a vertical menu. */
export const Pointer = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 30 34" className={className} aria-hidden="true" focusable="false">
    <path d="M4 4 L26 17 L4 30Z" fill="#FFC83D" stroke={G} strokeWidth="4" strokeLinejoin="round" />
  </svg>
);
