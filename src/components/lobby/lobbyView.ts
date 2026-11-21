/**
 * What the online lobby shows for each stage of the connection: the status dot, the line under the lift display,
 * the rival plate's line and which panel fills the right column. Pure, so every row of the spec's table is tested
 * without a browser. Copy is the lobby spec's (docs/collab/CREATIVE/ui/lobby-v2.md, section 7).
 */

export type LobbyStageKind = 'menu' | 'connecting' | 'waiting' | 'linking' | 'error';

export interface LobbyInput {
  stage: LobbyStageKind;
  /** waiting: a private room (invite) rather than a quick-match search. */
  invite?: boolean;
  /** connecting: the room code being joined from a link or the code row. */
  joining?: string;
  /** error: a failed join ("That room is gone") rather than a lost connection. */
  joinFailed?: boolean;
  /** Seconds since the search started. */
  elapsed?: number;
  /** navigator.onLine: only the browser's own network, never the game server. */
  online: boolean;
  developer: boolean;
  kos: number;
}

export type Dot = 'green' | 'orange' | 'gold' | 'red';
export type PanelKind = 'menu' | 'connecting' | 'invite' | 'quick' | 'found' | 'error';
/** The rival spot in the scene. */
export type RivalSpot = 'idle' | 'searching' | 'found' | 'error';

export interface LobbyView {
  dot: Dot;
  pulse: boolean;
  centre: string;
  rival: string;
  panel: PanelKind;
  spot: RivalSpot;
  /** The rival plate shows a name in red and a full bar. */
  rivalFound: boolean;
  /** The rival bar's red segment sweeps. */
  rivalSearching: boolean;
  offline: boolean;
}

/** m:ss, the elapsed search time. */
export const formatElapsed = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** After this long in a quick-match search the panel suggests inviting a friend or playing the bot. */
export const QUIET_AFTER = 30;
export const isQuiet = (elapsed: number) => elapsed >= QUIET_AFTER;

export const lobbyView = (i: LobbyInput): LobbyView => {
  const base = { rivalFound: false, rivalSearching: false, offline: false };
  switch (i.stage) {
    case 'menu':
      return i.online
        ? {
            ...base,
            dot: 'green',
            pulse: false,
            centre: i.developer
              ? `1v1 · first to ${i.kos} takes the merge`
              : `1v1 · first to ${i.kos}`,
            rival: 'Not here yet',
            panel: 'menu',
            spot: 'idle',
          }
        : {
            ...base,
            dot: 'orange',
            pulse: false,
            centre: 'No internet',
            rival: "Can't reach anyone",
            panel: 'menu',
            spot: 'idle',
            offline: true,
          };
    case 'connecting':
      return i.joining
        ? {
            ...base,
            dot: 'gold',
            pulse: true,
            centre: `Joining room ${i.joining}`,
            rival: 'Opening the door…',
            panel: 'connecting',
            spot: 'idle',
          }
        : {
            ...base,
            dot: 'gold',
            pulse: true,
            centre: 'Connecting…',
            rival: 'Calling the lift…',
            panel: 'connecting',
            spot: 'idle',
          };
    case 'waiting':
      return i.invite
        ? {
            ...base,
            dot: 'gold',
            pulse: true,
            centre: 'Room open',
            rival: 'Waiting for them to open the link',
            panel: 'invite',
            spot: 'searching',
            rivalSearching: true,
          }
        : {
            ...base,
            dot: 'gold',
            pulse: true,
            centre: `Searching · ${formatElapsed(i.elapsed ?? 0)}`,
            rival: 'Searching',
            panel: 'quick',
            spot: 'searching',
            rivalSearching: true,
          };
    case 'linking':
      return {
        ...base,
        dot: 'red',
        pulse: false,
        centre: 'Rival found',
        rival: 'Connecting you directly…',
        panel: 'found',
        spot: 'found',
        rivalFound: true,
      };
    case 'error':
      return {
        ...base,
        dot: 'orange',
        pulse: false,
        centre: 'Disconnected',
        rival: "Can't reach anyone",
        panel: 'error',
        spot: 'error',
      };
  }
};

/** The scene's layout class, from the viewport (the same three the CSS has). */
export type LobbyLayout = 'desktop' | 'portrait' | 'landscape';
export const layoutOf = (w: number, h: number): LobbyLayout => {
  if (w > h && h <= 500) return 'landscape';
  if (w >= 1024 && w >= h) return 'desktop';
  return 'portrait';
};

/** Where the fighter's feet sit on screen (share of the viewport) and how much of the height the fighter fills. */
export const FRAMING: Record<LobbyLayout, { x: number; y: number; height: number }> = {
  desktop: { x: 0.44, y: 0.66, height: 0.3 },
  portrait: { x: 0.4, y: 0.4, height: 0.25 },
  landscape: { x: 0.27, y: 0.8, height: 0.5 },
};

/** The room code a player typed or pasted: a bare code, or the `room` of an invite link. */
export const parseRoomInput = (text: string): string => {
  const t = text.trim();
  try {
    return new URL(t).searchParams.get('room') ?? '';
  } catch {
    return t;
  }
};

export type ForcedState =
  | 'menu'
  | 'offline'
  | 'connecting'
  | 'joining'
  | 'invite'
  | 'quick'
  | 'quick30'
  | 'linking'
  | 'error'
  | 'join-error';
export const FORCED_STATES: readonly ForcedState[] = [
  'menu',
  'offline',
  'connecting',
  'joining',
  'invite',
  'quick',
  'quick30',
  'linking',
  'error',
  'join-error',
];

/**
 * The dev-only `?lobbyState=` switch used for design review screenshots. Always null in a production build:
 * `process.env.NODE_ENV` is replaced at build time, so the rest of this branch is dropped from the bundle.
 */
export const readForcedState = (search: string): ForcedState | null => {
  if (process.env.NODE_ENV === 'production') return null;
  const v = new URLSearchParams(search).get('lobbyState');
  return (FORCED_STATES as readonly string[]).includes(v ?? '') ? (v as ForcedState) : null;
};
