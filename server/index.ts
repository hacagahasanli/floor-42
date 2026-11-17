import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { ROOM_NAME } from '../src/game/net/protocol';

import { DuelRoom } from './DuelRoom';

const port = Number(process.env.PORT ?? 2567);

const server = new Server({ transport: new WebSocketTransport() });
server.define(ROOM_NAME, DuelRoom);

server.listen(port, '0.0.0.0').then(() => {
  console.log(`Floor 42 game server on :${port}`);
});
