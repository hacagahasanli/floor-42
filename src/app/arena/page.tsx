import { ArenaGame } from '~/components/ArenaGame';
import { isCharacterId, ROSTER } from '~/game/roster';

import type { CharacterId } from '~/game/sim/types';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Arena' };

interface Props {
  searchParams: Promise<{ p1?: string; p2?: string; demo?: string }>;
}

const pickOther = (not: CharacterId): CharacterId => {
  const others = ROSTER.filter((r) => r.id !== not);
  return others[Math.floor(Math.random() * others.length)].id;
};

const ArenaPage = async ({ searchParams }: Props) => {
  const { p1, p2, demo } = await searchParams;
  const player: CharacterId = isCharacterId(p1) ? p1 : 'hotfix';
  const opponent: CharacterId = isCharacterId(p2) ? p2 : pickOther(player);
  return <ArenaGame player={player} opponent={opponent} demo={demo !== undefined} />;
};

export default ArenaPage;
