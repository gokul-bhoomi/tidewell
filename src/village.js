// Builds Tidewell in Three.js from the layout in world.js: textured houses, roads, the cobbled plaza,
// market stalls, the training yard, the palisade, the sea, trees, and the festival decorations.
// Every loose piece is registered so the shockwave can throw it.
import * as THREE from 'three';
import { BUILDINGS, STALLS, TREES, WELL, YARD, DUMMIES, BOUNDS, PLAZA_R } from './world.js';
import { plaster, roofTiles, grass, dirt, cobbles, wood, straw, awning, water } from './textures.js';
import { toon } from './characters.js';
import { rng } from './rng.js';

const lam = (color, map = null, extra = {}) => new THREE.MeshLambertMaterial({ color, map, ...extra });
const edgesMat = new THREE.LineBasicMaterial({ color: 0x24181a });

function withEdges(mesh) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), edgesMat);
  mesh.add(e);
  return mesh;
}

export function buildVillage(scene) {
  const pieces = []; // things the shockwave can throw: { obj, r, kind, homeP, homeQ, state, vel, axis, w }
  const add = (obj, r, kind, loose = true) => {
    obj.castShadow = true; obj.receiveShadow = true;
    scene.add(obj);
    if (loose) pieces.push({ obj, kind, r, homeP: obj.position.clone(), homeQ: obj.quaternion.clone(), state: 'home', vel: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0), w: 0 });
    return obj;
  };
  const rand = rng(99);

  // ---------- ground ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lam(0xffffff, grass()));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const roadMat = lam(0xffffff, dirt());
  for (const [x, z, w, d] of [[29, 0, 34, 6], [-29, 0, 34, 6], [0, 29, 6, 34], [0, -29, 6, 34]]) {
    const tex = roadMat.map.clone(); tex.needsUpdate = true; tex.repeat.set(w > d ? 10 : 1.5, w > d ? 1.5 : 10);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0xffffff, tex));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true; scene.add(m);
  }
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R + 0.5, 64), lam(0xffffff, cobbles()));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; plaza.receiveShadow = true; scene.add(plaza);
  const curb = new THREE.Mesh(new THREE.RingGeometry(PLAZA_R + 0.2, PLAZA_R + 0.8, 72), lam(0x8a7a66));
  curb.rotation.x = -Math.PI / 2; curb.position.y = 0.04; scene.add(curb);
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(YARD.x1 - YARD.x0, YARD.z1 - YARD.z0), lam(0xffffff, dirt()));
  yard.rotation.x = -Math.PI / 2; yard.position.set((YARD.x0 + YARD.x1) / 2, 0.025, (YARD.z0 + YARD.z1) / 2); scene.add(yard);

  // sea to the south, hills to the north
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 200), lam(0xffffff, water(), { emissive: 0x0a2a3a }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.05, BOUNDS + 104); scene.add(sea);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(600, 10), lam(0xe8d4a0));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.04, BOUNDS + 6); scene.add(sand);
  const hillMat = lam(0x5e8f52, null, { flatShading: true });
  for (let i = 0; i < 14; i++) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(25 + rand() * 25, 18 + rand() * 22, 7), hillMat);
    h.position.set(-150 + i * 23 + rand() * 10, 0, -BOUNDS - 45 - rand() * 50); scene.add(h);
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(25 + rand() * 20, 14 + rand() * 18, 7), hillMat);
    h.position.set(sx * (BOUNDS + 45 + rand() * 30), 0, -60 + i * 28); scene.add(h);
  }

  // ---------- houses ----------
  const wallCols = [0xf1e3c8, 0xe9d6b4, 0xf4ead8, 0xdcc6a0, 0xe8d0c0];
  const roofCols = [0xc4583a, 0xb04a35, 0x3f6f8f, 0xd06b40, 0x6a8a4a];
  const doorMat = toon(0xffffff, wood(0x6b4a2f)), winMat = lam(0x3b4a5c, null, { emissive: 0xffb45a, emissiveIntensity: 0 });
  const shutterMat = toon(0x4a7a9a);
  const special = { smithy: 0x5a5a62, healer: 0x6ab47a, bakery: 0xd9a03d, elder: 0x7a5c99 };
  BUILDINGS.forEach((b, i) => {
    const walls = withEdges(new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), lam(0xffffff, plaster(wallCols[i % wallCols.length]))));
    walls.position.set(b.x, b.h / 2, b.z); add(walls, b.h / 2, 'wall');
    const roofCol = special[b.style] ?? roofCols[(i * 3) % roofCols.length];
    const rw = b.w + 0.8, rd = b.d + 0.8, rh = 1.6 + Math.min(b.w, b.d) * 0.18;
    // gable roof: a triangular prism along the longer side
    const along = b.w >= b.d;
    const shape = new THREE.Shape([new THREE.Vector2(-(along ? rd : rw) / 2, 0), new THREE.Vector2((along ? rd : rw) / 2, 0), new THREE.Vector2(0, rh)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: along ? rw : rd, bevelEnabled: false });
    geo.translate(0, 0, -(along ? rw : rd) / 2);
    const roof = withEdges(new THREE.Mesh(geo, lam(0xffffff, roofTiles(roofCol))));
    roof.position.set(b.x, b.h, b.z); roof.rotation.y = along ? Math.PI / 2 : 0; add(roof, 0.7, 'roof');
    // door, windows and a chimney on the street side
    const n = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[b.face], half = b.face === 'n' || b.face === 's' ? b.d / 2 : b.w / 2;
    const rotY = Math.atan2(n[0], n[1]);
    const fx = b.x + n[0] * (half + 0.04), fz = b.z + n[1] * (half + 0.04);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.12), doorMat); door.position.set(fx, 0.95, fz); door.rotation.y = rotY; add(door, 0.1, 'bit');
    const side = [Math.cos(rotY), -Math.sin(rotY)], span = (b.face === 'n' || b.face === 's' ? b.w : b.d) * 0.3;
    for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.1), winMat);
      win.position.set(fx + side[0] * s * span, b.h * 0.58, fz + side[1] * s * span); win.rotation.y = rotY; add(win, 0.1, 'bit');
      for (const t of [-1, 1]) {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.06), shutterMat);
        sh.position.set(win.position.x + side[0] * t * 0.55, win.position.y, win.position.z + side[1] * t * 0.55); sh.rotation.y = rotY; add(sh, 0.05, 'bit');
      }
    }
    if (i % 3 === 0) { const ch = withEdges(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), lam(0x9a8a7a))); ch.position.set(b.x + b.w * 0.25, b.h + rh * 0.7, b.z - b.d * 0.15); add(ch, 0.3, 'bit'); }
    if (b.style !== 'house') { // a hanging sign
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.06), toon(special[b.style]));
      sign.position.set(fx + side[0] * (span + 1.1), 2.3, fz + side[1] * (span + 1.1) + 0); sign.rotation.y = rotY; add(sign, 0.1, 'bit');
    }
  });

  // ---------- market stalls ----------
  const awnings = [[0xd84a3a, 0xf4ead8], [0x3a7ab8, 0xf4ead8], [0x4a9a5a, 0xf4ead8], [0xe0a030, 0xf4ead8]];
  const postMat = toon(0xffffff, wood(0x7a5a3a));
  for (const s of STALLS) {
    const table = withEdges(new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.9, s.d), postMat)); table.position.set(s.x, 0.45, s.z); add(table, 0.45, 'bit');
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), postMat); p.position.set(s.x + dx * s.w / 2.2, 1.3, s.z + dz * s.d / 2.2); add(p, 0.05, 'post');
    }
    const aw = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.6, 0.08, s.d + 0.8), lam(0xffffff, awning(...awnings[s.tint])));
    aw.position.set(s.x, 2.6, s.z); aw.rotation.z = s.face === 'e' ? 0.2 : -0.2; add(aw, 0.1, 'roof');
    for (let k = 0; k < 4; k++) {
      const goods = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), toon([0xe05030, 0xf0c040, 0x60a040, 0xd07020][(k + s.tint) % 4]));
      goods.position.set(s.x - 0.9 + k * 0.6, 1.05, s.z); add(goods, 0.18, 'bit');
    }
  }

  // ---------- the well ----------
  const well = withEdges(new THREE.Mesh(new THREE.CylinderGeometry(WELL.r, WELL.r, 0.9, 20), lam(0xa09080)));
  well.position.set(WELL.x, 0.45, WELL.z); add(well, 0.45, 'wall');
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), postMat); p.position.set(s * (WELL.r - 0.15), 1.1, 0); add(p, 0.1, 'post'); }
  const wroof = withEdges(new THREE.Mesh(new THREE.ConeGeometry(WELL.r + 0.4, 0.9, 4), lam(0xffffff, roofTiles(0xc4583a))));
  wroof.position.set(0, 2.55, 0); wroof.rotation.y = Math.PI / 4; add(wroof, 0.4, 'roof');

  // ---------- training yard ----------
  for (let x = YARD.x0; x <= YARD.x1; x += 2.5) for (const z of [YARD.z0, YARD.z1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), postMat); p.position.set(x, 0.55, z); add(p, 0.08, 'post');
  }
  for (let z = YARD.z0; z <= YARD.z1; z += 2.5) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), postMat); p.position.set(YARD.x0, 0.55, z); add(p, 0.08, 'post');
  }
  for (const z of [YARD.z0, YARD.z1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(YARD.x1 - YARD.x0, 0.1, 0.1), postMat); rail.position.set((YARD.x0 + YARD.x1) / 2, 0.9, z); add(rail, 0.05, 'post'); }
  const rack = withEdges(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.4), postMat)); rack.position.set(-35, 0.7, 18); add(rack, 0.3, 'bit');

  // ---------- trees ----------
  const trunkMat = toon(0xffffff, wood(0x6b4a2f));
  const leafMats = [0x3f8f4a, 0x4f9e52, 0x2f7a40, 0x5aa65a].map((c) => toon(c));
  TREES.forEach((t, i) => {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * t.s, 0.24 * t.s, 1.8 * t.s, 7), trunkMat);
    tr.position.set(t.x, 0.9 * t.s, t.z); add(tr, 0.2, 'trunk');
    for (let k = 0; k < 3; k++) {
      const lf = new THREE.Mesh(new THREE.IcosahedronGeometry((1.05 - k * 0.18) * t.s, 1), leafMats[(i + k) % 4]);
      lf.position.set(t.x + (k - 1) * 0.35 * t.s, (2.1 + k * 0.6) * t.s, t.z + ((k % 2) - 0.5) * 0.4 * t.s); add(lf, 0.8 * t.s, 'leaves');
    }
  });

  // ---------- palisade ----------
  const logMat = toon(0xffffff, wood(0x7a5a3a));
  const logGeo = new THREE.CylinderGeometry(0.28, 0.28, 3.2, 7);
  const tipGeo = new THREE.ConeGeometry(0.28, 0.6, 7);
  const logs = [];
  for (let s = -BOUNDS; s <= BOUNDS; s += 0.6) {
    for (const [x, z] of [[s, -BOUNDS - 0.5], [s, BOUNDS + 0.5], [-BOUNDS - 0.5, s], [BOUNDS + 0.5, s]]) {
      if (Math.abs(x) < 4 && Math.abs(z) > BOUNDS || Math.abs(z) < 4 && Math.abs(x) > BOUNDS) continue; // gates
      logs.push([x, z]);
    }
  }
  const logIM = new THREE.InstancedMesh(logGeo, logMat, logs.length), tipIM = new THREE.InstancedMesh(tipGeo, logMat, logs.length);
  const m4 = new THREE.Matrix4();
  logs.forEach(([x, z], i) => {
    const h = 0.9 + ((i * 7) % 5) * 0.05;
    m4.makeScale(1, h, 1).setPosition(x, 1.6 * h, z); logIM.setMatrixAt(i, m4);
    m4.makeTranslation(x, 3.2 * h + 0.3, z); tipIM.setMatrixAt(i, m4);
  });
  logIM.castShadow = true; scene.add(logIM, tipIM);
  for (const [x, z, ry] of [[BOUNDS + 0.5, 0, 0], [0, -BOUNDS - 0.5, Math.PI / 2], [0, BOUNDS + 0.5, Math.PI / 2], [-BOUNDS - 0.5, 0, 0]]) {
    const arch = withEdges(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 8.6), logMat)); arch.position.set(x, 4.2, z); arch.rotation.y = ry; scene.add(arch);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.6, 7), logMat); p.position.set(x + (ry ? s * 4 : 0), 2.3, z + (ry ? 0 : s * 4)); scene.add(p); }
  }

  // ---------- training dummies (animated by the renderer when hit) ----------
  const dummies = DUMMIES.map((d) => {
    const g = new THREE.Group(); g.position.set(d.x, 0, d.z);
    const sm = toon(0xffffff, straw());
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), postMat); post.position.y = 0.5; g.add(post);
    const pivot = new THREE.Group(); pivot.position.y = 0.9; g.add(pivot);
    const torso = withEdges(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.8, 10), sm)); torso.position.y = 0.4; pivot.add(torso);
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6), sm); arms.rotation.z = Math.PI / 2; arms.position.y = 0.6; pivot.add(arms);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), toon(0xe8dcc0)); head.position.y = 1.0; pivot.add(head);
    g.traverse((o) => { o.castShadow = true; });
    scene.add(g);
    pieces.push({ obj: g, kind: 'bit', r: 0.3, homeP: g.position.clone(), homeQ: g.quaternion.clone(), state: 'home', vel: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0), w: 0 });
    return { group: g, pivot, x: d.x, z: d.z };
  });

  // ---------- festival decorations (hidden until the festival) ----------
  const festival = new THREE.Group();
  const lanternMats = [];
  const lanternGeo = new THREE.SphereGeometry(0.2, 10, 8);
  const flagGeo = new THREE.ConeGeometry(0.22, 0.4, 3);
  const flagCols = [0xd84a3a, 0xf0c040, 0x3a7ab8, 0x4a9a5a, 0xe07ab0];
  const pole = withEdges(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 7, 8), postMat)); pole.position.set(0, 3.5, 0); festival.add(pole);
  for (let i = 0; i < 10; i++) {
    const a = ((i + 0.5) / 10) * Math.PI * 2, ex = Math.sin(a) * (PLAZA_R + 0.5), ez = Math.cos(a) * (PLAZA_R + 0.5); // posts stay off the roads
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), postMat); post.position.set(ex, 2, ez); festival.add(post);
    for (let k = 1; k < 12; k++) {
      const f = k / 12, x = ex * (1 - f), z = ez * (1 - f), y = 4 + (7 - 4) * f - Math.sin(f * Math.PI) * 1.2;
      if (k % 2) {
        const lm = new THREE.MeshBasicMaterial({ color: [0xffb04a, 0xff7a4a, 0xffe08a][(i + k) % 3] });
        lm.userData.base = lm.color.clone();
        lanternMats.push(lm);
        const l = new THREE.Mesh(lanternGeo, lm); l.position.set(x, y - 0.25, z); festival.add(l);
      } else {
        const fl = new THREE.Mesh(flagGeo, toon(flagCols[(i + k) % 5])); fl.position.set(x, y - 0.22, z); fl.rotation.set(Math.PI, a, 0); fl.scale.z = 0.15; festival.add(fl);
      }
    }
  }
  festival.visible = false;
  scene.add(festival);

  return { pieces, dummies, festival, lanternMats, winMat, sea };
}
