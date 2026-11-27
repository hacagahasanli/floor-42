'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';

import { Icon, Pointer } from './Icon';
import { fdSound } from './sound';

import type { IconName } from './Icon';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

/**
 * The Field Day button (spec 2.4): candy plastic with a thick grape outline. Colour carries meaning (yellow = do it now, sky =
 * move on, white = back or change, orange = local, teal = online or ready). All states are CSS (fieldday.css): hover, pressed,
 * disabled (grey, grape label, padlock; a press wobbles and says "nuh-uh"), and the keyboard / pad focus double ring.
 *
 * - `primary`: the ONE button of a screen that bobs and shines.
 * - `pointer`: the sun triangle that nudges beside the focused item of a vertical menu.
 * - `disabled` uses aria-disabled, never the `disabled` attribute, so the button stays reachable and can wobble and explain.
 * - `sound`: which voice a press makes ('confirm' default, 'back', or 'none' when the parent plays its own).
 * - The label is always wrapped in its own element so it renders above the gloss; pass text or nodes as children.
 */
export type ButtonTone = 'sun' | 'tang' | 'teal' | 'sky' | 'white';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface FdButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  tone?: ButtonTone;
  /** lg 96, md 68, sm 52 high; omit for the 64 default. `height` overrides (the select's FIGHT! is 84). */
  size?: ButtonSize;
  height?: number;
  /** Font size in px (default by size). */
  fontSize?: number;
  icon?: IconName;
  /** A second icon after the label (the BOT: NORMAL arrows are icons on both sides). */
  iconAfter?: IconName;
  /** Square button with only an icon: give it an aria-label. */
  iconOnly?: boolean;
  /** Pixel size of the icon (default 1.12 x font size). */
  iconSize?: number;
  primary?: boolean;
  pointer?: boolean;
  disabled?: boolean;
  sound?: 'confirm' | 'back' | 'none';
  /** A keycap or other content after the label, inside the padding. */
  after?: ReactNode;
  children?: ReactNode;
}

export const FdButton = forwardRef<HTMLButtonElement, FdButtonProps>(function FdButton(
  {
    tone = 'sun',
    size,
    height,
    fontSize,
    icon,
    iconAfter,
    iconOnly,
    iconSize,
    primary,
    pointer,
    disabled,
    sound = 'confirm',
    after,
    children,
    className = '',
    style,
    onClick,
    onFocus,
    onMouseEnter,
    ...rest
  },
  ref,
) {
  const [wobble, setWobble] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const vars: CSSProperties = { ...style };
  if (height) (vars as Record<string, unknown>)['--h'] = `${height}px`;
  if (fontSize) (vars as Record<string, unknown>)['--fs'] = `${fontSize}px`;
  const iconStyle = iconSize ? { width: iconSize, height: iconSize } : undefined;
  return (
    <button
      ref={ref}
      type="button"
      aria-disabled={disabled || undefined}
      className={`fd-btn fd-t-${tone} ${size ? `fd-${size}` : ''} ${iconOnly ? 'fd-icon' : ''} ${primary ? 'fd-primary' : ''} ${wobble ? 'fd-wobble' : ''} ${className}`}
      style={vars}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          fdSound.denied();
          setWobble(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setWobble(false), 300);
          return;
        }
        if (sound === 'confirm') fdSound.confirm();
        else if (sound === 'back') fdSound.back();
        onClick?.(e);
      }}
      onFocus={(e) => {
        // The focus tick only for keys and pads: a mouse click focuses too, and hover has its own voice.
        if (e.currentTarget.closest('[data-kbd="1"]')) fdSound.focus();
        onFocus?.(e);
      }}
      onMouseEnter={(e) => {
        if (!disabled) fdSound.hover();
        onMouseEnter?.(e);
      }}
      {...rest}
    >
      {primary && <span className="fd-shine" aria-hidden="true" />}
      {pointer && <Pointer className="fd-ptr" />}
      {disabled && <Icon name="lock" style={iconStyle} />}
      {!disabled && icon && <Icon name={icon} style={iconStyle} />}
      {children !== undefined && children !== null && <span className="fd-label">{children}</span>}
      {iconAfter && <Icon name={iconAfter} style={iconStyle} />}
      {after}
    </button>
  );
});
