// Keyboard, mouse and gamepad. poll() returns the controls for this frame; presses that happened
// between frames are latched so a quick tap is never lost.
//
// Keyboard: WASD move, J / Space / left click strike, K / Shift / right click guard, E talk,
//           the mouse looks around (captured when the game starts or on click; Esc releases it),
//           Left/Right arrows also turn the camera,
//           Enter / Space confirm, Esc / P pause, M mute.
// Gamepad:  left stick move, right stick camera, A / X strike, B / LB / RB / LT guard, Y talk, Start pause.

const STRIKE_KEYS = ['KeyJ', 'Space'], GUARD_KEYS = ['KeyK', 'ShiftLeft', 'ShiftRight'];

export function createInput(canvas) {
  const down = new Set();
  const actions = [];
  let strikeLatch = false, talkLatch = false, mouseDX = 0, mouseDY = 0, mouseL = false, mouseR = false;
  let padPrev = [];

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    down.add(e.code);
    if (STRIKE_KEYS.includes(e.code)) strikeLatch = true;
    if (e.code === 'KeyE') talkLatch = true;
    if (e.code === 'Enter' || e.code === 'Space') actions.push('confirm');
    if (e.code === 'Escape' || e.code === 'KeyP') actions.push('pause');
    if (e.code === 'KeyM') actions.push('mute');
    if (e.code === 'KeyF') actions.push('fullscreen');
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); mouseL = mouseR = false; });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouseL = true; strikeLatch = true; }
    if (e.button === 2) mouseR = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mouseDX += e.movementX; mouseDY += e.movementY; } });

  const key = (...codes) => codes.some((c) => down.has(c));

  function poll() {
    let mx = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
    let my = (key('KeyW') ? 1 : 0) - (key('KeyS') ? 1 : 0);
    let cam = (key('ArrowRight') ? 1 : 0) - (key('ArrowLeft') ? 1 : 0);
    let talk = talkLatch || key('KeyE');
    let strike = strikeLatch || mouseL || key(...STRIKE_KEYS);
    let guard = mouseR || key(...GUARD_KEYS);
    let padCam = 0, padPitch = 0;
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    pads.forEach((p, i) => {
      const b = (n) => !!p.buttons[n]?.pressed;
      const prev = padPrev[i] || [];
      const pressed = (n) => b(n) && !prev[n];
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      mx += dz(p.axes[0] || 0); my -= dz(p.axes[1] || 0);
      if (b(14)) mx -= 1; if (b(15)) mx += 1; if (b(12)) my += 1; if (b(13)) my -= 1;
      padCam += dz(p.axes[2] || 0); padPitch += dz(p.axes[3] || 0);
      if (b(0) || b(2)) strike = true;
      if (b(1) || b(4) || b(5) || b(6)) guard = true;
      if (b(3)) talk = true;
      if (pressed(0)) actions.push('confirm');
      if (pressed(9)) actions.push('pause');
      padPrev[i] = p.buttons.map((x) => x.pressed);
    });
    const out = { mx, my, cam, padCam, padPitch, mouseDX, mouseDY, strike, guard, talk, actions: actions.splice(0), pads: pads.length };
    strikeLatch = false; talkLatch = false; mouseDX = 0; mouseDY = 0;
    return out;
  }

  return { poll, lockMouse: () => canvas.requestPointerLock?.()?.catch?.(() => {}) };
}
