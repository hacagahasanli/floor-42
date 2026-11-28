'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { reducedMotion } from '~/components/Elevator';
import { FD_COPY } from '~/components/fieldday/copy';
import { fighterView } from '~/components/fieldday/fighters';
import { Icon } from '~/components/fieldday/Icon';
import { Pill, Ribbon } from '~/components/fieldday/parts';
import { Stage, useStage } from '~/components/fieldday/Stage';
import { Sunburst } from '~/components/fieldday/Sunburst';
import { menuSound } from '~/components/menu/menuSound';
import { ARENA_COPY } from '~/game/arenaChoice';
import { doorPortrait, ensureDoorPortraits } from '~/components/vsPortraits';
import { getSettings } from '~/game/settings';
import { DEFAULT_ARENA, RULES } from '~/game/sim/constants';

import type { BotLevel } from '~/game/sim/bot';
import type { ArenaId } from '~/game/sim/constants';
import type { CharacterId } from '~/game/sim/types';

/**
 * The VS doors (R-013 4.4) in Field Day (b05): two doors in the fighters' colours close along a slanted grape seam (14 px, a 4 px
 * white core, about 10 degrees) with the fighters on them (left = P1 / YOU, right = the rival), a sun VS medallion tilted -6 degrees
 * on turning rays, the arena ribbon on top, each name (66 px) with a role pill, and FIRST TO n. The timing and flow are the old ones:
 * close, the VS lands, the match loads (the counter still runs, for the progress and the screen-reader label), ding, open. DOM only.
 *
 * The same picture is drawn twice: by the menu while the doors slide in (`useVsTo`), then by the arena (`VsRun`) while
 * the match loads, which carries on from the menu's clock so nothing restarts between the two.
 */

export interface VsInfo {
  p1: CharacterId;
  p2: CharacterId;
  tag1: string;
  tag2: string;
  /** Match length shown on the bottom line. */
  kosToWin: number;
  /** The arena the ribbon names (default: the default arena). */
  arena?: ArenaId;
}

/**
 * The corner tags: a 1-player match is YOU against the bot at its level; 2-player is P1 and P2; an online match against a
 * person is YOU and RIVAL (R-032 4; an online bot match is '1p': it says BOT).
 */
export const vsTags = (kind: '1p' | '2p' | 'online', level: BotLevel = 'normal'): [string, string] =>
  kind === '2p' ? ['P1', 'P2'] : kind === 'online' ? ['YOU', 'RIVAL'] : ['YOU', `BOT · ${level.toUpperCase()}`];

/** The menu's clock for the doors, so the arena's `VsRun` continues the same timeline (and does not slam twice). */
let clock: { t0: number; slammed: boolean } | null = null;
const takeClock = () => {
  const c = clock && performance.now() - clock.t0 < 4000 ? clock : null;
  clock = null;
  return c;
};

const kick = (from: HTMLElement | null) => {
  if (reducedMotion() || !getSettings().get().shake) return;
  const el = from?.closest<HTMLElement>('[data-kick-root]') ?? from;
  if (!el) return;
  el.classList.remove('f42-kick');
  void el.offsetWidth;
  el.classList.add('f42-kick');
  window.setTimeout(() => el.classList.remove('f42-kick'), 180);
};

const usePortraitTick = (ids: CharacterId[]) => {
  const [, bump] = useState(0);
  const key = ids.join();
  useEffect(() => {
    let on = true;
    void ensureDoorPortraits(ids).then(() => on && bump((n) => n + 1));
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
};

/** The door colour: the fighter's accent, a touch deeper so the white names and the VS medallion pop (b05 uses #DD5F3B for #FF6A3D). */
const doorColour = (accent: string) => `color-mix(in srgb, ${accent} 88%, #26124a)`;

/** One door: a full-screen layer clipped to its side of the seam, with its fighter and its name; closing, the two meet exactly at the seam. */
const Half = ({ side, id, tag, shut, phase, sk }: { side: 'l' | 'r'; id: CharacterId; tag: string; shut?: number; phase: 'closing' | 'closed' | 'opening'; sk: number }) => {
  const left = side === 'l';
  const v = fighterView(id);
  const src = doorPortrait(id);
  return (
    <div
      className={`fd-vs-door fd-${side} ${phase === 'closing' ? 'fd-close' : phase === 'opening' ? 'fd-open' : ''}`}
      data-vs-side={side}
      style={{ background: doorColour(v.accent), ['--sk' as string]: `${sk}px`, ...(shut ? { ['--vs-close' as string]: `${shut}ms` } : null) }}
    >
      {/* The fighter faces the seam; the right one is mirrored. */}
      <div className="fd-abs" style={{ [left ? 'left' : 'right']: '4%', bottom: '-1%', height: '86%', aspectRatio: '360 / 440', transform: left ? undefined : 'scaleX(-1)' }}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="fd-vs-fighter" draggable={false} style={{ height: '100%', width: '100%', objectFit: 'contain', objectPosition: left ? 'right bottom' : 'right bottom' }} />
        )}
      </div>
      <div className="fd-abs" style={{ [left ? 'left' : 'right']: 36, bottom: 40, display: 'flex', flexDirection: 'column', alignItems: left ? 'flex-start' : 'flex-end', gap: 10 }}>
        <span className="fd-titan fd-ol" style={{ fontSize: 66, whiteSpace: 'nowrap', ['--o' as string]: '4.5px', ['--d' as string]: '6px' }}>
          {v.name}
        </span>
        <Pill style={{ fontSize: 15 }} data-testid={`vs-tag-${side}`}>
          {v.role} · {tag}
        </Pill>
      </div>
    </div>
  );
};

/**
 * Everything on the VS screen, in one Stage. `stampOn`: the VS medallion and its rays have landed. The ribbon and the "first to"
 * pill show while the doors are shut and leave as they open. Reduced motion: the doors do not slide (a 120 ms fade, see CSS).
 */
const VsStage = ({ info, phase, shut, stampOn, note }: { info: VsInfo; phase: 'closing' | 'closed' | 'opening'; shut?: number; stampOn: boolean; note?: string }) => {
  usePortraitTick([info.p1, info.p2]);
  const opening = phase === 'opening';
  return (
    <Stage testId="vs-stage">
      <VsInner info={info} phase={phase} shut={shut} stampOn={stampOn} opening={opening} note={note} />
    </Stage>
  );
};

const VsInner = ({ info, phase, shut, stampOn, opening, note }: { info: VsInfo; phase: 'closing' | 'closed' | 'opening'; shut?: number; stampOn: boolean; opening: boolean; note?: string }) => {
  const { h, s } = useStage();
  // The seam leans 10 degrees: half the stage height times tan(10).
  const sk = Math.round(h * 0.0881);
  return (
    <>
      <Half side="l" id={info.p1} tag={info.tag1} shut={shut} phase={phase} sk={sk} />
      <Half side="r" id={info.p2} tag={info.tag2} shut={shut} phase={phase} sk={sk} />
      <div
        aria-hidden="true"
        className="fd-vs-seam"
        style={{ ['--s' as string]: 1, opacity: opening ? 0 : 1, transition: 'opacity 120ms linear', animation: phase === 'closing' ? `fd-fade ${shut ?? 220}ms steps(1, end) both` : undefined }}
        data-s={s}
      />
      {!opening && (
        <>
          <div className="fd-abs" style={{ left: '50%', top: 24, transform: 'translateX(-50%)', animation: 'fd-fade 200ms linear both' }}>
            <Ribbon height={56} tilt={0}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }} data-testid="vs-arena">
                <Icon name="flagOnDark" size={24} />
                {ARENA_COPY[info.arena ?? DEFAULT_ARENA].name}
              </span>
            </Ribbon>
          </div>
          <div className="fd-abs" style={{ left: '50%', bottom: 22, transform: 'translateX(-50%)', animation: 'fd-fade 200ms linear both' }}>
            <Pill style={{ fontSize: 15, letterSpacing: 1.5 }}>{FD_COPY.twoPlayer.firstTo(info.kosToWin || RULES.kosToWin)}</Pill>
          </div>
          {/* R-032 4: online, the first frame is late (the doors have been shut 4 s): one honest line, no tips, no percentage. */}
          {note && (
            <div className="fd-abs" style={{ left: '50%', bottom: 62, transform: 'translateX(-50%)', animation: 'fd-fade 200ms linear both' }} data-testid="vs-note">
              <Pill style={{ fontSize: 14 }}>{note}</Pill>
            </div>
          )}
        </>
      )}
      {stampOn && !opening && (
        <>
          <Sunburst size={420} spin={20} light="#FFE38A" dark="#FFF3D6" opacity={0.9} style={{ left: '50%', top: '50%', marginLeft: -210, marginTop: -210 }} />
          <div
            className="fd-abs fd-vs-pop"
            data-testid="vs-medallion"
            style={{
              left: '50%',
              top: '50%',
              width: 200,
              height: 200,
              marginLeft: -100,
              marginTop: -100,
              borderRadius: '50%',
              background: 'var(--sun)',
              border: '6px solid var(--grape)',
              boxShadow: 'inset 0 -12px 0 var(--sun-lo), 0 10px 0 var(--grape)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              rotate: '-6deg',
            }}
          >
            <span className="fd-titan fd-ol" style={{ fontSize: 92, marginTop: -6, ['--o' as string]: '5px', ['--d' as string]: '7px' }}>
              VS
            </span>
          </div>
        </>
      )}
    </>
  );
};

/** The two door halves with the seam, VS and names (what the menu shows while the doors slide in). */
export const VsDoors = ({ info, phase, shut, stampOn = false, note }: { info: VsInfo; phase: 'closing' | 'closed' | 'opening'; shut?: number; stampOn?: boolean; note?: string }) => (
  <VsStage info={info} phase={phase} shut={shut} stampOn={stampOn} note={note} />
);

/**
 * `useVsTo` without a route change: the doors close over the current page and `then` runs when they are shut (the online lobby
 * mounts the arena in place, whose `VsRun` carries on from this clock). Returns the doors to render while they close.
 */
export const useVsInline = () => {
  const [info, setInfo] = useState<VsInfo | null>(null);
  const busy = useRef(false);
  const go = useCallback((next: VsInfo, then: () => void) => {
    if (busy.current) return;
    busy.current = true;
    const slide = reducedMotion() ? 0 : 220;
    clock = { t0: performance.now(), slammed: false };
    setInfo(next);
    window.setTimeout(() => {
      if (clock) clock.slammed = true;
      menuSound.doorSlam();
      then();
      busy.current = false;
      setInfo(null);
    }, slide);
  }, []);
  const doors = info ? (
    <div aria-hidden className="f42-vs-root fixed inset-0 z-[90] overflow-hidden">
      <VsDoors info={info} phase={reducedMotion() ? 'closed' : 'closing'} />
    </div>
  ) : null;
  return { go, doors };
};

/** The menu side: the doors slide in over the menu, then the page moves to the arena, whose `VsRun` carries on. */
export const useVsTo = () => {
  const router = useRouter();
  const [info, setInfo] = useState<VsInfo | null>(null);
  const busy = useRef(false);
  const go = useCallback(
    (href: string, next: VsInfo) => {
      if (busy.current) return;
      busy.current = true;
      router.prefetch(href);
      const slide = reducedMotion() ? 0 : 220;
      clock = { t0: performance.now(), slammed: false };
      setInfo(next);
      window.setTimeout(() => {
        if (clock) clock.slammed = true;
        menuSound.doorSlam();
        router.push(href);
      }, slide);
    },
    [router],
  );
  const doors = info ? (
    <div aria-hidden className="f42-vs-root fixed inset-0 z-[90] overflow-hidden">
      <VsDoors info={info} phase={reducedMotion() ? 'closed' : 'closing'} />
    </div>
  ) : null;
  return { go, doors, busy: info !== null };
};

const MIN_SKIP = 700;

/**
 * The arena side: doors shut, VS stamp, counter, ding, open. `mode: 'load'` is the first start (waits for `progress` to
 * reach 1, i.e. the match is really loaded); `'rematch'` is the short tempo (close 180, VS 200, open 900, no loading).
 * `onShut` fires when the doors are closed (the rematch restarts the match behind them); `onDone` when they are open.
 */
export const VsRun = ({
  info,
  mode,
  progress,
  onShut,
  onDone,
  syncNote,
}: {
  info: VsInfo;
  mode: 'load' | 'rematch';
  /** Online: shown under FIRST TO when the doors have been shut 4 s and the match is still not ready. */
  syncNote?: string;
  /** 0..1, the share of loading steps done; 1 when the match is ready to show. */
  progress: number;
  onShut?: () => void;
  onDone: () => void;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const cfg = mode === 'load' ? { close: 220, stamp: 260, land: 1100 } : { close: 180, stamp: 200, land: 740 };
  const [phase, setPhase] = useState<'closing' | 'closed' | 'opening'>(() => (mode === 'rematch' && !reducedMotion() ? 'closing' : 'closed'));
  const [stampOn, setStampOn] = useState(false);
  const [floor, setFloor] = useState(1);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!syncNote) return;
    const t = window.setTimeout(() => setLate(progressRef.current < 1), 4000);
    return () => window.clearTimeout(t);
  }, [syncNote]);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const cb = useRef({ onShut, onDone });
  cb.current = { onShut, onDone };

  useEffect(() => {
    const reduced = reducedMotion();
    const carried = mode === 'load' ? takeClock() : null;
    const t0 = carried?.t0 ?? performance.now();
    const elapsed = () => performance.now() - t0;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, ms - elapsed())));
    // A rematch slides in from open (initial phase); a first start from the menu is already shut, a direct load shows them shut.
    if (!carried?.slammed) {
      at(cfg.close, () => {
        menuSound.doorSlam();
        kick(rootRef.current);
      });
    }
    at(cfg.close, () => cb.current.onShut?.());
    at(cfg.stamp, () => setStampOn(true));

    let landed = false;
    let opened = false;
    let floorNow = 1;
    let lastTick = 0;
    const holdMin = reduced ? 900 : cfg.land;
    const open = () => {
      if (opened) return;
      opened = true;
      menuSound.whoosh();
      setPhase('opening');
      timers.push(window.setTimeout(() => cb.current.onDone(), reduced ? 200 : 300));
    };
    const land = (skip: boolean) => {
      if (landed) return;
      landed = true;
      floorNow = 42;
      setFloor(42);
      menuSound.liftDing();
      if (skip) open();
      else timers.push(window.setTimeout(open, reduced ? 200 : 160));
    };
    const tick = window.setInterval(() => {
      if (landed) return;
      const e = elapsed();
      const ready = progressRef.current >= 1;
      if (ready && e >= holdMin) {
        land(false);
        return;
      }
      // The counter races by the clock to floor 41 and waits there if the match is still loading; 42 comes with the ding.
      const byClock = Math.round(41 * Math.min(1, Math.max(0, (e - cfg.stamp) / (cfg.land - cfg.stamp))));
      const next = Math.max(floorNow, Math.min(41, byClock));
      if (next !== floorNow) {
        floorNow = next;
        setFloor(next);
        const now = performance.now();
        if (now - lastTick >= 70) {
          lastTick = now;
          menuSound.floorTick(next);
        }
      }
    }, 30);
    // A key or click skips to the open once the doors have held a moment and the match is ready.
    const skip = () => {
      if (!landed && elapsed() >= MIN_SKIP && progressRef.current >= 1) land(true);
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearInterval(tick);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
    // One run per mount: the props that matter are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeMs = mode === 'rematch' ? 180 : undefined;
  return (
    <div
      ref={rootRef}
      className="f42-vs-root pointer-events-auto fixed inset-0 z-[90] overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={`Loading the match, ${Math.round(floor * (100 / 42))}%`}
      data-testid="vs-doors"
      data-phase={phase}
      data-floor={floor}
    >
      <VsDoors info={info} phase={phase} shut={closeMs} stampOn={stampOn} note={late && progress < 1 ? syncNote : undefined} />
      {/* The old floor counter stays as a hidden readout, so tests and the screen-reader label keep a number to follow. */}
      <span className="sr-only" data-testid="vs-floor">
        {String(floor).padStart(2, '0')}
      </span>
    </div>
  );
};
