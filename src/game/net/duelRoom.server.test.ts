// The real game server room (server/DuelRoom.ts) on a local port, with real SDK clients: the bot fallback, the human
// pair, invites, and a human who arrives while a bot match runs. Real time (the server ticks at 60 Hz), so a few seconds.
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client } from '@colyseus/sdk';

import { DuelRoom, SERVER_BOT_LEVEL } from '../../../server/DuelRoom';
import { decodeSnapshot, encodeInput, PROTOCOL_VERSION, ROOM_NAME } from './protocol';
import { EMPTY_INPUT } from '../sim/types';

import type { StartMessage } from './protocol';
import type { Room } from '@colyseus/sdk';

const port = 25_000 + Math.floor(Math.random() * 5_000);
const url = `ws://127.0.0.1:${port}`;
let server: Server;

beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport() });
  server.define(ROOM_NAME, DuelRoom);
  await server.listen(port, '127.0.0.1');
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Resolves with the first message of `type`, or null after `ms`. */
const next = <T,>(room: Room, type: string, ms = 4000) =>
  new Promise<T | null>((res) => {
    const t = setTimeout(() => res(null), ms);
    room.onMessage(type, (m: T) => {
      clearTimeout(t);
      res(m);
    });
  });
const next2 = <T,>(room: Room, type: string, ms = 4000) => next<T>(room, type, ms);
const quiet = (room: Room) => {
  for (const t of ['waiting', 'peer', 'start', 'snap', 'pauseState', 'left', 'dropped', 'back', 'signal']) room.onMessage(t, () => {});
};
const opts = (extra: Record<string, unknown> = {}) => ({ character: 'hotfix', v: PROTOCOL_VERSION, ...extra });

describe('DuelRoom on a real server', () => {
  it('a lone quick-match player gets the server bot after the delay it asked for; the start says BOT and the level', async () => {
    const t0 = performance.now();
    const room = await new Client(url).joinOrCreate(ROOM_NAME, opts({ bot: 600 }));
    const waiting = next<{ roomId: string }>(room, 'waiting');
    const start = next<StartMessage>(room, 'start');
    const snaps: string[] = [];
    room.onMessage('snap', (raw: string) => snaps.push(raw));
    room.onMessage('peer', () => {
      throw new Error('a bot match must not try a direct line');
    });
    expect(await waiting).toBeTruthy();
    const msg = await start;
    const took = performance.now() - t0;
    expect(msg).not.toBeNull();
    expect(took).toBeGreaterThanOrEqual(550);
    expect(took).toBeLessThan(2000);
    expect(msg!.bot).toEqual({ slot: 1 - msg!.slot, level: SERVER_BOT_LEVEL });
    expect(msg!.characters[msg!.bot!.slot]).not.toBe('hotfix');
    expect(msg!.arena).toBe('offsite');
    // The server runs the bot on its tick: snapshots flow and the bot moves on its own once the fight starts (3.6 s).
    await wait(6000);
    expect(snaps.length).toBeGreaterThan(200);
    const first = decodeSnapshot(snaps[0]).state;
    const last = decodeSnapshot(snaps[snaps.length - 1]).state;
    expect(last.phase).toBe('fight');
    expect(last.arena).toBe('offsite');
    const b = msg!.bot!.slot;
    const moved = Math.hypot(last.fighters[b].x - first.fighters[b].x, last.fighters[b].y - first.fighters[b].y);
    expect(moved + last.fighters[b].stats.shots).toBeGreaterThan(0.5);
    // Against the bot a pause is instant (one request, as offline), and the bot is never shown as asking.
    const paused = next<{ requests: boolean[]; paused: boolean }>(room, 'pauseState');
    room.send('pause');
    const p = await paused;
    expect(p?.paused).toBe(true);
    expect(p?.requests[b]).toBe(false);
    await room.leave();
  }, 20_000);

  it('two quick-match players meet each other (no bot), even when the second asked for one', async () => {
    const a = await new Client(url).joinOrCreate(ROOM_NAME, opts({ bot: 3000 }));
    a.onMessage('snap', () => {});
    const aPeer = next(a, 'peer');
    const aStart = next<StartMessage>(a, 'start', 9000);
    const b = await new Client(url).joinOrCreate(ROOM_NAME, opts({ character: 'legacy', bot: 300 }));
    const bStart = next<StartMessage>(b, 'start', 9000);
    b.onMessage('snap', () => {});
    expect(b.roomId).toBe(a.roomId);
    expect(await aPeer).toBeTruthy();
    // No direct line in this test: both say so, the server starts in server mode.
    a.send('direct', { ok: false });
    b.send('direct', { ok: false });
    const [sa, sb] = await Promise.all([aStart, bStart]);
    expect(sa?.bot).toBeUndefined();
    expect(sb?.bot).toBeUndefined();
    expect(sa?.characters).toEqual(['hotfix', 'legacy']);
    // Past the bot delays: still the same two humans, nobody kicked.
    await wait(3500);
    expect(a.connection.isOpen && b.connection.isOpen).toBe(true);
    quiet(a);
    quiet(b);
    await a.leave();
    await b.leave();
  }, 20_000);

  it('a human who arrives during a bot match is not put into it: a new room, waiting for the next match', async () => {
    const a = await new Client(url).joinOrCreate(ROOM_NAME, opts({ bot: 200 }));
    quiet(a);
    const start = next<StartMessage>(a, 'start');
    expect((await start)?.bot).toBeDefined();
    const late = await new Client(url).joinOrCreate(ROOM_NAME, opts({ character: 'legacy' }));
    const waiting = next<{ roomId: string }>(late, 'waiting');
    expect(late.roomId).not.toBe(a.roomId);
    expect(await waiting).toBeTruthy();
    // A link to the bot room is refused too (the room is locked).
    await expect(new Client(url).joinById(a.roomId, opts())).rejects.toBeTruthy();
    // The bot match goes on.
    let snaps = 0;
    a.onMessage('snap', () => (snaps += 1));
    await wait(500);
    expect(snaps).toBeGreaterThan(15);
    quiet(late);
    await late.leave();
    await a.leave();
  }, 15_000);

  it('an invite room never gets a bot (the friend is on the way), and the link joins it', async () => {
    const host = await new Client(url).create(ROOM_NAME, opts({ private: true, bot: 100 }));
    // R-033: an invite room's id is its 5-character code (no 0/O/1/I/L), so a code read out loud joins it.
    expect(host.roomId).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/);
    const start = next<StartMessage>(host, 'start', 1200);
    host.onMessage('waiting', () => {});
    expect(await start).toBeNull();
    host.onMessage('peer', () => {});
    const friend = await new Client(url).joinById(host.roomId, opts({ character: 'standup' }));
    const peer = next<{ slot: number; characters: string[] }>(friend, 'peer');
    // The fighters travel with `peer`, so the lobby shows who was found while the direct line is tried.
    expect((await peer)?.characters).toEqual(['hotfix', 'standup']);
    quiet(host);
    quiet(friend);
    await friend.leave();
    await host.leave();
  }, 10_000);

  it('the bot room closes when its human leaves', async () => {
    const a = await new Client(url).joinOrCreate(ROOM_NAME, opts({ bot: 100 }));
    quiet(a);
    await wait(400);
    const id = a.roomId;
    a.send('input', [encodeInput(1, EMPTY_INPUT)]);
    await a.leave();
    await wait(300);
    await expect(new Client(url).joinById(id, opts())).rejects.toBeTruthy();
  }, 10_000);

  it('browser-bot standby: a human who arrives while you play the bot is offered for your NEXT match, never mid-match', async () => {
    const a = await new Client(url).joinOrCreate(ROOM_NAME, opts());
    a.onMessage('waiting', () => {});
    const okBusy = next<{ ok: boolean }>(a, 'stateOk');
    a.send('state', { busy: true }); // A's search timed out: A plays the local bot
    expect((await okBusy)?.ok).toBe(true);
    const offers: boolean[] = [];
    let aPeer = false;
    a.onMessage('offer', (m: { on: boolean }) => offers.push(m.on));
    a.onMessage('peer', () => (aPeer = true));
    // B searches and lands in A's room: no match starts while A is busy.
    const b = await new Client(url).joinOrCreate(ROOM_NAME, opts({ character: 'legacy' }));
    expect(b.roomId).toBe(a.roomId);
    let bPeer = false;
    const bOffers: boolean[] = [];
    b.onMessage('peer', () => (bPeer = true));
    b.onMessage('offer', (m: { on: boolean }) => bOffers.push(m.on));
    await wait(400);
    expect(aPeer || bPeer).toBe(false);
    expect(offers).toEqual([]);
    // A's bot match ends (result screen): A is offered B, nothing starts until A accepts.
    a.send('state', { busy: false });
    await wait(300);
    expect(offers).toEqual([true]);
    expect(aPeer || bPeer).toBe(false);
    expect(bOffers).toEqual([]); // B is searching (accepted already)
    // A accepts: both get the direct-line handshake, i.e. the match starts.
    a.send('state', { accept: true });
    await wait(300);
    expect(aPeer && bPeer).toBe(true);
    // Too late to go busy now: the server says so.
    const late = next<{ ok: boolean }>(b, 'stateOk');
    b.send('state', { busy: true });
    expect((await late)?.ok).toBe(false);
    quiet(a);
    quiet(b);
    await a.leave();
    await b.leave();
  }, 10_000);

  it('standby: the offer is withdrawn when the other player starts a bot match first', async () => {
    const a = await new Client(url).joinOrCreate(ROOM_NAME, opts());
    a.onMessage('waiting', () => {});
    a.send('state', { busy: true });
    const b = await new Client(url).joinOrCreate(ROOM_NAME, opts({ character: 'legacy' }));
    expect(b.roomId).toBe(a.roomId);
    const offers: boolean[] = [];
    a.onMessage('offer', (m: { on: boolean }) => offers.push(m.on));
    b.onMessage('stateOk', () => {});
    a.onMessage('stateOk', () => {});
    a.send('state', { busy: false });
    await wait(300);
    b.send('state', { busy: true }); // B's own search timed out: B plays its bot
    await wait(300);
    expect(offers).toEqual([true, false]);
    quiet(a);
    quiet(b);
    await a.leave();
    await b.leave();
  }, 10_000);

  it('a dropped searcher (closed tab, no match yet) frees the quick-match seat at once: the next player never meets a ghost', async () => {
    const ghost = await new Client(url).joinOrCreate(ROOM_NAME, opts());
    quiet(ghost);
    await wait(200);
    const id = ghost.roomId;
    // An unconsented close, as when a tab is closed or the network drops.
    await ghost.leave(false);
    await wait(300);
    const next = await new Client(url).joinOrCreate(ROOM_NAME, opts({ character: 'legacy' }));
    const waiting = next2(next, 'waiting');
    let peer = false;
    next.onMessage('peer', () => (peer = true));
    expect(await waiting).toBeTruthy();
    await wait(300);
    expect(peer).toBe(false);
    expect(next.roomId).not.toBe(id);
    quiet(next);
    await next.leave();
  }, 10_000);

  it('refuses a client of another protocol version', async () => {
    await expect(new Client(url).joinOrCreate(ROOM_NAME, { character: 'hotfix', v: 3 })).rejects.toBeTruthy();
  });
});
