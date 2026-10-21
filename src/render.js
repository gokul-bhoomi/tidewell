// Three.js view of the sim. Reads the game state, never changes it. Everything that moves on screen
// (poses, particles, debris, camera) advances in tick(), once per sim step, so stepping the game by
// hand through the debug API gives the same picture every time. draw() only renders.
import * as THREE from 'three';
import { VILLAIN, CAM, STRIKE, FOES } from './config.js';
import { BUILDINGS, STALLS } from './world.js';
import { NPCS } from './script.js';
import { rng } from './rng.js';
import { makeCharacter, makeVillain, pose, poseVillain, setOpacity, hitReact, squash } from './characters.js';
import { buildVillage } from './village.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const C = (hex) => new THREE.Color(hex);

const SKY = {
  day: { top: C(0x4f93e0), horizon: C(0xffe2b8), bottom: C(0xc9b28a), fog: C(0xdfe8ee), sun: C(0xfff4dc), hemiSky: C(0xd6ecff), hemiGround: C(0x8a7350), sunI: 2.6 },
  dusk: { top: C(0x30306e), horizon: C(0xff9a5a), bottom: C(0x6a4a3a), fog: C(0xd89a78), sun: C(0xffb070), hemiSky: C(0xb89acf), hemiGround: C(0x5a3a2a), sunI: 1.6 },
  doom: { top: C(0x07050b), horizon: C(0x6e1712), bottom: C(0x1a0a0a), fog: C(0x2a0d0e), sun: C(0xff5a3a), hemiSky: C(0x4a2030), hemiGround: C(0x140808), sunI: 0.6 },
};

export const HERO = { body: 0x2a4aa8, pattern: 'trim', accent: 0xffd27a, legs: 0xd9c9a6, skin: 0xe7b08a, hair: 0x1d1a22, hairStyle: 'spiky', mood: 'determined', scarf: 0xd8402a, accentColor: 0x7a3a2a, eyes: 0x3a2a1a };
const GRUNT_COLS = [0x6b2a2a, 0x5a3a2a, 0x6a4a2a, 0x4a2a3a];
const SKINS = [0xe7b08a, 0xc68c64, 0x8d5a3c, 0xd9a77e];
function foeSpec(f) {
  if (f.type === 'brute') return { build: 'big', scale: 1.3, body: 0x4a3a30, pattern: 'check', accent: 0x2a2018, legs: 0x2a2420, skin: 0xa86e48, hairStyle: 'bald', hair: 0x2a1a10, mood: 'angry', weapon: 'bigclub', accentColor: 0x2a1a10 };
  if (f.type === 'captain') return { scale: 1.32, body: 0x8a1a2a, coat: 0x7a1424, legs: 0x1a1a22, skin: 0xd9a77e, hair: 0x1a1214, hairStyle: 'long', beard: true, mood: 'grin', patch: true, scar: true, captainHat: true, weapon: 'saber', accentColor: 0xd8b25a };
  return { body: GRUNT_COLS[f.id % 4], pattern: 'stripes', accent: 0x2a1a1a, legs: 0x4a3a2a, skin: SKINS[f.id % 4], hairStyle: 'short', bandana: [0xb8302a, 0x3a3a3a, 0x8a2a6a][f.id % 3], mood: 'scowl', weapon: 'club', accentColor: 0x2a1a10 };
}
function npcSpec(n, i) {
  const l = n.look;
  return {
    body: l.body, legs: l.legs, skin: l.skin, hair: l.hair, hairStyle: l.hairStyle, kid: l.kid, beard: l.beard, hat: l.hat, bandana: l.bandana, apron: l.apron, armor: l.armor,
    pattern: ['stripes', 'dots', 'check', null, 'trim'][i % 5], accent: 0xf4ead8, mood: l.kid ? 'grin' : 'smile',
    weapon: l.staff ? 'staff' : l.lute ? 'lute' : n.id === 'bram' ? 'practice' : null,
  };
}

// ---------- effects helpers ----------

function fresnelMat(color, power = 2.5) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uPower: { value: power } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uPower; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower); gl_FragColor = vec4(uColor * (f * uOpacity), 1.0);
      #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.list = [];
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('rgba', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float size; attribute vec4 rgba; varying vec4 vC;
        void main() { vC = rgba; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (420.0 / max(0.1, -mv.z)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC;
        void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a);
        #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: 0, max: o.life || 1, s0: o.size || 0.3, s1: o.size1 ?? o.size ?? 0.3, c: o.color, a: o.alpha ?? 1, grav: o.grav || 0, drag: o.drag ?? 1 });
  }
  burst(n, rand, o) {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, up = (rand() - 0.3) * (o.up ?? 1), sp = (o.speed || 5) * (0.4 + rand() * 0.6);
      this.emit({ ...o, vx: Math.cos(a) * sp + (o.vx || 0), vy: up * sp + (o.vy || 0), vz: Math.sin(a) * sp + (o.vz || 0), life: (o.life || 0.5) * (0.6 + rand() * 0.6) });
    }
  }
  tick(dt) {
    let n = 0;
    this.list = this.list.filter((p) => (p.life += dt) < p.max);
    for (const p of this.list) {
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy = p.vy * dr - p.grav * dt; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.life / p.max;
      this.pos.set([p.x, p.y, p.z], n * 3);
      this.col.set([p.c.r, p.c.g, p.c.b, p.a * (1 - k) * Math.min(1, p.life * 20)], n * 4);
      this.size[n] = p.s0 + (p.s1 - p.s0) * k;
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const a of ['position', 'rgba', 'size']) this.geo.attributes[a].needsUpdate = true;
  }
  clear() { this.list = []; this.geo.setDrawRange(0, 0); }
}

// ---------- the renderer ----------

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.1, 700);
  scene.fog = new THREE.Fog(SKY.day.fog.clone(), 70, 260);

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: SKY.day.top.clone() }, horizon: { value: SKY.day.horizon.clone() }, bottom: { value: SKY.day.bottom.clone() },
      sunDir: { value: V(0.3, 0.38, -0.87).normalize() }, sunColor: { value: SKY.day.sun.clone() }, eclipse: { value: 0 }, time: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float eclipse; uniform float time; varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
        // soft cartoon clouds
        if (h > 0.02) {
          vec2 uv = d.xz / (h + 0.2) * 1.4 + vec2(time * 0.01, 0.0);
          float n = noise(uv) * 0.6 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.1;
          float c = smoothstep(0.55, 0.72, n) * smoothstep(0.02, 0.25, h);
          col = mix(col, mix(vec3(1.0), horizon * 1.1, 0.25) * (1.0 - eclipse * 0.85), c * 0.75);
        }
        float s = dot(d, sunDir);
        float disc = smoothstep(0.9986, 0.9991, s);
        float glow = pow(max(s, 0.0), 220.0) * 0.6 + pow(max(s, 0.0), 12.0) * 0.18;
        float rim = smoothstep(0.9978, 0.9986, s) * (1.0 - smoothstep(0.9988, 0.99925, s));
        vec3 dayC = col + sunColor * (disc * 1.6 + glow);
        vec3 eclC = mix(col, vec3(0.0), disc) + sunColor * (rim * 3.0 + glow * 0.9);
        gl_FragColor = vec4(mix(dayC, eclC, eclipse), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat));

  const hemi = new THREE.HemisphereLight(SKY.day.hemiSky.clone(), SKY.day.hemiGround.clone(), 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(SKY.day.sun.clone(), 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 140 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const village = buildVillage(scene);
  const festivalLight = new THREE.PointLight(0xffa860, 0, 28, 1.6); festivalLight.position.set(0, 6, 0); scene.add(festivalLight);

  // ---------- actors ----------
  const hero = makeCharacter(HERO);
  scene.add(hero.root);
  const aura = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x6ff3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.rotation.x = -Math.PI / 2; aura.position.y = 0.05; scene.add(aura);
  const shield = new THREE.Mesh(new THREE.CircleGeometry(0.85, 6), new THREE.MeshBasicMaterial({ color: 0x6ff3ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(shield);
  const trail = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 4, 24, Math.PI * 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(trail);

  const npcs = new Map();
  NPCS.forEach((n, i) => { const c = makeCharacter(npcSpec(n, i)); scene.add(c.root); npcs.set(n.id, c); });
  const foes = new Map(); // id -> { c, ring, prev }
  const vil = makeVillain();
  vil.root.visible = false;
  scene.add(vil.root);
  const vilLight = new THREE.PointLight(0xc7b0ff, 0, 30, 1.5); scene.add(vilLight);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), fresnelMat(0xd9c2ff, 1.2)); core.scale.setScalar(0.01); scene.add(core);
  const barrier = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 2), fresnelMat(0xbfa8ff, 1.8)); scene.add(barrier);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 120, 24, 1, true), fresnelMat(0xd6c6ff, 1.2));
  pillar.position.y = 60; scene.add(pillar);
  const shock = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), fresnelMat(0xf2e8ff, 1.6)); shock.visible = false; scene.add(shock);
  const shockRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  shockRing.rotation.x = -Math.PI / 2; shockRing.position.y = 0.12; scene.add(shockRing);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
  crater.rotation.x = -Math.PI / 2; crater.position.y = 0.06; scene.add(crater);

  const glow = new Particles(scene, 900, true), dust = new Particles(scene, 1200, false);

  // camera collision boxes (houses incl. roof height)
  const boxes = [...BUILDINGS, ...STALLS].map((b) => new THREE.Box3(V(b.x - b.w / 2, 0, b.z - b.d / 2), V(b.x + b.w / 2, b.h + (b.style === 'stall' ? 0 : 2.4), b.z + b.d / 2)));

  const cam = { pos: V(0, 9, 26), look: V(0, 1, 0), shake: 0, kick: V() };
  let time = 0;
  const prand = rng(5);

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function reset() {
    for (const p of village.pieces) { p.obj.position.copy(p.homeP); p.obj.quaternion.copy(p.homeQ); p.state = 'home'; p.vel.set(0, 0, 0); }
    for (const f of foes.values()) scene.remove(f.c.root, f.ring);
    foes.clear(); glow.clear(); dust.clear();
    vil.root.visible = false; shock.visible = false; shockRing.material.opacity = 0; crater.material.opacity = 0;
    cam.shake = 0; hero.flash = 0;
  }

  // ---------- events ----------
  const WHITE = C(0xffffff), GOLD = C(0xffd27a), CYAN = C(0x6ff3ff), BLOOD = C(0xd8303a), SMOKE = C(0x4a4248), GREY = C(0x9a94a8), ASH = C(0x3a3436), EARTH = C(0x9a8462);
  const CONF = [C(0xff5a5a), C(0xffd04a), C(0x5ac8ff), C(0x7aff8a), C(0xff8ad8)];
  function onEvent(e, g) {
    const p = g.player;
    switch (e.type) {
      case 'hit': {
        glow.burst(e.finisher ? 26 : 14, prand, { x: e.x, y: 1.3, z: e.z, speed: e.finisher ? 9 : 6, life: 0.35, size: 0.25, size1: 0.05, color: e.finisher ? GOLD : WHITE, drag: 3 });
        const f = foes.get(e.id); if (f) hitReact(f.c, e.finisher ? 1.5 : 0.8);
        if (e.foe === 'dummy') dust.burst(6, prand, { x: e.x, y: 1.3, z: e.z, speed: 2, life: 0.8, size: 0.1, color: C(0xd9b860), grav: 4 });
        cam.shake = Math.max(cam.shake, e.finisher ? 0.45 : 0.22);
        break;
      }
      case 'kill':
        glow.burst(20, prand, { x: e.x, y: 1.1, z: e.z, speed: 5, life: 0.6, size: 0.3, size1: 0.05, color: GOLD, drag: 2, grav: 4 });
        dust.burst(12, prand, { x: e.x, y: 0.6, z: e.z, speed: 2, life: 1.2, size: 0.7, size1: 1.6, color: SMOKE, alpha: 0.5, drag: 2, up: 0.6 });
        cam.shake = Math.max(cam.shake, 0.4);
        break;
      case 'block':
        glow.burst(18, prand, { x: (p.x + e.x) / 2, y: 1.2, z: (p.z + e.z) / 2, speed: 6, life: 0.3, size: 0.2, size1: 0.02, color: CYAN, drag: 3 });
        hero.blockFlash = 1; cam.shake = Math.max(cam.shake, e.heavy ? 0.4 : 0.2);
        break;
      case 'hurt': case 'tap':
        glow.burst(10, prand, { x: p.x, y: 1.2, z: p.z, speed: 4, life: 0.35, size: 0.2, size1: 0.02, color: e.type === 'tap' ? WHITE : BLOOD, drag: 3 });
        hitReact(hero, e.type === 'tap' ? 0.5 : 1); if (e.type === 'tap') hero.flash = 0.4; cam.shake = Math.max(cam.shake, e.type === 'tap' ? 0.1 : 0.35);
        break;
      case 'slam':
        dust.burst(40, prand, { x: e.x, y: 0.3, z: e.z, speed: 7, life: 1.2, size: 0.8, size1: 2.4, color: EARTH, alpha: 0.6, drag: 2, up: 0.3 });
        cam.shake = Math.max(cam.shake, 0.6);
        break;
      case 'heroLand':
        dust.burst(50, prand, { x: e.x, y: 0.2, z: e.z, speed: 7, life: 1.4, size: 0.6, size1: 2, color: EARTH, alpha: 0.6, drag: 2.5, up: 0.25 });
        glow.burst(20, prand, { x: e.x, y: 0.3, z: e.z, speed: 6, life: 0.5, size: 0.2, size1: 0.02, color: GOLD, drag: 2 });
        cam.shake = 0.7; squash(hero, 0.35);
        break;
      case 'victory': case 'cheers':
        for (let i = 0; i < (e.big || e.type === 'cheers' ? 160 : 70); i++) dust.emit({ x: p.x + (prand() - 0.5) * 14, y: 5 + prand() * 4, z: p.z + (prand() - 0.5) * 14, vx: (prand() - 0.5) * 2, vy: prand() * 2, vz: (prand() - 0.5) * 2, life: 4, size: 0.13, color: CONF[i % 5], grav: 1.6, drag: 1.2 });
        break;
      case 'heal': glow.burst(30, prand, { x: p.x, y: 1, z: p.z, speed: 2, life: 1.2, size: 0.2, size1: 0.05, color: C(0x7aff8a), drag: 1, vy: 2 }); break;
      case 'zero':
        vil.flash = 1;
        dust.burst(6, prand, { x: (p.x + e.x) / 2, y: 1.3, z: (p.z + e.z) / 2, speed: 1.5, life: 0.6, size: 0.25, size1: 0.6, color: GREY, alpha: 0.6, drag: 3 });
        cam.shake = Math.max(cam.shake, 0.15);
        break;
      case 'hush': cam.shake = Math.max(cam.shake, 0.3); break;
      case 'land':
        dust.burst(70, prand, { x: e.x, y: 0.3, z: e.z, speed: 10, life: 2, size: 1, size1: 3, color: EARTH, alpha: 0.55, drag: 2, up: 0.25 });
        cam.shake = Math.max(cam.shake, 0.6);
        break;
      case 'shock':
        cam.shake = 1.2;
        glow.burst(80, prand, { x: e.x, y: 4, z: e.z, speed: 22, life: 0.8, size: 0.5, size1: 0.05, color: WHITE, drag: 1.5 });
        break;
      case 'guardBreak':
        glow.burst(30, prand, { x: p.x, y: 1.2, z: p.z, speed: 8, life: 0.6, size: 0.25, size1: 0.02, color: CYAN, drag: 2, grav: 6 });
        break;
      case 'blasted': cam.shake = 1.4; hero.flash = 1; break;
      case 'phase': if (e.phase === 'intro') reset(); break;
    }
  }

  // ---------- per-step animation ----------
  function tick(g, view, dt, title = false) {
    time += dt;
    const p = g.player, k = g.sky, dk = g.dusk;
    // sky: day -> dusk (festival) -> doom (him)
    const mix = (key, out) => out.copy(SKY.day[key]).lerp(SKY.dusk[key], dk).lerp(SKY.doom[key], k);
    mix('top', skyMat.uniforms.top.value); mix('horizon', skyMat.uniforms.horizon.value); mix('bottom', skyMat.uniforms.bottom.value); mix('sun', skyMat.uniforms.sunColor.value);
    skyMat.uniforms.eclipse.value = clamp(k * 1.4 - 0.2, 0, 1); skyMat.uniforms.time.value = time;
    mix('fog', scene.fog.color); scene.fog.near = 70 - k * 40; scene.fog.far = 260 - k * 150;
    mix('hemiSky', hemi.color); mix('hemiGround', hemi.groundColor); hemi.intensity = 1.2 - dk * 0.3 - k * 0.5;
    mix('sun', sun.color); sun.intensity = SKY.day.sunI + (SKY.dusk.sunI - SKY.day.sunI) * dk + (SKY.doom.sunI - SKY.day.sunI) * k;
    sun.position.set(p.x + 30 - dk * 15, 45 - dk * 22, p.z - 25); sun.target.position.set(p.x, 0, p.z);
    const fest = ['festival', 'arrival', 'defiance', 'judgement', 'aftermath', 'end'].includes(g.phase);
    village.festival.visible = fest;
    festivalLight.intensity = g.phase === 'festival' ? 30 * dk : g.phase === 'arrival' ? 30 * (1 - k) : 0;
    for (const m of village.lanternMats) m.color.copy(m.userData.base).multiplyScalar(g.phase === 'festival' || g.phase === 'arrival' ? 1 - k * 0.7 : 0.4);
    village.winMat.emissiveIntensity = dk * 0.9 + k * 0.6;
    village.sea.material.map.offset.x = time * 0.004; village.sea.material.map.offset.y = Math.sin(time * 0.4) * 0.01;
    renderer.toneMappingExposure = 1.1 - k * 0.2;

    animateHero(g, dt);
    animateNpcs(g, dt);
    animateFoes(g, dt);
    animateVillain(g, dt);
    animateVillage(g, dt);

    if (k > 0.35 && g.phase !== 'end') for (let i = 0; i < 3; i++) dust.emit({ x: p.x + (prand() - 0.5) * 50, y: 14 + prand() * 6, z: p.z + (prand() - 0.5) * 50, vx: 0.6, vy: -1.6, vz: 0.3, life: 9, size: 0.12, color: ASH, alpha: 0.8 * k, drag: 0 });
    if (g.phase === 'aftermath' || g.phase === 'end') glow.emit({ x: p.x + (prand() - 0.5) * 30, y: 0.2, z: p.z + (prand() - 0.5) * 30, vx: prand() - 0.5, vy: 1 + prand(), vz: prand() - 0.5, life: 3, size: 0.1, color: C(0xff6a2a), drag: 0.2 });
    if (g.phase === 'festival' && prand() < 0.25) glow.emit({ x: (prand() - 0.5) * 20, y: 0.5, z: (prand() - 0.5) * 20, vy: 1.5, life: 3, size: 0.12, color: C(0xffc070), drag: 0.3 });
    glow.tick(dt); dust.tick(dt);
    updateCamera(g, view, dt, title);
  }

  function animateHero(g, dt) {
    const p = g.player, c = hero;
    c.root.position.set(p.x, p.y, p.z);
    c.root.rotation.y = p.face;
    let act = null, k = 0, n = 0;
    if (p.y > 0.05) act = 'fall';
    else if (p.landT > 0) act = 'land';
    else if (p.act) { act = 'strike'; k = p.act.t / (STRIKE.windup + STRIKE.recovery); n = p.act.n; }
    else if (p.guard) act = 'guard';
    else if (p.flinch > 0) act = 'hurt';
    // look at whoever matters: the nearest enemy, the villager you can talk to, or him
    let look = null;
    const v = g.villain;
    if (v && v.state !== 'hidden' && v.state !== 'gone') look = v;
    else if (g.fight) look = g.foes.filter((f) => f.type !== 'dummy' && f.state !== 'dead').reduce((a, f) => (!a || Math.hypot(f.x - p.x, f.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? f : a), null);
    else if (g.near) look = g.npcs.find((n) => n.id === g.near);
    if (look && Math.hypot(look.x - p.x, look.z - p.z) > 10 && look !== v) look = null;
    pose(c, { speed: p.down ? 0 : p.speed, act, k, n, down: p.down, downT: p.downT, look }, dt);
    if (p.act && k < 0.6) {
      trail.position.set(p.x, 1.25, p.z); trail.rotation.set(Math.PI / 2, 0, -p.face + (n === 1 ? -0.3 : n === 2 ? time * 30 : Math.PI * 1.4));
      trail.material.opacity = (n === 2 ? 0.8 : 0.5) * (1 - k / 0.6); trail.scale.setScalar(n === 2 ? 1.25 : 1);
    } else trail.material.opacity = 0;
    hero.blockFlash = Math.max(0, (hero.blockFlash || 0) - dt * 4);
    shield.position.set(p.x + Math.sin(p.face) * 0.75, 1.15, p.z + Math.cos(p.face) * 0.75); shield.rotation.set(0, p.face, time * 0.6);
    shield.material.opacity += ((p.guard ? 0.25 + hero.blockFlash * 0.5 : 0) - shield.material.opacity) * damp(18, dt);
    aura.position.set(p.x, 0.05, p.z); aura.scale.setScalar(1.3);
    aura.material.opacity = g.fight ? 0.22 + Math.sin(time * 4) * 0.05 + hero.blockFlash * 0.3 : 0;
  }

  function animateNpcs(g, dt) {
    for (const n of g.npcs) {
      const c = npcs.get(n.id);
      c.root.position.set(n.x, 0, n.z);
      c.root.rotation.y = n.face;
      let act = ['walk', 'idle', 'flee'].includes(n.act) ? null : n.act, k = 0;
      if (n.spar && n.spar.state === 'windup') { act = 'sparWindup'; k = 1 - Math.max(0, n.spar.st) / FOES.sparrer.windup; }
      const v = g.villain, dp = Math.hypot(g.player.x - n.x, g.player.z - n.z);
      const look = g.npcMode === 'freeze' && v ? v : dp < 7 ? g.player : null; // villagers notice you
      pose(c, { speed: n.down ? 0 : n.moving, act, k, down: n.down, downT: n.down ? 1 : 0, look }, dt);
    }
  }

  function animateFoes(g, dt) {
    const seen = new Set();
    for (const e of g.foes) {
      if (e.type === 'dummy') {
        const d = village.dummies.find((dd) => Math.abs(dd.x - e.x) < 0.1 && Math.abs(dd.z - e.z) < 0.1);
        if (d) d.pivot.rotation.x = Math.sin(time * 18) * e.wobble * 0.25;
        continue;
      }
      seen.add(e.id);
      let f = foes.get(e.id);
      if (!f) {
        const c = makeCharacter(foeSpec(e));
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
        f = { c, ring, prev: V(e.x, 0, e.z) };
        foes.set(e.id, f); scene.add(c.root, ring);
        dust.burst(8, prand, { x: e.x, y: 0.4, z: e.z, speed: 1.6, life: 1, size: 0.6, size1: 1.4, color: SMOKE, alpha: 0.6, drag: 2, up: 0.5 });
      }
      const T = FOES[e.type];
      const speed = Math.hypot(f.prev.x - e.x, f.prev.z - e.z) / Math.max(dt, 1e-4);
      f.prev.set(e.x, 0, e.z);
      f.c.root.position.set(e.x, 0, e.z); f.c.root.rotation.y = e.face;
      let act = null, k = 0;
      if (e.state === 'idle') act = 'taunt';
      if (e.state === 'windup') { act = e.slam ? 'slamWindup' : 'windup'; k = 1 - Math.max(0, e.st) / (e.slam ? T.slam.windup : T.windup); }
      if (e.state === 'recover') { act = 'swing'; k = 1 - Math.max(0, e.st) / T.recover; }
      if (e.state === 'stagger') act = 'stagger';
      const dead = e.state === 'dead';
      pose(f.c, { speed: dead || e.state === 'windup' ? 0 : Math.min(speed, 8), act, k, down: dead, downT: dead ? -e.st : 0, flinch: e.flinch > 0, glow: e.state === 'windup' ? k * 0.55 : 0, look: dead ? null : g.player }, dt);
      if (dead) { const o = clamp(1 - (-e.st - 1.6) / 1.2, 0, 1); setOpacity(f.c, o); f.c.root.position.y = -Math.max(0, -e.st - 1.6) * 0.4; }
      // telegraph: a red ring under the attacker, or where the slam will land
      if (e.state === 'windup') {
        const s = e.slam;
        f.ring.position.set(s ? s.x : e.x, 0.08, s ? s.z : e.z);
        f.ring.scale.setScalar(s ? s.r : (1.6 - k * 0.6) * (T.radius / 0.45));
        f.ring.material.opacity = 0.35 + k * 0.6;
      } else f.ring.material.opacity = 0;
    }
    for (const [id, f] of foes) if (!seen.has(id)) { scene.remove(f.c.root, f.ring); foes.delete(id); }
  }

  function animateVillain(g, dt) {
    const v = g.villain;
    vil.root.visible = !!v && v.state !== 'hidden' && v.state !== 'gone';
    pillar.material.uniforms.uOpacity.value *= Math.exp(-1.5 * dt);
    barrier.visible = core.visible = vil.root.visible;
    if (!v) { shock.visible = false; shockRing.material.opacity = 0; crater.material.opacity = 0; vilLight.intensity = 0; return; }
    if (v.state === 'descend' || v.state === 'depart') {
      pillar.position.set(v.x, 60, v.z);
      pillar.material.uniforms.uOpacity.value = Math.min(0.3, pillar.material.uniforms.uOpacity.value + dt * 1.5);
      if (prand() < 0.6) glow.emit({ x: v.x + (prand() - 0.5) * 2, y: v.y + prand() * 3, z: v.z + (prand() - 0.5) * 2, vy: 2, life: 1.5, size: 0.15, color: C(0xd6c6ff), drag: 0.5 });
    }
    vil.root.position.set(v.x, v.y, v.z);
    vil.root.rotation.y = v.face;
    vil.flash = Math.max(0, (vil.flash || 0) - dt * 2.5);
    const raise = g.phase === 'judgement' ? clamp(g.phaseT / 1.1, 0, 1) * (g.shock ? clamp(1 - (g.shock.r - 30) / 30, 0, 1) : 1) : 0;
    poseVillain(vil, { descending: v.state === 'descend', rising: g.phase === 'judgement' || v.state === 'depart', raise }, dt);
    barrier.position.set(v.x, v.y + 1.5, v.z);
    barrier.material.uniforms.uOpacity.value = vil.flash * 1.6;
    barrier.scale.setScalar(1 + (1 - vil.flash) * 0.12); barrier.rotation.y += dt * 0.5;
    core.position.set(v.x, v.y + 1.9, v.z);
    core.scale.setScalar(0.01 + v.charge * 1.1);
    core.material.uniforms.uOpacity.value = v.charge * 2.2;
    vilLight.position.set(v.x, v.y + 2, v.z);
    vilLight.intensity = 3 + v.charge * 60 + vil.flash * 10;
    if (v.charge > 0) {
      cam.shake = Math.max(cam.shake, v.charge * 0.25);
      const a = prand() * Math.PI * 2, r = 4 + prand() * 4;
      glow.emit({ x: v.x + Math.cos(a) * r, y: v.y + 1.9 + (prand() - 0.5) * 3, z: v.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.2, vz: -Math.sin(a) * r * 2.2, life: 0.45, size: 0.18, size1: 0.02, color: C(0xe6dcff), drag: 0 });
    }
    if (g.phase === 'defiance' && prand() < 0.4) {
      const a = prand() * Math.PI * 2;
      dust.emit({ x: v.x + Math.cos(a) * 1.2, y: 0.3, z: v.z + Math.sin(a) * 1.2, vx: Math.cos(a) * 1.5, vy: 0.8, vz: Math.sin(a) * 1.5, life: 1.6, size: 0.3, size1: 0.9, color: C(0x1a1420), alpha: 0.5, drag: 1 });
    }
    const s = g.shock;
    shock.visible = !!s && s.r < VILLAIN.shockMax;
    if (s) {
      shock.position.set(s.x, 0, s.z); shock.scale.setScalar(Math.max(0.01, s.r));
      const fade = 1 - s.r / VILLAIN.shockMax;
      shock.material.uniforms.uOpacity.value = 2.2 * fade;
      shockRing.position.set(s.x, 0.12, s.z); shockRing.scale.setScalar(Math.max(0.01, s.r)); shockRing.material.opacity = fade;
      crater.position.set(s.x, 0.06, s.z); crater.scale.setScalar(Math.min(14, 2 + s.r * 0.4)); crater.material.opacity = 0.8;
      if (s.r < VILLAIN.shockMax) for (let i = 0; i < 8; i++) {
        const a = prand() * Math.PI * 2;
        dust.emit({ x: s.x + Math.cos(a) * s.r, y: 0.4, z: s.z + Math.sin(a) * s.r, vx: Math.cos(a) * 8, vy: 1.5 + prand() * 2, vz: Math.sin(a) * 8, life: 1.6, size: 1.2, size1: 3.5, color: EARTH, alpha: 0.5, drag: 1.5 });
      }
    } else { shockRing.material.opacity = 0; crater.material.opacity = 0; }
  }

  function animateVillage(g, dt) {
    const s = g.shock;
    for (const p of village.pieces) {
      if (p.state === 'home') {
        if (!s) continue;
        const dx = p.homeP.x - s.x, dz = p.homeP.z - s.z, d = Math.hypot(dx, dz) || 1;
        if (s.r < d) continue;
        const sp = 30 * Math.max(0.35, 1.25 - d / 70) * (p.kind === 'wall' ? 0.7 : 1);
        p.vel.set((dx / d) * sp * (0.8 + prand() * 0.4), (p.kind === 'wall' ? 4 : 7) + prand() * 8, (dz / d) * sp * (0.8 + prand() * 0.4));
        p.axis.set(prand() - 0.5, prand() - 0.5, prand() - 0.5).normalize();
        p.w = 2 + prand() * 6; p.state = 'fly';
        if (p.kind === 'wall' || p.kind === 'leaves') dust.burst(4, prand, { x: p.homeP.x, y: 1, z: p.homeP.z, speed: 3, life: 1.5, size: 1.4, size1: 3, color: EARTH, alpha: 0.5, drag: 1.5, up: 0.4 });
      } else if (p.state === 'fly') {
        p.vel.y -= 24 * dt;
        p.obj.position.addScaledVector(p.vel, dt);
        p.obj.rotateOnWorldAxis(p.axis, p.w * dt);
        if (p.obj.position.y <= p.r && p.vel.y < 0) {
          p.obj.position.y = p.r; p.vel.y *= -0.25; p.vel.x *= 0.55; p.vel.z *= 0.55; p.w *= 0.5;
          if (p.vel.length() < 1.2) p.state = 'rest';
        }
      }
    }
  }

  // ---------- camera ----------
  const ray = new THREE.Ray(), hit = V();
  function updateCamera(g, view, dt, title) {
    const p = g.player, v = g.villain;
    const F = V(Math.sin(view.yaw), 0, Math.cos(view.yaw)), R = V(-Math.cos(view.yaw), 0, Math.sin(view.yaw));
    const head = V(p.x, CAM.lookHeight + p.y, p.z);
    let pos, look, k = 6, collide = true;
    if (title) {
      const a = time * 0.05;
      pos = V(Math.sin(a) * 30, 11, Math.cos(a) * 30); look = V(0, 2, 0); k = 2; collide = false;
    } else {
      // orbit behind the hero; the mouse (pitch) raises or lowers the camera around them
      const pull = g.fight ? 1.25 : 1; // a wider view in fights
      const dist = CAM.dist * pull, rise = CAM.height * pull - CAM.lookHeight, r = Math.hypot(dist, rise);
      const el = clamp(Math.atan2(rise, dist) + (view.pitch || 0), 0.03, 1.25);
      pos = head.clone().addScaledVector(F, -r * Math.cos(el)).setY(CAM.lookHeight + r * Math.sin(el) + p.y * 0.3);
      look = head.clone().addScaledVector(F, CAM.lookAhead);
      look.y += Math.max(0, -(view.pitch || 0)) * 4; // looking up when the camera is low
      const vh = v && V(v.x, v.y + 2.3, v.z);
      if (g.phase === 'intro' && g.phaseT < 3) {
        // watching the hero drop in, from the plaza
        pos = V(p.x + 2.5, 2.2, p.z + 9); look = V(p.x, Math.max(1, p.y + 1), p.z); k = 4; collide = false;
      } else if (g.phase === 'arrival') {
        look.y += g.sky * 2;
        if (v && v.state === 'descend') {
          // you on the left, him coming down on the right
          look = head.clone().lerp(vh, 0.55).addScaledVector(R, 1.6); look.y = Math.min(look.y, 5.2);
          pos = head.clone().addScaledVector(F, -6.5).addScaledVector(R, 2.2).setY(1.6); k = 3;
        }
      } else if (g.phase === 'defiance' && vh) {
        look = head.clone().lerp(vh, 0.5).addScaledVector(R, 2.2);
        pos = head.clone().addScaledVector(F, -6.8).addScaledVector(R, 2.2).setY(2.4);
      } else if (g.phase === 'judgement' && vh) {
        look = head.clone().lerp(vh, p.blasted ? 0.4 : 0.65);
        pos = head.clone().addScaledVector(F, p.blasted ? -5 : -7.5).addScaledVector(R, 1.6).setY(p.blasted ? 1.6 : 1.5); k = p.blasted ? 2.5 : 4;
      } else if ((g.phase === 'aftermath' || g.phase === 'end') && v) {
        const lift = g.phase === 'end' ? 6 + g.phaseT : 0;
        pos = V(p.x, 0.7 + lift, p.z).addScaledVector(R, 2.6).addScaledVector(F, -1.2);
        look = V(v.x, Math.min(v.y + 2, 14), v.z).lerp(V(p.x, 0.3, p.z), 0.25); k = 1.5; collide = false;
      }
    }
    // don't let houses get between the camera and the hero: step in closer if that leaves some room,
    // otherwise crane up over the roofs, and only as a last resort end up close behind
    if (collide) {
      const from = V(p.x, 1.4 + p.y, p.z);
      const clear = (to) => {
        const dir = to.clone().sub(from), len = dir.length();
        ray.set(from, dir.normalize());
        let best = len;
        for (const b of boxes) if (ray.intersectBox(b, hit)) best = Math.min(best, hit.distanceTo(from));
        return { best, len };
      };
      let c = clear(pos);
      if (c.best < c.len && c.best > 3.5) pos = from.clone().addScaledVector(ray.direction, c.best - 0.3); // room enough: step in
      else if (c.best < c.len) {
        for (const up of [2, 4, 6, 9]) {
          const hi = pos.clone().setY(pos.y + up), h = clear(hi);
          if (h.best >= h.len) { pos = hi; c = h; break; }
        }
        if (c.best < c.len) pos = from.clone().addScaledVector(ray.direction, Math.max(1.2, c.best - 0.3));
      }
    }
    cam.pos.lerp(pos, damp(k, dt));
    cam.look.lerp(look, damp(k * 1.2, dt));
    cam.shake = Math.max(0, cam.shake - dt * 1.6);
    const s = cam.shake * cam.shake * 0.6;
    cam.kick.set((prand() - 0.5) * s, (prand() - 0.5) * s, (prand() - 0.5) * s);
  }

  function draw() {
    camera.position.copy(cam.pos).add(cam.kick);
    camera.lookAt(cam.look);
    renderer.render(scene, camera);
  }

  const tmp = V();
  function project(x, y, z) {
    tmp.set(x, y, z).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight, visible: tmp.z < 1 && tmp.z > -1, nx: tmp.x, ny: tmp.y };
  }
  // where to draw a speech bubble above someone
  function anchor(id) {
    const c = id === 'hero' ? hero : npcs.get(id);
    if (!c) return null;
    const h = c.spec.kid ? 1.55 : 2.2;
    return { x: c.root.position.x, y: c.root.position.y + h, z: c.root.position.z };
  }

  resize();
  return {
    tick, draw, resize, reset, onEvent, project, anchor,
    info: () => ({
      cam: { x: +cam.pos.x.toFixed(2), y: +cam.pos.y.toFixed(2), z: +cam.pos.z.toFixed(2), lookY: +cam.look.y.toFixed(2) },
      blown: village.pieces.filter((p) => p.state !== 'home').length, pieces: village.pieces.length, foes: foes.size, npcs: npcs.size,
      particles: glow.list.length + dust.list.length, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    }),
  };
}
