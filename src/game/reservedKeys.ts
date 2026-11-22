/** Keys the game keeps for itself: pause, mute, aim toggle, respawn picks, confirm. (Own module: settings and twoPlayer both read it.) */
export const RESERVED_KEYS = new Set([
  'Escape',
  'KeyM',
  'KeyT',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Enter',
  'Tab',
  'MetaLeft',
  'MetaRight',
]);
