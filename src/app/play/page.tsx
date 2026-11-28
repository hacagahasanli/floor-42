import { MainMenu } from '~/components/menu/MainMenu';
import { OnlineLobby } from '~/components/OnlineLobby';
import { roomFromQuery } from '~/game/net/roomCode';
import { ONLINE_ENABLED } from '~/lib/features';
import { pageUrlMeta } from '~/lib/siteMeta';

import type { Metadata } from 'next';

// Invite links (?room=) all collapse to one canonical page (growth E-5). While online is parked the page is the main menu,
// so it points at the home page instead of being a second copy of it.
export const metadata: Metadata = ONLINE_ENABLED ? { title: 'Play online', ...pageUrlMeta('/play') } : pageUrlMeta('/');

interface Props {
  searchParams: Promise<{ room?: string; r?: string }>;
}

const PlayPage = async ({ searchParams }: Props) => {
  // Online parked (src/lib/features.ts): old invite links and bookmarks land on the menu, not on a lobby with no server.
  if (!ONLINE_ENABLED) return <MainMenu />;
  const { room, r } = await searchParams;
  // R-033: a 5-character code is case-free (normalised to upper case); an old Colyseus id is kept exactly.
  const roomId = roomFromQuery(room);
  const region = r && /^[a-z0-9-]{2,12}$/.test(r) ? r : undefined;
  return <OnlineLobby roomId={roomId} region={region} />;
};

export default PlayPage;
