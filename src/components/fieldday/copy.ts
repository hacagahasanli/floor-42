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
    stats: { health: 'HEALTH', speed: 'SPEED', jump: 'JUMP', weight: 'WEIGHT' },
    hint: { choose: 'Choose', fight: 'Fight', back: 'Back' },
  },
  howTo: { signature: 'SIGNATURE MOVES' },
  /** Settings: the reset button in its confirm state (R-028 / F-064: the row title already says "Reset all settings"). */
  settings: { resetConfirm: 'PRESS AGAIN TO RESET' },
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
  /** The 2P key card (R-030 / F-070, `CREATIVE/ui/direction-b/r030-2p-polish.md` 1.2). */
  keyCard: {
    titleStart: 'BOTH PRESS SHOOT TO FIGHT',
    titleView: '2 PLAYER KEYS',
    hint: 'Shoot is the key next to your hand. Push is next to that. Dash is the far one.',
    tester: 'Hold your keys. They light up.',
    press: 'Press',
    toFight: 'to fight',
    ready: 'READY!',
    warnLead: "A key stays dark? Your keyboard can't take that combo. Change it in ",
    warnPath: 'Settings → Controls → 2 Player',
    warnEnd: '.',
    startNow: 'start now',
    back: 'back',
    keys: { jump: 'Jump', move: 'Move', crouch: 'Crouch', shoot: 'Shoot', push: 'Push', dash: 'Dash', sit: 'Sit', stick: 'Move' },
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
    /**
     * The pill line after "{a} – {b} ·", by margin (F-075, CD R-031): close = 1, clear = 2-3, big = 4+, shutout = a win with the
     * loser on 0 KOs. Where a cell has two lines, one is picked per match (the result's random index, modulo the cell).
     */
    winLines: { shutout: ['flawless!'], big: ['total control'], clear: ['clean win'], close: ['by a whisker!'] },
    lossLines: {
      close: ['so close! · one more?', 'one KO short · run it back?'],
      clear: ['run it back?', 'shake it off · go again?'],
      big: ['tough one · go again?', 'try another fighter?'],
    },
    drawLine: 'all square · one more?',
    awards: {
      pinata: { title: 'PIÑATA', line: (who: string, n: number) => `${who} took ${n} ${n === 1 ? 'rocket' : 'rockets'}` },
      boomerang: { title: 'BOOMERANG', line: (who: string, n: number) => `${who} pushed back ${n} ${n === 1 ? 'bullet' : 'bullets'}` },
      bouncy: { title: 'BOUNCY CASTLE', line: (who: string, n: number) => `${who} jumped ${n} times` },
      sharpshooter: { title: 'SHARPSHOOTER', line: (who: string, n: number) => `${who} hit ${n}% of shots` },
      sponge: { title: 'IRON SPONGE', line: (who: string, n: number) => `${who} soaked up ${n} damage` },
      hitter: { title: 'HEAVY HITTER', line: (who: string, n: number) => `${who} dealt ${n} damage` },
      streak: { title: 'HOT STREAK', line: (who: string, n: number) => `${who} scored ${n} KOs in a row` },
      ribbon: { title: 'BLUE RIBBON', line: (who: string, n: number) => `${who} took the field, ${n} ${n === 1 ? 'KO' : 'KOs'}` },
    },
    stats: { title: 'THIS MATCH', kos: 'KOs', damage: 'Damage dealt', accuracy: 'Accuracy', streak: 'Best streak', down: 'Times down' },
    rematchOnline: {
      title: 'REMATCH?',
      you: 'YOU',
      rival: 'RIVAL',
      ready: 'READY!',
      deciding: 'DECIDING…',
      stillDeciding: 'STILL DECIDING…',
      leave: 'LEAVE',
      info: 'If either of you leaves, the match ends.',
    },
  },
} as const;
