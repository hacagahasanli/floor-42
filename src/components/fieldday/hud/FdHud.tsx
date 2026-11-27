'use client';

import { useEffect, useRef, useState } from 'react';

import { useKeyLabel } from '~/components/twoPlayer/shared';
import { nameCardVisible, OFFSITE_HUD_SCRIM } from '~/game/offsiteHud';
import { RULES } from '~/game/sim/constants';

import { Confetti } from '../Confetti';
import { fighterView } from '../fighters';
import { Icon, WeaponIcon } from '../Icon';
import { Chip, HintStrip, Keycap } from '../parts';
import { Portrait } from '../Portrait';
import { capLabel } from '../screens/howToKeys';
import { Stage } from '../Stage';

import { ammoText, clock, dashLeft, GUN_ICON, GUN_NOUN, healthSegments, pushLeft, respawnFraction } from './hudMath';

import type { HudFighter, HudState } from '~/game/render/game';
import type { Bindings } from '~/game/settings';
import type { ArenaId } from '~/game/sim/constants';
import type { CSSProperties } from 'react';

/**
 * The in-match HUD in Field Day (b06, b07). A transparent overlay (it never takes the pointer): two plates in the top corners
 * (portrait, name and tag, 5-segment health, weapon / DASH / PUSH chips), the score (two accent tiles around the timer disc and a
 * FIRST TO chip), the KO feed under it, the key strip bottom-centre and, while you are down, the respawn card. All numbers come
 * from `HudState`; fighter names and colours from `fighterView` (never hard-coded).
 *
 * Layout is in design px inside a <Stage> (so it scales like every Field Day screen). Anchors: plates top-left / top-right, score
 * top-centre, strip and card bottom-centre.
 */
export interface FdHudProps {
  hud: HudState;
  arena: ArenaId;
  demo: boolean;
  tp: boolean;
  online: boolean;
  touch: boolean;
  /** The bot's level label for the rival's tag (`EASY`, `NORMAL`, `HARD`). */
  level: string;
  /** Local 2-player colours (the tiles and bars use them so a mirror match still reads). */
  colours: [string, string];
  /** The arena card under the score at the start of a match (`OFFSITE`, its line). */
  card: { title: string; line: string };
  tips: readonly string[];
  /** Settings > Accessibility > Larger HUD text: plates and score 25 % bigger. */
  large?: boolean;
  /** Settings > Key hints. */
  keyHints: boolean;
  bindings: Bindings;
  /** The first-match strip's key flashes (useKeyStrip): the keys light up as you press them. */
  lit: Record<string, boolean>;
  menuOpen: boolean;
  /** A modal (pause, 2-player key card) is up: the strip and card step aside. */
  covered: boolean;
}

const nameOf = (f: HudFighter) => fighterView(f.character);

/** One side's plate (b06). */
const Plate = ({
  side,
  f,
  tag,
  color,
  bombKey,
  large,
}: {
  large?: boolean;
  side: 'l' | 'r';
  f: HudFighter;
  tag: string;
  color: string;
  bombKey: string | null;
}) => {
  const right = side === 'r';
  const v = nameOf(f);
  const segs = healthSegments(f.hp, f.maxHp);
  const ready = (n: number) => n >= 1;
  const dash = ready(f.dash);
  const push = ready(f.push);
  const ammo = ammoText(f.mag, f.reserve);
  const edge = right ? 'right' : 'left';
  const dir: CSSProperties = right ? { flexDirection: 'row-reverse' } : {};
  return (
    <div className="fd-abs" data-testid={`plate-${side}`} data-ko={f.out || undefined} style={{ top: 14, [edge]: 18, width: 372, height: 94, transform: large ? 'scale(1.25)' : undefined, transformOrigin: right ? 'top right' : 'top left' }}>
      <Portrait
        id={f.character}
        w={58}
        h={58}
        circle
        head={0.78}
        ty={0.56}
        className="fd-portrait fd-abs"
        style={{ top: 0, [edge]: 0, width: 66, height: 66, filter: f.out ? 'grayscale(1) brightness(.9)' : undefined }}
      />
      {f.out && (
        <span
          className="fd-titan fd-abs"
          data-testid={`ko-tag-${side}`}
          style={{ top: 44, [edge]: -4, padding: '3px 8px 1px', background: 'var(--tomato)', border: '3px solid var(--grape)', borderRadius: 8, color: '#fff', fontSize: 16, transform: 'rotate(-8deg)', zIndex: 2 }}
        >
          KO
        </span>
      )}
      <div className="fd-abs" style={{ top: 2, [edge]: 80, display: 'flex', alignItems: 'center', gap: 8, ...dir }}>
        <span className="fd-titan fd-ol" style={{ fontSize: 22, ['--o' as string]: '2.5px', ['--d' as string]: '3px' }}>
          {v.name}
        </span>
        <Chip height={22} fontSize={11.5} style={{ padding: '1px 8px 0', borderWidth: 2.5 }}>
          {tag}
        </Chip>
      </div>
      <div
        className={`fd-segbar ${right ? 'fd-rtl' : ''} ${f.healing ? 'fd-heal' : ''}`}
        role="img"
        aria-label={`${v.name} health ${Math.round(f.hp)} of ${f.maxHp}`}
        style={{ position: 'absolute', top: 34, [edge]: 76, width: 290, ['--c' as string]: color, ...dir }}
      >
        {segs.map((fill, i) => (
          <i key={i}>
            <b style={{ ['--cut' as string]: `${(1 - fill) * 100}%` }} />
          </i>
        ))}
      </div>
      <div className="fd-abs" style={{ top: 68, [edge]: 80, display: 'flex', gap: 6, ...dir }}>
        <Chip height={24} fontSize={12} data-testid={`weapon-${side}`}>
          {f.reloading > 0 ? (
            'RELOADING'
          ) : (
            <>
              {GUN_NOUN[f.kind]} {ammo.main}
              {ammo.reserve && <span style={{ opacity: 0.6, marginLeft: -3 }}>{ammo.reserve}</span>}
            </>
          )}
        </Chip>
        {f.bombs > 0 && (
          <Chip height={24} fontSize={12} color="var(--tang)" data-testid="bomb-badge">
            BOMB {bombKey && <Keycap k={bombKey} style={{ minWidth: 18, height: 18, fontSize: 11, padding: '0 4px', boxShadow: '0 2px 0 var(--grape)', borderWidth: 2 }} />}
          </Chip>
        )}
        <Chip height={24} fontSize={12} color={dash ? 'var(--sun)' : 'var(--gray)'} data-testid={`dash-${side}`} data-ready={dash}>
          DASH{dash ? '' : ` ${dashLeft(f.dash)}s`}
        </Chip>
        <Chip height={24} fontSize={12} color={push ? 'var(--sun)' : 'var(--gray)'} data-testid={`push-${side}`} data-ready={push}>
          PUSH{push ? '' : ` ${pushLeft(f.push)}s`}
        </Chip>
      </div>
    </div>
  );
};

/** One score tile; it squash-pops and fires a 6-piece puff beside it each time its number goes up (never on the digit). */
const Tile = ({ side, value, color }: { side: 'l' | 'r'; value: number; color: string }) => {
  const prev = useRef(value);
  const [pops, setPops] = useState(0);
  useEffect(() => {
    if (value > prev.current) setPops((n) => n + 1);
    prev.current = value;
  }, [value]);
  const right = side === 'r';
  return (
    <>
      <div
        key={pops}
        className={`fd-tile fd-abs ${pops ? 'fd-squash' : ''}`}
        data-testid={`score-${side}`}
        style={{ [right ? 'right' : 'left']: 0, top: 6, width: 82, height: 66, ['--c' as string]: color }}
      >
        <span className="fd-titan fd-ol" data-testid="score-digit" style={{ fontSize: 44 }}>
          {value}
        </span>
      </div>
      <Confetti
        kind="puff"
        burst={pops}
        width={110}
        height={80}
        style={{ position: 'absolute', [right ? 'right' : 'left']: -118, top: -6, width: 110, height: 80, inset: 'auto', transform: right ? undefined : 'scaleX(-1)' }}
      />
    </>
  );
};

/** The KO feed toast: scorer, weapon, victim and "+1 KO", under the score for a few seconds. */
const FEED_MS = 3400;
const Feed = ({ hud, colours, tp }: { hud: HudState; colours: [string, string]; tp: boolean }) => {
  const ko = hud.lastKo;
  const at = ko?.at;
  const [shown, setShown] = useState<{ at: number; out: boolean } | null>(null);
  useEffect(() => {
    if (at === undefined) {
      setShown(null);
      return;
    }
    setShown({ at, out: false });
    const a = window.setTimeout(() => setShown((s) => (s && s.at === at ? { ...s, out: true } : s)), FEED_MS);
    const b = window.setTimeout(() => setShown((s) => (s && s.at === at ? null : s)), FEED_MS + 220);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [at]);
  if (!ko || !shown || hud.finale) return null;
  const by = hud.fighters[ko.by];
  const down = hud.fighters[ko.fighter];
  if (!by || !down) return null;
  const icon = GUN_ICON[ko.gun];
  const c = (i: number, f: HudFighter) => (tp ? colours[i] : nameOf(f).accent);
  return (
    <div className="fd-abs" style={{ left: '50%', top: 120, transform: 'translateX(-50%) rotate(-1.5deg)', zIndex: 3 }}>
      <span className={`fd-kfeed ${shown.out ? 'fd-out' : ''}`} data-testid="ko-feed" role="status">
        <span className="fd-nm" style={{ ['--c' as string]: c(ko.by, by) }}>
          {nameOf(by).name}
        </span>
        {icon ? <WeaponIcon name={icon} /> : <Icon name="burst" style={{ width: 22, height: 22 }} />}
        <span className="fd-nm" style={{ ['--c' as string]: c(ko.fighter, down) }}>
          {nameOf(down).name}
        </span>
        <Chip color="var(--sun)" height={24} fontSize={12}>
          +1 KO
        </Chip>
      </span>
    </div>
  );
};

/** The respawn card (b07): a draining ring, "BACK IN n…", who got you and with what, and a tip. */
const RespawnCard = ({ hud, tips }: { hud: HudState; tips: readonly string[] }) => {
  const left = hud.respawnIn ?? 0;
  const ko = hud.lastKo;
  const killer = ko && ko.fighter === 0 ? hud.fighters[ko.by] : null;
  const dash = 163.4;
  const tip = tips.length ? tips[hud.fighters[0].stats.deaths % tips.length] : null;
  return (
    <div className="fd-abs fd-respawn" style={{ left: '50%', bottom: 14, transform: 'translateX(-50%)' }}>
      <div
        data-testid="respawn-card"
        role="status"
        style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 24px 8px 12px', background: 'var(--paper)', border: '4px solid var(--grape)', borderRadius: 26, boxShadow: '0 7px 0 var(--grape)' }}
      >
        <div style={{ position: 'relative', width: 64, height: 64, flex: 'none' }}>
          <svg width="64" height="64" viewBox="0 0 76 76" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
            <circle cx="38" cy="38" r="33" fill="var(--sun)" stroke="#3B1F6B" strokeWidth="4" />
            <circle className="fd-ring-arc" cx="38" cy="38" r="26" fill="none" stroke="#fff" strokeWidth="7" strokeDasharray={dash} strokeDashoffset={dash * (1 - respawnFraction(left))} transform="rotate(-90 38 38)" strokeLinecap="round" />
          </svg>
          <span className="fd-titan fd-ol" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, ['--o' as string]: '2.5px', ['--d' as string]: '3px' }}>
            {Math.max(1, Math.ceil(left))}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="fd-titan" style={{ fontSize: 26, color: 'var(--grape)' }}>
            BACK IN {Math.max(1, Math.ceil(left))}…
          </span>
          {killer && ko && (
            <span style={{ font: "700 15px/1.1 'Baloo 2', sans-serif" }}>
              {nameOf(killer).name} got you with a <b style={{ color: '#C2410C' }}>{GUN_NOUN[ko.gun]}</b>
            </span>
          )}
          {tip && <span style={{ font: "600 13px/1.1 'Baloo 2', sans-serif", color: 'var(--grape-2)' }}>Tip: {tip}</span>}
        </div>
      </div>
    </div>
  );
};

export const FdHud = (p: FdHudProps) => {
  const { hud } = p;
  const label = useKeyLabel();
  const [a, b] = hud.fighters;
  const bright = p.arena !== 'office';
  const tag = (i: 0 | 1) => (p.tp ? `P${i + 1}` : i === 0 ? (p.demo ? 'BOT' : 'YOU') : p.online ? 'RIVAL' : `BOT · ${p.level.toUpperCase()}`);
  const accentOf = (i: 0 | 1) => (p.tp ? p.colours[i] : nameOf(hud.fighters[i]).accent);
  // Key caps are upper case (b06); the strip says SHIFT, not L-Shift.
  const k = (act: keyof Bindings) => capLabel(label(p.bindings[act][0] || p.bindings[act][1]));
  const kos = a.kos + b.kos;
  const down = hud.respawnIn !== null && hud.phase === 'fight' && !hud.paused && !p.demo && !p.tp;
  const matchPoint = Math.max(a.kos, b.kos) === hud.kosToWin - 1;
  const stripOn = !p.demo && !p.touch && !p.tp && p.keyHints && hud.phase !== 'over' && !p.covered;
  const stripShown = stripOn && !down && kos < 2;
  const timer = clock(hud.phase === 'countdown' ? RULES.roundSeconds : hud.time);
  // The arena card is the title card: once somebody has been KO'd the feed takes its place under the score.
  const cardOn = !p.touch && nameCardVisible(hud.phase, hud.time, RULES.roundSeconds, hud.paused, p.menuOpen) && !(hud.lastKo && hud.phase === 'fight' && !hud.paused);
  const bombKey = !p.touch && !p.tp && p.keyHints ? k('throwBomb') : null;
  const hint = hud.hint.length > 0 && p.keyHints && !stripShown && !down && !p.covered && hud.phase !== 'over';
  const key = (act: keyof Bindings, on?: boolean) => <Keycap k={k(act)} className={on ? 'fd-lit' : ''} />;
  return (
    <Stage className="fd-hud" style={{ zIndex: 4 }} testId="fd-hud">
      <div
        data-testid="hud-scrim"
        aria-hidden="true"
        className="fd-abs"
        style={{ left: 0, right: 0, top: 0, height: 120, backgroundImage: bright ? OFFSITE_HUD_SCRIM : 'linear-gradient(180deg, rgba(38,18,74,.6), rgba(38,18,74,0))' }}
      />
      <Plate side="l" f={a} tag={tag(0)} color={accentOf(0)} bombKey={bombKey} large={p.large} />
      <Plate side="r" f={b} tag={tag(1)} color={accentOf(1)} bombKey={null} large={p.large} />
      <div className="fd-abs" role="status" aria-label={`Score ${a.kos} to ${b.kos}`} style={{ left: '50%', top: 12, width: 232, height: 96, transform: `translateX(-50%)${p.large ? ' scale(1.25)' : ''}`, transformOrigin: 'top center' }}>
        <Tile side="l" value={a.kos} color={accentOf(0)} />
        <Tile side="r" value={b.kos} color={accentOf(1)} />
        <div className="fd-timer fd-abs" data-testid="hud-timer" style={{ left: '50%', top: 0, width: 78, height: 78, marginLeft: -39, zIndex: 2 }}>
          <span className="fd-titan" style={{ fontSize: 24 }}>
            {timer}
          </span>
        </div>
        <Chip color={matchPoint ? 'var(--tang)' : 'var(--sun)'} height={22} fontSize={12} style={{ position: 'absolute', left: '50%', top: 80, transform: 'translateX(-50%)', zIndex: 3 }}>
          {matchPoint ? 'MATCH POINT' : `FIRST TO ${hud.kosToWin}`}
        </Chip>
      </div>
      <Feed hud={hud} colours={p.colours} tp={p.tp} />
      <div
        className="fd-abs"
        data-testid="floor-pill"
        style={{ left: '50%', top: 120, transform: 'translateX(-50%)', opacity: cardOn ? 1 : 0, visibility: cardOn ? 'visible' : 'hidden', transition: cardOn ? 'none' : 'opacity 300ms linear, visibility 0s linear 300ms', whiteSpace: 'nowrap' }}
      >
        <span className="fd-pill" style={{ gap: 10 }}>
          <b style={{ font: "400 16px/1 'Titan One', sans-serif", color: 'var(--sun)', letterSpacing: 0.5 }}>{p.card.title}</b>
          <span style={{ fontSize: 13 }}>{p.card.line}</span>
        </span>
      </div>
      {down && <RespawnCard hud={hud} tips={p.tips} />}
      <div
        className="fd-abs fd-keystrip"
        data-testid="key-strip"
        aria-hidden={!stripShown}
        style={{ left: '50%', bottom: 14, transform: 'translateX(-50%)', opacity: stripShown ? 1 : 0 }}
      >
        <div className="fd-hints" style={{ background: 'rgba(38,18,74,.78)' }}>
          <span>
            {key('left', p.lit.left)}
            {key('right', p.lit.right)}Move
          </span>
          <span>
            {key('up', p.lit.up)}Jump
          </span>
          <span>
            {key('fire', p.lit.fire)}Shoot
          </span>
          <span>
            {key('dash')}Dash
          </span>
          <span>
            {key('push')}Push
          </span>
          <span>
            {key('pickup')}Grab gun
          </span>
          <span>
            <Keycap k="ESC" />Pause
          </span>
        </div>
      </div>
      {hint && (
        <div className="fd-abs" data-testid="hud-hint" style={{ left: '50%', ...(p.touch ? { top: 150 } : { bottom: 14 }), transform: 'translateX(-50%)' }}>
          <HintStrip items={hud.hint.map((h) => ({ keys: [p.touch && h.key === 'Space' ? 'FIRE' : h.key.toUpperCase()], label: h.text }))} />
        </div>
      )}
    </Stage>
  );
};
