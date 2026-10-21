// Hand-painted look without image files: every texture is drawn on a canvas at startup.
import * as THREE from 'three';
import { rng } from './rng.js';

const cache = new Map();
const hex = (c) => `#${new THREE.Color(c).getHexString()}`;
const shade = (c, k) => { const col = new THREE.Color(c); col.multiplyScalar(k); return `#${col.getHexString()}`; };

function canvas(w, h, draw, { repeat = null, key = null } = {}) {
  if (key && cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  if (key) cache.set(key, t);
  return t;
}

function speckle(x, w, h, n, col, alpha, size, seed = 1) {
  const r = rng(seed);
  x.fillStyle = col;
  for (let i = 0; i < n; i++) { x.globalAlpha = alpha * (0.4 + r() * 0.6); x.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r())); }
  x.globalAlpha = 1;
}

// 3-band toon ramp
export function toonRamp() {
  if (cache.has('ramp')) return cache.get('ramp');
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  cache.set('ramp', t);
  return t;
}

// Cloth: weave noise, seams, and an optional pattern ('stripes', 'check', 'dots', 'trim').
export function fabric(color, pattern = null, accent = 0xffffff) {
  return canvas(128, 128, (x, w, h) => {
    x.fillStyle = hex(color); x.fillRect(0, 0, w, h);
    x.strokeStyle = shade(color, 0.85); x.globalAlpha = 0.35;
    for (let i = 0; i < w; i += 3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
    x.globalAlpha = 0.18;
    for (let j = 0; j < h; j += 3) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); }
    x.globalAlpha = 1;
    speckle(x, w, h, 260, shade(color, 1.18), 0.25, 2, color & 0xff);
    x.fillStyle = hex(accent);
    if (pattern === 'stripes') for (let j = 8; j < h; j += 24) x.fillRect(0, j, w, 7);
    if (pattern === 'check') { x.globalAlpha = 0.35; for (let i = 0; i < w; i += 32) for (let j = 0; j < h; j += 32) if (((i + j) / 32) % 2 === 0) x.fillRect(i, j, 32, 32); x.globalAlpha = 1; }
    if (pattern === 'dots') for (let i = 8; i < w; i += 22) for (let j = 8 + ((i / 22) % 2) * 11; j < h; j += 22) { x.beginPath(); x.arc(i, j, 3.5, 0, Math.PI * 2); x.fill(); }
    if (pattern === 'trim') { x.fillRect(0, h - 14, w, 8); x.fillRect(0, 4, w, 5); }
    x.strokeStyle = shade(color, 0.6); x.setLineDash([4, 3]); x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(w * 0.5, 0); x.lineTo(w * 0.5, h); x.stroke();
  }, { key: `fabric-${color}-${pattern}-${accent}` });
}

// Faces are painted onto the head sphere. The front of a three.js sphere is u = 0.25.
// mood: 'smile' | 'grin' | 'determined' | 'scowl' | 'angry' | 'calm' | 'void'
export function faceTexture({ skin = 0xe7b08a, eyes = 0x2b1b14, mood = 'smile', closed = false, patch = false, scar = false, kid = false, blush = false, glow = false }) {
  return canvas(256, 128, (x, w, h) => {
    x.fillStyle = hex(skin); x.fillRect(0, 0, w, h);
    speckle(x, w, h, 120, shade(skin, 0.92), 0.25, 3, skin & 0xfff);
    const cx = 64, ey = kid ? 66 : 60, sep = kid ? 15 : 13;
    // cheeks
    if (blush) { x.fillStyle = 'rgba(230,90,90,0.35)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * 20, ey + 14, 7, 4, 0, 0, Math.PI * 2); x.fill(); } }
    // eyes
    for (const s of [-1, 1]) {
      const ex = cx + s * sep;
      if (patch && s === -1) {
        x.fillStyle = '#151214'; x.beginPath(); x.ellipse(ex, ey, 9, 8, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#151214'; x.lineWidth = 2; x.beginPath(); x.moveTo(ex - 9, ey - 2); x.lineTo(ex - 50, ey - 14); x.moveTo(ex + 8, ey - 4); x.lineTo(ex + 60, ey - 18); x.stroke();
        continue;
      }
      if (closed) { x.strokeStyle = '#1a1214'; x.lineWidth = 2.5; x.beginPath(); x.arc(ex, ey - 1, 6, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke(); continue; }
      const eh = kid ? 10 : mood === 'scowl' || mood === 'angry' ? 6 : 8.5, ew = kid ? 7.5 : 6;
      if (glow) {
        x.fillStyle = '#f6efff'; x.beginPath(); x.ellipse(ex, ey, ew + 1, 3, s * 0.15, 0, Math.PI * 2); x.fill();
        continue;
      }
      x.fillStyle = '#fbf7f2'; x.beginPath(); x.ellipse(ex, ey, ew, eh, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = hex(eyes); x.beginPath(); x.ellipse(ex + s * 0.5, ey + 1, ew * 0.7, eh * 0.75, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#0d0a0b'; x.beginPath(); x.ellipse(ex + s * 0.5, ey + 1.5, ew * 0.35, eh * 0.42, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#ffffff'; x.beginPath(); x.arc(ex - 2, ey - 2.5, 1.8, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#1a1214'; x.lineWidth = 2; x.beginPath(); x.ellipse(ex, ey, ew, eh, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
    }
    // brows
    x.strokeStyle = glow ? '#c9c2d8' : '#1a1214'; x.lineWidth = kid ? 2.5 : 3; x.lineCap = 'round';
    const tilt = { smile: -1, grin: -2, determined: 4, scowl: 6, angry: 8, calm: 0, void: 1 }[mood] ?? 0;
    for (const s of [-1, 1]) {
      if (patch && s === -1) continue;
      x.beginPath(); x.moveTo(cx + s * (sep - 7), ey - 13 + tilt * 0.5); x.lineTo(cx + s * (sep + 7), ey - 13 - tilt * 0.5); x.stroke();
    }
    // nose
    x.strokeStyle = shade(skin, 0.7); x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx + 1, ey + 6); x.lineTo(cx - 1, ey + 12); x.lineTo(cx + 2, ey + 12); x.stroke();
    // mouth
    x.strokeStyle = '#3a1a1a'; x.lineWidth = 2.2; x.fillStyle = '#7a2a2a';
    const my = ey + 20;
    if (mood === 'smile' || mood === 'calm') { x.beginPath(); x.arc(cx, my - 5, 6, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke(); }
    else if (mood === 'grin') { x.beginPath(); x.moveTo(cx - 8, my - 2); x.quadraticCurveTo(cx, my + 8, cx + 8, my - 2); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.fillRect(cx - 6, my - 2, 12, 2.5); }
    else if (mood === 'determined') { x.beginPath(); x.moveTo(cx - 6, my); x.lineTo(cx + 6, my - 1); x.stroke(); }
    else if (mood === 'scowl' || mood === 'angry') { x.beginPath(); x.arc(cx, my + 5, 6, 1.2 * Math.PI, 1.8 * Math.PI); x.stroke(); if (mood === 'angry') { x.fillStyle = '#fff'; x.fillRect(cx - 5, my - 1, 10, 2); } }
    else if (mood === 'void') { x.strokeStyle = '#8a8296'; x.beginPath(); x.moveTo(cx - 4, my); x.lineTo(cx + 4, my); x.stroke(); }
    if (scar) { x.strokeStyle = '#8a4a40'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + 10, ey - 18); x.lineTo(cx + 20, ey + 10); x.stroke(); }
  }, { key: `face-${skin}-${eyes}-${mood}-${closed}-${patch}-${scar}-${kid}-${blush}-${glow}` });
}

export function glowEyes() {
  return canvas(256, 128, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#f0e6ff';
    for (const s of [-1, 1]) { x.beginPath(); x.ellipse(64 + s * 13, 60, 7, 3, s * 0.15, 0, Math.PI * 2); x.fill(); }
  }, { key: 'glow-eyes' });
}

// The villain's coat: deep indigo with gold rune bands.
export function runeCoat() {
  return canvas(256, 256, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#191428'); gr.addColorStop(1, '#0b0912');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 500, '#2a2240', 0.4, 2, 9);
    const r = rng(42);
    x.strokeStyle = '#d8b25a'; x.fillStyle = '#d8b25a';
    for (const band of [26, 200, 236]) {
      x.lineWidth = 2; x.beginPath(); x.moveTo(0, band - 8); x.lineTo(w, band - 8); x.moveTo(0, band + 8); x.lineTo(w, band + 8); x.stroke();
      for (let i = 6; i < w; i += 16) {
        x.lineWidth = 1.5; x.beginPath();
        const k = Math.floor(r() * 4);
        if (k === 0) { x.moveTo(i, band - 5); x.lineTo(i + 6, band + 5); x.lineTo(i + 10, band - 5); }
        if (k === 1) { x.arc(i + 5, band, 4, 0, Math.PI * 2); }
        if (k === 2) { x.moveTo(i, band); x.lineTo(i + 10, band); x.moveTo(i + 5, band - 5); x.lineTo(i + 5, band + 5); }
        if (k === 3) { x.moveTo(i, band + 5); x.lineTo(i + 5, band - 5); x.lineTo(i + 10, band + 5); x.closePath(); }
        x.stroke();
      }
    }
    x.globalAlpha = 0.25; x.lineWidth = 1;
    for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, 40); x.lineTo(i, 190); x.stroke(); }
    x.globalAlpha = 1;
  }, { key: 'rune-coat' });
}

// ---------- village ----------

export function plaster(color) {
  return canvas(256, 256, (x, w, h) => {
    x.fillStyle = hex(color); x.fillRect(0, 0, w, h);
    speckle(x, w, h, 900, shade(color, 0.9), 0.35, 3, 5);
    speckle(x, w, h, 300, shade(color, 1.08), 0.3, 4, 6);
    // timber frame
    x.fillStyle = '#5a3e2a';
    x.fillRect(0, 0, w, 14); x.fillRect(0, h - 18, w, 18); x.fillRect(0, 0, 14, h); x.fillRect(w - 14, 0, 14, h);
    x.fillRect(w / 2 - 6, 0, 12, h);
    x.save(); x.translate(0, 0); x.lineWidth = 9; x.strokeStyle = '#5a3e2a';
    x.beginPath(); x.moveTo(14, h - 18); x.lineTo(w / 2 - 6, h * 0.45); x.moveTo(w - 14, h - 18); x.lineTo(w / 2 + 6, h * 0.45); x.stroke(); x.restore();
    speckle(x, w, h, 200, '#3a2818', 0.3, 2, 7);
  }, { key: `plaster-${color}` });
}

export function roofTiles(color) {
  return canvas(128, 128, (x, w, h) => {
    x.fillStyle = hex(color); x.fillRect(0, 0, w, h);
    for (let j = 0; j < h; j += 12) {
      x.fillStyle = shade(color, 0.72); x.fillRect(0, j + 9, w, 3);
      for (let i = (j / 12) % 2 ? 0 : 8; i < w; i += 16) { x.fillStyle = shade(color, 0.82); x.fillRect(i, j, 2, 10); }
    }
    speckle(x, w, h, 150, shade(color, 1.2), 0.3, 2, 8);
  }, { key: `roof-${color}`, repeat: [2, 2] });
}

export function grass() {
  return canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#6fa257'; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 2500, '#5d9049', 0.6, 3, 11);
    speckle(x, w, h, 1500, '#86b866', 0.5, 2, 12);
    speckle(x, w, h, 60, '#e8d86a', 0.7, 2, 13);
  }, { key: 'grass', repeat: [60, 60] });
}

export function dirt() {
  return canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#b89c74'; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 1800, '#a3865e', 0.6, 3, 21);
    speckle(x, w, h, 500, '#cdb38a', 0.5, 2, 22);
    speckle(x, w, h, 120, '#7a6448', 0.6, 3, 23);
  }, { key: 'dirt', repeat: [1, 12] });
}

export function cobbles() {
  return canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#8f8476'; x.fillRect(0, 0, w, h);
    const r = rng(31);
    for (let j = 0; j < h; j += 20) for (let i = (j / 20) % 2 ? -12 : 0; i < w; i += 24) {
      const c = 175 + Math.floor(r() * 40);
      x.fillStyle = `rgb(${c},${c - 8},${c - 22})`;
      x.beginPath(); x.roundRect(i + 2, j + 2, 20 + r() * 2, 16, 5); x.fill();
    }
    speckle(x, w, h, 400, '#6a6054', 0.4, 2, 32);
  }, { key: 'cobbles', repeat: [8, 8] });
}

export function wood(color = 0x8a5a3a) {
  return canvas(64, 256, (x, w, h) => {
    x.fillStyle = hex(color); x.fillRect(0, 0, w, h);
    x.strokeStyle = shade(color, 0.75); x.lineWidth = 1.5;
    const r = rng(41);
    for (let i = 4; i < w; i += 7) { x.beginPath(); x.moveTo(i, 0); for (let j = 0; j < h; j += 16) x.lineTo(i + (r() - 0.5) * 3, j); x.stroke(); }
  }, { key: `wood-${color}` });
}

export function straw() {
  return canvas(64, 128, (x, w, h) => {
    x.fillStyle = '#d9b860'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#b8963e'; const r = rng(51);
    for (let i = 0; i < 120; i++) { x.lineWidth = 1; x.beginPath(); const sx = r() * w; x.moveTo(sx, r() * h); x.lineTo(sx + (r() - 0.5) * 6, r() * h); x.stroke(); }
    x.fillStyle = '#8a5a3a'; x.fillRect(0, 30, w, 5); x.fillRect(0, 90, w, 5);
  }, { key: 'straw' });
}

export function awning(a, b) {
  return canvas(128, 64, (x, w, h) => {
    for (let i = 0; i < w; i += 16) { x.fillStyle = hex((i / 16) % 2 ? a : b); x.fillRect(i, 0, 16, h); }
    speckle(x, w, h, 120, '#000', 0.08, 2, 61);
  }, { key: `awning-${a}-${b}` });
}

export function water() {
  return canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#3f8fb8'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#9fd6ef'; x.lineWidth = 2; const r = rng(71);
    for (let i = 0; i < 60; i++) { const sx = r() * w, sy = r() * h; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + 6, sy - 3, sx + 12, sy); x.stroke(); }
    x.globalAlpha = 1;
  }, { key: 'water', repeat: [30, 10] });
}
