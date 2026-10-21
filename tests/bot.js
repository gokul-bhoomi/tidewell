// A bot that plays the game like a player would: follows the objective, walks around houses, talks to
// villagers, does the tutorial, and fights. `guard: false` makes it a pure button-masher.
// Shared by the Node tests (and mirrored in the browser smoke test).
import { route, PLACES } from '../src/world.js';
import { FOES } from '../src/config.js';

export function makeBot({ guard = true } = {}) {
  let path = null, goal = null, tick = 0;
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  function walkTo(g, t, stop = 0.8) {
    const p = g.player;
    if (!goal || d2(goal, t) > 1.5 || !path?.length) { goal = { x: t.x, z: t.z }; path = route(p, t); }
    while (path.length > 1 && d2(path[0], p) < 1.3) path.shift();
    const w = path[0], dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
    if (path.length === 1 && d < stop) return {};
    return { mx: dx / d, mz: dz / d };
  }
  function talkTo(g, n) {
    if (g.near === n.id) { goal = null; return { talk: tick % 2 === 0 }; }
    return walkTo(g, n, 1);
  }

  return function bot(g) {
    tick++;
    const p = g.player;
    if (p.down || g.phase === 'intro') return {};

    // fighting
    const foes = g.foes.filter((f) => f.type !== 'dummy' && f.state !== 'dead');
    if (g.fight && foes.length) {
      if (guard) {
        const slam = foes.find((f) => f.slam && f.state === 'windup');
        if (slam) {
          const dx = p.x - slam.slam.x, dz = p.z - slam.slam.z, d = Math.hypot(dx, dz);
          if (d < slam.slam.r + 1.2) return { mx: dx / (d || 1), mz: dz / (d || 1) };
        }
        const threat = foes.find((f) => f.state === 'windup' && !f.slam && d2(f, p) < FOES[f.type].reach + 1.5);
        if (threat) return { guard: true };
      }
      const awake = foes.filter((f) => f.state !== 'idle');
      const pool = awake.length ? awake : foes;
      const t = pool.reduce((a, b) => (d2(a, p) < d2(b, p) ? a : b));
      if (d2(t, p) > 2.1) return walkTo(g, t, 0.5);
      return { strike: true };
    }

    // the tutorial
    if (g.phase === 'tutorial') {
      const s = g.tut.step;
      if (s === 'go') return walkTo(g, PLACES.yard);
      if (s === 'strike' || s === 'combo') {
        const dummy = g.foes.filter((f) => f.type === 'dummy').reduce((a, b) => (d2(a, p) < d2(b, p) ? a : b));
        if (d2(dummy, p) > 1.9) return walkTo(g, dummy, 1.5);
        return { strike: true };
      }
      if (s === 'guard') {
        const bram = g.npcs.find((n) => n.id === 'bram');
        if (d2(bram, p) > 2.2) return walkTo(g, bram, 1.8);
        return { guard: bram.spar.state === 'windup' };
      }
      return {};
    }

    // the villain
    if (g.phase === 'defiance' || g.phase === 'arrival') {
      const v = g.villain;
      if (!v || v.y > 3) return {};
      if (d2(v, p) > 2.6) return walkTo(g, v, 2);
      return { strike: true };
    }

    // objectives
    const o = g.objective;
    if (o?.kind === 'talkAny') {
      const left = g.npcs.filter((n) => !g.talked.has(n.id) && !n.down);
      if (g.near && !g.talked.has(g.near)) return { talk: tick % 2 === 0 };
      if (left.length) return talkTo(g, left.reduce((a, b) => (d2(a, p) < d2(b, p) ? a : b)));
    }
    if (o?.kind === 'talk') return talkTo(g, g.npcs.find((n) => n.id === o.npc));
    if (o?.kind === 'fight') return walkTo(g, o, 4);
    if (o?.kind === 'go') return walkTo(g, o);
    return {};
  };
}

// Plays from the current state until `until(g)` is true or `maxS` seconds pass. Returns the lowest HP seen.
export function play(g, stepGame, bot, until, maxS = 900) {
  let low = g.player.hp;
  const end = g.t + maxS;
  while (!until(g) && g.t < end && g.phase !== 'end' && g.phase !== 'fallen') {
    stepGame(g, bot(g));
    low = Math.min(low, g.player.hp);
  }
  return low;
}
