// Popup for Custom games: choose a board and a starting layout, then edit the position
// for this one game. Anything goes: several kings, pawns on the last row, a king in check...
import { allBoards, boardById, pieceById, allPieces } from './library.js';
import { createGrid, setPiece, rowsToBool } from './boardview.js';
import { modal, esc, toast } from './ui.js';

const sortKey = (l) => JSON.stringify([...l].map((e) => e.join()).sort());

export function openCustomSetup({ boardId, setupId, pieces, rules = {} }, onApply) {
  let board = boardById(boardId) || allBoards()[0];
  let setup = board.setups.find((s) => s.id === setupId) || board.setups[0];
  let list = pieces ? structuredClone(pieces) : structuredClone(setup.pieces);
  const tool = { mode: 'place', color: 'w', piece: allPieces()[0]?.id, sel: null };
  const rule = { kingCapture: !!rules.kingCapture, noDraw: !!rules.noDraw };

  const root = document.createElement('div');
  root.className = 'cs';
  root.innerHTML = `
    <div class="cs-left"><div class="be-stage" id="cs-stage"></div><p class="hint" id="cs-info"></p></div>
    <div class="cs-right">
      <div class="ctl"><span class="lbl">Board</span><select id="cs-board" class="plain-select"></select></div>
      <div class="ctl"><span class="lbl">Starting layout</span>
        <div class="ctl row"><select id="cs-setup" class="plain-select"></select><button type="button" class="btn ghost sm" id="cs-reset">Reset to layout</button></div></div>
      <div class="ctl"><span class="lbl">Edit the position (only for this game)</span>
        <div class="seg" id="cs-mode" role="radiogroup"><button type="button" role="radio" data-v="place" aria-checked="true">Place</button><button type="button" role="radio" data-v="move" aria-checked="false">Move</button><button type="button" role="radio" data-v="erase" aria-checked="false">Erase</button></div></div>
      <div id="cs-place">
        <div class="seg" id="cs-color" role="radiogroup"><button type="button" role="radio" data-v="w" aria-checked="true">White</button><button type="button" role="radio" data-v="b" aria-checked="false">Black</button></div>
        <div class="palette" id="cs-pal"></div>
      </div>
      <button type="button" class="chip" id="cs-clear">Clear the board</button>
      <div class="ctl cs-rules"><span class="lbl">Rules</span>
        <label class="opt"><input type="checkbox" id="cs-kc"><span><b>King capture</b><small>No check, checkmate or stalemate. You may move into check, and whoever captures a king wins. A side with no moves skips its turn.</small></span></label>
        <label class="opt"><input type="checkbox" id="cs-nd"><span><b>No draws</b><small>Turns off threefold repetition, the 50-move rule, draw by too few pieces and draw offers. Stalemate still ends the game, unless King capture is on.</small></span></label>
      </div>
      <p class="hint">Anything goes: you can set up positions that could never happen in a normal game. Changes here are not saved to the board. Right-click removes a piece.</p>
    </div>`;
  const $ = (s) => root.querySelector(s);

  const m = modal({
    title: 'Custom game', content: root, wide: true,
    actions: [
      { label: 'Cancel' },
      { label: 'Use this setup', kind: 'primary', keepOpen: true, run: (close) => {
        if (!list.some((e) => e[3] === 'w') || !list.some((e) => e[3] === 'b')) { toast('Both White and Black need at least one piece.'); return; }
        onApply({ boardId: board.id, setupId: setup.id, pieces: list, edited: sortKey(list) !== sortKey(setup.pieces), rules: { ...rule } });
        close();
      } },
    ],
  });
  m.el.querySelector('.modal-card').classList.add('xl');

  const dark = (x, y, h) => (x + (h - 1 - y)) % 2 === 0;
  function drawGrid() {
    const { w, h } = board;
    const cells = rowsToBool(board.cells);
    const px = Math.max(24, Math.min(54, Math.floor(Math.min(480, window.innerWidth - 96) / Math.max(w, h))));
    const g = createGrid({ w, h, cells, cell: px });
    g.el.classList.add('editing');
    list = list.filter(([x, y]) => x < w && y < h && cells[y][x]);
    for (const [x, y, id, c] of list) { const p = pieceById(id); if (p) setPiece(g.at(x, y), p.img[c], p.name); }
    if (tool.sel) { const [sx, sy] = tool.sel; g.at(sx, sy)?.classList.add('picked'); }
    g.el.addEventListener('contextmenu', (e) => e.preventDefault());
    g.el.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.mc');
      if (!el || el.classList.contains('void')) return;
      e.preventDefault();
      const x = +el.dataset.x, y = +el.dataset.y;
      const at = list.findIndex((p) => p[0] === x && p[1] === y);
      const mode = e.button === 2 ? 'erase' : tool.mode;
      if (mode === 'erase') { if (at >= 0) list.splice(at, 1); tool.sel = null; }
      else if (mode === 'place') {
        if (at >= 0) list.splice(at, 1);
        list.push([x, y, tool.piece, tool.color]);
      } else if (mode === 'move') {
        if (tool.sel && !(tool.sel[0] === x && tool.sel[1] === y)) {
          const from = list.findIndex((p) => p[0] === tool.sel[0] && p[1] === tool.sel[1]);
          if (from >= 0) {
            const piece = list[from];
            const target = list.findIndex((p) => p[0] === x && p[1] === y);
            if (target >= 0) list.splice(target, 1);
            const f2 = list.indexOf(piece);
            list[f2] = [x, y, piece[2], piece[3]];
          }
          tool.sel = null;
        } else tool.sel = at >= 0 && !(tool.sel && tool.sel[0] === x && tool.sel[1] === y) ? [x, y] : null;
      }
      drawGrid();
    });
    $('#cs-stage').replaceChildren(g.el);
    const wc = list.filter((e) => e[3] === 'w').length, bc = list.filter((e) => e[3] === 'b').length;
    $('#cs-info').textContent = `${w} × ${h} board · White ${wc} piece${wc === 1 ? '' : 's'} · Black ${bc} piece${bc === 1 ? '' : 's'}${sortKey(list) !== sortKey(setup.pieces) ? ' · edited' : ''}`;
  }
  function drawPalette() {
    $('#cs-pal').innerHTML = allPieces().map((q) => `<button type="button" class="pal" data-id="${esc(q.id)}" aria-pressed="${tool.piece === q.id}" title="${esc(q.name)}"><img src="${esc(q.img[tool.color])}" alt="${esc(q.name)}"></button>`).join('');
  }
  function fillSelects() {
    $('#cs-board').innerHTML = allBoards().map((b) => `<option value="${esc(b.id)}"${b.id === board.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
    $('#cs-setup').innerHTML = board.setups.map((s) => `<option value="${esc(s.id)}"${s.id === setup.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  }

  $('#cs-board').addEventListener('change', (e) => {
    board = boardById(e.target.value); setup = board.setups[0]; list = structuredClone(setup.pieces); tool.sel = null;
    fillSelects(); drawGrid();
  });
  $('#cs-setup').addEventListener('change', (e) => {
    setup = board.setups.find((s) => s.id === e.target.value) || board.setups[0]; list = structuredClone(setup.pieces); tool.sel = null; drawGrid();
  });
  $('#cs-reset').addEventListener('click', () => { list = structuredClone(setup.pieces); tool.sel = null; drawGrid(); });
  $('#cs-clear').addEventListener('click', () => { list = []; tool.sel = null; drawGrid(); });
  $('#cs-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    tool.mode = b.dataset.v; tool.sel = null;
    $('#cs-mode').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', x === b));
    $('#cs-place').hidden = tool.mode !== 'place';
    drawGrid();
  });
  $('#cs-color').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    tool.color = b.dataset.v;
    $('#cs-color').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', x === b));
    drawPalette();
  });
  $('#cs-pal').addEventListener('click', (e) => {
    const b = e.target.closest('.pal'); if (!b) return;
    tool.piece = b.dataset.id;
    $('#cs-pal').querySelectorAll('.pal').forEach((x) => x.setAttribute('aria-pressed', x === b));
  });
  $('#cs-kc').checked = rule.kingCapture;
  $('#cs-nd').checked = rule.noDraw;
  $('#cs-kc').addEventListener('change', (e) => { rule.kingCapture = e.target.checked; });
  $('#cs-nd').addEventListener('change', (e) => { rule.noDraw = e.target.checked; });
  fillSelects(); drawPalette(); drawGrid();
}
