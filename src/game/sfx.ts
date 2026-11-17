/**
 * Every sound is synthesised with WebAudio at runtime: no audio files, nothing to license.
 * Browsers only allow audio after a user gesture, so the context starts on the first key.
 *
 * Gunshots are layered the way real ones are recorded: a sharp crack (the muzzle blast,
 * high-passed noise), a body (band-passed noise), a low thump (a falling sine), and the
 * room answering back (a short generated reverb). A compressor glues it together.
 */

export type Sfx = ReturnType<typeof createSfx>;

type Gun = 'pistol' | 'smg' | 'shotgun' | 'railgun' | 'launcher';

export const createSfx = () => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let dry: GainNode | null = null;
  let wet: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = false;

  /** A small-office impulse response: 0.9 s of decaying noise, a little brighter early on. */
  const makeRoom = (c: AudioContext) => {
    const len = Math.floor(c.sampleRate * 0.9);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return ir;
  };

  const ensure = () => {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    comp.connect(master).connect(ctx.destination);
    dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(comp);
    const verb = ctx.createConvolver();
    verb.buffer = makeRoom(ctx);
    wet = ctx.createGain();
    wet.gain.value = 0.22;
    wet.connect(verb).connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  };

  /** Route a voice to the dry bus and, scaled, to the room. */
  const out = (node: AudioNode, room = 1) => {
    if (!dry || !wet || !ctx) return;
    node.connect(dry);
    if (room > 0) {
      const send = ctx.createGain();
      send.gain.value = room;
      node.connect(send).connect(wet);
    }
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, room = 0.6) => {
    const c = ctx;
    if (!c || muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, vol, 0.002, dur);
    o.connect(g);
    out(g, room);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const noise = (filter: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1, delay = 0, room = 1) => {
    const c = ctx;
    if (!c || !noiseBuf || muted) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const bf = c.createBiquadFilter();
    bf.type = filter;
    bf.Q.value = q;
    bf.frequency.setValueAtTime(f0, t);
    bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    env(g, t, vol, 0.0015, dur);
    src.connect(bf).connect(g);
    out(g, room);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  };

  /** A mechanical click: slide, pump, magazine. */
  const click = (delay: number, pitch = 3500, vol = 0.25) => {
    noise('bandpass', pitch, pitch * 0.7, 0.025, vol, 6, delay, 0.3);
    tone('square', pitch * 0.3, pitch * 0.2, 0.015, vol * 0.3, delay, 0.2);
  };

  const shot = (gun: Gun) => {
    const v = 0.9 + Math.random() * 0.2; // no two shots identical
    switch (gun) {
      case 'pistol':
        noise('highpass', 3500, 2000, 0.03, 0.9 * v, 0.7); // crack
        noise('bandpass', 1100, 500, 0.12, 0.7 * v, 0.9); // body
        tone('sine', 170, 48, 0.14, 0.9 * v, 0, 0.4); // thump
        break;
      case 'smg':
        noise('highpass', 4200, 2600, 0.02, 0.6 * v, 0.7);
        noise('bandpass', 1500, 800, 0.06, 0.5 * v, 1);
        tone('sine', 210, 70, 0.06, 0.55 * v, 0, 0.3);
        break;
      case 'shotgun':
        noise('highpass', 2600, 1200, 0.05, 1 * v, 0.6);
        noise('lowpass', 2400, 180, 0.32, 1 * v, 0.6);
        tone('sine', 110, 32, 0.3, 1.1 * v, 0, 0.5);
        // Pump: chk-chk.
        click(0.38, 2200, 0.35);
        click(0.5, 2800, 0.3);
        break;
      case 'railgun':
        tone('sawtooth', 2600, 140, 0.32, 0.35 * v);
        tone('sine', 5200, 900, 0.22, 0.18 * v);
        noise('highpass', 6000, 2500, 0.18, 0.45 * v, 0.8);
        tone('sine', 90, 30, 0.35, 0.9 * v, 0, 0.6);
        break;
      case 'launcher':
        tone('sine', 140, 40, 0.25, 0.9 * v, 0, 0.5);
        noise('lowpass', 1600, 300, 0.15, 0.6 * v, 0.7);
        noise('bandpass', 500, 2600, 0.5, 0.25 * v, 1.4, 0.05); // rocket hiss leaving
        break;
    }
  };

  return {
    unlock: () => ensure(),
    toggleMute: () => {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
    hit: (power: number) => {
      const p = Math.min(1, power / 20);
      tone('sine', 140 + p * 40, 45, 0.12 + p * 0.1, 0.6 + p * 0.3, 0, 0.3);
      noise('lowpass', 2200, 300, 0.07 + p * 0.08, 0.5 + p * 0.3, 1, 0, 0.3);
    },
    shot,
    explosion: () => {
      tone('sine', 75, 22, 0.9, 1.2, 0, 0.8);
      noise('lowpass', 2600, 60, 1.0, 1.1, 0.5);
      noise('highpass', 3000, 1500, 0.08, 0.6, 0.7);
      for (let i = 0; i < 6; i++) noise('bandpass', 1500 + Math.random() * 2500, 600, 0.04, 0.2, 4, 0.08 + Math.random() * 0.4, 0.6);
    },
    impact: () => noise('bandpass', 4500, 2500, 0.03, 0.12, 3, 0, 0.4),
    reload: () => {
      click(0, 3000, 0.25);
      click(0.18, 2200, 0.3);
    },
    deflect: () => tone('triangle', 1600, 2600, 0.12, 0.2),
    empty: () => click(0, 4000, 0.2),
    push: () => {
      tone('sawtooth', 120, 55, 0.3, 0.3);
      noise('lowpass', 1400, 200, 0.3, 0.5);
    },
    glass: () => {
      noise('highpass', 6000, 3000, 0.4, 0.55);
      for (let i = 0; i < 6; i++) tone('sine', 2200 + Math.random() * 3200, 1600 + Math.random() * 2000, 0.3, 0.07, Math.random() * 0.15);
    },
    jump: () => tone('sine', 300, 520, 0.08, 0.1, 0, 0),
    dash: () => noise('bandpass', 700, 2800, 0.13, 0.22, 1.2, 0, 0.2),
    pickup: () => {
      click(0, 2600, 0.3);
      tone('triangle', 520, 780, 0.08, 0.12, 0.05, 0.2);
    },
    drop: () => {
      tone('triangle', 880, 440, 0.15, 0.12);
      tone('triangle', 660, 330, 0.2, 0.08, 0.1);
    },
    ko: () => {
      tone('sawtooth', 420, 50, 0.7, 0.3);
      noise('lowpass', 3000, 100, 0.6, 0.5);
    },
    start: () => {
      tone('square', 440, 440, 0.12, 0.12, 0, 0.3);
      tone('square', 880, 880, 0.25, 0.15, 0.14, 0.3);
    },
  };
};
