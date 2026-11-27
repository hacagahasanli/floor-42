/**
 * How bullets and pellets look in one arena (docs/collab/CREATIVE/levels/arena-2.md section 5.7, F-041).
 * The office keeps its cream tracer and orange pellet (absent style). On OFFSITE's pale sand and sky those read as
 * ambient sand, so the projectile there is dark ink with a light head (about 8:1 against sky, 11:1 against sand).
 */
export interface ProjectileStyle {
  /** Tracer: body colour, the leading head colour, sizes in metres. */
  tracer: { body: number; head: number; length: number; headLength: number; thickness: number };
  pellet: { color: number; length: number; thickness: number };
}

export const OFFSITE_PROJECTILES: ProjectileStyle = {
  tracer: { body: 0x1b1f2e, head: 0xf3ede0, length: 0.9, headLength: 0.22, thickness: 0.08 },
  pellet: { color: 0x1b1f2e, length: 0.35, thickness: 0.08 },
};

/**
 * Rule R8 (arena-2.md 5.6): an ambient quad is never thinner than 1:2.5 and never faster than 6 m/s below y 13.5.
 * A thin fast pale line is what a tracer looks like, so only projectiles may be one.
 */
export const R8 = { maxAspect: 2.5, maxSpeed: 6, belowY: 13.5 } as const;

/** The OFFSITE blowing-sand pool's quad shapes (section 5.6 item 4, R-020 rev.). Sizes in metres, speed m/s. */
export const SAND_SHAPES = {
  streamer: { w0: 0.6, w1: 1.4, h0: 0.3, h1: 0.7, alpha: 0.35, speed: 4, minY: 14.8 },
  skitter: { w: 0.7, h0: 0.3, h1: 0.48, alpha: 0.22, speed: 6, y0: 0.02, y1: 0.2 },
} as const;
