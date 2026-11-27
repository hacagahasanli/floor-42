/**
 * Test helper: the largest difference between two values of the same shape (numbers compared
 * numerically, everything else exactly). Returns Infinity when the shapes differ. The wire rounds
 * floats (wire.ts), so a state that crossed it is compared with this and a tolerance.
 */
export const maxDiff = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : Math.abs(a - b);
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b ? 0 : Infinity;
  if (Array.isArray(a) !== Array.isArray(b)) return Infinity;
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.join() !== kb.join()) return Infinity;
  let m = 0;
  for (const k of ka) m = Math.max(m, maxDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  return m;
};
