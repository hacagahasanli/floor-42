/**
 * Auto-fit (spec 3.1): a wordmark or ribbon wider than its slot scales down to fit, never wraps and never shrinks below 0.6.
 * Pure, so the rule is unit-tested; <Wordmark> and <Ribbon> measure and call it.
 */
export const MIN_FIT = 0.6;

/** The scale (<= 1) that makes `natural` fit `max`. 1 when it already fits or either number is unusable. */
export const fitScale = (natural: number, max: number, min = MIN_FIT): number => {
  if (!(natural > 0) || !(max > 0) || natural <= max) return 1;
  return Math.max(min, max / natural);
};
