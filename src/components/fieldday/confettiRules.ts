/**
 * Confetti rules and geometry (spec 3 b12-b14, 5 and bug 23). Pure: the rules are unit-tested, <Confetti> only draws.
 *
 * Confetti happens ONLY for: a win (a cannon from both lower corners at 0.30 s of the result, then a thinner rain until 8 s),
 * a KO score pop (a 6-piece puff beside the tile, never on the digit) and 2P "both ready". Never on a loss, never idle on a
 * menu, never with Reduced motion. It renders BEHIND all UI text (z-order: rays, confetti, track, content): mount it before the
 * content in the DOM, or give it a lower z-index than the content.
 */
export type ConfettiKind = 'cannon' | 'rain' | 'puff' | 'ready';

export interface ConfettiContext {
  kind: ConfettiKind;
  /** The result screen's outcome, when the burst belongs to one. */
  outcome?: 'win' | 'loss';
  reduced: boolean;
}

export const confettiAllowed = ({ kind, outcome, reduced }: ConfettiContext): boolean => {
  if (reduced) return false;
  if (outcome === 'loss') return false;
  if ((kind === 'cannon' || kind === 'rain') && outcome !== 'win') return false;
  return true;
};

/** How many pieces and how long (seconds) each kind lives. Spec: cannon 34 pieces, life 2.6-4.4 s; rain thins to 14, stops at 8 s; puff 6. */
export const CONFETTI = {
  cannon: { count: 34, life: [2.6, 4.4] as const, stopAt: 4.4 },
  rain: { count: 14, life: [2.6, 4.4] as const, stopAt: 8 },
  puff: { count: 6, life: [0.9, 1.3] as const, stopAt: 1.3 },
  ready: { count: 18, life: [1.2, 2] as const, stopAt: 2 },
} as const;

/**
 * R-027 colour balance: confetti is sun, white and the accent of the fighter it celebrates, never the whole rainbow.
 * One accent (a win, a KO puff): sun, white, that accent, sun-hi. Two accents (a draw, 2P both ready): sun, white, both accents.
 * No accent: sun, white, sun-hi, white.
 */
export const confettiColors = (accents: readonly string[] = []): string[] => {
  if (accents.length >= 2) return ['#FFC83D', '#FFFFFF', accents[0], accents[1]];
  if (accents.length === 1) return ['#FFC83D', '#FFFFFF', accents[0], '#FFE38A'];
  return ['#FFC83D', '#FFFFFF', '#FFE38A', '#FFFFFF'];
};

export interface Piece {
  /** Start position inside the layer (px, design units). */
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Seconds. */
  dur: number;
  delay: number;
  /** Horizontal drift and vertical peak (negative = up) and end (positive = down), px; rotation degrees. */
  dx: number;
  peak: number;
  end: number;
  rot: number;
}

/** A small deterministic generator, so a burst is reproducible in tests and screenshots. */
export const seeded = (seed: number) => {
  let s = Math.max(1, Math.floor(seed)) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

/** The pieces for a burst in a layer of `w` x `h` design px. */
export const confettiPlan = (kind: ConfettiKind, w: number, h: number, seed = 1, colors: readonly string[] = confettiColors()): Piece[] => {
  const r = seeded(seed);
  const { count, life } = CONFETTI[kind];
  const out: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const dur = life[0] + r() * (life[1] - life[0]);
    const color = colors[i % colors.length];
    const sign = r() > 0.5 ? 1 : -1;
    const rot = sign * (360 + r() * 400);
    const base = { w: kind === 'puff' ? 9 : 12, h: kind === 'puff' ? 14 : 20, color, dur, rot };
    if (kind === 'cannon') {
      // Both lower corners fire up and inward, then gravity.
      const left = i % 2 === 0;
      out.push({ ...base, x: left ? 24 : w - 36, y: h - 24, delay: r() * 0.25, dx: (left ? 1 : -1) * (120 + r() * 380), peak: -(h * (0.45 + r() * 0.4)), end: 60 });
    } else if (kind === 'rain') {
      out.push({ ...base, x: 30 + r() * (w - 60), y: -30, delay: r() * 2.5, dx: (r() - 0.5) * 160, peak: (h + 60) * 0.3, end: h + 60 });
    } else if (kind === 'puff') {
      // Beside the tile, never on it: pieces fan out sideways and up from the origin (0,0) of the layer.
      out.push({ ...base, x: 0, y: 0, delay: r() * 0.08, dx: 20 + r() * 80, peak: -(20 + r() * 40), end: 50 });
    } else {
      // "Both ready": a short shower from the top.
      out.push({ ...base, x: 40 + r() * (w - 80), y: -30, delay: r() * 0.35, dx: (r() - 0.5) * 140, peak: h * 0.8 * 0.3, end: h * 0.8 });
    }
  }
  return out;
};
