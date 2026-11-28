/**
 * A fixed-rate tick source that keeps real time. `setInterval(fn, 1000 / 60)` does not: Node
 * rounds the interval up and every wake-up is a little late, so the server measured 58.5 ticks a
 * second (2.4 % slow) while every browser steps at 60: game time on the server drifted away from
 * the players' and every snapshot had to correct for it.
 *
 * Call `poll()` often (every few ms); it runs as many whole ticks as real time says are due, at
 * most `maxCatchUp` at once (after a longer stall it gives up the lost time instead of running a
 * burst of ticks).
 */
export const createFixedStep = (tickMs: number, run: () => void, now: () => number = () => performance.now(), maxCatchUp = 4) => {
  let start = now();
  let done = 0;
  return {
    poll: () => {
      const t = now();
      let ran = 0;
      while (start + (done + 1) * tickMs <= t) {
        if (ran >= maxCatchUp) {
          // Too far behind: restart the schedule from now.
          start = t - tickMs * 0.5;
          done = 0;
          break;
        }
        done += 1;
        ran += 1;
        run();
      }
      return ran;
    },
    get ticks() {
      return done;
    },
  };
};

/** Rolling summary of tick timing, logged when TICK_STATS=1 (npm run server). */
export const createTickStats = (tickMs: number, log: (line: string) => void, now: () => number = () => performance.now(), everyMs = 10_000) => {
  let gaps: number[] = [];
  let work: number[] = [];
  let last = -1;
  let since = now();
  return {
    record: (startedAt: number) => {
      const t = now();
      if (last >= 0) gaps.push(startedAt - last);
      last = startedAt;
      work.push(t - startedAt);
      if (t - since >= everyMs) {
        const q = (a: number[], p: number) => {
          const s = [...a].sort((x, y) => x - y);
          return s[Math.min(s.length - 1, Math.floor(p * s.length))]?.toFixed(2);
        };
        const hz = gaps.length / ((since === t ? 1 : t - since) / 1000);
        log(
          `TICK ${JSON.stringify({ target: +(1000 / tickMs).toFixed(1), hz: +hz.toFixed(2), gapP50: q(gaps, 0.5), gapP95: q(gaps, 0.95), gapP99: q(gaps, 0.99), gapMax: q(gaps, 1), workP50: q(work, 0.5), workP99: q(work, 0.99), workMax: q(work, 1) })}`,
        );
        gaps = [];
        work = [];
        since = t;
      }
    },
  };
};
