import { wizard } from './wizard.js';
import { PixelEditor, darkenDataURL } from './pixel.js';
import { allPieces, pieceById, savePiece, uid, estimateValue, presetMoves, PRESET_NAMES, gcd } from './library.js';
import { CustomChess } from './rules.js';
import { createGrid, setPiece } from './boardview.js';
import { esc, toast } from './ui.js';

const R = 5;                       // the movement grid reaches 5 squares in every direction
const BLOCKER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="#7d7d86" stroke="#2b2b30" stroke-width="3"/><path d="M13 13l14 14M27 13L13 27" stroke="#2b2b30" stroke-width="3.5" stroke-linecap="round"/></svg>');
const QUICK = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'];

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

const strengthWords = (v) => (v <= 1 ? 'about as strong as a pawn' : v <= 3 ? 'about as strong as a knight or bishop'
  : v <= 5 ? 'about as strong as a rook' : v <= 9 ? 'about as strong as a queen' : 'stronger than a queen');

export function pieceEditor(view, id) {
  const existing = id && id !== 'new' ? pieceById(id) : null;
  if (existing?.builtin) { location.hash = '#/create'; return; }
  const p = existing ? structuredClone(existing)
    : { id: uid('p'), name: '', sym: '', royal: false, value: 3, rel: true, ep: false, promo: [], img: { w: null, b: null }, moves: [] };
  if (!p.value) p.value = 3;

  const cells = new Map(p.moves.map((c) => [`${c.dx},${c.dy}`, { ...c }]));
  const br = { act: 'b', travel: 'leap', rep: 99, pass: false, first: false, step: false, sym: 'none' };
  const imgs = { w: p.img.w, b: p.img.b };
  const fin = { w: p.img.w, b: p.img.b };        // pictures finished in step 2, used by steps 3 and 4
  const dirty = { w: false, b: false };
  let tab = 'w';
  let blackMode = existing ? 'draw' : 'auto';
  const pv = { x: 4, y: 4, color: 'w', mode: 'move', blockers: [] };

  const px = new PixelEditor({ onChange: () => { dirty[tab] = true; syncCurrent(); schedulePrev(); } });
  px.onError = (m) => toast(m);
  px.load(imgs.w);

  function syncCurrent() { if (dirty[tab]) imgs[tab] = px.isEmpty() ? null : px.toDataURL(); }
  async function commitImages() {
    syncCurrent();
    fin.w = imgs.w;
    fin.b = blackMode === 'auto' || !imgs.b ? (imgs.w ? await darkenDataURL(imgs.w) : null) : imgs.b;
  }
  const makeDef = () => ({
    id: 'X', name: p.name || 'Piece', sym: '', royal: false, value: 1, rel: p.rel, ep: p.ep, promo: [],
    img: { w: fin.w || BLOCKER, b: fin.b || fin.w || BLOCKER }, moves: [...cells.values()],
  });

  // ============================ STEP 1 ============================
  const step1 = {
    label: 'Details', title: 'Step 1 · Name and strength', hint: 'Start by naming your piece. You can change everything later.',
    mount(body) {
      body.innerHTML = `
        <label class="fld big"><span>What is your piece called?</span><input class="text xl" id="pe-name" maxlength="30" placeholder="e.g. Dragon, Archer, Wizard" autocomplete="off"></label>
        <div class="fld"><span>How strong is it? <output id="st-out"></output></span>
          <div class="range plain"><input id="pe-val" type="range" min="1" max="15" step="1" aria-label="Strength"></div>
          <small class="hint2" id="st-desc"></small></div>
        <details class="adv"><summary>Special abilities (optional)</summary>
          <div class="adv-body">
            <label class="srow flat"><span><span class="s-title">Royal</span><span class="s-desc">Like a king: if it is trapped, the game is lost.</span></span><input class="switch" id="pe-royal" type="checkbox" role="switch"></label>
            <label class="srow flat"><span><span class="s-title">Flip its moves for Black</span><span class="s-desc">On: “forward” points at the enemy for both sides. Off: moves look identical for both colors.</span></span><input class="switch" id="pe-rel" type="checkbox" role="switch"></label>
            <label class="srow flat"><span><span class="s-title">En passant</span><span class="s-desc">Pawn trick: can capture a similar piece that just moved two squares past it.</span></span><input class="switch" id="pe-ep" type="checkbox" role="switch"></label>
            <div class="fld"><span>Promotes into…</span><small class="hint2">At the far end of the board it turns into one of these. Leave empty for none.</small><div class="chips" id="pe-promo"></div></div>
            <label class="fld small"><span>Letter in the move list</span><input class="text" id="pe-sym" maxlength="2" placeholder="auto" autocomplete="off"></label>
          </div></details>`;
      const $ = (s) => body.querySelector(s);
      $('#pe-name').value = p.name;
      $('#pe-name').addEventListener('input', (e) => { p.name = e.target.value; });
      const val = $('#pe-val');
      const paintVal = () => {
        $('#st-out').textContent = val.value;
        $('#st-desc').textContent = `${strengthWords(+val.value)}. The bot uses this to decide which trades are good.`;
        val.parentElement.style.setProperty('--pct', (val.value - 1) / 14);
      };
      val.value = p.value; paintVal();
      val.addEventListener('input', () => { p.value = +val.value; paintVal(); });
      $('#pe-royal').checked = p.royal; $('#pe-royal').addEventListener('change', (e) => { p.royal = e.target.checked; });
      $('#pe-rel').checked = p.rel; $('#pe-rel').addEventListener('change', (e) => { p.rel = e.target.checked; });
      $('#pe-ep').checked = p.ep; $('#pe-ep').addEventListener('change', (e) => { p.ep = e.target.checked; });
      $('#pe-sym').value = p.sym === (p.name[0] || '').toUpperCase() ? '' : p.sym;
      $('#pe-sym').addEventListener('input', (e) => { p.sym = e.target.value; });
      if (p.royal || p.ep || p.promo.length) $('details.adv').open = true;
      allPieces().filter((q) => q.id !== p.id).forEach((q) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip pic';
        b.setAttribute('aria-pressed', p.promo.includes(q.id));
        b.innerHTML = `<img src="${esc(q.img.w)}" alt=""><span>${esc(q.name)}</span>`;
        b.addEventListener('click', () => {
          p.promo = p.promo.includes(q.id) ? p.promo.filter((x) => x !== q.id) : [...p.promo, q.id];
          b.setAttribute('aria-pressed', p.promo.includes(q.id));
        });
        $('#pe-promo').append(b);
      });
    },
    validate: () => (p.name.trim() ? null : 'Give your piece a name first.'),
  };

  // ============================ STEP 2 ============================
  let prevTimer = null;
  let updatePrev = () => {};
  function schedulePrev() { clearTimeout(prevTimer); prevTimer = setTimeout(() => updatePrev(), 120); }

  const step2 = {
    label: 'Picture', title: 'Step 2 · Draw or upload a picture', hint: 'Draw it with the pen, or upload any image. It is shrunk to a small 64×64 picture.',
    mount(body) {
      body.innerHTML = `
        <div class="pic-layout">
          <div class="pic-main">
            <div class="seg" id="pe-tabs" role="radiogroup" aria-label="Which piece"><button type="button" role="radio" data-v="w" aria-checked="true">White piece</button><button type="button" role="radio" data-v="b" aria-checked="false">Black piece</button></div>
            <div id="px-host"></div>
          </div>
          <aside class="pic-side">
            <h3>Black piece</h3>
            <label class="opt"><input type="radio" name="bm" value="auto"><span><b>Make it automatically</b><small>A darker copy of your white piece.</small></span></label>
            <label class="opt"><input type="radio" name="bm" value="draw"><span><b>I’ll draw it myself</b><small>Use the “Black piece” tab on the left.</small></span></label>
            <button type="button" class="btn ghost sm" id="copy-dark">Start black from the white one</button>
            <h3>How it will look</h3>
            <div class="pic-prev"><div class="pp light"><img id="pp-w" alt=""></div><div class="pp dark"><img id="pp-b" alt=""></div></div>
          </aside>
        </div>`;
      const $ = (s) => body.querySelector(s);
      $('#px-host').append(px.el);
      const paintTabs = () => {
        $('#pe-tabs').hidden = blackMode === 'auto';
        $('#pe-tabs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', b.dataset.v === tab));
        $('#copy-dark').hidden = !(blackMode === 'draw' && tab === 'b');
        body.querySelectorAll('input[name=bm]').forEach((r) => { r.checked = r.value === blackMode; });
      };
      updatePrev = async () => {
        if (!$('#pp-w')) return;
        syncCurrent();
        const w = imgs.w;
        const b = blackMode === 'auto' ? (w ? await darkenDataURL(w) : null) : (imgs.b || null);
        $('#pp-w')?.setAttribute('src', w || BLOCKER);
        $('#pp-b')?.setAttribute('src', b || BLOCKER);
        $('#pp-w')?.classList.toggle('empty', !w);
        $('#pp-b')?.classList.toggle('empty', !b);
      };
      async function switchTab(t) {
        if (t === tab) return;
        syncCurrent();
        tab = t;
        await px.load(imgs[tab]);
        paintTabs(); updatePrev();
      }
      seg($('#pe-tabs'), switchTab);
      body.querySelectorAll('input[name=bm]').forEach((r) => r.addEventListener('change', async () => {
        blackMode = r.value;
        if (blackMode === 'auto' && tab === 'b') await switchTab('w'); else { paintTabs(); updatePrev(); }
      }));
      $('#copy-dark').addEventListener('click', async () => {
        syncCurrent();
        if (!imgs.w) { toast('Draw the white piece first.'); return; }
        imgs.b = await darkenDataURL(imgs.w);
        dirty.b = true;
        await px.load(imgs.b);
        paintTabs(); updatePrev();
      });
      paintTabs(); updatePrev();
    },
    validate() { syncCurrent(); return imgs.w ? null : 'Draw or upload a picture for the white piece first.'; },
    leave: commitImages,
  };

  // ============================ STEP 3 ============================
  let renderMoves = () => {};
  let renderPreview = () => {};
  const step3 = {
    label: 'Movement', title: 'Step 3 · How does it move?', hint: 'Click squares around your piece to mark where it can go. White moves up the screen. Check the result on the board on the right.',
    mount(body) {
      body.innerHTML = `
        <div class="mv-wrap">
          <div class="mv-left">
            <div class="ctl"><span class="lbl">Shortcut: add the moves of…</span>
              <div class="chips" id="mv-presets">${QUICK.map((n) => `<button type="button" class="chip" data-n="${n}">${n}</button>`).join('')}
                <select id="mv-more" class="plain-select"><option value="">More…</option>${PRESET_NAMES.filter((n) => !QUICK.includes(n)).map((n) => `<option>${esc(n)}</option>`).join('')}</select></div></div>
            <div class="mv-grid" id="mv-grid" style="--n:${R * 2 + 1}"></div>
            <div class="legend"><span><i class="lg b"></i>move or capture</span><span><i class="lg m"></i>move only</span><span><i class="lg c"></i>capture only</span>
              <span>● jump</span><span>∞ slide</span></div>
          </div>
          <div class="mv-right">
            <div class="ctl"><span class="lbl">Marker</span>${segHtml('act', [['b', 'Move & capture'], ['m', 'Move only'], ['c', 'Capture only'], ['x', 'Erase']], br.act)}</div>
            <div class="ctl"><span class="lbl">How it travels</span>${segHtml('travel', [['leap', 'Jump'], ['slide', 'Slide']], br.travel)}<small class="hint2" id="trav-hint"></small></div>
            <div class="ctl"><span class="lbl">Mark mirrored squares too</span>
              <select id="mv-sym" class="plain-select"><option value="none">No, only the square I click</option><option value="h">Left and right</option><option value="four">All four sides</option><option value="eight">All eight directions</option></select></div>
            <details class="adv"><summary>More options</summary><div class="adv-body">
              <div class="ctl slide-only"><span class="lbl">Slide at most</span><select id="mv-rep" class="plain-select"><option value="99">As far as possible</option>${[2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}">${n} squares</option>`).join('')}</select>
                <label class="chk"><input type="checkbox" id="mv-pass"> Can pass over other pieces</label></div>
              <label class="chk jump-only"><input type="checkbox" id="mv-step"> Squares in between must be empty (like a pawn’s double step)</label>
              <label class="chk"><input type="checkbox" id="mv-first"> Only on this piece’s first move</label></div></details>
            <div class="ctl row"><button type="button" class="btn ghost sm" id="mv-clear">Clear all marks</button>
              <span class="suggest" id="mv-sug"></span></div>
          </div>
          <div class="mv-prev"><div class="pv-box">
              <div class="pv-ctl">
                <div class="seg" id="pv-color" role="radiogroup" aria-label="Preview color"><button type="button" role="radio" data-v="w" aria-checked="true">As White</button><button type="button" role="radio" data-v="b" aria-checked="false">As Black</button></div>
                <div class="seg" id="pv-mode" role="radiogroup" aria-label="Click action"><button type="button" role="radio" data-v="move" aria-checked="true">Move piece</button><button type="button" role="radio" data-v="block" aria-checked="false">Add blockers</button></div>
              </div>
              <div class="pv-board" id="pv-board"></div>
              <p class="hint" id="pv-info"></p>
            </div></div>
        </div>`;
      const $ = (s) => body.querySelector(s);
      const grid = $('#mv-grid');
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const c = document.createElement('div');
        c.className = 'mvc' + (dx === 0 && dy === 0 ? ' center' : '');
        c.dataset.dx = dx; c.dataset.dy = dy;
        grid.append(c);
      }
      renderMoves = () => {
        grid.querySelectorAll('.mvc').forEach((el) => {
          const dx = +el.dataset.dx, dy = +el.dataset.dy;
          if (el.classList.contains('center')) { el.innerHTML = `<img src="${esc(fin.w || BLOCKER)}" alt="">`; return; }
          const c = cells.get(`${dx},${dy}`);
          el.className = 'mvc' + (c ? ` on m-${c.m}` : '');
          el.innerHTML = c
            ? `${c.t === 'slide' ? `<b>${c.r >= 99 ? '∞' : c.r}</b>` : c.t === 'walk' ? '<i class="ring"></i>' : '<i class="dot"></i>'}${c.f ? '<sup>1</sup>' : ''}${c.t === 'slide' && c.j ? '<em>~</em>' : ''}`
            : '';
        });
        $('#trav-hint').textContent = br.travel === 'slide'
          ? 'Slide: mark the square next to the piece and it keeps going that way until something blocks it (like a rook or bishop).'
          : 'Jump: goes straight to the square you mark, nothing can block it (like a knight).';
        body.querySelector('.slide-only').hidden = br.travel !== 'slide';
        body.querySelector('.jump-only').hidden = br.travel !== 'leap';
        const sug = estimateValue({ moves: [...cells.values()] });
        $('#mv-sug').innerHTML = cells.size ? `Suggested strength: <b>${sug}</b> <button type="button" class="link-btn" id="use-sug">Use it</button>` : '';
        $('#use-sug')?.addEventListener('click', () => { p.value = sug; toast(`Strength set to ${sug}.`, 2500); });
      };
      const defFor = (a, b) => {
        const t = br.travel === 'slide' ? 'slide' : (br.step && gcd(a, b) > 1 ? 'walk' : 'leap');
        return { dx: a, dy: b, m: br.act, t, r: t === 'slide' ? br.rep : 1, j: t === 'slide' && br.pass ? 1 : 0, f: br.first ? 1 : 0 };
      };
      let painting = null;      // 'add' | 'remove' while the mouse is down
      const paint = (el) => {
        const dx = +el.dataset.dx, dy = +el.dataset.dy;
        if (!dx && !dy) return;
        for (const [a, b] of symmetric(dx, dy, br.sym)) {
          if (Math.abs(a) > R || Math.abs(b) > R) continue;
          const key = `${a},${b}`;
          if (br.act === 'x' || painting === 'remove') cells.delete(key);
          else cells.set(key, defFor(a, b));
        }
        renderMoves(); renderPreview();
      };
      grid.addEventListener('pointerdown', (e) => {
        const el = e.target.closest('.mvc');
        if (!el || el.classList.contains('center')) return;
        e.preventDefault();
        const dx = +el.dataset.dx, dy = +el.dataset.dy;
        const ex = cells.get(`${dx},${dy}`), nd = defFor(dx, dy);
        painting = br.act !== 'x' && ex && JSON.stringify(ex) === JSON.stringify(nd) ? 'remove' : 'add';   // clicking a mark again removes it
        paint(el);
      });
      grid.addEventListener('pointermove', (e) => {
        if (!painting) return;
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.mvc');
        if (el && el !== grid._last) { grid._last = el; paint(el); }
      });
      const stop = () => { painting = null; grid._last = null; };
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);

      body.querySelectorAll('.mv-right .seg[data-g]').forEach((s) => seg(s, (v) => { br[s.dataset.g] = v; renderMoves(); }));
      $('#mv-sym').addEventListener('change', (e) => { br.sym = e.target.value; });
      $('#mv-rep').addEventListener('change', (e) => { br.rep = +e.target.value; });
      $('#mv-pass').addEventListener('change', (e) => { br.pass = e.target.checked; });
      $('#mv-step').addEventListener('change', (e) => { br.step = e.target.checked; });
      $('#mv-first').addEventListener('change', (e) => { br.first = e.target.checked; });
      const addPreset = (n) => { presetMoves(n).forEach((c) => cells.set(`${c.dx},${c.dy}`, c)); renderMoves(); renderPreview(); };
      $('#mv-presets').addEventListener('click', (e) => { const n = e.target.closest('[data-n]')?.dataset.n; if (n) addPreset(n); });
      $('#mv-more').addEventListener('change', (e) => { if (e.target.value) { addPreset(e.target.value); e.target.value = ''; } });
      $('#mv-clear').addEventListener('click', () => { cells.clear(); renderMoves(); renderPreview(); });

      // live preview board
      const N = 9;
      renderPreview = () => {
        const def = makeDef();
        const blk = { id: 'BLK', name: 'Blocker', sym: 'x', royal: false, value: 0, rel: true, ep: false, promo: [], img: { w: BLOCKER, b: BLOCKER }, moves: [] };
        const enemy = pv.color === 'w' ? 'b' : 'w';
        const g = new CustomChess({
          w: N, h: N, cells: Array(N).fill('1'.repeat(N)), pieces: { X: def, BLK: blk },
          setup: [[pv.x, pv.y, 'X', pv.color], ...pv.blockers.map(([x, y]) => [x, y, 'BLK', enemy])],
        });
        const reach = g.movesFrom(pv.x, pv.y);
        const g2 = createGrid({ w: N, h: N, cells: Array.from({ length: N }, () => Array(N).fill(true)), cell: 36 });
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          if (x === pv.x && y === pv.y) setPiece(g2.at(x, y), def.img[pv.color]);
          else if (pv.blockers.some((b) => b[0] === x && b[1] === y)) setPiece(g2.at(x, y), BLOCKER);
        }
        reach.forEach((m) => g2.at(m.x, m.y).classList.add(m.capture ? 'hl-cap' : 'hl'));
        g2.el.addEventListener('pointerdown', (e) => {
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
        $('#pv-board').replaceChildren(g2.el);
        $('#pv-info').textContent = cells.size
          ? `Green dots: where it can go (${reach.length}). Click any square to move it there.${pv.mode === 'block' ? ' Click squares to add or remove blockers.' : ''}`
          : 'Mark some squares on the left and the moves show up here.';
      };
      seg($('#pv-color'), (v) => { pv.color = v; renderPreview(); });
      seg($('#pv-mode'), (v) => { pv.mode = v; renderPreview(); });
      renderMoves(); renderPreview();
    },
    validate: () => (cells.size ? null : 'Mark at least one square where the piece can go.'),
  };

  // ============================ STEP 4 ============================
  const step4 = {
    label: 'Test', title: 'Step 4 · Test it', hint: 'This is an empty board with only your piece. Play with it, then save.',
    mount(body) {
      body.innerHTML = `
        <div class="test-wrap">
          <div class="test-board" id="tb"></div>
          <div class="test-side">
            <div class="seg" id="tt-color" role="radiogroup" aria-label="Color"><button type="button" role="radio" data-v="w" aria-checked="true">White</button><button type="button" role="radio" data-v="b" aria-checked="false">Black</button></div>
            <div class="seg" id="tt-mode" role="radiogroup" aria-label="Click action"><button type="button" role="radio" data-v="move" aria-checked="true">Move my piece</button><button type="button" role="radio" data-v="enemy" aria-checked="false">Add enemy pieces</button></div>
            <p class="hint" id="tt-info"></p>
            <ul class="tips"><li>Click a green dot to move there. A red ring means it can capture.</li><li>Add enemy pieces to test captures and blocking.</li><li>Try the edges and corners. Does it stay on the board?</li></ul>
            <button type="button" class="btn ghost" id="tt-reset">Reset the board</button>
          </div>
        </div>`;
      const $ = (s) => body.querySelector(s);
      const tt = { color: 'w', mode: 'move', n: 0 };
      let tg = null, pos = 0;
      const build = () => {
        const def = makeDef();
        const blk = { id: 'BLK', name: 'Enemy', sym: 'x', royal: false, value: 0, rel: true, ep: false, promo: [], img: { w: BLOCKER, b: BLOCKER }, moves: [] };
        const pieces = { X: { ...def, promo: p.promo.filter((q) => pieceById(q)), ep: p.ep }, BLK: blk };
        p.promo.forEach((q) => { const d = pieceById(q); if (d) pieces[q] = d; });
        const sx = 3, sy = tt.color === 'w' ? 6 : 1;
        tg = new CustomChess({ w: 8, h: 8, cells: Array(8).fill('11111111'), pieces, setup: [[sx, sy, 'X', tt.color]] });
        pos = sy * 8 + sx; tt.n = 0;
      };
      const render = () => {
        const g = createGrid({ w: 8, h: 8, cells: Array.from({ length: 8 }, () => Array(8).fill(true)), cell: 58 });
        g.el.classList.add('testgrid');
        tg.b.forEach((q, i) => { if (q) setPiece(g.at(i % 8, Math.floor(i / 8)), tg.defs[q.t].img[q.c]); });
        const mine = tg.b[pos];
        const raw = mine ? tg.rawMovesFrom(pos % 8, Math.floor(pos / 8)) : [];
        const byCell = new Map();
        raw.forEach((m) => { if (!byCell.has(m.to)) byCell.set(m.to, m); });
        byCell.forEach((m, to) => g.at(to % 8, Math.floor(to / 8)).classList.add(m.cap ? 'hl-cap' : 'hl'));
        g.el.addEventListener('pointerdown', (e) => {
          const c = e.target.closest('.mc');
          if (!c) return;
          const x = +c.dataset.x, y = +c.dataset.y, i = y * 8 + x;
          if (tt.mode === 'enemy') {
            if (i === pos) return;
            tg.b[i] = tg.b[i] ? null : { t: 'BLK', c: tt.color === 'w' ? 'b' : 'w', m: false };
          } else if (byCell.has(i)) {
            const mv = byCell.get(i);
            const promoted = mv.promo;
            tg.make(mv); pos = i; tt.n++;
            if (promoted) toast(`It promoted into ${tg.defs[promoted].name}. Press “Reset the board” to try your piece again.`);
          }
          render();
        });
        $('#tb').replaceChildren(g.el);
        $('#tt-info').textContent = `Moves made: ${tt.n} · Squares it can reach now: ${byCell.size}`;
      };
      seg($('#tt-color'), (v) => { tt.color = v; build(); render(); });
      seg($('#tt-mode'), (v) => { tt.mode = v; });
      $('#tt-reset').addEventListener('click', () => { build(); render(); });
      build(); render();
    },
  };

  wizard(view, {
    title: existing ? `Edit “${existing.name}”` : 'New piece', steps: [step1, step2, step3, step4], saveLabel: '✓ Save piece',
    async onSave() {
      await commitImages();
      const name = p.name.trim();
      const out = {
        id: p.id, name: name.slice(0, 30), sym: (p.sym || '').trim().slice(0, 2) || name[0].toUpperCase(),
        royal: p.royal, value: p.value, rel: p.rel, ep: p.ep, promo: p.promo,
        img: { w: fin.w, b: fin.b }, moves: [...cells.values()],
      };
      if (!savePiece(out)) { toast('Could not save. Your browser storage may be full. Try exporting and deleting something.'); return; }
      toast(`Saved “${out.name}”.`, 3000);
      location.hash = '#/create';
    },
  });
}
