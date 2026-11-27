/**
 * Every string the Field Day phase-1 screens show, from the spec's mockups (docs/collab/CREATIVE/ui/direction-b/index.html),
 * in one place. No developer copy: the plain voice only. Strings that depend on the game (arena name, fighter role, KOs to win)
 * are built by the screens from their own sources (arenaChoice.ts, copy.ts, RULES).
 */
export const FD_COPY = {
  boot: { setup: 'Setting up the field…', studio: 'Nalbaki Games' },
  home: {
    play: 'PLAY',
    twoPlayer: '2 PLAYER',
    online: 'ONLINE',
    fighter: 'FIGHTER',
    arena: 'ARENA',
    howTo: 'HOW TO PLAY',
    ribbon: (arena: string) => `${arena} FIELD DAY`,
    playLine: (kos: number) => `VS BOT · FIRST TO ${kos} KOs`,
    bubble: ['Ready when you are!'],
    credits: 'Credits',
    hint: { move: 'Move', select: 'Select', back: 'Back' },
  },
  select: {
    title: 'CHOOSE YOUR FIGHTER',
    back: 'BACK',
    yourPick: 'YOUR PICK',
    fight: 'FIGHT!',
    bot: (level: string) => `BOT: ${level.toUpperCase()}`,
    stats: { speed: 'SPEED', jump: 'JUMP', weight: 'WEIGHT' },
    hint: { choose: 'Choose', fight: 'Fight', back: 'Back' },
  },
  twoPlayer: {
    title: '2 PLAYER',
    player: (n: number) => `PLAYER ${n}`,
    ready: 'READY!',
    press: 'Press',
    whenReady: 'when ready',
    waiting: (n: number) => `Waiting for Player ${n} to lock in…`,
    starting: (n: number) => `Starting in ${n}`,
    vs: 'VS',
    firstTo: (n: number) => `FIRST TO ${n}`,
    hint: { choose: 'choose', ready: 'ready', back: 'Back', length: 'length' },
  },
  /**
   * The result screen (b12-b16) and its online rematch panel. Strings from the spec's mockups and §7 (award pool and the loss
   * line rotation). NOT from the spec, flagged for the CD: DRAW, the SPONGE description verb, and the rematch timer showing
   * time waited (the mockup's "0:12").
   */
  result: {
    andTheWinner: 'AND THE WINNER IS…',
    wins: (name: string) => `${name} WINS!`,
    draw: 'DRAW!',
    participation: 'PARTICIPATION',
    you: 'YOU',
    esc: 'ESC',
    menu: 'Menu',
    tab: 'TAB',
    holdForStats: 'Hold for stats',
    rematch: 'REMATCH',
    enter: 'ENTER',
    nextArena: 'NEXT ARENA',
    changeFighter: 'CHANGE FIGHTER',
    accuracy: (n: number) => `${n}% accuracy`,
    bestStreak: (n: number) => `best streak ${n}`,
    /** One is picked per match, after "4 – 5 ·". */
    lossLines: ['so close! · one more?', 'run it back?', "next one's yours"],
    awards: {
      pinata: { title: 'PIÑATA', line: (who: string, n: number) => `${who} took ${n} ${n === 1 ? 'rocket' : 'rockets'}` },
      boomerang: { title: 'BOOMERANG', line: (who: string, n: number) => `${who} pushed back ${n} ${n === 1 ? 'bullet' : 'bullets'}` },
      bouncy: { title: 'BOUNCY CASTLE', line: (who: string, n: number) => `${who} jumped ${n} times` },
      sharpshooter: { title: 'SHARPSHOOTER', line: (who: string, n: number) => `${who} hit ${n}% of shots` },
      sponge: { title: 'IRON SPONGE', line: (who: string, n: number) => `${who} soaked up ${n} damage` },
    },
    stats: { title: 'THIS MATCH', kos: 'KOs', damage: 'Damage dealt', accuracy: 'Accuracy', streak: 'Best streak', down: 'Times down' },
    rematchOnline: {
      title: 'REMATCH?',
      you: 'YOU',
      rival: 'RIVAL',
      ready: 'READY!',
      deciding: (m: string) => `DECIDING… ${m}`,
      cancel: 'CANCEL',
      info: 'If your rival leaves, you go back to the menu.',
    },
  },
} as const;
