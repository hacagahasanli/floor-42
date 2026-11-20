'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { readCharacter, saveCharacter, usePortraits } from '~/components/MenuShell';
import { SupportCard, SupportLink, SupportPill } from '~/components/SupportLink';
import { isTouchDevice } from '~/game/input';
import { deviceFacts, renderProfile } from '~/game/render/quality';
import { ROSTER } from '~/game/roster';
import { getSettings, primaryLabel } from '~/game/settings';
import { CHARACTERS, RULES } from '~/game/sim/constants';
import { GAME_VERSION, STUDIO_NAME } from '~/lib/studio';

import { menuSound } from './menuSound';
import { SettingsPanel } from './SettingsPanel';
import { useGamepadNav } from './useGamepadNav';
import { useSettings } from './useSettings';

import type { BotLevel } from '~/game/sim/bot';
import type { CharacterId } from '~/game/sim/types';
import type { ReactNode } from 'react';

/**
 * The first screen: a console-style main menu over the live office. The left column holds the logo and a big
 * slanted menu; behind it the fighter you picked idles on floor 42 while the camera drifts (see showcase.ts).
 * PLAY opens the fighter select in the same column, and the backdrop swaps fighter as you move through the list.
 * Keyboard: ↑/↓ move, Enter picks, Esc goes back. Gamepads drive the same keys.
 */

type Screen = 'main' | 'select' | 'howto' | 'credits';
type Rival = CharacterId | 'random';

const entryOf = (id: CharacterId) => ROSTER.find((r) => r.id === id)!;

/** Every menu screen: ↑/↓ walk the [data-nav] controls inside `root`. */
const useColumnNav = (
  root: React.RefObject<HTMLElement | null>,
  active: boolean,
  onBack: () => void,
) => {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = root.current;
      if (!el) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        onBack();
        return;
      }
      if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...el.querySelectorAll<HTMLElement>('[data-nav]')].filter(
        (n) => n.offsetParent !== null,
      );
      const current = items.findIndex(
        (n) => n === document.activeElement || n.contains(document.activeElement),
      );
      const next =
        items[
          current < 0
            ? 0
            : Math.max(0, Math.min(items.length - 1, current + (e.code === 'ArrowDown' ? 1 : -1)))
        ];
      const target = (next?.querySelector('[aria-checked="true"]') as HTMLElement | null) ?? next;
      target?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [root, active, onBack]);
};

/** The lift's floor display, counting up to 42 when the menu opens. */
const Elevator = () => {
  const [floor, setFloor] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setFloor((f) => (f >= 42 ? 42 : f + 1)), 28);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="panel-cut inline-flex items-center gap-2 bg-ink-deep/80 px-3 py-1 font-display text-sm text-gold"
      aria-label="Floor 42"
    >
      <span className={floor < 42 ? 'animate-pulse' : ''}>▲</span>
      <span className="tabular-nums">{String(floor).padStart(2, '0')}</span>
    </span>
  );
};

const Logo = ({ small }: { small?: boolean }) => (
  <div className="flex flex-col gap-1 [animation:fadeIn_0.8s_ease-out]">
    <h1 className="m-0">
      {/* The brand wordmark (public/brand/logo.svg): a fixed-ratio vector, so a plain <img> is right here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo.svg"
        alt="Floor 42"
        width={1078}
        height={270}
        className={`h-auto drop-shadow-[0_8px_30px_rgba(0,0,0,0.7)] ${small ? 'w-64' : 'w-72 sm:w-[22rem] xl:w-[26rem]'} [@media(max-height:500px)]:w-56`}
      />
    </h1>
    <span className="font-display text-sm text-cream/75 sm:text-base [@media(max-height:500px)]:hidden">
      Code review got personal.
    </span>
  </div>
);

/** One big slanted menu entry: focus slides an accent bar in, ticks, and nudges the label right. */
const MenuItem = ({
  index,
  label,
  sub,
  primary,
  accent,
  onSelect,
  href,
  autoFocus,
}: {
  index: number;
  label: string;
  sub: string;
  primary?: boolean;
  accent: string;
  onSelect?: () => void;
  href?: string;
  autoFocus?: boolean;
}) => {
  const ref = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const cls = `group relative flex w-full items-center gap-4 overflow-hidden py-2 pl-5 pr-4 text-left outline-none transition [animation:menuItemIn_0.45s_cubic-bezier(.2,.9,.2,1)_both] -skew-x-[8deg] focus-visible:bg-cream/[0.06] hover:bg-cream/[0.04] max-sm:min-h-12 max-sm:py-1 max-sm:bg-ink-deep/70 max-sm:backdrop-blur [@media(max-height:500px)]:py-1 ${
    primary ? 'sm:py-3 [@media(max-height:500px)]:py-1' : ''
  }`;
  const body = (
    <>
      {/* The accent bar slides in on focus or hover; the sweep follows it. */}
      <span
        className="absolute inset-y-0 left-0 w-1.5 origin-left scale-x-0 transition-transform duration-200 group-hover:scale-x-100 group-focus-visible:scale-x-100"
        style={{ background: accent }}
      />
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-2/3 -translate-x-full opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        style={{ background: `linear-gradient(90deg, ${accent}33, transparent)` }}
      />
      <span className="relative w-7 skew-x-[8deg] font-display text-xs text-cream/35 transition group-hover:text-cream/70 group-focus-visible:text-cream/80">
        {String(index).padStart(2, '0')}
      </span>
      <span className="relative flex skew-x-[8deg] flex-col transition-transform duration-200 group-hover:translate-x-2 group-focus-visible:translate-x-2">
        <span
          className={`font-display leading-none transition ${
            primary
              ? 'text-3xl text-gold sm:text-5xl [@media(max-height:500px)]:text-3xl'
              : 'text-lg text-cream/85 group-hover:text-cream group-focus-visible:text-cream sm:text-3xl [@media(max-height:500px)]:text-xl'
          }`}
        >
          {label}
        </span>
        <span className="mt-1 max-h-0 overflow-hidden text-xs text-cream/60 opacity-0 transition-all duration-200 group-hover:max-h-6 group-hover:opacity-100 group-focus-visible:max-h-6 group-focus-visible:opacity-100 max-sm:hidden [@media(max-height:500px)]:hidden">
          {sub}
        </span>
      </span>
      <span className="relative ml-auto skew-x-[8deg] font-display text-lg text-cream/0 transition group-hover:text-cream/70 group-focus-visible:text-gold">
        ›
      </span>
    </>
  );
  const common = {
    'data-nav': true,
    className: cls,
    style: { animationDelay: `${0.08 + index * 0.06}s` },
    onMouseEnter: () => ref.current?.focus({ preventScroll: true }),
    onFocus: () => menuSound.tick(),
  };
  return href ? (
    <Link ref={ref} href={href} {...common} onClick={() => menuSound.confirm()}>
      {body}
    </Link>
  ) : (
    <button
      ref={ref}
      type="button"
      {...common}
      onClick={() => {
        menuSound.confirm();
        onSelect?.();
      }}
    >
      {body}
    </button>
  );
};

const Bar = ({
  label,
  value,
  text,
  color,
}: {
  label: string;
  value: number;
  text: string;
  color: string;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-cream/55">
      <span>{label}</span>
      <span className="text-cream/85">{text}</span>
    </div>
    <div className="h-1.5 -skew-x-12 overflow-hidden bg-cream/10">
      <div
        className="h-full transition-all duration-500"
        style={{ width: `${Math.min(100, value * 100)}%`, background: color }}
      />
    </div>
  </div>
);

/** The fighter's nameplate, bottom right over the live scene. */
const Nameplate = ({ id, label }: { id: CharacterId; label: string }) => {
  const e = entryOf(id);
  const s = CHARACTERS[id];
  return (
    <div
      key={id}
      className="pointer-events-none flex w-80 flex-col items-end gap-2 text-right [animation:riseIn_0.4s_ease-out] max-sm:hidden [@media(max-height:500px)]:w-60"
    >
      <span className="text-sm font-semibold text-cream/70">
        {label}
      </span>
      <span
        className="-skew-x-6 font-display text-6xl leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] [@media(max-height:500px)]:text-4xl"
        style={{ color: e.accent }}
      >
        {e.name.toUpperCase()}
      </span>
      <span className="text-sm font-semibold text-cream/80">{e.role}</span>
      <div className="panel-cut mt-1 flex w-64 flex-col gap-2.5 bg-ink-deep/75 p-3 text-left backdrop-blur-sm [@media(max-height:500px)]:hidden">
        <Bar label="Speed" value={s.speed / 11} text={`${s.speed} m/s`} color="#3ec5ff" />
        <Bar
          label="Jump"
          value={s.jump / 17.5}
          text={`${s.airJumps + 1}× jump`}
          color="var(--color-green)"
        />
        <Bar
          label="Weight"
          value={s.weight / 1.4}
          text={s.weight >= 1.2 ? 'hard to shove' : s.weight <= 0.85 ? 'light' : 'average'}
          color="#ffd23f"
        />
      </div>
    </div>
  );
};

/** A side panel for How to play and Credits: same slide and Back as Settings. */
const SidePanel = ({
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

const Keycap = ({ k }: { k: string }) => (
  <kbd className="inline-flex min-w-7 items-center justify-center border border-b-2 border-cream/30 bg-cream/10 px-1.5 py-0.5 text-xs font-bold text-cream">
    {k}
  </kbd>
);

const HowTo = ({ touch }: { touch: boolean }) => {
  const s = useSettings();
  const k = (a: Parameters<typeof primaryLabel>[1]) => primaryLabel(s.bindings, a);
  const rows: [ReactNode, string][] = touch
    ? [
        ['Stick', 'Run left and right; push up to jump, down to drop through a desk'],
        ['Fire', 'Shoots; the game aims at your rival for you'],
        ['Dash', 'A burst through bullets (every 5 s)'],
        ['Push', 'Force Push: shove them into the glass'],
        ['Swap', 'Trade your gun for the one on the floor'],
      ]
    : [
        [
          <span key="m" className="flex gap-1">
            <Keycap k={k('left')} />
            <Keycap k={k('right')} />
          </span>,
          'Run',
        ],
        [<Keycap key="j" k={k('up')} />, 'Jump, double jump, kick off the glass'],
        [<Keycap key="d" k={k('down')} />, 'Drop through a desk'],
        [
          <Keycap key="f" k={k('fire')} />,
          s.aimMode === 'mouse'
            ? 'Shoot (or left click); the mouse aims'
            : 'Shoot; the game aims at your rival',
        ],
        [<Keycap key="da" k={k('dash')} />, 'Dash through bullets (every 5 s)'],
        [<Keycap key="p" k={k('push')} />, 'Force Push: shove them into the glass'],
        [<Keycap key="r" k={k('reload')} />, 'Swap for the gun on the floor'],
        [
          <span key="e" className="flex gap-1">
            <Keycap k="Esc" />
            <Keycap k="Esc" />
          </span>,
          'Pause, settings, quit',
        ],
      ];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3">
        {[
          [
            '01',
            'Two hits',
            `Two hits and you are out. First to ${RULES.kosToWin} KOs takes the merge.`,
          ],
          [
            '02',
            'Grab a gun',
            'Pistol in hand; an SMG, a shotgun, a sniper rail and rockets lie around the floor.',
          ],
          [
            '03',
            'Use the office',
            'Desks and the meeting table stop bullets. The glass breaks: push them through it.',
          ],
        ].map(([n, t, d]) => (
          <div key={n} className="panel-cut flex gap-4 bg-ink/80 p-4">
            <span className="font-display text-3xl text-gold/80">{n}</span>
            <div className="flex flex-col gap-1">
              <span className="font-display text-lg">{t}</span>
              <span className="text-sm text-cream/70">{d}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col">
        <span className="mb-2 text-[11px] font-bold uppercase tracking-[0.3em] text-gold/90">
          {touch ? 'Touch' : 'Your keys'}
        </span>
        {rows.map(([key, text], i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 border-b border-cream/5 py-2.5"
          >
            <span className="text-sm text-cream/80">{text}</span>
            <span className="shrink-0 font-display text-sm text-cream">{key}</span>
          </div>
        ))}
        {!touch && (
          <span className="mt-3 text-xs text-cream/45">Change any key in Settings → Controls.</span>
        )}
      </div>
    </div>
  );
};

const Credits = () => (
  <div className="flex flex-col gap-5 text-sm text-cream/80">
    <div className="flex items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/studio-logo.png" alt="" width={64} height={64} className="h-16 w-16" />
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
    <SupportLink className="self-start" />
  </div>
);

export const MainMenu = ({ openSelect = false }: { openSelect?: boolean }) => {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showcase = useRef<{ setCharacter: (id: CharacterId) => void } | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>(openSelect ? 'select' : 'main');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fighter, setFighter] = useState<CharacterId>('hotfix');
  const [preview, setPreview] = useState<CharacterId>('hotfix');
  const [rival, setRival] = useState<Rival>('random');
  const [level, setLevel] = useState<BotLevel>('normal');
  const [live, setLive] = useState(false);
  const [touch, setTouch] = useState(false);
  const [lastMain, setLastMain] = useState(0);
  const portraits = usePortraits();
  const pad = useGamepadNav();

  useEffect(() => {
    setTouch(isTouchDevice());
    const saved = readCharacter();
    if (saved) {
      setFighter(saved);
      setPreview(saved);
    }
  }, []);

  // The live office behind the menu, started after first paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import('~/game/render/showcase').then(({ startShowcase }) => {
          if (cancelled) return;
          const facts = deviceFacts();
          const tier = renderProfile(getSettings().get(), facts).tier;
          const s = startShowcase(canvas, readCharacter() ?? 'hotfix', {
            still: tier === 'low' && facts.touch,
            onReady: () => setLive(true),
          });
          showcase.current = s;
          dispose = s.dispose;
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      dispose?.();
      showcase.current = null;
    };
  }, []);

  useEffect(() => {
    showcase.current?.setCharacter(preview);
  }, [preview]);

  const back = () => {
    if (settingsOpen) return;
    if (screen !== 'main') {
      menuSound.back();
      setPreview(fighter);
      setScreen('main');
    }
  };
  useColumnNav(columnRef, !settingsOpen && (screen === 'main' || screen === 'select'), back);
  // Side panels (How to play, Credits): Esc closes.
  useEffect(() => {
    if (screen !== 'howto' && screen !== 'credits') return;
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickFighter = (id: CharacterId) => {
    setFighter(id);
    setPreview(id);
    saveCharacter(id);
  };

  const fight = () => {
    menuSound.confirm();
    const p2 = rival === 'random' ? '' : `&p2=${rival}`;
    router.push(`/arena?p1=${fighter}${p2}&bot=${level}`);
  };

  const accent = entryOf(preview).accent;
  const main: {
    label: string;
    sub: string;
    primary?: boolean;
    onSelect?: () => void;
    href?: string;
  }[] = [
    {
      label: 'PLAY',
      sub: `Fight the bot as ${entryOf(fighter).name}`,
      primary: true,
      onSelect: () => setScreen('select'),
    },
    { label: 'PLAY ONLINE', sub: 'Send a link, settle it 1 v 1', href: '/play' },
    {
      label: 'FIGHTER',
      sub: 'Hotfix, Legacy, Standup or Intern',
      onSelect: () => setScreen('select'),
    },
    {
      label: 'SETTINGS',
      sub: 'Controls, camera, graphics, audio',
      onSelect: () => setSettingsOpen(true),
    },
    { label: 'HOW TO PLAY', sub: 'Two hits and you are out', onSelect: () => setScreen('howto') },
    { label: 'CREDITS', sub: STUDIO_NAME, onSelect: () => setScreen('credits') },
  ];

  return (
    <main className="relative h-[100dvh] w-full select-none overflow-hidden bg-ink-deep text-cream">
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`absolute inset-0 h-full w-full transition-opacity duration-1000 ${live ? 'opacity-100' : 'opacity-0'}`}
      />
      {/* Cinematic grade: dark gradient behind the menu column, vignette, a faint scanline, the fighter's colour bleeding in. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,13,24,0.97)_0%,rgba(10,13,24,0.88)_26%,rgba(10,13,24,0.35)_46%,rgba(10,13,24,0)_64%)] max-sm:bg-[linear-gradient(180deg,rgba(10,13,24,0.7)_0%,rgba(10,13,24,0)_30%,rgba(10,13,24,0.2)_45%,rgba(10,13,24,0.95)_68%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_65%_50%,transparent_40%,rgba(5,7,14,0.75)_100%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-50 transition-[background] duration-700"
        style={{
          background: `radial-gradient(ellipse 35% 50% at 72% 70%, ${accent}22, transparent 70%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.025)_0px,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_3px)]" />

      {/* Left column (bottom sheet on a phone held upright). */}
      <div
        ref={columnRef}
        className="relative z-10 flex h-full w-full flex-col justify-between gap-4 px-5 pb-5 pt-6 sm:w-[38%] sm:min-w-[400px] sm:max-w-[540px] sm:px-10 sm:pb-8 sm:pt-10 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:px-6 [@media(max-height:500px)]:pb-3 [@media(max-height:500px)]:pt-4"
      >
        <div className="flex items-start justify-between gap-4">
          <Logo small={screen === 'select'} />
          <span className="sm:hidden">
            <Elevator />
          </span>
        </div>

        {screen !== 'select' ? (
          <nav
            aria-label="Main menu"
            className="flex flex-col gap-0.5 max-sm:mt-auto max-sm:gap-1 [@media(max-height:500px)]:gap-0"
          >
            {main.map((m, i) => (
              <MenuItem
                key={m.label}
                index={i + 1}
                accent={m.primary ? '#ffd23f' : accent}
                autoFocus={screen === 'main' && !touch && i === lastMain}
                {...m}
                onSelect={
                  m.onSelect &&
                  (() => {
                    setLastMain(i);
                    m.onSelect!();
                  })
                }
              />
            ))}
          </nav>
        ) : (
          <section
            aria-label="Choose your fighter"
            className="flex min-h-0 flex-1 flex-col justify-center gap-3 [animation:slideInLeft_0.3s_ease-out] [@media(max-height:500px)]:gap-1.5"
          >
            <div className="flex items-end justify-between">
              <h2 className="-skew-x-6 font-display text-2xl sm:text-3xl [@media(max-height:500px)]:text-lg">
                CHOOSE YOUR FIGHTER
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-widest text-cream/45 max-sm:hidden [@media(max-height:500px)]:hidden">
                same guns · two hits
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Fighter"
              className="grid gap-1.5 max-sm:grid-cols-2 [@media(max-height:500px)]:grid-cols-2"
            >
              {ROSTER.map((r, i) => {
                const on = r.id === fighter;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    data-nav
                    autoFocus={!touch && on}
                    onFocus={() => {
                      setPreview(r.id);
                      menuSound.tick();
                    }}
                    onMouseEnter={() => setPreview(r.id)}
                    onMouseLeave={() => setPreview(fighter)}
                    onClick={() => {
                      pickFighter(r.id);
                      menuSound.confirm();
                    }}
                    className={`group relative flex h-16 -skew-x-[8deg] items-center gap-3 overflow-hidden border-l-4 pl-3 pr-3 text-left outline-none transition [animation:menuItemIn_0.4s_ease-out_both] focus-visible:bg-cream/10 sm:h-[4.5rem] [@media(max-height:500px)]:h-12 ${
                      on ? 'bg-cream/[0.09]' : 'bg-ink-deep/60 hover:bg-cream/[0.05]'
                    }`}
                    style={{
                      borderColor: on ? r.accent : 'transparent',
                      animationDelay: `${i * 0.05}s`,
                    }}
                  >
                    <span
                      className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
                      style={{
                        background: `linear-gradient(90deg, ${r.accent}30, transparent 70%)`,
                      }}
                    />
                    {portraits ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={portraits[r.id]}
                        alt=""
                        className="relative h-full w-12 skew-x-[8deg] object-contain object-bottom sm:w-14"
                      />
                    ) : (
                      <span className="w-12 sm:w-14" />
                    )}
                    <span className="relative flex skew-x-[8deg] flex-col">
                      <span
                        className="font-display text-xl leading-none sm:text-2xl [@media(max-height:500px)]:text-base"
                        style={{ color: r.accent }}
                      >
                        {r.name.toUpperCase()}
                      </span>
                      <span className="text-xs text-cream/60 max-sm:hidden [@media(max-height:500px)]:hidden">
                        {r.role}
                      </span>
                    </span>
                    {on && (
                      <span className="relative ml-auto skew-x-[8deg] text-[10px] font-bold tracking-widest text-gold max-sm:hidden [@media(max-height:500px)]:hidden">
                        PICKED
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div data-nav className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-cream/50">
                Rival
              </span>
              <ChoiceRow<Rival>
                label="Rival"
                value={rival}
                onChange={setRival}
                options={[
                  { id: 'random', label: 'Random' },
                  ...ROSTER.map((r) => ({ id: r.id as Rival, label: r.name })),
                ]}
              />
            </div>
            <div data-nav className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-cream/50">
                Bot
              </span>
              <ChoiceRow<BotLevel>
                label="Bot difficulty"
                value={level}
                onChange={setLevel}
                options={[
                  { id: 'easy', label: 'Easy' },
                  { id: 'normal', label: 'Normal' },
                  { id: 'hard', label: 'Hard' },
                ]}
              />
            </div>
            <div className="mt-1 flex items-stretch gap-2">
              <button
                type="button"
                data-nav
                onFocus={() => menuSound.tick()}
                onClick={fight}
                className="focus-ring group flex flex-1 -skew-x-[8deg] items-center justify-center gap-3 bg-gold px-6 py-3.5 font-display text-2xl text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.35)] transition hover:brightness-110 [@media(max-height:500px)]:py-2 [@media(max-height:500px)]:text-lg"
              >
                <span className="skew-x-[8deg]">
                  FIGHT AS {CHARACTERS[fighter].name.toUpperCase()}
                </span>
                <span className="skew-x-[8deg] transition group-hover:translate-x-1">→</span>
              </button>
              <button
                type="button"
                data-nav
                onClick={back}
                aria-label="Back"
                className="focus-ring -skew-x-[8deg] bg-cream/10 px-4 text-sm font-bold uppercase tracking-wider hover:bg-cream/20"
              >
                <span className="inline-block skew-x-[8deg]">Back</span>
              </button>
            </div>
          </section>
        )}

        <footer className="flex items-end justify-between gap-3 text-xs font-medium text-cream/45 [@media(max-height:500px)]:hidden">
          <span>
            {STUDIO_NAME} · v{GAME_VERSION}
          </span>
        </footer>
      </div>

      {/* Buy us a coffee: a card under the lift display on wide screens, a pill on phones; never over the menu itself. */}
      {screen !== 'select' && (
        <>
          <div className="absolute right-6 top-20 z-20 hidden sm:right-10 sm:top-24 sm:block [@media(max-height:500px)]:hidden">
            <SupportCard />
          </div>
          <div className="absolute left-5 top-[124px] z-20 sm:hidden">
            <SupportPill />
          </div>
          <div className="absolute right-[120px] top-4 z-20 hidden [@media(max-height:500px)]:sm:block">
            <SupportPill />
          </div>
        </>
      )}

      {/* Right side: the lift display, the fighter nameplate and the control hints. */}
      <div className="pointer-events-none absolute right-6 top-6 z-10 max-sm:hidden sm:right-10 sm:top-10 [@media(max-height:500px)]:top-4">
        <Elevator />
      </div>
      <div className="pointer-events-none absolute bottom-16 right-6 z-10 sm:right-10 [@media(max-height:500px)]:bottom-10">
        <Nameplate
          id={preview}
          label={screen === 'select' && preview !== fighter ? 'Preview' : 'Your fighter'}
        />
      </div>
      <div className="pointer-events-none absolute bottom-5 right-6 z-10 flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-cream/55 max-sm:hidden sm:right-10 [@media(max-height:500px)]:bottom-2">
        {(pad
          ? [
              ['✚', 'Move'],
              ['A', 'Select'],
              ['B', 'Back'],
            ]
          : [
              ['↑↓', 'Move'],
              ['Enter', 'Select'],
              ['Esc', 'Back'],
            ]
        ).map(([k, t]) => (
          <span key={t} className="flex items-center gap-1.5">
            <kbd
              className={`inline-flex h-5 min-w-5 items-center justify-center border border-cream/30 bg-cream/10 px-1 text-cream ${pad ? 'rounded-full' : ''}`}
            >
              {k}
            </kbd>
            {t}
          </span>
        ))}
      </div>

      {settingsOpen && (
        <SettingsPanel
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
      {screen === 'howto' && (
        <SidePanel title="HOW TO PLAY" kicker="Floor 42 · the rules" onClose={back}>
          <HowTo touch={touch} />
        </SidePanel>
      )}
      {screen === 'credits' && (
        <SidePanel title="CREDITS" kicker={`Floor 42 · ${STUDIO_NAME}`} onClose={back}>
          <Credits />
        </SidePanel>
      )}
    </main>
  );
};

/** A row of slanted chips (rival, difficulty); ←/→ change it. */
const ChoiceRow = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) => (
  <div
    role="radiogroup"
    aria-label={label}
    className="flex flex-wrap gap-1"
    onKeyDown={(e) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
      e.preventDefault();
      const i = options.findIndex((o) => o.id === value);
      const next =
        options[(i + (e.code === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
      onChange(next.id);
      menuSound.tick();
      (e.currentTarget.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus();
    }}
  >
    {options.map((o) => {
      const on = o.id === value;
      return (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={on}
          data-id={o.id}
          tabIndex={on ? 0 : -1}
          onClick={() => {
            onChange(o.id);
            menuSound.tick();
          }}
          className={`focus-ring -skew-x-12 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition [@media(max-height:500px)]:py-1 ${on ? 'bg-gold text-ink-deep' : 'bg-ink-deep/70 text-cream/70 hover:bg-cream/10 hover:text-cream'}`}
        >
          <span className="inline-block skew-x-12">{o.label}</span>
        </button>
      );
    })}
  </div>
);
