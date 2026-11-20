import { RULES } from '../sim/constants';
import { createGame, step } from '../sim/step';
import { EMPTY_INPUT } from '../sim/types';

import { createAuthority, REWIND_CAP_TICKS } from './authority';
import { decodeInput, encodeInput } from './protocol';

import type { WireInput } from './protocol';
import type { GameEvent, GameState, InputState } from '../sim/types';

/** An online game already in the fight, no guns lying around. */
const fight = (): GameState => {
  const s = createGame(['hotfix', 'legacy'], 7, true);
  s.phase = 'fight';
  s.phaseTime = RULES.roundSeconds;
  s.dropTimer = Infinity;
  s.pickups.forEach((p) => {
    p.active = false;
    p.respawn = Infinity;
  });
  return s;
};

/** The guest's input number n: runs left and right, jumps now and then, shoots every third. */
const guestInput = (n: number, extra: Partial<InputState> = {}): WireInput =>
  encodeInput(n, { ...EMPTY_INPUT, left: n % 40 < 20, right: n % 40 >= 20, up: n % 37 === 0, fire: n % 3 === 0, aimX: 0, aimY: 2, ...extra });
const hostInput = (t: number): InputState => ({ ...EMPTY_INPUT, right: t % 50 < 25, left: t % 50 >= 25, aimX: 0, aimY: 2 });

/**
 * Run `ticks` authority ticks. Guest input n normally arrives just before tick n + delay;
 * `arrive` can move single inputs later. Returns the authority and the events per tick.
 */
const play = (ticks: number, opts: { delay?: number; rtt?: number; arrive?: (n: number) => number; copies?: number; extra?: (n: number) => Partial<InputState> } = {}) => {
  const delay = opts.delay ?? 4;
  const auth = createAuthority(fight(), { remote: [false, true] });
  if (opts.rtt) auth.setRoundTrip(1, opts.rtt);
  const inbox = new Map<number, WireInput[]>();
  for (let n = 1; n <= ticks; n++) {
    const at = opts.arrive ? opts.arrive(n) : n + delay;
    const w = guestInput(n, opts.extra?.(n));
    for (let c = 0; c < (opts.copies ?? 1); c++) inbox.set(at, [...(inbox.get(at) ?? []), w]);
  }
  const events: GameEvent[][] = [];
  for (let t = 1; t <= ticks; t++) {
    auth.receive(1, inbox.get(t) ?? []);
    events.push(auth.advance([hostInput(t), null]));
  }
  return { auth, events };
};

const positions = (s: GameState) => s.fighters.map((f) => [f.x, f.y, f.hp]);

describe('authority: lag compensation', () => {
  it('moves a late input\'s sender at the tick it was due, as if it had been on time', () => {
    const noFire = () => ({ fire: false });
    const onTime = play(400, { extra: noFire });
    // Input 300 is 6 ticks (100 ms) late; the ones after it are on time.
    const late = play(400, { arrive: (n) => (n === 300 ? 310 : n + 4), extra: noFire });
    expect(positions(late.auth.state)).toEqual(positions(onTime.auth.state));
    expect(late.auth.stats(1)!.lateInputs).toBe(0);
  });

  it('never rewinds more than 150 ms: a later input only adds its presses to the next tick', () => {
    expect((REWIND_CAP_TICKS * 1000) / 60).toBeLessThanOrEqual(150);
    // Input 300 dashes and arrives 20 ticks (330 ms) late.
    const dash = (n: number) => (n === 300 ? { dash: true } : {});
    const late = play(400, { arrive: (n) => (n === 300 ? 324 : n + 4), extra: dash });
    expect(late.auth.stats(1)!.lateInputs).toBe(1);
    // The dash still happens (never lost), on the first tick after it arrived, not in the past.
    const dashTick = late.events.findIndex((ev) => ev.some((e) => e.type === 'dash' && e.fighter === 1)) + 1;
    expect(dashTick).toBe(324);
  });

  it('applies inputs the measured one-way delay earlier than they arrive', () => {
    // Inputs arrive 10 ticks after they were pressed; a 100 ms round trip = 3 ticks one way.
    const { auth } = play(600, { delay: 10, rtt: 100 });
    const { ack } = auth.seatView(1);
    expect(ack).toBe(auth.tick - 10 + 3);
    // Without a measured round trip: applied on the first tick after arrival.
    const plain = play(600, { delay: 10 });
    expect(plain.auth.seatView(1).ack).toBe(plain.auth.tick - 10);
  });

  it('counts an input sent several times once', () => {
    const once = play(300);
    const many = play(300, { copies: 8 });
    expect(positions(many.auth.state)).toEqual(positions(once.auth.state));
    expect(many.auth.stats(1)!.inputs).toBe(once.auth.stats(1)!.inputs);
  });

  it('keeps a missing input moving (held), then corrects it when it lands', () => {
    // Inputs 200..205 arrive together, 8 ticks late: until then the guest keeps running.
    const noFire = () => ({ fire: false });
    const late = play(300, { arrive: (n) => (n >= 200 && n <= 205 ? 213 : n + 4), extra: noFire });
    const onTime = play(300, { extra: noFire });
    expect(late.auth.stats(1)!.heldTicks).toBeGreaterThan(0);
    expect(positions(late.auth.state)).toEqual(positions(onTime.auth.state));
  });

  it('hands out the events of replayed ticks again, so the receiver can replace them', () => {
    const auth = createAuthority(fight(), { remote: [false, true] });
    for (let t = 1; t <= 100; t++) {
      auth.receive(1, [guestInput(t)]);
      auth.advance([hostInput(t), null]);
      auth.takeEvents();
    }
    // Input 102 is missing at its tick and lands 3 ticks later: ticks from 102 are replayed.
    auth.receive(1, [guestInput(101)]);
    auth.advance([hostInput(101), null]);
    auth.takeEvents();
    for (let t = 102; t <= 104; t++) {
      auth.receive(1, [guestInput(t + 1)]);
      auth.advance([hostInput(t), null]);
      auth.takeEvents();
    }
    auth.receive(1, [guestInput(102)]);
    auth.advance([hostInput(105), null]);
    const batch = auth.takeEvents();
    expect(batch).not.toBeNull();
    expect(batch!.from).toBeLessThanOrEqual(102);
    expect(batch!.to).toBe(auth.state.tick);
  });

  it('keeps a pause through a rewind', () => {
    const auth = createAuthority(fight(), { remote: [false, true] });
    for (let t = 1; t <= 60; t++) {
      auth.receive(1, t === 58 ? [] : [guestInput(t)]);
      if (t === 59) auth.state.paused = true;
      auth.advance([hostInput(t), null]);
    }
    const tick = auth.state.tick;
    auth.receive(1, [guestInput(58)]); // late: rewinds across the pause
    auth.advance([hostInput(61), null]);
    expect(auth.state.paused).toBe(true);
    expect(auth.state.tick).toBe(tick);
  });

  it('keeps a character pick made between ticks through a rewind', () => {
    const auth = createAuthority(fight(), { remote: [false, true] });
    for (let t = 1; t <= 40; t++) {
      auth.receive(1, t === 38 ? [] : [guestInput(t)]);
      auth.advance([hostInput(t), null]);
    }
    auth.mutate((s) => (s.fighters[1].nextCharacter = 'standup'));
    auth.receive(1, [guestInput(38)]);
    auth.advance([hostInput(41), null]);
    expect(auth.state.fighters[1].nextCharacter).toBe('standup');
  });

  it('snapshots the newest tick every remote input reached, plus the inputs after it', () => {
    // On time and nothing to compensate: the newest tick is confirmed.
    const plain = play(300).auth.snapshot();
    expect(plain.seats[1].next).toHaveLength(0);
    // Compensating 3 ticks: the last ticks ran on guesses; the snapshot stops before them and
    // lists both seats' inputs for them, so a client can replay its real inputs over them.
    const { auth } = play(600, { delay: 10, rtt: 100 });
    const snap = auth.snapshot();
    const behind = snap.seats[1].next.length;
    expect(behind).toBeGreaterThanOrEqual(3);
    expect(behind).toBeLessThanOrEqual(REWIND_CAP_TICKS);
    expect(snap.state.tick).toBe(auth.state.tick - behind);
    expect(snap.seats[0].next).toHaveLength(behind);
    // Replaying the real inputs over the listed ticks reproduces the authority's newest tick.
    const replay = structuredClone(snap.state);
    for (let i = 0; i < behind; i++) {
      step(replay, [decodeInput(snap.seats[0].next[i]), decodeInput(guestInput(snap.seats[1].ack + 1 + i))]);
    }
    expect(replay.tick).toBe(auth.state.tick);
  });

  it('fires a late shot when it arrives, never in the past, and only once', () => {
    // Only input 300 shoots; it arrives 6 ticks after it was due.
    const shot = (n: number) => ({ fire: n === 300 });
    const late = play(360, { arrive: (n) => (n === 300 ? 310 : n + 4), extra: shot });
    const shots = late.events.flatMap((ev, i) => ev.filter((e) => e.type === 'shot' && e.fighter === 1).map(() => i + 1));
    expect(shots).toEqual([310]); // the first tick after it landed
    // On time, it fires at its own tick.
    const onTime = play(360, { extra: shot });
    const at = onTime.events.flatMap((ev, i) => ev.filter((e) => e.type === 'shot' && e.fighter === 1).map(() => i + 1));
    expect(at).toEqual([304]);
  });
});
