'use client';

import { useMemo } from 'react';

import { copyFor } from '~/game/copy';

import type { Copy } from '~/game/copy';
import type { ArenaId } from '~/game/sim/constants';

/** Every line of game copy, with the arena's place-naming lines laid over it. */
export const useCopy = (arena: ArenaId = 'office'): Copy => useMemo(() => copyFor(arena), [arena]);
