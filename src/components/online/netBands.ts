/**
 * The ping pill's signal bars (spec 5.1, D9): <= 60 ms 3 bars, 61-100 ms 2, > 100 ms 1, on the median of the last 2 s, and a
 * band only changes once the median is 10 ms past the edge (no flicker between 2 and 3 bars at 60 ms). Pure.
 */
export type Bars = 1 | 2 | 3;
const EDGES: [number, number] = [60, 100];
const HYST = 10;

export const barsFor = (ms: number): Bars => (ms <= EDGES[0] ? 3 : ms <= EDGES[1] ? 2 : 1);

/** The next band given the current one: move only when the median is HYST ms beyond the edge being crossed. */
export const nextBars = (prev: Bars | null, ms: number): Bars => {
  const raw = barsFor(ms);
  if (prev === null || raw === prev) return raw;
  if (raw < prev) {
    // getting worse: cross the upper edge of the current band by HYST
    const edge = prev === 3 ? EDGES[0] : EDGES[1];
    return ms > edge + HYST ? raw : prev;
  }
  // getting better: cross the lower edge by HYST
  const edge = prev === 1 ? EDGES[1] : EDGES[0];
  return ms < edge - HYST ? raw : prev;
};

/** Median of the samples of the last `windowMs`. */
export const createPingWindow = (windowMs = 2000) => {
  const samples: { t: number; ms: number }[] = [];
  return {
    push(t: number, ms: number) {
      samples.push({ t, ms });
      while (samples.length && samples[0].t < t - windowMs) samples.shift();
    },
    median(): number | null {
      if (!samples.length) return null;
      const s = samples.map((x) => x.ms).sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    },
  };
};
