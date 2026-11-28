import { OnlineLobby } from '~/components/OnlineLobby';
import { pageUrlMeta } from '~/lib/siteMeta';

import type { Metadata } from 'next';

// Invite links (?room=) all collapse to one canonical page (growth E-5).
export const metadata: Metadata = { title: 'Play online', ...pageUrlMeta('/play') };

interface Props {
  searchParams: Promise<{ room?: string }>;
}

const PlayPage = async ({ searchParams }: Props) => {
  const { room } = await searchParams;
  const roomId = room && /^[\w-]{4,32}$/.test(room) ? room : undefined;
  return <OnlineLobby roomId={roomId} />;
};

export default PlayPage;
