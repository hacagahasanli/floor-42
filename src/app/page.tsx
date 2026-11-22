import { MainMenu } from '~/components/menu/MainMenu';
import { isCharacterId } from '~/game/roster';
import { parseLength } from '~/game/twoPlayer';

interface Props {
  searchParams: Promise<{ select?: string; '2p'?: string; p1?: string; p2?: string; n?: string; keep?: string }>;
}

/**
 * The main menu; `/?select` (older links) opens straight on the fighter select, which now lives at /characters; `/?2p` on the
 * 2-player select (from a 2-player match's "Change fighters": picks and length kept, tally kept with `keep`).
 */
const HomePage = async ({ searchParams }: Props) => {
  const q = await searchParams;
  const twoPlayer =
    q['2p'] !== undefined
      ? {
          p1: isCharacterId(q.p1) ? q.p1 : undefined,
          p2: isCharacterId(q.p2) ? q.p2 : undefined,
          n: parseLength(q.n),
          keep: q.keep !== undefined,
        }
      : undefined;
  return <MainMenu openSelect={q.select !== undefined} twoPlayer={twoPlayer} />;
};

export default HomePage;
