import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { ROOM_NAME } from '../src/game/net/protocol';
import { RULES } from '../src/game/sim/constants';

import { DuelRoom } from './DuelRoom';

const port = Number(process.env.PORT ?? 2567);

// Test hook: shorter matches for automated end-of-match checks.
if (process.env.KOS_TO_WIN) RULES.kosToWin = Number(process.env.KOS_TO_WIN);

// /ping: the browser times it to find the nearest region (regions.ts) and the health check uses it. One tiny JSON
// answer, no state. REGION names this server in the answer (Fly sets FLY_REGION itself).
const region = process.env.REGION ?? process.env.FLY_REGION ?? 'local';
const server = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.get('/ping', (_req, res) => {
      res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.json({ region });
    });
  },
});
server.define(ROOM_NAME, DuelRoom);

server.listen(port, '0.0.0.0').then(() => {
  console.log(`Pewfield game server (${region}) on :${port}`);
});
