import { OnlineLobby } from '~/components/OnlineLobby';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Play online' };

interface Props {
  searchParams: Promise<{ room?: string }>;
}

const PlayPage = async ({ searchParams }: Props) => {
  const { room } = await searchParams;
  const roomId = room && /^[\w-]{4,32}$/.test(room) ? room : undefined;
  return <OnlineLobby roomId={roomId} />;
};

export default PlayPage;
