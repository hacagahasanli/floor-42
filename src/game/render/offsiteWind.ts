/**
 * The one wind of the OFFSITE canyon (arena-2.md section 5.6). Render-side only: it never touches the sim, never
 * draws from the sim's random numbers (its own generator, seeded from the match seed), and online clients may
 * disagree, which is fine. Pure, so it is unit-tested without a browser.
 *
 * wind() is 0..1 and always blows toward +x: a base of 0.25 +- 0.05 (a sine, 9 s period) and a gust every 6-11 s that
 * rises to its peak in 0.5 s (ease-out), holds 1.0 s and falls back in 1.8 s (ease-in). Peak 1.0 (60 % of gusts) or
 * 0.7 (40 %). A kick (an explosion, a KO) holds the wind at 1.0 for 0.6 s.
 */

export const GUST = { rise: 0.5, hold: 1.0, fall: 1.8, minGap: 6, maxGap: 11, firstMin: 2, firstMax: 5, kick: 0.6 };
/** Reduced motion: gusts peak at 0.6 and nothing kicks the wind (R7). */
export const REDUCED_PEAK = 0.6;

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** The base wind at time t (s). */
export const baseWind = (t: number) => 0.25 + 0.05 * Math.sin((2 * Math.PI * t) / 9);

/** 0..1 envelope of a gust `u` seconds after it began. */
export const gustEnvelope = (u: number) => {
  if (u <= 0) return 0;
  if (u < GUST.rise) {
    const k = u / GUST.rise;
    return 1 - (1 - k) * (1 - k);
  }
  if (u < GUST.rise + GUST.hold) return 1;
  const k = (u - GUST.rise - GUST.hold) / GUST.fall;
  return k >= 1 ? 0 : 1 - k * k;
};

export const createWind = (seed: number) => {
  const rand = mulberry32(seed ^ 0x57494e44);
  let nextGust = GUST.firstMin + rand() * (GUST.firstMax - GUST.firstMin);
  let gustAt = -1e9;
  let peak = 1;
  let kickUntil = -1;
  const out = { value: baseWind(0), gust: false, gustPeak: 1, gusts: 0 };
  return {
    out,
    /** Advance to time `t` (s, non-decreasing). `out.gust` is true on the call in which a gust begins. */
    update(t: number, reduced = false) {
      out.gust = false;
      if (t >= nextGust) {
        gustAt = nextGust;
        peak = rand() < 0.6 ? 1 : 0.7;
        nextGust = gustAt + GUST.minGap + rand() * (GUST.maxGap - GUST.minGap);
        out.gust = true;
        out.gusts += 1;
      }
      out.gustPeak = reduced ? Math.min(peak, REDUCED_PEAK) : peak;
      const base = baseWind(t);
      let w = base + (out.gustPeak - base) * gustEnvelope(t - gustAt);
      if (!reduced && t < kickUntil) w = 1;
      out.value = Math.min(1, Math.max(0, w));
      return out.value;
    },
    /** A blast or a KO: the wind snaps to 1.0 for 0.6 s (ignored under reduced motion). */
    kick(t: number, reduced = false) {
      if (!reduced) kickUntil = Math.max(kickUntil, t + GUST.kick);
    },
  };
};
