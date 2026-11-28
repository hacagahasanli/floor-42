import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { ROOM_NAME } from '../src/game/net/protocol';
import { RULES } from '../src/game/sim/constants';

import { DuelRoom } from './DuelRoom';

const port = Number(process.env.PORT ?? 2567);

// Test hook: shorter matches for automated end-of-match checks.
if (process.env.KOS_TO_WIN) RULES.kosToWin = Number(process.env.KOS_TO_WIN);

// Multi-region mode (off unless MULTI_REGION=1; docs/TECHNICAL.md, "Regions"): a /ping route the browser
// times to find the nearest region, and quick match only pairs players of the same latency tier.
const multiRegion = process.env.MULTI_REGION === '1';
const server = new Server({
  transport: new WebSocketTransport(),
  ...(multiRegion && {
    express: (app) => {
      app.get('/ping', (_req, res) => {
        res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.json({ region: process.env.FLY_REGION ?? 'local' });
      });
    },
  }),
});
const duel = server.define(ROOM_NAME, DuelRoom);
if (multiRegion) duel.filterBy(['tier']);

server.listen(port, '0.0.0.0').then(() => {
  console.log(`Floor 42 game server on :${port}`);
});
