'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { PORTAL_BUILD, resolveVariant } from '~/game/copy';
import { isTouchDevice } from '~/game/input';
import { deviceFacts, resolveTier } from '~/game/render/quality';
import { ACTIONS, getSettings, keyLabel, unboundActions } from '~/game/settings';

import { useKeyLabel, usePlayerColours, PlayerChip } from '~/components/twoPlayer/shared';
import { ACTIONS_2P, unbound2P } from '~/game/twoPlayer';

import { CreditsPanel } from './Credits';
import { menuSound } from './menuSound';
import { useSettings } from './useSettings';

import type { CopyVariant } from '~/game/copy';
import type { Button } from '~/game/input';
import type { Quality } from '~/game/settings';
import type { Action2P, Player } from '~/game/twoPlayer';
import type { ReactNode } from 'react';

/**
 * Settings, as one panel that slides in from the left: the main menu and the in-game pause menu both open it.
 * Five tabs; every change is saved and applied at once. Keyboard: ↑/↓ move, ←/→ change, [ / ] or Q / E switch tabs,
 * Esc goes back. Gamepads drive the same keys (see useGamepadNav).
 */

export type SettingsTab = 'controls' | 'camera' | 'graphics' | 'audio' | 'access';
const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'camera', label: 'Camera' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'audio', label: 'Audio' },
  { id: 'access', label: 'Accessibility' },
];

/** True while a key cell waits for a key: the panel's own shortcuts stand aside. */
let rebinding = false;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex="0"]';

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="group flex flex-col gap-2 border-b border-cream/5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
    <div className="flex min-w-0 flex-col">
      <span className="text-sm font-bold uppercase tracking-wider text-cream">{label}</span>
      {hint && <span className="text-xs text-cream/50">{hint}</span>}
    </div>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </div>
);

const Section = ({ title }: { title: string }) => (
  <div className="mt-5 flex items-center gap-3 first:mt-0">
    <span className="h-3 w-1 -skew-x-12 bg-gold" />
    <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold/90">{title}</span>
    <span className="h-px flex-1 bg-cream/10" />
  </div>
);

/** A short row of choices; ←/→ step through them. */
const Segmented = <T extends string>({
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
    className="flex"
    onKeyDown={(e) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
      e.preventDefault();
      const i = options.findIndex((o) => o.id === value);
      const next =
        options[Math.max(0, Math.min(options.length - 1, i + (e.code === 'ArrowRight' ? 1 : -1)))];
      if (next.id !== value) {
        onChange(next.id);
        menuSound.tick();
        (e.currentTarget.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus();
      }
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
            menuSound.confirm();
          }}
          className={`focus-ring -ml-px min-w-[3.5rem] -skew-x-12 border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
            on
              ? 'border-gold bg-gold text-ink-deep'
              : 'border-cream/15 bg-cream/5 text-cream/70 hover:border-cream/40 hover:text-cream'
          }`}
        >
          <span className="inline-block skew-x-12">{o.label}</span>
        </button>
      );
    })}
  </div>
);

const Toggle = ({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) => (
  <Segmented
    label={label}
    value={value ? 'on' : 'off'}
    options={[
      { id: 'off', label: 'Off' },
      { id: 'on', label: 'On' },
    ]}
    onChange={(v) => onChange(v === 'on')}
  />
);

const Slider = ({
  value,
  min,
  max,
  step,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  format: (v: number) => string;
}) => (
  <div className="flex w-full items-center gap-3 sm:w-60">
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      aria-valuetext={format(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      onKeyDown={(e) => {
        // Gamepad arrows arrive as synthetic key events, which a native slider ignores: step it here.
        if (e.nativeEvent.isTrusted || (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight')) return;
        onChange(
          Math.max(
            min,
            Math.min(max, +(value + (e.code === 'ArrowRight' ? step : -step)).toFixed(3)),
          ),
        );
      }}
      className="mc-range flex-1"
      style={{ ['--fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
    />
    <span className="w-11 text-right font-display text-sm tabular-nums text-cream">
      {format(value)}
    </span>
  </div>
);

const pct = (v: number) => `${Math.round(v * 100)}`;

/**
 * Settings > Controls > 2 Player (spec local-2p.md 1.5): both players' keys, one per action. A key may be on only one
 * action across both players (taking one swaps), reserved and browser keys are refused, and "Reset 2 player keys" puts
 * back WASD + F G H and the arrows + ; L K. Click a key cell, then press the new key; Esc cancels.
 */
const TwoPlayerKeys = () => {
  const s = useSettings();
  const store = getSettings();
  const label = useKeyLabel();
  const colours = usePlayerColours();
  const [capture, setCapture] = useState<{ player: Player; action: Action2P } | null>(null);
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const name = (a: Action2P) => ACTIONS_2P.find((x) => x.id === a)!.label;

  useEffect(() => {
    if (!capture) return;
    rebinding = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setCapture(null);
        setNote(null);
        return;
      }
      const r = store.rebind2P(capture.player, capture.action, e.code);
      if (!r.ok) {
        setNote({
          text: `${keyLabel(e.code)} can't be a 2 player key (Space, Shift, Enter, Tab, Ctrl, Alt, Esc, M, T, 1-4, ' / and the numpad are kept out). Pick another key.`,
          tone: 'warn',
        });
        return;
      }
      const who = (p: Player) => (p === 'p1' ? 'P1' : 'P2');
      setNote(
        r.swapped
          ? {
              text: `${label(e.code)} was ${who(r.swapped.player)} ${name(r.swapped.action)}: swapped, that is now ${r.swapped.code ? label(r.swapped.code) : 'unbound'}.`,
              tone: 'warn',
            }
          : { text: `${who(capture.player)} ${name(capture.action)} → ${label(e.code)}`, tone: 'ok' },
      );
      menuSound.confirm();
      setCapture(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      rebinding = false;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [capture, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const unbound = unbound2P(s.bindings2p);
  return (
    <>
      <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1" data-testid="settings-2p">
        <span className="text-[10px] font-bold uppercase tracking-widest text-cream/40">Action</span>
        {(['p1', 'p2'] as Player[]).map((p, i) => (
          <span key={p} className="flex w-24 justify-center">
            <PlayerChip index={i as 0 | 1} colour={colours[i]} />
          </span>
        ))}
        {ACTIONS_2P.map(({ id, label: actionLabel }) => (
          <div key={id} className="contents">
            <span className="text-sm font-semibold text-cream/85">{actionLabel}</span>
            {(['p1', 'p2'] as Player[]).map((p) => {
              const listening = capture?.player === p && capture.action === id;
              const code = s.bindings2p[p][id];
              return (
                <button
                  key={p}
                  type="button"
                  aria-label={`${p === 'p1' ? 'P1' : 'P2'} ${actionLabel}: ${code ? label(code) : 'none'}. Press Enter to change.`}
                  onClick={() => {
                    setNote(null);
                    setCapture({ player: p, action: id });
                    menuSound.confirm();
                  }}
                  className={`focus-ring h-9 w-24 -skew-x-12 border text-sm font-bold transition ${
                    listening
                      ? 'animate-pulse border-gold bg-gold/20 text-gold'
                      : code
                        ? 'border-cream/20 bg-ink text-cream hover:border-gold/60'
                        : 'border-dashed border-orange/50 bg-transparent text-cream/30 hover:border-gold/60'
                  }`}
                >
                  <span className="inline-block skew-x-12">{listening ? 'Press key' : label(code)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex min-h-6 flex-wrap items-center justify-between gap-2" aria-live="polite">
        <span className={`text-xs ${note?.tone === 'warn' ? 'text-gold' : 'text-cream/60'}`}>
          {capture
            ? 'Press a key · Esc cancels'
            : (note?.text ??
              (unbound.length
                ? `No key for: ${unbound.map((u) => `${u.player.toUpperCase()} ${name(u.action)}`).join(', ')}`
                : 'Click a key to change it'))}
        </span>
        <button
          type="button"
          onClick={() => {
            store.resetBindings2P();
            setNote({ text: '2 player keys back to default', tone: 'ok' });
            menuSound.back();
          }}
          className="focus-ring border border-cream/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cream/70 hover:border-cream/40 hover:text-cream"
        >
          Reset 2 player keys
        </button>
      </div>
    </>
  );
};

/** Click (or Enter) a key cell, then press the new key. Esc cancels, Backspace clears. */
const ControlsTab = ({ touch }: { touch: boolean }) => {
  const [players, setPlayers] = useState<'1' | '2'>('1');
  return (
    <>
      {!touch && (
        <div className="mb-3">
          <Segmented<'1' | '2'>
            label="Controls for"
            value={players}
            options={[
              { id: '1', label: '1 Player' },
              { id: '2', label: '2 Player' },
            ]}
            onChange={setPlayers}
          />
        </div>
      )}
      {players === '2' && !touch ? <TwoPlayerKeys /> : <OnePlayerControls touch={touch} />}
    </>
  );
};

const OnePlayerControls = ({ touch }: { touch: boolean }) => {
  const s = useSettings();
  const store = getSettings();
  const [capture, setCapture] = useState<{ action: Button; slot: 0 | 1 } | null>(null);
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);

  useEffect(() => {
    if (!capture) return;
    rebinding = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setCapture(null);
        setNote(null);
        return;
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        store.clearBinding(capture.action, capture.slot);
        setNote({
          text: `${ACTIONS.find((a) => a.id === capture.action)!.label}: key cleared`,
          tone: 'ok',
        });
        setCapture(null);
        return;
      }
      const r = store.rebind(capture.action, capture.slot, e.code);
      if (!r.ok) {
        setNote({
          text: `${keyLabel(e.code)} is kept by the game (Esc, M, T, 1-4, Enter). Pick another key.`,
          tone: 'warn',
        });
        return;
      }
      const name = (id: Button) => ACTIONS.find((a) => a.id === id)!.label;
      setNote(
        r.swapped
          ? {
              text: `${keyLabel(e.code)} was on ${name(r.swapped.action)}: swapped, ${name(r.swapped.action)} is now ${r.swapped.code ? keyLabel(r.swapped.code) : 'unbound'}.`,
              tone: 'warn',
            }
          : { text: `${name(capture.action)} → ${keyLabel(e.code)}`, tone: 'ok' },
      );
      menuSound.confirm();
      setCapture(null);
    };
    // Capture phase on window: no other handler (the panel's Esc, the game) sees the key being bound.
    window.addEventListener('keydown', onKey, true);
    return () => {
      rebinding = false;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [capture, store]);

  const unbound = unboundActions(s.bindings);

  return (
    <>
      {!touch && (
        <>
          <Section title="Keyboard" />
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-cream/40">
              Action
            </span>
            <span className="w-24 text-center text-[10px] font-bold uppercase tracking-widest text-cream/40">
              Primary
            </span>
            <span className="w-24 text-center text-[10px] font-bold uppercase tracking-widest text-cream/40">
              Secondary
            </span>
            {ACTIONS.map(({ id, label }) => (
              <div key={id} className="contents">
                <span
                  className={`text-sm font-semibold ${unbound.includes(id) ? 'text-orange' : 'text-cream/85'}`}
                >
                  {label}
                </span>
                {([0, 1] as const).map((slot) => {
                  const listening = capture?.action === id && capture.slot === slot;
                  const code = s.bindings[id][slot];
                  return (
                    <button
                      key={slot}
                      type="button"
                      aria-label={`${label}, ${slot ? 'secondary' : 'primary'} key: ${code ? keyLabel(code) : 'none'}. Press Enter to change.`}
                      onClick={() => {
                        setNote(null);
                        setCapture({ action: id, slot });
                        menuSound.confirm();
                      }}
                      className={`focus-ring h-9 w-24 -skew-x-12 border text-sm font-bold transition ${
                        listening
                          ? 'animate-pulse border-gold bg-gold/20 text-gold'
                          : code
                            ? 'border-cream/20 bg-ink text-cream hover:border-gold/60'
                            : 'border-dashed border-cream/15 bg-transparent text-cream/30 hover:border-gold/60'
                      }`}
                    >
                      <span className="inline-block skew-x-12">
                        {listening ? 'Press key' : keyLabel(code)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div
            className="mt-3 flex min-h-6 flex-wrap items-center justify-between gap-2"
            aria-live="polite"
          >
            <span className={`text-xs ${note?.tone === 'warn' ? 'text-gold' : 'text-cream/60'}`}>
              {capture
                ? 'Press a key · Esc cancels · Backspace clears'
                : (note?.text ??
                  (unbound.length
                    ? `No key for: ${unbound.map((u) => ACTIONS.find((a) => a.id === u)!.label).join(', ')}`
                    : 'Click a key to change it'))}
            </span>
            <button
              type="button"
              onClick={() => {
                store.resetBindings();
                setNote({ text: 'Keys back to default', tone: 'ok' });
                menuSound.back();
              }}
              className="focus-ring border border-cream/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cream/70 hover:border-cream/40 hover:text-cream"
            >
              Reset to default
            </button>
          </div>

          <Section title="Aim" />
          <Row
            label="Aim mode"
            hint={
              s.aimMode === 'auto'
                ? 'Shoot aims at your rival when you can see them'
                : 'The mouse aims; left click also shoots. Aim follows the cursor, so there is no sensitivity to set.'
            }
          >
            <Segmented
              label="Aim mode"
              value={s.aimMode}
              options={[
                { id: 'auto', label: 'Auto' },
                { id: 'mouse', label: 'Mouse' },
              ]}
              onChange={(v) => store.set({ aimMode: v })}
            />
          </Row>
        </>
      )}

      <Section title="Hints" />
      <Row label="Show key hints" hint="The key list along the bottom and the key beside a gun or bomb">
        <Toggle label="Show key hints" value={s.showKeyHints} onChange={(v) => store.set({ showKeyHints: v })} />
      </Row>

      <Section title="Touch controls" />
      {!touch && <p className="mt-2 text-xs text-cream/45">Used on phones and tablets.</p>}
      <Row label="Button size">
        <Slider
          label="Button size"
          value={s.touch.size}
          min={0.75}
          max={1.35}
          step={0.05}
          format={pct}
          onChange={(v) => store.setTouch({ size: v })}
        />
      </Row>
      <Row label="Opacity">
        <Slider
          label="Touch opacity"
          value={s.touch.opacity}
          min={0.3}
          max={1}
          step={0.05}
          format={pct}
          onChange={(v) => store.setTouch({ opacity: v })}
        />
      </Row>
      <Row label="Left-handed" hint="Stick on the right, buttons on the left">
        <Toggle
          label="Left-handed"
          value={s.touch.leftHanded}
          onChange={(v) => store.setTouch({ leftHanded: v })}
        />
      </Row>
    </>
  );
};

const CameraTab = () => {
  const s = useSettings();
  const store = getSettings();
  return (
    <>
      <Section title="Camera" />
      <Row
        label="Camera shake"
        hint={
          s.reducedMotion
            ? 'Off while Reduced motion is on (Accessibility)'
            : 'Shake, zoom punch and flashes on big hits and knockouts'
        }
      >
        <Toggle
          label="Camera shake"
          value={s.shake && !s.reducedMotion}
          onChange={(v) => store.set({ shake: v, reducedMotion: v ? false : s.reducedMotion })}
        />
      </Row>
      <p className="mt-3 text-xs text-cream/45">
        The camera always shows the whole office on a desktop and follows the fight on a phone.
      </p>
    </>
  );
};

const GraphicsTab = () => {
  const s = useSettings();
  const store = getSettings();
  const facts = useMemo(() => deviceFacts(), []);
  const tier = resolveTier(s.quality, facts);
  return (
    <>
      <Section title="Quality" />
      <Row
        label="Preset"
        hint={
          s.quality === 'auto'
            ? `Auto picked ${tier} for this device`
            : 'Forced; Auto picks by device'
        }
      >
        <Segmented<Quality>
          label="Quality preset"
          value={s.quality}
          options={[
            { id: 'auto', label: 'Auto' },
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Med' },
            { id: 'high', label: 'High' },
          ]}
          onChange={(v) => store.set({ quality: v })}
        />
      </Row>
      <Row
        label="Shadows"
        hint={
          tier === 'low'
            ? 'The Low preset always turns shadows off'
            : 'Soft shadows under fighters and furniture'
        }
      >
        <Toggle label="Shadows" value={s.shadows} onChange={(v) => store.set({ shadows: v })} />
      </Row>
      <Row label="Resolution scale" hint="Lower is sharper on battery, softer on screen">
        <Slider
          label="Resolution scale"
          value={s.resScale}
          min={0.5}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => store.set({ resScale: v })}
        />
      </Row>
      <Row label="Show FPS">
        <Toggle label="Show FPS" value={s.showFps} onChange={(v) => store.set({ showFps: v })} />
      </Row>
    </>
  );
};

const AudioTab = () => {
  const s = useSettings();
  const store = getSettings();
  const external = store.effectiveMute() && !s.audio.muted;
  const vol = (key: 'master' | 'effects' | 'guns' | 'ui', label: string, hint?: string) => (
    <Row label={label} hint={hint}>
      <Slider
        label={label}
        value={s.audio[key]}
        min={0}
        max={1}
        step={0.05}
        format={pct}
        onChange={(v) => {
          store.setAudio({ [key]: v });
          if (key === 'ui' || key === 'master') menuSound.tick();
        }}
      />
    </Row>
  );
  return (
    <>
      <Section title="Volume" />
      {vol('master', 'Master')}
      {vol('effects', 'Effects', 'Hits, jumps, glass, knockouts')}
      {vol('guns', 'Gunshots')}
      {vol('ui', 'Menus', 'Focus ticks and confirms')}
      <Row
        label="Mute all"
        hint={
          external ? 'The site this game runs on has turned sound off' : 'M also mutes in a match'
        }
      >
        <Toggle
          label="Mute all"
          value={s.audio.muted}
          onChange={(v) => store.setAudio({ muted: v })}
        />
      </Row>
      <p className="mt-3 text-xs text-cream/45">
        No music: the office stays quiet between fights, so you hear every footstep.
      </p>
    </>
  );
};

const AccessTab = ({ onCredits }: { onCredits: () => void }) => {
  const s = useSettings();
  const store = getSettings();
  return (
    <>
      <Section title="Comfort" />
      <Row
        label="Reduced motion"
        hint="No screen shake, flashes or sliding menus; the menu camera holds still"
      >
        <Toggle
          label="Reduced motion"
          value={s.reducedMotion}
          onChange={(v) => store.set({ reducedMotion: v })}
        />
      </Row>
      <Section title="Readability" />
      <Row label="Colour-blind friendly" hint="Green and red highlights become blue and orange">
        <Toggle
          label="Colour-blind friendly"
          value={s.colourBlind}
          onChange={(v) => store.set({ colourBlind: v })}
        />
      </Row>
      <Row label="Larger HUD text" hint="Health, timer and key hints 25% bigger">
        <Toggle
          label="Larger HUD text"
          value={s.largeHud}
          onChange={(v) => store.set({ largeHud: v })}
        />
      </Row>
      {!PORTAL_BUILD && (
        <Row label="Game words" hint="Developer: merge-conflict jokes. Regular: plain fighting-game words. Same game.">
          <Segmented<CopyVariant>
            label="Game words"
            value={resolveVariant(s.audience)}
            options={[
              { id: 'developer', label: 'Developer' },
              { id: 'regular', label: 'Regular' },
            ]}
            onChange={(v) => store.set({ audience: v })}
          />
        </Row>
      )}
      {/* Credits moved out of the main menu (spec local-2p.md 7): the last row of the last tab. */}
      <Row label="Credits">
        <button
          type="button"
          data-testid="settings-credits"
          onClick={() => {
            menuSound.confirm();
            onCredits();
          }}
          className="focus-ring border border-cream/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cream/70 hover:border-cream/40 hover:text-cream"
        >
          Credits
        </button>
      </Row>
    </>
  );
};

export const SettingsPanel = ({
  onClose,
  initialTab = 'controls',
}: {
  onClose: () => void;
  initialTab?: SettingsTab;
}) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [confirmReset, setConfirmReset] = useState(false);
  const [credits, setCredits] = useState(false);
  const [touch, setTouch] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tabIndex = TABS.findIndex((t) => t.id === tab);

  useEffect(() => setTouch(isTouchDevice()), []);

  const switchTab = (dir: 1 | -1) => {
    const next = TABS[(tabIndex + dir + TABS.length) % TABS.length].id;
    setTab(next);
    menuSound.tick();
  };

  // Focus the active tab when the panel opens, so keyboard and gamepad start inside it.
  useEffect(() => {
    (
      panelRef.current?.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement | null
    )?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || rebinding) return;
      // The Credits panel on top takes Esc and closes itself first.
      if (credits) {
        if (e.code === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          menuSound.back();
          setCredits(false);
        }
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        menuSound.back();
        onClose();
        return;
      }
      if (
        e.code === 'BracketLeft' ||
        e.code === 'BracketRight' ||
        e.code === 'PageUp' ||
        e.code === 'PageDown' ||
        e.code === 'KeyQ' ||
        e.code === 'KeyE'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchTab(e.code === 'BracketLeft' || e.code === 'PageUp' || e.code === 'KeyQ' ? -1 : 1);
        return;
      }
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        // ↑/↓ walk every control in the panel (sliders keep ←/→ for their value).
        e.preventDefault();
        e.stopImmediatePropagation();
        const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (el) => el.tabIndex >= 0 && el.offsetParent !== null,
        );
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next =
          items[
            Math.max(
              0,
              Math.min(items.length - 1, i < 0 ? 0 : i + (e.code === 'ArrowDown' ? 1 : -1)),
            )
          ];
        next?.focus();
        next?.scrollIntoView({ block: 'nearest' });
        menuSound.tick();
      }
    };
    // Capture: the panel owns these keys while it is open (the menu or the game under it must not move).
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button
        type="button"
        aria-label="Close settings"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-deep/40 [animation:fadeIn_0.25s_ease-out]"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative flex h-full w-full flex-col border-r border-gold/20 bg-[linear-gradient(180deg,rgba(20,26,43,0.97),rgba(10,13,24,0.98))] shadow-[30px_0_80px_rgba(0,0,0,0.6)] backdrop-blur-md [animation:slideInLeft_0.32s_cubic-bezier(.2,.9,.2,1)] sm:w-[min(600px,100vw)] [@media(max-height:500px)]:sm:w-[min(640px,100vw)]"
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-gold/60 to-transparent" />
        <header className="flex items-end justify-between gap-3 px-5 pb-3 pt-5 sm:px-8 sm:pt-8 [@media(max-height:500px)]:pt-3">
          <div className="flex flex-col">
            <h2 className="font-display text-4xl leading-none text-cream sm:text-5xl [@media(max-height:500px)]:text-3xl">
              SETTINGS
            </h2>
          </div>
          <span className="hidden items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-cream/40 sm:flex">
            <kbd className="border border-cream/25 px-1.5">Q</kbd>
            <kbd className="border border-cream/25 px-1.5">E</kbd> tabs
          </span>
        </header>

        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto px-5 pb-1 sm:px-8 [scrollbar-width:none]"
        >
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={on}
                aria-controls="settings-body"
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  setTab(t.id);
                  menuSound.tick();
                }}
                onKeyDown={(e) => {
                  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                    e.preventDefault();
                    switchTab(e.code === 'ArrowRight' ? 1 : -1);
                    setTimeout(
                      () =>
                        (
                          panelRef.current?.querySelector(
                            '[role="tab"][aria-selected="true"]',
                          ) as HTMLElement | null
                        )?.focus(),
                      0,
                    );
                  }
                }}
                className={`focus-ring relative shrink-0 -skew-x-12 px-3 py-2 text-xs font-bold uppercase tracking-wider transition sm:px-4 ${
                  on
                    ? 'bg-gold text-ink-deep'
                    : 'bg-cream/5 text-cream/60 hover:bg-cream/10 hover:text-cream'
                }`}
              >
                <span className="inline-block skew-x-12">{t.label}</span>
              </button>
            );
          })}
        </div>

        <div
          ref={bodyRef}
          id="settings-body"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          key={tab}
          className="flex-1 overflow-y-auto px-5 pb-6 pt-4 [animation:fadeIn_0.2s_ease-out] sm:px-8"
        >
          {tab === 'controls' && <ControlsTab touch={touch} />}
          {tab === 'camera' && <CameraTab />}
          {tab === 'graphics' && <GraphicsTab />}
          {tab === 'audio' && <AudioTab />}
          {tab === 'access' && <AccessTab onCredits={() => setCredits(true)} />}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-cream/10 bg-ink-deep/60 px-5 py-3 sm:px-8 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              menuSound.back();
              onClose();
            }}
            className="focus-ring flex -skew-x-12 items-center gap-2 bg-cream/10 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-cream hover:bg-cream/20"
          >
            <span className="inline-flex skew-x-12 items-center gap-2">
              <kbd className="hidden border border-cream/30 px-1 text-[10px] sm:inline">Esc</kbd>{' '}
              Back
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirmReset) {
                setConfirmReset(true);
                setTimeout(() => setConfirmReset(false), 2500);
                return;
              }
              getSettings().resetAll();
              setConfirmReset(false);
              menuSound.back();
            }}
            className={`focus-ring -skew-x-12 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${confirmReset ? 'bg-orange text-ink-deep' : 'text-cream/60 hover:text-cream'}`}
          >
            <span className="inline-block skew-x-12">
              {confirmReset ? 'Press again to reset all' : 'Reset all'}
            </span>
          </button>
        </footer>
      </aside>
      {credits && <CreditsPanel onClose={() => setCredits(false)} />}
    </div>
  );
};
