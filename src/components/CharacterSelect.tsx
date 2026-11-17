'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { startGallery } from '~/game/render/gallery';
import { ROSTER } from '~/game/roster';
import { CHARACTERS } from '~/game/sim/constants';

import type { RosterEntry } from '~/game/roster';
import type { CharacterId } from '~/game/sim/types';

const STAT_MAX = { speed: 11, weight: 1.4, jump: 17.5, jumps: 2 };

const Stat = ({ label, value, max }: { label: string; value: number; max: number }) => (
  <div className="flex items-center gap-2 font-mono text-xs">
    <span className="w-14 text-cream/60">{label}</span>
    <div className="h-1.5 flex-1 overflow-hidden rounded bg-cream/10">
      <div className="h-full rounded bg-cream/80" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  </div>
);

const Card = ({
  entry,
  selected,
  onSelect,
}: {
  entry: RosterEntry;
  selected: boolean;
  onSelect: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const galleryRef = useRef<ReturnType<typeof startGallery> | null>(null);
  const stats = CHARACTERS[entry.id];

  useEffect(() => {
    if (!canvasRef.current) return;
    const g = startGallery(canvasRef.current, entry.id);
    galleryRef.current = g;
    return () => g.dispose();
  }, [entry.id]);

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => galleryRef.current?.setHovered(true)}
      onMouseLeave={() => galleryRef.current?.setHovered(false)}
      aria-pressed={selected}
      className={`panel-cut group flex flex-col overflow-hidden border-2 bg-ink text-left transition ${
        selected ? 'border-gold' : 'border-cream/10 hover:border-cream/30'
      }`}
    >
      <div className="relative h-64 w-full" style={{ background: `radial-gradient(circle at 50% 70%, ${entry.accent}55, transparent 70%)` }}>
        <canvas ref={canvasRef} className="h-full w-full" />
        {selected && (
          <span className="absolute right-3 top-3 rounded bg-gold px-2 py-0.5 font-mono text-xs font-bold text-ink">
            YOU
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl" style={{ color: entry.accent }}>
            {entry.name}
          </h2>
          <span className="font-mono text-xs text-cream/50">{entry.role}</span>
        </div>
        <p className="text-sm text-cream/75">{entry.pitch}</p>
        <p className="font-mono text-[11px] text-cream/40">Silhouette: {entry.silhouette}</p>
        <div className="mt-auto flex flex-col gap-1 pt-2">
          <Stat label="speed" value={stats.speed} max={STAT_MAX.speed} />
          <Stat label="weight" value={stats.weight} max={STAT_MAX.weight} />
          <Stat label="jump" value={stats.jump} max={STAT_MAX.jump} />
          <Stat label="air jumps" value={stats.airJumps} max={STAT_MAX.jumps} />
        </div>
      </div>
    </button>
  );
};

export const CharacterSelect = () => {
  const [player, setPlayer] = useState<CharacterId>('hotfix');
  const [opponent, setOpponent] = useState<CharacterId | 'random'>('random');

  const href = `/arena?p1=${player}${opponent === 'random' ? '' : `&p2=${opponent}`}&bot=easy`;

  return (
    <main className="grid-bg mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="font-mono text-xs text-cream/50 hover:text-cream">
            ← Floor 42
          </Link>
          <h1 className="font-display text-3xl">Choose a fighter</h1>
          <p className="text-sm text-cream/60">Everyone dies in two hits. Pick by speed, size and how hard you are to shove.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
          <span className="text-cream/60">Opponent:</span>
          {(['random', ...ROSTER.map((r) => r.id)] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setOpponent(id)}
              className={`rounded px-2.5 py-1 ${opponent === id ? 'bg-cream text-ink' : 'bg-cream/10 hover:bg-cream/20'}`}
            >
              {id === 'random' ? 'random' : CHARACTERS[id].name}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROSTER.map((entry) => (
          <Card key={entry.id} entry={entry} selected={entry.id === player} onSelect={() => setPlayer(entry.id)} />
        ))}
      </div>

      <div className="flex justify-end">
        <Link href={href} className="panel-cut bg-gold px-8 py-3 text-lg font-bold uppercase tracking-wider text-ink-deep hover:brightness-110">
          Fight as {CHARACTERS[player].name} →
        </Link>
      </div>
    </main>
  );
};
