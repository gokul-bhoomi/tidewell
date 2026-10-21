// Browser smoke test: serves the game, opens it in headless Chrome (WebGL via SwiftShader) and plays
// the whole story through the debug API with the same bot the Node tests use (tests/bot.js):
// title, the hero's landing, the tutorial, talking, three fights, the festival, his arrival, the 0s,
// the shockwave and the end card. Fails on any wrong state, page error or console error, and saves
// screenshots of every stage to test-results/. Run with `npm run smoke`.
// Uses the installed Google Chrome (or CHROME_PATH), so no browser download is needed.
// Software WebGL is slow, so the game is stepped many frames per draw: steps(n) draws once.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = join(ROOT, 'test-results');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
const browser = await chromium.launch(process.env.CHROME_PATH ? { ...launch, executablePath: process.env.CHROME_PATH } : { ...launch, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) problems.push(`console error: ${m.text()}`); });
await mkdir(SHOTS, { recursive: true });

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); await page.screenshot({ path: join(SHOTS, `fail-${name.replace(/\W+/g, '-').slice(0, 60)}.png`) }).catch(() => {}); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
async function open(query) {
  await page.goto(base + query);
  await page.waitForFunction(() => window.__game?.debug, null, { timeout: 15000 });
  await page.evaluate(async () => { window.__bot = (await import('/tests/bot.js')).makeBot(); });
}
const game = (fn, arg) => page.evaluate(fn, arg);
const snap = () => game(() => window.__game.debug.snapshot());
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const steps = (n) => game((n) => window.__game.debug.step(n), n); // n sim steps, one draw
// let the bot play until the phase is `phase` (or up to maxS seconds); returns the snapshot
async function playUntil(phase, maxS = 200) {
  await game(([phase, n]) => window.__game.debug.play(window.__bot, n, (g) => g.phase === phase || g.phase === 'fallen'), [phase, Math.round(maxS * 60)]);
  await steps(1);
  const s = await snap();
  expect(s.game.phase === phase, `expected ${phase}, still in ${s.game.phase} (objective: ${s.hud.objective})`);
  return s;
}
const botFor = (s) => game((s) => window.__game.debug.play(window.__bot, Math.round(s * 60)), s);
const sees = (s, re) => re.test([s.hud.line, ...s.hud.bubbles].join(' | '));

console.log('Tidewell smoke test');

await check('title screen loads, WebGL draws, and it gives nothing away', async () => {
  await open('?pause=1');
  await steps(30);
  const s = await snap();
  expect(s.screen === 'title', `screen ${s.screen}`);
  expect(s.view.calls > 50, `only ${s.view.calls} draw calls`);
  const lit = await game(() => { const c = document.getElementById('view'), x = document.createElement('canvas'); x.width = 32; x.height = 18; const k = x.getContext('2d'); k.drawImage(c, 0, 0, 32, 18); const d = k.getImageData(0, 0, 32, 18).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; return sum / (d.length / 4) / 3; });
  expect(lit > 40, `canvas looks blank (mean brightness ${lit.toFixed(1)})`);
  const text = await game(() => document.getElementById('title').innerText);
  expect(!/vehl|arrival|unmoved/i.test(text), `title screen gives it away: ${text}`);
  await shot('01-title');
});

await check('Enter: the hero falls from the sky and lands in the plaza', async () => {
  await page.keyboard.press('Enter');
  await steps(40);
  let s = await snap();
  expect(s.screen === 'game' && s.game.phase === 'intro' && s.game.player.y > 1, `phase ${s.game.phase}, y ${s.game.player.y}`);
  await shot('02-falling');
  await steps(170);
  s = await snap();
  expect(s.game.player.y === 0, 'did not land');
  expect(sees(s, /fell right out of the sky/), `no reaction from the villagers: ${JSON.stringify(s.hud)}`);
  await shot('03-landed');
});

await check('keyboard: WASD walks, E talks to the villager in front of you', async () => {
  await game(() => window.__game.debug.play(() => ({}), 60 * 12, (g) => g.phase === 'tutorial'));
  const p0 = (await snap()).game.player;
  await page.keyboard.down('KeyW'); await steps(40); await page.keyboard.up('KeyW');
  const p1 = (await snap()).game.player;
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1.5, 'W did not move the player');
  await game(() => { const d = window.__game.debug, t = d.game().npcs.find((n) => n.id === 'nell'); d.set({ x: t.x + 1.3, z: t.z }); });
  await steps(3);
  expect((await snap()).hud.talk?.includes('NELL'), 'no talk prompt next to Nell');
  await page.keyboard.press('KeyE'); await steps(5);
  const s = await snap();
  expect(s.hud.bubbles.some((b) => b.startsWith('nell:')), `no speech bubble: ${s.hud.bubbles}`);
  await shot('04-talk');
});

await check('tutorial: training yard, dummies, combo, blocking Bram', async () => {
  await open('?phase=tutorial&pause=1');
  await game(() => window.__game.debug.play(window.__bot, 60 * 60, (g) => g.tut.step === 'combo'));
  let s = await snap();
  expect(s.game.tut.step === 'combo' && s.hud.keys?.includes('J'), `step ${s.game.tut.step}, keys ${s.hud.keys}`);
  await shot('05-tutorial-dummies');
  await game(() => window.__game.debug.play(window.__bot, 60 * 30, (g) => g.npcs.find((n) => n.id === 'bram').spar.state === 'windup' && g.tut.blocks === 1));
  await steps(20);
  await shot('06-tutorial-guard');
  s = await playUntil('roam1', 60);
  expect(s.game.tut.blocks >= 2, 'did not block Bram twice');
});

await check('roam, then the first bandits at the east gate: easy', async () => {
  let s = await playUntil('fight1', 200);
  expect(s.game.talked.length >= 4, `talked to ${s.game.talked.length} villagers`);
  await game(() => window.__game.debug.play(window.__bot, 60 * 30, (g) => g.foes.some((f) => f.state === 'windup' || f.state === 'stagger')));
  await steps(6);
  await shot('07-fight1');
  s = await playUntil('praise1', 60);
  expect(s.game.player.hp > 70, `the first fight should be easy, hp ${s.game.player.hp}`);
  await steps(150);
  s = await snap();
  expect(s.game.npcs.filter((n) => n.act === 'cheer').length >= 5, 'villagers did not come to cheer');
  await shot('08-praise');
});

await check('the market fight brings brutes', async () => {
  await playUntil('fight2', 120);
  await game(() => window.__game.debug.play(window.__bot, 60 * 40, (g) => g.foes.some((f) => f.type === 'brute' && f.state === 'windup' && Math.hypot(f.x - g.player.x, f.z - g.player.z) < 4)));
  await steps(10);
  await shot('09-fight2-brute');
  await playUntil('praise2', 120);
});

await check('Captain Gorr: a boss bar, then the festival at dusk', async () => {
  await playUntil('fight3', 120);
  await game(() => window.__game.debug.play(window.__bot, 60 * 40, (g) => g.phase !== 'fight3' || g.foes.some((f) => f.type === 'captain' && f.state === 'windup')));
  await steps(10);
  expect((await snap()).game.phase === 'fight3', 'the fight with Gorr ended before he attacked');
  expect(await page.evaluate(() => document.getElementById('boss').style.opacity) === '1', 'no boss bar for Gorr');
  await shot('10-fight3-gorr');
  await playUntil('festival', 120);
  await botFor(7);
  await steps(1);
  const s = await snap();
  expect(s.game.dusk > 0.9, 'no festival dusk');
  await shot('11-festival');
});

await check('arrival: the festival stops dead, the sky turns, his name is shouted as he descends', async () => {
  let s = await playUntil('arrival', 90);
  const t0 = s.game.t;
  let shout = false;
  for (let i = 0; i < 50; i++) {
    await steps(12);
    s = await snap();
    if (sees(s, /VEHL THE UNMOVED/)) shout = true;
    if (shout && s.game.villain.y < 22) break;
  }
  expect(shout, 'nobody shouted his name');
  expect(s.game.sky > 0.9, `sky ${s.game.sky}`);
  expect(s.hud.letterbox > 0.5, 'no letterbox');
  expect(s.view.cam.lookY > 3, `camera not looking up at him (${s.view.cam.lookY})`);
  expect(s.game.t - t0 > 6, `he came too quickly: ${(s.game.t - t0).toFixed(1)} s, villain y ${s.game.villain.y}, t0 ${t0}`);
  await shot('12-arrival');
});

await check('defiance: every hit is a 0', async () => {
  await playUntil('defiance', 30);
  const zeros = await game(() => {
    const d = window.__game.debug, seen = [];
    for (let i = 0; i < 300 && d.game().villain.hits < 3; i++) { d.play(window.__bot, 1); seen.push(...d.snapshot().hud.numbers); }
    return seen;
  });
  expect(zeros.includes('0') && !zeros.some((z) => z !== '0'), `numbers: ${zeros.join(',')}`);
  await shot('13-defiance-zero');
});

await check('judgement: "Kneel." and the village is blown away; you are left at 1 HP', async () => {
  await playUntil('judgement', 30);
  let s, kneel = false, shotTaken = false;
  for (let i = 0; i < 120 && (s = await snap()).game.phase !== 'aftermath'; i++) {
    await game(() => window.__game.debug.play(() => ({ guard: true }), 6));
    s = await snap();
    if (sees(s, /Kneel\./)) kneel = true;
    if (!shotTaken && s.game.shock && s.game.shock.r > 18) { await shot('14-shockwave'); shotTaken = true; }
  }
  expect(kneel, 'no "Kneel."');
  expect(s.game.player.hp === 1 && s.game.player.down, `hp ${s.game.player.hp}`);
  expect(s.view.blown > s.view.pieces * 0.9, `only ${s.view.blown}/${s.view.pieces} pieces blown away`);
});

await check('aftermath: he leaves; the end card; Enter plays again from the start', async () => {
  let s = await playUntil('end', 30);
  await steps(5);
  s = await snap();
  expect(s.game.villain.state === 'gone', `he is still ${s.game.villain.state}`);
  expect(s.hud.card === 'to-be-continued' && await page.isVisible('#card'), 'no end card');
  await shot('15-end');
  await page.keyboard.press('Enter'); await steps(3);
  s = await snap();
  expect(s.game.phase === 'intro' && s.hud.card === null && s.view.blown === 0, `restart failed: ${s.game.phase}, blown ${s.view.blown}`);
});

await check('knocked out in a fight: the card, then Enter retries that fight', async () => {
  await open('?phase=fight1&pause=1');
  await game(() => { const d = window.__game.debug; d.set({ hp: 1 }); d.play((g) => { const f = g.foes.find((e) => e.type === 'grunt'); return { mx: Math.sign(f.x - g.player.x), mz: Math.sign(f.z - g.player.z) * 0.3 }; }, 60 * 20, (g) => g.phase === 'fallen'); });
  await steps(3);
  let s = await snap();
  expect(s.game.phase === 'fallen' && s.hud.card === 'fallen', `phase ${s.game.phase}`);
  await page.keyboard.press('Enter'); await steps(3);
  s = await snap();
  expect(s.game.phase === 'fight1' && s.game.player.hp === 100 && s.hud.card === null, `retry failed: ${s.game.phase} hp ${s.game.player.hp}`);
});

await check('?phase= jumps straight to any part of the story', async () => {
  for (const phase of ['tutorial', 'roam2', 'fight2', 'festival', 'arrival', 'defiance', 'judgement', 'aftermath']) {
    await open(`?phase=${phase}&pause=1`);
    await steps(2);
    const s = await snap();
    expect(s.game.phase === phase, `${phase}: got ${s.game.phase}`);
  }
});

await check('Esc pauses and freezes the game', async () => {
  await open('?play=1&pause=1');
  await steps(10);
  await page.keyboard.press('Escape'); await steps(1);
  const t0 = (await snap()).game.t; await steps(30);
  const s = await snap();
  expect(s.paused && s.game.t === t0, `paused ${s.paused}, t ${t0} -> ${s.game.t}`);
  expect(await page.isVisible('#pause'), 'no pause screen');
});

await check('there is sound: a key press starts it, village music first, M mutes', async () => {
  await open('?pause=1');
  await page.keyboard.press('Enter'); await steps(2);
  const s = await snap();
  expect(s.audio.running && s.audio.music === 'village', `audio ${JSON.stringify(s.audio)}`);
  await page.keyboard.press('KeyM'); await steps(1);
  expect((await snap()).audio.muted, 'M did not mute');
});

await check('no runtime errors', async () => {
  const errs = await game(() => window.__game.errors);
  expect(errs.length === 0 && problems.length === 0, [...errs, ...problems].join('\n       '));
});

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed (screenshots in test-results/)` : '\nall smoke checks passed');
process.exit(failed ? 1 : 0);
