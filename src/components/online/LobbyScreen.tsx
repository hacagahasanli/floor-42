'use client';

import { useEffect, useRef, useState } from 'react';

import { FdButton } from '~/components/fieldday/Button';
import { fighterView, FIGHTER_IDS } from '~/components/fieldday/fighters';
import { Icon } from '~/components/fieldday/Icon';
import { useSpatialNav } from '~/components/fieldday/nav';
import { Chip, HintStrip, Keycap, Pill } from '~/components/fieldday/parts';
import { Portrait, useFighterPortraits } from '~/components/fieldday/Portrait';
import { fdSound } from '~/components/fieldday/sound';
import { Frame, Stage } from '~/components/fieldday/Stage';
import { Segmented } from '~/components/fieldday/Controls';
import { SoftBackdrop } from '~/components/fieldday/screens/Backdrop';

import { clock, connectingView, errorView, foundLine, foundRow, ONLINE_COPY as T, searchView } from './onlineCopy';

import type { ErrorKind, StepRow } from './onlineCopy';
import type { IconName } from '~/components/fieldday/Icon';
import type { AimMode } from '~/game/input';
import type { LegKind } from '~/game/net/matchmaking';
import type { BotLevel } from '~/game/sim/bot';
import type { CharacterId } from '~/game/sim/types';

import './online.css';

/**
 * The online lobby in Field Day (R-032, Creative Director spec `CREATIVE/ui/direction-b/online/spec.md` sections 2-3, mockups
 * o01-o11): blurred OFFSITE poster, title, a left action column or paper panel, and the face-off (your card vs the rival card)
 * on the right. The rival card IS the status: mystery while searching, the fighter when a player is found, the bot's fighter
 * with `PLAYED BY A BOT` when the bot steps in. Pure view: the state machine lives in OnlineLobby.
 */
export type LobbyUi =
  | { k: 'menu'; offline: boolean; portal: boolean }
  | { k: 'code' }
  | { k: 'joining'; code: string }
  | { k: 'connecting'; elapsedMs: number; multi: boolean }
  | { k: 'search'; leg: LegKind; regions: { home?: string; next?: string }; elapsed: number; fuse: number }
  | { k: 'found'; rival: CharacterId | null; region?: string; multi: boolean; elapsed: number; friend: boolean; title: string }
  | { k: 'bot'; rival: CharacterId; level: BotLevel; offline: boolean; standby: boolean; elapsed: number }
  | { k: 'invite'; code: string; link: string; copied: boolean; canShare: boolean; waited: number; portal: boolean }
  | { k: 'error'; kind: ErrorKind; detail?: string };

export interface LobbyHandlers {
  onBack: () => void;
  onQuick: () => void;
  onInvite: () => void;
  onOpenCode: () => void;
  onCloseCode: () => void;
  onJoinCode: (text: string) => void;
  onCancel: () => void;
  onPick: (id: CharacterId) => void;
  onAim: (m: AimMode) => void;
  onCopy: () => void;
  onShare: () => void;
  onBotWhileWaiting: () => void;
  onRetry: () => void;
  onPlayBot: () => void;
  onReload: () => void;
}

const TITLE: Record<LobbyUi['k'], string> = {
  menu: T.menu.title,
  code: T.menu.title,
  joining: T.menu.title,
  connecting: T.connecting.title,
  search: T.connecting.title,
  found: T.connecting.title,
  bot: T.connecting.title,
  invite: T.invite.title,
  error: T.menu.title,
};

const PanelRibbon = ({ children, icon, tone }: { children: string; icon?: IconName; tone?: 'sun' | 'err' }) => (
  <div className={`on-ribbon ${tone === 'sun' ? 'on-sun' : tone === 'err' ? 'on-err' : ''}`}>
    {icon && <Icon name={icon} />}
    <span className="fd-titan fd-ol">{children}</span>
  </div>
);

const Steps = ({ rows, top }: { rows: StepRow[]; top: number }) => (
  <div className="on-steps" style={{ left: 28, right: 24, top }}>
    {rows.map((r) => (
      <div key={r.key} className={`on-step ${r.state === 'skip' ? 'on-off' : ''}`} data-state={r.state}>
        <span className={`on-dot on-${r.state}`}>
          {r.state === 'done' ? <Icon name="checkOnDark" /> : r.key === 'bot' ? <Icon name="bot" /> : null}
        </span>
        <span className="on-t">{r.title}</span>
        <span className="on-s">{r.sub}</span>
      </div>
    ))}
  </div>
);

const Fuse = ({ share, top, bot = true }: { share: number; top: number; bot?: boolean }) => (
  <div className="on-fuse" style={{ left: 28, right: 46, top }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
    <b style={{ width: `calc(${Math.min(1, Math.max(0, share)) * 100}% - 4px)` }} />
    {bot && (
      <i>
        <Icon name="bot" />
      </i>
    )}
  </div>
);

/** A fighter card of the face-off. */
const FighterCard = ({ id, left, rot, role, tag, flip }: { id: CharacterId; left: number; rot: number; role?: string; tag: React.ReactNode; flip?: boolean }) => {
  const v = fighterView(id);
  return (
    <div className={`on-fcard ${flip ? 'on-flip' : ''}`} style={{ left, rotate: `${rot}deg`, ['--acc' as string]: v.accent }} data-fighter={id}>
      <div className="on-photo">
        <Portrait id={id} w={232} h={196} head={0.3} card />
      </div>
      <div className="fd-titan on-nm">{v.name}</div>
      <div className="on-rl">{role ?? v.role}</div>
      <span className="on-tag">{tag}</span>
    </div>
  );
};

const MysteryCard = ({ name, role, searching, tag, fallen, plug }: { name: string; role: string; searching?: boolean; tag?: React.ReactNode; fallen?: boolean; plug?: boolean }) => (
  <div className={`on-fcard on-mystery ${fallen ? 'on-fallen' : ''}`} style={fallen ? { left: 944, top: 150, rotate: '12deg' } : { left: 952, rotate: '3deg' }} data-testid="rival-card">
    <div className="on-photo">
      {plug ? (
        <Icon name="plug" size={96} />
      ) : (
        <span className={`fd-titan fd-ol on-q ${searching ? 'on-wob' : ''}`} style={fallen ? { opacity: 0.6 } : undefined}>
          ?
        </span>
      )}
      {searching && <span className="on-sweep" />}
    </div>
    <div className="fd-titan on-nm" style={fallen ? undefined : { color: 'var(--grape-2)' }}>
      {name}
    </div>
    {role && <div className="on-rl">{role}</div>}
    {tag && <span className="on-tag">{tag}</span>}
  </div>
);

const InkChip = ({ children }: { children: string }) => (
  <Chip color="var(--grape)" style={{ color: '#fff' }}>
    {children}
  </Chip>
);

/** The face-off on the right: your card, VS, the rival card for this state. */
const FaceOff = ({ ui, me }: { ui: LobbyUi; me: CharacterId }) => {
  const rays = ui.k === 'found' ? 0.85 : ui.k === 'error' ? 0.3 : 0.5;
  let rival: React.ReactNode;
  // A flip when the rival card turns from mystery to a fighter.
  switch (ui.k) {
    case 'menu':
      rival = <MysteryCard name={T.menu.rivalName} role={T.menu.rivalRole} />;
      break;
    case 'code':
    case 'joining':
      rival = <MysteryCard name={T.code.friendName} role={T.code.friendRole} />;
      break;
    case 'connecting':
      rival = <MysteryCard name={T.menu.rivalName} role={T.connecting.rivalRole} />;
      break;
    case 'search': {
      const v = searchView(ui.leg, ui.regions);
      rival = v.botIncoming ? (
        <MysteryCard
          name={T.menu.rivalName}
          role=""
          searching
          tag={
            <Chip icon="bot" data-testid="bot-incoming">
              {T.search.botIncoming}
            </Chip>
          }
        />
      ) : (
        <MysteryCard name={T.menu.rivalName} role={T.search.rivalRole} searching />
      );
      break;
    }
    case 'found':
      rival = ui.rival ? (
        <FighterCard id={ui.rival} left={952} rot={3} flip tag={<InkChip>{T.found.rivalTag}</InkChip>} />
      ) : (
        <MysteryCard name={T.menu.rivalName} role={T.search.rivalRole} searching />
      );
      break;
    case 'bot':
      rival = (
        <FighterCard
          id={ui.rival}
          left={952}
          rot={3}
          flip
          role={T.bot.role}
          tag={
            <Chip icon="bot" data-testid="bot-chip">
              BOT · {ui.level.toUpperCase()}
            </Chip>
          }
        />
      );
      break;
    case 'invite':
      rival = (
        <MysteryCard
          name={T.invite.friendName}
          role={T.invite.friendRole}
          searching
          tag={<Chip icon="clock">{T.invite.waiting(ui.waited)}</Chip>}
        />
      );
      break;
    case 'error': {
      const e = errorView(ui.kind);
      rival = <MysteryCard name={e.card.name} role={e.card.role} fallen plug={e.card.plug} />;
      break;
    }
  }
  return (
    <>
      <div className={`on-rays ${ui.k === 'found' ? 'on-found' : ''}`} style={{ opacity: rays }} aria-hidden="true" />
      <FighterCard id={me} left={628} rot={-3} tag={<InkChip>{T.tags.you}</InkChip>} />
      {rival}
      {ui.k !== 'error' && (
        <div className="on-vs" aria-hidden="true">
          <span className="fd-titan">{T.vs}</span>
        </div>
      )}
    </>
  );
};

const Picker = ({ me, onPick }: { me: CharacterId; onPick: (id: CharacterId) => void }) => (
  <div className="on-picker" role="radiogroup" aria-label="Fighter">
    {FIGHTER_IDS.map((id, i) => (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={id === me}
        aria-label={fighterView(id).name}
        className="on-pick"
        data-nav
        data-testid={`pick-${id}`}
        onClick={() => {
          if (id !== me) fdSound.confirm();
          onPick(id);
        }}
      >
        <span className="on-head">
          <Portrait id={id} w={44} h={44} head={0.8} ty={0.5} circle />
        </span>
        <Keycap k={String(i + 1)} />
      </button>
    ))}
  </div>
);

const CodeEntry = ({ h }: { h: LobbyHandlers }) => {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  const join = () => {
    if (text.trim()) h.onJoinCode(text);
  };
  return (
    <div className="on-panel" style={{ left: 64, top: 150, width: 452, height: 318 }} data-testid="code-panel">
      <PanelRibbon>{T.code.ribbon}</PanelRibbon>
      <div className="on-line" style={{ left: 28, right: 28, top: 50 }}>
        {T.code.line}
      </div>
      <input
        ref={ref}
        className="on-field on-entry"
        style={{ left: 28, right: 28, top: 118 }}
        aria-label={T.code.placeholder}
        placeholder={T.code.placeholder}
        value={text}
        autoComplete="off"
        spellCheck={false}
        data-nav
        data-testid="code-input"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            join();
          }
        }}
      />
      {/* Spec 3.1 `Codes care about capital letters.` is deleted: R-033 codes are case-free. */}
      <FdButton tone="sun" size="md" style={{ position: 'absolute', left: 28, top: 222, width: 240 }} disabled={!text.trim()} data-nav data-testid="code-join" after={<Keycap k="ENTER" />} onClick={join}>
        {T.code.join}
      </FdButton>
      <FdButton tone="white" size="sm" sound="back" style={{ position: 'absolute', left: 286, top: 230, width: 138 }} data-nav data-testid="code-close" onClick={h.onCloseCode}>
        {T.code.close}
      </FdButton>
    </div>
  );
};

/** The left column / panel for each state. */
const Left = ({ ui, h }: { ui: LobbyUi; h: LobbyHandlers }) => {
  switch (ui.k) {
    case 'menu':
      return (
        <>
          <FdButton
            tone={ui.offline ? 'white' : 'sun'}
            size="lg"
            fontSize={36}
            icon="bolt"
            iconSize={38}
            primary={!ui.offline}
            disabled={ui.offline}
            data-nav
            data-nav-pref
            data-testid="quick"
            style={{ position: 'absolute', left: 64, top: 146, width: 452 }}
            after={<Keycap k="ENTER" />}
            onClick={h.onQuick}
          >
            {T.menu.quick}
          </FdButton>
          <div className="fd-abs" style={{ left: 64, top: 262, width: 452, textAlign: 'center' }}>
            <Pill data-testid="promise">
              {ui.offline ? (
                T.menu.offlinePromise
              ) : (
                <>
                  {T.menu.promise[0]}
                  <b style={{ color: 'var(--sun)', fontWeight: 800 }}>{T.menu.promise[1]}</b>
                  {T.menu.promise[2]}
                </>
              )}
            </Pill>
          </div>
          {!ui.portal && (
            <>
              <FdButton tone="white" size="md" icon="link" disabled={ui.offline} data-nav data-testid="invite" style={{ position: 'absolute', left: 64, top: 312, width: 452, justifyContent: 'flex-start' }} onClick={h.onInvite}>
                <span className="on-lab" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                  <span>{T.menu.invite}</span>
                  <span style={{ font: "800 13px/1 'Baloo 2', sans-serif", letterSpacing: 0.4, color: ui.offline ? 'var(--gray-ink)' : 'var(--grape-2)', textShadow: 'none' }}>{T.menu.inviteSub}</span>
                </span>
              </FdButton>
              <FdButton tone="white" size="md" icon="ticket" disabled={ui.offline} data-nav data-testid="join-code" style={{ position: 'absolute', left: 64, top: 404, width: 452, justifyContent: 'flex-start' }} onClick={h.onOpenCode}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                  <span>{T.menu.join}</span>
                  <span style={{ font: "800 13px/1 'Baloo 2', sans-serif", letterSpacing: 0.4, color: ui.offline ? 'var(--gray-ink)' : 'var(--grape-2)', textShadow: 'none' }}>{T.menu.joinSub}</span>
                </span>
              </FdButton>
            </>
          )}
        </>
      );
    case 'code':
      return <CodeEntry h={h} />;
    case 'joining':
      return (
        <div className="on-panel" style={{ left: 64, top: 150, width: 452, height: 250 }} data-testid="joining-panel">
          <PanelRibbon icon="globeOnDark">{T.code.joiningRibbon}</PanelRibbon>
          <div className="on-line" style={{ left: 28, right: 28, top: 52 }}>
            {T.code.joiningLine}
          </div>
          <div className="on-small" style={{ left: 28, right: 28, top: 86, color: 'var(--gray-ink)' }}>
            {ui.code}
          </div>
          <FdButton tone="white" size="sm" sound="back" data-nav data-nav-pref data-testid="cancel" style={{ position: 'absolute', left: 28, top: 180 }} after={<Keycap k="ESC" />} onClick={h.onCancel}>
            {T.connecting.cancel}
          </FdButton>
        </div>
      );
    case 'connecting': {
      const v = connectingView(ui.elapsedMs, ui.multi);
      return (
        <div className="on-panel" style={{ left: 64, top: 150, width: 452, height: 250 }} data-testid="connecting-panel">
          <PanelRibbon icon="globeOnDark">{T.connecting.ribbon}</PanelRibbon>
          <div className="on-line" style={{ left: 28, right: 28, top: 52 }} aria-live="polite">
            {v.line}
          </div>
          {v.small && (
            <div className="on-small" style={{ left: 28, right: 28, top: 86 }}>
              {v.small}
            </div>
          )}
          <Fuse share={ui.elapsedMs / 6000} top={140} bot={false} />
          <FdButton tone="white" size="sm" sound="back" data-nav data-nav-pref data-testid="cancel" style={{ position: 'absolute', left: 28, top: 180 }} after={<Keycap k="ESC" />} onClick={h.onCancel}>
            {T.connecting.cancel}
          </FdButton>
        </div>
      );
    }
    case 'search': {
      const v = searchView(ui.leg, ui.regions);
      return (
        <div className="on-panel" style={{ left: 64, top: 150, width: 452, height: 456 }} data-testid="search-panel" data-leg={ui.leg}>
          <PanelRibbon icon="globeOnDark">{T.search.ribbon}</PanelRibbon>
          <div className="fd-titan on-clock" style={{ left: 28, top: 46 }} data-testid="search-clock">
            {clock(ui.elapsed)}
          </div>
          <div className="on-line" style={{ left: 184, right: 24, top: 52 }} aria-live="polite" data-testid="search-line">
            {v.line}
          </div>
          <Steps rows={v.steps} top={130} />
          <Fuse share={ui.fuse} top={312} />
          <div className="on-small" style={{ left: 28, top: 344 }}>
            {T.search.fuseNote}
          </div>
          <FdButton tone="white" size="sm" sound="back" data-nav data-nav-pref data-testid="cancel" style={{ position: 'absolute', left: 28, top: 384 }} after={<Keycap k="ESC" />} onClick={h.onCancel}>
            {T.connecting.cancel}
          </FdButton>
        </div>
      );
    }
    case 'found':
      return (
        <div className="on-panel" style={{ left: 64, top: 150, width: 452, height: 250 }} data-testid="found-panel">
          <PanelRibbon tone="sun">{T.found.ribbon}</PanelRibbon>
          <div className="fd-titan on-clock" style={{ left: 28, top: 46 }}>
            {clock(ui.elapsed)}
          </div>
          <div className="on-line" style={{ left: 184, right: 24, top: 52 }} aria-live="polite">
            {ui.friend ? T.invite.friendIn : foundLine(ui.region, ui.multi)}
          </div>
          <Steps rows={[foundRow(ui.region, ui.multi)]} top={140} />
        </div>
      );
    case 'bot':
      return (
        <div className="on-panel" style={{ left: 64, top: 150, width: 452, height: 250 }} data-testid="bot-panel" data-offline={ui.offline || undefined}>
          <PanelRibbon>{T.bot.ribbon}</PanelRibbon>
          <div className="fd-titan on-clock" style={{ left: 28, top: 46 }}>
            {clock(ui.elapsed)}
          </div>
          <div className="on-line" style={{ left: 184, right: 24, top: 52 }} aria-live="polite" data-testid="bot-line">
            {ui.offline ? T.bot.offlineLine : T.bot.line}
          </div>
          {(ui.offline || ui.standby) && (
            <div className="on-small" style={{ left: 28, right: 24, top: 132 }}>
              {ui.offline ? T.bot.offlineSmall : T.bot.standby}
            </div>
          )}
        </div>
      );
    case 'invite':
      return (
        <div className="on-panel" style={{ left: 64, top: 150, width: 452, height: 478 }} data-testid="invite-panel">
          <PanelRibbon>{T.invite.ribbon}</PanelRibbon>
          <div className="on-line" style={{ left: 28, right: 28, top: 48 }}>
            {T.invite.line}
          </div>
          <div className="on-codewell" style={{ left: 28, right: 28, top: 118 }}>
            <span>
              <span className="on-hlabel">{T.invite.codeLabel}</span>
              <br />
              <span className="on-code" data-testid="room-code">
                {ui.code}
              </span>
            </span>
            <span className="on-small" style={{ position: 'static', textAlign: 'right' }}>
              {T.invite.readOut}
            </span>
          </div>
          <input
            readOnly
            className="on-field"
            style={{ left: 28, right: 28, top: 220 }}
            aria-label="Invite link"
            value={ui.link}
            data-testid="invite-link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <FdButton tone="sun" size="md" fontSize={22} icon={ui.copied ? 'check' : 'copy'} primary data-nav data-nav-pref data-testid="copy-link" style={{ position: 'absolute', left: 28, top: 292, width: 220 }} onClick={h.onCopy}>
            {ui.copied ? T.invite.copied : T.invite.copy}
          </FdButton>
          <span className="fd-sr" aria-live="polite">
            {ui.copied ? T.invite.copiedSr : ''}
          </span>
          {ui.canShare && (
            <FdButton tone="white" size="md" icon="share" data-nav data-testid="share" style={{ position: 'absolute', left: 264, top: 292, width: 160, padding: '0 14px', gap: 8 }} onClick={h.onShare}>
              {T.invite.share}
            </FdButton>
          )}
          <FdButton tone="white" size="sm" icon="bot" data-nav data-testid="bot-while-waiting" style={{ position: 'absolute', left: 28, top: 396 }} onClick={h.onBotWhileWaiting}>
            {T.invite.botWait}
          </FdButton>
        </div>
      );
    case 'error': {
      const e = errorView(ui.kind);
      const act = (a: string) => () =>
        a === 'retry' ? h.onRetry() : a === 'bot' ? h.onPlayBot() : a === 'quick' ? h.onQuick() : a === 'code' ? h.onOpenCode() : a === 'reload' ? h.onReload() : h.onBack();
      const height = e.code ? 392 : 372;
      return (
        <div className="on-panel" style={{ left: 64, top: 150, width: 452, height }} data-testid="error-panel" data-kind={ui.kind}>
          <PanelRibbon icon={e.icon} tone="err">
            {e.ribbon}
          </PanelRibbon>
          <div className="on-line" style={{ left: 28, right: 28, top: 48 }} role="alert">
            {e.line}
          </div>
          {e.small && (
            <div className="on-small" style={{ left: 28, right: 28, top: 126 }}>
              {e.small}
            </div>
          )}
          <FdButton tone="sun" size="md" icon={e.primary.icon === 'reload' ? 'again' : e.primary.icon} primary data-nav data-nav-pref data-testid="error-primary" style={{ position: 'absolute', left: 28, top: 176, width: 396 }} onClick={act(e.primary.action)}>
            {e.primary.label}
          </FdButton>
          <FdButton tone="white" size="md" icon={e.secondary.icon} data-nav data-testid="error-secondary" style={{ position: 'absolute', left: 28, top: 270, width: 396 }} onClick={act(e.secondary.action)}>
            {e.secondary.label}
          </FdButton>
          {e.code && (
            <div className="on-small" style={{ left: 28, top: 352, color: 'var(--gray-ink)' }} title={ui.detail}>
              Code: {e.code} · for support
            </div>
          )}
        </div>
      );
    }
  }
};

export const LobbyScreen = ({ ui, me, aim, touch, h }: { ui: LobbyUi; me: CharacterId; aim: AimMode; touch: boolean; h: LobbyHandlers }) => {
  const root = useRef<HTMLDivElement>(null);
  useFighterPortraits(me);
  const busy = ui.k === 'connecting' || ui.k === 'search' || ui.k === 'joining';
  const locked = ui.k === 'found' || ui.k === 'bot';
  // Esc: close the code row, cancel a search or room, else back home. Nothing while found / bot (no way out mid hand-off).
  const onBack = locked ? undefined : ui.k === 'code' ? h.onCloseCode : busy || ui.k === 'invite' ? h.onCancel : h.onBack;
  useSpatialNav(root, { active: true, onBack });
  // Focus the state's main control when the state changes (the sun button, or CANCEL while searching).
  useEffect(() => {
    if (ui.k === 'code') return;
    const t = window.setTimeout(() => root.current?.querySelector<HTMLElement>('[data-nav-pref]')?.focus({ preventScroll: true }), 30);
    return () => window.clearTimeout(t);
  }, [ui.k]);
  // Menu: keys 1-4 pick a fighter.
  useEffect(() => {
    if (ui.k !== 'menu') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = ['1', '2', '3', '4'].indexOf(e.key);
      if (n < 0) return;
      const id = FIGHTER_IDS[n];
      if (id && id !== me) {
        fdSound.confirm();
        h.onPick(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui.k, me, h]);

  const showBack = ui.k === 'menu' || ui.k === 'code' || ui.k === 'error' || ui.k === 'invite';
  const title = ui.k === 'found' ? ui.title : TITLE[ui.k];
  return (
    <div className="fixed inset-0" data-testid="online-lobby" data-state={ui.k === 'error' ? `error-${ui.kind}` : ui.k}>
      <Stage>
        <SoftBackdrop arena="offsite" tint={0} />
        <div className="on-scrim-l" aria-hidden="true" />
        <Frame>
          <div ref={root} className="fd-enter" style={{ position: 'absolute', inset: 0 }}>
            {showBack && (
              <FdButton
                tone="white"
                size="sm"
                icon="back"
                iconSize={20}
                sound="back"
                data-nav
                data-testid="back"
                style={{ position: 'absolute', left: 24, top: 24 }}
                onClick={ui.k === 'invite' ? h.onCancel : ui.k === 'code' ? h.onCloseCode : h.onBack}
                after={<Keycap k="ESC" />}
              >
                {ui.k === 'invite' ? T.invite.cancel : T.menu.back}
              </FdButton>
            )}
            <h1 className="fd-titan fd-ol on-title">{title}</h1>
            <Left ui={ui} h={h} />
            {ui.k === 'menu' && !touch && (
              <div className="fd-abs" style={{ left: 64, top: 506, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ font: "800 12px/1 'Baloo 2', sans-serif", letterSpacing: 2, color: '#fff', textShadow: '0 2px 0 var(--grape)' }}>{T.menu.aim}</span>
                <Segmented
                  label={T.menu.aim}
                  value={aim}
                  options={[
                    { id: 'auto', label: T.menu.aimAuto },
                    { id: 'mouse', label: T.menu.aimMouse },
                  ]}
                  onChange={(m) => h.onAim(m as AimMode)}
                />
              </div>
            )}
            <FaceOff ui={ui} me={me} />
            {ui.k === 'menu' && <Picker me={me} onPick={h.onPick} />}
            {(ui.k === 'menu' || ui.k === 'code') && !touch && (
              <div className="fd-abs" style={{ left: '50%', bottom: 20, transform: 'translateX(-50%)' }}>
                <HintStrip
                  items={
                    ui.k === 'menu'
                      ? [
                          { keys: ['1', '4'], label: T.menu.hints.fighter, range: true },
                          { keys: ['ENTER'], label: T.menu.hints.quick },
                          { keys: ['ESC'], label: T.menu.hints.back },
                        ]
                      : [
                          { keys: ['ENTER'], label: T.code.hints.join },
                          { keys: ['ESC'], label: T.code.hints.close },
                        ]
                  }
                />
              </div>
            )}
          </div>
        </Frame>
      </Stage>
    </div>
  );
};
