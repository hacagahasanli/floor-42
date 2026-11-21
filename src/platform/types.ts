/**
 * The portal adapter: everything the game asks of the page that hosts it (a portal's SDK, or nothing at all on our own site).
 * The game only ever talks to this interface, so another portal is one more file next to `crazygames.ts`.
 *
 * Rules every adapter keeps:
 *  - every call is safe at any time, including before `init` resolves and after an SDK error (they never throw);
 *  - `gameplayStart`/`gameplayStop` and `loadingStart`/`loadingStop` are idempotent (the adapter forwards only real changes).
 * Floor 42 has no ads, so there is no ad call here: if one is ever added it goes through this interface and the SDK only.
 */
export interface Platform {
  readonly id: 'web' | 'crazygames';
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** The portal's sound switch (CrazyGames settings): true means the game must be silent. */
  muted(): boolean;
  /** Calls `cb` when the portal's sound switch changes; returns the unsubscribe function. */
  onMutedChange(cb: (muted: boolean) => void): () => void;
}
