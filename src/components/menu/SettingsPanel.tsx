'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { FdButton } from '~/components/fieldday/Button';
import { Segmented, Slider, Toggle } from '~/components/fieldday/Controls';
import { fdSound } from '~/components/fieldday/sound';
import { Frame } from '~/components/fieldday/Stage';
import { HintStrip, KeyLabel, PlayerTag } from '~/components/fieldday/parts';
import { FD_COPY } from '~/components/fieldday/copy';
import { Icon } from '~/components/fieldday/Icon';
import { Modal, TitleRibbon } from '~/components/fieldday/screens/Modal';
import { isTouchDevice } from '~/game/input';
import { deviceFacts, resolveTier } from '~/game/render/quality';
import { ACTIONS, getSettings, keyLabel, unboundActions } from '~/game/settings';

import { useKeyLabel } from '~/components/twoPlayer/shared';
import { ACTIONS_2P, unbound2P } from '~/game/twoPlayer';

import { CreditsPanel } from './Credits';
import { useSettings } from './useSettings';

import type { Button } from '~/game/input';
import type { Quality } from '~/game/settings';
import type { Action2P, Player } from '~/game/twoPlayer';
import type { ReactNode } from 'react';

/**
 * Settings in Field Day (b09 Controls, b10 Audio, and Camera, Graphics and Accessibility in the same style): one 1152x568 panel
 * with a SETTINGS ribbon, five tabs (the active one is sun), then the tab's rows. The main menu and the in-match pause menu both
 * open it. Every change is saved and applied at once. Keyboard: arrows move (by geometry), left / right change a value, [ ] (or
 * Q E, PageUp PageDown, a pad's bumpers) switch tabs, Esc goes back; a gamepad drives the same keys (useGamepadNav).
 * While a key cell is listening, the panel's own Esc and tab keys stand aside.
 */

export type SettingsTab = 'controls' | 'camera' | 'graphics' | 'audio' | 'access';
const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'controls', label: 'CONTROLS' },
  { id: 'camera', label: 'CAMERA' },
  { id: 'graphics', label: 'GRAPHICS' },
  { id: 'audio', label: 'AUDIO' },
  { id: 'access', label: 'ACCESSIBILITY' },
];

/** True while a gamepad is connected (the hint strip then shows pad glyphs). */
const useHasPad = () => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(typeof navigator !== 'undefined' && !!navigator.getGamepads && navigator.getGamepads().some(Boolean));
    read();
    window.addEventListener('gamepadconnected', read);
    window.addEventListener('gamepaddisconnected', read);
    return () => {
      window.removeEventListener('gamepadconnected', read);
      window.removeEventListener('gamepaddisconnected', read);
    };
  }, []);
  return on;
};

/** True while a key cell waits for a key: the panel's own shortcuts stand aside. */
let rebinding = false;

/** A settings row card: title and note on the left, the control on the right (or underneath, for a slider). */
const Card = ({
  title,
  note,
  children,
  stack,
  value,
  height,
  style,
  testId,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  /** Slider card: title and value on one line, the note under it, the control below. */
  stack?: boolean;
  value?: string;
  height?: number;
  style?: React.CSSProperties;
  testId?: string;
}) =>
  stack ? (
    <div className="fd-setcard" style={{ height, ...style }} data-testid={testId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ font: "800 17px/1 'Baloo 2', sans-serif" }}>{title}</span>
        {value !== undefined && (
          <span className="fd-titan" style={{ fontSize: 20 }}>
            {value}
          </span>
        )}
      </div>
      <div className="fd-note" style={{ margin: '5px 0 12px', minHeight: 16 }}>
        {note}
      </div>
      {children}
    </div>
  ) : (
    <div className="fd-setcard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, height, ...style }} data-testid={testId}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "800 17px/1 'Baloo 2', sans-serif" }}>{title}</div>
        {note && (
          <div className="fd-note" style={{ marginTop: 6 }}>
            {note}
          </div>
        )}
      </div>
      <div style={{ flex: 'none' }}>{children}</div>
    </div>
  );

const pct = (v: number) => Math.round(v * 100);

/** The 2-player action table: both players' keys, one per action. */
const KEY_ROW = 35;

const KeyBtn = ({ code, listening, label, onPress, name }: { code: string; listening: boolean; label: (c: string) => string; onPress: () => void; name: string }) => (
  <button
    type="button"
    data-nav
    aria-label={`${name}: ${listening ? 'press a key' : code ? label(code) : 'none'}. Press Enter to change.`}
    onClick={onPress}
    className={`fd-kc fd-keybtn ${listening ? 'fd-listening' : ''} ${!code && !listening ? 'fd-empty' : ''}`}
  >
    {listening ? 'PRESS A KEY' : code ? <KeyLabel k={label(code).toUpperCase()} /> : '+ ADD'}
  </button>
);

/**
 * Click (or Enter) a key cell, then press the new key. Esc cancels, Backspace clears. Spec local-2p.md 1.5 for the 2-player table:
 * a key may be on only one action across both players (taking one swaps), reserved and browser keys are refused.
 */
const KeyTable = ({ two, note, setNote }: { two: boolean; note: { text: string; tone: 'ok' | 'warn' } | null; setNote: (n: { text: string; tone: 'ok' | 'warn' } | null) => void }) => {
  const s = useSettings();
  const store = getSettings();
  const label2 = useKeyLabel();
  const [capture, setCapture] = useState<{ action: string; slot: number } | null>(null);
  useEffect(() => setCapture(null), [two]);

  useEffect(() => {
    if (!capture) return;
    rebinding = true;
    const who = (p: Player) => (p === 'p1' ? 'P1' : 'P2');
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setCapture(null);
        setNote(null);
        return;
      }
      if (two) {
        const p: Player = capture.slot === 0 ? 'p1' : 'p2';
        const action = capture.action as Action2P;
        const name = (a: Action2P) => ACTIONS_2P.find((x) => x.id === a)!.label;
        const r = store.rebind2P(p, action, e.code);
        if (!r.ok) {
          setNote({ text: `${keyLabel(e.code)} can't be a 2 player key (Space, Shift, Enter, Tab, Ctrl, Alt, Esc, T, 1-4, ' / and the numpad are kept out; M only for P2 Sit). Pick another key.`, tone: 'warn' });
          return;
        }
        setNote(
          r.swapped
            ? { text: `${label2(e.code)} was ${who(r.swapped.player)} ${name(r.swapped.action)}: swapped, that is now ${r.swapped.code ? label2(r.swapped.code) : 'unbound'}.`, tone: 'warn' }
            : { text: `${who(p)} ${name(action)} → ${label2(e.code)}`, tone: 'ok' },
        );
      } else {
        const action = capture.action as Button;
        const slot = capture.slot as 0 | 1;
        const name = (id: Button) => ACTIONS.find((a) => a.id === id)!.label;
        if (e.code === 'Backspace' || e.code === 'Delete') {
          store.clearBinding(action, slot);
          setNote({ text: `${name(action)}: key cleared`, tone: 'ok' });
          setCapture(null);
          return;
        }
        const r = store.rebind(action, slot, e.code);
        if (!r.ok) {
          setNote({ text: `${keyLabel(e.code)} is kept by the game (Esc, M, T, 1-4, Enter). Pick another key.`, tone: 'warn' });
          return;
        }
        setNote(
          r.swapped
            ? { text: `${keyLabel(e.code)} was on ${name(r.swapped.action)}: swapped, ${name(r.swapped.action)} is now ${r.swapped.code ? keyLabel(r.swapped.code) : 'unbound'}.`, tone: 'warn' }
            : { text: `${name(action)} → ${keyLabel(e.code)}`, tone: 'ok' },
        );
      }
      fdSound.confirm();
      setCapture(null);
    };
    // Capture phase on window: no other handler (the panel's Esc, the game) sees the key being bound.
    window.addEventListener('keydown', onKey, true);
    return () => {
      rebinding = false;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [capture, store, two, label2, setNote]);

  const unbound = two ? unbound2P(s.bindings2p) : unboundActions(s.bindings);
  void unbound;
  const rows = two ? ACTIONS_2P : ACTIONS;
  return (
    <div className="fd-well" style={{ padding: '8px 16px' }} data-testid={two ? 'settings-2p' : 'settings-keys'}>
      {two && (
        <div className="fd-bind" style={{ height: 30 }}>
          <span className="fd-sec">ACTION</span>
          {(['p1', 'p2'] as Player[]).map((p, i) => (
            <span key={p} style={{ display: 'flex', justifyContent: 'center' }}>
              <PlayerTag index={i as 0 | 1} height={22} fontSize={12} />
            </span>
          ))}
        </div>
      )}
      {rows.map(({ id, label }) => (
        <div key={id} className="fd-bind" style={{ height: KEY_ROW }}>
          <span style={{ font: "800 16px/1 'Baloo 2', sans-serif", color: !two && unboundActions(s.bindings).includes(id as Button) ? 'var(--tomato)' : undefined }}>{label}</span>
          {([0, 1] as const).map((slot) => {
            const code = two ? s.bindings2p[slot === 0 ? 'p1' : 'p2'][id as Action2P] : s.bindings[id as Button][slot];
            const k = two ? label2 : keyLabel;
            return (
              <span key={slot} style={{ display: 'flex', justifyContent: 'center' }}>
                <KeyBtn
                  code={code}
                  label={k}
                  name={`${label}, ${two ? (slot ? 'P2' : 'P1') : slot ? 'secondary' : 'primary'} key`}
                  listening={capture?.action === id && capture.slot === slot}
                  onPress={() => {
                    setNote({ text: two ? 'Press a key · Esc cancels' : 'Press a key · Esc cancels · Backspace clears', tone: 'ok' });
                    setCapture({ action: id, slot });
                    fdSound.confirm();
                  }}
                />
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const ControlsTab = ({ touch, onDone }: { touch: boolean; onDone: () => void }) => {
  const s = useSettings();
  const store = getSettings();
  const [two, setTwo] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const unbound = two ? unbound2P(s.bindings2p).map((u) => `${u.player.toUpperCase()} ${ACTIONS_2P.find((a) => a.id === u.action)!.label}`) : unboundActions(s.bindings).map((u) => ACTIONS.find((a) => a.id === u)!.label);
  const hintsCard = (
    <Card title="Key hints in matches" note="The strip along the bottom" testId="row-hints">
      <Toggle label="Key hints in matches" checked={s.showKeyHints} onChange={(v) => store.set({ showKeyHints: v })} data-nav />
    </Card>
  );
  if (touch) {
    return (
      <>
        <div className="fd-abs" style={{ left: 36, top: 202, width: 1080, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 22px' }}>
          <Card stack title="Button size" value={`${pct(s.touch.size)}`} height={100}>
            <Slider label="Button size" value={Math.round(s.touch.size * 100)} min={75} max={135} step={5} onChange={(v) => store.setTouch({ size: v / 100 })} data-nav />
          </Card>
          <Card stack title="Opacity" value={`${pct(s.touch.opacity)}`} height={100}>
            <Slider label="Touch opacity" value={Math.round(s.touch.opacity * 100)} min={30} max={100} step={5} onChange={(v) => store.setTouch({ opacity: v / 100 })} data-nav />
          </Card>
          <Card title="Left-handed" note="Stick on the right, buttons on the left">
            <Toggle label="Left-handed" checked={s.touch.leftHanded} onChange={(v) => store.setTouch({ leftHanded: v })} data-nav />
          </Card>
          {hintsCard}
        </div>
        <div className="fd-abs" style={{ left: 36, top: 512, width: 1080, display: 'flex', justifyContent: 'flex-end' }}>
          <FdButton tone="sun" size="md" fontSize={24} icon="check" primary data-nav data-testid="settings-done" onClick={onDone}>
            DONE
          </FdButton>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="fd-abs" style={{ left: 36, top: 202, width: 640, height: two ? 30 + 8 * KEY_ROW + 16 : 11 * KEY_ROW + 16 }}>
        <KeyTable two={two} note={note} setNote={setNote} />
      </div>
      <div className="fd-abs" aria-live="polite" data-testid="settings-note" style={{ left: 36, top: 610, width: 640 }}>
        <span className="fd-note" style={{ color: note?.tone === 'warn' ? '#C2410C' : undefined, fontSize: 14 }}>
          {note?.text ?? (unbound.length ? `No key for: ${unbound.join(', ')}` : 'Click a key to change it')}
        </span>
      </div>
      <div className="fd-abs" style={{ left: 704, top: 202, width: 412, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="fd-setcard fd-white" data-testid="row-aim" style={{ padding: '12px 16px' }}>
          <div style={{ font: "800 16px/1 'Baloo 2', sans-serif", marginBottom: 10 }}>Aim</div>
          <Segmented
            label="Aim mode"
            value={s.aimMode}
            options={[
              { id: 'auto', label: 'AUTO' },
              { id: 'mouse', label: 'MOUSE' },
            ]}
            onChange={(v) => store.set({ aimMode: v })}
            style={{ display: 'inline-flex' }}
          />
          <div className="fd-note" style={{ marginTop: 8 }}>
            {s.aimMode === 'auto' ? 'Shoot aims at your rival when you can see them.' : 'The mouse aims; left click also shoots.'}
          </div>
        </div>
        {hintsCard}
        <Card title="2 Player keys" note="P1 left side, P2 right side" testId="row-2p">
          <FdButton tone="white" height={44} fontSize={16} data-nav aria-pressed={two} data-testid="edit-2p" onClick={() => { setTwo((v) => !v); setNote(null); }}>
            {two ? '1 PLAYER' : 'EDIT'}
          </FdButton>
        </Card>
      </div>
      <div className="fd-abs" style={{ left: 704, top: 512, width: 412, display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
        <FdButton
          tone="white"
          size="md"
          fontSize={19}
          icon="again"
          data-nav
          data-testid="reset-keys"
          onClick={() => {
            if (two) store.resetBindings2P();
            else store.resetBindings();
            setNote({ text: two ? '2 player keys back to default' : 'Keys back to default', tone: 'ok' });
          }}
        >
          RESET KEYS
        </FdButton>
        <FdButton tone="sun" size="md" fontSize={24} icon="check" primary data-nav data-testid="settings-done" onClick={onDone}>
          DONE
        </FdButton>
      </div>
    </>
  );
};

const Grid = ({ children, done }: { children: ReactNode; done: () => void }) => (
  <>
    <div className="fd-abs" style={{ left: 36, top: 202, width: 1080, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 22px', alignContent: 'start' }}>
      {children}
    </div>
    <div className="fd-abs" style={{ left: 36, top: 512, width: 1080, display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
      <FdButton tone="sun" size="md" fontSize={24} icon="check" primary data-nav data-testid="settings-done" onClick={done}>
        DONE
      </FdButton>
    </div>
  </>
);

const CameraTab = ({ onDone }: { onDone: () => void }) => {
  const s = useSettings();
  const store = getSettings();
  return (
    <Grid done={onDone}>
      <Card
        title="Camera shake"
        note={s.reducedMotion ? 'Off while Reduced motion is on (Accessibility)' : 'Shake, zoom punch and flashes on big hits and knockouts'}
      >
        <Toggle label="Camera shake" checked={s.shake && !s.reducedMotion} onChange={(v) => store.set({ shake: v, reducedMotion: v ? false : s.reducedMotion })} data-nav />
      </Card>
      <div className="fd-note" style={{ gridColumn: '1 / 3', padding: '0 6px' }}>
        The camera always shows the whole arena on a desktop and follows the fight on a phone.
      </div>
    </Grid>
  );
};

const GraphicsTab = ({ onDone }: { onDone: () => void }) => {
  const s = useSettings();
  const store = getSettings();
  const facts = useMemo(() => deviceFacts(), []);
  const tier = resolveTier(s.quality, facts);
  return (
    <Grid done={onDone}>
      <Card title="Preset" note={s.quality === 'auto' ? `Auto picked ${tier} for this device` : 'Forced; Auto picks by device'}>
        <Segmented<Quality>
          label="Quality preset"
          value={s.quality}
          options={[
            { id: 'auto', label: 'AUTO' },
            { id: 'low', label: 'LOW' },
            { id: 'medium', label: 'MED' },
            { id: 'high', label: 'HIGH' },
          ]}
          onChange={(v) => store.set({ quality: v })}
        />
      </Card>
      <Card title="Shadows" note={tier === 'low' ? 'The Low preset always turns shadows off' : 'Soft shadows under fighters and furniture'}>
        <Toggle label="Shadows" checked={s.shadows} onChange={(v) => store.set({ shadows: v })} data-nav />
      </Card>
      <Card stack title="Resolution scale" value={`${pct(s.resScale)}%`} note="Lower is sharper on battery, softer on screen" height={100}>
        <Slider label="Resolution scale" value={Math.round(s.resScale * 100)} min={50} max={100} step={5} onChange={(v) => store.set({ resScale: v / 100 })} data-nav />
      </Card>
      <Card title="Show FPS">
        <Toggle label="Show FPS" checked={s.showFps} onChange={(v) => store.set({ showFps: v })} data-nav />
      </Card>
    </Grid>
  );
};

const AudioTab = ({ onDone }: { onDone: () => void }) => {
  const s = useSettings();
  const store = getSettings();
  const external = store.effectiveMute() && !s.audio.muted;
  const vol = (key: 'master' | 'effects' | 'guns' | 'ui', label: string, note?: string) => (
    <Card stack title={label} value={`${pct(s.audio[key])}`} note={note} height={100} testId={`vol-${key}`}>
      <Slider
        label={label}
        value={Math.round(s.audio[key] * 100)}
        onChange={(v) => {
          store.setAudio({ [key]: v / 100 });
          if (key === 'ui' || key === 'master') fdSound.focus();
        }}
        data-nav
      />
    </Card>
  );
  return (
    <>
      <div className="fd-abs" style={{ left: 36, top: 202, width: 1080, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 22px' }}>
        {vol('master', 'Master', 'The whole game')}
        {vol('effects', 'Effects', 'Hits, jumps, glass, knockouts')}
        {vol('guns', 'Gunshots')}
        {vol('ui', 'Menus', 'Focus ticks and confirms')}
        <Card title="Mute everything" note={external ? 'The site this game runs on has turned sound off' : 'M also mutes in a match'} style={{ gridColumn: '1 / 3' }} testId="row-mute">
          <Toggle label="Mute everything" checked={s.audio.muted} onChange={(v) => store.setAudio({ muted: v })} data-nav />
        </Card>
      </div>
      <div className="fd-abs" style={{ left: 36, top: 512, width: 1080, display: 'flex', justifyContent: 'flex-end' }}>
        <FdButton tone="sun" size="md" fontSize={24} icon="check" primary data-nav data-testid="settings-done" onClick={onDone}>
          DONE
        </FdButton>
      </div>
      <div className="fd-abs fd-note" style={{ left: 36, top: 540, width: 600 }}>
        No music: the arena stays quiet between fights, so you hear every footstep.
      </div>
    </>
  );
};

const AccessTab = ({ onCredits, onDone }: { onCredits: () => void; onDone: () => void }) => {
  const s = useSettings();
  const store = getSettings();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 2500);
    return () => window.clearTimeout(t);
  }, [confirm]);
  return (
    <Grid done={onDone}>
      <Card title="Reduced motion" note="No screen shake, flashes or sliding menus; the menu camera holds still">
        <Toggle label="Reduced motion" checked={s.reducedMotion} onChange={(v) => store.set({ reducedMotion: v })} data-nav />
      </Card>
      <Card title="Colour-blind friendly" note="Green and red highlights become blue and orange">
        <Toggle label="Colour-blind friendly" checked={s.colourBlind} onChange={(v) => store.set({ colourBlind: v })} data-nav />
      </Card>
      <Card title="Larger HUD text" note="Health, timer and key hints 25% bigger">
        <Toggle label="Larger HUD text" checked={s.largeHud} onChange={(v) => store.set({ largeHud: v })} data-nav />
      </Card>
      <Card title="Credits">
        <FdButton tone="white" height={44} fontSize={16} icon="pennant" data-nav data-testid="settings-credits" onClick={onCredits}>
          CREDITS
        </FdButton>
      </Card>
      <Card title="Reset all settings" note="Keys, volumes, graphics and the rest back to their defaults">
        <FdButton
          tone={confirm ? 'warn' : 'white'}
          height={44}
          fontSize={16}
          icon="again"
          sound="none"
          data-nav
          data-testid="reset-all"
          onClick={() => {
            if (!confirm) {
              fdSound.tab();
              setConfirm(true);
              return;
            }
            getSettings().resetAll();
            setConfirm(false);
            fdSound.back();
          }}
        >
          {confirm ? FD_COPY.settings.resetConfirm : 'RESET ALL'}
        </FdButton>
      </Card>
    </Grid>
  );
};

export const SettingsPanel = ({ onClose, initialTab = 'controls' }: { onClose: () => void; initialTab?: SettingsTab }) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [credits, setCredits] = useState(false);
  const [touch, setTouch] = useState(false);
  const tabRef = useRef<HTMLDivElement>(null);
  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const padOn = useHasPad();

  useEffect(() => setTouch(isTouchDevice()), []);

  const switchTab = (dir: 1 | -1) => {
    const next = TABS[(tabIndex + dir + TABS.length) % TABS.length].id;
    setTab(next);
    fdSound.tab();
    // The new tab's button keeps the focus, so the keyboard and the pad carry on from there.
    window.setTimeout(() => tabRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(), 0);
  };
  const switchRef = useRef(switchTab);
  switchRef.current = switchTab;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rebinding || credits) return;
      if (['BracketLeft', 'BracketRight', 'PageUp', 'PageDown', 'KeyQ', 'KeyE'].includes(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchRef.current(e.code === 'BracketLeft' || e.code === 'PageUp' || e.code === 'KeyQ' ? -1 : 1);
      }
    };
    // Capture: the panel owns these keys while it is open (the menu or the game under it must not move).
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [credits]);

  const done = () => {
    fdSound.back();
    onClose();
  };
  const hints =
    tab === 'controls'
      ? [{ keys: ['[', ']'], label: 'Tab' }, { keys: ['↑', '↓'], label: 'Move' }, { keys: ['ENTER'], label: 'Change key' }, { keys: ['ESC'], label: 'Back' }]
      : tab === 'audio'
        ? [{ keys: ['[', ']'], label: 'Tab' }, { keys: ['↑', '↓'], label: 'Move' }, { keys: ['←', '→'], label: 'Adjust' }, { keys: ['M'], label: 'Mute' }, { keys: ['ESC'], label: 'Back' }]
        : [{ keys: ['[', ']'], label: 'Tab' }, { keys: ['↑', '↓'], label: 'Move' }, { keys: ['←', '→'], label: 'Change' }, { keys: ['ESC'], label: 'Back' }];
  const padHints = [{ keys: ['LB', 'RB'], label: 'Tab' }, { keys: ['D-PAD'], label: 'Move' }, { keys: ['A'], label: 'Select' }, { keys: ['B'], label: 'Back' }];

  return (
    <>
      <Modal label="Settings" tint={0.45} onBack={done} escCapture skip={() => rebinding || credits} z={60} testId="settings-panel">
        <Frame>
          <div className="fd-abs" style={{ left: '50%', marginLeft: -576, top: 0, width: 1152, height: 720 }}>
            <div className="fd-panel" style={{ left: 0, top: 78, width: 1152, height: 568 }} />
            <TitleRibbon top={44} icon={<Icon name="gear" size={30} />}>
              SETTINGS
            </TitleRibbon>
            <div ref={tabRef} role="tablist" aria-label="Settings sections" className="fd-tabs fd-abs" style={{ left: 36, top: 134 }}>
              {TABS.map((t) => {
                const on = t.id === tab;
                return (
                  <FdButton
                    key={t.id}
                    tone="white"
                    size="sm"
                    height={48}
                    fontSize={on ? 19 : 18}
                    sound="none"
                    className={on ? 'fd-tab fd-sel' : 'fd-tab'}
                    role="tab"
                    id={`tab-${t.id}`}
                    aria-selected={on}
                    aria-controls="settings-body"
                    tabIndex={on ? 0 : -1}
                    data-nav
                    data-nav-pref={on || undefined}
                    data-testid={`tab-${t.id}`}
                    onClick={() => {
                      setTab(t.id);
                      fdSound.tab();
                    }}
                    onKeyDown={(e) => {
                      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                        // Left and right on a tab switch the tab (the content follows), like the old panel.
                        e.preventDefault();
                        e.stopPropagation();
                        switchTab(e.code === 'ArrowRight' ? 1 : -1);
                      }
                    }}
                  >
                    {t.label}
                  </FdButton>
                );
              })}
            </div>
            <div id="settings-body" role="tabpanel" aria-labelledby={`tab-${tab}`} key={tab} className="fd-abs" style={{ inset: 0 }}>
              {tab === 'controls' && <ControlsTab touch={touch} onDone={done} />}
              {tab === 'camera' && <CameraTab onDone={done} />}
              {tab === 'graphics' && <GraphicsTab onDone={done} />}
              {tab === 'audio' && <AudioTab onDone={done} />}
              {tab === 'access' && <AccessTab onCredits={() => setCredits(true)} onDone={done} />}
            </div>
            <div className="fd-abs" style={{ left: '50%', bottom: 16, transform: 'translateX(-50%)' }}>
              <HintStrip items={padOn ? padHints : hints} />
            </div>
          </div>
        </Frame>
      </Modal>
      {credits && <CreditsPanel onClose={() => setCredits(false)} />}
    </>
  );
};
