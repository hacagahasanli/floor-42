/**
 * Brain specs for the bot harness (docs/systems/smart-bot.md section 5):
 *   bot:<easy|normal|hard> or smart:<level>  the shipped bot (src/game/sim/bot.ts createBot)
 *   old:<level>                              the bot before the smart bot (src/game/sim/botOld.ts), baseline only
 *   masher, strafer, decent                  scripted test players (players.ts)
 * Harness-only tuning: env SMART_TUNE = JSON per level, e.g. {"normal":{"trigger":0.7}}, is merged into LEVELS once
 * when this module loads (each worker thread loads it once).
 */
import { createBot, LEVELS } from '../../../src/game/sim/bot';
import { createOldBot } from '../../../src/game/sim/botOld';
import { createDecent, createMasher, createStrafer } from './players';

import type { BotLevel } from '../../../src/game/sim/bot';
import type { GameState, InputState } from '../../../src/game/sim/types';

const tune = JSON.parse(process.env.SMART_TUNE ?? '{}') as Partial<Record<BotLevel, object>>;
for (const [lv, o] of Object.entries(tune)) Object.assign(LEVELS[lv as BotLevel], o);

export const brain = (spec: string, id: number, seed: number): ((s: GameState) => InputState) => {
  const [kind, level] = spec.split(':');
  if (kind === 'bot' || kind === 'smart') return createBot(id, seed, level as BotLevel);
  if (kind === 'old') return createOldBot(id, seed, level as BotLevel);
  if (kind === 'masher') return createMasher(id, seed);
  if (kind === 'strafer') return createStrafer(id, seed);
  if (kind === 'decent') return createDecent(id, seed);
  throw new Error(`unknown spec ${spec}`);
};
