'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useGamepadNav } from '~/components/menu/useGamepadNav';
import { isTouchDevice } from '~/game/input';

import { FdButton } from '../Button';
import { Confetti } from '../Confetti';
import { FD_COPY } from '../copy';
import { fighterView } from '../fighters';
import { Icon, RibbonTail, WeaponIcon } from '../Icon';
import { useSpatialNav } from '../nav';
import { Chip, Keycap, Pill } from '../parts';
import { Portrait, useFighterPortraits } from '../Portrait';
import { buildResult, slotsFor } from '../resultModel';
import { fdSound } from '../sound';
import { Frame, Stage, useReducedMotion, useStage } from '../Stage';
import { Sunburst } from '../Sunburst';

import type { CSSProperties, RefObject } from 'react';
import type { ResultFighter, ResultMode } from '../resultModel';
import type { CharacterId } from '~/game/sim/types';

/**
 * The result screen (b12-b16, spec section 4): the owner's showpiece. A reveal timeline plays on mount, `t` = 0 at the cut to
 * the result (the final KO's hit-stop has ended):
 *
 *   0.00 cut      blur and tint over the frozen match, "AND THE WINNER IS..." ribbon drops, drumroll
 *   0.30 impact   rays, starburst, winner card pops, confetti cannons (win only), party horn (kazoo on a loss)
 *   0.60          input on (REMATCH, Enter): nothing before that, so a button mashed through the KO cannot start a rematch
 *   0.75 land     title letters pop, the track slides up, the card flies onto podium 1
 *   1.05 loser    PARTICIPATION box slides in, the loser drops onto it, balloon floats up, score tiles stamp in
 *   1.40 final    the layout settles, 3 award medallions drop 200 ms apart (3 dings)
 *   2.20 choice   the buttons bounce up 60 ms apart, REMATCH is focused
 *   2.60 idle     rays turn, REMATCH bobs and shines, balloon sways, confetti thins and stops by 8 s, crowd murmur
 *
 * Enter or Space before 2.6 skips to the final layout. Reduced motion shows the final layout at once (a 300 ms fade, no
 * confetti, no idle motion). State: the match result comes in as props (ArenaGame owns the match, the rematch and the routes);
 * this component owns only the reveal step, the held stats and the hold-TAB key.
 */
const BEATS = { cut: 0, impact: 0.3, land: 0.75, loser: 1.05, final: 1.4, choice: 2.2, idle: 2.6 } as const;
const STEP_CLASS = ['r-cut', 'r-impact', 'r-land', 'r-loser', 'r-final', 'r-choice', 'r-idle'] as const;
const INPUT_AT_MS = 600;
const LAST_STEP = STEP_CLASS.length - 1;

export interface ResultScreenProps {
  mode: ResultMode;
  fighters: [ResultFighter, ResultFighter];
  winner: number | null;
  drawLine: string;
  /** The player colours (2-player), for the score tiles and the P1 / P2 chips. */
  colours?: [string, string];
  /** Tonight's tally (2-player). */
  tally?: { p1: number; p2: number };
  rematchAsked: boolean;
  /** 2-player: which players have pressed Shoot for a rematch. */
  rematchTicks?: [boolean, boolean];
  /** False online (the protocol carries no arena). */
  canNextArena: boolean;
  /** Online: who you come back as next round (CHANGE FIGHTER cycles it). */
  nextCharacter?: CharacterId;
  onRematch: () => void;
  onNextArena: () => void;
  onChangeFighter: () => void;
  onMenu: () => void;
  /** The game's invisible keyboard field: it must not steal focus from the buttons while this screen is up. */
  keyTrapRef: RefObject<HTMLInputElement | null>;
}

export const ResultScreen = (props: ResultScreenProps) => {
  const reduced = useReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="absolute inset-0 z-30" data-testid="result-screen">
      <div
        aria-hidden="true"
        className={`fd-res-bd ${on ? 'fd-on' : ''} ${props.rematchAsked ? 'fd-modal' : ''}`}
        style={reduced ? { transition: 'none' } : undefined}
      />
      <Stage>
        <ResultBody {...props} />
      </Stage>
    </div>
  );
};

/** Hold-to-show: the TAB key, a pad's View button (8) or a press on the pill. */
const useHeldStats = () => {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return;
      e.preventDefault();
      setHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Tab') setHeld(false);
    };
    const off = () => setHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    let raf = 0;
    let padHeld = false;
    const poll = () => {
      const pads = (navigator.getGamepads?.() ?? []).filter(Boolean) as Gamepad[];
      const now = pads.some((p) => p.buttons[8]?.pressed);
      if (now !== padHeld) {
        padHeld = now;
        setHeld(now);
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', off);
      cancelAnimationFrame(raf);
    };
  }, []);
  return [held, setHeld] as const;
};

const ResultBody = (p: ResultScreenProps) => {
  const { reduced, w: stageW } = useStage();
  const C = FD_COPY.result;
  const touch = useMemo(() => isTouchDevice(), []);
  useFighterPortraits(p.fighters[0].character);
  useGamepadNav(true);

  const [lossLine] = useState(() => Math.floor(Math.random() * C.lossLines.length));
  const model = useMemo(
    () => buildResult({ mode: p.mode, winner: p.winner, fighters: p.fighters, lossLine, drawLine: p.drawLine }),
    [p.mode, p.winner, p.fighters, lossLine, p.drawLine],
  );
  const { outcome } = model;
  const isDraw = outcome === 'draw';

  // ---- the reveal ----
  const [step, setStep] = useState(reduced ? LAST_STEP : 0);
  const [skipped, setSkipped] = useState(false);
  const stepRef = useRef(step);
  stepRef.current = step;
  const t0 = useRef(0);
  if (t0.current === 0 && typeof performance !== 'undefined') t0.current = performance.now();
  const timers = useRef<number[]>([]);
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const at = (seconds: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, seconds * 1000 - (performance.now() - t0.current))));
  };
  const awardCount = model.awards.length;
  useEffect(() => {
    const S = fdSound.result;
    if (reduced) {
      // The reveal collapses to its final frame: one sting, no beats.
      setStep(LAST_STEP);
      if (outcome === 'win') S.horn();
      else if (outcome === 'loss') S.wah();
      return;
    }
    S.whoosh();
    at(0.02, S.drumroll);
    at(BEATS.impact, () => {
      setStep(1);
      S.pop();
      if (outcome === 'win') S.horn();
      else if (outcome === 'loss') S.wah();
    });
    at(BEATS.land, () => {
      setStep(2);
      S.thud();
    });
    at(BEATS.loser, () => {
      setStep(3);
      if (!isDraw) S.whistle();
    });
    at(BEATS.final, () => setStep(4));
    for (let i = 0; i < awardCount; i++) at(BEATS.final + 0.2 * i, () => S.ding(i));
    at(BEATS.choice, () => {
      setStep(5);
      S.pop();
    });
    at(BEATS.choice + 0.06, S.pop);
    at(BEATS.choice + 0.12, S.pop);
    at(BEATS.idle, () => setStep(6));
    // The murmur repeats until 8 s (spec 4).
    for (const t of [2.6, 5, 7.4]) at(t, S.crowd);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  const skip = useCallback(() => {
    if (stepRef.current >= LAST_STEP) return;
    clearTimers();
    setSkipped(true);
    setStep(LAST_STEP);
  }, []);
  const inputOpen = () => reduced || performance.now() - t0.current >= INPUT_AT_MS;
  const guarded = (fn: () => void) => () => {
    if (inputOpen()) fn();
  };

  // ---- keys: Enter / Space skip the reveal; Enter with focus elsewhere is a rematch; Tab is the stats key (useHeldStats) ----
  const rootRef = useRef<HTMLDivElement>(null);
  const rematchRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [held, setHeld] = useHeldStats();
  const onRematchRef = useRef(p.onRematch);
  onRematchRef.current = p.onRematch;
  const asked = p.rematchAsked;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      if (stepRef.current < LAST_STEP) {
        e.preventDefault();
        skip();
        return;
      }
      const a = document.activeElement as HTMLElement | null;
      if (e.code === 'Enter' && !asked && !a?.closest('button, a') && inputOpen()) {
        e.preventDefault();
        onRematchRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, skip]);

  // The game's hidden keyboard field would steal focus back from the buttons: park it while the result is up.
  useEffect(() => {
    const trap = p.keyTrapRef.current;
    if (trap) {
      trap.disabled = true;
      trap.blur();
    }
    return () => {
      if (!trap) return;
      trap.disabled = false;
      if (!touch) window.setTimeout(() => trap.focus({ preventScroll: true }), 0);
    };
  }, [p.keyTrapRef, touch]);

  useSpatialNav(rootRef, { active: true, onBack: p.onMenu });
  // REMATCH takes focus when the buttons arrive; the online panel's CANCEL takes it while we wait.
  useEffect(() => {
    if (asked) cancelRef.current?.focus({ preventScroll: true });
    else if (step >= 5) rematchRef.current?.focus({ preventScroll: true });
  }, [step >= 5, asked]); // eslint-disable-line react-hooks/exhaustive-deps

  const cls = STEP_CLASS.filter((_, i) => i <= step).join(' ');
  const fa = model.winner ?? 0;
  const fb: 0 | 1 = model.winner === null ? 1 : model.loser === 0 ? 0 : 1;
  const colourOf = (i: 0 | 1) => (p.mode === 'twoPlayer' && p.colours ? p.colours[i] : fighterView(p.fighters[i].character).accent);
  const loss = outcome === 'loss';
  const balloon = loss ? '#FFB27A' : '#9AD9FF';
  const raysLight = loss ? { light: '#FFE9B0', dark: '#FFD978', opacity: 0.55 } : { light: undefined, dark: undefined, opacity: 0.8 };
  const colLeft = Math.max(0, (stageW - 1280) / 2);
  const slots = slotsFor(model.awards.length);
  const winCardRot = loss ? 2 : -2;
  const loseCardRot = loss ? -8 : 9;
  const tiles: [0, 1] = [0, 1];

  return (
    <Frame className={`fd-res-root ${cls} ${skipped ? 'r-skip' : ''} ${reduced ? 'r-reduced' : ''} ${held ? 'r-held' : ''} ${asked ? 'r-modal' : ''}`} data-outcome={outcome} data-step={step}>
      {/* behind everything: rays, then the track, then the confetti, then the content */}
      <div className="fd-res-col" style={{ left: colLeft }}>
        <div className="fd-res-rays" style={{ opacity: raysLight.opacity }}>
          <Sunburst size={1200} left={0} top={0} spin={60} light={raysLight.light} dark={raysLight.dark} />
        </div>
      </div>
      <div className="fd-res-track" />
      {outcome === 'win' && step >= 1 && <Confetti kind="cannon" burst={1} outcome="win" width={stageW} height={720} seed={3} />}
      {outcome === 'win' && step >= 6 && <Confetti kind="rain" burst={1} outcome="win" width={stageW} height={720} seed={11} />}

      <div ref={rootRef} className="fd-res-col fd-res-main" style={{ left: colLeft }} {...(asked ? { inert: true } : {})}>
        <svg className="fd-res-star" viewBox="-110 -110 220 220" aria-hidden="true">
          <polygon
            fill="#fff"
            stroke="#3B1F6B"
            strokeWidth="5"
            strokeLinejoin="round"
            points="0,-100 19,-42 74,-66 44,-15 100,0 44,15 74,66 19,42 0,100 -19,42 -74,66 -44,15 -100,0 -44,-15 -74,-66 -19,-42"
          />
        </svg>

        {!isDraw && (
          <div className="fd-ribbon fd-res-ribbon" style={{ ['--c' as string]: 'var(--grape)', ['--lo' as string]: 'var(--grape-deep)' }} aria-hidden="true">
            <RibbonTail fill="#26124A" className="fd-tail fd-l" />
            <RibbonTail fill="#26124A" className="fd-tail fd-r" />
            <span className="fd-titan" style={{ fontSize: 40, color: 'var(--sun)' }}>
              {C.andTheWinner}
            </span>
          </div>
        )}

        <h2 className="fd-res-title fd-titan fd-ol" aria-label={model.title}>
          {[...model.title].map((ch, i) => (
            <span key={i} aria-hidden="true" className="fd-res-ltr" style={{ ['--i' as string]: i }}>
              {ch}
            </span>
          ))}
        </h2>
        <Pill className="fd-res-pill" data-testid="result-pill">
          {model.pill}
        </Pill>
        {p.mode === 'twoPlayer' && p.tally && (
          <Pill className="fd-res-pill fd-tally" data-testid="tally">
            Tonight: <b style={{ color: p.colours?.[0] }}>P1</b> {p.tally.p1} – {p.tally.p2} <b style={{ color: p.colours?.[1] }}>P2</b>
          </Pill>
        )}

        <button
          type="button"
          className="fd-pill fd-res-corner fd-l"
          onClick={p.onMenu}
          aria-label={C.menu}
          data-testid="result-menu"
        >
          {!touch && <Keycap k={C.esc} />}
          {C.menu}
        </button>
        <button
          type="button"
          className="fd-pill fd-res-corner fd-r"
          aria-pressed={held}
          data-testid="result-stats-key"
          onPointerDown={() => setHeld(true)}
          onPointerUp={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
          onPointerCancel={() => setHeld(false)}
        >
          {!touch && <Keycap k={C.tab} />}
          {C.holdForStats}
        </button>

        {/* podiums */}
        {isDraw ? (
          <>
            <div className="fd-res-pod fd-draw-l" />
            <div className="fd-res-pod fd-draw-r" />
          </>
        ) : (
          <>
            <div className="fd-res-pod" data-testid="podium">
              <span className="fd-titan fd-ol">1</span>
            </div>
            <div className="fd-res-pod fd-small" data-testid="participation">
              <span>{C.participation}</span>
            </div>
          </>
        )}

        {/* the cards */}
        {isDraw ? (
          <>
            {tiles.map((i) => (
              <div
                key={i}
                className="fd-res-card fd-draw"
                style={{ left: i === 0 ? 479 : 659, ['--rot' as string]: i === 0 ? '-2deg' : '2deg' } as CSSProperties}
              >
                <Portrait id={p.fighters[i].character} w={136} h={200} head={0.64} ty={0.28} className="fd-res-face" />
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="fd-res-card fd-win" data-testid="winner-card" style={{ ['--rot' as string]: `${winCardRot}deg` } as CSSProperties}>
              <Portrait id={p.fighters[fa].character} w={136} h={200} head={0.64} ty={0.28} className="fd-res-face" />
            </div>
            <div className="fd-res-card fd-lose" data-testid="loser-card" style={{ ['--rot' as string]: `${loseCardRot}deg` } as CSSProperties}>
              <Portrait id={p.fighters[fb].character} w={74} h={112} head={0.68} ty={0.3} className="fd-res-face" />
            </div>
          </>
        )}
        {(loss || p.mode === 'twoPlayer') && model.loser !== null && (
          <Chip
            className="fd-res-you"
            color={p.mode === 'twoPlayer' ? colourOf(model.loser) : 'var(--sun)'}
            height={24}
            fontSize={12}
            data-testid="you-chip"
          >
            {p.mode === 'twoPlayer' ? `P${model.loser + 1}` : C.you}
          </Chip>
        )}
        {p.mode === 'twoPlayer' && model.winner !== null && (
          <Chip className="fd-res-chip" color={colourOf(model.winner)} style={{ left: 552, top: 178, rotate: '-6deg' }}>
            P{model.winner + 1}
          </Chip>
        )}

        {!isDraw && (
          <svg className="fd-res-balloon" viewBox="0 0 70 210" aria-hidden="true">
            <g>
              <path d="M30 62 Q44 120 22 150 Q8 175 14 206" fill="none" stroke="#3B1F6B" strokeWidth="3.5" />
              <ellipse cx="32" cy="34" rx="24" ry="28" fill={balloon} stroke="#3B1F6B" strokeWidth="4.5" />
              <path d="M27 61 l5 7 5-7z" fill={balloon} stroke="#3B1F6B" strokeWidth="3" strokeLinejoin="round" />
              <ellipse cx="24" cy="24" rx="6" ry="9" fill="#fff" opacity=".7" />
            </g>
          </svg>
        )}

        {/* the reaction frame's score tiles (b13) */}
        {!isDraw && (
          <div className="fd-res-tiles" aria-hidden="true">
            {tiles.map((i) => {
              const win = i === model.winner;
              const size = win ? 100 : 74;
              return (
                <div key={i} style={{ display: 'contents' }}>
                  {i === 1 && (
                    <span className="fd-titan fd-ol" style={{ fontSize: 44 }}>
                      –
                    </span>
                  )}
                  <div
                    className={`fd-res-tile ${win ? '' : 'fd-small'}`}
                    style={{ width: size, height: size, ['--c' as string]: win ? colourOf(i) : 'var(--gray)' }}
                  >
                    <span className={`fd-titan ${win ? 'fd-ol' : ''}`} style={{ fontSize: win ? 66 : 46, ['--o' as string]: '4px', ['--d' as string]: '5px', color: '#fff' }}>
                      {model.score[i]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* award medallions */}
        {model.awards.map((a, i) => {
          const slot = slots[i];
          if (!slot) return null;
          return (
            <div
              key={a.id}
              className="fd-res-medal"
              data-testid={`award-${a.id}`}
              style={{ left: slot.x, top: slot.y, rotate: `${slot.rot}deg`, ['--i' as string]: i, ['--c' as string]: a.colour } as CSSProperties}
            >
              <div className="fd-res-drop">
                <div className="fd-res-disc" aria-hidden="true">
                  <i />
                  {a.icon.kind === 'icon' ? <Icon name={a.icon.name} /> : <WeaponIcon name={a.icon.name} className="fd-wide" />}
                </div>
                <div className="fd-card fd-res-label">
                  <b>{a.title}</b>
                  <span>{a.line}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* the three buttons */}
        <div className="fd-res-btns">
          <div className="fd-res-b" style={{ ['--i' as string]: 0 } as CSSProperties}>
            <FdButton
              ref={rematchRef}
              tone="sun"
              height={88}
              fontSize={40}
              iconSize={36}
              icon="again"
              primary
              data-nav
              data-nav-pref
              data-testid="rematch"
              style={{ ['--o' as string]: '3px', ['--d' as string]: '4px' }}
              after={
                p.mode === 'twoPlayer' ? (
                  <span style={{ display: 'inline-flex', gap: 6 }} data-testid="rematch-ticks">
                    {[0, 1].map((i) => (
                      <Chip key={i} height={26} fontSize={12} color={p.rematchTicks?.[i] ? p.colours?.[i] : '#fff'} data-ticked={!!p.rematchTicks?.[i]}>
                        P{i + 1} {p.rematchTicks?.[i] ? '✓' : ''}
                      </Chip>
                    ))}
                  </span>
                ) : touch ? undefined : (
                  <Keycap k={C.enter} />
                )
              }
              onClick={guarded(p.onRematch)}
            >
              {C.rematch}
            </FdButton>
          </div>
          {p.canNextArena && (
            <div className="fd-res-b" style={{ ['--i' as string]: 1 } as CSSProperties}>
              <FdButton tone="sky" size="md" fontSize={22} icon="flag" data-nav data-testid="next-arena" onClick={guarded(p.onNextArena)}>
                {C.nextArena}
              </FdButton>
            </div>
          )}
          <div className="fd-res-b" style={{ ['--i' as string]: p.canNextArena ? 2 : 1 } as CSSProperties}>
            <FdButton
              tone="white"
              size="md"
              fontSize={22}
              icon="fighter"
              data-nav
              data-testid="change-fighter"
              onClick={guarded(p.onChangeFighter)}
              after={
                p.nextCharacter ? (
                  <Portrait id={p.nextCharacter} w={36} h={36} head={0.8} ty={0.5} circle className="fd-res-face" style={{ border: '3px solid var(--grape)' }} />
                ) : undefined
              }
            >
              {C.changeFighter}
            </FdButton>
          </div>
        </div>

        {/* what the screen says, for a screen reader (the visual reveal is aria-hidden) */}
        <div className="fd-sr" role="status" aria-live="polite" data-testid="result-sr">
          {model.title} {model.pill}. {model.awards.map((a) => `${a.title}: ${a.line}.`).join(' ')}
        </div>
      </div>

      {/* hold TAB: the full numbers */}
      <div className="fd-res-col" style={{ left: colLeft, pointerEvents: 'none' }}>
        <div className={`fd-card fd-res-stats ${held ? 'fd-open' : ''}`} data-testid="result-stats" aria-hidden={!held}>
          <div className="fd-row fd-head">
            <span>{C.stats.title}</span>
            {[0, 1].map((i) =>
              p.mode === 'twoPlayer' ? (
                <span key={i}>
                  <Chip height={24} fontSize={12} color={p.colours?.[i]}>
                    P{i + 1}
                  </Chip>
                </span>
              ) : (
                <span key={i}>
                  <Portrait id={p.fighters[i].character} w={38} h={38} head={0.8} ty={0.5} circle style={{ border: '3px solid var(--grape)' }} />
                </span>
              ),
            )}
          </div>
          {(
            [
              [C.stats.kos, p.fighters[0].kos, p.fighters[1].kos, ''],
              [C.stats.damage, p.fighters[0].stats.damage, p.fighters[1].stats.damage, ''],
              [C.stats.accuracy, p.fighters[0].stats.accuracy, p.fighters[1].stats.accuracy, '%'],
              [C.stats.streak, p.fighters[0].stats.bestStreak, p.fighters[1].stats.bestStreak, ''],
              [C.stats.down, p.fighters[0].stats.deaths, p.fighters[1].stats.deaths, ''],
            ] as const
          ).map(([label, a, b, unit]) => (
            <div key={label} className="fd-row">
              <span>{label}</span>
              <span>
                {a}
                {unit}
              </span>
              <span>
                {b}
                {unit}
              </span>
            </div>
          ))}
          <div style={{ height: 6 }} />
        </div>
      </div>

      {asked && <RematchPanel colLeft={colLeft} me={p.fighters[0].character} rival={p.fighters[1].character} cancelRef={cancelRef} onCancel={p.onMenu} />}
    </Frame>
  );
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** b16: online, after REMATCH. The rival's decision is not reported to us, so the right slot counts the time waited. */
const RematchPanel = ({
  colLeft,
  me,
  rival,
  cancelRef,
  onCancel,
}: {
  colLeft: number;
  me: CharacterId;
  rival: CharacterId;
  cancelRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
}) => {
  const C = FD_COPY.result.rematchOnline;
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="fd-res-col" style={{ left: colLeft, zIndex: 6 }} data-testid="rematch-panel" role="dialog" aria-label={C.title}>
      <div className="fd-panel fd-res-modal-enter" style={{ left: 340, top: 150, width: 600, height: 400 }}>
        <div className="fd-ribbon fd-rm-head" style={{ ['--c' as string]: 'var(--sun)' }}>
          <RibbonTail fill="#E08A00" className="fd-tail fd-l" />
          <RibbonTail fill="#E08A00" className="fd-tail fd-r" />
          <Icon name="again" size={30} style={{ marginRight: 12 }} />
          <span className="fd-titan fd-ol" style={{ fontSize: 36 }}>
            {C.title}
          </span>
        </div>
        <div className="fd-rm-slot" style={{ left: 36 }}>
          <Portrait id={me} w={96} h={96} head={0.8} ty={0.5} circle style={{ border: '4px solid var(--grape)' }} />
          <span className="fd-titan" style={{ fontSize: 22 }}>
            {C.you}
          </span>
          <Chip color="var(--teal)" icon="check" style={{ color: '#fff', textShadow: '0 1px 0 var(--grape)' }}>
            {C.ready}
          </Chip>
        </div>
        <div className="fd-rm-slot" style={{ right: 36 }}>
          <Portrait id={rival} w={96} h={96} head={0.8} ty={0.5} circle style={{ border: '4px solid var(--grape)' }} />
          <span className="fd-titan" style={{ fontSize: 22 }}>
            {C.rival}
          </span>
          <Chip color="var(--sun)" icon="clock" data-testid="rival-status">
            {C.deciding(clock(secs))}
          </Chip>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 302, display: 'flex', justifyContent: 'center' }}>
          <FdButton ref={cancelRef} tone="white" size="md" fontSize={22} data-nav data-testid="rematch-cancel" sound="back" onClick={onCancel} after={<Keycap k={FD_COPY.result.esc} />}>
            {C.cancel}
          </FdButton>
        </div>
      </div>
      <Pill style={{ position: 'absolute', left: '50%', top: 600, translate: '-50% 0', fontSize: 15, padding: '7px 18px 6px' }}>{C.info}</Pill>
    </div>
  );
};
