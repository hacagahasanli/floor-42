import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { ROOM_NAME } from '../src/game/net/protocol';
import { RULES } from '../src/game/sim/constants';

import { DuelRoom } from './DuelRoom';

const port = Number(process.env.PORT ?? 2567);

// Test hook: shorter matches for automated end-of-match checks.
if (process.env.KOS_TO_WIN) RULES.kosToWin = Number(process.env.KOS_TO_WIN);

const server = new Server({ transport: new WebSocketTransport() });
server.define(ROOM_NAME, DuelRoom);

server.listen(port, '0.0.0.0').then(() => {
  console.log(`Floor 42 game server on :${port}`);
});
