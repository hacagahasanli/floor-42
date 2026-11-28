import { MainMenu } from '~/components/menu/MainMenu';
import { OnlineLobby } from '~/components/OnlineLobby';
import { ONLINE_ENABLED } from '~/lib/features';
import { pageUrlMeta } from '~/lib/siteMeta';

import type { Metadata } from 'next';

// Invite links (?room=) all collapse to one canonical page (growth E-5). While online is parked the page is the main menu,
// so it points at the home page instead of being a second copy of it.
export const metadata: Metadata = ONLINE_ENABLED ? { title: 'Play online', ...pageUrlMeta('/play') } : pageUrlMeta('/');

interface Props {
  searchParams: Promise<{ room?: string }>;
}

const PlayPage = async ({ searchParams }: Props) => {
  // Online parked (src/lib/features.ts): old invite links and bookmarks land on the menu, not on a lobby with no server.
  if (!ONLINE_ENABLED) return <MainMenu />;
  const { room } = await searchParams;
  const roomId = room && /^[\w-]{4,32}$/.test(room) ? room : undefined;
  return <OnlineLobby roomId={roomId} />;
};

export default PlayPage;
