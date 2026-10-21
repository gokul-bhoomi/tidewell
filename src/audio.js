// WebAudio music and sound, all synthesized (no files). Browsers only start audio after a key press
// or click, so unlock() is called from the first input event.
//
// Music: 'village' (light plucked tune while you walk around), 'battle' (drums + bass), 'boss'
// (faster, with taiko), 'festival' (a bright dance), 'silent', 'dread' (low drone and a heartbeat),
// 'lament' (slow soft chords after the fall).

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const BPM = { village: 96, battle: 128, boss: 140, festival: 132, dread: 60, lament: 60 };
const VILLAGE_MEL = [72, 74, 76, 79, 76, 74, 72, 69, 67, 69, 72, 74, 72, 69, 67, -1];
const VILLAGE_BASS = [48, 48, 53, 55];
const BATTLE_BASS = [38, 38, 41, 38, 36, 36, 33, 36];
const BATTLE_LEAD = [62, 65, 67, 69, 67, 65, 62, 60];
const FEST_MEL = [76, 79, 81, 79, 76, 74, 72, 74, 76, 76, 79, 81, 84, 81, 79, 76];
const FEST_BASS = [48, 55, 53, 55, 50, 57, 55, 57];
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];

export function createAudio() {
  let ctx = null, master, music, sfx, noise, timer = null;
  let mode = 'none', muted = false, step = 0, nextT = 0, drone = null, lamentT = 0;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
      music = ctx.createGain(); music.gain.value = 0.5; music.connect(master);
      sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noise = buf;
      timer = setInterval(schedule, 25);
      const m = mode; mode = 'none'; setMode(m);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function env(node, t, a, peak, d, end = 0.0001) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(end, t + a + d);
  }
  function tone(type, f0, f1, t, a, d, vol, out = sfx) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    env(g, t, a, vol, d);
    o.connect(g).connect(out); o.start(t); o.stop(t + a + d + 0.05);
  }
  function hiss(t, d, vol, type, f0, f1 = f0, q = 1, out = sfx) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + d);
    const g = ctx.createGain(); env(g, t, 0.005, vol, d);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + d + 0.05);
  }
  function pluck(m, t, vol, d = 0.5) { tone('triangle', hz(m), hz(m), t, 0.004, d, vol, music); tone('sine', hz(m + 12), hz(m + 12), t, 0.003, d * 0.4, vol * 0.3, music); }
  function bass(m, t, vol, d = 0.22, cut = 900) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = hz(m);
    f.type = 'lowpass'; f.frequency.setValueAtTime(cut, t); f.frequency.exponentialRampToValueAtTime(180, t + d);
    env(g, t, 0.005, vol, d);
    o.connect(f).connect(g).connect(music); o.start(t); o.stop(t + d + 0.1);
  }
  const kick = (t, v = 0.9) => tone('sine', 140, 45, t, 0.002, 0.18, v, music);
  const snare = (t, v = 0.35) => hiss(t, 0.14, v, 'bandpass', 1800, 1200, 0.8, music);
  const hat = (t, v = 0.08) => hiss(t, 0.04, v, 'highpass', 7000, 7000, 1, music);

  // ---------- music ----------
  function schedule() {
    if (!ctx) return;
    const sixteenth = 60 / (BPM[mode] || 100) / 4;
    while (nextT < ctx.currentTime + 0.12) {
      const t = Math.max(nextT, ctx.currentTime), s = step % 16, bar = Math.floor(step / 16);
      if (mode === 'village') {
        if (s % 2 === 0) { const m = VILLAGE_MEL[(bar % 2) * 8 + s / 2]; if (m > 0 && (s % 4 === 0 || bar % 2)) pluck(m, t, 0.07); }
        if (s === 0 || s === 8) bass(VILLAGE_BASS[(bar * 2 + s / 8) % 4] - 12, t, 0.08, 0.5, 500);
        if (s % 4 === 2) hiss(t, 0.05, 0.03, 'highpass', 6000, 6000, 1, music);
      } else if (mode === 'battle' || mode === 'boss') {
        if (s === 0 || s === 8 || s === 10) kick(t);
        if (s === 4 || s === 12) snare(t);
        if (s % 2 === 0) hat(t);
        if (mode === 'boss' && (s === 6 || s === 14)) tone('sine', 200, 90, t, 0.002, 0.3, 0.45, music);
        if (s === 14 && bar % 2) tone('sine', 220, 110, t, 0.002, 0.25, 0.4, music);
        if (s % 2 === 0) bass(BATTLE_BASS[(s / 2) % 8] + (mode === 'boss' && bar % 4 >= 2 ? 3 : 0), t, 0.2);
        if (bar % 4 >= 2 && s % 4 === 0) tone('triangle', hz(BATTLE_LEAD[(s / 4 + bar) % 8] + 12), hz(BATTLE_LEAD[(s / 4 + bar) % 8] + 12), t, 0.005, 0.3, 0.08, music);
      } else if (mode === 'festival') {
        if (s % 4 === 0) kick(t, 0.6);
        if (s === 4 || s === 12) { snare(t, 0.2); hiss(t, 0.06, 0.15, 'bandpass', 2500, 2500, 2, music); }
        hat(t, s % 2 ? 0.04 : 0.07);
        if (s % 2 === 0) bass(FEST_BASS[(s / 2) % 8] - 12, t, 0.14, 0.18, 1200);
        if (s % 2 === 0) { const m = FEST_MEL[(s / 2 + (bar % 2) * 8) % 16]; pluck(m, t, 0.08, 0.25); }
      } else if (mode === 'dread' && step % 16 === 0) {
        tone('sine', 52, 40, t, 0.01, 0.25, 0.5, music); tone('sine', 50, 38, t + 0.28, 0.01, 0.3, 0.35, music);
      } else if (mode === 'lament' && step % 32 === 0) {
        const ch = CHORDS[lamentT++ % 4];
        for (const m of ch) { tone('triangle', hz(m), hz(m), t, 1.2, 3.4, 0.05, music); tone('sine', hz(m - 12), hz(m - 12), t, 1.5, 3.2, 0.04, music); }
      }
      step++; nextT = t + sixteenth;
    }
  }

  function startDrone() {
    if (drone) return;
    const t = ctx.currentTime, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 260;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 3);
    const oscs = [55, 55.7, 82.4].map((fr, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
    const high = ctx.createOscillator(), hg = ctx.createGain(); high.type = 'sine'; high.frequency.value = 1244; hg.gain.value = 0.012;
    high.connect(hg).connect(g); high.start();
    f.connect(g).connect(music);
    drone = { g, oscs: [...oscs, high] };
  }
  function stopDrone(fade = 0.4) {
    if (!drone) return;
    const t = ctx.currentTime, d = drone; drone = null;
    d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    d.oscs.forEach((o) => o.stop(t + fade + 0.1));
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    if (!ctx) return;
    step = 0; nextT = ctx.currentTime + 0.05;
    if (m === 'dread') startDrone(); else stopDrone(m === 'silent' ? 0.15 : 1.5);
  }

  // ---------- sound effects ----------
  function onEvent(e) {
    if (e.type === 'music') return setMode(e.mode);
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (e.type) {
      case 'swing': hiss(t, 0.12, 0.25, 'bandpass', 600, 2400, 1.2); break;
      case 'hit': if (e.foe === 'dummy') { tone('sine', 220, 120, t, 0.002, 0.1, 0.4); hiss(t, 0.1, 0.25, 'bandpass', 1500, 800, 1); } else { tone('sine', e.finisher ? 160 : 130, 45, t, 0.002, 0.16, 0.9); hiss(t, 0.08, 0.5, 'lowpass', 3000, 600); } break;
      case 'kill': tone('sine', 90, 30, t, 0.002, 0.35, 0.8); hiss(t, 0.3, 0.35, 'lowpass', 1800, 200); break;
      case 'block': tone('square', 880, 860, t, 0.001, 0.12, 0.12); tone('square', 1320, 1300, t, 0.001, 0.09, 0.08); break;
      case 'hurt': tone('sine', 110, 60, t, 0.002, 0.2, 0.7); hiss(t, 0.1, 0.3, 'bandpass', 900, 400, 1); break;
      case 'tap': tone('sine', 600, 500, t, 0.001, 0.06, 0.2); tone('sine', 300, 280, t, 0.001, 0.08, 0.2); break;
      case 'slam': tone('sine', 80, 25, t, 0.005, 0.8, 1); hiss(t, 0.6, 0.6, 'lowpass', 1500, 100); break;
      case 'windup': tone('sine', 300, 520, t, 0.05, 0.6, 0.05); break;
      case 'heroLand': tone('sine', 90, 35, t, 0.003, 0.5, 0.9); hiss(t, 0.4, 0.4, 'lowpass', 1200, 150); break;
      case 'talk': tone('sine', 660, 700, t, 0.005, 0.06, 0.06); break;
      case 'heal': [72, 76, 79, 84].forEach((m, i) => tone('sine', hz(m), hz(m), t + i * 0.07, 0.005, 0.4, 0.1)); break;
      case 'alarm': for (let i = 0; i < 4; i++) { tone('sine', 880, 878, t + i * 0.35, 0.002, 0.6, 0.18); tone('sine', 2210, 2205, t + i * 0.35, 0.002, 0.3, 0.06); } break;
      case 'victory': [67, 72, 76, 79, 84].forEach((m, i) => tone('triangle', hz(m), hz(m), t + i * 0.1, 0.01, 0.5, 0.12)); break;
      case 'cheers': hiss(t, 1.4, 0.25, 'bandpass', 1200, 900, 0.5); [72, 76, 79].forEach((m) => tone('triangle', hz(m), hz(m), t, 0.01, 1, 0.08)); break;
      case 'hush': tone('sine', 45, 30, t, 0.05, 2.5, 0.8); hiss(t, 3.5, 0.18, 'bandpass', 400, 200, 0.7); break; // pressure, then wind
      case 'zero': tone('sine', 1900, 1850, t, 0.001, 0.25, 0.08); tone('sine', 70, 60, t, 0.002, 0.12, 0.35); break;
      case 'land': tone('sine', 60, 25, t, 0.01, 2.2, 1); hiss(t, 2, 0.5, 'lowpass', 900, 60); break;
      case 'shock':
        tone('sine', 70, 18, t, 0.01, 3.5, 1); hiss(t, 3, 0.9, 'lowpass', 4000, 80);
        tone('sine', 3700, 3700, t + 0.6, 0.4, 5, 0.03); // ringing ears
        break;
      case 'guardBreak': for (let i = 0; i < 4; i++) hiss(t + i * 0.03, 0.15, 0.3, 'highpass', 5000, 3000); break;
      case 'card': if (e.card === 'to-be-continued') tone('sine', 65, 64, t, 0.5, 4, 0.4); break;
    }
  }

  return {
    unlock, onEvent, setMode,
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; },
    get running() { return !!ctx && ctx.state === 'running'; },
    get muted() { return muted; },
    get mode() { return mode; },
  };
}
