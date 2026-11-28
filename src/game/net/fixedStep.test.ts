import { createFixedStep } from './fixedStep';

describe('createFixedStep', () => {
  it('keeps real time: 60 ticks a second however the polls fall (a plain setInterval ran at 58.5)', () => {
    let t = 0;
    let ticks = 0;
    const f = createFixedStep(1000 / 60, () => ticks++, () => t);
    // Poll every 17 ms (slightly late, as a timer is), for 10 seconds.
    for (t = 0; t <= 10_000; t += 17) f.poll();
    expect(ticks).toBeGreaterThanOrEqual(599);
    expect(ticks).toBeLessThanOrEqual(600);
  });

  it('runs a tick per poll when polled every few ms, never two in one go', () => {
    let t = 0;
    let most = 0;
    const f = createFixedStep(1000 / 60, () => {}, () => t);
    for (t = 0; t <= 5000; t += 4) most = Math.max(most, f.poll());
    expect(most).toBe(1);
  });

  it('catches up a short stall, and gives up the time after a long one', () => {
    let t = 0;
    let ticks = 0;
    const f = createFixedStep(1000 / 60, () => ticks++, () => t, 4);
    f.poll();
    t = 50; // 3 ticks due
    expect(f.poll()).toBe(3);
    t = 5000; // a 5 s stall: no burst of 300 ticks
    const ran = f.poll();
    expect(ran).toBeLessThanOrEqual(4);
    t += 17;
    expect(f.poll()).toBeLessThanOrEqual(1);
  });
});
