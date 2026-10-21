// HTML overlay on top of the 3D canvas: health, the objective and its marker, speech bubbles above
// villagers, subtitles, key prompts, damage numbers, the letterbox for the big moments, and the
// title / pause / end screens.
import { VILLAIN, PLAYER, GAME_TITLE, GAME_TAGLINE, FOES } from './config.js';
import { NPCS } from './script.js';

const $ = (id) => document.getElementById(id);
const NAMES = Object.fromEntries(NPCS.map((n) => [n.id, n.name]));

export function createHud(view) {
  const el = {
    hud: $('hud'), hp: $('hp-fill'), hpBox: $('hp'), quest: $('quest'), chapterLabel: $('chapter-label'), objective: $('objective'), why: $('why'), marker: $('marker'), markerDist: $('marker-dist'),
    toast: $('toast'), chapter: $('chapter'), marks: $('marks'), mouseHint: $('mousehint'),
    banner: $('banner'), boss: $('boss'), bossName: $('boss-name'), bossBar: $('boss-fill'),
    line: $('line'), who: $('line-who'), text: $('line-text'), bubbles: $('bubbles'), nums: $('nums'), talk: $('talk'), keys: $('keys'),
    flash: $('flash'), vignette: $('vignette'), lbTop: $('lb-top'), lbBot: $('lb-bot'),
    title: $('title'), pause: $('pause'), card: $('card'), cardBody: $('card-body'), help: $('help'),
  };
  $('title-name').textContent = GAME_TITLE;
  $('title-tag').textContent = GAME_TAGLINE;
  let line = null, banner = null, flash = 0, lb = 0, bossShake = 0, card = null, t = 0;
  let toast = null, chapter = null, stuckT = 0, lastObj = '', lastDist = Infinity;
  const marks = [];
  const nums = [], bubbles = new Map(); // npc id -> { el, t, dur }

  function number(text, cls, x, y, z) {
    const d = document.createElement('div');
    d.className = `num ${cls}`; d.textContent = text;
    el.nums.appendChild(d);
    nums.push({ d, x, y, z, t: 0, dx: (Math.random() - 0.5) * 30 });
  }
  function bubble(id, who, text, dur) {
    let b = bubbles.get(id);
    if (!b) { b = { el: document.createElement('div') }; b.el.className = 'bubble'; el.bubbles.appendChild(b.el); bubbles.set(id, b); }
    b.el.innerHTML = `<b>${who}</b>${text}`;
    b.t = 0; b.dur = dur;
  }

  function onEvent(e, g) {
    const p = g.player;
    switch (e.type) {
      case 'line':
        if (e.npc && view.anchor(e.npc)) bubble(e.npc, e.who, e.text, e.dur);
        else line = { who: e.who, text: e.text, t: 0, dur: e.dur };
        break;
      case 'alarm': banner = { text: 'BANDITS!', sub: '', t: 0, dur: 1.8, cls: 'red' }; break;
      case 'victory': banner = e.big ? { text: 'TIDEWELL IS SAFE!', sub: 'the bandits are gone for good', t: 0, dur: 3, cls: 'gold' } : { text: 'VICTORY!', sub: '', t: 0, dur: 2.2, cls: 'gold' }; break;
      case 'hit': number(e.dmg, e.finisher ? 'big' : '', e.x, 2.3, e.z); break;
      case 'zero': number('0', 'zero', e.x, e.y + 0.6, e.z); bossShake = 1; break;
      case 'hurt': number(`-${Math.round(e.dmg)}`, 'hurt', p.x, 2.2, p.z); break;
      case 'block': number('BLOCK', 'block', p.x, 2.4, p.z); break;
      case 'guardBreak': number('GUARD BROKEN', 'hurt big', p.x, 2.4, p.z); break;
      case 'heal': number('+HP', 'heal', p.x, 2.4, p.z); break;
      case 'land': flash = Math.max(flash, 0.35); break;
      case 'shock': flash = 1; break;
      case 'card': card = e.card; break;
      case 'objective': toast = { text: e.text, why: e.why, t: 0, dur: 3.2 }; break;
      case 'chapter': chapter = { n: e.n, title: e.title, t: 0, dur: 3.6 }; break;
      case 'phase': if (e.phase === 'intro' || e.prev === 'fallen') { card = null; line = null; } break;
    }
  }

  function tick(g, dt) {
    t += dt;
    if (line && (line.t += dt) > line.dur + 0.4) line = null;
    if (banner && (banner.t += dt) > banner.dur) banner = null;
    if (toast && !chapter && (toast.t += dt) > toast.dur) toast = null; // wait for the chapter card
    if (chapter && (chapter.t += dt) > chapter.dur) chapter = null;
    // nudge the quest card when the player seems lost: same objective, not getting closer
    const o = g.objective, key = o?.text || '';
    const tgt = o && o.x != null ? Math.hypot(g.player.x - o.x, g.player.z - o.z) : null;
    if (key !== lastObj || (tgt != null && tgt < lastDist - 2)) { stuckT = 0; lastObj = key; lastDist = tgt ?? Infinity; } else stuckT += dt;
    for (const [id, b] of bubbles) if ((b.t += dt) > b.dur + 0.3) { b.el.remove(); bubbles.delete(id); }
    for (const n of nums) n.t += dt;
    while (nums.length && nums[0].t > 1.1) nums.shift().d.remove();
    flash = Math.max(0, flash - dt * 0.9);
    bossShake = Math.max(0, bossShake - dt * 3);
    const story = (['arrival', 'judgement', 'aftermath', 'end'].includes(g.phase) && !(g.phase === 'arrival' && g.phaseT < 1.2)) || (g.phase === 'intro' && g.phaseT < 2.6);
    lb += ((story ? 1 : 0) - lb) * (1 - Math.exp(-3 * dt));
  }

  function draw(g, screen, paused, audio) {
    const p = g.player;
    const playing = screen === 'game';
    el.title.hidden = screen !== 'title';
    el.pause.hidden = !(playing && paused);
    el.hud.classList.toggle('hidden', !playing);

    el.hp.style.width = `${(p.hp / PLAYER.hp) * 100}%`;
    el.hpBox.classList.toggle('low', p.hp < 30);
    el.hpBox.style.opacity = playing && g.phase !== 'end' ? 1 - lb : 0;

    // quest card + marker
    const o = g.objective;
    let otext = o?.text || '';
    if (o?.kind === 'talkAny') otext += ` (${Math.min(o.done, o.count)}/${o.count})`;
    el.objective.textContent = otext;
    el.why.textContent = o?.why || '';
    el.chapterLabel.textContent = g.chapter ? `Chapter ${g.chapter.n} \u00b7 ${g.chapter.title}` : '';
    el.quest.style.opacity = otext && lb < 0.5 ? 1 : 0;
    el.quest.classList.toggle('nudge', stuckT > 25);
    if (stuckT > 28) stuckT = 0;

    // who still has something to say: ! over them, and the marker points at the nearest
    const want = (o?.kind === 'talkAny' ? g.npcs.filter((n) => !g.talked.has(n.id) && !n.down).map((n) => n.id) : o?.kind === 'talk' ? [o.npc] : []);
    let target = null;
    if (want.length) {
      const near = want.map((id) => g.npcs.find((n) => n.id === id)).reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
      target = view.anchor(near.id);
    } else if (o && o.x != null && !(o.kind === 'fight' && g.foes.some((f) => f.type !== 'dummy' && f.state !== 'idle' && f.state !== 'dead'))) target = { x: o.x, y: 2.5, z: o.z };
    if (o?.kind === 'go' && Math.hypot(p.x - o.x, p.z - o.z) < (o.r || 3)) target = null;
    while (marks.length < want.length) { const m = document.createElement('div'); m.className = 'mark'; m.textContent = '!'; el.marks.appendChild(m); marks.push(m); }
    marks.forEach((m, i) => {
      const id = want[i], a = id && id !== g.near && view.anchor(id), s = a && view.project(a.x, a.y + 0.55, a.z);
      const show = playing && s && s.visible && lb < 0.5;
      m.style.display = show ? '' : 'none';
      if (show) m.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${Math.max(0.6, Math.min(1.2, 14 / Math.max(1, Math.hypot(a.x - p.x, a.z - p.z))))})`;
    });
    if (target && lb < 0.5) {
      const s = view.project(target.x, target.y + 0.5, target.z);
      const W = innerWidth, H = innerHeight, m = 40;
      let x = s.x, y = s.y, off = !s.visible || x < m || x > W - m || y < m || y > H - m;
      if (!s.visible) { x = W - x; y = H - m; }
      x = Math.max(m, Math.min(W - m, x)); y = Math.max(m, Math.min(H - m, y));
      el.marker.hidden = want.length > 0 && !off; // on screen, the ! already shows where to go
      el.marker.classList.toggle('off', off);
      el.marker.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.markerDist.textContent = `${Math.round(Math.hypot(p.x - target.x, p.z - target.z))}m`;
    } else el.marker.hidden = true;

    // the talk prompt floats above the villager you are next to
    const ta = g.near && view.anchor(g.near), ts = ta && view.project(ta.x, ta.y - (ta.y > 1.8 ? 1.05 : 0.7), ta.z); // chest height, under their speech bubble
    el.talk.hidden = !(playing && g.near && !paused && ts?.visible);
    if (!el.talk.hidden) {
      el.talk.innerHTML = `<kbd>E</kbd> Talk to ${NAMES[g.near]}`;
      el.talk.style.transform = `translate(${ts.x}px, ${ts.y}px) translate(-50%, -50%)`;
    }
    el.keys.hidden = !g.prompt;
    if (g.prompt) el.keys.innerHTML = `${g.prompt.keys.map((k) => `<kbd>${k}</kbd>`).join(' ')}<span>${g.prompt.text}</span>`;

    // popups
    el.toast.style.opacity = toast && !chapter && lb < 0.5 ? Math.min(1, toast.t * 5, (toast.dur - toast.t) * 3) : 0;
    if (toast) el.toast.innerHTML = `<small>NEW OBJECTIVE</small><b>${toast.text}</b>`;
    el.chapter.style.opacity = chapter ? Math.min(1, chapter.t * 2, (chapter.dur - chapter.t) * 2) : 0;
    if (chapter) el.chapter.innerHTML = `<small>CHAPTER ${chapter.n}</small><b>${chapter.title}</b>`;
    el.mouseHint.hidden = !(playing && !paused && !document.pointerLockElement && !card && !toast && lb < 0.5 && !('ontouchstart' in window));

    el.banner.hidden = !banner;
    if (banner) {
      el.banner.className = `banner ${banner.cls || ''}`;
      el.banner.innerHTML = `<b>${banner.text}</b>${banner.sub ? `<small>${banner.sub}</small>` : ''}`;
      const k = banner.t / banner.dur;
      el.banner.style.opacity = Math.min(1, banner.t * 5, (1 - k) * 4);
      el.banner.style.transform = `translate(-50%, -50%) scale(${1 + (1 - Math.min(1, banner.t * 4)) * 0.3})`;
    }

    // boss bars: Gorr's goes down, his never does
    const cap = g.foes.find((f) => f.type === 'captain' && f.state !== 'idle');
    const vehl = g.phase === 'defiance';
    el.boss.style.opacity = vehl || (cap && g.phase === 'fight3') ? 1 : 0;
    if (vehl) { el.bossName.innerHTML = `${VILLAIN.name}<small>${VILLAIN.title}</small>`; el.bossBar.style.width = '100%'; el.boss.classList.add('vehl'); }
    else if (cap) { el.bossName.innerHTML = 'CAPTAIN GORR<small>BANDIT CHIEF</small>'; el.bossBar.style.width = `${Math.max(0, cap.hp / FOES.captain.hp) * 100}%`; el.boss.classList.remove('vehl'); }
    el.boss.style.transform = `translateX(-50%) translateX(${Math.sin(t * 90) * bossShake * 6}px)`;

    el.line.style.opacity = line ? Math.min(1, line.t * 4, (line.dur + 0.4 - line.t) * 3) : 0;
    if (line) { el.who.textContent = line.who; el.text.textContent = line.text; el.line.classList.toggle('vehl', line.who === VILLAIN.name); }

    for (const [id, b] of bubbles) {
      const a = view.anchor(id);
      const s = a && view.project(a.x, a.y, a.z);
      const show = s && s.visible && s.x > -100 && s.x < innerWidth + 100;
      b.el.style.display = show ? '' : 'none';
      if (show) {
        b.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${0.85 + Math.min(1, b.t * 8) * 0.15})`;
        b.el.style.opacity = Math.min(1, b.t * 6, (b.dur + 0.3 - b.t) * 4);
      }
    }
    for (const n of nums) {
      const s = view.project(n.x, n.y + n.t * 1.2, n.z);
      n.d.style.display = s.visible ? '' : 'none';
      n.d.style.transform = `translate(${s.x + n.dx * n.t}px, ${s.y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.25 - n.t) * 2})`;
      n.d.style.opacity = Math.min(1, (1.1 - n.t) * 3);
    }

    el.flash.style.opacity = flash;
    el.lbTop.style.height = el.lbBot.style.height = `${lb * 11}vh`;
    const dark = g.sky * 0.55, red = Math.max(0, (30 - p.hp) / 30) * 0.6 * (p.down ? 0 : 1);
    el.vignette.style.boxShadow = `inset 0 0 18vw rgba(${Math.round(120 * red)},0,0,${Math.max(dark, red)})`;
    el.help.style.opacity = playing && ['tutorial', 'roam1'].includes(g.phase) ? 0.85 : 0;

    el.card.hidden = !card;
    if (card) {
      const s = p.stats;
      el.cardBody.innerHTML = card === 'fallen'
        ? `<h1>KNOCKED OUT</h1><p>Get back up. Tidewell needs you.</p><p class="key">Press Enter to try again</p>`
        : `<h1>TO BE CONTINUED</h1>
           <dl><dt>Bandits defeated</dt><dd>${s.kills}</dd><dt>Chats with villagers</dt><dd>${s.talks}</dd><dt>Strikes on ${VILLAIN.name}</dt><dd>${s.zeroHits}</dd><dt>Damage dealt to ${VILLAIN.name}</dt><dd class="zero">0</dd></dl>
           <p class="key">Press Enter to play again</p>`;
    }
    el.hud.dataset.mute = audio.muted ? '1' : '';
  }

  return {
    onEvent, tick, draw,
    info: () => ({
      line: line && `${line.who}: ${line.text}`, bubbles: [...bubbles.entries()].map(([id, b]) => `${id}: ${b.el.textContent}`),
      banner: banner?.text || null, card, letterbox: Math.round(lb * 100) / 100, flash: Math.round(flash * 100) / 100, numbers: nums.map((n) => n.d.textContent),
      objective: el.objective.textContent, why: el.why.textContent, chapter: el.chapterLabel.textContent, marker: !el.marker.hidden, talk: el.talk.hidden ? null : el.talk.textContent, keys: el.keys.hidden ? null : el.keys.textContent,
      toast: toast?.text || null, chapterCard: chapter ? `${chapter.n}: ${chapter.title}` : null, marks: marks.filter((m) => m.style.display !== 'none').length, mouseHint: !el.mouseHint.hidden,
    }),
  };
}
