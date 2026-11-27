/**
 * Frame-time governor for the "Auto" quality setting. The tier picked at start is a guess from the device's
 * core count; this watches what the machine actually delivers and asks for one step down when the 95th
 * percentile frame time stays too high over a window. Pure, so it is tested without a browser.
 */
export interface GovernorOptions {
  /** How much frame time to collect before judging (ms). */
  windowMs: number;
  /** A window whose 95th-percentile frame is slower than this asks for a step down (ms). 25 ms = 40 fps. */
  p95Ms: number;
  /** Frames longer than this are tab switches or debugger pauses, not rendering cost: ignored (ms). */
  ignoreAboveMs: number;
}

export const GOVERNOR_DEFAULTS: GovernorOptions = { windowMs: 3000, p95Ms: 25, ignoreAboveMs: 250 };

export const p95 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
};

export const createGovernor = (o: GovernorOptions = GOVERNOR_DEFAULTS) => {
  let samples: number[] = [];
  let total = 0;
  return {
    /** Feed one frame's real duration. Returns true when the window just closed slow: step quality down. */
    sample(frameMs: number): boolean {
      if (!(frameMs > 0) || frameMs > o.ignoreAboveMs) return false;
      samples.push(frameMs);
      total += frameMs;
      if (total < o.windowMs) return false;
      const slow = p95(samples) > o.p95Ms;
      samples = [];
      total = 0;
      return slow;
    },
    reset() {
      samples = [];
      total = 0;
    },
  };
};

export interface QualityStep {
  pixelRatio: number;
  shadows: boolean;
}

/**
 * The next cheaper setting: pixel ratio first (2 -> 1.5 -> 1 -> 0.75, free to change mid-fight), shadows last.
 * Turning shadows off recompiles every material, a multi-second freeze on a weak GPU, so the caller applies
 * that step only between rounds. Returns null when nothing is left to cut.
 */
export const stepDown = (q: QualityStep): QualityStep | null => {
  if (q.pixelRatio > 1) return { ...q, pixelRatio: Math.max(1, q.pixelRatio - 0.5) };
  if (q.pixelRatio > 0.75) return { ...q, pixelRatio: 0.75 };
  if (q.shadows) return { ...q, shadows: false };
  return null;
};

/** Most sim steps one rendered frame may run offline. A slower machine then plays slower, never freezes. */
export const MAX_STEPS_PER_FRAME = 3;
