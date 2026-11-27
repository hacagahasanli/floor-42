/**
 * The game's name, in ONE place (R-023: the game is being renamed). The wordmark, the boot screen (portal/index.html, via
 * vite.portal.config.ts) and the arena ribbon all read it. A name of two words shows the Field Day wordmark (a white word
 * and a big sun word); a one-word name uses only the big sun style (spec 3.1).
 */
export const GAME_NAME = 'FLOOR 42';

/** The words of the wordmark: [white word, sun word] or [sun word] for a one-word name. */
export const wordmarkParts = (name: string = GAME_NAME): [string, string] | [string] => {
  const words = name.trim().split(/\s+/);
  if (words.length <= 1) return [words[0] ?? ''];
  return [words.slice(0, -1).join(' '), words[words.length - 1]];
};
