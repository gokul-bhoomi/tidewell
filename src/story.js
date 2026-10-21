// The story: phases, objectives, tutorial steps, fights and the timed beats from script.js.
// Pure and deterministic like sim.js (which calls into this file every step).
//
// intro -> tutorial -> roam1 -> fight1 -> praise1 -> roam2 -> fight2 -> praise2 -> roam3 -> fight3
//       -> festival -> arrival -> defiance -> judgement -> aftermath -> end      ('fallen' = retry a fight)
import { PLAYER, PHASE_LEN, VILLAIN, FIGHTS } from './config.js';
import { SCRIPT, LINES, CHAPTERS } from './script.js';
import { PLACES, DUMMIES, BRAM_POST } from './world.js';
import { emit, say, addFoe, dist, clamp } from './sim.js';

export const PHASES = ['intro', 'tutorial', 'roam1', 'fight1', 'praise1', 'roam2', 'fight2', 'praise2', 'roam3', 'fight3',
  'festival', 'arrival', 'defiance', 'judgement', 'aftermath', 'end'];
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => k * k * (3 - 2 * k);
const npc = (g, id) => g.npcs.find((n) => n.id === id);
const later = (g, s, fn) => { g.next = { at: g.t + s, fn }; };
const go = (phase) => (g) => enterPhase(g, phase);
const base = (t) => (t || '').replace(/\s*\(\d+\/\d+\)/, '');
// Set the objective; a new one (not just a counter update) pops up on screen.
function setObjective(g, o) {
  const prev = g.objective;
  g.objective = o;
  if (o && o.kind !== 'none' && base(prev?.text) !== base(o.text)) emit(g, { type: 'objective', text: base(o.text), why: o.why || '' });
}

export function enterPhase(g, phase) {
  const prev = g.phase;
  g.phase = phase; g.phaseT = 0; g.fired = new Set(); g.next = null; g.prompt = null;
  const p = g.player;
  emit(g, { type: 'phase', phase, prev });
  const ch = CHAPTERS[phase];
  if (ch && ch[0] !== g.chapter?.n && prev !== 'fallen') { g.chapter = { n: ch[0], title: ch[1] }; emit(g, { type: 'chapter', n: ch[0], title: ch[1] }); }
  if (!ch && phase !== 'fallen') g.chapter = null;
  switch (phase) {
    case 'intro': {
      p.x = PLACES.landing.x; p.z = PLACES.landing.z; p.y = PLAYER.fallFrom; p.face = Math.PI;
      const t = npc(g, 'toma'), k = npc(g, 'pip');
      Object.assign(t, { x: -2.6, z: 1.8, face: Math.atan2(p.x + 2.6, p.z - 1.8) });
      Object.assign(k, { x: 2.8, z: 3.5, face: Math.atan2(p.x - 2.8, p.z - 3.5), wait: 12 });
      t.wait = 12;
      g.objective = null;
      break;
    }
    case 'tutorial':
      g.tut.step = 'go';
      setObjective(g, { kind: 'go', text: 'Go to the training yard (down the west road)', why: 'Bram will teach you to fight, so you can protect Tidewell.', x: PLACES.yard.x, z: PLACES.yard.z, r: 8 });
      break;
    case 'roam1':
      g.talked = new Set(); g.alarmAt = null;
      setObjective(g, { kind: 'talkAny', text: 'Meet the villagers', why: 'Get to know the people you are protecting. Walk up to anyone with a ! and press E.', count: 4, done: 0 });
      break;
    case 'fight1': case 'fight2': case 'fight3': startFight(g, phase); break;
    case 'praise1': case 'praise2':
      g.stage = phase === 'praise1' ? 'hero1' : 'hero2';
      g.npcMode = 'gather'; g.objective = null; g.fight = null; g.music = 'village';
      emit(g, { type: 'victory' });
      break;
    case 'roam2':
      g.talked = new Set(); g.alarmAt = null; g.npcMode = 'wander';
      setObjective(g, { kind: 'talkAny', text: 'Walk around the village', why: 'Everyone wants to thank you. Find the people marked with !', count: 3, done: 0 });
      break;
    case 'roam3':
      g.npcMode = 'wander';
      g.objective = { kind: 'none', text: 'Catch your breath', why: 'Gorr has lost two raids. He will not be far behind.' };
      break;
    case 'festival':
      g.stage = 'festival'; g.npcMode = 'festival'; g.fight = null;
      setObjective(g, { kind: 'talk', npc: 'toma', text: 'Join the festival: talk to Elder Toma', why: 'The bandits are gone for good. Tidewell is celebrating you!' });
      emit(g, { type: 'victory', big: true });
      break;
    case 'arrival': {
      g.npcMode = 'freeze'; g.objective = null; g.fight = null;
      // he lands in front of the player, toward the middle of the plaza
      // he lands in open plaza in front of the player: not on the well, not behind it
      let dx = -p.x, dz = -p.z, d = Math.hypot(dx, dz);
      if (d < 4) { dx = Math.sin(p.face); dz = Math.cos(p.face); d = 1; }
      const base = Math.atan2(dx, dz);
      let vx = 0, vz = -6;
      for (const turn of [0, 0.7, -0.7, 1.2, -1.2, 1.8, -1.8]) {
        const a = base + turn, x = p.x + Math.sin(a) * VILLAIN.landDist, z = p.z + Math.cos(a) * VILLAIN.landDist;
        const wellD = Math.hypot(x, z), t = Math.max(0, Math.min(1, -(p.x * (x - p.x) + p.z * (z - p.z)) / (VILLAIN.landDist ** 2)));
        const passD = Math.hypot(p.x + (x - p.x) * t, p.z + (z - p.z) * t); // how close the line of sight passes the well
        if (wellD >= 4 && wellD <= 11 && passD >= 2.6) { vx = x; vz = z; break; }
      }
      g.villain = { x: vx, z: vz, y: VILLAIN.startY, face: Math.atan2(p.x - vx, p.z - vz), state: 'hidden', hits: 0, charge: 0 };
      emit(g, { type: 'hush' });
      break;
    }
    case 'defiance':
      g.villain.state = 'hover'; g.villain.y = VILLAIN.hoverY; g.sky = 1; g.judgeAt = null;
      g.objective = { kind: 'none', text: 'Protect the village' };
      break;
    case 'judgement': g.villain.state = 'rise'; g.objective = null; break;
    case 'aftermath': g.objective = null; break;
    case 'end': emit(g, { type: 'card', card: 'to-be-continued' }); break;
    case 'fallen':
      g.fallenFrom = prev; g.objective = null;
      say(g, LINES.fallen);
      emit(g, { type: 'card', card: 'fallen' });
      break;
  }
}

function startFight(g, key) {
  const F = FIGHTS[key], at = PLACES[F.at];
  g.foes = g.foes.filter((f) => f.type === 'dummy');
  F.foes.forEach((type, i) => {
    const a = (i / F.foes.length) * Math.PI * 2 + g.rand() * 0.5;
    const r = type === 'grunt' ? 2.5 + g.rand() * 2 : 0.5;
    addFoe(g, type, at.x + Math.sin(a) * r, at.z + Math.cos(a) * r);
  });
  g.fight = { key, laterDone: false, engaged: false };
  g.checkpoint = key;
  g.npcMode = 'hide';
  const text = { fight1: 'Defend the east gate', fight2: 'Save the market', fight3: 'Defeat Captain Gorr' }[key];
  const why = { fight1: 'Bandits are coming through the gate. Stop them before they reach the houses!', fight2: 'They are robbing the market stalls. Drive them out!', fight3: 'Beat the bandit captain and the raids end for good.' }[key];
  setObjective(g, { kind: 'fight', text, why, x: at.x, z: at.z });
}

// Start the current fight again after being knocked out.
export function retryFight(g) {
  const p = g.player, key = g.fallenFrom;
  const back = { fight1: { x: 22, z: 0 }, fight2: { x: 0, z: 15 }, fight3: { x: 0, z: -16 } }[key];
  Object.assign(p, { ...back, hp: PLAYER.hp, down: false, downT: 0, vx: 0, vz: 0, act: null, invuln: 1 });
  enterPhase(g, key);
}

// ---------- every step ----------

export function stepStory(g, dt) {
  runScript(g);
  if (g.next && g.t >= g.next.at) { const fn = g.next.fn; g.next = null; fn(g); }
  const p = g.player, v = g.villain;
  const fighting = g.phase.startsWith('fight');
  if (!fighting && !p.down && g.phase !== 'fallen' && PHASES.indexOf(g.phase) < PHASES.indexOf('arrival')) p.hp = Math.min(PLAYER.hp, p.hp + PLAYER.regen * dt);

  switch (g.phase) {
    case 'intro': if (g.phaseT >= PHASE_LEN.intro) enterPhase(g, 'tutorial'); break;
    case 'tutorial':
      if (g.tut.step === 'go' && dist(p, PLACES.yard) < 9) {
        g.tut.step = 'strike';
        say(g, LINES.bramYard);
        g.prompt = { keys: ['J'], text: 'Strike' };
        setObjective(g, { kind: 'dummy', text: 'Hit the training dummies (0/3)', why: 'Walk up to a straw dummy and press J.', x: DUMMIES[1].x, z: DUMMIES[1].z });
      }
      break;
    case 'roam1': case 'roam2': {
      const o = g.objective;
      o.done = g.talked.size;
      if (g.alarmAt == null && (o.done >= o.count || g.phaseT > (g.phase === 'roam1' ? PHASE_LEN.roamMax : PHASE_LEN.roam2Max))) g.alarmAt = g.phaseT + 4;
      if (g.alarmAt != null && g.phaseT >= g.alarmAt && !g.next) {
        say(g, g.phase === 'roam1' ? LINES.alarm1 : LINES.alarm2);
        emit(g, { type: 'alarm' });
        later(g, 2.2, go(g.phase === 'roam1' ? 'fight1' : 'fight2'));
      }
      break;
    }
    case 'roam3':
      if (g.phaseT >= PHASE_LEN.roam3 && !g.next && !g.fired.has('alarm')) {
        g.fired.add('alarm');
        say(g, LINES.alarm3); emit(g, { type: 'alarm' });
        later(g, 2.4, go('fight3'));
      }
      break;
    case 'fight1': case 'fight2': case 'fight3': stepFight(g); break;
    case 'praise1': case 'praise2':
      if (g.phaseT >= PHASE_LEN.praise && g.npcMode === 'gather') {
        g.npcMode = 'wander';
        setObjective(g, g.phase === 'praise1'
          ? { kind: 'talk', npc: 'toma', text: 'Tell Elder Toma what happened', why: 'He is waiting in the plaza. Follow the marker.' }
          : { kind: 'talk', npc: 'mira', text: 'Get patched up by Mira the healer', why: 'You took some hits. Mira lives by the east road.' });
      }
      break;
    case 'festival':
      g.dusk = Math.min(1, g.phaseT / 6);
      if (g.phaseT >= PHASE_LEN.festivalMax && !g.next) toast(g);
      break;
    case 'arrival':
      g.sky = clamp((g.phaseT - 0.3) / 2.6, 0, 1);
      if (g.phaseT >= VILLAIN.descendAt && v.state === 'hidden') v.state = 'descend';
      if (v.state === 'descend') {
        const k = clamp((g.phaseT - VILLAIN.descendAt) / VILLAIN.descendTime, 0, 1);
        v.y = VILLAIN.startY + (VILLAIN.hoverY - VILLAIN.startY) * easeInOut(k); // slow start, soft landing
        if (k >= 1) { emit(g, { type: 'land', x: v.x, z: v.z }); enterPhase(g, 'defiance'); }
      }
      if (v) faceToward(v, p, dt * 0.2);
      break;
    case 'defiance':
      faceToward(v, p, dt * 0.15);
      if (g.judgeAt == null && v.hits >= VILLAIN.zeroHitsToJudge) g.judgeAt = g.phaseT + 1.3;
      if ((g.judgeAt != null && g.phaseT >= g.judgeAt) || g.phaseT >= VILLAIN.defianceMax) enterPhase(g, 'judgement');
      break;
    case 'judgement': {
      const t = g.phaseT;
      v.y = VILLAIN.hoverY + (VILLAIN.riseY - VILLAIN.hoverY) * easeOut(clamp(t / 1.5, 0, 1));
      v.charge = clamp((t - 1.1) / (VILLAIN.shockAt - 1.1), 0, 1);
      if (t >= VILLAIN.shockAt && !g.shock) {
        g.shock = { x: v.x, z: v.z, r: 0 };
        v.state = 'push'; v.charge = 0; g.music = 'silent'; g.hitstop = 4;
        emit(g, { type: 'shock', x: v.x, z: v.z });
      }
      if (g.shock) {
        g.shock.r = Math.min(VILLAIN.shockMax, g.shock.r + VILLAIN.shockSpeed * dt);
        if (!p.blasted && g.shock.r >= dist(p, g.shock)) blast(g);
        for (const n of g.npcs) {
          if (n.down || g.shock.r < dist(n, g.shock)) continue;
          const d = Math.max(0.01, dist(n, g.shock));
          n.down = true; n.vx = ((n.x - g.shock.x) / d) * 16; n.vz = ((n.z - g.shock.z) / d) * 16;
        }
      }
      if (t >= PHASE_LEN.judgement) enterPhase(g, 'aftermath');
      break;
    }
    case 'aftermath':
      if (g.phaseT > 10 && v.state !== 'gone') { v.state = 'depart'; v.y += (2 + (g.phaseT - 10) * 5) * dt; if (v.y > 40) { v.state = 'gone'; emit(g, { type: 'gone' }); } }
      if (g.phaseT >= PHASE_LEN.aftermath) enterPhase(g, 'end');
      break;
  }
}

function runScript(g) {
  (SCRIPT[g.phase] || []).forEach((b, i) => {
    if (g.fired.has(i) || g.phaseT < b.at) return;
    g.fired.add(i);
    if (b.music) { g.music = b.music; emit(g, { type: 'music', mode: b.music }); }
    say(g, b.line);
  });
}

function stepFight(g) {
  const F = FIGHTS[g.fight.key], combat = g.foes.filter((f) => f.type !== 'dummy');
  const alive = combat.filter((f) => f.state !== 'dead');
  if (!g.fight.engaged && alive.some((f) => f.state !== 'idle')) {
    g.fight.engaged = true;
    g.music = g.fight.key === 'fight3' ? 'boss' : 'battle';
    emit(g, { type: 'music', mode: g.music });
    if (g.fight.key === 'fight3') say(g, LINES.gorrHello);
  }
  const L = F.later;
  if (L && !g.fight.laterDone) {
    const cap = combat.find((f) => f.type === 'captain');
    const due = L.captainHalf ? cap && cap.hp < cap.maxHp / 2 : combat.length - alive.length >= L.after;
    if (due) {
      g.fight.laterDone = true;
      say(g, L.captainHalf ? LINES.gorrHalf : LINES.bruteIn);
      L.foes.forEach((type, i) => addFoe(g, type, L.from.x + (i - 1) * 2.2, L.from.z, { state: 'spawn', st: 1.2 + i * 0.3 }));
    }
  }
  if (alive.length === 0 && (!L || g.fight.laterDone) && !g.next) {
    if (g.fight.key === 'fight3') { say(g, LINES.gorrDown); g.music = 'village'; emit(g, { type: 'music', mode: 'village' }); later(g, 3, go('festival')); }
    else enterPhase(g, g.fight.key === 'fight1' ? 'praise1' : 'praise2');
  }
}

function toast(g) {
  if (g.fired.has('toast')) return;
  g.fired.add('toast');
  say(g, LINES.tomaToast);
  g.objective = { kind: 'none', text: 'Enjoy the festival' };
  g.next = { at: g.t + 3.2, fn: (gg) => { say(gg, LINES.cheers); emit(gg, { type: 'cheers' }); later(gg, PHASE_LEN.festivalAfterToast - 3.2, go('arrival')); } };
}

// ---------- hooks from sim.js ----------

// Returns true when the story handled the conversation itself.
export function onTalk(g, n) {
  const o = g.objective;
  if (o?.kind === 'talk' && o.npc === n.id) {
    if (g.phase === 'praise1') {
      say(g, LINES.tomaThanks);
      g.objective = { kind: 'none', text: 'Listen to Elder Toma' };
      later(g, 3.2, (gg) => { say(gg, LINES.tomaWarn); later(gg, 3, go('roam2')); });
      return true;
    }
    if (g.phase === 'praise2') {
      g.player.hp = PLAYER.hp;
      say(g, LINES.miraHeal); emit(g, { type: 'heal' });
      g.objective = null;
      later(g, 2.5, go('roam3'));
      return true;
    }
    if (g.phase === 'festival') { toast(g); return true; }
  }
  return false;
}

export function onDummyHit(g, n) {
  const t = g.tut;
  if (g.phase !== 'tutorial') return;
  if (t.step === 'strike') {
    t.hits++;
    g.objective.text = `Hit the training dummies (${Math.min(3, t.hits)}/3)`;
    if (t.hits >= 3) {
      t.step = 'combo';
      say(g, LINES.bramCombo);
      g.prompt = { keys: ['J', 'J', 'J'], text: 'Keep pressing J: 3-hit combo' };
      setObjective(g, { ...g.objective, text: 'Finish a 3-hit combo on a dummy', why: 'Keep pressing J: jab, hook, then a spinning kick.' });
    }
  } else if (t.step === 'combo' && n === 2) {
    t.step = 'guard';
    say(g, LINES.bramGuard);
    g.prompt = { keys: ['K'], text: 'Hold K: Guard' };
    setObjective(g, { kind: 'spar', text: 'Block Bram\'s swing (0/2)', why: 'Stand in front of Bram. When he raises his sword, hold K.', x: BRAM_POST.x, z: BRAM_POST.z });
  }
}

export function onSpar(g, blocked) {
  const t = g.tut;
  if (t.step !== 'guard') return;
  if (!blocked) { if (g.t - t.lastTap > 4) { t.lastTap = g.t; say(g, LINES.bramTap); } return; }
  t.blocks++;
  g.objective.text = `Block Bram's swing (${t.blocks}/2)`;
  if (t.blocks >= 2) {
    t.step = 'done'; g.prompt = null; g.objective = null;
    say(g, LINES.bramDone);
    later(g, 3, go('roam1'));
  }
}

// ---------- the villain's blow ----------

function blast(g) {
  const p = g.player, s = g.shock;
  const d = Math.max(0.01, dist(p, s));
  if (p.guard) emit(g, { type: 'guardBreak', x: p.x, z: p.z });
  p.blasted = true; p.down = true; p.downT = 0; p.act = null; p.guard = false;
  const dmg = p.hp - 1; // everything but your life
  p.hp = 1; p.stats.damageTaken += dmg;
  p.vx = ((p.x - s.x) / d) * 22; p.vz = ((p.z - s.z) / d) * 22;
  g.hitstop = 10;
  emit(g, { type: 'blasted', dmg, x: p.x, z: p.z });
}

function faceToward(o, t, k) {
  const a = Math.atan2(t.x - o.x, t.z - o.z), d = Math.atan2(Math.sin(a - o.face), Math.cos(a - o.face));
  o.face += d * Math.min(1, k * 8);
}

// ---------- jumping around the story (tests, debug, ?phase=) ----------

export function skipStory(g, phase) {
  const i = PHASES.indexOf(phase);
  if (i < 0) throw new Error(`unknown phase ${phase}`);
  const p = g.player;
  Object.assign(p, { y: 0, down: false, blasted: false, vx: 0, vz: 0, hp: PLAYER.hp, act: null, landT: 0 });
  g.foes = g.foes.filter((f) => f.type === 'dummy'); g.shock = null; g.villain = null; g.hitstop = 0; g.next = null; g.fight = null;
  g.tut.step = i > 1 ? 'done' : 'go';
  g.stage = i >= PHASES.indexOf('festival') ? 'festival' : i >= PHASES.indexOf('praise2') ? 'hero2' : i >= PHASES.indexOf('praise1') ? 'hero1' : 'stranger';
  g.sky = 0; g.dusk = i >= PHASES.indexOf('festival') ? 1 : 0;
  g.npcMode = i >= PHASES.indexOf('festival') ? 'festival' : 'wander';
  const at = { fight1: { x: 22, z: 0 }, fight2: { x: 0, z: 15 }, fight3: { x: 0, z: -16 }, tutorial: { x: 0, z: 6 } }[phase] || { x: 0, z: 6 };
  Object.assign(p, at);
  g.music = i >= PHASES.indexOf('festival') ? 'festival' : 'village';
  if (i < PHASES.indexOf('arrival')) { enterPhase(g, phase); return; }
  // the festival crowd is in the plaza when he comes
  for (const n of g.npcs) if (!n.fixed) { const a = (n.i / g.npcs.length) * Math.PI * 2 + 0.3, r = 6.5 + (n.i % 2) * 1.6; n.x = Math.sin(a) * r; n.z = Math.cos(a) * r; }
  enterPhase(g, 'arrival');
  g.music = 'silent';
  if (i >= PHASES.indexOf('defiance')) { g.sky = 1; enterPhase(g, 'defiance'); g.music = 'dread'; }
  if (i >= PHASES.indexOf('judgement')) enterPhase(g, 'judgement');
  if (i >= PHASES.indexOf('aftermath')) {
    g.shock = { x: g.villain.x, z: g.villain.z, r: VILLAIN.shockMax };
    g.villain.state = 'push'; g.villain.y = VILLAIN.riseY; blast(g); g.hitstop = 0;
    for (const n of g.npcs) n.down = true;
    enterPhase(g, 'aftermath');
  }
  if (i >= PHASES.indexOf('end')) enterPhase(g, 'end');
}

