/**
 * Which arena an offline match is played in. Pure (no DOM): the menu row, the /arena route and the portal's hash
 * route all go through here, so the rule is one function and it is tested.
 *
 *   online          -> always the office (the protocol and the server carry no arena)
 *   `arena=` in the URL, when it names a known arena -> that one
 *   else the player's remembered choice (Settings.arena), which starts as DEFAULT_ARENA
 */
import { DEFAULT_ARENA, isArenaId } from './sim/constants';

import type { ArenaId } from './sim/constants';

/** The arena picker's words (arena-2.md section 7): the name on the chip and the card line under it. */
export const ARENA_COPY: Record<ArenaId, { name: string; line: string }> = {
  offsite: { name: 'OFFSITE', line: 'High noon on the planks. 41°C in the shade.' },
  office: { name: 'FLOOR 42', line: 'The office, after hours.' },
};

export const arenaFromQuery = (v: string | null | undefined): ArenaId | undefined => (isArenaId(v) ? v : undefined);

export const resolveArena = ({ online = false, query, saved }: { online?: boolean; query?: string | null; saved?: ArenaId }): ArenaId =>
  online ? 'office' : (arenaFromQuery(query) ?? (isArenaId(saved) ? saved : DEFAULT_ARENA));
