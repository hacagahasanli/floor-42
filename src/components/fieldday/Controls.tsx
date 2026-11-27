'use client';

import { useRef } from 'react';

import { fdSound } from './sound';

import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';

/**
 * Settings-style controls (spec 2.4): Toggle (64x34, teal when on), Slider (22 px track, sun fill, 30 px knob) and Segmented
 * (a pill with a sun "on" segment). Native semantics: switch, slider, radiogroup; arrows work, and each arrow they handle is
 * stopped so the screen's directional navigation leaves them alone. Controlled: pass `value` and `onChange`.
 */
export const Toggle = ({
  checked,
  onChange,
  label,
  className = '',
  style,
  ...rest
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Accessible name (the visible row label). */
  label: string;
  className?: string;
  style?: CSSProperties;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`fd-toggle fd-ring ${className}`}
    style={{ ['--rr' as string]: '17px', ['--ring-inset' as string]: '-10px', ...style }}
    onClick={() => {
      fdSound.toggle();
      onChange(!checked);
    }}
    {...rest}
  >
    <i />
  </button>
);

export const Slider = ({
  value,
  onChange,
  label,
  min = 0,
  max = 100,
  step = 5,
  className = '',
  style,
  ...rest
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  style?: CSSProperties;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'style' | 'className'>) => {
  const ref = useRef<HTMLDivElement>(null);
  const pct = ((value - min) / (max - min)) * 100;
  const set = (v: number) => {
    const next = Math.min(max, Math.max(min, Math.round(v / step) * step));
    if (next === value) return;
    // A soft tick every 10 % (spec 6).
    if (Math.floor(next / ((max - min) / 10)) !== Math.floor(value / ((max - min) / 10))) fdSound.notch();
    onChange(next);
  };
  const fromPointer = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    set(min + ((e.clientX - r.left) / r.width) * (max - min));
  };
  return (
    <div
      {...rest}
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`fd-slider fd-ring ${className}`}
      style={{ ['--rr' as string]: '14px', ['--ring-inset' as string]: '-10px -12px', ...style }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
      onKeyDown={(e: KeyboardEvent) => {
        const d = e.code === 'ArrowRight' || e.code === 'ArrowUp' ? 1 : e.code === 'ArrowLeft' || e.code === 'ArrowDown' ? -1 : 0;
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          set(value + d * step);
        }
      }}
    >
      <b style={{ width: `calc(${pct}% - 4px)` }} />
      <i style={{ left: `${pct}%` }} />
    </div>
  );
};

export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
  style,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
  style?: CSSProperties;
}) => (
  <div
    role="radiogroup"
    aria-label={label}
    className={`fd-seg ${className}`}
    style={style}
    onKeyDown={(e) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      const i = options.findIndex((o) => o.id === value);
      const next = options[(i + (e.code === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
      fdSound.tab();
      onChange(next.id);
      (e.currentTarget.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus();
    }}
  >
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        role="radio"
        aria-checked={o.id === value}
        data-id={o.id}
        tabIndex={o.id === value ? 0 : -1}
        data-nav={o.id === value || undefined}
        className="fd-ring"
        style={{ ['--rr' as string]: '14px', ['--ring-inset' as string]: '-8px -8px -10px' }}
        onClick={() => {
          fdSound.tab();
          onChange(o.id);
        }}
      >
        {o.label}
      </button>
    ))}
  </div>
);
