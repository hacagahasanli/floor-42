'use client';

import { IconCheck, PanelButton, TextButton } from './LobbyControls';
import { formatElapsed, isQuiet } from './lobbyView';

import type { ReactNode } from 'react';

/** The right column while a connection is in progress. One shape for all of them (spec section 7.2). */
const Panel = ({
  title,
  titleColor,
  children,
}: {
  title: string;
  titleColor?: string;
  children: ReactNode;
}) => (
  <div className="lb-panel panel-cut" role="group" aria-label={title}>
    <h2 style={titleColor ? { color: titleColor } : undefined}>{title}</h2>
    {children}
  </div>
);

const SweepBar = () => (
  <div className="lb-sweepbar" aria-hidden>
    <i />
  </div>
);

/** A: connecting, or joining a room from a link or the code row. */
export const ConnectingPanel = ({
  joining,
  onCancel,
}: {
  joining: boolean;
  onCancel: () => void;
}) => (
  <Panel title={joining ? 'Joining room' : 'Connecting'}>
    <p>Reaching the game server.</p>
    <SweepBar />
    <div className="lb-panel-foot">
      <TextButton onClick={onCancel}>Cancel</TextButton>
    </div>
  </Panel>
);

/** B: a private room is open; share the link or the code. */
export const InvitePanel = ({
  roomId,
  link,
  copied,
  canShare,
  botHref,
  onCopy,
  onShare,
  onCancel,
}: {
  roomId: string;
  link: string;
  copied: boolean;
  canShare: boolean;
  botHref: string;
  onCopy: () => void;
  onShare: () => void;
  onCancel: () => void;
}) => (
  <Panel title="Send this to your rival">
    <p>The match starts the moment they open it.</p>
    <div className="lb-code-block">
      <span className="lb-code-label">Room code</span>
      {/* Codes are case-sensitive: a monospace face that keeps the case, never the all-caps display font. */}
      <span className="lb-code-value">{roomId}</span>
    </div>
    <input
      readOnly
      value={link}
      className="lb-link panel-cut"
      onFocus={(e) => e.target.select()}
      aria-label="Invite link"
    />
    <PanelButton level="primary" green={copied} onClick={onCopy}>
      {copied ? (
        <>
          <IconCheck /> Link copied
        </>
      ) : (
        'Copy invite link'
      )}
    </PanelButton>
    {canShare && (
      <PanelButton level="secondary" onClick={onShare}>
        Share…
      </PanelButton>
    )}
    <div className="lb-panel-foot">
      <TextButton href={botHref}>Nobody yet? Play the bot</TextButton>
      <TextButton onClick={onCancel}>Cancel</TextButton>
    </div>
    <p className="lb-small" role="status" aria-live="polite">
      {copied ? 'Link copied' : ''}
    </p>
  </Panel>
);

/** C: quick match search, with the quiet-queue suggestion after 30 s. */
export const QuickPanel = ({
  elapsed,
  status,
  botHref,
  onInvite,
  onCancel,
}: {
  elapsed: number;
  /** Where the search is (own region, next region, bot on the way). */
  status?: string;
  botHref: string;
  /** Left out on a portal, where a link to our own page cannot be shared. */
  onInvite?: () => void;
  onCancel: () => void;
}) => (
  <Panel title="Looking for a rival">
    <p aria-live="polite">{status ?? 'Anyone waiting gets matched with you.'}</p>
    <span className="lb-elapsed" aria-hidden>
      {formatElapsed(elapsed)}
    </span>
    {isQuiet(elapsed) && (
      <>
        <p>{onInvite ? 'Quiet right now. Invite a friend or play the bot while you wait.' : 'Quiet right now. Play the bot while you wait.'}</p>
        {onInvite && (
          <PanelButton level="secondary" onClick={onInvite}>
            Invite a friend
          </PanelButton>
        )}
        <div className="lb-panel-foot">
          <TextButton href={botHref}>Play the bot</TextButton>
        </div>
      </>
    )}
    <div className="lb-panel-foot">
      <TextButton onClick={onCancel}>Cancel</TextButton>
    </div>
  </Panel>
);

/** D: rival found; the lift doors take over next. No cancel. */
export const FoundPanel = () => (
  <Panel title="Rival found" titleColor="#ff3b4e">
    <p>Connecting you directly…</p>
    <SweepBar />
  </Panel>
);

/** E: the connection failed or dropped. The technical detail stays out of the main line. */
export const ErrorPanel = ({
  title,
  message,
  detail,
  botHref,
  onRetry,
  onBack,
}: {
  title: string;
  message: string;
  detail?: string;
  botHref: string;
  onRetry: () => void;
  onBack: () => void;
}) => (
  <Panel title={title}>
    <p>{message}</p>
    {detail && <p className="lb-small">{detail}</p>}
    <PanelButton level="primary" onClick={onRetry}>
      Try again
    </PanelButton>
    <PanelButton level="secondary" href={botHref}>
      Play the bot
    </PanelButton>
    <div className="lb-panel-foot">
      <TextButton onClick={onBack}>Back</TextButton>
    </div>
  </Panel>
);
