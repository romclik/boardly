# Boardly

Chess in your browser. Play a friend on one screen, or play a bot, on the classic board or on boards and pieces you design yourself.

## What you can do
- **Play with a friend** on one screen, or **with a bot** from 100 to 3200 Elo.
- **Classic** or **Custom** gamemode, with a time control you set with total time and increment sliders.
- **Create** your own pieces (draw or upload a picture, set how they move) and boards (any shape up to 16×16, with piece layouts).
- **Draw arrows and mark squares** on the board like on chess.com: right-click a square to mark it, right-click and drag for an arrow. Hold Ctrl, Alt or Shift for other colors. A left-click clears everything.
- **Review the game** while you play: step back and forward through the moves with buttons, the arrow keys, or by clicking a move.
- **Home page** with quick-start tiles, your stats, recent games and a tip of the day.
- **Themes**: 8 site colors and 12 board styles chosen from dropdowns, plus sound effects with a volume slider.
- **Import / Export** everything you create as one text file.

## Notes
- The classic bot is [Stockfish](https://stockfishchess.org/) 19 (lite, WebAssembly). From 1320 to 3190 Elo it uses Stockfish's own strength limiter; 3200 is full strength. Below 1320 it searches shallowly and picks from several candidate moves, with small mistakes and an occasional blunder, so weaker settings play more like a beginner than like a random mover.
- Custom games use Boardly's own rules engine and bot (Stockfish only knows normal chess). The bot follows the same Elo slider but is weaker than Stockfish at the top end.
- Custom games have no castling. En passant and promotion work for pieces that have those options turned on.
- In a Custom game you can edit the starting position for that game, including positions that could never happen in real chess. A side that loses its royal piece loses the game.
- Custom game rules (in the Custom popup): **King capture** removes check, checkmate and stalemate. You can move into check, whoever captures a king wins, and a side with no moves skips its turn. **No draws** turns off threefold repetition, the 50-move rule, draw by too few pieces and draw offers. Stalemate still ends the game as a draw unless King capture is on.
- Drawing on the board: right-click a square for a red mark (Ctrl yellow, Alt blue, Shift green). Right-click and drag for an arrow: yellow by default (Ctrl red, Alt blue, Shift green). Knight-shaped drags make L-shaped arrows. Drawings disappear on a left-click, on the next move, or with Escape. On touch screens use the "Draw" button under the move list and drag with a finger.
- Settings, your stats, your pieces and your boards are stored in your browser. Clearing site data removes them, so use Export for a backup.
- Third-party code: Stockfish (GPLv3, see `engine/Copying.txt`) and chess.js (BSD-2, see `vendor/chess.js.LICENSE`).

## Custom boards, pieces and export files
- **Create → Export** saves one `.txt` named after the date and time (for example `2026-11-02_19-59-33.txt`). It is plain JSON containing every custom piece (name, letter, strength, royal / en passant / promotion options, both pictures and every move mark) and every custom board (size, shape and every layout).
- **Create → Import** accepts that file, by drag and drop or the file chooser. It shows what it found before adding anything. Items you already have are skipped, and if an id clashes with a different item the import is added as a copy.
- A piece is made in four steps: details, picture, movement (with a live check) and a test board. A board is made in three: name and size, shape and piece layouts.
- Pictures are drawn on a 64×64 canvas so files stay small. Uploaded images are shrunk to fit.
- In **Play → Gamemode → Custom** you pick a board and a layout, and can move, add or remove pieces for that game only.

## Changelog
### v2.3
- Custom games: **King capture** and **No draws** options in the Custom popup.
- Arrows and highlighted squares on the board (right-click, like chess.com), plus a "Draw" button for touch screens.
- Fixed: the time control popup did not open on the Play page (a handler was lost in v2.1).

### v2.2
- The black piece that Boardly makes automatically now inverts the colors of the white piece instead of darkening it.
- Move browsing during and after a game: first / previous / next / current buttons, Left / Right / Home / End keys, and clickable moves in the list. The board is read-only while you look at an earlier position.
- Settings are grouped into Profile, Appearance, Sound and Gameplay. Site theme and board theme are now dropdowns with color swatches, with a small live preview.
- New Home page: hero banner, quick-start tiles (Bot, Friend, Custom, Create), your stats, recent games, tip of the day and a shortcut to your creations.

### v2.1.1
- Fixed: the piece name field in the creator was almost invisible, so nothing could be typed in it.
- Fixed: black bars above the move-hint squares on the board (a style clash gave those squares an extra top margin).
- Picture step: all drawing tools are now visible, plus new Line, Rectangle, Circle, "Fill shapes", "Mirror while drawing" and Flip ↕.

### v2.1
- Pieces are created in 4 steps and boards in 3, with simpler wording; advanced options live under "More options".
- Custom gamemode opens as a popup where you pick the board and layout and edit the position for that game, including illegal positions.
- Games can start already finished; capturing a king ends the game.

### v2.0
- Create tab: custom pieces and custom boards, Import / Export, and the Custom gamemode.

### v1.1
- 8 site themes and 12 board themes, new synthesized sounds with volume, time-control popup with sliders, human-like low-Elo bots (down to 100 Elo).

### v1.0
- First release: play with a friend or a Stockfish bot, classic rules.
