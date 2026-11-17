'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { accentOf, FighterCards, FighterHero, MenuShell, readCharacter, saveCharacter, Steps, usePortraits } from '~/components/MenuShell';
import { ROSTER } from '~/game/roster';
import { CHARACTERS } from '~/game/sim/constants';

import type { CharacterId } from '~/game/sim/types';

/** Practice against the bot: pick yourself and your rival. Same look as the home page, no live office behind it. */
export const CharacterSelect = () => {
  const [player, setPlayer] = useState<CharacterId>('hotfix');
  const [opponent, setOpponent] = useState<CharacterId | 'random'>('random');
  const portraits = usePortraits();

  useEffect(() => {
    const saved = readCharacter();
    if (saved) setPlayer(saved);
  }, []);

  const pick = (id: CharacterId) => {
    setPlayer(id);
    saveCharacter(id);
  };

  const href = `/arena?p1=${player}${opponent === 'random' ? '' : `&p2=${opponent}`}&bot=easy`;

  return (
    <MenuShell
      accent={accentOf(player)}
      status={
        <>
          <span className="h-2 w-2 animate-pulse rounded-full bg-gold" /> PRACTICE · VS BOT
        </>
      }
    >
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] [@media(max-height:500px)]:grid-cols-2 [@media(max-height:500px)]:gap-4">
        <FighterHero id={player} label="You fight as" />

        <div className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-xl">Choose a fighter</h2>
            <span className="text-right text-xs text-cream/50">Two hits for everyone: speed, size and shove differ</span>
          </div>
          <FighterCards value={player} onPick={pick} portraits={portraits} />

          <div className="panel-cut flex flex-col gap-2 bg-ink/80 p-3 backdrop-blur">
            <span className="text-[10px] font-semibold tracking-widest text-cream/50">YOUR RIVAL</span>
            <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Rival">
              {(['random', ...ROSTER.map((r) => r.id)] as const).map((id) => {
                const on = opponent === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setOpponent(id)}
                    className={`panel-cut flex items-center justify-center gap-1 px-1 py-2 text-xs font-bold sm:text-sm ${on ? 'bg-gold text-ink-deep' : 'bg-cream/10 hover:bg-cream/15'}`}
                    style={!on && id !== 'random' ? { color: accentOf(id) } : undefined}
                  >
                    {id === 'random' ? '?  Random' : CHARACTERS[id].name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/play" className="panel-cut bg-cream/10 px-5 py-3 text-sm font-bold uppercase tracking-wider text-cream/90 hover:bg-cream/20">
              Play online instead
            </Link>
            <Link
              href={href}
              className="panel-cut group fixed inset-x-4 bottom-4 z-20 flex items-center justify-center gap-3 bg-gold px-10 py-4 font-display text-xl uppercase text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.35)] transition hover:brightness-110 sm:static"
            >
              Fight as {CHARACTERS[player].name}
              <span className="transition group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </section>
      <Steps />
    </MenuShell>
  );
};
