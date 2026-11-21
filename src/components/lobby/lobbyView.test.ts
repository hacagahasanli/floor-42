import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  backKeyAction,
  backKeyDisabled,
  escapeAction,
  showEscChip,
  FORCED_STATES,
  FRAMING,
  formatElapsed,
  isQuiet,
  layoutOf,
  lobbyView,
  parseRoomInput,
  readForcedState,
} from './lobbyView';

import type { LobbyInput } from './lobbyView';

const base: LobbyInput = { stage: 'menu', online: true, developer: false, kos: 5 };
const view = (o: Partial<LobbyInput>) => lobbyView({ ...base, ...o });

describe('connection line and rival plate per stage (spec 7.1)', () => {
  it('menu, online: a green static dot, and no claim about the server', () => {
    expect(view({})).toMatchObject({
      dot: 'green',
      pulse: false,
      centre: '1v1 · first to 5',
      rival: 'Not here yet',
      panel: 'menu',
      spot: 'idle',
      offline: false,
    });
  });
  it('menu, developer copy', () => {
    expect(view({ developer: true }).centre).toBe('1v1 · first to 5 takes the merge');
  });
  it('menu, offline: No internet, orange, the online buttons are disabled by the page', () => {
    expect(view({ online: false })).toMatchObject({
      dot: 'orange',
      pulse: false,
      centre: 'No internet',
      rival: "Can't reach anyone",
      offline: true,
      panel: 'menu',
    });
  });
  it('connecting', () => {
    expect(view({ stage: 'connecting' })).toMatchObject({
      dot: 'gold',
      pulse: true,
      centre: 'Connecting…',
      rival: 'Calling the lift…',
      panel: 'connecting',
      spot: 'idle',
    });
  });
  it('joining from a link names the room', () => {
    expect(view({ stage: 'connecting', joining: 'AbC12' })).toMatchObject({
      centre: 'Joining room AbC12',
      rival: 'Opening the door…',
      panel: 'connecting',
    });
  });
  it('waiting in an invite room', () => {
    expect(view({ stage: 'waiting', invite: true })).toMatchObject({
      dot: 'gold',
      pulse: true,
      centre: 'Room open',
      rival: 'Waiting for them to open the link',
      panel: 'invite',
      spot: 'searching',
      rivalSearching: true,
    });
  });
  it('waiting in a quick-match search shows the elapsed time', () => {
    expect(view({ stage: 'waiting', invite: false, elapsed: 12 })).toMatchObject({
      centre: 'Searching · 0:12',
      rival: 'Searching',
      panel: 'quick',
      spot: 'searching',
    });
    expect(view({ stage: 'waiting', invite: false, elapsed: 75 }).centre).toBe('Searching · 1:15');
  });
  it('linking: the rival is found, red and solid', () => {
    expect(view({ stage: 'linking' })).toMatchObject({
      dot: 'red',
      pulse: false,
      centre: 'Rival found',
      rival: 'Connecting you directly…',
      panel: 'found',
      spot: 'found',
      rivalFound: true,
    });
  });
  it('error: orange, the cutout tips over', () => {
    expect(view({ stage: 'error' })).toMatchObject({
      dot: 'orange',
      centre: 'Disconnected',
      rival: "Can't reach anyone",
      panel: 'error',
      spot: 'error',
    });
  });
  it('never calls a connecting or failed state online', () => {
    for (const stage of ['connecting', 'waiting', 'linking', 'error'] as const) {
      expect(view({ stage }).centre.toLowerCase()).not.toContain('online');
    }
  });
});

describe('search clock', () => {
  it('formats m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(9)).toBe('0:09');
    expect(formatElapsed(61.9)).toBe('1:01');
    expect(formatElapsed(-3)).toBe('0:00');
  });
  it('suggests the invite or the bot from 30 s', () => {
    expect(isQuiet(29)).toBe(false);
    expect(isQuiet(30)).toBe(true);
  });
});

describe('layout classes and framing', () => {
  it('picks the three review sizes', () => {
    expect(layoutOf(1440, 900)).toBe('desktop');
    expect(layoutOf(390, 844)).toBe('portrait');
    expect(layoutOf(844, 390)).toBe('landscape');
  });
  it('picks the smallest sizes the spec must fit', () => {
    expect(layoutOf(360, 740)).toBe('portrait');
    expect(layoutOf(667, 375)).toBe('landscape');
  });
  it('treats tablets and narrow windows as portrait structure', () => {
    expect(layoutOf(768, 1024)).toBe('portrait');
    expect(layoutOf(900, 700)).toBe('portrait');
    expect(layoutOf(1024, 768)).toBe('desktop');
  });
  it('keeps the fighter inside the viewport in every layout', () => {
    for (const f of Object.values(FRAMING)) {
      expect(f.x).toBeGreaterThan(0.2);
      expect(f.x).toBeLessThan(0.8);
      expect(f.y - f.height).toBeGreaterThan(0.05);
      expect(f.y).toBeLessThan(0.95);
    }
  });
});

describe('room input', () => {
  it('takes a bare code as typed, keeping the case', () => {
    expect(parseRoomInput('  AbC12 ')).toBe('AbC12');
  });
  it('takes the room of an invite link', () => {
    expect(parseRoomInput('https://floor42.nalbakigames.com/play?room=AbC12')).toBe('AbC12');
  });
  it('a link without a room is empty, so Join does nothing', () => {
    expect(parseRoomInput('https://floor42.nalbakigames.com/play')).toBe('');
  });
});

describe('dev-only ?lobbyState= switch', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('accepts every documented state outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    for (const s of FORCED_STATES) expect(readForcedState(`?lobbyState=${s}`)).toBe(s);
  });
  it('ignores unknown values', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(readForcedState('?lobbyState=nope')).toBeNull();
    expect(readForcedState('')).toBeNull();
  });
  it('is off in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(readForcedState('?lobbyState=error')).toBeNull();
  });
});

describe('Back key and Esc (spec 15.3)', () => {
  const panels = ['menu', 'connecting', 'invite', 'quick', 'found', 'error'] as const;
  it('idle: the Back key and Esc both go home', () => {
    expect(backKeyAction('menu')).toBe('home');
    expect(escapeAction('menu')).toBe('home');
  });
  it('a search or an open room: Back cancels and then goes home, Esc only cancels', () => {
    for (const p of ['connecting', 'invite', 'quick'] as const) {
      expect(backKeyAction(p)).toBe('cancel-home');
      expect(escapeAction(p)).toBe('cancel');
    }
  });
  it('an error: Back leaves the lobby, Esc does nothing (Back and Try again are on screen)', () => {
    expect(backKeyAction('error')).toBe('cancel-home');
    expect(escapeAction('error')).toBe('none');
  });
  it('while the rival is found nothing can abort the starting match', () => {
    expect(backKeyAction('found')).toBe('none');
    expect(escapeAction('found')).toBe('none');
    expect(backKeyDisabled('found')).toBe(true);
    for (const p of panels.filter((x) => x !== 'found')) expect(backKeyDisabled(p)).toBe(false);
  });
  it('the Esc chip shows only in the idle menu and only without touch', () => {
    expect(showEscChip('menu', false)).toBe(true);
    expect(showEscChip('menu', true)).toBe(false);
    for (const p of panels.filter((x) => x !== 'menu')) expect(showEscChip(p, false)).toBe(false);
  });
});
