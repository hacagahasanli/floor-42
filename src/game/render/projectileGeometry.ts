import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A unit-length tracer along +x made of two boxes in one vertex-coloured geometry: the body and a lighter head at the
 * leading (+x) end. One geometry and one material, so the head costs no extra draw call.
 * `headFraction` is the head's share of the length (0.22 m of 0.9 m).
 */
export const headedTracerGeometry = (headFraction: number, body: number, head: number, thickness: number): THREE.BufferGeometry => {
  const split = 0.5 - headFraction;
  const part = (x0: number, x1: number, hex: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, thickness, thickness);
    g.translate((x0 + x1) / 2, 0, 0);
    const c = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const a = part(-0.5, split, body);
  const b = part(split, 0.5, head);
  const merged = mergeGeometries([a, b])!;
  a.dispose();
  b.dispose();
  return merged;
};
