'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { reducedMotion } from '~/components/Elevator';
import { menuSound } from '~/components/menu/menuSound';
import { useCopy } from '~/components/menu/useCopy';
import { Stamp } from '~/components/Stamp';
import { doorPortrait, ensureDoorPortraits } from '~/components/vsPortraits';
import { ROSTER } from '~/game/roster';
import { getSettings } from '~/game/settings';
import { RULES } from '~/game/sim/constants';

import type { BotLevel } from '~/game/sim/bot';
import type { CharacterId } from '~/game/sim/types';

/**
 * The VS doors (R-013 4.4): the lift doors close with the two fighters painted on them (left = P1 / YOU, right = the
 * rival), a VS stamp on the seam, the floor counter racing to 42 while the match loads, a ding, and the doors open on the
 * arena. Reuses the lift's door, seam and counter pieces (Elevator.tsx, globals.css `f42-door*`). DOM only: no draw calls.
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
}

/** The corner tags: a 1-player match is YOU against the bot at its level; 2-player is P1 and P2. */
export const vsTags = (kind: '1p' | '2p', level: BotLevel = 'normal'): [string, string] =>
  kind === '2p' ? ['P1', 'P2'] : ['YOU', `BOT · ${level.toUpperCase()}`];

const accentOf = (id: CharacterId) => ROSTER.find((r) => r.id === id)?.accent ?? '#ffd23f';

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

/** One door: the accent slab, the fighter facing the seam, and the name with its tag, bottom outer corner. */
const Half = ({ side, id, tag, role }: { side: 'l' | 'r'; id: CharacterId; tag: string; role: string }) => {
  const left = side === 'l';
  const accent = accentOf(id);
  const src = doorPortrait(id);
  const name = ROSTER.find((r) => r.id === id)?.name.toUpperCase() ?? id;
  return (
    <div className="absolute inset-0 overflow-hidden" data-vs-side={side}>
      {/* The slab: the result screen's slanted colour block, tight to the seam. */}
      <div
        className="absolute inset-y-[-2px] w-[62%]"
        style={{
          [left ? 'right' : 'left']: '-6%',
          background: `${accent}d9`,
          border: '4px solid #0a0d18',
          transform: `skewX(${left ? -8 : 8}deg)`,
        }}
      />
      {/* The fighter, facing the seam; the right one is mirrored. */}
      <div
        className="absolute bottom-0 flex items-end"
        style={{ height: '78vh', [left ? 'right' : 'left']: '4%', transform: left ? undefined : 'scaleX(-1)' }}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="f42-vs-portrait h-full w-auto max-w-none" draggable={false} />
        )}
      </div>
      <div
        className={`absolute flex flex-col gap-1 ${left ? 'items-start' : 'items-end'}`}
        style={{ bottom: 56, [left ? 'left' : 'right']: 48 }}
      >
        <Stamp size="lg" colour="#e6ebf5" rot={left ? -4 : 4} silent noKick>
          {name}
        </Stamp>
        <span className="text-[18px] font-semibold text-cream/75" data-testid={`vs-tag-${side}`}>
          {role} · {tag}
        </span>
      </div>
    </div>
  );
};

/** The two door halves with the seam light. `closing` slides them in, `opening` out; `closed` is a static shut state. */
export const VsDoors = ({ info, phase, shut }: { info: VsInfo; phase: 'closing' | 'closed' | 'opening'; shut?: number }) => {
  const copy = useCopy();
  usePortraitTick([info.p1, info.p2]);
  const anim = phase === 'closing' ? 'f42-door-close' : phase === 'opening' ? 'f42-door-open' : '';
  const style = shut ? ({ '--vs-close': `${shut}ms` } as React.CSSProperties) : undefined;
  return (
    <>
      <div className={`f42-door f42-door-vs f42-door-l ${anim}`} style={{ ...style, top: -10, bottom: -10 }}>
        <Half side="l" id={info.p1} tag={info.tag1} role={copy.fighters[info.p1].role} />
      </div>
      <div className={`f42-door f42-door-vs f42-door-r ${anim}`} style={{ ...style, top: -10, bottom: -10 }}>
        <Half side="r" id={info.p2} tag={info.tag2} role={copy.fighters[info.p2].role} />
      </div>
      <div className={`f42-seam ${anim}`} />
    </>
  );
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
}: {
  info: VsInfo;
  mode: 'load' | 'rematch';
  /** 0..1, the share of loading steps done; 1 when the match is ready to show. */
  progress: number;
  onShut?: () => void;
  onDone: () => void;
}) => {
  const copy = useCopy();
  const rootRef = useRef<HTMLDivElement>(null);
  const cfg = mode === 'load' ? { close: 220, stamp: 260, land: 1100 } : { close: 180, stamp: 200, land: 740 };
  const [phase, setPhase] = useState<'closing' | 'closed' | 'opening'>(() => (mode === 'rematch' && !reducedMotion() ? 'closing' : 'closed'));
  const [stampOn, setStampOn] = useState(false);
  const [floor, setFloor] = useState(1);
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

  const opening = phase === 'opening';
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
    >
      <VsDoors info={info} phase={phase} shut={closeMs} />
      {!opening && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
            <div className="f42-vs-plate flex w-[min(260px,40vw)] flex-col items-center gap-2" style={{ animationDelay: `${cfg.close}ms` }}>
              <div className="flex items-center gap-3 border border-gold/40 bg-ink-deep px-5 py-2 shadow-[0_0_40px_rgba(255,210,63,0.18)]">
                <span className={`text-xl text-gold ${floor < 42 ? 'f42-blink' : ''}`}>▲</span>
                <span className="font-display text-[32px] leading-none tabular-nums text-gold" data-testid="vs-floor">
                  {String(floor).padStart(2, '0')}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden bg-cream/10">
                <div className="h-full bg-[linear-gradient(90deg,#ff3b4e,#ffd23f)] transition-[width] duration-200" style={{ width: `${(100 * floor) / 42}%` }} />
              </div>
            </div>
          </div>
          <div
            className="f42-vs-plate pointer-events-none absolute inset-x-0 bottom-6 text-center font-display text-[18px] tracking-wide text-cream/70"
            style={{ animationDelay: `${cfg.close}ms` }}
          >
            {copy.vsFirstTo.replace('{n}', String(info.kosToWin || RULES.kosToWin))}
          </div>
        </>
      )}
      {stampOn && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: '46%', transform: 'translateY(-50%)' }}>
          <Stamp size="xl" plate rot={-6} leaving={opening}>
            VS
          </Stamp>
        </div>
      )}
    </div>
  );
};
