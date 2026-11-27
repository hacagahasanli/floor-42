import type { BotLevel } from './sim/bot';

/** Set once the player has finished a match against the bot (aliveness audit R-011, T4). */
export const FINISHED_KEY = 'floor-42:finished-match';

export const hasFinishedMatch = (storage: Pick<Storage, 'getItem'> | null): boolean => {
  try {
    return storage?.getItem(FINISHED_KEY) === '1';
  } catch {
    return false;
  }
};

export const markMatchFinished = (storage: Pick<Storage, 'setItem'> | null) => {
  try {
    storage?.setItem(FINISHED_KEY, '1');
  } catch {
    /* no storage: the next first match is easy again, harmless */
  }
};

/** The very first match against the bot is always `easy`; after that the menu's choice stands. */
export const botLevelFor = (requested: BotLevel, finishedBefore: boolean): BotLevel => (finishedBefore ? requested : 'easy');

const browserStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};
export const readFinishedMatch = () => hasFinishedMatch(browserStorage());
export const saveFinishedMatch = () => markMatchFinished(browserStorage());
