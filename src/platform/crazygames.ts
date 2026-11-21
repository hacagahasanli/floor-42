/**
 * CrazyGames SDK v3 (https://docs.crazygames.com/sdk/intro/). The page loads
 * `https://sdk.crazygames.com/crazygames-sdk-v3.js` in its <head>; this adapter wraps `window.CrazyGames.SDK`:
 *  - `init()` must be awaited before anything else; on a domain the SDK does not know, `environment` is 'disabled' and its
 *    calls throw, so `detectPlatform` falls back to the plain web adapter;
 *  - `game.loadingStart/Stop` and `game.gameplayStart/Stop` (forwarded only on a real change);
 *  - `game.settings.muteAudio` and `game.addSettingsChangeListener` for the portal's sound switch.
 * Every call is wrapped: an SDK error never reaches the game.
 */
import type { Platform } from './types';

/** The part of the SDK we use (typed loosely: it is a third-party global). */
export interface CrazySdk {
  init(): Promise<void>;
  environment?: 'local' | 'crazygames' | 'disabled' | string;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(cb: (s: { muteAudio?: boolean }) => void): void;
    removeSettingsChangeListener?(cb: (s: { muteAudio?: boolean }) => void): void;
  };
}

const safe = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* an SDK call failed: the game carries on */
  }
};

export const createCrazyGamesPlatform = (sdk: CrazySdk): Platform => {
  let playing = false;
  let loading = false;
  return {
    id: 'crazygames',
    loadingStart: () => {
      if (loading) return;
      loading = true;
      safe(() => sdk.game.loadingStart());
    },
    loadingStop: () => {
      if (!loading) return;
      loading = false;
      safe(() => sdk.game.loadingStop());
    },
    gameplayStart: () => {
      if (playing) return;
      playing = true;
      safe(() => sdk.game.gameplayStart());
    },
    gameplayStop: () => {
      if (!playing) return;
      playing = false;
      safe(() => sdk.game.gameplayStop());
    },
    muted: () => {
      try {
        return !!sdk.game.settings?.muteAudio;
      } catch {
        return false;
      }
    },
    onMutedChange: (cb) => {
      const l = (s: { muteAudio?: boolean }) => cb(!!s?.muteAudio);
      safe(() => sdk.game.addSettingsChangeListener?.(l));
      return () => safe(() => sdk.game.removeSettingsChangeListener?.(l));
    },
  };
};
