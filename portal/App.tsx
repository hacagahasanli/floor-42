/**
 * The portal's whole app: a hash router over the same screens as the site's pages (src/app/*), the page-wide settings
 * attributes, and the platform hooks (loading, the portal's sound switch). No home page of ours, no stats, no links out.
 */
import { useEffect, useState } from 'react';

import { ArenaGame } from '~/components/ArenaGame';
import { MainMenu } from '~/components/menu/MainMenu';
import { SettingsRoot } from '~/components/menu/SettingsRoot';
import { getSettings } from '~/game/settings';
import { isCharacterId, ROSTER } from '~/game/roster';
import { parseLength } from '~/game/twoPlayer';
import { getPlatform } from '~/platform';

import { parseHash } from './route';

import type { CharacterId } from '~/game/sim/types';

const pickOther = (not: CharacterId): CharacterId => {
  const others = ROSTER.filter((r) => r.id !== not);
  return others[Math.floor(Math.random() * others.length)].id;
};

const Screen = ({ hash }: { hash: string }) => {
  const { path, query } = parseHash(hash);
  if (path === '/arena') {
    const bot = query.get('bot');
    const level = bot === 'easy' || bot === 'hard' ? bot : 'normal';
    const p1 = query.get('p1');
    const p2 = query.get('p2');
    const player: CharacterId = isCharacterId(p1) ? p1 : 'hotfix';
    if (query.get('mode') === '2p') {
      const p2Pick: CharacterId = isCharacterId(p2) ? p2 : player;
      return <ArenaGame player={player} opponent={p2Pick} twoPlayer={{ kosToWin: parseLength(query.get('n')) }} />;
    }
    const opponent: CharacterId = isCharacterId(p2) ? p2 : pickOther(player);
    return <ArenaGame player={player} opponent={opponent} demo={query.has('demo')} level={level} />;
  }
  // One fighter screen: #/characters opens the main menu on its fighter select.
  if (path === '/characters') return <MainMenu openSelect />;
  // Online is off in the portal build for now (bot play only): /play falls through to the menu.
  const p1 = query.get('p1');
  const p2 = query.get('p2');
  const twoPlayer = query.has('2p')
    ? {
        p1: isCharacterId(p1) ? p1 : undefined,
        p2: isCharacterId(p2) ? p2 : undefined,
        n: parseLength(query.get('n')),
        keep: query.has('keep'),
      }
    : undefined;
  return <MainMenu openSelect={query.has('select')} twoPlayer={twoPlayer} />;
};

export const App = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // The portal's sound switch wins over the player's setting (never saved).
  useEffect(() => {
    const platform = getPlatform();
    const store = getSettings();
    store.setExternalMute(platform.muted());
    return platform.onMutedChange((m) => store.setExternalMute(m));
  }, []);

  // Loading ends when the first screen has painted.
  useEffect(() => {
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        getPlatform().loadingStop();
        document.getElementById('boot')?.remove();
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <SettingsRoot />
      {/* Keyed by the whole hash: a new screen, or the same screen with new choices, starts fresh (as a page load does on the site). */}
      <Screen key={hash} hash={hash} />
    </>
  );
};
