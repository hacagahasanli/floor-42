import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MATCH_TIMING } from '~/game/net/matchmaking';

import { barsFor, createPingWindow, nextBars } from './netBands';
import { botClock, classifyError, connectingView, errorView, foundLine, NET_COPY, ONLINE_COPY, regionName, searchView } from './onlineCopy';

const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');

describe('search copy (spec 3.3, F-077): every leg, one and several regions', () => {
  it('the bot moment in the copy comes from MATCH_TIMING', () => {
    expect(botClock()).toBe(`0:${String(Math.ceil(MATCH_TIMING.BOT_DUE_MS / 1000)).padStart(2, '0')}`);
    expect(botClock(8500)).toBe('0:09');
  });

  it('one region (today): two rows, no region names', () => {
    const v = searchView('bot', { home: 'fra' });
    expect(v.line).toBe('Looking for a player. Nobody by about 0:09? A BOT steps in.');
    expect(v.steps.map((s) => [s.title, s.state, s.sub])).toEqual([
      ['NEAR YOU', 'now', 'The fastest connection for you'],
      ['BOT BACKUP', 'wait', 'Nobody free by about 0:09? A BOT plays you'],
    ]);
    expect(v.botIncoming).toBe(false);
  });

  it('several regions: home, fallback and bot rows exactly as the spec', () => {
    const r = { home: 'fra', next: 'iad' };
    const home = searchView('home', r);
    expect(home.line).toBe('Looking for a player near you.');
    expect(home.steps.map((s) => [s.title, s.state, s.sub])).toEqual([
      ['NEAR YOU · EUROPE', 'now', 'The fastest connection for you'],
      ['NEXT REGION · US EAST', 'wait', "Only if it's still quick to reach"],
      ['BOT BACKUP', 'wait', 'Nobody free by about 0:09? A BOT plays you'],
    ]);
    const fb = searchView('fallback', r);
    expect(fb.line).toBe('Nobody near you yet. Checking next door.');
    expect(fb.steps.map((s) => [s.state, s.sub])).toEqual([
      ['skip', 'Nobody free'],
      ['now', 'Still quick to reach from you'],
      ['wait', 'Nobody free by about 0:09? A BOT plays you'],
    ]);
    const bot = searchView('bot', r);
    expect(bot.line).toBe('Nobody free right now. A BOT is on its way.');
    expect(bot.steps.map((s) => [s.state, s.sub])).toEqual([
      ['skip', 'Nobody free'],
      ['skip', 'Nobody free'],
      ['now', 'A player can still grab the seat first'],
    ]);
    expect(bot.botIncoming).toBe(true);
  });

  it('region names, found line, connecting line', () => {
    expect(regionName('fra')).toBe('EUROPE');
    expect(regionName('gru')).toBe('SOUTH AMERICA');
    expect(regionName('lax')).toBe('LAX');
    expect(foundLine('fra', true)).toBe('A player from Europe is in. Shaking hands…');
    expect(foundLine('iad', true)).toBe('A player from US East is in. Shaking hands…');
    expect(foundLine('fra', false)).toBe('A player is in. Shaking hands…');
    expect(connectingView(200, false).line).toBe('Reaching the game server.');
    expect(connectingView(200, true).line).toBe('Finding the fastest server for you.');
    expect(connectingView(1600, false)).toEqual({ line: 'Waking up the game server.', small: "It naps when nobody's playing. A few seconds, tops." });
  });

  it('the dead 30 s "quiet" suggestion is gone (F-077)', () => {
    expect(read('src/components/OnlineLobby.tsx')).not.toMatch(/isQuiet|QUIET_AFTER/);
  });
});

describe('lobby errors (spec 3.5): no raw technical text, a short support code instead', () => {
  it('each case', () => {
    expect(errorView('server').ribbon).toBe("CAN'T REACH ONLINE");
    expect(errorView('server').primary.label).toBe('TRY AGAIN');
    expect(errorView('server').secondary.label).toBe('PLAY VS BOT');
    expect(errorView('server').code).toBe('E-WS');
    expect(errorView('lost').ribbon).toBe('LOST THE CONNECTION');
    expect(errorView('room').ribbon).toBe('THAT ROOM IS GONE');
    expect(errorView('room').primary.label).toBe('QUICK MATCH');
    expect(errorView('room').secondary.label).toBe('ENTER ANOTHER CODE');
    expect(errorView('full').ribbon).toBe('THAT ROOM IS FULL');
    expect(errorView('version').ribbon).toBe('NEW VERSION OUT');
    expect(errorView('version').line).toBe('PEWFIELD just got an update. Reload to play online.');
    for (const k of ['server', 'lost', 'room', 'full', 'version'] as const) {
      const v = errorView(k);
      expect(`${v.line} ${v.small ?? ''}`).not.toMatch(/websocket|turn|relay|region id|authority/i);
    }
  });

  it('classify', () => {
    expect(classifyError('quick', new Error('WebSocket connection failed'))).toBe('server');
    expect(classifyError('join', new Error('room "x" not found'))).toBe('room');
    expect(classifyError('join', new Error('room is locked'))).toBe('full');
    expect(classifyError('quick', Object.assign(new Error('This page is out of date. Reload it to play online.'), { code: 4426 }))).toBe('version');
    expect(classifyError('quick', new Error('left 4000'), true)).toBe('lost');
  });
});

describe('ping pill bands (spec 5.1, D9)', () => {
  it('3 / 2 / 1 bars at 40 / 80 / 140 ms', () => {
    expect(barsFor(40)).toBe(3);
    expect(barsFor(80)).toBe(2);
    expect(barsFor(140)).toBe(1);
  });

  it('no flicker at 58-62 ms: the band moves only 10 ms past the edge', () => {
    let b = nextBars(null, 58);
    expect(b).toBe(3);
    for (const ms of [61, 62, 59, 66, 70]) b = nextBars(b, ms);
    expect(b).toBe(3);
    b = nextBars(b, 71);
    expect(b).toBe(2);
    for (const ms of [59, 55, 51]) b = nextBars(b, ms);
    expect(b).toBe(2);
    b = nextBars(b, 49);
    expect(b).toBe(3);
  });

  it('median of the last 2 s', () => {
    const w = createPingWindow(2000);
    w.push(0, 300);
    w.push(1000, 40);
    w.push(1500, 50);
    expect(w.median()).toBe(50);
    w.push(2600, 44); // drops the 300 at t 0
    expect(w.median()).toBe(44);
  });

  it('copy: no mode words on screen, only in the title', () => {
    expect(NET_COPY.shaky).toBe('SHAKY CONNECTION · MOVES MAY LAG');
    expect(NET_COPY.ms(42.4)).toBe('42 MS');
    expect(NET_COPY.title(42, 'direct')).toBe('Round trip 42 ms · direct line');
  });
});

describe('copy is the spec verbatim (spot checks)', () => {
  it('menu and bot', () => {
    expect(ONLINE_COPY.menu.title).toBe('PLAY ONLINE');
    expect(ONLINE_COPY.menu.promise.join('')).toBe('A player near you. Nobody free? A BOT steps in.');
    expect(ONLINE_COPY.bot.offlineLine).toBe("Online isn't answering, so it's you vs a BOT.");
    expect(ONLINE_COPY.bot.role).toBe('PLAYED BY A BOT');
  });
});

describe('R-032 acceptance (static)', () => {
  const arena = read('src/components/ArenaGame.tsx');
  const lobby = read('src/components/OnlineLobby.tsx') + read('src/components/online/LobbyScreen.tsx');
  it('online never mounts LiftLoading (F-079): only the demo keeps the lift; online loads behind the VS doors', () => {
    const uses = [...arena.matchAll(/\{lift && ([^(]*)\(\s*<LiftLoading/g)].map((m) => m[1].trim());
    expect(uses).toEqual(['demo &&']);
    expect(arena).toMatch(/\{lift && !demo && \(\s*<VsRun/);
    expect(arena).toMatch(/vsTags\(tp \? '2p' : online && !onlineBot \? 'online' : '1p', level\)/);
  });
  it('/play has no 3D office scene, no old logo, no office tips (F-076, F-079)', () => {
    expect(lobby).not.toMatch(/LobbyScene|lobbyScene|▲ 42|Desks and the meeting/);
  });
  it('the silent server-down bot is gone: that path shows the bot-offline frame (F-078)', () => {
    expect(read('src/components/OnlineLobby.tsx')).toMatch(/startLocalBot\(run, true, pressedAt\)/);
    expect(read('src/components/online/LobbyScreen.tsx')).toMatch(/ui\.offline \? T\.bot\.offlineLine : T\.bot\.line/);
  });
  it('no engineering words on the in-match net UI (F-080)', () => {
    expect(arena).not.toMatch(/NetBadge|Connection unstable/);
  });
});

describe('R-034 review follow-ups (F-085, F-086, F-087)', () => {
  it('copy after case-free codes and the joining frame', () => {
    expect(ONLINE_COPY.code.caseNote).toBe('5 letters or numbers. Small letters work too.');
    expect(ONLINE_COPY.invite.readOut).toEqual(['Read it out', 'or send the link']);
    expect(ONLINE_COPY.code.joiningCheck).toBe('Checking…');
    expect(ONLINE_COPY.code.joiningRole).toBe('KNOCKING…');
    expect(ONLINE_COPY.code.friendRole).toBe('WAITING FOR A CODE');
  });
  it('the VS doors ribbon draws the on-dark flag; other flags stay', () => {
    expect(read('src/components/VsDoors.tsx')).toMatch(/<Icon name="flagOnDark" size=\{24\} \/>/);
    expect(read('src/components/VsDoors.tsx')).not.toMatch(/<Icon name="flag" /);
  });
});
