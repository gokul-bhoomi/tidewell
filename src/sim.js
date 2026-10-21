// Game rules. Pure and deterministic: no browser APIs, a fixed STEP, and a seeded RNG, so the whole
// story can be played through in Node tests. The renderer only reads this state and the events it
// emits each step. The story itself (phases, objectives, who says what when) is in story.js.
import { STEP, PLAYER, STRIKE, GUARD, FOES, MAX_ATTACKERS, VILLAIN } from './config.js';
import { collide, DUMMIES } from './world.js';
import { NPCS } from './script.js';
import { rng } from './rng.js';
import { stepStory, enterPhase, onTalk, onDummyHit, onSpar, skipStory, PHASES } from './story.js';

export { rng, PHASES };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const COMBAT = (f) => f.type !== 'dummy';

export function createGame(seed = 1) {
  const g = {
    seed, rand: rng(seed), t: 0, phase: null, phaseT: 0, fired: new Set(), next: null,
    stage: 'stranger', npcMode: 'wander', talked: new Set(), objective: null, prompt: null, near: null,
    tut: { step: 'go', hits: 0, blocks: 0, lastTap: -9 },
    fight: null, checkpoint: null, hitstop: 0, sky: 0, dusk: 0, music: 'village', judgeAt: null,
    player: {
      x: 0, z: 6, y: 0, vx: 0, vz: 0, face: Math.PI, hp: PLAYER.hp,
      act: null, combo: 0, comboT: 0, guard: false, invuln: 0, flinch: 0, down: false, downT: 0, blasted: false,
      speed: 0, prevTalk: false, landT: 0,
      stats: { kills: 0, hits: 0, zeroHits: 0, blocks: 0, damageTaken: 0, talks: 0 },
    },
    foes: [], npcs: NPCS.map((n, i) => ({
      id: n.id, name: n.name, i, x: n.home.x, z: n.home.z, face: 0, route: n.route, ri: 0, wait: 0, speed: n.speed, fixed: !!n.fixed,
      talkT: 0, lineI: 0, act: 'idle', moving: 0, down: false, vx: 0, vz: 0, spar: n.id === 'bram' ? { state: 'idle', st: 0, cd: 1 } : null,
    })),
    villain: null, shock: null, events: [], nextId: 1,
  };
  for (const d of DUMMIES) addFoe(g, 'dummy', d.x, d.z, { face: 0, state: 'stand' });
  enterPhase(g, 'intro');
  return g;
}

// ---------- step ----------

// input (world space): { mx, mz } move (length <= 1), strike (pressed/held), guard (held), talk (held)
export function stepGame(g, input = {}, dt = STEP) {
  g.events = [];
  if (g.phase === 'end' || g.phase === 'fallen') { g.player.prevTalk = !!input.talk; return g; }
  if (g.hitstop > 0) { g.hitstop--; return g; } // freeze frames on a heavy hit
  g.t += dt; g.phaseT += dt;
  stepPlayer(g, input, dt);
  stepFoes(g, dt);
  stepNpcs(g, dt);
  stepStory(g, dt);
  return g;
}

export function emit(g, e) { g.events.push(e); }
export function say(g, line) { if (line) emit(g, { type: 'line', ...line }); }

export function addFoe(g, type, x, z, extra = {}) {
  const T = FOES[type];
  const f = { id: g.nextId++, type, x, z, vx: 0, vz: 0, face: 0, hp: T.hp, maxHp: T.hp, state: 'idle', st: 0, cd: 0.8 + g.rand(), attacks: 0, slam: null, wobble: 0, ...extra };
  g.foes.push(f);
  return f;
}

// ---------- player ----------

function stepPlayer(g, input, dt) {
  const p = g.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.flinch = Math.max(0, p.flinch - dt);
  p.comboT = Math.max(0, p.comboT - dt);
  p.landT = Math.max(0, p.landT - dt);
  if (p.comboT === 0 && !p.act) p.combo = 0;
  const fr = Math.exp(-(p.down ? 3 : 10) * dt);
  p.vx *= fr; p.vz *= fr;
  const talkPressed = !!input.talk && !p.prevTalk;
  p.prevTalk = !!input.talk;

  if (p.down) {
    p.downT += dt; p.guard = false; p.act = null; p.speed = 0;
    moveBy(p, p.vx * dt, p.vz * dt, PLAYER.radius);
    return;
  }
  const locked = g.phase === 'intro' && g.phaseT < PLAYER.fallTime + 0.9;
  if (g.phase === 'intro' && p.y > 0) {
    const k = clamp(g.phaseT / PLAYER.fallTime, 0, 1);
    p.y = PLAYER.fallFrom * (1 - k * k);
    if (k >= 1) { p.y = 0; p.landT = 0.6; emit(g, { type: 'heroLand', x: p.x, z: p.z }); }
  }

  let mx = locked ? 0 : input.mx || 0, mz = locked ? 0 : input.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const m = Math.min(1, ml);
  p.guard = !locked && !!input.guard && !p.act;
  if (!locked && input.strike && !p.act && !p.flinch) startStrike(g);
  if (talkPressed && !locked && !p.act) talk(g);

  let speed = Math.max(PLAYER.walk * Math.min(1, m * 3), PLAYER.run * m);
  if (m < 0.05) speed = 0;
  if (p.guard) speed *= GUARD.moveFactor;
  if (p.act) speed *= STRIKE.moveFactor;
  if (p.flinch) speed *= 0.3;
  if (p.landT > 0) speed *= 0.2;
  p.speed = speed;

  if (p.act) {
    p.act.t += dt;
    if (p.act.t < STRIKE.windup && p.act.lunge > 0) {
      const s = Math.min(p.act.lunge, STRIKE.lunge * 4 * dt);
      p.act.lunge -= s;
      moveBy(p, Math.sin(p.face) * s, Math.cos(p.face) * s, PLAYER.radius);
    }
    if (!p.act.hit && p.act.t >= STRIKE.windup) { p.act.hit = true; resolveStrike(g); }
    if (p.act.t >= STRIKE.windup + STRIKE.recovery) { p.act = null; p.comboT = STRIKE.comboWindow; }
  } else if (p.guard) {
    const threat = nearestFoe(g, (f) => f.state === 'windup', 6) || (g.npcs.find((n) => n.spar && n.spar.state === 'windup' && dist(n, p) < 6));
    if (threat) turnTo(p, Math.atan2(threat.x - p.x, threat.z - p.z), dt);
  } else if (m > 0.05) {
    turnTo(p, Math.atan2(mx, mz), dt);
  }

  const n = m > 0.05 ? speed / m : 0;
  moveBy(p, (mx * n + p.vx) * dt, (mz * n + p.vz) * dt, PLAYER.radius);
  for (const npc of g.npcs) if (!npc.down) push(p, npc, PLAYER.radius + 0.35);
  const v = g.villain;
  if (v && v.state !== 'hidden' && v.y < 3) push(p, v, VILLAIN.radius + PLAYER.radius + 0.3);
}

function talk(g) {
  const npc = g.npcs.find((n) => n.id === g.near);
  if (!npc) return;
  const p = g.player;
  npc.talkT = 3; npc.face = Math.atan2(p.x - npc.x, p.z - npc.z);
  p.face = Math.atan2(npc.x - p.x, npc.z - p.z);
  g.talked.add(npc.id); p.stats.talks++;
  emit(g, { type: 'talk', npc: npc.id });
  if (onTalk(g, npc)) return;
  const lines = NPCS[npc.i].lines[g.stage] || [];
  if (lines.length) say(g, { who: npc.name, text: lines[npc.lineI++ % lines.length], dur: 3.2, npc: npc.id });
}

function startStrike(g) {
  const p = g.player;
  const n = p.comboT > 0 ? (p.combo + 1) % 3 : 0;
  p.combo = n; p.comboT = 0;
  p.act = { t: 0, n, hit: false, lunge: 0 };
  const target = nearestTarget(g, STRIKE.assist);
  if (target) {
    p.face = Math.atan2(target.x - p.x, target.z - p.z);
    const reach = STRIKE.range * 0.7 + (target.isVillain ? VILLAIN.radius : 0);
    p.act.lunge = clamp(dist(p, target) - reach, 0, STRIKE.lunge * 0.4);
  }
  emit(g, { type: 'swing', n });
}

function resolveStrike(g) {
  const p = g.player, n = p.act.n;
  const fx = Math.sin(p.face), fz = Math.cos(p.face);
  const inArc = (e, extra) => {
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
    if (d > STRIKE.range + extra) return false;
    return d < 0.3 || (dx * fx + dz * fz) / d >= STRIKE.arcCos;
  };
  let landed = 0, killed = 0;
  for (const e of g.foes) {
    if (e.state === 'dead' || e.state === 'spawn' || !inArc(e, FOES[e.type].radius)) continue;
    const dmg = STRIKE.damage[n];
    landed++;
    emit(g, { type: 'hit', id: e.id, x: e.x, z: e.z, dmg, finisher: n === 2, foe: e.type });
    if (e.type === 'dummy') { e.wobble = n === 2 ? 1.4 : 1; onDummyHit(g, n); continue; }
    e.hp -= dmg;
    const d = Math.max(0.01, dist(p, e)), T = FOES[e.type];
    const k = STRIKE.knock[n] / (T.poise ? 2.5 : 1);
    e.vx = ((e.x - p.x) / d) * k; e.vz = ((e.z - p.z) / d) * k;
    if (e.state === 'idle') e.state = 'approach';
    if (e.hp <= 0) {
      e.state = 'dead'; e.st = 0; killed++; p.stats.kills++;
      emit(g, { type: 'kill', id: e.id, x: e.x, z: e.z, foe: e.type });
    } else if (n >= T.poise && !(T.armor && e.state === 'windup')) {
      e.state = 'stagger'; e.st = STRIKE.stagger * (T.poise ? 1.6 : 1); e.slam = null;
    } else {
      e.flinch = 0.15;
    }
  }
  p.stats.hits += landed;
  const v = g.villain;
  if (v && v.state !== 'hidden' && v.y < 3 && inArc(v, VILLAIN.radius)) {
    v.hits++; p.stats.zeroHits++;
    const d = Math.max(0.01, dist(p, v));
    p.vx = ((p.x - v.x) / d) * VILLAIN.recoil; p.vz = ((p.z - v.z) / d) * VILLAIN.recoil;
    g.hitstop = Math.max(g.hitstop, 5);
    emit(g, { type: 'zero', x: v.x, z: v.z, y: v.y + 1.6, hits: v.hits });
  }
  if (landed) g.hitstop = Math.max(g.hitstop, killed || n === 2 ? STRIKE.killHitstop : STRIKE.hitstop);
}

export function hurtPlayer(g, dmg, from, knock) {
  const p = g.player;
  if (p.invuln > 0 || p.down) return;
  p.hp = Math.max(0, p.hp - dmg); p.stats.damageTaken += dmg;
  p.invuln = PLAYER.hurtInvuln; p.flinch = PLAYER.flinch; p.act = null;
  const d = Math.max(0.01, dist(p, from));
  p.vx = ((p.x - from.x) / d) * knock; p.vz = ((p.z - from.z) / d) * knock;
  emit(g, { type: 'hurt', dmg, x: p.x, z: p.z });
  if (p.hp <= 0 && g.fight) { p.down = true; p.downT = 0; enterPhase(g, 'fallen'); }
}

// ---------- foes ----------

function stepFoes(g, dt) {
  const p = g.player;
  let attackers = g.foes.filter((e) => e.state === 'windup').length;
  for (const e of g.foes) {
    const T = FOES[e.type];
    e.st -= dt; e.wobble = Math.max(0, e.wobble - dt * 2.2); e.flinch = Math.max(0, (e.flinch || 0) - dt);
    const fr = Math.exp(-8 * dt);
    e.vx *= fr; e.vz *= fr;
    if (e.type === 'dummy') continue;
    if (e.state === 'dead') { moveBy(e, e.vx * dt, e.vz * dt, T.radius); continue; }
    e.cd -= dt;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
    let mx = 0, mz = 0;
    if (e.state === 'idle') {
      turnTo(e, Math.atan2(dx, dz), dt * 0.3);
      if (d < T.engage && !p.down) { e.state = 'approach'; emit(g, { type: 'engage', id: e.id, foe: e.type }); }
    } else if (e.state === 'spawn') { if (e.st <= 0) e.state = 'approach'; mx = dx / (d || 1); mz = dz / (d || 1); }
    else if (e.state === 'stagger' || e.state === 'recover') { if (e.st <= 0) { e.state = 'approach'; e.cd = Math.max(e.cd, 0.4); } }
    else if (e.state === 'windup') {
      if (!e.slam) turnTo(e, Math.atan2(dx, dz), dt * 0.25);
      if (e.st <= 0) { attackers--; resolveFoeAttack(g, e, T, d, dx, dz); }
    } else if (e.state === 'approach') {
      turnTo(e, Math.atan2(dx, dz), dt);
      if (d > T.reach * 0.85) { mx = dx / d; mz = dz / d; }
      const slamNext = T.slam && e.attacks % T.slam.every === T.slam.every - 1;
      if ((d <= T.reach || (slamNext && d < T.slam.radius + 1)) && e.cd <= 0 && attackers < MAX_ATTACKERS && !p.down && g.fight) {
        e.state = 'windup'; attackers++;
        if (slamNext) { e.slam = { x: p.x, z: p.z, r: T.slam.radius }; e.st = T.slam.windup; } else e.st = T.windup;
        emit(g, { type: 'windup', id: e.id, slam: !!e.slam });
      }
    }
    const sp = e.state === 'spawn' ? T.speed * 1.3 : T.speed;
    moveBy(e, (mx * sp + e.vx) * dt, (mz * sp + e.vz) * dt, T.radius);
  }
  const live = g.foes.filter((e) => e.state !== 'dead');
  for (let i = 0; i < live.length; i++) {
    const a = live[i], ra = FOES[a.type].radius;
    for (let j = i + 1; j < live.length; j++) push(a, live[j], ra + FOES[live[j].type].radius, true);
    if (!p.down && a.type !== 'dummy') push(a, p, ra + PLAYER.radius);
  }
  g.foes = g.foes.filter((e) => e.state !== 'dead' || e.st > -3);
}

function resolveFoeAttack(g, e, T, d, dx, dz) {
  const p = g.player;
  e.state = 'recover'; e.st = T.recover; e.cd = T.cooldown + g.rand() * 0.8; e.attacks++;
  if (p.down) { e.slam = null; return; }
  if (e.slam) {
    const s = e.slam; e.slam = null;
    emit(g, { type: 'slam', id: e.id, x: s.x, z: s.z, r: s.r });
    if (dist(p, s) < s.r) hurtPlayer(g, p.guard ? T.slam.damage / 2 : T.slam.damage, s, 10);
    return;
  }
  if (d > T.reach + 0.5) return;
  const toE = { x: -dx / Math.max(d, 0.01), z: -dz / Math.max(d, 0.01) };
  const facing = Math.sin(p.face) * toE.x + Math.cos(p.face) * toE.z;
  if (p.guard && facing >= GUARD.arcCos) {
    p.stats.blocks++;
    if (T.poise) { // too heavy to bounce off: you slide back instead
      p.vx = -toE.x * GUARD.heavyPush; p.vz = -toE.z * GUARD.heavyPush;
    } else {
      e.state = 'stagger'; e.st = GUARD.blockStagger; e.vx = toE.x * 4; e.vz = toE.z * 4;
    }
    emit(g, { type: 'block', id: e.id, x: e.x, z: e.z, heavy: !!T.poise });
  } else {
    hurtPlayer(g, T.damage, e, T.knock);
  }
}

// ---------- villagers ----------

function stepNpcs(g, dt) {
  const p = g.player, v = g.villain;
  let near = null, nd = PLAYER.talkRange;
  const canTalk = ['intro', 'tutorial', 'roam1', 'praise1', 'roam2', 'praise2', 'roam3', 'festival'].includes(g.phase) && !(g.phase === 'intro' && g.phaseT < 8);
  for (const n of g.npcs) {
    n.talkT = Math.max(0, n.talkT - dt);
    const fr = Math.exp(-3 * dt); n.vx *= fr; n.vz *= fr;
    if (n.down) { n.x += n.vx * dt; n.z += n.vz * dt; collide(n, 0.35); continue; }
    let tx = null, tz = null, speed = n.speed, act = 'idle';
    if (n.spar) stepSpar(g, n, dt);
    if (n.spar && n.spar.state !== 'idle') act = n.spar.state === 'windup' ? 'sparWindup' : 'sparSwing';
    else if (n.talkT > 0 && g.npcMode !== 'freeze') { act = 'talk'; n.face = turnAngle(n.face, Math.atan2(p.x - n.x, p.z - n.z), dt * 6); }
    else if (g.npcMode === 'freeze') {
      act = 'fear';
      if (v) n.face = turnAngle(n.face, Math.atan2(v.x - n.x, v.z - n.z), dt * 3);
    } else if (g.npcMode === 'hide' && !n.fixed) {
      tx = n.route[0].x; tz = n.route[0].z; speed = Math.max(2.4, n.speed * 2); act = 'cower';
    } else if (g.npcMode === 'gather' && !n.fixed) {
      const a = (n.i / g.npcs.length) * Math.PI * 2;
      tx = p.x + Math.sin(a) * (3 + (n.i % 3) * 0.9); tz = p.z + Math.cos(a) * (3 + (n.i % 3) * 0.9); speed = 4; act = 'cheer';
    } else if (g.npcMode === 'festival' && !n.fixed) {
      const a = (n.i / g.npcs.length) * Math.PI * 2 + 0.3;
      const r = n.id === 'fen' ? 4 : 6.5 + (n.i % 2) * 1.6;
      tx = Math.sin(a) * r; tz = Math.cos(a) * r; speed = 2.5; act = n.id === 'fen' ? 'play' : 'dance';
    } else if (!n.fixed && n.speed > 0) {
      const w = n.route[n.ri];
      if (n.wait > 0) n.wait -= dt;
      else { tx = w.x; tz = w.z; act = 'walk'; }
    }
    if (tx != null) {
      const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
      if (d > 0.25) {
        const s = Math.min(d, speed * dt);
        n.x += (dx / d) * s; n.z += (dz / d) * s;
        n.face = turnAngle(n.face, Math.atan2(dx, dz), dt * 8);
        n.moving = speed;
        if (act === 'idle' || act === 'cheer' || act === 'dance' || act === 'cower') act = act === 'idle' ? 'walk' : act;
      } else {
        n.moving = 0;
        if (act === 'walk') { n.ri = (n.ri + 1) % n.route.length; n.wait = 1.5 + ((n.i * 7 + n.ri * 3) % 5) * 0.6; act = 'idle'; }
        if (act === 'cheer' || act === 'dance') n.face = turnAngle(n.face, Math.atan2(p.x - n.x, p.z - n.z), dt * 4);
      }
    } else n.moving = 0;
    if (act === 'cower' && n.moving) act = 'flee';
    n.act = act;
    if (!n.fixed) collide(n, 0.35);
    const d = dist(n, p);
    if (canTalk && d < nd && !n.spar?.state.startsWith('w')) { nd = d; near = n.id; }
  }
  g.near = p.down ? null : near;
}

// Bram's sparring in the tutorial: he winds up slowly; guard facing him to block. It never hurts.
function stepSpar(g, n, dt) {
  const s = n.spar, p = g.player, T = FOES.sparrer;
  const active = g.tut.step === 'guard' && g.phase === 'tutorial' && dist(n, p) < 5;
  if (active || s.state !== 'idle') n.face = turnAngle(n.face, Math.atan2(p.x - n.x, p.z - n.z), dt * 5);
  s.st -= dt;
  if (s.state === 'idle') {
    if (!active) return;
    s.cd -= dt;
    if (s.cd <= 0) { s.state = 'windup'; s.st = T.windup; emit(g, { type: 'windup', npc: n.id }); }
  } else if (s.state === 'windup' && s.st <= 0) {
    s.state = 'swing'; s.st = T.recover; s.cd = T.cooldown;
    const d = dist(n, p), toB = { x: (n.x - p.x) / (d || 1), z: (n.z - p.z) / (d || 1) };
    const facing = Math.sin(p.face) * toB.x + Math.cos(p.face) * toB.z;
    if (d > T.reach + 0.5) return;
    if (p.guard && facing >= GUARD.arcCos) { p.stats.blocks++; emit(g, { type: 'block', npc: n.id, x: n.x, z: n.z }); onSpar(g, true); }
    else { p.vx = -toB.x * 3; p.vz = -toB.z * 3; emit(g, { type: 'tap', x: p.x, z: p.z }); onSpar(g, false); }
  } else if (s.state === 'swing' && s.st <= 0) s.state = 'idle';
}

// ---------- helpers ----------

export function moveBy(o, dx, dz, r) { o.x += dx; o.z += dz; collide(o, r); }

function push(a, b, min, both = false) {
  const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
  if (d >= min || d < 1e-6) return;
  const o = min - d, nx = dx / d, nz = dz / d;
  if (both) { a.x += (nx * o) / 2; a.z += (nz * o) / 2; b.x -= (nx * o) / 2; b.z -= (nz * o) / 2; }
  else { a.x += nx * o; a.z += nz * o; }
}

function turnAngle(f, a, k) { const d = angDiff(f, a); return f + d * Math.min(1, k); }
function turnTo(o, a, dt) {
  const d = angDiff(o.face, a), s = PLAYER.turn * dt;
  o.face += Math.abs(d) <= s ? d : Math.sign(d) * s;
}

function nearestFoe(g, ok, within) {
  let best = null, bd = within;
  for (const e of g.foes) {
    if (e.state === 'dead' || !ok(e)) continue;
    const d = dist(g.player, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function nearestTarget(g, within) {
  // fighters first; dummies only when no fighter is around
  const e = nearestFoe(g, (o) => o.state !== 'spawn' && COMBAT(o), within) || nearestFoe(g, (o) => o.type === 'dummy', within);
  const v = g.villain;
  if (v && v.state !== 'hidden' && v.y < 3) {
    const dv = dist(g.player, v) - VILLAIN.radius;
    if (dv < within && (!e || dv < dist(g.player, e))) return { x: v.x, z: v.z, isVillain: true };
  }
  return e;
}

export function skipTo(g, phase) { skipStory(g, phase); return g; }

// Plain-JSON view of the state for tests and the debug API.
export function snapshot(g) {
  const r = (v) => Math.round(v * 100) / 100;
  const p = g.player, v = g.villain;
  return {
    t: r(g.t), phase: g.phase, phaseT: r(g.phaseT), stage: g.stage, sky: r(g.sky), dusk: r(g.dusk), music: g.music,
    objective: g.objective && { ...g.objective }, prompt: g.prompt, near: g.near, tut: { ...g.tut }, talked: [...g.talked],
    fight: g.fight && { key: g.fight.key }, npcMode: g.npcMode,
    player: {
      x: r(p.x), z: r(p.z), y: r(p.y), face: r(p.face), hp: r(p.hp), guard: p.guard, striking: !!p.act, combo: p.combo,
      down: p.down, blasted: p.blasted, stats: { ...p.stats },
    },
    foes: g.foes.map((e) => ({ id: e.id, type: e.type, x: r(e.x), z: r(e.z), hp: r(e.hp), state: e.state, slam: !!e.slam })),
    alive: g.foes.filter((e) => e.state !== 'dead' && COMBAT(e)).length,
    npcs: g.npcs.map((n) => ({ id: n.id, x: r(n.x), z: r(n.z), act: n.act, down: n.down })),
    villain: v && { x: r(v.x), z: r(v.z), y: r(v.y), state: v.state, hits: v.hits, charge: r(v.charge) },
    shock: g.shock && { r: r(g.shock.r) },
  };
}
