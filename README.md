# Boardly

Chess in your browser: play a friend on one screen, or play a Stockfish bot. Pure static site, no build step.

## Put it on GitHub Pages
1. Create a new repository and upload **everything in this folder** (keep the folder structure; include the hidden `.nojekyll` file).
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` and `/ (root)`.
3. Wait a minute. Your site is at `https://<your-username>.github.io/<repo-name>/`.

## Try it on your computer
Browsers block Web Workers on `file://`, so double-clicking `index.html` makes the bot fall back to a very basic brain. Run a tiny local server instead:

    python -m http.server 8000

then open http://localhost:8000.

## Folder map
- `index.html`, `css/style.css`: layout and look. Colors are CSS variables at the top of `style.css` (`--purple`, `--lt`, `--dk`...).
- `js/main.js`: pages (Home, Play, Settings), settings storage.
- `js/game.js`: board, moves, clocks, move list, result handling.
- `js/engine.js`: talks to Stockfish; difficulty to Elo mapping.
- `pieces/`: your piece SVGs (`wK.svg`, `bP.svg`, ...).
- `engine/`: Stockfish 19 lite (WebAssembly, single-threaded) from the `stockfish` npm package, GPLv3 (see `engine/Copying.txt`).
- `vendor/chess.js`: chess rules library (BSD-2).

## Notes
- Stockfish's own "Elo" limiter works from 1320 to 3190. Below 1320 the bot also plays a random legal move some of the time (up to ~60% at 400). At 3200 the limiter is off.
- Stockfish is GPLv3, so keep the repository public (or publish the source) when you host this.
- Settings, last-used game setup and your name are saved in the browser (`localStorage`).
