import { ArenaGame } from '~/components/ArenaGame';
import { isCharacterId, ROSTER } from '~/game/roster';
import { parseLength } from '~/game/twoPlayer';

import type { CharacterId } from '~/game/sim/types';
import type { Metadata } from 'next';

// Endless ?p1=&p2=&bot= variants with no content of their own: keep them out of the index (growth E-5).
export const metadata: Metadata = { title: 'Arena', robots: { index: false, follow: true } };

interface Props {
  searchParams: Promise<{ p1?: string; p2?: string; demo?: string; bot?: string; mode?: string; n?: string; arena?: string }>;
}

const pickOther = (not: CharacterId): CharacterId => {
  const others = ROSTER.filter((r) => r.id !== not);
  return others[Math.floor(Math.random() * others.length)].id;
};

const ArenaPage = async ({ searchParams }: Props) => {
  const { p1, p2, demo, bot, mode, n, arena } = await searchParams;
  const level = bot === 'easy' || bot === 'hard' ? bot : 'normal';
  const player: CharacterId = isCharacterId(p1) ? p1 : 'hotfix';
  const opponent: CharacterId = isCharacterId(p2) ? p2 : pickOther(player);
  // `mode=2p`: local 2-player on one keyboard, P1 = p1, P2 = p2, first to n (3, 5 or 7).
  if (mode === '2p') {
    const p2Pick: CharacterId = isCharacterId(p2) ? p2 : player;
    return <ArenaGame player={player} opponent={p2Pick} twoPlayer={{ kosToWin: parseLength(n) }} arena={arena} />;
  }
  return <ArenaGame player={player} opponent={opponent} demo={demo !== undefined} level={level} arena={arena} />;
};

export default ArenaPage;
