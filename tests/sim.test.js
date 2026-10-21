// Mechanics tests for src/sim.js and src/story.js: moving, striking, guarding, enemies, villagers,
// the tutorial, the fights and the villain's phases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, skipTo, snapshot, addFoe } from '../src/sim.js';
import { STEP, STRIKE, FOES, VILLAIN, PHASE_LEN, PLAYER } from '../src/config.js';
import { BUILDINGS, BOUNDS, collide, route, blocked, PLACES } from '../src/world.js';
import { makeBot, play } from './bot.js';

const steps = (s) => Math.round(s / STEP);
const run = (g, input, s) => { for (let i = 0; i < steps(s); i++) stepGame(g, typeof input === 'function' ? input(g) : input); return g; };
const events = (g, input, s, type) => {
  const out = [];
  for (let i = 0; i < steps(s); i++) { stepGame(g, typeof input === 'function' ? input(g) : input); out.push(...g.events.filter((e) => !type || e.type === type)); }
  return out;
};
// an open spot on the east road with a single test foe that only attacks when told to
function arena(type = 'grunt', extra = {}) {
  const g = skipTo(createGame(1), 'roam3');
  g.npcMode = 'wander';
  Object.assign(g.player, { x: 26, z: 0, face: Math.PI / 2 });
  g.fight = { key: 'test', laterDone: true, engaged: true }; // foes only attack during a fight
  g.phase = 'fight-test'; // no out-of-fight healing
  const f = addFoe(g, type, 27.6, 0, { state: 'approach', cd: 99, ...extra });
  return { g, f };
}

// ---------- world ----------

test('houses and the palisade block movement; you slide along walls', () => {
  const b = BUILDINGS[0], o = { x: b.x, z: b.z + b.d / 2 - 0.1 };
  collide(o, 0.45);
  assert.ok(o.z >= b.z + b.d / 2 + 0.44, 'pushed out of the house');
  const e = { x: BOUNDS + 3, z: 0 }; collide(e, 0.45);
  assert.ok(e.x <= BOUNDS);
});

test('route() finds a way around houses between any two places', () => {
  for (const a of Object.values(PLACES)) for (const b of Object.values(PLACES)) {
    const path = [a, ...route(a, b)];
    for (let i = 1; i < path.length; i++) assert.ok(!blocked(path[i - 1], path[i], 0.2), `leg ${i} of ${JSON.stringify(a)} -> ${JSON.stringify(b)} is blocked`);
  }
});

// ---------- the intro ----------

test('intro: the hero falls from the sky and lands in the plaza, unable to move until landed', () => {
  const g = createGame(1);
  assert.equal(g.phase, 'intro');
  assert.equal(g.player.y, PLAYER.fallFrom);
  run(g, { mx: 1 }, 1);
  assert.ok(g.player.y > 0 && g.player.x === 0, 'still falling, no control');
  const lands = events(g, {}, 0.5, 'heroLand');
  assert.equal(lands.length, 1);
  assert.equal(g.player.y, 0);
  run(g, {}, PHASE_LEN.intro);
  assert.equal(g.phase, 'tutorial');
});

// ---------- combat ----------

test('strike hits a foe in front, not one behind; aim assist picks the nearer', () => {
  const { g, f } = arena();
  const back = addFoe(g, 'grunt', 24, 0, { state: 'approach', cd: 99 });
  stepGame(g, { strike: true }); run(g, {}, 0.3);
  assert.equal(f.hp, FOES.grunt.hp - STRIKE.damage[0]);
  assert.equal(back.hp, FOES.grunt.hp);
});

test('holding strike gives the jab, hook, kick combo and kills a grunt', () => {
  const { g, f } = arena();
  f.hp = 999;
  const swings = events(g, { strike: true }, 1.2, 'swing').map((s) => s.n);
  assert.deepEqual(swings.slice(0, 4), [0, 1, 2, 0]);
  const { g: g2 } = arena();
  assert.equal(events(g2, { strike: true }, 1, 'kill').length, 1);
});

test('a grunt telegraphs then hits; guarding toward it blocks and staggers it', () => {
  let { g } = arena('grunt', { cd: 0 });
  assert.equal(events(g, {}, FOES.grunt.windup + 0.2, 'hurt').length, 1);
  assert.equal(g.player.hp, 100 - FOES.grunt.damage);
  ({ g } = arena('grunt', { cd: 0 }));
  const f = g.foes.find((e) => e.type === 'grunt');
  assert.equal(events(g, { guard: true }, FOES.grunt.windup + 0.2, 'block').length, 1);
  assert.equal(g.player.hp, 100);
  assert.equal(f.state, 'stagger');
});

test('brutes shrug off the jab and hook, only the kick staggers them, and not while winding up', () => {
  const { g, f } = arena('brute');
  stepGame(g, { strike: true }); run(g, {}, 0.25);
  assert.notEqual(f.state, 'stagger', 'jab does not stagger');
  assert.ok(f.hp < FOES.brute.hp);
  const { g: g2, f: f2 } = arena('brute');
  run(g2, { strike: true }, 1.0); // jab, hook, kick (plus hit-stop frames)
  assert.equal(f2.state, 'stagger');
  const { g: g3, f: f3 } = arena('brute', { state: 'windup', st: 5 });
  g3.player.combo = 1; g3.player.comboT = 0.3; // next strike is the kick
  run(g3, { strike: true }, 0.25);
  assert.equal(f3.state, 'windup', 'armored while winding up');
});

test('blocking a brute pushes you back instead of staggering it', () => {
  const { g, f } = arena('brute', { cd: 0 });
  const x0 = g.player.x;
  const b = events(g, { guard: true }, FOES.brute.windup + 0.1, 'block');
  assert.equal(b.length, 1); assert.ok(b[0].heavy);
  assert.notEqual(f.state, 'stagger');
  run(g, { guard: true }, 0.2);
  assert.ok(g.player.x < x0 - 0.3, 'slid back');
});

test('the captain\'s ground slam hits where you stood; stepping out avoids it, guarding halves it', () => {
  const setup = () => { const { g, f } = arena('captain', { cd: 0, attacks: FOES.captain.slam.every - 1 }); return { g, f }; };
  let { g } = setup();
  events(g, {}, 0.05);
  const slam = g.foes[g.foes.length - 1].slam;
  assert.ok(slam, 'slam telegraphed');
  run(g, {}, FOES.captain.slam.windup);
  assert.equal(g.player.hp, 100 - FOES.captain.slam.damage);
  ({ g } = setup());
  run(g, { mx: -1 }, FOES.captain.slam.windup + 0.1);
  assert.equal(g.player.hp, 100, 'walked out of the ring');
  ({ g } = setup());
  run(g, { guard: true }, FOES.captain.slam.windup + 0.1);
  assert.equal(g.player.hp, 100 - FOES.captain.slam.damage / 2);
});

test('only two foes wind up at the same time', () => {
  const { g } = arena('grunt', { cd: 0 });
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; addFoe(g, 'grunt', 26 + Math.sin(a) * 1.3, Math.cos(a) * 1.3, { state: 'approach', cd: 0 }); }
  let most = 0;
  for (let i = 0; i < 120; i++) { stepGame(g, { guard: true }); most = Math.max(most, g.foes.filter((e) => e.state === 'windup').length); }
  assert.equal(most, 2);
});

test('knocked out in a fight -> fallen; the retry restarts that fight with full HP', async () => {
  const { retryFight } = await import('../src/story.js');
  const g = skipTo(createGame(1), 'fight1');
  g.player.hp = 1;
  run(g, (gg) => { const f = gg.foes.find((e) => e.type === 'grunt'); return { mx: Math.sign(f.x - gg.player.x) }; }, 15);
  assert.equal(g.phase, 'fallen');
  retryFight(g);
  assert.equal(g.phase, 'fight1');
  assert.equal(g.player.hp, 100);
  assert.equal(g.foes.filter((f) => f.type === 'grunt' && f.state !== 'dead').length, 4);
});

// ---------- villagers ----------

test('talking: walk up to a villager and press talk to hear their line; it counts for the objective', () => {
  const g = skipTo(createGame(1), 'roam1');
  const sana = g.npcs.find((n) => n.id === 'sana');
  Object.assign(g.player, { x: sana.x + 1.5, z: sana.z });
  stepGame(g, {});
  assert.equal(g.near, 'sana');
  const lines = events(g, { talk: true }, 0.1, 'line');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].npc, 'sana');
  assert.equal(snapshot(g).objective.done, 1);
});

test('villagers hide during fights and come to cheer you after', () => {
  const g = skipTo(createGame(1), 'fight1');
  assert.equal(g.npcMode, 'hide');
  g.foes = g.foes.filter((f) => f.type === 'dummy');
  stepGame(g, {});
  assert.equal(g.phase, 'praise1');
  run(g, {}, 4);
  const near = g.npcs.filter((n) => Math.hypot(n.x - g.player.x, n.z - g.player.z) < 6 && n.act === 'cheer');
  assert.ok(near.length >= 5, `${near.length} villagers cheering nearby`);
});

// ---------- the tutorial ----------

test('tutorial: strike the dummies, finish a combo, block Bram twice, then the village opens up', () => {
  const g = skipTo(createGame(1), 'tutorial');
  const bot = makeBot();
  const steps = [];
  play(g, stepGame, (gg) => { if (!steps.includes(gg.tut.step)) steps.push(gg.tut.step); return bot(gg); }, (gg) => gg.phase !== 'tutorial', 120);
  assert.deepEqual(steps, ['go', 'strike', 'combo', 'guard', 'done']);
  assert.equal(g.phase, 'roam1');
  assert.ok(g.tut.blocks >= 2);
});

test('Bram\'s sparring never hurts', () => {
  const g = skipTo(createGame(1), 'tutorial');
  g.tut.step = 'guard';
  const bram = g.npcs.find((n) => n.id === 'bram');
  Object.assign(g.player, { x: bram.x, z: bram.z - 1.6 });
  const taps = events(g, {}, 6, 'tap');
  assert.ok(taps.length >= 1);
  assert.equal(g.player.hp, 100);
});

// ---------- fights ----------

test('fight2 brings a second brute mid-fight; fight3 brings help when Gorr is at half HP', () => {
  for (const [key, type] of [['fight2', 'brute'], ['fight3', 'grunt']]) {
    const g = skipTo(createGame(1), key);
    const before = g.foes.filter((f) => f.type === type).length;
    play(g, stepGame, makeBot(), (gg) => gg.fight?.laterDone, 120);
    assert.ok(g.foes.filter((f) => f.type === type).length > before, `${key}: reinforcements came`);
  }
});

// ---------- the villain ----------

test('arrival: sudden silence, the sky turns fast, he descends slowly and lands in front of you', () => {
  const g2 = skipTo(createGame(1), 'arrival');
  assert.equal(g2.music, 'silent');
  run(g2, {}, 3);
  assert.ok(g2.sky > 0.9, `sky ${g2.sky}`);
  const v = g2.villain;
  assert.ok(v.state === 'descend' && v.y > 30, 'still high up after 3 s');
  const lands = events(g2, {}, PHASE_LEN.arrival, 'land');
  assert.equal(lands.length, 1);
  assert.equal(g2.phase, 'defiance');
  const d = Math.hypot(v.x - g2.player.x, v.z - g2.player.z);
  assert.ok(d > 4 && d < 11, `landed ${d} away`);
});

test('defiance: hits on him do 0 and bounce you back; enough of them bring the judgement', () => {
  const g = skipTo(createGame(1), 'defiance');
  const v = g.villain;
  const r = Math.hypot(v.x, v.z); // stand just outside him, away from the well
  g.player.x = v.x + (v.x / r) * 2.2; g.player.z = v.z + (v.z / r) * 2.2;
  assert.equal(events(g, { strike: true }, 0.4, 'zero').length, 1);
  assert.ok(Math.hypot(g.player.x - v.x, g.player.z - v.z) > 2.6, 'bounced back');
  play(g, stepGame, makeBot(), (gg) => gg.phase !== 'defiance', 30);
  assert.ok(v.hits >= VILLAIN.zeroHitsToJudge);
  assert.equal(g.phase, 'judgement');
});

test('judgement: "Kneel." and the shockwave leaves you at 1 HP and knocks every villager down', () => {
  for (const guard of [false, true]) {
    const g = skipTo(createGame(1), 'judgement');
    const lines = [], breaks = [];
    while (g.phase === 'judgement') { stepGame(g, { guard }); lines.push(...g.events.filter((e) => e.type === 'line').map((e) => e.text)); breaks.push(...g.events.filter((e) => e.type === 'guardBreak')); }
    assert.ok(lines.includes('Kneel.'));
    assert.equal(g.player.hp, 1);
    assert.ok(g.player.down && g.player.blasted);
    assert.ok(g.npcs.every((n) => n.down));
    assert.equal(breaks.length, guard ? 1 : 0);
  }
});

test('aftermath: he leaves, then the game stops on the card', () => {
  const g = skipTo(createGame(1), 'aftermath');
  const ev = events(g, {}, PHASE_LEN.aftermath + 0.2);
  assert.ok(ev.some((e) => e.type === 'gone'), 'he disappears');
  assert.deepEqual(ev.filter((e) => e.type === 'card').map((c) => c.card), ['to-be-continued']);
  const t = g.t; run(g, {}, 1);
  assert.equal(g.t, t);
});

test('same seed, same inputs, same game', () => {
  const playIt = () => { const g = createGame(9); play(g, stepGame, makeBot(), () => false, 200); return JSON.stringify(snapshot(g)); };
  assert.equal(playIt(), playIt());
});
