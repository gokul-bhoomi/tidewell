# Tidewell

A traveler falls from the sky into a little village by the sea. Learn to fight in the training yard, get to know the villagers, and defend Tidewell from the bandits in the hills.

A single-player 3D action game that runs in the browser. Nothing to install and no build step.

## Run it locally

The game uses JavaScript modules, so it has to be served over HTTP. Opening `index.html` straight from disk won't work.

```bash
python3 -m http.server 5174
```

Then open **http://localhost:5174** in Chrome, Edge or Firefox. Press any key once to turn the sound on.

## Controls

| | Keyboard / mouse | Controller |
|---|---|---|
| Move | W A S D | Left stick |
| Strike (keep pressing for a 3-hit combo) | J, Space or left click | A or X |
| Guard (blocks hits from the front) | K, Shift or right click | B, LB, RB or LT |
| Talk | E | Y |
| Turn the camera | Left / Right arrows, or click to lock the mouse | Right stick |
| Pause | Esc or P | Start |
| Mute / fullscreen | M / F | |

## Development

```bash
npm install      # playwright-core for the browser test, and turns on the pre-commit hook
npm run verify   # unit + design-intent tests and a headless-Chrome playthrough
```

`?phase=` jumps to any part of the game (for example `?phase=tutorial`, `?phase=fight2`, `?phase=festival`), and `?play=1` skips the title. See `CLAUDE.md` for the layout and the rules for changes, and `src/story.js` for the full list of phases.

Three.js (MIT, see `vendor/THREE-LICENSE`) is vendored in `vendor/`.
