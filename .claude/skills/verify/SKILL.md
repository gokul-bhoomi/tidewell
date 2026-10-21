---
name: verify
description: Verify a change to Tidewell actually works - run the sim + design-intent tests and the headless-Chrome playthrough, launch the game in the browser pane, drive it through its debug API (landing, tutorial, talking, the three fights, the festival, his arrival, the 0-damage hits, the shockwave, the end card, pause), check for console errors, look at screenshots, and report what passed and what could not be checked. Use after any change to the game, before every commit, and before telling the user something works.
---

# Verify Tidewell

The game is this repo (Three.js, plain ES modules, no build step; run commands from the repo root). `src/sim.js` + `src/story.js` are pure and deterministic, so rules and story are tested in Node. Everything else is checked in the browser through `window.__game.debug`.

Do every step below, in order, unless it clearly cannot be affected by the change. Never report a step as passed that you did not run.

## 1. Automated checks (required before every commit)

```bash
npm install      # once: installs playwright-core and turns on the pre-commit hook
npm run verify   # unit + intent tests (tests/*.test.js) + headless-Chrome playthrough (tests/smoke.mjs, ~2 min)
```

Both must pass. The pre-commit hook (`.githooks/pre-commit`) runs the same checks and blocks the commit if they fail, and GitHub Actions (`.github/workflows/verify.yml`) runs them on every push and pull request. Never bypass them with `--no-verify`.

- **Intent tests** (`tests/intent.test.js`) encode the owner's design decisions, most importantly **no spoilers** and the **slow build-up**. If one fails, don't change the test to make it pass. Report which decision the change breaks and ask the owner; update the test only after they agree.
- Changed or added rules or story beats? **Add or update a test in `tests/sim.test.js` first** and make sure it fails without your change.
- `tests/bot.js` plays the whole game. If your change adds something it can't do (a new objective kind, a new mechanic), teach it.
- Added a screen, story beat or visible feature? **Add a check to `tests/smoke.mjs`.** `d.step(n)` draws once after n steps and `d.play(bot, n, until)` runs the bot without drawing, because software WebGL is slow. Draw only when you need a picture.

The smoke test saves a screenshot of every stage to `test-results/` (01-title ... 15-end). **Open them and look**, because the checks cannot judge framing or looks.

## 2. Launch

- `preview_start` with name `the-arrival` (defined in `.claude/launch.json`; serves the repo on port 5174). If something is already serving port 5174, open `http://localhost:5174/` with `preview_start` `url` instead.
- URL params: `?play=1` (skip the title), `?phase=<any phase>` (`tutorial`, `roam1`, `fight1`, `praise1`, `roam2`, `fight2`, `praise2`, `roam3`, `fight3`, `festival`, `arrival`, `defiance`, `judgement`, `aftermath`, `end`), `&seed=7`, `&pause=1` (start with the loop frozen), `&mute=1`.
- The browser caches ES modules. After editing, force fresh copies before reloading: `for (const f of [...]) await fetch('/src/' + f + '.js', { cache: 'reload' })`. Otherwise you can get a mix of old and new modules.

## 3. Drive it through the debug API

The browser pane is often hidden, which throttles timers. **Freeze the loop and step by hand:**

```js
const d = __game.debug;
d.pause();                      // freeze the real-time loop
d.step(60);                     // 60 sim steps (1 s), reading real input each step, then draw once
const bot = (await import('/tests/bot.js')).makeBot();
d.play(bot, 60 * 30, (g) => g.phase === 'fight1'); // let the test bot play (no drawing) until a condition
d.setInput({ mx: 0, mz: -1, strike: true, guard: false, talk: false }); // world-space sim input; d.clearInput()
d.press('confirm');             // confirm / pause / mute
d.start({ seed: 7, phase: 'festival' });  // new game, optionally at a phase
d.set({ x: 0, z: 6, hp: 5 });   // poke player fields
d.game();                       // the live sim state (read only)
d.snapshot();                   // { screen, paused, audio, hud: {line, bubbles, banner, card, objective, marker, talk, keys, numbers, letterbox}, view: {cam, blown, pieces, calls}, game: {phase, stage, objective, prompt, near, tut, player, foes, npcs, villain, shock, sky, dusk, music} }
__game.errors;                  // uncaught errors from the loop - must be []
```

World units are about a metre. North is -z. The plaza is around (0, 0) with the well in the middle. The yard is west (-27, 13), the east gate is at (38, 0), the market is south (0, 31), and the north gate is at (0, -36).

### Scenarios (run the ones the change could touch; all of them for big changes)

1. **Title**: `screen: 'title'`, the village orbiting, and the title text says nothing about him.
2. **Landing**: Enter → the hero falls (`player.y` > 0) and lands with dust. The Elder and Pip react in speech bubbles, and the Elder sends you to Bram.
3. **Tutorial**: yard → hit 3 dummies (J prompt) → combo (J J J) → block Bram twice (K prompt; he winds up slowly and never hurts) → `roam1`.
4. **Roaming and talking**: villagers walk their routes. Next to one, the "E Talk to NAME" prompt shows; E → a speech bubble above them. 4 talks → Gil's alarm → `fight1`.
5. **Fights**: villagers hide. Fight 1 is 4 grunts (easy). Fight 2 is grunts + brutes (armored windups, heavy blocks push you back) + a second brute mid-fight. Fight 3 is Gorr (boss bar, ground slam ring you walk out of) + reinforcements at half HP. After each fight: VICTORY, villagers crowd round cheering and praise you, then talk to Toma or Mira (healing).
6. **Festival**: dusk, lanterns and bunting, everyone dancing in the plaza, festival music. Talk to Toma → toast → CHEERS!!
7. **Arrival**: the music stops dead, the sky turns red with an eclipse, the letterbox comes in, everyone freezes, and he descends slowly in a beam. Pip, then Toma, then Toma shouts "VEHL THE UNMOVED!" The camera is low, looking up, with you on the left. You can still move.
8. **Defiance/judgement/aftermath/end**: every hit is a big grey 0. "Kneel." → white flash and a shockwave that throws every house, stall, tree and villager → you're at 1 HP → his two lines → he rises into the beam and is gone → TO BE CONTINUED. Enter restarts at the landing with the village rebuilt.
9. **Knocked out**: 0 HP in a fight → KNOCKED OUT card → Enter retries that fight at full HP.
10. **Pause**: Esc → `paused: true`, game time frozen; Enter or Esc resumes.

## 4. Look at it

Show the Browser pane first (`show_pane` preview), because a hidden pane can screenshot a stale frame. Check:

- characters have outlines, faces, clothes and hair, and nothing is floating or clipping badly
- the camera frames the action (it eases toward enemies in fights and cranes over roofs instead of crashing into your back)
- HUD: HP and objective top-left, the marker on the target, bubbles above the speaker, the boss bar at the bottom, and nothing hidden under the letterbox
- the change you made is visible (freeze with `d.pause()` and step to catch the moment)

Then `read_console_messages` with `onlyErrors: true` and confirm `__game.errors` is still `[]`. Rendering cost: `d.step(1)` timed over 30 calls should stay well under 16 ms.

## 5. What you cannot verify here (say so in the report)

- **Sound/music**: needs a real key press; then `snapshot().audio.running` is `true`. You cannot hear it, so ask the user to listen (village tune, alarm bell, battle and boss drums, festival dance, the sudden silence, the low drone, the shockwave boom).
- **Feel**: pacing, hit-stop, camera comfort, whether the build-up feels long enough and the arrival feels shocking. Ask the user to play it.
- **Gamepads, pointer lock and fullscreen** need real devices or gestures.

## 6. Report

Short list: each step → passed / failed / not run (and why). For failures include the `snapshot()` JSON, the console error and a screenshot.
