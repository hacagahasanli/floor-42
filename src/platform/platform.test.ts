import { describe, expect, it, vi } from 'vitest';

import { detectPlatform } from './index';

import type { CrazySdk } from './crazygames';

const fakeSdk = (over: Partial<CrazySdk> = {}) => {
  const game = { loadingStart: vi.fn(), loadingStop: vi.fn(), gameplayStart: vi.fn(), gameplayStop: vi.fn(), settings: { muteAudio: false } };
  const sdk: CrazySdk = { init: async () => undefined, environment: 'crazygames', game, ...over };
  return { sdk, game };
};

describe('detectPlatform', () => {
  it('is the web adapter without the SDK script', async () => {
    expect((await detectPlatform({})).id).toBe('web');
  });
  it('is the web adapter when the SDK says disabled or init fails', async () => {
    expect((await detectPlatform({ CrazyGames: { SDK: fakeSdk({ environment: 'disabled' }).sdk } })).id).toBe('web');
    expect((await detectPlatform({ CrazyGames: { SDK: fakeSdk({ init: () => Promise.reject(new Error('x')) }).sdk } })).id).toBe('web');
  });
  it('gives up on an SDK that never answers', async () => {
    const never = fakeSdk({ init: () => new Promise(() => undefined) }).sdk;
    expect((await detectPlatform({ CrazyGames: { SDK: never } }, 20)).id).toBe('web');
  });
});

describe('CrazyGames adapter', () => {
  it('forwards only real changes of gameplay and loading', async () => {
    const { sdk, game } = fakeSdk();
    const p = await detectPlatform({ CrazyGames: { SDK: sdk } });
    expect(p.id).toBe('crazygames');
    p.gameplayStop();
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    expect(game.gameplayStart).toHaveBeenCalledTimes(1);
    expect(game.gameplayStop).toHaveBeenCalledTimes(1);
    p.loadingStop();
    p.loadingStart();
    p.loadingStart();
    p.loadingStop();
    expect(game.loadingStart).toHaveBeenCalledTimes(1);
    expect(game.loadingStop).toHaveBeenCalledTimes(1);
  });
  it('never throws when the SDK does', async () => {
    const { sdk, game } = fakeSdk();
    game.gameplayStart.mockImplementation(() => {
      throw new Error('boom');
    });
    const p = await detectPlatform({ CrazyGames: { SDK: sdk } });
    expect(() => p.gameplayStart()).not.toThrow();
  });
  it('reports the portal mute and its changes', async () => {
    const { sdk, game } = fakeSdk();
    let listener: ((s: { muteAudio?: boolean }) => void) | undefined;
    (game as Record<string, unknown>).addSettingsChangeListener = (cb: typeof listener) => (listener = cb);
    game.settings.muteAudio = true;
    const p = await detectPlatform({ CrazyGames: { SDK: sdk } });
    expect(p.muted()).toBe(true);
    const seen: boolean[] = [];
    p.onMutedChange((m) => seen.push(m));
    listener?.({ muteAudio: false });
    expect(seen).toEqual([false]);
  });
});
