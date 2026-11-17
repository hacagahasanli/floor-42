/**
 * Every sound is synthesised with WebAudio at runtime: no audio files, nothing to license.
 * Browsers only allow audio after a user gesture, so the context starts on the first key.
 */

export type Sfx = ReturnType<typeof createSfx>;

export const createSfx = () => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = false;

  const ensure = () => {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number) => {
    const c = ctx;
    if (!c || !master || muted) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, vol, 0.005, dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const noise = (filter: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1) => {
    const c = ctx;
    if (!c || !master || !noiseBuf || muted) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bf = c.createBiquadFilter();
    bf.type = filter;
    bf.Q.value = q;
    bf.frequency.setValueAtTime(f0, t);
    bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    env(g, t, vol, 0.004, dur);
    src.connect(bf).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  };

  return {
    unlock: () => ensure(),
    toggleMute: () => {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    hit: (power: number) => {
      const p = Math.min(1, power / 20);
      tone('sine', 160 + p * 40, 50, 0.12 + p * 0.1, 0.5 + p * 0.3);
      noise('lowpass', 2500, 300, 0.08 + p * 0.08, 0.5 + p * 0.3);
    },
    shot: (gun: 'pistol' | 'smg' | 'shotgun' | 'railgun' | 'launcher') => {
      if (gun === 'pistol') {
        noise('bandpass', 2400, 600, 0.09, 0.5, 0.8);
        tone('square', 320, 90, 0.06, 0.15);
      } else if (gun === 'smg') {
        noise('bandpass', 3000, 900, 0.05, 0.35, 0.9);
        tone('square', 260, 120, 0.035, 0.08);
      } else if (gun === 'shotgun') {
        noise('lowpass', 3500, 200, 0.28, 0.8, 0.6);
        tone('sine', 120, 40, 0.2, 0.5);
      } else if (gun === 'railgun') {
        tone('sawtooth', 1800, 120, 0.35, 0.25);
        tone('sine', 3200, 600, 0.25, 0.15);
        noise('highpass', 5000, 2000, 0.2, 0.25);
      } else {
        tone('sine', 220, 70, 0.18, 0.35);
        noise('bandpass', 900, 300, 0.2, 0.3, 1);
      }
    },
    explosion: () => {
      tone('sine', 90, 25, 0.6, 0.8);
      noise('lowpass', 2000, 80, 0.7, 0.9, 0.5);
    },
    impact: () => noise('highpass', 4000, 2500, 0.03, 0.08),
    reload: () => {
      tone('square', 600, 600, 0.03, 0.08);
      setTimeout(() => tone('square', 900, 900, 0.03, 0.08), 120);
    },
    deflect: () => tone('triangle', 1600, 2400, 0.1, 0.15),
    empty: () => tone('square', 200, 150, 0.08, 0.1),
    push: () => {
      tone('sawtooth', 120, 60, 0.3, 0.25);
      noise('lowpass', 1200, 200, 0.3, 0.4);
    },
    glass: () => {
      noise('highpass', 6000, 3000, 0.35, 0.45);
      for (let i = 0; i < 4; i++) tone('sine', 2000 + Math.random() * 3000, 1500 + Math.random() * 2000, 0.25, 0.08);
    },
    jump: () => tone('sine', 300, 520, 0.09, 0.12),
    dash: () => noise('bandpass', 800, 3000, 0.12, 0.2, 1.2),
    pickup: () => {
      tone('triangle', 520, 780, 0.07, 0.15);
    },
    drop: () => {
      tone('triangle', 880, 440, 0.15, 0.12);
      tone('triangle', 660, 330, 0.2, 0.08);
    },
    ko: () => {
      tone('sawtooth', 440, 55, 0.7, 0.3);
      noise('lowpass', 3000, 100, 0.6, 0.5);
    },
    start: () => {
      tone('square', 440, 440, 0.12, 0.12);
      setTimeout(() => tone('square', 880, 880, 0.25, 0.15), 140);
    },
  };
};
