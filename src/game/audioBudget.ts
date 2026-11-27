/**
 * The sound budget: how often each one-shot may start and how many of it may sound at once. `sfx.ts` asks the gate before
 * it builds a voice; over budget, the sound is dropped (never queued). Gunshots keep their own pool (SHOT_BUDGET in
 * sfx.ts). The contract is docs/SOUND.md: a new sound gets a row here first, and the test fails if a gated name has none.
 *
 * No Web Audio here, so it runs (and is tested) in node.
 */

export interface Budget {
  /** Minimum time between two starts. */
  cooldownMs: number;
  /** How many may sound at once. */
  maxVoices: number;
  /** How long one counts as sounding. */
  lengthMs: number;
}

export const BUDGET = {
  // Bullets hitting walls and floor: a few ticks, not one per pellet.
  impact: { cooldownMs: 30, maxVoices: 3, lengthMs: 60 },
  hit: { cooldownMs: 0, maxVoices: 3, lengthMs: 200 },
  deflect: { cooldownMs: 60, maxVoices: 2, lengthMs: 120 },
  jump: { cooldownMs: 60, maxVoices: 2, lengthMs: 80 },
  dash: { cooldownMs: 80, maxVoices: 2, lengthMs: 130 },
  land: { cooldownMs: 80, maxVoices: 2, lengthMs: 100 },
  push: { cooldownMs: 120, maxVoices: 2, lengthMs: 300 },
  glass: { cooldownMs: 150, maxVoices: 1, lengthMs: 400 },
  explosion: { cooldownMs: 90, maxVoices: 2, lengthMs: 1000 },
  ko: { cooldownMs: 150, maxVoices: 2, lengthMs: 700 },
  reload: { cooldownMs: 0, maxVoices: 2, lengthMs: 600 },
  // Out of ammo: one click, never a rattle.
  empty: { cooldownMs: 250, maxVoices: 1, lengthMs: 40 },
  // Menus (focus ticks also have menuSound's own 40 ms rule).
  tick: { cooldownMs: 40, maxVoices: 2, lengthMs: 40 },
  confirm: { cooldownMs: 80, maxVoices: 1, lengthMs: 210 },
  back: { cooldownMs: 80, maxVoices: 1, lengthMs: 100 },
  // Rubber-stamp announcer and lift (R-013): one at a time, each its own length.
  stamp: { cooldownMs: 60, maxVoices: 2, lengthMs: 200 },
  stampBig: { cooldownMs: 150, maxVoices: 1, lengthMs: 600 },
  doorSlam: { cooldownMs: 150, maxVoices: 1, lengthMs: 300 },
  liftDing: { cooldownMs: 300, maxVoices: 1, lengthMs: 1100 },
  floorTick: { cooldownMs: 70, maxVoices: 2, lengthMs: 30 },
  winSting: { cooldownMs: 300, maxVoices: 1, lengthMs: 400 },
  lossSting: { cooldownMs: 300, maxVoices: 1, lengthMs: 500 },
  // Field Day result reveal (spec 4): one beat at a time, all on the ui bus.
  resultWhoosh: { cooldownMs: 200, maxVoices: 1, lengthMs: 250 },
  drumroll: { cooldownMs: 300, maxVoices: 1, lengthMs: 350 },
  partyHorn: { cooldownMs: 300, maxVoices: 1, lengthMs: 600 },
  wahwah: { cooldownMs: 300, maxVoices: 1, lengthMs: 700 },
  thud: { cooldownMs: 150, maxVoices: 1, lengthMs: 200 },
  slideWhistle: { cooldownMs: 200, maxVoices: 1, lengthMs: 400 },
  ding: { cooldownMs: 100, maxVoices: 2, lengthMs: 500 },
  softPop: { cooldownMs: 40, maxVoices: 2, lengthMs: 100 },
  crowd: { cooldownMs: 1000, maxVoices: 2, lengthMs: 2400 },
} as const satisfies Record<string, Budget>;

export type SoundName = keyof typeof BUDGET;

export interface Gate {
  allow: (name: SoundName, now: number) => boolean;
  active: (name: SoundName, now: number) => number;
  stats: () => Record<string, { played: number; dropped: number }>;
}

export const createGate = (budget: Record<string, Budget> = BUDGET): Gate => {
  const last = new Map<string, number>();
  const ends = new Map<string, number[]>();
  const counts: Record<string, { played: number; dropped: number }> = {};
  const live = (name: string, now: number) => {
    const e = (ends.get(name) ?? []).filter((t) => t > now);
    ends.set(name, e);
    return e;
  };
  return {
    allow: (name, now) => {
      const b = budget[name];
      const c = (counts[name] ??= { played: 0, dropped: 0 });
      const prev = last.get(name);
      const e = live(name, now);
      if ((prev !== undefined && now - prev < b.cooldownMs) || e.length >= b.maxVoices) {
        c.dropped++;
        return false;
      }
      last.set(name, now);
      e.push(now + b.lengthMs);
      c.played++;
      return true;
    },
    active: (name, now) => live(name, now).length,
    stats: () => counts,
  };
};
