# Boardly  (v2.1)

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
- `js/create.js`, `js/pieceeditor.js`, `js/boardeditor.js`, `js/pixel.js`: the Create tab (lists, piece editor with drawing and movement patterns, board editor, import/export dialogs).
- `js/library.js`: custom pieces and boards (saved in `localStorage`), checks for imported files, export/import.
- `js/rules.js`: rules engine for custom boards and pieces. `js/custombot.js` + `js/botworker.js`: the bot for custom games (runs in a Web Worker).
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

## Custom boards, pieces and export files
- **Create → Export** saves one `.txt` named after the date and time (e.g. `2026-11-02_19-59-33.txt`). It is plain JSON containing every custom piece (name, letter, strength, royal/en passant/promotion options, both pictures, every move mark) and every custom board (size, shape, every placement).
- **Create → Import** accepts that file (drag it in or choose it). Items already in the library are skipped; if an id clashes with a different item, the import is added as a copy.
- Pieces are drawn on a 64×64 canvas, so files stay small. Uploaded images are shrunk to fit.
- Custom games have no castling. The bot in custom games is not Stockfish (it only knows normal chess); it uses its own search with the same Elo-style mistakes.

## Changelog
### v2.1
- Pieces are created in 4 steps (details, picture, movement with a live check, a test board with only that piece); boards in 3 steps (name and size, shape, pieces).
- Simpler wording and controls; advanced options are tucked into "More options".
- Custom gamemode opens as a popup where you pick the board and layout and can edit the position for that game, including positions that could never happen in a real game.
- Games can start already finished (for example a position that is checkmate); capturing a king ends the game.

### v2.0
- Create tab: custom pieces (draw or upload, movement patterns, royal, promotion, en passant) and custom boards (any shape up to 16×16, several piece placements each).
- Import / Export of all custom pieces and boards as one .txt file.
- Play: Gamemode "Custom" lets you pick a board and a placement, with friend or bot.

### v1.1
- 8 site themes (replace the purple) and 12 board themes.
- New synthesized sounds (wood-like piece clicks, bells) plus a volume slider.
- Time control popup with total-time and increment sliders, quick picks and a no-clock switch.
- Human-like low-Elo bot, now down to 100 Elo.
- Settings footer with version.

### v1.0
- First release.
