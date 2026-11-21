'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { menuSound } from '~/components/menu/menuSound';
import { readAim, saveAim } from '~/components/AimChoice';
import { isTouchDevice } from '~/game/input';

import { parseRoomInput } from './lobbyView';

import type { AimMode } from '~/game/input';
import type { ReactNode } from 'react';

/** The three lobby icons (docs/collab/CREATIVE/assets): 24 px grid, 2 px square-capped strokes, currentColor. */
const Icon = ({ children, size }: { children: ReactNode; size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden
  >
    {children}
  </svg>
);
export const IconInvite = ({ size = 24 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M3 11 L21 3 L15 21 L11 13 Z" />
    <path d="M11 13 L21 3" />
  </Icon>
);
export const IconQuick = ({ size = 24 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M2 8 H10" />
    <path d="M7 5 L10 8 L7 11" />
    <path d="M22 16 H14" />
    <path d="M17 13 L14 16 L17 19" />
    <path d="M12 3 V21" strokeDasharray="2 3" />
  </Icon>
);
export const IconBot = ({ size = 24 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="4" y="8" width="16" height="12" />
    <path d="M12 8 V4" />
    <rect x="11" y="2" width="2" height="2" fill="currentColor" stroke="none" />
    <rect x="8" y="12" width="2" height="3" fill="currentColor" stroke="none" />
    <rect x="14" y="12" width="2" height="3" fill="currentColor" stroke="none" />
    <path d="M2 12 V16 M22 12 V16" />
  </Icon>
);
export const IconCheck = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 12 L10 18 L20 6" />
  </Icon>
);

/** One action: primary (gold, the only one on screen at a time) or secondary. Ticks on focus, confirms on click. */
export const ActionButton = ({
  level,
  icon,
  title,
  sub,
  onClick,
  href,
  disabled,
  describedBy,
  delay = 0,
}: {
  level: 'primary' | 'secondary';
  icon: ReactNode;
  title: string;
  sub: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  describedBy?: string;
  delay?: number;
}) => {
  const cls = `lb-btn lb-btn-${level} panel-cut lb-rise`;
  const body = (
    <>
      {level === 'primary' && <span aria-hidden className="lb-btn-sweep" />}
      <span aria-hidden className="lb-btn-ico">
        {icon}
      </span>
      <span className="lb-btn-text">
        <span className="lb-btn-title">{title}</span>
        <span className="lb-btn-sub">{sub}</span>
      </span>
      {level === 'primary' && (
        <span aria-hidden className="lb-btn-arrow">
          →
        </span>
      )}
    </>
  );
  const common = {
    className: cls,
    style: { animationDelay: `${delay}s` },
    onMouseEnter: () => !disabled && menuSound.tick(),
    onFocus: () => !disabled && menuSound.tick(),
  };
  return href ? (
    <Link href={href} {...common} onClick={() => menuSound.confirm()}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      {...common}
      disabled={disabled}
      aria-describedby={disabled ? describedBy : undefined}
      onClick={() => {
        menuSound.confirm();
        onClick?.();
      }}
    >
      {body}
    </button>
  );
};

/** A smaller button for the status panels (Copy invite link, Share, Try again, ...). */
export const PanelButton = ({
  level,
  onClick,
  children,
  href,
  green,
}: {
  level: 'primary' | 'secondary';
  onClick?: () => void;
  children: ReactNode;
  href?: string;
  green?: boolean;
}) => {
  const cls = `lb-btn lb-btn-${level} lb-panel-btn panel-cut ${green ? 'lb-green' : ''}`;
  const common = {
    className: cls,
    onMouseEnter: () => menuSound.tick(),
    onFocus: () => menuSound.tick(),
  };
  return href ? (
    <Link href={href} {...common} onClick={() => menuSound.confirm()}>
      {children}
    </Link>
  ) : (
    <button
      type="button"
      {...common}
      onClick={() => {
        menuSound.confirm();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
};

export const TextButton = ({
  onClick,
  href,
  children,
}: {
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}) =>
  href ? (
    <Link href={href} className="lb-text-btn" onClick={() => menuSound.confirm()}>
      {children}
    </Link>
  ) : (
    <button
      type="button"
      className="lb-text-btn"
      onClick={() => {
        menuSound.back();
        onClick?.();
      }}
    >
      {children}
    </button>
  );

const AIM: Record<AimMode, string> = {
  auto: 'Space shoots your rival when you can see them.',
  mouse: 'Point to aim. Left click or Space shoots.',
};

/** Auto-aim or Mouse: a two-option segmented control (not shown on touch: phones always auto-aim). */
export const AimControl = () => {
  const [value, setValue] = useState<AimMode>('auto');
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setValue(readAim());
    setTouch(isTouchDevice());
  }, []);
  if (touch) return null;
  return (
    <div className="lb-aim lb-rise">
      <div className="lb-seg" role="radiogroup" aria-label="Aim" data-value={value}>
        <span className="lb-seg-thumb" aria-hidden />
        {(
          [
            ['auto', 'Auto-aim'],
            ['mouse', 'Mouse'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => {
              menuSound.tick();
              setValue(id);
              saveAim(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="lb-hint">{AIM[value]} T switches in a match.</p>
    </div>
  );
};

/**
 * A code read out loud, or a link pasted in the installed app (no address bar). On a phone it starts as one
 * `Got a code?` line and opens in place (the CSS decides: always open on a desktop).
 */
export const CodeRow = ({
  onJoin,
  onOpenChange,
}: {
  onJoin: (roomId: string) => void;
  onOpenChange?: (open: boolean) => void;
}) => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  return (
    <div className="lb-codewrap" data-open={open}>
      <button
        type="button"
        className="lb-text-btn lb-code-open"
        onClick={() => {
          setOpen(true);
          onOpenChange?.(true);
        }}
      >
        Got a code?
      </button>
      <form
        className="lb-code lb-rise"
        onSubmit={(e) => {
          e.preventDefault();
          const id = parseRoomInput(text);
          if (id) {
            menuSound.confirm();
            onJoin(id);
          }
        }}
      >
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Room code or invite link"
          aria-label="Room code or invite link"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="panel-cut"
        />
        <button type="submit" disabled={!text.trim()} className="lb-btn lb-btn-secondary panel-cut">
          Join
        </button>
      </form>
    </div>
  );
};
