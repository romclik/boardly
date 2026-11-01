# Boardly  (v1.1)

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
- `js/engine.js`: talks to Stockfish; difficulty to Elo mapping and the human-like weak bot.
- `js/themes.js`: site themes and board themes (add a line to add a theme).
- `js/time.js`: time control helpers. `js/sound.js`: synthesized sounds.
- `pieces/`: your piece SVGs (`wK.svg`, `bP.svg`, ...).
- `engine/`: Stockfish 19 lite (WebAssembly, single-threaded) from the `stockfish` npm package, GPLv3 (see `engine/Copying.txt`).
- `vendor/chess.js`: chess rules library (BSD-2).

## Notes
- 1320 to 3190 Elo uses Stockfish's built-in limiter; 3200 turns it off.
- Below 1320 (down to 100) the bot searches shallowly for several candidate moves (MultiPV), then picks one that loses a limited amount of evaluation, with an occasional bigger blunder. Weaker = shallower search, bigger allowed mistakes, more blunders.
- Stockfish is GPLv3, so keep the repository public (or publish the source) when you host this.
- Settings, last-used game setup and your name are saved in the browser (`localStorage`).

## Changelog
### v1.1
- 8 site themes (replace the purple) and 12 board themes.
- New synthesized sounds (wood-like piece clicks, bells) plus a volume slider.
- Time control popup with total-time and increment sliders, quick picks and a no-clock switch.
- Human-like low-Elo bot, now down to 100 Elo.
- Settings footer with version.

### v1.0
- First release.
