/** The plain page: our own site, a local build, or a portal whose SDK did not load. Every call is a no-op. */
import type { Platform } from './types';

export const createWebPlatform = (): Platform => ({
  id: 'web',
  loadingStart: () => undefined,
  loadingStop: () => undefined,
  gameplayStart: () => undefined,
  gameplayStop: () => undefined,
  muted: () => false,
  onMutedChange: () => () => undefined,
});
