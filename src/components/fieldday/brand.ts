/**
 * The game's name, in ONE place (R-023). Pewfield is always written as one word: PEWFIELD in capitals, "Pewfield" in sentences.
 * The wordmark itself is artwork (logo concept A, "PEW! burst": wordmarkArt.ts), not text; the boot screen (portal/index.html, via
 * vite.portal.config.ts), the page title and the arena ribbon read the name from here. "FLOOR 42" is the office arena's name
 * (arenaChoice.ts), not the game's.
 */
export const GAME_NAME = 'PEWFIELD';

/** The name as written in a sentence or a page title: "Pewfield". */
export const GAME_NAME_TITLE = GAME_NAME.charAt(0) + GAME_NAME.slice(1).toLowerCase();
