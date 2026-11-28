// npx tsx tools/netlab/bench-clone.mts: cost of copying a game state (one per server tick).
import { cloneState } from '../../src/game/net/clone';
import { step, createGame } from '../../src/game/sim/step';
import { EMPTY_INPUT } from '../../src/game/sim/types';

const s = createGame(['hotfix', 'legacy'], 7, true);
for (let i = 0; i < 600; i++) step(s, [{ ...EMPTY_INPUT, fire: i % 5 === 0, right: true }, { ...EMPTY_INPUT, left: true, fire: true }]);
const time = (name: string, fn: () => unknown) => {
  for (let i = 0; i < 2000; i++) fn();
  const N = 20000;
  const t = performance.now();
  for (let i = 0; i < N; i++) fn();
  const us = ((performance.now() - t) / N) * 1000;
  console.log(`${name}: ${us.toFixed(1)} us per copy (${(us * 60 / 1000).toFixed(2)} ms/s at 60 Hz)`);
};
time('structuredClone', () => structuredClone(s));
time('cloneState', () => cloneState(s));
