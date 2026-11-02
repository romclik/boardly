import { allPieces, pieceById, boardById, saveBoard, uid, MAX_SIZE, CLASSIC_BOARD } from './library.js';
import { createGrid, setPiece, rowsToBool, boolToRows } from './boardview.js';
import { esc, toast, modal } from './ui.js';

function promptName(title, value, onOk) {
  const input = document.createElement('input');
  input.className = 'text';
  input.maxLength = 40;
  input.value = value;
  const m = modal({
    title, content: input,
    actions: [{ label: 'Cancel' }, { label: 'OK', kind: 'primary', run: () => { const v = input.value.trim(); if (v) onOk(v.slice(0, 40)); } }],
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { m.buttons[1].click(); } });
  input.focus(); input.select();
}

const shapes = {
  rect: () => true,
  cross: (x, y, w, h) => {
    const bw = Math.max(1, Math.round(w / 3)), bh = Math.max(1, Math.round(h / 3));
    const x0 = Math.floor((w - bw) / 2), y0 = Math.floor((h - bh) / 2);
    return (x >= x0 && x < x0 + bw) || (y >= y0 && y < y0 + bh);
  },
  circle: (x, y, w, h) => ((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 <= 1.02,
  diamond: (x, y, w, h) => Math.abs(x + 0.5 - w / 2) / (w / 2) + Math.abs(y + 0.5 - h / 2) / (h / 2) <= 1.02,
  donut: (x, y, w, h) => !(Math.abs(x + 0.5 - w / 2) < w * 0.2 && Math.abs(y + 0.5 - h / 2) < h * 0.2),
  triangle: (x, y, w, h) => Math.abs(x + 0.5 - w / 2) <= ((y + 1) / h) * (w / 2) + 0.01,
};

export function boardEditor(view, id) {
  const existing = id && id !== 'new' ? boardById(id) : null;
  if (existing?.builtin) { location.hash = '#/create'; return; }
  const b = existing ? structuredClone(existing)
    : { id: uid('b'), name: '', w: 8, h: 8, cells: Array(8).fill('11111111'), setups: [{ id: uid('s'), name: 'Setup 1', pieces: [] }] };
  let { w, h } = b;
  let cells = rowsToBool(b.cells);
  const setups = b.setups;
  let cur = 0;
  let tab = 'shape';
  const tool = { shape: 'paint', piece: allPieces()[0]?.id, color: 'w', erase: false };
  let grid = null;

  view.innerHTML = `
    <div class="editor">
      <div class="ed-head">
        <a class="back" href="#/create">← Back</a>
        <h1 class="page-title">${existing ? 'EDIT BOARD' : 'NEW BOARD'}</h1>
        <div class="ed-head-actions"><a class="btn ghost" href="#/create">Cancel</a><button class="btn primary" id="save">Save board</button></div>
      </div>
      <div class="ed-cols be">
        <section class="card">
          <label class="fld"><span>Board name</span><input class="text" id="be-name" maxlength="40" placeholder="e.g. Crossroads" autocomplete="off"></label>
          <div class="be-stage" id="be-stage"></div>
          <p class="hint" id="be-info"></p>
        </section>
        <section class="card">
          <div class="seg" id="be-tabs" role="tablist" aria-label="Editor section">
            <button type="button" role="tab" data-v="shape" aria-checked="true">Shape</button>
            <button type="button" role="tab" data-v="setup" aria-checked="false">Piece placement</button>
          </div>
          <div id="be-panel"></div>
        </section>
      </div>
    </div>`;
  const $ = (s) => view.querySelector(s);
  $('#be-name').value = b.name;
  $('#be-name').addEventListener('input', (e) => { b.name = e.target.value; });

  const dark = (x, y) => (x + (h - 1 - y)) % 2 === 0;
  const cellClass = (x, y) => 'mc ' + (cells[y][x] ? (dark(x, y) ? 'dark' : 'light') : 'void ghost');
  const prune = () => {
    setups.forEach((s) => { s.pieces = s.pieces.filter(([x, y]) => x < w && y < h && cells[y]?.[x]); });
  };
  const playableCount = () => cells.flat().filter(Boolean).length;

  function drawGrid() {
    const cell = Math.max(20, Math.min(56, Math.floor(620 / Math.max(w, h))));
    grid = createGrid({ w, h, cells, cell, ghost: true });
    grid.el.classList.add('editing');
    paintPieces();
    $('#be-stage').replaceChildren(grid.el);
    bindGrid();
    info();
  }
  function paintPieces() {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid.at(x, y).querySelector('img.pc')?.remove();
    if (tab !== 'setup') return;
    for (const [x, y, pid, c] of setups[cur].pieces) {
      const p = pieceById(pid);
      if (p && grid.at(x, y)) setPiece(grid.at(x, y), p.img[c], p.name);
    }
  }
  function info() {
    const n = playableCount();
    let t = `${w} × ${h} board · ${n} square${n === 1 ? '' : 's'}`;
    if (tab === 'setup') {
      const ps = setups[cur].pieces;
      const wc = ps.filter((e) => e[3] === 'w').length, bc = ps.filter((e) => e[3] === 'b').length;
      t += ` · White ${wc} piece${wc === 1 ? '' : 's'} · Black ${bc} piece${bc === 1 ? '' : 's'}`;
      if (!wc || !bc) t += ' (both sides need pieces to play)';
    }
    $('#be-info').textContent = t;
  }

  // ---------- painting on the grid ----------
  function applyAt(el, rightClick) {
    const x = +el.dataset.x, y = +el.dataset.y;
    if (tab === 'shape') {
      const on = tool.shape === 'paint';
      if (cells[y][x] === on) return;
      cells[y][x] = on;
      el.className = cellClass(x, y);
      if (!on) { prune(); }
      info();
    } else {
      if (!cells[y][x]) return;
      const list = setups[cur].pieces;
      const i = list.findIndex((e) => e[0] === x && e[1] === y);
      if (rightClick || tool.erase) { if (i >= 0) list.splice(i, 1); setPiece(el, null); }
      else {
        if (i >= 0) list.splice(i, 1);
        list.push([x, y, tool.piece, tool.color]);
        const p = pieceById(tool.piece);
        setPiece(el, p?.img[tool.color], p?.name);
      }
      info();
    }
  }
  let down = false, last = null;
  window.addEventListener('pointerup', () => { down = false; last = null; });
  window.addEventListener('pointercancel', () => { down = false; last = null; });
  function bindGrid() {
    grid.el.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.el.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.mc');
      if (!el) return;
      e.preventDefault();
      down = e.button === 2 ? 'right' : true;
      last = el;
      applyAt(el, e.button === 2);
    });
    grid.el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.mc');
      if (el && el !== last && grid.el.contains(el)) { last = el; applyAt(el, down === 'right'); }
    });
  }

  // ---------- panels ----------
  function resize(nw, nh) {
    const next = Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) => (cells[y]?.[x] ?? true)));
    w = nw; h = nh; cells = next;
    prune();
    drawGrid();
  }
  function applyShape(kind) {
    cells = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => shapes[kind](x, y, w, h)));
    if (!playableCount()) cells[0][0] = true;
    prune(); drawGrid();
  }

  function shapePanel() {
    const p = $('#be-panel');
    p.innerHTML = `
      <div class="ctl"><span class="lbl">Width <output id="o-w">${w}</output></span><div class="range plain"><input id="r-w" type="range" min="1" max="${MAX_SIZE}" value="${w}" aria-label="Width"></div></div>
      <div class="ctl"><span class="lbl">Height <output id="o-h">${h}</output></span><div class="range plain"><input id="r-h" type="range" min="1" max="${MAX_SIZE}" value="${h}" aria-label="Height"></div></div>
      <div class="ctl"><span class="lbl">Brush</span>
        <div class="seg" id="sh-tool" role="radiogroup"><button type="button" role="radio" data-v="paint" aria-checked="${tool.shape === 'paint'}">Add squares</button><button type="button" role="radio" data-v="erase" aria-checked="${tool.shape === 'erase'}">Remove squares</button></div>
        <small class="hint2">Click or drag on the board.</small></div>
      <div class="ctl"><span class="lbl">Quick shapes</span><div class="chips" id="sh-shapes">
        ${[['rect', 'Rectangle'], ['cross', 'Cross'], ['circle', 'Circle'], ['diamond', 'Diamond'], ['donut', 'Donut'], ['triangle', 'Triangle']].map(([k, l]) => `<button type="button" class="chip" data-k="${k}">${l}</button>`).join('')}</div></div>
      <div class="ctl"><span class="lbl">Tools</span><div class="chips">
        <button type="button" class="chip" data-t="mirror">Mirror left → right</button>
        <button type="button" class="chip" data-t="flipv">Mirror top → bottom</button>
        <button type="button" class="chip" data-t="invert">Invert</button></div></div>`;
    const rw = p.querySelector('#r-w'), rh = p.querySelector('#r-h');
    const track = (r) => r.parentElement.style.setProperty('--pct', (r.value - 1) / (MAX_SIZE - 1));
    [rw, rh].forEach(track);
    rw.addEventListener('input', () => { track(rw); p.querySelector('#o-w').textContent = rw.value; resize(+rw.value, h); });
    rh.addEventListener('input', () => { track(rh); p.querySelector('#o-h').textContent = rh.value; resize(w, +rh.value); });
    p.querySelector('#sh-tool').addEventListener('click', (e) => {
      const bt = e.target.closest('button'); if (!bt) return;
      tool.shape = bt.dataset.v;
      p.querySelectorAll('#sh-tool button').forEach((x) => x.setAttribute('aria-checked', x === bt));
    });
    p.querySelector('#sh-shapes').addEventListener('click', (e) => { const k = e.target.closest('[data-k]')?.dataset.k; if (k) applyShape(k); });
    p.querySelectorAll('[data-t]').forEach((bt) => bt.addEventListener('click', () => {
      const t = bt.dataset.t;
      if (t === 'mirror') cells = cells.map((r) => r.map((_, x) => (x < w / 2 ? r[x] : r[w - 1 - x])));
      if (t === 'flipv') cells = cells.map((r, y) => (y < h / 2 ? r : cells[h - 1 - y].slice()));
      if (t === 'invert') cells = cells.map((r) => r.map((c) => !c));
      if (!playableCount()) cells[0][0] = true;
      prune(); drawGrid();
    }));
  }

  function setupPanel() {
    const p = $('#be-panel');
    p.innerHTML = `
      <div class="ctl"><span class="lbl">Placement</span>
        <div class="ctl row"><select id="su-sel" class="plain-select">${setups.map((s, i) => `<option value="${i}"${i === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          <button type="button" class="btn ghost sm" data-a="new">New</button><button type="button" class="btn ghost sm" data-a="dup">Duplicate</button>
          <button type="button" class="btn ghost sm" data-a="ren">Rename</button><button type="button" class="btn ghost sm" data-a="del"${setups.length < 2 ? ' disabled' : ''}>Delete</button></div>
        <small class="hint2">A board can have several starting layouts. You pick one when you play.</small></div>
      <div class="ctl"><span class="lbl">Place</span>
        <div class="seg" id="su-color" role="radiogroup"><button type="button" role="radio" data-v="w" aria-checked="${tool.color === 'w'}">White</button><button type="button" role="radio" data-v="b" aria-checked="${tool.color === 'b'}">Black</button></div></div>
      <div class="palette" id="su-pal">${allPieces().map((q) => `<button type="button" class="pal" data-id="${esc(q.id)}" aria-pressed="${!tool.erase && tool.piece === q.id}" title="${esc(q.name)}"><img src="${esc(q.img[tool.color])}" alt="${esc(q.name)}"></button>`).join('')}
        <button type="button" class="pal eraser" id="su-erase" aria-pressed="${tool.erase}" title="Eraser">✕</button></div>
      <small class="hint2">Click or drag on the board to place. Right-click removes a piece.</small>
      <div class="ctl"><span class="lbl">Quick tools</span><div class="chips">
        <button type="button" class="chip" data-q="flip">Copy White → Black (flip)</button>
        <button type="button" class="chip" data-q="rot">Copy White → Black (rotate)</button>
        <button type="button" class="chip" data-q="clearb">Clear Black</button>
        <button type="button" class="chip" data-q="clear">Clear all</button>
        ${w === 8 && h === 8 && cells.flat().every(Boolean) ? '<button type="button" class="chip" data-q="std">Standard chess layout</button>' : ''}</div></div>`;
    p.querySelector('#su-sel').addEventListener('change', (e) => { cur = +e.target.value; paintPieces(); info(); });
    p.querySelectorAll('[data-a]').forEach((bt) => bt.addEventListener('click', () => {
      const a = bt.dataset.a;
      if (a === 'new') promptName('New placement', `Setup ${setups.length + 1}`, (n) => { setups.push({ id: uid('s'), name: n, pieces: [] }); cur = setups.length - 1; setupPanel(); paintPieces(); info(); });
      if (a === 'dup') promptName('Duplicate placement', `${setups[cur].name} copy`, (n) => { setups.push({ id: uid('s'), name: n, pieces: structuredClone(setups[cur].pieces) }); cur = setups.length - 1; setupPanel(); paintPieces(); info(); });
      if (a === 'ren') promptName('Rename placement', setups[cur].name, (n) => { setups[cur].name = n; setupPanel(); });
      if (a === 'del' && setups.length > 1) { setups.splice(cur, 1); cur = Math.max(0, cur - 1); setupPanel(); paintPieces(); info(); }
    }));
    p.querySelector('#su-color').addEventListener('click', (e) => { const bt = e.target.closest('button'); if (!bt) return; tool.color = bt.dataset.v; setupPanel(); });
    p.querySelector('#su-pal').addEventListener('click', (e) => {
      const bt = e.target.closest('.pal'); if (!bt) return;
      if (bt.id === 'su-erase') tool.erase = true; else { tool.erase = false; tool.piece = bt.dataset.id; }
      p.querySelectorAll('.pal').forEach((x) => x.setAttribute('aria-pressed', x === bt));
    });
    p.querySelectorAll('[data-q]').forEach((bt) => bt.addEventListener('click', () => {
      const s = setups[cur];
      const q = bt.dataset.q;
      const add = (list) => { list.forEach(([x, y, id, c]) => { if (cells[y]?.[x] && !s.pieces.some((e) => e[0] === x && e[1] === y)) s.pieces.push([x, y, id, c]); }); };
      if (q === 'clear') s.pieces = [];
      if (q === 'clearb') s.pieces = s.pieces.filter((e) => e[3] !== 'b');
      if (q === 'flip' || q === 'rot') {
        s.pieces = s.pieces.filter((e) => e[3] !== 'b');
        add(s.pieces.filter((e) => e[3] === 'w').map(([x, y, id]) => [q === 'flip' ? x : w - 1 - x, h - 1 - y, id, 'b']));
      }
      if (q === 'std') { s.pieces = structuredClone(CLASSIC_BOARD.setups[0].pieces); }
      paintPieces(); info();
    }));
  }

  function showTab(t) {
    tab = t;
    $('#be-tabs').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', x.dataset.v === t));
    if (t === 'shape') shapePanel(); else setupPanel();
    paintPieces(); info();
  }
  $('#be-tabs').addEventListener('click', (e) => { const bt = e.target.closest('button'); if (bt) showTab(bt.dataset.v); });

  // ---------- save ----------
  $('#save').addEventListener('click', () => {
    const name = b.name.trim();
    if (!name) { toast('Give the board a name first.'); $('#be-name').focus(); return; }
    if (!playableCount()) { toast('The board needs at least one square.'); return; }
    prune();
    const out = { id: b.id, name: name.slice(0, 40), w, h, cells: boolToRows(cells), setups };
    if (!saveBoard(out)) { toast('Could not save. Your browser storage may be full.'); return; }
    toast(`Saved “${out.name}”.`, 3000);
    location.hash = '#/create';
  });

  drawGrid();
  showTab('shape');
}
