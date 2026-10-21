# Tidewell

Single-player 3D action game with a third-person camera (behind the hero and a little above). It is built with Three.js as plain browser ES modules, with no build step. Three.js is vendored in `vendor/` and loaded through an import map. "Tidewell" is the working title.

**The story.** A traveler falls from the sky into the seaside village of Tidewell. Bram teaches Strike and Guard in the training yard. You walk around and get to know the villagers. Bandits attack three times, each harder than the last: grunts at the east gate, brutes at the market, then Captain Gorr at the north gate. After each win, the villagers cheer and praise you. Then comes a festival in your honor at dusk. In the middle of it, with no warning, Vehl descends. Every hit on him does 0, one shockwave ("Kneel.") flattens the village and leaves you at 1 HP, and he leaves. The training act and the real fight with him are not built yet.

## Before every commit: run the verify skill

Run the `verify` skill (`.claude/skills/verify/SKILL.md`) after any change and **before every commit**. At a minimum, `npm run verify` (unit + intent tests and the headless-Chrome smoke test) must pass. The pre-commit hook and GitHub Actions enforce this. Never commit with `--no-verify`.

`main` is protected: changes land through a pull request from a branch, merged once the `verify` check is green. This is the same as Euro Rush. GitHub Pages serves `main`, so merging publishes the game.

## Design intent: don't drift from what the owner asked for

`tests/intent.test.js` locks in the owner's design decisions. After the first playtest, the owner asked for:

- **No spoilers.** Nothing before his arrival hints that he is coming: no ominous lines, no foreboding title, and the music doesn't fade early. The festival is still playing when he appears, and his name is only shouted once he is already in the sky. The title screen and the repo name say nothing either.
- **A slow, One Piece-style build-up.** You drop in from the sky, then a tutorial, then walking around and talking. The fights get harder: easy grunts, then brutes, then their captain. Villagers praise you after each win, then there is a celebration. A person takes roughly 5+ minutes to reach him.
- **Better-looking characters:** toon shading, ink outlines, painted faces, cloth textures, and jointed animation.
- **He beats you and disappears.**

Kept from the first version:

- It's single player for now (co-op may come later).
- The camera is third-person, behind and a little above.
- It's built with Three.js in the browser.
- Every hit on him does 0.
- One move wipes the village and leaves you alive.
- You keep control during his arrival.
- Strike and Guard are fundamentals.

**If an intent test fails, your change goes against a design decision.** Don't edit or delete the test to make it pass. Stop and ask the owner. Change the test only after they agree, and say in the commit/PR which decision changed.

Not decided or not built yet on purpose (don't add these without asking):

- The **third fundamental**. Flow (movement/redirect) is the current proposal.
- **Combination techniques**, in the Hunter x Hunter style of combining fundamentals as you train.
- The **training act** and the **final multi-phase fight**, where Vehl has rules that combos exploit.
- **Co-op** and **online play**.
- A final game name.

## Tests for new work

- New or changed rules or story beats (`src/sim.js`, `src/story.js`, `src/config.js`, `src/script.js`, `src/world.js`) need a test in `tests/sim.test.js`.
- `tests/bot.js` plays the whole game like a player: it follows objectives, routes around houses, talks, and fights. If you add an objective kind or a mechanic the bot can't handle, teach the bot, because the intent tests and the smoke test depend on it reaching the end.
- New screens or features need a check in `tests/smoke.mjs`.
- Visual changes also need a look at the smoke screenshots in `test-results/` and the manual browser steps in the verify skill, because the automated checks can't judge looks.
- **No-spoiler rule:** any new line spoken before the `arrival` phase must not mention him or foreshadow him. The intent test scans `script.js` for this.

## Layout

- `src/config.js`: tuning (player, strike, guard, foe types, fights, villain), phase lengths, camera, game title.
- `src/script.js`: every word in the game: the villagers (looks, routes, lines per story stage) and the timed story beats.
- `src/world.js`: the village layout (houses, stalls, trees, yard, places), collisions, and waypoint routing.
- `src/sim.js`: the core rules: movement, combat, foes, villagers, talking. Pure and deterministic, with a fixed 1/60 s step and a seeded RNG. Emits events each step.
- `src/story.js`: the phases (intro → tutorial → roam1 → fight1 → praise1 → roam2 → fight2 → praise2 → roam3 → fight3 → festival → arrival → defiance → judgement → aftermath → end, plus fallen), objectives, the tutorial, fights, and `skipStory` for `?phase=`.
- `src/characters.js`: toon character rigs, faces, hair, clothes, props, the villain model, and procedural posing (walk/run cycles, attacks, reactions).
- `src/textures.js`: every texture, drawn on canvases at startup (cloth, faces, plaster, roof tiles, grass, cobbles...).
- `src/village.js`: builds the village in Three.js from `world.js`, plus the festival decorations; everything the shockwave can throw.
- `src/render.js`: the scene, sky (day → dusk → eclipse), lights, actors, effects, particles and camera (chase, fight framing, story shots, crane over roofs). It only reads the sim; everything advances in `tick()` once per sim step.
- `src/hud.js`: the HTML overlay: HP, objective + marker, speech bubbles, talk prompt, key prompts, banners, boss bars, damage numbers, letterbox, and the title/pause/end screens.
- `src/audio.js`: synthesized WebAudio music (village, battle, boss, festival, dread, lament) and sounds.
- `src/input.js`: keyboard, mouse (pointer lock) and gamepad.
- `src/main.js`: game loop, camera steering, and the `window.__game.debug` API used by the tests.
