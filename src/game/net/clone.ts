/**
 * Deep copy of a game state, built for the shape the simulation uses: plain objects, arrays and
 * numbers, strings, booleans and null (Infinity is fine). The authority copies the state every
 * tick to be able to rewind; this is several times cheaper than structuredClone, which also
 * handles Maps, Dates and cycles the state never has. Anything else throws in the tests.
 */
export const cloneState = <T>(v: T): T => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const n = v.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = v[i];
      out[i] = x !== null && typeof x === 'object' ? cloneState(x) : x;
    }
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v) {
    const x = (v as Record<string, unknown>)[k];
    out[k] = x !== null && typeof x === 'object' ? cloneState(x) : x;
  }
  return out as T;
};
