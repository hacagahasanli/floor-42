'use client';

import { useEffect, useRef, useState } from 'react';

import { TRAIT_NAME } from '~/game/render/traitFx';

import { Icon } from '../Icon';

import './hudTraits.css';

import type { TraitHud } from '~/game/render/traitFx';
import type { CSSProperties } from 'react';

/** How many times `fires` has gone up since this component mounted (0 on a HUD that mounts mid-match): the key for a one-shot pop. */
export const useFired = (fires: number) => {
  const prev = useRef(fires);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (fires > prev.current) setN((k) => k + 1);
    prev.current = fires;
  }, [fires]);
  return n;
};

/**
 * The 24 px trait badge at the end of the chips row (spec 11.1): accent disc, 3 px grape ring, white icon. Ready = as drawn;
 * firing = pop plus a white ring growing 24 -> 44 px; cooldown = grey with the accent refilling clockwise; back to ready = a small pop.
 * The game counts fires (`HudFighter.traitFires`); this only edge-detects the count, so a HUD that mounts mid-match does not pop.
 */
export const TraitBadge = ({ t, fires, color }: { t: TraitHud; fires: number; color: string }) => {
  const prevFires = useRef(fires);
  const prevState = useRef(t.state);
  const [anim, setAnim] = useState<{ kind: 'fire' | 'ready'; n: number } | null>(null);
  useEffect(() => {
    if (fires > prevFires.current) setAnim((a) => ({ kind: 'fire', n: (a?.n ?? 0) + 1 }));
    prevFires.current = fires;
  }, [fires]);
  useEffect(() => {
    if (prevState.current === 'cooldown' && t.state === 'ready') setAnim((a) => ({ kind: 'ready', n: (a?.n ?? 0) + 1 }));
    prevState.current = t.state;
  }, [t.state]);
  return (
    <span
      // A new key restarts the one-shot animation.
      key={anim?.n ?? 0}
      className={`fd-tb ${anim ? `fd-tb-${anim.kind}` : ''}`}
      data-testid="trait-badge"
      data-state={t.state}
      data-fires={fires}
      role="img"
      aria-label={TRAIT_NAME[t.id]}
      style={{ ['--c' as string]: color, ['--f' as string]: t.fill } as CSSProperties}
    >
      <span className="fd-tb-ring" aria-hidden="true" />
      <span className="fd-tb-disc">
        <Icon name={t.id} />
      </span>
    </span>
  );
};
