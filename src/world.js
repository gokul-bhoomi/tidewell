// The village of Tidewell: layout shared by the sim (collisions, places, routes) and the renderer
// (what to build where). Pure data plus a few geometry helpers. North is -z, east is +x.
//
// Four roads leave the round plaza: east to the gate, west past the training yard, south to the
// market, north to the elder's house and the north gate.
import { rng } from './rng.js';

export const BOUNDS = 46; // the palisade: nobody walks past |x| or |z| = BOUNDS
export const PLAZA_R = 12;
export const ROAD_W = 6;

export const PLACES = {
  landing: { x: 0, z: 6 },
  yard: { x: -27, z: 13 },
  eastGate: { x: 38, z: 0 },
  market: { x: 0, z: 31 },
  northGate: { x: 0, z: -36 },
};

// Houses: axis-aligned boxes. face = the side with the door (toward the road).
const B = (x, z, w, d, h, face, style = 'house') => ({ x, z, w, d, h, face, style });
export const BUILDINGS = [
  // east road
  B(18, -9, 7, 6, 4, 's', 'smithy'), B(27, -9, 7, 6, 5, 's'), B(36, -9.5, 7, 7, 4.5, 's'),
  B(18, 9, 7, 6, 4.5, 'n', 'healer'), B(27, 9, 7, 6, 4, 'n'), B(37, 9.5, 8, 7, 5, 'n'),
  // west road (the training yard is south of it)
  B(-18, -9, 7, 6, 4.5, 's', 'bakery'), B(-27, -9, 7, 6, 4, 's'), B(-36, -9, 7, 6, 5, 's'),
  // south road: houses behind the market stalls
  B(14, 24, 7, 8, 4.5, 'w'), B(14, 36, 7, 8, 5, 'w'), B(-14, 24, 7, 8, 4, 'e'), B(-14, 36, 7, 8, 4.5, 'e'),
  // north road
  B(9, -19, 6, 7, 4.5, 'w'), B(9, -29, 6, 7, 4, 'w'), B(-9, -19, 6, 7, 5, 'e'), B(-10, -29, 8, 8, 6, 'e', 'elder'),
  B(9, -40, 6, 6, 4, 'w'), B(-9, -40, 6, 6, 4.5, 'e'),
  // the quarters between the roads
  B(24, -24, 8, 7, 5, 's'), B(37, -25, 7, 7, 4.5, 'w'), B(26, -37, 7, 6, 4, 's'),
  B(-24, -24, 8, 7, 5, 's'), B(-37, -25, 7, 8, 4.5, 'e'), B(-25, -37, 7, 6, 4, 's'),
  B(26, 24, 8, 7, 4.5, 'n'), B(38, 34, 7, 7, 5, 'w'), B(26, 37, 7, 6, 4, 'n'),
  B(-28, 32, 7, 7, 4, 'n'), B(-40, 38, 6, 6, 4, 'e'),
];
// Market stalls line the south road.
export const STALLS = [22, 28, 34, 40].flatMap((z, i) => [
  { x: -6.5, z, w: 3, d: 2.4, h: 2.6, face: 'e', style: 'stall', tint: i % 4 },
  { x: 6.5, z, w: 3, d: 2.4, h: 2.6, face: 'w', style: 'stall', tint: (i + 2) % 4 },
]);

export const WELL = { x: 0, z: 0, r: 1.5 };
export const YARD = { x0: -37, x1: -17, z0: 5, z1: 21 };
export const DUMMIES = [{ x: -32, z: 9 }, { x: -27, z: 8 }, { x: -22, z: 9 }];
export const BRAM_POST = { x: -27, z: 15.5 };

const onRoad = (x, z) => Math.abs(x) < 5 || Math.abs(z) < 5;
const inBox = (x, z, b, m = 0) => Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m;

// Trees: scattered with a fixed seed, kept off the roads, plaza, yard, market and houses.
export const TREES = (() => {
  const r = rng(1234), out = [];
  for (let i = 0; i < 400 && out.length < 46; i++) {
    const x = (r() * 2 - 1) * (BOUNDS - 2), z = (r() * 2 - 1) * (BOUNDS - 2);
    if (onRoad(x, z) || Math.hypot(x, z) < PLAZA_R + 3) continue;
    if (x > YARD.x0 - 2 && x < YARD.x1 + 2 && z > YARD.z0 - 2 && z < YARD.z1 + 2) continue;
    if (Math.abs(x) < 10 && z > 12) continue;
    if ([...BUILDINGS, ...STALLS].some((b) => inBox(x, z, b, 2.2))) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
    out.push({ x, z, r: 0.45, s: 0.85 + r() * 0.6 });
  }
  return out;
})();

export const BOXES = [...BUILDINGS, ...STALLS];
export const CIRCLES = [WELL, ...TREES];

// Push a circle (o.x, o.z, radius r) out of houses, the well, trees and the palisade.
export function collide(o, r) {
  for (const b of BOXES) {
    const hx = b.w / 2, hz = b.d / 2;
    const cx = Math.max(b.x - hx, Math.min(b.x + hx, o.x)), cz = Math.max(b.z - hz, Math.min(b.z + hz, o.z));
    const dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d > 1e-6) { o.x = cx + (dx / d) * r; o.z = cz + (dz / d) * r; continue; }
    // centre inside the box: leave by the nearest side
    const px = hx - Math.abs(o.x - b.x), pz = hz - Math.abs(o.z - b.z);
    if (px < pz) o.x = b.x + Math.sign(o.x - b.x || 1) * (hx + r);
    else o.z = b.z + Math.sign(o.z - b.z || 1) * (hz + r);
  }
  for (const c of CIRCLES) {
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
    if (d < m && d > 1e-6) { o.x = c.x + (dx / d) * m; o.z = c.z + (dz / d) * m; }
  }
  const lim = BOUNDS - r;
  o.x = Math.max(-lim, Math.min(lim, o.x)); o.z = Math.max(-lim, Math.min(lim, o.z));
}

// Does the segment a -> b pass through a house (grown by margin) or the well?
export function blocked(a, b, margin = 0.5) {
  for (const box of BOXES) {
    const x0 = box.x - box.w / 2 - margin, x1 = box.x + box.w / 2 + margin, z0 = box.z - box.d / 2 - margin, z1 = box.z + box.d / 2 + margin;
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dz = b.z - a.z;
    const clip = (p, q) => { if (Math.abs(p) < 1e-9) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
    if (clip(-dx, a.x - x0) && clip(dx, x1 - a.x) && clip(-dz, a.z - z0) && clip(dz, z1 - a.z)) return true;
  }
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((WELL.x - a.x) * dx + (WELL.z - a.z) * dz) / L));
  return Math.hypot(a.x + dx * t - WELL.x, a.z + dz * t - WELL.z) < WELL.r + margin;
}

// Road and plaza waypoints for anyone who has to walk around houses (the test bot, NPCs).
export const NODES = (() => {
  const n = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; n.push({ x: Math.sin(a) * 7, z: Math.cos(a) * 7 }); }
  for (const s of [12, 20, 28, 36, 42]) n.push({ x: s, z: 0 }, { x: -s, z: 0 }, { x: 0, z: s }, { x: 0, z: -s });
  n.push(PLACES.yard, { x: -27, z: 3 }, { x: -20, z: 13 }, { x: -34, z: 13 });
  return n;
})();

// Shortest walk from a to b through the waypoints (straight line when nothing is in the way).
export function route(a, b) {
  if (!blocked(a, b, 0.6)) return [b];
  const pts = [a, ...NODES, b], N = pts.length;
  const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), done = new Array(N).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < N; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === N - 1) break;
    done[u] = true;
    for (let v = 0; v < N; v++) {
      if (done[v] || blocked(pts[u], pts[v], 0.6)) continue;
      const d = dist[u] + Math.hypot(pts[u].x - pts[v].x, pts[u].z - pts[v].z);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  if (prev[N - 1] < 0) return [b];
  const path = [];
  for (let v = N - 1; v > 0; v = prev[v]) path.unshift(pts[v]);
  return path;
}
