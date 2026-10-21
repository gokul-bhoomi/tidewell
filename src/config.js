// Tuning. Pure data, no browser APIs, so the sim and the tests can import it.
// The words live in script.js, the village layout in world.js.

export const STEP = 1 / 60; // fixed sim step (s)

// Working title. Deliberately says nothing about what happens later.
export const GAME_TITLE = 'TIDEWELL';
export const GAME_TAGLINE = 'A traveler falls from the sky into a little village by the sea.';

// The fundamentals the player trains. Strike and Guard so far; the third one is still being
// decided (Flow - movement/redirect - is the current proposal).
export const FUNDAMENTALS = ['strike', 'guard'];

export const PLAYER = {
  hp: 100, run: 7.2, walk: 2.6, radius: 0.45, turn: 14, hurtInvuln: 0.45, flinch: 0.2,
  regen: 6, // HP/s outside fights
  talkRange: 2.8, fallFrom: 26, fallTime: 1.35,
};

// Three-hit combo: jab, hook, spinning kick.
export const STRIKE = {
  windup: 0.09, recovery: 0.2, comboWindow: 0.34, // s
  range: 2.2, arcCos: Math.cos((75 * Math.PI) / 180),
  damage: [30, 30, 50], knock: [4, 4, 12], stagger: 0.35,
  assist: 5.5, lunge: 5,
  hitstop: 3, killHitstop: 6, moveFactor: 0.2,
};

export const GUARD = { moveFactor: 0.45, arcCos: 0.2, blockStagger: 0.7, heavyPush: 6 };

// poise 2 = only the finisher (third hit) staggers them; armor = can't be interrupted while winding up
export const FOES = {
  grunt: { hp: 60, speed: 3.3, radius: 0.45, reach: 1.6, windup: 0.75, recover: 0.5, damage: 8, cooldown: 1.4, knock: 4, poise: 0, engage: 17 },
  brute: { hp: 300, speed: 2.6, radius: 0.75, reach: 2.3, windup: 0.95, recover: 0.8, damage: 20, cooldown: 1.8, knock: 9, poise: 2, engage: 20, armor: true },
  captain: { hp: 560, speed: 3.1, radius: 0.85, reach: 2.5, windup: 0.8, recover: 0.6, damage: 16, cooldown: 1.2, knock: 8, poise: 2, engage: 20, armor: true,
    slam: { every: 3, windup: 1.3, radius: 3.8, damage: 22 } },
  sparrer: { hp: Infinity, speed: 0, radius: 0.45, reach: 2.4, windup: 1.2, recover: 0.6, damage: 0, cooldown: 1.6, knock: 2, poise: 9, engage: 4 },
  dummy: { hp: Infinity, speed: 0, radius: 0.4, poise: 9 },
};
export const MAX_ATTACKERS = 2;

// Who attacks where. `later` arrive mid-fight when `after` foes are down (or the captain is at half HP).
export const FIGHTS = {
  fight1: { at: 'eastGate', foes: ['grunt', 'grunt', 'grunt', 'grunt'] },
  fight2: { at: 'market', foes: ['grunt', 'grunt', 'grunt', 'brute', 'grunt'], later: { after: 3, foes: ['brute', 'grunt'], from: { x: 0, z: 44 } } },
  fight3: { at: 'northGate', foes: ['captain', 'grunt', 'grunt', 'grunt'], later: { captainHalf: true, foes: ['grunt', 'grunt', 'brute'], from: { x: 0, z: -45 } } },
};

export const VILLAIN = {
  name: 'VEHL', title: 'THE UNMOVED',
  radius: 0.9, height: 2.8, hoverY: 0.5, startY: 46, riseY: 4.5,
  landDist: 7.5, descendAt: 1.4, descendTime: 7.2,
  zeroHitsToJudge: 6, defianceMax: 18,
  recoil: 14,
  shockAt: 2.8, shockSpeed: 30, shockMax: 95,
};

// Phase lengths (s) for the phases that run on a timer.
export const PHASE_LEN = {
  intro: 14.2, praise: 7.5, festivalMax: 75, festivalAfterToast: 5.5, roamMax: 150, roam2Max: 35, roam3: 9,
  arrival: VILLAIN.descendAt + VILLAIN.descendTime, judgement: 7.5, aftermath: 14,
};

// Third-person camera: behind the character and a little above, looking slightly down.
export const CAM = { dist: 6.2, height: 3.0, lookHeight: 1.3, lookAhead: 2.2, fov: 58, keyTurn: 2.4, padTurn: 3.2, mouseTurn: 0.0032, mousePitch: 0.0026, padPitch: 1.6, pitchMin: -0.25, pitchMax: 0.75, follow: 1.4 };
