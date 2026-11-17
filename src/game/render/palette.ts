import * as THREE from 'three';

/** Floor 42 palette, shared with the agents-know office. */
export const PALETTE = {
  ink: 0x2a2733,
  inkSoft: 0x3a3650,
  cream: 0xf1ebdf,
  paper: 0xfbf6ea,
  green: 0x2f8f5b,
  orange: 0xd4552f,
  red: 0xcf3b3b,
  blue: 0x4a6fa5,
  gold: 0xf0c24a,
  lilac: 0xcfc6d8,
  stone: 0x8a8478,
  skinA: 0xe9b48f,
  skinB: 0xc68a63,
  skinC: 0x8d5a3b,
  white: 0xfffaf0,
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Flat-shaded low-poly material, cached by colour and options. */
export const mat = (color: number, opts: { emissive?: number; opacity?: number } = {}) => {
  const key = `${color}-${opts.emissive ?? 0}-${opts.opacity ?? 1}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
      emissive: opts.emissive ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    cache.set(key, m);
  }
  return m;
};

export const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, shadow = true) => {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
};
