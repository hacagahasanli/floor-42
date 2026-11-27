// MULTI_REGION=1 npm run server (port 2567): quick match pairs players of the same tier only.
import { Client } from '@colyseus/sdk';

import { PROTOCOL_VERSION } from '../../src/game/net/protocol';

const url = process.argv[2] ?? 'ws://localhost:2567';
const join = (tier: number | undefined, v = PROTOCOL_VERSION) => new Client(url).joinOrCreate('duel', { character: 'hotfix', v, tier });
const a = await join(60);
const b = await join(100);
const c = await join(60);
console.log('A (60) and C (60) share a room:', a.roomId === c.roomId, '| B (100) is alone:', b.roomId !== a.roomId);
const d = await join(undefined);
console.log('a client that sends no tier matches any open room (a waiting one):', d.roomId === b.roomId);
const old = await join(60, 2).then(() => 'JOINED (wrong)', (e) => `refused: ${e.code} ${e.message}`);
console.log('client on protocol 2:', old);
process.exit(0);
