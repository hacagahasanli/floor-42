/**
 * Every sound is synthesised with WebAudio at runtime: no audio files, nothing to license.
 * Built to the `web-game-audio` skill:
 * - the context starts on the first key press (autoplay policy);
 * - voices -> category bus (sfx, ui, ambience) -> master -> compressor, plus a room reverb send;
 * - gunshots are layered: crack (high-passed noise), body (band-passed noise), thump (falling sine);
 * - every voice gets random detune and gain, and a stereo pan from its world x;
 * - rapid fire has a voice budget; mute is remembered;
 * - every other repeatable sound asks the budget gate (audioBudget.ts, docs/SOUND.md); a limiter sits after the master.
 * No ambience bed: a noise loop read as old-TV static, so the room stays quiet between fights.
 */
import { asset } from '~/lib/portal';

import { BUDGET, createGate } from './audioBudget';

import type { SoundName } from './audioBudget';

export type Sfx = ReturnType<typeof createSfx>;

type Gun = 'pistol' | 'smg' | 'shotgun' | 'railgun' | 'launcher' | 'uzi' | 'bomb';
type Bus = 'sfx' | 'ui' | 'amb' | 'guns';

/** Volumes come from Settings > Audio (src/game/settings.ts); the sound engine only applies them. */
export type VolumeKind = 'master' | 'effects' | 'guns' | 'ui';
export type Volumes = Record<VolumeKind, number>;
/** Guns sit well under everything else by default (Reis: gunshots too loud). */
const DEFAULT_VOLUMES: Volumes = { master: 0.8, effects: 1, guns: 0.45, ui: 0.7 };
/** Half the visible width of the arena, for turning world x into stereo pan. */
const HALF_VIEW = 19.5;
/** At most this many gunshot voices at once; extras are skipped. */
const SHOT_BUDGET = 6;

/**
 * One audio context for the whole visit, opened on the first click or key press anywhere (the
 * lobby's buttons count). Opening it costs 100+ ms on a slow phone; doing that on the first key
 * press of a match froze the fight for an instant.
 */
let shared: AudioContext | null = null;
/** Set by the first click, tap or key press (capture phase, so it is true before any handler of that same gesture runs). */
let gestured = false;

/**
 * May the page open its audio context yet? Only after a user gesture: Chrome logs "The AudioContext was not allowed to start"
 * for a context made earlier (release QA 2026-11-28 item 10), and the context would sit suspended anyway. `hasBeenActive` is
 * the browser's own answer where it exists; our flag covers browsers without `navigator.userActivation`.
 */
export const mayOpenAudio = (ownGesture: boolean, userActivation?: { hasBeenActive: boolean } | null): boolean =>
  ownGesture || !!userActivation?.hasBeenActive;

const openContext = () => {
  if (shared) return shared;
  if (!mayOpenAudio(gestured, typeof navigator === 'undefined' ? null : navigator.userActivation)) return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  shared = new AC();
  return shared;
};
if (typeof window !== 'undefined') {
  const early = (e: Event) => {
    // A key event the page made up itself (the gamepad menu driver) is not a gesture to the browser.
    if (!e.isTrusted) return;
    gestured = true;
    openContext();
    window.removeEventListener('pointerdown', early, true);
    window.removeEventListener('keydown', early, true);
  };
  window.addEventListener('pointerdown', early, true);
  window.addEventListener('keydown', early, true);
}

export const createSfx = (initial?: { volumes?: Partial<Volumes>; muted?: boolean }) => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let wet: GainNode | null = null;
  const buses: Partial<Record<Bus, GainNode>> = {};
  let noiseBuf: AudioBuffer | null = null;
  let muted = initial?.muted ?? false;
  const volumes: Volumes = { ...DEFAULT_VOLUMES, ...initial?.volumes };
  /** While a gunshot is being scheduled, all its voices go to the guns bus. */
  let busOverride: Bus | null = null;
  let shotVoices = 0;
  const gate = createGate(BUDGET);
  /** Over budget: the sound is dropped. */
  const may = (name: SoundName) => !!ctx && gate.allow(name, ctx.currentTime * 1000);
  /** Recorded gun sounds (see ASSETS.md), decoded once the audio context exists. */
  const samples = new Map<string, AudioBuffer>();
  const loadSamples = (c: AudioContext) => {
    for (const n of ['pistol', 'smg', 'shotgun', 'sniper', 'pump', 'bolt', 'reload']) {
      fetch(asset(`assets/sounds/${n}.m4a`))
        .then((r) => r.arrayBuffer())
        .then((b) => c.decodeAudioData(b))
        .then((buf) => samples.set(n, buf))
        .catch(() => undefined);
    }
  };

  const MASTER = 0.75;

  /** A small-office impulse response: 0.9 s of decaying noise. */
  const makeRoom = (c: AudioContext) => {
    const len = Math.floor(c.sampleRate * 0.9);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return ir;
  };

  // iOS reports 'interrupted' after a call or a trip to the background, not 'suspended': resume from
  // anything that is not running (a closed context cannot come back).
  const wake = (c: AudioContext) => {
    if (c.state !== 'running' && c.state !== 'closed') void c.resume().catch(() => {});
  };

  const ensure = () => {
    if (ctx) {
      wake(ctx);
      return ctx;
    }
    ctx = openContext();
    if (!ctx) return null;
    wake(ctx);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER * volumes.master;
    // A fast limiter after the master: the compressor shapes the mix, this only catches a stray peak.
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.1;
    comp.connect(master).connect(limit).connect(ctx.destination);
    const verb = ctx.createConvolver();
    verb.buffer = makeRoom(ctx);
    wet = ctx.createGain();
    wet.gain.value = 0.22;
    wet.connect(verb).connect(comp);
    for (const [bus, level] of [['sfx', volumes.effects], ['ui', volumes.ui], ['amb', 0.5], ['guns', volumes.guns]] as const) {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(comp);
      buses[bus] = g;
    }
    loadSamples(ctx);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  };

  interface VoiceOpts {
    delay?: number;
    room?: number;
    pan?: number;
    bus?: Bus;
  }

  /** Route a voice through a panner to its bus, and scaled to the room. */
  const out = (node: AudioNode, { room = 1, pan = 0, bus = 'sfx' }: VoiceOpts) => {
    if (!ctx || !wet) return;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    node.connect(p).connect(buses[busOverride ?? bus]!);
    if (room > 0) {
      const send = ctx.createGain();
      send.gain.value = room;
      p.connect(send).connect(wet);
    }
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  /** Random detune (about ±70 cents) and gain (±10 %) so repeats never sound identical. */
  const vary = () => ({ pitch: Math.pow(2, ((Math.random() - 0.5) * 140) / 1200), gain: 0.9 + Math.random() * 0.2 });

  const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, o: VoiceOpts = {}) => {
    const c = ctx;
    if (!c || muted) return;
    const { pitch, gain } = vary();
    const t = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), t + dur);
    env(g, t, vol * gain, 0.002, dur);
    osc.connect(g);
    out(g, { room: 0.6, ...o });
    osc.start(t);
    osc.stop(t + dur + 0.05);
  };

  const noise = (filter: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1, o: VoiceOpts = {}) => {
    const c = ctx;
    if (!c || !noiseBuf || muted) return;
    const { pitch, gain } = vary();
    const t = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = pitch;
    const bf = c.createBiquadFilter();
    bf.type = filter;
    bf.Q.value = q;
    bf.frequency.setValueAtTime(f0, t);
    bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    env(g, t, vol * gain, 0.0015, dur);
    src.connect(bf).connect(g);
    out(g, o);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  };

  /** A mechanical click: slide, pump, magazine. */
  const click = (delay: number, pitch = 3500, vol = 0.25, pan = 0) => {
    noise('bandpass', pitch, pitch * 0.7, 0.025, vol, 6, { delay, room: 0.3, pan });
    tone('square', pitch * 0.3, pitch * 0.2, 0.015, vol * 0.3, { delay, room: 0.2, pan });
  };

  /** Big moments push the room tone down for a beat. */
  const duck = (db = -9, back = 0.6) => {
    const g = buses.amb;
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.5 * Math.pow(10, db / 20), t, 0.01);
    g.gain.setTargetAtTime(0.5, t + 0.05, back / 3);
  };

  /** The rubber stamp thunk (R-013 3.3); `k` scales the volume (stampBig uses 1.4). */
  const stampVoices = (k: number) => {
    tone('sine', 110, 48, 0.16, 0.3 * k, { room: 0.15, bus: 'ui' });
    noise('lowpass', 900, 200, 0.09, 0.28 * k, 1, { room: 0.15, bus: 'ui' });
    noise('bandpass', 2400, 1600, 0.02, 0.16 * k, 4, { bus: 'ui' });
  };

  const panOf = (x?: number) => (x === undefined ? 0 : x / HALF_VIEW);

  /** Play a recorded sound with a little pitch and level variation. False until it's loaded. */
  const sample = (name: string, o: { pan?: number; gain?: number; delay?: number; rate?: number; room?: number } = {}) => {
    const c = ctx;
    const buf = samples.get(name);
    if (!c || !buf || muted) return false;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * (0.95 + Math.random() * 0.1);
    const g = c.createGain();
    g.gain.value = (o.gain ?? 1) * (0.9 + Math.random() * 0.15);
    src.connect(g);
    out(g, { pan: o.pan ?? 0, room: o.room ?? 0.2 });
    src.start(c.currentTime + (o.delay ?? 0));
    return true;
  };

  /** Real guns use the recordings; the railgun adds its recorded crack under the zap. */
  const RECORDED: Partial<Record<Gun, { name: string; rate?: number; gain: number; after?: string; delay?: number }>> = {
    pistol: { name: 'pistol', gain: 0.55 },
    uzi: { name: 'smg', rate: 1.12, gain: 0.45 },
    smg: { name: 'smg', gain: 0.5 },
    shotgun: { name: 'shotgun', gain: 0.6, after: 'pump', delay: 0.45 },
    railgun: { name: 'sniper', gain: 0.5, after: 'bolt', delay: 0.6 },
  };

  const shot = (gun: Gun, x?: number) => {
    if (!ctx || muted) return;
    if (shotVoices >= SHOT_BUDGET) return;
    busOverride = 'guns';
    try {
      const rec = RECORDED[gun];
      const pan = panOf(x);
      if (rec && sample(rec.name, { pan, gain: rec.gain, rate: rec.rate })) {
        shotVoices += 1;
        setTimeout(() => (shotVoices = Math.max(0, shotVoices - 1)), 90);
        if (rec.after) sample(rec.after, { pan, gain: rec.gain * 0.8, delay: rec.delay });
        // The railgun keeps a quiet electric zap on top of the shot.
        if (gun === 'railgun') tone('sawtooth', 2600, 140, 0.25, 0.12, { pan });
      } else shotVoice(gun, x);
    } finally {
      busOverride = null;
    }
  };
  const shotVoice = (gun: Gun, x?: number) => {
    shotVoices += 1;
    setTimeout(() => (shotVoices = Math.max(0, shotVoices - 1)), 120);
    const pan = panOf(x);
    switch (gun) {
      case 'pistol':
        noise('highpass', 3500, 2000, 0.03, 0.9, 0.7, { pan }); // crack
        noise('bandpass', 1100, 500, 0.12, 0.7, 0.9, { pan }); // body
        tone('sine', 170, 48, 0.14, 0.9, { room: 0.4, pan }); // thump
        click(0.06, 4200, 0.12, pan); // slide
        break;
      case 'uzi':
        noise('highpass', 5000, 3200, 0.015, 0.45, 0.7, { pan });
        noise('bandpass', 1900, 1100, 0.04, 0.35, 1.2, { pan });
        tone('sine', 260, 110, 0.04, 0.35, { room: 0.2, pan });
        break;
      case 'bomb':
        // The throw: a short whoosh and the fuse hiss.
        noise('bandpass', 400, 1800, 0.25, 0.3, 1.4, { room: 0.2, pan });
        noise('highpass', 6000, 5000, 0.4, 0.06, 1, { delay: 0.05, room: 0, pan });
        break;
      case 'smg':
        noise('highpass', 4200, 2600, 0.02, 0.6, 0.7, { pan });
        noise('bandpass', 1500, 800, 0.06, 0.5, 1, { pan });
        tone('sine', 210, 70, 0.06, 0.55, { room: 0.3, pan });
        break;
      case 'shotgun':
        noise('highpass', 2600, 1200, 0.05, 1, 0.6, { pan });
        noise('lowpass', 2400, 180, 0.32, 1, 0.6, { pan });
        tone('sine', 110, 32, 0.3, 1.1, { room: 0.5, pan });
        click(0.38, 2200, 0.35, pan); // pump: chk
        click(0.5, 2800, 0.3, pan); //        -chk
        break;
      case 'railgun':
        tone('sawtooth', 2600, 140, 0.32, 0.35, { pan });
        tone('sine', 5200, 900, 0.22, 0.18, { pan });
        noise('highpass', 6000, 2500, 0.18, 0.45, 0.8, { pan });
        tone('sine', 90, 30, 0.35, 0.9, { room: 0.6, pan });
        break;
      case 'launcher':
        tone('sine', 140, 40, 0.25, 0.9, { room: 0.5, pan });
        noise('lowpass', 1600, 300, 0.15, 0.6, 0.7, { pan });
        noise('bandpass', 500, 2600, 0.5, 0.25, 1.4, { delay: 0.05, pan }); // rocket hiss leaving
        break;
    }
  };

  return {
    unlock: () => ensure(),
    /** Build the sound graph now if the page already has an audio context (opened in the lobby). */
    warm: () => {
      if (shared) ensure();
    },
    /** Dev meter: plays and drops per gated sound. */
    stats: () => gate.stats(),
    get muted() {
      return muted;
    },
    get volumes() {
      return { ...volumes };
    },
    /** Apply volumes (0..1) and mute from Settings at once. */
    apply: (v: Partial<Volumes>, mute: boolean) => {
      Object.assign(volumes, v);
      muted = mute;
      if (master) master.gain.value = muted ? 0 : MASTER * volumes.master;
      if (buses.sfx) buses.sfx.gain.value = volumes.effects;
      if (buses.guns) buses.guns.gain.value = volumes.guns;
      if (buses.ui) buses.ui.gain.value = volumes.ui;
    },
    /** Menu sounds: a tick when focus moves, a confirm chime, a soft back. */
    tick: () => may('tick') && tone('triangle', 1250, 1400, 0.035, 0.12, { room: 0.1, bus: 'ui' }),
    confirm: () => {
      if (!may('confirm')) return;
      tone('triangle', 660, 660, 0.08, 0.16, { room: 0.25, bus: 'ui' });
      tone('triangle', 990, 990, 0.14, 0.14, { delay: 0.07, room: 0.3, bus: 'ui' });
    },
    /** R-013 UI sounds: the stamp announcer, the lift doors and the result stings (all on the ui bus). */
    stamp: () => may('stamp') && stampVoices(1),
    stampBig: () => {
      if (!may('stampBig')) return;
      stampVoices(1.2);
      tone('sine', 62, 32, 0.5, 0.3, { room: 0.4, bus: 'ui' });
    },
    doorSlam: () => {
      if (!may('doorSlam')) return;
      noise('lowpass', 600, 90, 0.22, 0.4, 0.8, { room: 0.3, bus: 'ui' });
      tone('square', 70, 42, 0.12, 0.16, { bus: 'ui' });
      tone('triangle', 2200, 2100, 0.05, 0.05, { delay: 0.02, bus: 'ui' });
    },
    liftDing: () => {
      if (!may('liftDing')) return;
      tone('sine', 1319, 1319, 0.9, 0.2, { room: 0.5, bus: 'ui' });
      tone('sine', 1047, 1047, 1.1, 0.18, { delay: 0.14, room: 0.5, bus: 'ui' });
    },
    /** The floor counter ticking up: n is the floor number. */
    floorTick: (n: number) => may('floorTick') && tone('triangle', 700 + n * 14, 700 + n * 14, 0.025, 0.05, { bus: 'ui' }),
    winSting: () => {
      if (!may('winSting')) return;
      [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.12, 0.12, { delay: i * 0.07, bus: 'ui' }));
    },
    lossSting: () => may('lossSting') && tone('sine', 392, 311, 0.45, 0.14, { room: 0.4, bus: 'ui' }),
    back: () => may('back') && tone('triangle', 700, 420, 0.1, 0.12, { room: 0.2, bus: 'ui' }),
    /** Field Day result reveal (spec 4). Synth stand-ins for the recorded toy sounds; quiet, never harsh (peak well under a gunshot). */
    resultWhoosh: () => may('resultWhoosh') && noise('lowpass', 2400, 220, 0.22, 0.14, 0.8, { room: 0.2, bus: 'ui' }),
    /** Snare drumroll: about 12 fast bursts rising over 0.3 s. */
    drumroll: () => {
      if (!may('drumroll')) return;
      for (let i = 0; i < 12; i++) noise('bandpass', 1900, 1500, 0.03, 0.05 + i * 0.008, 2.5, { delay: i * 0.025, room: 0.15, bus: 'ui' });
    },
    /** Party horn: a bright two-note blast with a little slide. */
    partyHorn: () => {
      if (!may('partyHorn')) return;
      tone('sawtooth', 392, 440, 0.16, 0.08, { room: 0.3, bus: 'ui' });
      tone('sawtooth', 523, 587, 0.4, 0.09, { delay: 0.14, room: 0.35, bus: 'ui' });
      tone('square', 1046, 1174, 0.4, 0.025, { delay: 0.14, room: 0.35, bus: 'ui' });
    },
    /** Kazoo "wah-wah" (a loss): two sagging notes. */
    wahwah: () => {
      if (!may('wahwah')) return;
      tone('sawtooth', 311, 294, 0.22, 0.07, { room: 0.3, bus: 'ui' });
      tone('sawtooth', 262, 196, 0.45, 0.07, { delay: 0.26, room: 0.3, bus: 'ui' });
    },
    thud: () => {
      if (!may('thud')) return;
      tone('sine', 120, 52, 0.14, 0.22, { room: 0.15, bus: 'ui' });
      noise('lowpass', 700, 180, 0.07, 0.12, 1, { room: 0.1, bus: 'ui' });
    },
    slideWhistle: () => may('slideWhistle') && tone('sine', 1700, 520, 0.34, 0.1, { room: 0.35, bus: 'ui' }),
    /** The award "ding": n = 0, 1, 2 rises a major third each time. */
    ding: (n = 0) => {
      if (!may('ding')) return;
      const f = 880 * Math.pow(2, (n * 4) / 12);
      tone('sine', f, f, 0.45, 0.13, { room: 0.5, bus: 'ui' });
      tone('sine', f * 2, f * 2, 0.25, 0.04, { room: 0.5, bus: 'ui' });
    },
    softPop: () => may('softPop') && tone('triangle', 480, 820, 0.06, 0.1, { room: 0.15, bus: 'ui' }),
    /** A murmur of a crowd: filtered noise swells, about -24 dB under the stings. */
    crowd: () => {
      if (!may('crowd')) return;
      noise('bandpass', 620, 760, 0.9, 0.035, 0.7, { room: 0.5, bus: 'ui' });
      noise('bandpass', 900, 700, 0.9, 0.025, 0.7, { delay: 0.7, room: 0.5, bus: 'ui' });
      noise('bandpass', 500, 640, 0.9, 0.03, 0.7, { delay: 1.4, room: 0.5, bus: 'ui' });
    },
    hit: (power: number, x?: number) => {
      if (!may('hit')) return;
      const p = Math.min(1, power / 20);
      const pan = panOf(x);
      tone('sine', 140 + p * 40, 45, 0.12 + p * 0.1, 0.6 + p * 0.3, { room: 0.3, pan });
      noise('lowpass', 2200, 300, 0.07 + p * 0.08, 0.5 + p * 0.3, 1, { room: 0.3, pan });
    },
    shot,
    explosion: (x?: number) => {
      if (!may('explosion')) return;
      const pan = panOf(x);
      duck(-12, 0.9);
      tone('sine', 75, 22, 0.9, 1.2, { room: 0.8, pan });
      noise('lowpass', 2600, 60, 1.0, 1.1, 0.5, { pan });
      noise('highpass', 3000, 1500, 0.08, 0.6, 0.7, { pan });
      for (let i = 0; i < 6; i++) {
        noise('bandpass', 1500 + Math.random() * 2500, 600, 0.04, 0.2, 4, { delay: 0.08 + Math.random() * 0.4, room: 0.6, pan: pan + (Math.random() - 0.5) * 0.4 });
      }
    },
    impact: (x?: number) => may('impact') && noise('bandpass', 4500, 2500, 0.03, 0.12, 3, { room: 0.4, pan: panOf(x) }),
    land: (x?: number) => {
      if (!may('land')) return;
      tone('sine', 90, 50, 0.08, 0.35, { room: 0.2, pan: panOf(x) });
      noise('lowpass', 600, 200, 0.06, 0.2, 1, { room: 0.2, pan: panOf(x) });
    },
    /** A magazine change (recorded), panned to whoever reloads. */
    reload: (x?: number, gain = 0.7) => {
      if (!may('reload')) return;
      if (sample('reload', { pan: panOf(x), gain, room: 0.25 })) return;
      click(0, 3000, 0.25, panOf(x));
      click(0.18, 2200, 0.3, panOf(x));
    },
    deflect: (x?: number) => may('deflect') && tone('triangle', 1600, 2600, 0.12, 0.2, { pan: panOf(x) }),
    empty: () => may('empty') && click(0, 4000, 0.2),
    push: (x?: number) => {
      if (!may('push')) return;
      tone('sawtooth', 120, 55, 0.3, 0.3, { pan: panOf(x) });
      noise('lowpass', 1400, 200, 0.3, 0.5, 1, { pan: panOf(x) });
    },
    glass: (x?: number) => {
      if (!may('glass')) return;
      duck(-8, 0.6);
      noise('highpass', 6000, 3000, 0.4, 0.55, 1, { pan: panOf(x) });
      for (let i = 0; i < 6; i++) tone('sine', 2200 + Math.random() * 3200, 1600 + Math.random() * 2000, 0.3, 0.07, { delay: Math.random() * 0.15, pan: panOf(x) });
    },
    jump: (x?: number) => may('jump') && tone('sine', 300, 520, 0.08, 0.1, { room: 0, pan: panOf(x) }),
    dash: (x?: number) => may('dash') && noise('bandpass', 700, 2800, 0.13, 0.22, 1.2, { room: 0.2, pan: panOf(x) }),
    // Signature traits (R-026 spec 11.2): synth stand-ins on the SFX bus, each at least 8 dB under a gunshot, 300 ms or shorter
    // (Tea Break's sigh is the one written exception). Pan follows the fighter.
    leapfrog: (x?: number) => {
      if (!may('leapfrog')) return;
      tone('sine', 300, 900, 0.12, 0.07, { room: 0.25, pan: panOf(x) }); // rubber boing up
      noise('bandpass', 2200, 1400, 0.1, 0.05, 3, { delay: 0.04, room: 0.2, pan: panOf(x) }); // skate-wheel rattle
    },
    teaBreak: (x?: number) => {
      if (!may('teaBreak')) return;
      tone('sine', 2100, 2100, 0.25, 0.05, { room: 0.4, pan: panOf(x) }); // porcelain clink
      tone('sine', 3200, 3200, 0.25, 0.035, { room: 0.4, pan: panOf(x) });
      noise('lowpass', 1800, 500, 0.4, 0.025, 0.8, { delay: 0.18, room: 0.35, pan: panOf(x) }); // kettle sigh, -6 dB
    },
    sugarRush: (x?: number) => {
      if (!may('sugarRush')) return;
      tone('sine', 2400, 2900, 0.06, 0.06, { room: 0.3, pan: panOf(x) }); // her whistle: two chirps
      tone('sine', 2400, 2900, 0.06, 0.06, { delay: 0.1, room: 0.3, pan: panOf(x) });
    },
    packedExtra: (x?: number) => {
      if (!may('packedExtra')) return;
      noise('bandpass', 1200, 3200, 0.15, 0.07, 2, { room: 0.15, pan: panOf(x) }); // zipper
      click(0.17, 3000, 0.07, panOf(x)); // magazine clack
    },
    pickup: () => {
      click(0, 2600, 0.3);
      tone('triangle', 520, 780, 0.08, 0.12, { delay: 0.05, room: 0.2, bus: 'ui' });
    },
    drop: (x?: number) => {
      tone('triangle', 880, 440, 0.15, 0.12, { pan: panOf(x), bus: 'ui' });
      tone('triangle', 660, 330, 0.2, 0.08, { delay: 0.1, pan: panOf(x), bus: 'ui' });
    },
    ko: (x?: number) => {
      if (!may('ko')) return;
      duck(-14, 1.2);
      tone('sawtooth', 420, 50, 0.7, 0.3, { pan: panOf(x) });
      noise('lowpass', 3000, 100, 0.6, 0.5, 1, { pan: panOf(x) });
    },
    start: () => {
      tone('square', 440, 440, 0.12, 0.12, { room: 0.3, bus: 'ui' });
      tone('square', 880, 880, 0.25, 0.15, { delay: 0.14, room: 0.3, bus: 'ui' });
    },
  };
};
