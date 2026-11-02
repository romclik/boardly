import { PixelEditor, darkenDataURL } from './pixel.js';
import { allPieces, pieceById, savePiece, uid, estimateValue, presetMoves, PRESET_NAMES, gcd } from './library.js';
import { CustomChess } from './rules.js';
import { createGrid, setPiece } from './boardview.js';
import { esc, toast } from './ui.js';

const R = 5;                       // movement grid reaches 5 squares in every direction
const BLOCKER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="#7d7d86" stroke="#2b2b30" stroke-width="3"/><path d="M13 13l14 14M27 13L13 27" stroke="#2b2b30" stroke-width="3.5" stroke-linecap="round"/></svg>');

function seg(root, onChange) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    root.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', x === b));
    onChange(b.dataset.v);
  });
}
const segHtml = (name, items, cur) => `<div class="seg wrap" role="radiogroup" data-g="${name}">${items
  .map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${v === cur}">${l}</button>`).join('')}</div>`;

const symmetric = (dx, dy, mode) => {
  const s = new Map();
  const add = (a, b) => s.set(`${a},${b}`, [a, b]);
  add(dx, dy);
  if (mode !== 'none') add(-dx, dy);
  if (mode === 'four' || mode === 'eight') { add(dx, -dy); add(-dx, -dy); }
  if (mode === 'eight') { add(dy, dx); add(-dy, dx); add(dy, -dx); add(-dy, -dx); }
  return [...s.values()];
};

export function pieceEditor(view, id) {
  const existing = id && id !== 'new' ? pieceById(id) : null;
  if (existing?.builtin) { location.hash = '#/create'; return; }
  const p = existing ? structuredClone(existing)
    : { id: uid('p'), name: '', sym: '', royal: false, value: 1, rel: true, ep: false, promo: [], img: { w: null, b: null }, moves: [] };

  const cells = new Map(p.moves.map((c) => [`${c.dx},${c.dy}`, { ...c }]));
  const br = { act: 'b', style: 'leap', rep: 99, pass: false, first: false, sym: 'none' };
  const imgs = { w: p.img.w, b: p.img.b };
  const dirty = { w: false, b: false };
  let tab = 'w';
  const pv = { x: 4, y: 4, color: 'w', mode: 'move', blockers: [] };

  view.innerHTML = `
    <div class="editor">
      <div class="ed-head">
        <a class="back" href="#/create">← Back</a>
        <h1 class="page-title">${existing ? 'EDIT PIECE' : 'NEW PIECE'}</h1>
        <div class="ed-head-actions"><a class="btn ghost" href="#/create">Cancel</a><button class="btn primary" id="save">Save piece</button></div>
      </div>
      <div class="ed-cols">
        <div class="ed-col">
          <section class="card">
            <h2>Details</h2>
            <label class="fld"><span>Name</span><input class="text" id="pe-name" maxlength="30" placeholder="e.g. Dragon" autocomplete="off"></label>
            <div class="fld-row">
              <label class="fld small"><span>Letter</span><input class="text" id="pe-sym" maxlength="2" placeholder="auto" autocomplete="off"></label>
              <div class="fld grow"><span>Strength <output id="pe-val-out"></output></span>
                <div class="range plain"><input id="pe-val" type="range" min="0" max="20" step="1" aria-label="Strength"></div></div>
              <button type="button" class="btn ghost sm" id="pe-auto" title="Guess from the moves">Auto</button>
            </div>
            <p class="hint">The letter is used in the move list. Strength is how much the bot values the piece (pawn = 1, queen = 9).</p>
            <label class="srow flat"><span><span class="s-title">Royal (like a king)</span><span class="s-desc">If it is attacked that is check; if it can’t escape, checkmate.</span></span><input class="switch" id="pe-royal" type="checkbox" role="switch"></label>
            <label class="srow flat"><span><span class="s-title">Mirror moves for Black</span><span class="s-desc">“Forward” points toward the enemy for both sides. Turn off to make moves identical on the screen.</span></span><input class="switch" id="pe-rel" type="checkbox" role="switch"></label>
            <label class="srow flat"><span><span class="s-title">En passant</span><span class="s-desc">Pawn-style: can capture a piece like it that just moved two squares past.</span></span><input class="switch" id="pe-ep" type="checkbox" role="switch"></label>
            <div class="fld"><span>Promotes to</span>
              <span class="s-desc">When it reaches the far end of the board it turns into one of these. Leave empty for no promotion.</span>
              <div class="chips" id="pe-promo"></div></div>
          </section>
          <section class="card">
            <h2>Picture</h2>
            <div class="seg" role="radiogroup" aria-label="Which color" id="pe-tabs">
              <button type="button" role="radio" data-v="w" aria-checked="true">White piece</button>
              <button type="button" role="radio" data-v="b" aria-checked="false">Black piece</button>
            </div>
            <div id="px-host"></div>
            <div class="px-copy">
              <button type="button" class="btn ghost sm" id="copy-dark">Fill from other color (darker)</button>
              <button type="button" class="btn ghost sm" id="copy-same">Fill from other color (same)</button>
            </div>
            <p class="hint">Pictures are shrunk to 64×64 pixels so saved files stay small. If you only draw White, Black is made automatically.</p>
          </section>
        </div>
        <div class="ed-col">
          <section class="card">
            <h2>Movement</h2>
            <p class="hint">Click the squares around the piece (middle) where it can go. White moves up the screen.</p>
            <div class="mv-layout">
              <div class="mv-grid" id="mv-grid" style="--n:${R * 2 + 1}"></div>
              <div class="mv-ctl">
                <div class="ctl"><span class="lbl">Brush</span>${segHtml('act', [['b', 'Move or capture'], ['m', 'Move only'], ['c', 'Capture only'], ['x', 'Erase']], br.act)}</div>
                <div class="ctl"><span class="lbl">Style</span>${segHtml('style', [['leap', 'Jump'], ['walk', 'Step'], ['slide', 'Slide']], br.style)}
                  <small class="hint2" id="style-hint"></small></div>
                <div class="ctl slide-only"><span class="lbl">Repeats</span>
                  <select id="mv-rep" class="plain-select"><option value="99">Unlimited</option>${[2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}">Up to ${n}</option>`).join('')}</select>
                  <label class="chk"><input type="checkbox" id="mv-pass"> Pass over pieces</label></div>
                <label class="chk"><input type="checkbox" id="mv-first"> Only on its first move</label>
                <div class="ctl"><span class="lbl">Symmetry</span>${segHtml('sym', [['none', 'None'], ['h', 'Left↔right'], ['four', '4-way'], ['eight', '8-way']], br.sym)}</div>
                <div class="ctl row"><select id="mv-preset" class="plain-select"><option value="">Add moves of…</option>${PRESET_NAMES.map((n) => `<option>${esc(n)}</option>`).join('')}</select>
                  <button type="button" class="btn ghost sm" id="mv-clear">Clear all</button></div>
              </div>
            </div>
            <div class="legend"><span><i class="lg b"></i>move or capture</span><span><i class="lg m"></i>move only</span><span><i class="lg c"></i>capture only</span>
              <span>● jump</span><span>○ step</span><span>∞ slide</span><span>1 = first move only</span></div>
          </section>
          <section class="card">
            <h2>Try it</h2>
            <div class="pv-ctl">
              <div class="seg" id="pv-color" role="radiogroup" aria-label="Preview color"><button type="button" role="radio" data-v="w" aria-checked="true">White</button><button type="button" role="radio" data-v="b" aria-checked="false">Black</button></div>
              <div class="seg" id="pv-mode" role="radiogroup" aria-label="Preview click action"><button type="button" role="radio" data-v="move" aria-checked="true">Move piece</button><button type="button" role="radio" data-v="block" aria-checked="false">Place blockers</button></div>
            </div>
            <div class="pv-board" id="pv-board"></div>
            <p class="hint" id="pv-info"></p>
          </section>
        </div>
      </div>
    </div>`;
  const $ = (s) => view.querySelector(s);

  // ---------- details ----------
  $('#pe-name').value = p.name;
  $('#pe-sym').value = p.sym === (p.name[0] || '').toUpperCase() ? '' : p.sym;
  $('#pe-val').value = p.value;
  $('#pe-val-out').textContent = p.value;
  $('#pe-royal').checked = p.royal;
  $('#pe-rel').checked = p.rel;
  $('#pe-ep').checked = p.ep;
  $('#pe-name').addEventListener('input', (e) => { p.name = e.target.value; });
  $('#pe-sym').addEventListener('input', (e) => { p.sym = e.target.value; });
  $('#pe-val').addEventListener('input', (e) => { p.value = +e.target.value; $('#pe-val-out').textContent = p.value; $('#pe-val').parentElement.style.setProperty('--pct', p.value / 20); });
  $('#pe-val').parentElement.style.setProperty('--pct', p.value / 20);
  $('#pe-royal').addEventListener('change', (e) => { p.royal = e.target.checked; });
  $('#pe-rel').addEventListener('change', (e) => { p.rel = e.target.checked; renderPreview(); });
  $('#pe-ep').addEventListener('change', (e) => { p.ep = e.target.checked; });
  $('#pe-auto').addEventListener('click', () => {
    const v = estimateValue({ moves: [...cells.values()] });
    p.value = v; $('#pe-val').value = v; $('#pe-val-out').textContent = v; $('#pe-val').parentElement.style.setProperty('--pct', v / 20);
  });

  const promoBox = $('#pe-promo');
  allPieces().filter((q) => q.id !== p.id).forEach((q) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip pic';
    b.setAttribute('aria-pressed', p.promo.includes(q.id));
    b.innerHTML = `<img src="${esc(q.img.w)}" alt=""><span>${esc(q.name)}</span>`;
    b.addEventListener('click', () => {
      p.promo = p.promo.includes(q.id) ? p.promo.filter((x) => x !== q.id) : [...p.promo, q.id];
      b.setAttribute('aria-pressed', p.promo.includes(q.id));
    });
    promoBox.append(b);
  });

  // ---------- drawing ----------
  const px = new PixelEditor({ onChange: () => { dirty[tab] = true; renderMoves(); renderPreview(); } });
  px.onError = (m) => toast(m);
  $('#px-host').append(px.el);
  const currentImg = (c) => (c === tab ? (dirty[c] ? (px.isEmpty() ? null : px.toDataURL()) : imgs[c]) : imgs[c]);
  async function switchTab(t) {
    if (t === tab) return;
    if (dirty[tab]) imgs[tab] = px.isEmpty() ? null : px.toDataURL();
    tab = t;
    $('#pe-tabs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', b.dataset.v === t));
    await px.load(imgs[tab]);
    renderMoves(); renderPreview();
  }
  seg($('#pe-tabs'), switchTab);
  px.load(imgs.w).then(() => { renderMoves(); renderPreview(); });
  async function copyOther(dark) {
    const from = tab === 'w' ? 'b' : 'w';
    let src = currentImg(from);
    if (!src) { toast(`Draw the ${from === 'w' ? 'white' : 'black'} piece first.`); return; }
    if (dark) src = await darkenDataURL(src);
    imgs[tab] = src; dirty[tab] = true;
    await px.load(src);
    dirty[tab] = true;
    renderMoves(); renderPreview();
  }
  $('#copy-dark').addEventListener('click', () => copyOther(true));
  $('#copy-same').addEventListener('click', () => copyOther(false));

  // ---------- movement grid ----------
  const grid = $('#mv-grid');
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const c = document.createElement('div');
    c.className = 'mvc' + (dx === 0 && dy === 0 ? ' center' : '');
    c.dataset.dx = dx; c.dataset.dy = dy;
    grid.append(c);
  }
  function renderMoves() {
    grid.querySelectorAll('.mvc').forEach((el) => {
      const dx = +el.dataset.dx, dy = +el.dataset.dy;
      if (el.classList.contains('center')) {
        const src = currentImg('w') || currentImg('b');
        el.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<span class="ph">?</span>';
        return;
      }
      const c = cells.get(`${dx},${dy}`);
      el.className = 'mvc' + (c ? ` on m-${c.m}` : '');
      el.innerHTML = c
        ? `${c.t === 'slide' ? `<b>${c.r >= 99 ? '∞' : c.r}</b>` : c.t === 'walk' ? '<i class="ring"></i>' : '<i class="dot"></i>'}${c.f ? '<sup>1</sup>' : ''}${c.t === 'slide' && c.j ? '<em>~</em>' : ''}`
        : '';
    });
    $('#style-hint').textContent = {
      leap: 'Jump: goes straight to the square, nothing can block it (like a knight).',
      walk: 'Step: goes there in a straight line, so the squares in between must be empty (like a pawn’s double step).',
      slide: 'Slide: repeats the marked jump again and again until something is in the way (like a rook or bishop).',
    }[br.style];
    $('.slide-only').hidden = br.style !== 'slide';
  }
  function paint(el) {
    const dx = +el.dataset.dx, dy = +el.dataset.dy;
    if (!dx && !dy) return;
    for (const [a, b] of symmetric(dx, dy, br.sym)) {
      if (Math.abs(a) > R || Math.abs(b) > R) continue;
      const key = `${a},${b}`;
      if (br.act === 'x') { cells.delete(key); continue; }
      const t = br.style === 'walk' && gcd(a, b) <= 1 ? 'leap' : br.style;
      cells.set(key, { dx: a, dy: b, m: br.act, t, r: t === 'slide' ? br.rep : 1, j: t === 'slide' && br.pass ? 1 : 0, f: br.first ? 1 : 0 });
    }
    renderMoves(); renderPreview();
  }
  let painting = false;
  grid.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.mvc');
    if (!el) return;
    e.preventDefault();
    painting = true;
    paint(el);
  });
  grid.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.mvc');
    if (el && el !== grid._last) { grid._last = el; paint(el); }
  });
  const stopPaint = () => { painting = false; grid._last = null; };
  window.addEventListener('pointerup', stopPaint);
  window.addEventListener('pointercancel', stopPaint);

  view.querySelectorAll('.mv-ctl .seg').forEach((s) => seg(s, (v) => { br[s.dataset.g] = v; renderMoves(); }));
  $('#mv-rep').addEventListener('change', (e) => { br.rep = +e.target.value; });
  $('#mv-pass').addEventListener('change', (e) => { br.pass = e.target.checked; });
  $('#mv-first').addEventListener('change', (e) => { br.first = e.target.checked; });
  $('#mv-preset').addEventListener('change', (e) => {
    if (!e.target.value) return;
    presetMoves(e.target.value).forEach((c) => cells.set(`${c.dx},${c.dy}`, c));
    e.target.value = '';
    renderMoves(); renderPreview();
  });
  $('#mv-clear').addEventListener('click', () => { cells.clear(); renderMoves(); renderPreview(); });

  // ---------- preview board ----------
  const N = 9;
  function renderPreview() {
    const host = $('#pv-board');
    const imgFor = (c) => currentImg(c) || currentImg(c === 'w' ? 'b' : 'w');
    const def = {
      id: 'X', name: p.name || 'Piece', sym: '', royal: false, value: 1, rel: p.rel, ep: false, promo: [],
      img: { w: imgFor('w') || BLOCKER, b: imgFor('b') || BLOCKER }, moves: [...cells.values()],
    };
    const blk = { id: 'BLK', name: 'Blocker', sym: 'x', royal: false, value: 0, rel: true, ep: false, promo: [], img: { w: BLOCKER, b: BLOCKER }, moves: [] };
    const enemy = pv.color === 'w' ? 'b' : 'w';
    const g = new CustomChess({
      w: N, h: N, cells: Array(N).fill('1'.repeat(N)), pieces: { X: def, BLK: blk },
      setup: [[pv.x, pv.y, 'X', pv.color], ...pv.blockers.map(([x, y]) => [x, y, 'BLK', enemy])],
    });
    const reach = g.movesFrom(pv.x, pv.y);
    const grid2 = createGrid({ w: N, h: N, cells: Array.from({ length: N }, () => Array(N).fill(true)), cell: 38 });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const el = grid2.at(x, y);
      if (x === pv.x && y === pv.y) setPiece(el, def.img[pv.color]);
      else if (pv.blockers.some((b) => b[0] === x && b[1] === y)) setPiece(el, BLOCKER);
    }
    reach.forEach((m) => grid2.at(m.x, m.y).classList.add(m.capture ? 'hl-cap' : 'hl'));
    grid2.el.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.mc');
      if (!c) return;
      const x = +c.dataset.x, y = +c.dataset.y;
      if (pv.mode === 'move') { pv.x = x; pv.y = y; pv.blockers = pv.blockers.filter((b) => !(b[0] === x && b[1] === y)); }
      else if (!(x === pv.x && y === pv.y)) {
        const i = pv.blockers.findIndex((b) => b[0] === x && b[1] === y);
        if (i >= 0) pv.blockers.splice(i, 1); else pv.blockers.push([x, y]);
      }
      renderPreview();
    });
    host.replaceChildren(grid2.el);
    $('#pv-info').textContent = cells.size
      ? `${reach.length} square${reach.length === 1 ? '' : 's'} reachable from here. Click a square to move the piece, or switch to “Place blockers” to test captures and blocking.`
      : 'Mark some moves above to see them here.';
  }
  seg($('#pv-color'), (v) => { pv.color = v; renderPreview(); });
  seg($('#pv-mode'), (v) => { pv.mode = v; });

  // ---------- save ----------
  $('#save').addEventListener('click', async () => {
    const name = p.name.trim();
    if (!name) { toast('Give the piece a name first.'); $('#pe-name').focus(); return; }
    if (!cells.size) { toast('Mark at least one move for the piece.'); return; }
    const w = currentImg('w');
    if (!w) { toast('Draw or upload a picture for the white piece.'); return; }
    let b = currentImg('b');
    if (!b) b = await darkenDataURL(w);
    const out = {
      id: p.id, name: name.slice(0, 30), sym: (p.sym || '').trim().slice(0, 2) || name[0].toUpperCase(),
      royal: p.royal, value: p.value, rel: p.rel, ep: p.ep, promo: p.promo,
      img: { w, b }, moves: [...cells.values()],
    };
    if (!savePiece(out)) { toast('Could not save. Your browser storage may be full. Try exporting and deleting something.'); return; }
    toast(`Saved “${out.name}”.`, 3000);
    location.hash = '#/create';
  });
}
