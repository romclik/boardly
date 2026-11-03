import { wizard } from './wizard.js';
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
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.buttons[1].click(); });
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
  const tool = { shape: 'paint', piece: allPieces()[0]?.id, color: 'w', erase: false };

  const playableCount = () => cells.flat().filter(Boolean).length;
  const dark = (x, y) => (x + (h - 1 - y)) % 2 === 0;
  const cellClass = (x, y) => 'mc ' + (cells[y][x] ? (dark(x, y) ? 'dark' : 'light') : 'void ghost');
  const prune = () => { setups.forEach((s) => { s.pieces = s.pieces.filter(([x, y]) => x < w && y < h && cells[y]?.[x]); }); };
  const cellPx = () => Math.max(20, Math.min(56, Math.floor(Math.min(600, window.innerWidth - 90) / Math.max(w, h))));

  let down = false, last = null;
  window.addEventListener('pointerup', () => { down = false; last = null; });
  window.addEventListener('pointercancel', () => { down = false; last = null; });

  // Draws the board into `host`. mode: 'view' | 'shape' | 'setup'
  function mountGrid(host, mode, onChange) {
    const grid = createGrid({ w, h, cells, cell: cellPx(), ghost: true });
    if (mode !== 'view') grid.el.classList.add('editing');
    if (mode === 'setup') {
      for (const [x, y, pid, c] of setups[cur].pieces) {
        const p = pieceById(pid);
        if (p && grid.at(x, y)) setPiece(grid.at(x, y), p.img[c], p.name);
      }
    }
    host.replaceChildren(grid.el);
    if (mode === 'view') return grid;
    const apply = (el, right) => {
      const x = +el.dataset.x, y = +el.dataset.y;
      if (mode === 'shape') {
        const on = tool.shape === 'paint';
        if (cells[y][x] === on) return;
        cells[y][x] = on;
        el.className = cellClass(x, y);
        if (!on) prune();
      } else {
        if (!cells[y][x]) return;
        const list = setups[cur].pieces;
        const i = list.findIndex((e) => e[0] === x && e[1] === y);
        if (right || tool.erase) { if (i >= 0) list.splice(i, 1); setPiece(el, null); }
        else {
          if (i >= 0) list.splice(i, 1);
          list.push([x, y, tool.piece, tool.color]);
          const p = pieceById(tool.piece);
          setPiece(el, p?.img[tool.color], p?.name);
        }
      }
      onChange?.();
    };
    grid.el.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.el.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.mc');
      if (!el) return;
      e.preventDefault();
      down = e.button === 2 ? 'right' : true;
      last = el;
      apply(el, e.button === 2);
    });
    grid.el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.mc');
      if (el && el !== last && grid.el.contains(el)) { last = el; apply(el, down === 'right'); }
    });
    return grid;
  }

  const track = (r, lo) => r.parentElement.style.setProperty('--pct', (r.value - lo) / (MAX_SIZE - lo));

  // ------------------------------ STEP 1 ------------------------------
  const step1 = {
    label: 'Name & size', title: 'Step 1 · Name and size', hint: 'Give your board a name and choose how many squares wide and tall it is. You’ll shape it in the next step.',
    mount(body) {
      body.innerHTML = `
        <div class="two">
          <div>
            <label class="fld big"><span>What is your board called?</span><input class="text lg" id="be-name" maxlength="40" placeholder="e.g. Crossroads" autocomplete="off"></label>
            <div class="fld"><span>Width <output id="o-w">${w}</output> squares</span><div class="range plain"><input id="r-w" type="range" min="1" max="${MAX_SIZE}" value="${w}" aria-label="Width"></div></div>
            <div class="fld"><span>Height <output id="o-h">${h}</output> squares</span><div class="range plain"><input id="r-h" type="range" min="1" max="${MAX_SIZE}" value="${h}" aria-label="Height"></div></div>
          </div>
          <div class="be-stage" id="be-stage"></div>
        </div>`;
      const $ = (s) => body.querySelector(s);
      $('#be-name').value = b.name;
      $('#be-name').addEventListener('input', (e) => { b.name = e.target.value; });
      const draw = () => mountGrid($('#be-stage'), 'view');
      const resize = (nw, nh) => {
        cells = Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) => (cells[y]?.[x] ?? true)));
        w = nw; h = nh; prune(); draw();
      };
      const rw = $('#r-w'), rh = $('#r-h');
      [rw, rh].forEach((r) => track(r, 1));
      rw.addEventListener('input', () => { track(rw, 1); $('#o-w').textContent = rw.value; resize(+rw.value, h); });
      rh.addEventListener('input', () => { track(rh, 1); $('#o-h').textContent = rh.value; resize(w, +rh.value); });
      draw();
    },
    validate: () => (b.name.trim() ? null : 'Give your board a name first.'),
  };

  // ------------------------------ STEP 2 ------------------------------
  const step2 = {
    label: 'Shape', title: 'Step 2 · Shape the board', hint: 'Click or drag on the board to add or remove squares. Or start from a ready-made shape.',
    mount(body) {
      body.innerHTML = `
        <div class="two">
          <div class="be-stage" id="be-stage"></div>
          <div>
            <div class="ctl"><span class="lbl">Brush</span>
              <div class="seg" id="sh-tool" role="radiogroup"><button type="button" role="radio" data-v="paint" aria-checked="${tool.shape === 'paint'}">Add squares</button><button type="button" role="radio" data-v="erase" aria-checked="${tool.shape === 'erase'}">Remove squares</button></div></div>
            <div class="ctl"><span class="lbl">Ready-made shapes</span><div class="chips" id="sh-shapes">
              ${[['rect', 'Rectangle'], ['cross', 'Cross'], ['circle', 'Circle'], ['diamond', 'Diamond'], ['donut', 'Donut'], ['triangle', 'Triangle']].map(([k, l]) => `<button type="button" class="chip" data-k="${k}">${l}</button>`).join('')}</div></div>
            <div class="ctl"><span class="lbl">Tools</span><div class="chips">
              <button type="button" class="chip" data-t="mirror">Mirror left → right</button>
              <button type="button" class="chip" data-t="flipv">Mirror top → bottom</button>
              <button type="button" class="chip" data-t="invert">Invert</button></div></div>
            <p class="hint" id="be-info"></p>
          </div>
        </div>`;
      const $ = (s) => body.querySelector(s);
      const info = () => { const n = playableCount(); $('#be-info').textContent = `${w} × ${h} board with ${n} square${n === 1 ? '' : 's'}.`; };
      const draw = () => { mountGrid($('#be-stage'), 'shape', info); info(); };
      $('#sh-tool').addEventListener('click', (e) => {
        const bt = e.target.closest('button'); if (!bt) return;
        tool.shape = bt.dataset.v;
        $('#sh-tool').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', x === bt));
      });
      $('#sh-shapes').addEventListener('click', (e) => {
        const k = e.target.closest('[data-k]')?.dataset.k;
        if (!k) return;
        cells = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => shapes[k](x, y, w, h)));
        if (!playableCount()) cells[0][0] = true;
        prune(); draw();
      });
      body.querySelectorAll('[data-t]').forEach((bt) => bt.addEventListener('click', () => {
        const t = bt.dataset.t;
        if (t === 'mirror') cells = cells.map((r) => r.map((_, x) => (x < w / 2 ? r[x] : r[w - 1 - x])));
        if (t === 'flipv') cells = cells.map((r, y) => (y < h / 2 ? r : cells[h - 1 - y].slice()));
        if (t === 'invert') cells = cells.map((r) => r.map((c) => !c));
        if (!playableCount()) cells[0][0] = true;
        prune(); draw();
      }));
      draw();
    },
    validate: () => (playableCount() ? null : 'The board needs at least one square.'),
  };

  // ------------------------------ STEP 3 ------------------------------
  const step3 = {
    label: 'Pieces', title: 'Step 3 · Place the pieces', hint: 'Choose a piece, then click squares to place it. A board can have several starting layouts, and you pick one when you play.',
    mount(body) {
      body.innerHTML = `
        <div class="two">
          <div><div class="be-stage" id="be-stage"></div><p class="hint" id="be-info"></p></div>
          <div id="su-panel"></div>
        </div>`;
      const $ = (s) => body.querySelector(s);
      const info = () => {
        const ps = setups[cur].pieces;
        const wc = ps.filter((e) => e[3] === 'w').length, bc = ps.filter((e) => e[3] === 'b').length;
        let t = `White ${wc} piece${wc === 1 ? '' : 's'} · Black ${bc} piece${bc === 1 ? '' : 's'}`;
        if (!wc || !bc) t += ' (both sides need at least one piece to play)';
        $('#be-info').textContent = t;
      };
      const draw = () => { mountGrid($('#be-stage'), 'setup', info); info(); };
      const panel = () => {
        const p = $('#su-panel');
        p.innerHTML = `
          <div class="ctl"><span class="lbl">Layout</span>
            <div class="ctl row"><select id="su-sel" class="plain-select">${setups.map((s, i) => `<option value="${i}"${i === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
              <button type="button" class="btn ghost sm" data-a="new">New</button><button type="button" class="btn ghost sm" data-a="dup">Copy</button>
              <button type="button" class="btn ghost sm" data-a="ren">Rename</button><button type="button" class="btn ghost sm" data-a="del"${setups.length < 2 ? ' disabled' : ''}>Delete</button></div></div>
          <div class="ctl"><span class="lbl">Place pieces for</span>
            <div class="seg" id="su-color" role="radiogroup"><button type="button" role="radio" data-v="w" aria-checked="${tool.color === 'w'}">White</button><button type="button" role="radio" data-v="b" aria-checked="${tool.color === 'b'}">Black</button></div></div>
          <div class="palette" id="su-pal">${allPieces().map((q) => `<button type="button" class="pal" data-id="${esc(q.id)}" aria-pressed="${!tool.erase && tool.piece === q.id}" title="${esc(q.name)}"><img src="${esc(q.img[tool.color])}" alt="${esc(q.name)}"></button>`).join('')}
            <button type="button" class="pal eraser" id="su-erase" aria-pressed="${tool.erase}" title="Eraser">✕</button></div>
          <small class="hint2">Right-click removes a piece.</small>
          <div class="ctl"><span class="lbl">Shortcuts</span><div class="chips">
            <button type="button" class="chip" data-q="flip">Copy White → Black (mirror)</button>
            <button type="button" class="chip" data-q="rot">Copy White → Black (rotate)</button>
            <button type="button" class="chip" data-q="clear">Clear all</button>
            ${w === 8 && h === 8 && cells.flat().every(Boolean) ? '<button type="button" class="chip" data-q="std">Standard chess layout</button>' : ''}</div></div>`;
        p.querySelector('#su-sel').addEventListener('change', (e) => { cur = +e.target.value; draw(); });
        p.querySelectorAll('[data-a]').forEach((bt) => bt.addEventListener('click', () => {
          const a = bt.dataset.a;
          if (a === 'new') promptName('New layout', `Layout ${setups.length + 1}`, (n) => { setups.push({ id: uid('s'), name: n, pieces: [] }); cur = setups.length - 1; panel(); draw(); });
          if (a === 'dup') promptName('Copy layout', `${setups[cur].name} copy`, (n) => { setups.push({ id: uid('s'), name: n, pieces: structuredClone(setups[cur].pieces) }); cur = setups.length - 1; panel(); draw(); });
          if (a === 'ren') promptName('Rename layout', setups[cur].name, (n) => { setups[cur].name = n; panel(); });
          if (a === 'del' && setups.length > 1) { setups.splice(cur, 1); cur = Math.max(0, cur - 1); panel(); draw(); }
        }));
        p.querySelector('#su-color').addEventListener('click', (e) => { const bt = e.target.closest('button'); if (!bt) return; tool.color = bt.dataset.v; panel(); });
        p.querySelector('#su-pal').addEventListener('click', (e) => {
          const bt = e.target.closest('.pal'); if (!bt) return;
          if (bt.id === 'su-erase') tool.erase = true; else { tool.erase = false; tool.piece = bt.dataset.id; }
          p.querySelectorAll('.pal').forEach((x) => x.setAttribute('aria-pressed', x === bt));
        });
        p.querySelectorAll('[data-q]').forEach((bt) => bt.addEventListener('click', () => {
          const s = setups[cur];
          const q = bt.dataset.q;
          if (q === 'clear') s.pieces = [];
          if (q === 'flip' || q === 'rot') {
            s.pieces = s.pieces.filter((e) => e[3] !== 'b');
            s.pieces.filter((e) => e[3] === 'w').forEach(([x, y, id]) => {
              const nx = q === 'flip' ? x : w - 1 - x, ny = h - 1 - y;
              if (cells[ny]?.[nx] && !s.pieces.some((e) => e[0] === nx && e[1] === ny)) s.pieces.push([nx, ny, id, 'b']);
            });
          }
          if (q === 'std') s.pieces = structuredClone(CLASSIC_BOARD.setups[0].pieces);
          draw();
        }));
      };
      panel(); draw();
    },
  };

  wizard(view, {
    title: existing ? `Edit “${existing.name}”` : 'New board', steps: [step1, step2, step3], saveLabel: '✓ Save board',
    onSave() {
      prune();
      const out = { id: b.id, name: b.name.trim().slice(0, 40), w, h, cells: boolToRows(cells), setups };
      if (!saveBoard(out)) { toast('Could not save. Your browser storage may be full.'); return; }
      toast(`Saved “${out.name}”.`, 3000);
      location.hash = '#/create';
    },
  });
}
