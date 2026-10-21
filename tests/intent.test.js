// Design-intent tests: the decisions the game's owner made, written down as tests so a later change
// can't quietly drift away from them. sim.test.js checks that the mechanics work; this file checks
// that the game is still the game that was asked for. Each test paraphrases the decision.
//
// If one of these fails, your change goes against a design decision. Don't just edit the test: ask
// the owner first, and change the test only once they agree.
//
// 2026-10-20, owner's feedback on the first version: no spoilers ("everything was said in the text"),
// a slow One Piece-style build-up (tutorial, walking around, villagers who talk and praise you,
// fights that get harder) before he comes, then he beats you and disappears.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, stepGame, skipTo, PHASES } from '../src/sim.js';
import { STEP, CAM, FUNDAMENTALS, VILLAIN, FOES, GAME_TITLE, GAME_TAGLINE } from '../src/config.js';
import { SCRIPT, LINES, NPCS } from '../src/script.js';
import { makeBot, play } from './bot.js';

const before = (phase) => PHASES.slice(0, PHASES.indexOf(phase));

// ---------- no spoilers ----------

test('intent: no spoilers - the title screen says nothing about him or what is coming', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const visible = (html.match(/<div id="title"[\s\S]*?<\/div>\s*<\/div>/) || [''])[0] + GAME_TITLE + GAME_TAGLINE;
  for (const word of [VILLAIN.name, 'arrival', 'arrives', 'easy', 'villain', 'doom', 'before the storm']) {
    assert.ok(!new RegExp(word, 'i').test(visible), `title screen mentions "${word}"`);
  }
});

test('intent: no spoilers - nobody mentions him or anything ominous before he is in the sky', () => {
  const early = [
    ...before('arrival').flatMap((p) => (SCRIPT[p] || []).map((b) => b.line?.text || '')),
    ...Object.values(LINES).filter((l) => l.who !== VILLAIN.name && !/VEHL/.test(l.text) && l !== LINES.zero1 && l !== LINES.zero3).map((l) => l.text),
    ...NPCS.flatMap((n) => Object.values(n.lines).flat()),
  ];
  for (const t of early) {
    for (const w of [VILLAIN.name, 'unmoved', 'sky is', 'birds', 'omen of', 'dark', 'something is coming', 'too quiet', 'calm before']) {
      assert.ok(!new RegExp(w, 'i').test(t), `"${t}" hints at what is coming (${w})`);
    }
  }
  assert.ok(!SCRIPT.festival.some((b) => b.music === 'silent'), 'the music does not fade out early: the festival is still playing when he comes');
});

test('intent: his name is shouted once he is already descending (the "here comes Paul" moment)', () => {
  const shout = SCRIPT.arrival.find((b) => b.line?.text.includes(VILLAIN.name));
  assert.ok(shout, 'someone shouts his name');
  assert.ok(shout.at > VILLAIN.descendAt, 'after he starts coming down');
  assert.ok(VILLAIN.startY > 30 && VILLAIN.descendTime >= 5, 'he comes down from high above, slowly');
});

// ---------- the slow build-up ----------

test('intent: you arrive from the sky, then a tutorial teaches Strike and Guard before any real fight', () => {
  assert.deepEqual(PHASES.slice(0, 3), ['intro', 'tutorial', 'roam1']);
  const g = createGame(1);
  assert.ok(g.player.y > 10, 'the hero drops in from above');
  assert.ok(FUNDAMENTALS.includes('strike') && FUNDAMENTALS.includes('guard'));
});

test('intent: a slow One Piece-style build-up - even a bot that rushes takes minutes to reach him', () => {
  for (const seed of [1, 2, 3]) {
    const g = createGame(seed);
    play(g, stepGame, makeBot(), (gg) => gg.phase === 'arrival', 900);
    assert.equal(g.phase, 'arrival', `seed ${seed}: stuck in ${g.phase}`);
    assert.ok(g.t > 120, `seed ${seed}: reached him after only ${Math.round(g.t)} s (a person takes two to three times as long)`);
    assert.ok(g.player.stats.talks >= 8, 'you talk to the villagers along the way');
  }
});

test('intent: walk around between fights and talk to villagers; they say good things about you after you win', () => {
  assert.ok(PHASES.filter((p) => p.startsWith('roam')).length >= 3, 'roaming between fights');
  assert.ok(NPCS.length >= 10, 'a village full of people');
  for (const n of NPCS) assert.ok(n.lines.stranger.length && n.lines.hero1.length && n.lines.festival.length, `${n.id} has something to say at every stage`);
  assert.ok(SCRIPT.praise1.length >= 3 && SCRIPT.praise2.length >= 3, 'villagers come and praise you after the fights');
  assert.ok(PHASES.indexOf('festival') === PHASES.indexOf('arrival') - 1, 'a celebration right before he comes');
});

test('intent: fights get harder - easy grunts first, then bigger brutes, then their captain', () => {
  assert.ok(FOES.brute.hp > FOES.grunt.hp * 3 && FOES.captain.hp > FOES.brute.hp, 'bigger enemies are tougher');
  const masher = makeBot({ guard: false });
  const g = skipTo(createGame(1), 'fight1');
  const low = play(g, stepGame, masher, (gg) => gg.phase !== 'fight1', 120);
  assert.equal(g.phase, 'praise1', 'a button-masher clears the first fight');
  assert.ok(low > 80, `the first fight is very easy (dropped to ${low})`);
  for (const key of ['fight2', 'fight3']) {
    const m = skipTo(createGame(1), key);
    play(m, stepGame, makeBot({ guard: false }), (gg) => gg.phase !== key, 240);
    assert.ok(m.player.stats.damageTaken >= 20, `${key} hurts a masher (${m.player.stats.damageTaken})`);
    const s = skipTo(createGame(1), key);
    play(s, stepGame, makeBot(), (gg) => gg.phase !== key, 240);
    assert.notEqual(s.phase, 'fallen', `${key} is still winnable`);
    assert.notEqual(s.phase, key, `${key} finished`);
  }
});

// ---------- the villain ----------

test('intent: you feel powerless - your attacks do nothing to him', () => {
  const g = skipTo(createGame(1), 'defiance');
  const dmg = [];
  play(g, (gg, i) => { stepGame(gg, i); dmg.push(...gg.events.filter((e) => e.type === 'zero').map(() => 0)); }, makeBot(), (gg) => gg.phase !== 'defiance', 30);
  assert.ok(dmg.length >= 3, 'the player got to try');
  assert.ok(g.villain.hits === dmg.length);
});

test('intent: one move wipes the village and leaves you on the ground; then he disappears', () => {
  const g = skipTo(createGame(1), 'judgement');
  while (g.phase === 'judgement') stepGame(g, { guard: true });
  assert.ok(g.shock.r >= 65, 'the shockwave covers the whole village');
  assert.ok(g.player.down && g.player.hp > 0, 'beaten but alive');
  while (g.phase === 'aftermath') stepGame(g, {});
  assert.equal(g.villain.state, 'gone', 'he leaves');
});

test('intent: you keep control of your character during his arrival (it is not just a cutscene)', () => {
  const g = skipTo(createGame(1), 'arrival');
  const x0 = g.player.x;
  for (let i = 0; i < 60; i++) stepGame(g, { mx: 1, mz: 0 });
  assert.ok(g.player.x > x0 + 3);
});

// ---------- how it is made ----------

test('intent: single player for now', () => assert.ok(createGame(1).player && !createGame(1).players));

test('intent: third-person camera, behind the character and a little above', () => {
  const pitch = Math.atan2(CAM.height - CAM.lookHeight, CAM.dist + CAM.lookAhead) * 180 / Math.PI;
  assert.ok(CAM.dist > CAM.height, 'more behind than above');
  assert.ok(pitch > 5 && pitch < 30, `looks slightly down (${pitch.toFixed(1)} deg)`);
});

test('intent: built with Three.js, plain browser modules and no build step', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /"three":\s*"\.\/vendor\/three\.module\.min\.js"/);
  assert.match(html, /<script type="module" src="src\/main\.js">/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(!pkg.scripts.build && !pkg.dependencies, 'no bundler, no runtime npm deps');
});

test('intent: characters are textured toon figures, not plain shapes', () => {
  const src = readFileSync(new URL('../src/characters.js', import.meta.url), 'utf8');
  assert.match(src, /MeshToonMaterial/, 'toon shading');
  assert.match(src, /outline/i, 'ink outlines');
  assert.match(src, /faceTexture|drawFace/, 'painted faces');
});

test('intent: the sim runs at a fixed 60 Hz step', () => assert.equal(STEP, 1 / 60));
