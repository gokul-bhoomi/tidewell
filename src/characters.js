// Toon characters: jointed rigs (hips, spine, chest, head, shoulders, elbows, hips, knees) built from
// simple shapes with MeshToonMaterial, painted faces that blink, cloth textures, hair styles, props,
// and black ink outlines (back faces pushed out along the normals).
// pose() drives every joint procedurally: walk/run cycles, idle breathing, attacks, reactions.
import * as THREE from 'three';
import { fabric, faceTexture, toonRamp, wood, runeCoat, glowEyes } from './textures.js';

const INK = 0x1a1216;
const outlineMat = (() => {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.024;'); };
  return m;
})();
const outlineThick = (() => {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.045;'); };
  return m;
})();

const G = {
  head: new THREE.SphereGeometry(0.2, 24, 16),
  torso: new THREE.CapsuleGeometry(0.18, 0.24, 6, 14),
  pelvis: new THREE.SphereGeometry(0.15, 14, 10),
  upper: new THREE.CapsuleGeometry(0.072, 0.19, 4, 10),
  fore: new THREE.CapsuleGeometry(0.064, 0.17, 4, 10),
  hand: new THREE.SphereGeometry(0.075, 10, 8),
  joint: new THREE.SphereGeometry(1, 10, 8),
  thigh: new THREE.CapsuleGeometry(0.095, 0.24, 4, 10),
  shin: new THREE.CapsuleGeometry(0.08, 0.25, 4, 10),
  foot: new THREE.BoxGeometry(0.13, 0.09, 0.25),
  cap: new THREE.SphereGeometry(0.214, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  spike: new THREE.ConeGeometry(0.07, 0.24, 6),
  belt: new THREE.TorusGeometry(0.19, 0.028, 6, 20),
};

export function toon(color, map = null, extra = {}) {
  return new THREE.MeshToonMaterial({ color, map, gradientMap: toonRamp(), ...extra });
}

function part(geo, mat, parent, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, outline = true, thick = false, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = shadow;
  if (outline) { const o = new THREE.Mesh(geo, thick ? outlineThick : outlineMat); o.castShadow = false; m.add(o); }
  parent.add(m);
  return m;
}
const joint = (parent, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };

// spec: { body, legs, skin, hair, hairStyle, eyes, mood, kid, build: 'big', scale, pattern, accent,
//         apron, hat, bandana, beard, armor, scarf, headband, coat, weapon: 'club'|'bigclub'|'saber'|'practice'|'staff'|'lute' }
export function makeCharacter(spec) {
  const s = { skin: 0xe7b08a, eyes: 0x2b1b14, hair: 0x2a1a10, hairStyle: 'short', mood: 'smile', ...spec };
  const big = s.build === 'big';
  const mats = {
    skin: toon(0xffffff, faceTexture({ skin: s.skin, eyes: s.eyes, mood: s.mood, kid: s.kid, patch: s.patch, scar: s.scar, blush: s.kid })),
    skinPlain: toon(s.skin),
    body: toon(0xffffff, fabric(s.body, s.pattern || null, s.accent ?? 0xffffff)),
    legs: toon(0xffffff, fabric(s.legs)),
    hair: toon(s.hair),
    shoe: toon(0x3a2a20),
    accent: toon(s.accentColor ?? 0xd84a32),
  };
  const blinkMap = faceTexture({ skin: s.skin, eyes: s.eyes, mood: s.mood, kid: s.kid, patch: s.patch, scar: s.scar, blush: s.kid, closed: true });
  const all = Object.values(mats);

  const root = new THREE.Group();
  const body = joint(root);
  const hips = joint(body, 0, 0.95);
  part(G.pelvis, mats.legs, hips, { sx: 1.2, sy: 0.8, sz: 0.9 });
  const leg = (side) => {
    const hip = joint(hips, side * 0.1, -0.03);
    part(G.thigh, mats.legs, hip, { y: -0.2, sx: big ? 1.3 : 1, sz: big ? 1.3 : 1 });
    const knee = joint(hip, 0, -0.42);
    part(G.joint, mats.legs, knee, { sx: big ? 0.11 : 0.088, sy: big ? 0.11 : 0.088, sz: big ? 0.11 : 0.088, outline: false });
    part(G.shin, mats.legs, knee, { y: -0.2, sx: big ? 1.25 : 1, sz: big ? 1.25 : 1 });
    part(G.foot, mats.shoe, knee, { y: -0.44, z: 0.05, sx: big ? 1.3 : 1 });
    return { hip, knee };
  };
  const L = leg(1), R = leg(-1);
  const spine = joint(hips, 0, 0.05);
  const torso = part(G.torso, mats.body, spine, { y: 0.24, sx: big ? 1.55 : 1.12, sy: big ? 1.05 : 1, sz: big ? 1.35 : 0.82 });
  part(G.belt, mats.accent, spine, { y: 0.04, sx: big ? 1.5 : 1.08, sz: big ? 1.3 : 0.85, outline: false }).rotation.x = Math.PI / 2;
  const chest = joint(spine, 0, 0.42);
  const neck = joint(chest, 0, 0.1);
  const head = part(G.head, mats.skin, neck, { y: 0.17 });
  head.rotation.y = 0; // face at +z
  const arm = (side) => {
    const sh = joint(chest, side * (big ? 0.33 : 0.255), 0.0);
    part(G.upper, mats.body, sh, { y: -0.15, sx: big ? 1.6 : 1, sz: big ? 1.6 : 1 });
    const elbow = joint(sh, 0, -0.3);
    part(G.joint, mats.skinPlain, elbow, { sx: big ? 0.1 : 0.068, sy: big ? 0.1 : 0.068, sz: big ? 0.1 : 0.068, outline: false });
    part(G.joint, mats.body, sh, { sx: big ? 0.13 : 0.085, sy: big ? 0.13 : 0.085, sz: big ? 0.13 : 0.085, outline: false });
    part(G.fore, mats.skinPlain, elbow, { y: -0.12, sx: big ? 1.5 : 1, sz: big ? 1.5 : 1 });
    const hand = joint(elbow, 0, -0.27);
    part(G.hand, mats.skinPlain, hand, { sx: big ? 1.5 : 1, sy: big ? 1.5 : 1, sz: big ? 1.5 : 1 });
    return { sh, elbow, hand };
  };
  const AL = arm(1), AR = arm(-1);

  // ----- hair -----
  const hairOn = (geo, o) => part(geo, mats.hair, head, o);
  if (s.hairStyle !== 'bald') hairOn(G.cap, { y: 0.015, z: -0.012, sx: 1.02, sz: 1.04 }).rotation.x = -0.35;
  if (s.hairStyle === 'spiky') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, up = i % 2 ? 0.55 : 0.85;
      const sp = hairOn(G.spike, { x: Math.sin(a) * 0.12, y: 0.155, z: Math.cos(a) * 0.12 - 0.05 });
      sp.rotation.set(Math.cos(a) * up - 0.3, 0, -Math.sin(a) * up);
    }
  }
  if (s.hairStyle === 'bun') hairOn(new THREE.SphereGeometry(0.09, 10, 8), { y: 0.18, z: -0.14 });
  if (s.hairStyle === 'ponytail') hairOn(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), { y: -0.05, z: -0.23 }).rotation.x = 0.35;
  if (s.hairStyle === 'long') hairOn(new THREE.BoxGeometry(0.36, 0.38, 0.09), { y: -0.13, z: -0.15 });
  if (s.hairStyle === 'bald') { hairOn(new THREE.TorusGeometry(0.19, 0.04, 6, 16, Math.PI), { y: 0.0, z: -0.02 }).rotation.set(Math.PI / 2, 0, Math.PI); }
  if (s.beard) hairOn(new THREE.ConeGeometry(0.13, 0.24, 10), { y: -0.2, z: 0.09 }).rotation.x = Math.PI;
  if (s.headband) part(new THREE.TorusGeometry(0.21, 0.025, 6, 24), mats.accent, head, { y: 0.07, outline: false }).rotation.x = Math.PI / 2 - 0.15;
  if (s.bandana) {
    const bm = toon(0xffffff, fabric(s.bandana, 'dots', 0xf4ead8));
    part(G.cap, bm, head, { y: 0.03, sx: 1.06, sz: 1.06 }).rotation.x = -0.25;
    part(new THREE.ConeGeometry(0.06, 0.16, 6), bm, head, { y: 0.02, z: -0.24 }).rotation.x = -1.9;
  }
  if (s.hat) {
    const hm = toon(s.hat);
    const brim = part(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 24), hm, head, { y: 0.15 });
    brim.rotation.x = -0.08;
    part(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 18), hm, brim, { y: 0.07 });
  }
  if (s.captainHat) {
    const hm = toon(0x2a1a1e);
    const hat = part(new THREE.ConeGeometry(0.34, 0.24, 3), hm, head, { y: 0.24, sx: 1.2, sz: 0.8, thick: true });
    hat.rotation.y = Math.PI;
    part(new THREE.SphereGeometry(0.035, 8, 6), toon(0xf0e0b0), hat, { y: 0.04, z: 0.15, outline: false });
  }

  // ----- clothes and props -----
  if (s.apron) part(new THREE.BoxGeometry(0.3, 0.42, 0.04), toon(0xffffff, fabric(s.apron)), spine, { y: 0.0, z: 0.14 });
  if (s.armor) {
    const am = toon(0x8a96a6, null, { emissive: 0x111111 });
    for (const sd of [-1, 1]) part(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), am, chest, { x: sd * 0.25, y: 0.02, sx: 1.2 });
    part(new THREE.BoxGeometry(0.34, 0.26, 0.05), am, spine, { y: 0.3, z: 0.14 });
  }
  if (s.coat) {
    const cm = toon(0xffffff, fabric(s.coat, 'trim', 0xd8b25a));
    part(new THREE.CylinderGeometry(0.2, 0.36, 0.7, 16, 1, true), cm, hips, { y: -0.3, sz: 0.85, thick: false }).material.side = THREE.DoubleSide;
    for (const sd of [-1, 1]) part(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cm, chest, { x: sd * 0.3, y: 0.02, sx: 1.3 });
  }
  let scarf = null;
  if (s.scarf) {
    const sm = toon(0xffffff, fabric(s.scarf, 'trim', 0xffd27a));
    part(new THREE.TorusGeometry(0.11, 0.045, 8, 18), sm, neck, { y: 0.0 }).rotation.x = Math.PI / 2;
    // the tail: a chain of segments that swings behind
    scarf = [];
    let parent = joint(neck, 0.05, 0.0, -0.1);
    for (let i = 0; i < 4; i++) {
      const seg = joint(parent, 0, 0, 0);
      part(new THREE.BoxGeometry(0.12 - i * 0.012, 0.025, 0.2), sm, seg, { z: -0.1 });
      scarf.push(seg);
      parent = joint(seg, 0, 0, -0.2);
    }
  }
  let weapon = null;
  const hand = AR.hand;
  if (s.weapon === 'club' || s.weapon === 'bigclub' || s.weapon === 'practice') {
    const wm = toon(0xffffff, wood(s.weapon === 'practice' ? 0xb08a5a : 0x6b4a2f));
    const len = s.weapon === 'bigclub' ? 0.95 : 0.7;
    weapon = part(new THREE.CylinderGeometry(s.weapon === 'bigclub' ? 0.09 : 0.055, 0.03, len, 8), wm, hand, { y: 0, z: len / 2 - 0.05, thick: s.weapon === 'bigclub' });
    weapon.rotation.x = Math.PI / 2;
    if (s.weapon === 'bigclub') for (let i = 0; i < 5; i++) part(new THREE.ConeGeometry(0.03, 0.08, 5), toon(0x9aa0a8), weapon, { y: len / 2 - 0.1 - i * 0.07, x: (i % 2 ? 1 : -1) * 0.08, outline: false }).rotation.z = (i % 2 ? -1 : 1) * Math.PI / 2;
  }
  if (s.weapon === 'saber') {
    weapon = joint(hand);
    part(new THREE.BoxGeometry(0.035, 0.02, 0.95), toon(0xdfe6ee, null, { emissive: 0x222222 }), weapon, { z: 0.55 });
    part(new THREE.BoxGeometry(0.18, 0.04, 0.04), toon(0xd8b25a), weapon, { z: 0.06 });
  }
  if (s.weapon === 'staff') {
    weapon = part(new THREE.CylinderGeometry(0.03, 0.035, 1.6, 8), toon(0xffffff, wood(0x7a5a3a)), AL.hand, { y: 0.2 });
    part(new THREE.SphereGeometry(0.06, 10, 8), toon(0x6ab4c8, null, { emissive: 0x204050 }), weapon, { y: 0.82 });
  }
  if (s.weapon === 'lute') {
    weapon = joint(chest, 0, -0.1, 0.18);
    part(new THREE.SphereGeometry(0.15, 14, 10), toon(0xffffff, wood(0xa8703a)), weapon, { sz: 0.45, sx: 0.85 });
    part(new THREE.BoxGeometry(0.05, 0.02, 0.4), toon(0x5a3a20), weapon, { x: 0.2, y: 0.05, z: 0.0 }).rotation.y = Math.PI / 2.4;
    weapon.rotation.z = 0.5;
  }

  const scale = (s.scale ?? 1) * (s.kid ? 0.62 : 1);
  root.scale.setScalar(scale);
  if (s.kid) head.scale.setScalar(1.35);

  return {
    root, body, hips, spine, chest, neck, head, L, R, AL, AR, scarf, weapon, mats: all, faceMat: mats.skin,
    faceOpen: mats.skin.map, faceBlink: blinkMap,
    phase: Math.random() * 6, t: Math.random() * 10, blinkT: 2 + Math.random() * 3, flash: 0, scale, spec: s,
    cur: null,
  };
}

// ---------- posing ----------

const ZERO = () => ({
  y: 0, lean: 0, roll: 0, spin: 0, spineY: 0, spineX: 0, headX: 0, headY: 0,
  hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, hipLz: 0, hipRz: 0,
  shLx: 0, shLz: 0.08, elL: -0.15, shRx: 0, shRz: -0.08, elR: -0.15, handR: 0,
});

// st: { speed (m/s), act, k (0..1 progress of the action), n (combo index), down, downT, t }
export function pose(c, st, dt) {
  c.t += dt;
  const P = ZERO();
  const t = c.t, spd = st.speed || 0;
  const run = Math.min(1, spd / 6), walking = spd > 0.15;

  // locomotion
  if (walking) {
    c.phase += dt * spd * (Math.PI * 2) / (1.1 + run * 0.7);
    const ph = c.phase, A = 0.45 + run * 0.4, B = 0.6 + run * 0.7;
    P.hipL = -Math.sin(ph) * A; P.hipR = Math.sin(ph) * A;
    P.kneeL = Math.max(0, -Math.cos(ph)) * B + 0.1; P.kneeR = Math.max(0, Math.cos(ph)) * B + 0.1;
    P.shLx = Math.sin(ph) * (0.35 + run * 0.5); P.shRx = -Math.sin(ph) * (0.35 + run * 0.5);
    P.elL = P.elR = -(0.25 + run * 1.0);
    P.y = -Math.abs(Math.cos(ph)) * (0.03 + run * 0.05) + 0.02;
    P.lean = 0.05 + run * 0.22;
    P.spineY = Math.sin(ph) * (0.08 + run * 0.12);
    P.headY = -P.spineY * 0.6;
  } else {
    const b = Math.sin(t * 1.8);
    P.spineX = b * 0.02; P.y = b * 0.005; P.headX = b * 0.02;
    P.shLz = 0.1 + b * 0.02; P.shRz = -0.1 - b * 0.02;
  }

  const k = st.k ?? 0, act = st.act;
  const ease = (a, b2) => Math.max(0, Math.min(1, (k - a) / (b2 - a)));
  switch (act) {
    case 'strike': {
      const pre = 1 - ease(0, 0.3), hit = ease(0.2, 0.35) * (1 - ease(0.6, 1));
      if (st.n === 0) { // right jab
        P.shRx = 0.3 * pre - 1.55 * hit; P.shRz = -0.1; P.elR = -1.6 * pre - 0.05 * hit; P.spineY = 0.25 * pre - 0.4 * hit; P.lean = 0.12;
        P.shLx = -0.9; P.elL = -1.6; P.shLz = -0.2;
      } else if (st.n === 1) { // left hook
        P.shLx = 0.2 * pre - 1.35 * hit; P.shLz = 0.3 * pre - 0.7 * hit; P.elL = -1.2 * pre - 0.5 * hit; P.spineY = -0.3 * pre + 0.5 * hit; P.lean = 0.1;
        P.shRx = -0.9; P.elR = -1.6; P.shRz = 0.2;
      } else { // spinning kick
        P.spin = ease(0, 0.6) * Math.PI * 2;
        P.hipR = -1.55 * Math.sin(Math.PI * ease(0.1, 0.8)); P.kneeR = 0.15; P.hipL = 0.2; P.kneeL = 0.5;
        P.shLz = 1.3; P.shRz = -1.3; P.elL = P.elR = -0.3; P.lean = -0.15; P.y = 0.18 * Math.sin(Math.PI * ease(0, 0.8));
      }
      break;
    }
    case 'guard':
      P.shLx = P.shRx = -1.35; P.shLz = -0.55; P.shRz = 0.55; P.elL = P.elR = -1.55; P.lean = 0.14;
      P.kneeL = P.kneeR = 0.35; P.hipL = P.hipR = -0.25; P.y = -0.06; P.headX = 0.1;
      break;
    case 'hurt': P.lean = -0.35; P.headX = -0.3; P.shLz = 0.6; P.shRz = -0.6; break;
    case 'land': P.y = -0.36; P.hipL = P.hipR = -1.2; P.kneeL = P.kneeR = 1.9; P.lean = 0.5; P.shLz = 0.9; P.shRz = -0.9; P.shLx = P.shRx = 0.4; break;
    case 'fall': P.shLz = 2.6; P.shRz = -2.6; P.hipL = -0.4; P.kneeL = 0.9; P.hipR = 0.2; P.kneeR = 0.4; P.lean = -0.2; break;
    // enemies
    case 'windup': {
      const w = k;
      P.shRx = -2.8 * w; P.elR = -0.5 * w; P.shRz = -0.2; P.lean = -0.18 * w; P.spineY = 0.3 * w;
      P.shLx = -0.6 * w; P.shLz = 0.4;
      P.hipL = -0.3 * w; P.kneeL = 0.3 * w;
      break;
    }
    case 'slamWindup': P.shRx = P.shLx = -3.0 * k; P.elR = P.elL = -0.3; P.lean = -0.25 * k; P.y = 0.1 * k; P.kneeL = P.kneeR = 0.3 * k; break;
    case 'swing': P.shRx = -0.4 + 0.5 * k; P.elR = -0.2; P.spineY = -0.35 * (1 - k); P.lean = 0.25 * (1 - k); P.shLx = 0.3; break;
    case 'stagger': P.lean = -0.4; P.headX = -0.35; P.shLz = 0.9; P.shRz = -0.9; P.shLx = P.shRx = -0.5; P.kneeL = 0.4; break;
    case 'taunt': P.shRx = -1.0 + Math.sin(t * 6) * 0.3; P.elR = -1.2; P.shLx = -0.2; P.headX = -0.1; break;
    // villagers
    case 'talk': P.shRx = -0.7 + Math.sin(t * 5) * 0.15; P.elR = -1.1 + Math.sin(t * 7) * 0.2; P.headX = Math.sin(t * 3) * 0.05; P.headY = Math.sin(t * 2) * 0.1; break;
    case 'cheer': { const j = Math.abs(Math.sin(t * 7.5)); P.y = j * 0.22; P.shLz = 2.6 + Math.sin(t * 7.5) * 0.2; P.shRz = -2.6 - Math.sin(t * 7.5) * 0.2; P.elL = P.elR = -0.3; P.kneeL = P.kneeR = (1 - j) * 0.5; P.hipL = P.hipR = -(1 - j) * 0.3; P.headX = -0.15; break; }
    case 'dance': { const d = Math.sin(t * 4 + c.phase); P.roll = d * 0.12; P.y = Math.abs(Math.cos(t * 4)) * 0.06; P.shLz = 1.2 + d * 0.9; P.shRz = -1.2 + d * 0.9; P.elL = P.elR = -0.6; P.hipL = d * 0.3; P.hipR = -d * 0.3; P.kneeL = P.kneeR = 0.25; P.spineY = d * 0.25; break; }
    case 'play': P.shLx = -1.0; P.shLz = -0.3; P.elL = -1.0; P.shRx = -0.6; P.shRz = 0.4; P.elR = -1.2 + Math.sin(t * 14) * 0.25; P.headX = 0.15; P.y = Math.sin(t * 4) * 0.015; break;
    case 'cower': P.y = -0.3; P.hipL = P.hipR = -1.1; P.kneeL = P.kneeR = 1.8; P.lean = 0.45; P.shLx = P.shRx = -2.5; P.elL = P.elR = -2.0; P.shLz = -0.3; P.shRz = 0.3; P.headX = 0.4; break;
    case 'fear': P.lean = -0.15; P.shLx = P.shRx = -1.1; P.elL = P.elR = -1.2; P.shLz = -0.2; P.shRz = 0.2; P.headX = -0.35; P.y = Math.sin(t * 30) * 0.004; break;
    case 'sparWindup': P.shRx = -2.6 * k; P.elR = -0.4; P.lean = -0.1 * k; P.shLx = -0.5; P.spineY = 0.25 * k; break;
    case 'sparSwing': P.shRx = -0.5; P.elR = -0.1; P.lean = 0.2; P.spineY = -0.3; break;
  }
  if (st.flinch) { P.lean -= 0.2; P.headX -= 0.2; }

  // smooth everything except the walk cycle so poses blend
  if (!c.cur) c.cur = { ...P };
  const a = walking && !act ? 1 : 1 - Math.exp(-dt * 22);
  for (const key in P) c.cur[key] += (P[key] - c.cur[key]) * a;
  if (act === 'strike' && st.n === 2) c.cur.spin = P.spin; // the spin must not be smoothed
  const Q = c.cur;
  c.body.position.y = Q.y; c.body.rotation.set(Q.lean, Q.spin, Q.roll);
  c.spine.rotation.set(Q.spineX, Q.spineY, 0);
  c.neck.rotation.set(Q.headX, Q.headY, 0);
  c.L.hip.rotation.set(Q.hipL, 0, Q.hipLz); c.L.knee.rotation.x = Q.kneeL;
  c.R.hip.rotation.set(Q.hipR, 0, Q.hipRz); c.R.knee.rotation.x = Q.kneeR;
  c.AL.sh.rotation.set(Q.shLx, 0, Q.shLz); c.AL.elbow.rotation.x = Q.elL;
  c.AR.sh.rotation.set(Q.shRx, 0, Q.shRz); c.AR.elbow.rotation.x = Q.elR;

  // knocked down: fall onto the back
  if (st.down) {
    const f = Math.min(1, (st.downT || 0) / 0.45);
    c.body.rotation.set(-Math.PI / 2 * f, 0, 0.15 * f);
    c.body.position.y = 0.18 * f + Math.sin(f * Math.PI) * 0.5;
    c.AL.sh.rotation.set(-0.3, 0, 1.4); c.AR.sh.rotation.set(0.2, 0, -1.2);
    c.L.hip.rotation.x = -0.3; c.L.knee.rotation.x = 0.6; c.R.hip.rotation.x = 0.1; c.R.knee.rotation.x = 0.2;
  }

  // the scarf trails behind and flutters
  // (segments point backward; a negative x rotation tips them down)
  if (c.scarf) c.scarf.forEach((seg, i) => { seg.rotation.x = (i === 0 ? -1.25 * (1 - run) - 0.15 : -0.12) + Math.sin(t * 9 + i * 1.3) * (0.08 + run * 0.14); });

  // blink
  c.blinkT -= dt;
  const closed = c.blinkT < 0 || st.down;
  c.faceMat.map = closed ? c.faceBlink : c.faceOpen;
  if (c.blinkT < -0.12) c.blinkT = 2 + Math.random() * 3.5;

  // hit flash
  c.flash = Math.max(0, c.flash - dt * 5);
  const f = c.flash + (st.glow || 0);
  for (const m of c.mats) m.emissive.setRGB(f * (st.glow ? 0.8 : 1), f * (st.glow ? 0.1 : 0.9), f * (st.glow ? 0.08 : 0.9));
}

export function setOpacity(c, o) {
  for (const m of c.mats) { m.transparent = o < 1; m.opacity = o; }
}

// ---------- the villain ----------

export function makeVillain() {
  const root = new THREE.Group();
  const body = joint(root);
  const coatMat = toon(0xffffff, runeCoat());
  coatMat.side = THREE.DoubleSide;
  // long coat: a lathe from the collar down to a wide hem
  const prof = [[0.05, 0], [0.62, 0.02], [0.58, 0.4], [0.48, 0.9], [0.38, 1.4], [0.33, 1.75], [0.36, 1.95], [0.3, 2.05], [0.0, 2.08]].map(([r, y]) => new THREE.Vector2(r, y));
  const coat = part(new THREE.LatheGeometry(prof, 28), coatMat, body, { thick: true });
  // the hem breaks into hanging strips that drift
  const strips = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, g = joint(body, Math.sin(a) * 0.58, 0.05, Math.cos(a) * 0.58);
    g.rotation.y = a;
    part(new THREE.BoxGeometry(0.16, 0.5, 0.02), coatMat, g, { y: -0.22, thick: false });
    strips.push(g);
  }
  // high collar and mantle
  const collar = part(new THREE.CylinderGeometry(0.26, 0.3, 0.32, 20, 1, true), coatMat, body, { y: 2.18 });
  collar.material = coatMat;
  part(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), coatMat, body, { y: 1.92, sy: 0.55, thick: true });
  // head: pale, with eyes that glow
  const faceMat = toon(0xffffff, faceTexture({ skin: 0xd9d4e0, mood: 'void', glow: true }), { emissiveMap: glowEyes(), emissive: 0xffffff, emissiveIntensity: 1.2 });
  const head = part(new THREE.SphereGeometry(0.2, 24, 16), faceMat, body, { y: 2.42 });
  // long white hair falling down the back
  const hairMat = toon(0xe8e6f0);
  part(new THREE.SphereGeometry(0.215, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat, head, { y: 0.02, z: -0.015 }).rotation.x = -0.4;
  const locks = [];
  for (let i = 0; i < 7; i++) {
    const g = joint(head, (i - 3) * 0.06, 0.02, -0.12);
    part(new THREE.ConeGeometry(0.06, 0.9, 6), hairMat, g, { y: -0.42 }).rotation.x = Math.PI;
    g.rotation.x = 0.25; locks.push(g);
  }
  // sleeves: the arms hide in wide sleeves
  const sleeve = (side) => {
    const sh = joint(body, side * 0.42, 1.95, 0);
    const m = part(new THREE.CylinderGeometry(0.1, 0.22, 0.8, 12, 1, true), coatMat, sh, { y: -0.38 });
    m.material = coatMat;
    const hand = part(new THREE.SphereGeometry(0.07, 10, 8), toon(0xd9d4e0), sh, { y: -0.8 });
    sh.rotation.z = side * 0.18;
    return { sh, hand };
  };
  const SL = sleeve(1), SR = sleeve(-1);
  // halo rings
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xf3d48a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 64), haloMat); halo.position.set(0, 2.55, -0.38); body.add(halo);
  const halo2 = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.01, 6, 64), haloMat); halo2.position.copy(halo.position); body.add(halo2);
  const mats = [coatMat, faceMat, hairMat];
  return { root, body, coat, head, strips, locks, SL, SR, halo, halo2, mats, t: 0 };
}

export function poseVillain(v, st, dt) {
  v.t += dt;
  const t = v.t;
  v.strips.forEach((g, i) => { g.rotation.x = 0.15 + Math.sin(t * 1.6 + i) * 0.12 + (st.rising ? 0.4 : 0); });
  v.locks.forEach((g, i) => { g.rotation.x = 0.25 + Math.sin(t * 1.2 + i * 0.7) * 0.08 + (st.descending ? 0.9 : 0) + (st.rising ? -0.3 : 0); });
  v.halo.rotation.z += dt * 0.4; v.halo2.rotation.z -= dt * 0.25;
  // the right hand rises for "Kneel."
  const raise = st.raise || 0;
  v.SR.sh.rotation.set(-2.2 * raise, 0, -0.18 - 0.3 * raise);
  v.SL.sh.rotation.set(0, 0, 0.18);
  v.body.position.y = Math.sin(t * 1.3) * 0.06;
}
