// Game loop, screens, camera control and the window.__game.debug API used by the tests and the
// verify skill.
import { STEP, CAM } from './config.js';
import { createGame, stepGame, skipTo, snapshot } from './sim.js';
import { retryFight } from './story.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const view = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();
const hud = createHud(view);

const S = {
  screen: 'title', paused: false, errors: [],
  g: createGame(+qs.get('seed') || 1),
  cam: { yaw: Math.PI, pitch: 0, idle: 0 }, // camera looks along (sin yaw, cos yaw); pitch > 0 = higher, looking down more
  ctl: { mx: 0, my: 0, cam: 0, padCam: 0, padPitch: 0, mouseDX: 0, mouseDY: 0, strike: false, guard: false, talk: false },
  lockLostAt: -1e9,
};
const DBG = { paused: false, override: null, actions: [] };

function start(o = {}) {
  S.g = createGame(o.seed ?? (+qs.get('seed') || 1));
  S.cam.yaw = Math.PI;
  view.reset();
  hud.onEvent({ type: 'phase', phase: 'intro' }, S.g);
  if (!o.phase || o.phase === 'intro') dispatch(S.g.events); // the new game's first events (chapter 1)
  S.screen = 'game'; S.paused = false;
  input.lockMouse(); // the mouse steers the camera from the start
  if (o.phase && o.phase !== 'intro') dispatch(skipTo(S.g, o.phase).events);
  audio.setMode(S.g.music);
}

function dispatch(events) {
  for (const e of events) { view.onEvent(e, S.g); hud.onEvent(e, S.g); audio.onEvent(e); }
}

// one fixed sim step
function update(dt) {
  const actions = DBG.actions.splice(0);
  for (const a of actions) action(a);
  const g = S.g;
  if (S.screen === 'title') { view.tick(g, S.cam, dt, true); hud.tick(g, dt); return; }
  if (S.paused) return;
  const c = S.ctl;
  steerCamera(g, c, dt);
  let inp;
  if (DBG.override) inp = DBG.override;
  else {
    // stick/keys are camera-relative: forward = where the camera looks
    const F = [Math.sin(S.cam.yaw), Math.cos(S.cam.yaw)], R = [-Math.cos(S.cam.yaw), Math.sin(S.cam.yaw)];
    inp = { mx: R[0] * c.mx + F[0] * c.my, mz: R[1] * c.mx + F[1] * c.my, strike: c.strike, guard: c.guard, talk: c.talk };
  }
  c.strike = false; c.mouseDX = 0; c.mouseDY = 0;
  stepGame(g, inp, dt);
  dispatch(g.events);
  if (g.music !== audio.mode) audio.setMode(g.music);
  view.tick(g, S.cam, dt);
  hud.tick(g, dt);
}

function steerCamera(g, c, dt) {
  const p = g.player, v = g.villain;
  const turn = c.cam * CAM.keyTurn * dt + c.padCam * CAM.padTurn * dt + c.mouseDX * CAM.mouseTurn;
  const tilt = c.mouseDY * CAM.mousePitch + c.padPitch * CAM.padPitch * dt;
  if (Math.abs(turn) > 1e-5 || Math.abs(tilt) > 1e-5) S.cam.idle = 0; else S.cam.idle += dt;
  S.cam.yaw += turn;
  S.cam.pitch = Math.max(CAM.pitchMin, Math.min(CAM.pitchMax, S.cam.pitch + tilt));
  const ease = (target, k) => { S.cam.yaw += Math.atan2(Math.sin(target - S.cam.yaw), Math.cos(target - S.cam.yaw)) * (1 - Math.exp(-k * dt)); };
  // story moments lock the camera onto him: you, then him, filling the screen
  const locked = v && v.state !== 'hidden' && ['arrival', 'defiance', 'judgement'].includes(g.phase) && !p.blasted;
  if (locked) { ease(Math.atan2(v.x - p.x, v.z - p.z), g.phase === 'defiance' ? 3 : 1.5); return; }
  // in a fight, keep the enemies in front of you unless you are steering the camera yourself
  const awake = g.fight ? g.foes.filter((f) => f.type !== 'dummy' && f.state !== 'dead' && f.state !== 'idle' && Math.hypot(f.x - p.x, f.z - p.z) < 14) : [];
  if (awake.length && S.cam.idle > 0.8 && !p.down) {
    const cx = awake.reduce((a, f) => a + f.x, 0) / awake.length, cz = awake.reduce((a, f) => a + f.z, 0) / awake.length;
    if (Math.hypot(cx - p.x, cz - p.z) > 1) ease(Math.atan2(cx - p.x, cz - p.z), 1.6);
  } else if (S.cam.idle > 0.6 && !p.down && Math.hypot(c.mx, c.my) > 0.1 && c.my > -0.2) {
    // drift back behind the character while they run forward
    ease(p.face, CAM.follow * Math.max(0, c.my));
  }
}

function action(a) {
  if (a === 'mute') return audio.toggleMute();
  if (a === 'fullscreen') return document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {});
  if (S.screen === 'title') { if (a === 'confirm') start(); return; }
  if (a === 'pause' && !['end', 'fallen'].includes(S.g.phase)) {
    if (performance.now() - S.lockLostAt < 400) return; // this Esc already released the mouse and paused
    S.paused = !S.paused;
    if (S.paused) document.exitPointerLock?.(); else input.lockMouse();
    return;
  }
  if (a === 'confirm' && S.paused) { S.paused = false; input.lockMouse(); return; }
  if (a === 'confirm' && S.g.phase === 'end') start();
  if (a === 'confirm' && S.g.phase === 'fallen') { retryFight(S.g); dispatch(S.g.events); }
}

// ---------- real input ----------
addEventListener('keydown', () => audio.unlock());
addEventListener('pointerdown', () => audio.unlock());
canvas.addEventListener('click', () => { if (S.screen === 'game' && !S.paused) input.lockMouse(); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && S.screen === 'game' && !['end', 'fallen'].includes(S.g.phase)) { S.paused = true; S.lockLostAt = performance.now(); } });
addEventListener('resize', () => view.resize());
addEventListener('error', (e) => S.errors.push(String(e.error?.stack || e.message)));

function readInput() {
  const i = input.poll();
  const c = S.ctl;
  c.mx = Math.max(-1, Math.min(1, i.mx)); c.my = Math.max(-1, Math.min(1, i.my));
  c.cam = i.cam; c.padCam = i.padCam; c.padPitch = i.padPitch; c.mouseDX += i.mouseDX; c.mouseDY += i.mouseDY;
  c.strike = c.strike || i.strike; c.guard = i.guard; c.talk = i.talk;
  for (const a of i.actions) action(a);
}

// ---------- debug API (used by the tests and the verify skill) ----------
window.__game = {
  get screen() { return S.screen; },
  errors: S.errors,
  debug: {
    pause() { DBG.paused = true; }, resume() { DBG.paused = false; },
    step(n = 1) { for (let i = 0; i < n; i++) { readInput(); update(STEP); } draw(); },
    // run n steps with input from fn(game) each step (e.g. the test bot), drawing once at the end;
    // stops early when until(game) is true. Returns the number of steps run.
    play(fn, n, until = null) { let i = 0; for (; i < n && !(until && until(S.g)); i++) { DBG.override = fn(S.g); readInput(); update(STEP); } DBG.override = null; draw(); return i; },
    setInput(inp) { DBG.override = inp; }, // world-space sim input { mx, mz, strike, guard, talk }, or null
    clearInput() { DBG.override = null; },
    press(a) { DBG.actions.push(a); }, // confirm / pause / mute
    start(o) { start(o); }, // { seed, phase: any story phase, e.g. 'tutorial', 'fight2', 'festival', 'arrival' }
    game: () => S.g, // the live sim state (read-only use: the in-page test bot reads it)
    skipTo(phase) { dispatch(skipTo(S.g, phase).events); },
    set(fields) { Object.assign(S.g.player, fields); },
    camYaw(y) { if (y != null) S.cam.yaw = y; return S.cam.yaw; },
    camPitch(p) { if (p != null) S.cam.pitch = p; return S.cam.pitch; },
    mouse(dx, dy) { S.ctl.mouseDX += dx; S.ctl.mouseDY += dy; }, // as if the captured mouse moved
    snapshot() {
      return {
        screen: S.screen, paused: S.paused, debugPaused: DBG.paused,
        audio: { running: audio.running, muted: audio.muted, music: audio.mode },
        hud: hud.info(), view: view.info(), camYaw: Math.round(S.cam.yaw * 100) / 100, camPitch: Math.round(S.cam.pitch * 100) / 100,
        game: snapshot(S.g),
      };
    },
  },
};

// ---------- loop ----------
function draw() { view.draw(); hud.draw(S.g, S.screen, S.paused, audio); }

if (qs.get('play') === '1' || qs.get('phase')) start({ phase: qs.get('phase') || undefined });
if (qs.get('pause') === '1') DBG.paused = true;
if (qs.get('mute') === '1') audio.toggleMute();

let last = performance.now(), acc = 0;
function frame(ts) {
  const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000)); last = ts;
  try {
    readInput();
    if (!DBG.paused) { acc += dt; while (acc >= STEP) { update(STEP); acc -= STEP; } }
    draw();
  } catch (e) { S.errors.push(String(e?.stack || e)); console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
