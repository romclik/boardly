// The Analyze page (v3.0): pick a game, choose how hard Stockfish thinks, then review every move.
import { Chess } from '../vendor/chess.js';
import { esc, toast } from './ui.js';
import {
  EFFORTS, DEFAULT_ADVANCED, CLASSES, CLASS_BY_ID, readPgn, runAnalysis, rate, loadBook, evalText, winPct, sanFor, fensOf,
} from './analyzer.js';

export const PENDING_KEY = 'boardly:analyze-pending';
const PHRASE = { brilliant: 'is a brilliant move', critical: 'is a critical move', best: 'is the best move', excellent: 'is excellent', okay: 'is okay', inaccuracy: 'is an inaccuracy', mistake: 'is a mistake', blunder: 'is a blunder', theory: 'is a book move' };
const PNG = (c, t) => `pieces/${c}${t.toUpperCase()}.svg`;
const hashStr = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };

export function analyzePage(view, { store, history }) {
  const saved = store.get('analyze-cfg', {});
  const cfg = { effort: 1, custom: false, adv: { ...DEFAULT_ADVANCED }, ...saved };
  cfg.adv = { ...DEFAULT_ADVANCED, ...cfg.adv };
  const saveCfg = () => store.set('analyze-cfg', cfg);
  let root = null;
  let stop = false;
  let keyHandler = null;
  const alive = () => root && root.isConnected;
  const mount = (html, cls) => {
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    view.innerHTML = `<div class="an-root ${cls || ''}">${html}</div>`;
    root = view.firstElementChild;
    return root;
  };
  const presetValues = (i) => { const e = EFFORTS[i]; return { depth: e.depth, ms: e.ms, lines: e.lines, hash: e.hash, book: true, special: true }; };
  const currentOpts = () => (cfg.custom ? { ...cfg.adv } : presetValues(cfg.effort));

  // ================= SETUP =================
  function showSetup(prefill = '') {
    stop = true;
    const games = history.filter((g) => g.pgn && !g.custom);
    mount(`
      <div class="page-head"><h1 class="page-title">ANALYZE</h1><p class="page-sub">Stockfish rates every move of a game, like on chess.com</p></div>
      <div class="an-setup">
        <section class="card">
          <h2>1. Pick a game</h2>
          <textarea id="an-pgn" class="an-text" rows="7" spellcheck="false" placeholder="Paste a PGN here, or open a .pgn file, or pick one of your Boardly games below."></textarea>
          <div class="an-row">
            <button type="button" class="btn ghost sm" id="an-file">Open .pgn file</button>
            <input type="file" id="an-fileinput" accept=".pgn,.txt,text/plain" hidden>
            <span id="an-status" class="an-status" aria-live="polite"></span>
          </div>
          <h3 class="an-sub">Your Boardly games</h3>
          <div class="an-games" id="an-games">${games.length ? games.slice(0, 12).map((g, i) => gameRow(g, i)).join('') : '<p class="an-empty">Games you finish from now on show up here. (Games from before v3.0 did not save their moves.)</p>'}</div>
        </section>
        <section class="card">
          <h2>2. How hard should it think?</h2>
          <div class="an-slider">
            <input type="range" id="an-effort" min="0" max="2" step="1" value="${cfg.effort}" aria-label="Analysis effort">
            <div class="an-ticks"><span>More speed</span><span>Auto</span><span>More effort</span></div>
          </div>
          <p class="an-hint" id="an-hint"></p>
          <details class="an-adv" id="an-adv">
            <summary>Advanced settings</summary>
            <div class="an-fields">
              <label>Depth <small>how many moves ahead (6 to 30)</small><input type="number" id="a-depth" min="6" max="30"></label>
              <label>Time per position <small>milliseconds, 0 = automatic</small><input type="number" id="a-ms" min="0" max="20000" step="100"></label>
              <label>Lines <small>best moves to compare (1 to 5)</small><input type="number" id="a-lines" min="1" max="5"></label>
              <label>Memory <small>engine hash in MB</small>
                <select id="a-hash"><option>16</option><option>32</option><option>64</option><option>128</option></select></label>
              <label class="chk"><input type="checkbox" id="a-book"> Mark opening moves as Theory</label>
              <label class="chk"><input type="checkbox" id="a-special"> Look for Brilliant and Critical moves</label>
            </div>
            <p class="an-hint">Changing anything here switches the slider to “Custom”. Move the slider to go back to a preset.</p>
          </details>
        </section>
        <div class="an-go"><button type="button" class="btn primary" id="an-start">Analyze game</button></div>
      </div>`, 'an-m-setup');
    const $ = (s) => root.querySelector(s);
    const ta = $('#an-pgn');
    const status = $('#an-status');
    let dirty = 0;
    const check = () => {
      const v = ta.value.trim();
      if (!v) { status.textContent = ''; status.className = 'an-status'; return null; }
      try {
        const g = readPgn(v);
        const h = g.headers;
        status.textContent = `✓ ${h.White || 'White'} vs ${h.Black || 'Black'} · ${Math.ceil(g.moves.length / 2)} moves`;
        status.className = 'an-status ok';
        return g;
      } catch (e) { status.textContent = e.message; status.className = 'an-status bad'; return null; }
    };
    ta.addEventListener('input', () => { clearTimeout(dirty); dirty = setTimeout(check, 250); root.querySelectorAll('.an-game').forEach((b) => b.classList.remove('on')); });
    $('#an-file').onclick = () => $('#an-fileinput').click();
    $('#an-fileinput').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      ta.value = await f.text();
      check();
    };
    $('#an-games').addEventListener('click', (e) => {
      const b = e.target.closest('.an-game');
      if (!b) return;
      root.querySelectorAll('.an-game').forEach((x) => x.classList.toggle('on', x === b));
      ta.value = games[+b.dataset.i].pgn;
      check();
    });
    const fillAdv = (o) => { $('#a-depth').value = o.depth; $('#a-ms').value = o.ms; $('#a-lines').value = o.lines; $('#a-hash').value = String(o.hash); $('#a-book').checked = o.book; $('#a-special').checked = o.special; };
    const hint = () => { $('#an-hint').textContent = cfg.custom ? 'Custom settings. You are in charge.' : EFFORTS[cfg.effort].text; };
    $('#an-effort').addEventListener('input', (e) => { cfg.effort = +e.target.value; cfg.custom = false; fillAdv(presetValues(cfg.effort)); hint(); root.classList.remove('is-custom'); saveCfg(); });
    fillAdv(cfg.custom ? cfg.adv : presetValues(cfg.effort));
    if (cfg.custom) root.classList.add('is-custom');
    hint();
    $('#an-adv').addEventListener('input', () => {
      cfg.custom = true;
      cfg.adv = {
        depth: Math.max(6, Math.min(30, +$('#a-depth').value || 16)), ms: Math.max(0, Math.min(20000, +$('#a-ms').value || 0)),
        lines: Math.max(1, Math.min(5, +$('#a-lines').value || 2)), hash: +$('#a-hash').value,
        book: $('#a-book').checked, special: $('#a-special').checked,
      };
      root.classList.add('is-custom'); hint(); saveCfg();
    });
    $('#an-start').onclick = () => {
      const g = check();
      if (!g) { if (!ta.value.trim()) toast('Paste or pick a game first.', 2500); ta.focus(); return; }
      run(ta.value.trim(), g);
    };
    if (prefill) { ta.value = prefill; check(); }
    return $;
  }

  function gameRow(g, i) {
    const res = g.winner === null ? 'Draw' : g.mode === 'bot' ? (g.winner === g.humanColor ? 'Win' : 'Loss') : (g.winner === 'w' ? 'White won' : 'Black won');
    const who = g.mode === 'bot' ? `vs bot ${g.elo}` : 'with a friend';
    return `<button type="button" class="an-game" data-i="${i}"><b class="gr ${res.startsWith('Win') ? 'win' : res === 'Loss' ? 'lose' : 'draw'}">${res}</b><span>${who}</span><small>${Math.ceil(g.plies / 2)} moves · ${new Date(g.date).toLocaleDateString()}</small></button>`;
  }

  // ================= RUNNING =================
  async function run(pgn, game) {
    const opts = currentOpts();
    const key = hashStr(pgn + JSON.stringify([opts.depth, opts.ms, opts.lines, opts.book, opts.special]));
    const cache = store.get('analyses', []);
    const hit = cache.find((c) => c.key === key);
    if (hit) { showReview(game, hit.evals, opts, hit.pgn); return; }
    stop = false;
    mount(`
      <div class="page-head"><h1 class="page-title">ANALYZE</h1><p class="page-sub">${esc(game.headers.White || 'White')} vs ${esc(game.headers.Black || 'Black')}</p></div>
      <section class="card an-prog">
        <div class="an-bar-wrap"><div class="an-bar-fill" id="an-fill"></div></div>
        <p id="an-ptext">Starting the engine…</p>
        <button type="button" class="btn ghost" id="an-cancel">Cancel</button>
      </section>`, 'an-m-progress');
    root.querySelector('#an-cancel').onclick = () => { stop = true; showSetup(pgn); };
    const myRoot = root;
    try {
      const [result] = await Promise.all([
        runAnalysis(game, opts, (done, total) => {
          if (!myRoot.isConnected) return;
          myRoot.querySelector('#an-fill').style.width = `${(done / total) * 100}%`;
          myRoot.querySelector('#an-ptext').textContent = `Checking position ${done} of ${total}…`;
        }, () => stop || !myRoot.isConnected),
        loadBook(),
      ]);
      if (!result || !myRoot.isConnected) return;
      const slim = result.evals.map((e) => ({ lines: e.lines.map((l) => ({ ...l, pv: l.pv.slice(0, 4) })) }));
      try { store.set('analyses', [{ key, evals: slim, pgn }, ...cache].slice(0, 6)); } catch { /* storage full */ }
      showReview(game, slim, opts, pgn);
    } catch (err) {
      if (!myRoot.isConnected) return;
      myRoot.querySelector('.an-prog').innerHTML = `<h2>The engine could not start</h2><p class="an-status bad">${esc(err?.message || 'Unknown error')}</p><p>Stockfish needs the site to be opened from GitHub Pages (or any web server), not from a file on your computer.</p><button type="button" class="btn primary" id="an-back">Back</button>`;
      myRoot.querySelector('#an-back').onclick = () => showSetup(pgn);
    }
  }

  // ================= REVIEW =================
  async function showReview(game, evals, opts, pgn) {
    const book = opts.book ? await loadBook() : {};
    const r = rate(game, evals, opts, book);
    const fens = fensOf(game.startFen, game.moves);
    const n = game.moves.length;
    const h = game.headers;
    const white = h.White || 'White', black = h.Black || 'Black';
    let ply = n;                   // 0 = start position, k = after move k
    let flip = false;
    const wpOf = (i) => winPct(evals[i].lines[0]);
    const counts = { w: {}, b: {} };
    CLASSES.forEach((c) => { counts.w[c.id] = 0; counts.b[c.id] = 0; });
    game.moves.forEach((m, i) => { counts[m.color][r.cls[i].cls]++; });

    mount(`
      <div class="page-head an-head">
        <div><h1 class="page-title">ANALYZE</h1><p class="page-sub">${esc(white)} vs ${esc(black)}${h.Result && h.Result !== '*' ? ' · ' + esc(h.Result) : ''}</p></div>
        <button type="button" class="btn ghost sm" id="an-new">New analysis</button>
      </div>
      <div class="an-wrap">
        <div class="an-left">
          <div class="an-player" id="an-top"></div>
          <div class="an-boardrow">
            <div class="an-evalbar" id="an-evalbar" aria-label="Evaluation"><div class="an-evalfill" id="an-evalfill"></div><span class="an-evaltxt" id="an-evaltxt"></span></div>
            <div class="an-boardbox"><div class="an-board" id="an-board"></div><svg class="an-arrows" id="an-arrows" viewBox="0 0 8 8" aria-hidden="true"></svg></div>
          </div>
          <div class="an-player" id="an-bottom"></div>
          <div class="an-nav">
            <button type="button" class="btn ghost" data-nav="start" aria-label="First position">⏮</button>
            <button type="button" class="btn ghost" data-nav="prev" aria-label="Previous move">◀</button>
            <button type="button" class="btn ghost" data-nav="next" aria-label="Next move">▶</button>
            <button type="button" class="btn ghost" data-nav="end" aria-label="Last position">⏭</button>
            <button type="button" class="btn ghost" data-nav="flip">Flip board</button>
          </div>
        </div>
        <div class="an-right">
          <section class="card an-msg" id="an-msg"></section>
          <section class="card an-sum">
            <div class="an-acc"><div><small>${esc(white)}</small><b>${r.acc.w === null ? '–' : r.acc.w.toFixed(1)}</b></div><span>Accuracy</span><div><small>${esc(black)}</small><b>${r.acc.b === null ? '–' : r.acc.b.toFixed(1)}</b></div></div>
            <table class="an-table">${CLASSES.filter((c) => opts.special || (c.id !== 'brilliant' && c.id !== 'critical')).filter((c) => opts.book || c.id !== 'theory').map((c) => `<tr><td style="color:${c.color}">${c.label}</td><td class="n" style="color:${counts.w[c.id] ? c.color : ''}">${counts.w[c.id]}</td><td class="n" style="color:${counts.b[c.id] ? c.color : ''}">${counts.b[c.id]}</td><td><i class="an-ic" style="background:${c.color}">${c.glyph}</i></td></tr>`).join('')}</table>
          </section>
          <section class="card an-graphcard"><svg id="an-graph" viewBox="0 0 300 70" preserveAspectRatio="none"></svg></section>
          <section class="card an-moves"><div class="an-open" id="an-open"></div><div class="an-list" id="an-list"></div></section>
        </div>
      </div>`, 'an-m-review');
    const $ = (s) => root.querySelector(s);

    // moves list
    const rows = [];
    for (let i = 0; i < n; i += 2) {
      const cell = (k) => (k < n ? `<button type="button" class="an-mv" data-ply="${k + 1}"><i class="an-ic sm" style="background:${CLASS_BY_ID[r.cls[k].cls].color}">${CLASS_BY_ID[r.cls[k].cls].glyph}</i>${esc(game.moves[k].san)}</button>` : '<span></span>');
      rows.push(`<div class="an-pair"><span class="an-num">${i / 2 + 1}</span>${cell(i)}${cell(i + 1)}</div>`);
    }
    $('#an-list').innerHTML = rows.join('');

    // graph
    const pts = evals.map((_, i) => [(i / Math.max(1, n)) * 300, 70 - (wpOf(i) / 100) * 70]);
    $('#an-graph').innerHTML = `<rect width="300" height="70" fill="#3a3a41"/><path d="M0 70 L${pts.map((p) => p.join(' ')).join(' L')} L300 70Z" fill="#e8e8f0"/><line x1="0" y1="35" x2="300" y2="35" stroke="#8d8d98" stroke-width=".5" vector-effect="non-scaling-stroke"/><line id="an-gline" x1="0" x2="0" y1="0" y2="70" stroke="#8a5cff" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    $('#an-graph').addEventListener('pointerdown', (e) => {
      const b = e.currentTarget.getBoundingClientRect();
      go(Math.round(((e.clientX - b.left) / b.width) * n));
    });

    function render() {
      const chess = new Chess(fens[ply]);
      const grid = $('#an-board');
      grid.textContent = '';
      const last = ply > 0 ? game.moves[ply - 1] : null;
      const rowsB = chess.board();
      const files = 'abcdefgh';
      for (let rr = 0; rr < 8; rr++) {
        for (let cc = 0; cc < 8; cc++) {
          const x = flip ? 7 - cc : cc, y = flip ? 7 - rr : rr;           // y = 0 is rank 8
          const name = files[x] + (8 - y);
          const el = document.createElement('div');
          el.className = 'sq ' + ((x + (7 - y)) % 2 === 0 ? 'dark' : 'light');
          if (last && (name === last.from || name === last.to)) el.classList.add('last');
          if (cc === 0) el.insertAdjacentHTML('beforeend', `<i class="coord rank">${8 - y}</i>`);
          if (rr === 7) el.insertAdjacentHTML('beforeend', `<i class="coord file">${files[x]}</i>`);
          const p = rowsB[y][x];
          if (p) { const img = new Image(); img.className = 'pc'; img.src = PNG(p.color, p.type); img.alt = ''; img.draggable = false; el.append(img); }
          if (last && name === last.to) {
            const c = CLASS_BY_ID[r.cls[ply - 1].cls];
            el.insertAdjacentHTML('beforeend', `<b class="an-badge" style="background:${c.color}" title="${c.label}">${c.glyph}</b>`);
          }
          grid.append(el);
        }
      }
      // eval bar
      const wp = wpOf(ply);
      $('#an-evalfill').style.height = `${wp}%`;
      $('#an-evalbar').classList.toggle('flipped', flip);
      const txt = evalText(evals[ply].lines[0]);
      $('#an-evaltxt').textContent = txt;
      $('#an-evaltxt').className = 'an-evaltxt ' + (wp >= 50 ? 'on-white' : 'on-black');
      // players
      const side = (c) => `<span class="an-dot ${c}"></span><b>${esc(c === 'w' ? white : black)}</b><small>${(r.acc[c] ?? null) === null ? '' : r.acc[c].toFixed(1) + '%'}</small>`;
      $('#an-top').innerHTML = side(flip ? 'w' : 'b');
      $('#an-bottom').innerHTML = side(flip ? 'b' : 'w');
      // best-move arrow (only when the played move was not already good)
      const ar = $('#an-arrows');
      ar.innerHTML = '';
      if (ply > 0) {
        const cl = r.cls[ply - 1].cls;
        const bestUci = evals[ply - 1].lines[0]?.pv?.[0];
        if (bestUci && !['best', 'brilliant', 'critical', 'theory'].includes(cl) && bestUci !== game.moves[ply - 1].uci) {
          const pos = (sq) => [flip ? 7 - files.indexOf(sq[0]) : files.indexOf(sq[0]), flip ? +sq[1] - 1 : 8 - +sq[1]];
          const [x1, y1] = pos(bestUci.slice(0, 2)), [x2, y2] = pos(bestUci.slice(2, 4));
          const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          ar.innerHTML = `<g opacity=".8" fill="#7ad04f" stroke="#7ad04f"><line x1="${x1 + .5}" y1="${y1 + .5}" x2="${x2 + .5 - ux * .35}" y2="${y2 + .5 - uy * .35}" stroke-width=".16" stroke-linecap="round"/><polygon stroke="none" points="${x2 + .5},${y2 + .5} ${x2 + .5 - ux * .42 - uy * .24},${y2 + .5 - uy * .42 + ux * .24} ${x2 + .5 - ux * .42 + uy * .24},${y2 + .5 - uy * .42 - ux * .24}"/></g>`;
        }
      }
      // message
      const msg = $('#an-msg');
      if (ply === 0) msg.innerHTML = '<p class="an-line">Start position</p><p class="an-sub2">Use ◀ ▶ or your arrow keys to step through the game.</p>';
      else {
        const m = game.moves[ply - 1], c = CLASS_BY_ID[r.cls[ply - 1].cls];
        const bestUci = evals[ply - 1].lines[0]?.pv?.[0];
        const bestSan = bestUci ? sanFor(fens[ply - 1], bestUci) : null;
        const num = `${Math.ceil(ply / 2)}${m.color === 'w' ? '.' : '...'}`;
        let extra = '';
        if (['inaccuracy', 'mistake', 'blunder', 'okay', 'excellent'].includes(c.id) && bestSan && bestUci !== m.uci) extra = `Best was <b>${esc(bestSan)}</b>.`;
        else if (c.id === 'theory') extra = esc(r.names[ply - 1] || 'Opening book move.');
        else if (c.id === 'critical') extra = 'The only move that keeps the position under control.';
        else if (c.id === 'brilliant') extra = 'A sacrifice that pays off.';
        else if (c.id === 'best') extra = 'The engine’s top choice.';
        msg.innerHTML = `<p class="an-line"><i class="an-ic" style="background:${c.color}">${c.glyph}</i><b>${num} ${esc(m.san)}</b> <span style="color:${c.color}">${PHRASE[c.id]}</span></p><p class="an-sub2">${extra} <span class="an-ev">Eval ${evalText(evals[ply].lines[0])}</span></p>`;
      }
      // opening name
      const nm = ply > 0 ? r.names[ply - 1] : null;
      $('#an-open').textContent = nm || '';
      $('#an-open').hidden = !nm;
      // list + graph marker
      root.querySelectorAll('.an-mv').forEach((b) => b.classList.toggle('cur', +b.dataset.ply === ply));
      const cur = root.querySelector('.an-mv.cur'), box = $('#an-list');
      if (cur) { const t = cur.offsetTop - box.offsetTop; if (t < box.scrollTop || t + cur.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = t - box.clientHeight / 2; }
      const gl = $('#an-gline');
      gl.setAttribute('x1', pts[ply][0]); gl.setAttribute('x2', pts[ply][0]);
      root.querySelectorAll('[data-nav]').forEach((b) => {
        if (b.dataset.nav === 'start' || b.dataset.nav === 'prev') b.disabled = ply === 0;
        if (b.dataset.nav === 'end' || b.dataset.nav === 'next') b.disabled = ply === n;
      });
    }
    function go(p) { ply = Math.max(0, Math.min(n, p)); render(); }

    root.querySelector('.an-nav').addEventListener('click', (e) => {
      const a = e.target.closest('[data-nav]')?.dataset.nav;
      if (a === 'start') go(0); else if (a === 'prev') go(ply - 1); else if (a === 'next') go(ply + 1); else if (a === 'end') go(n);
      else if (a === 'flip') { flip = !flip; render(); }
    });
    $('#an-list').addEventListener('click', (e) => { const b = e.target.closest('.an-mv'); if (b) go(+b.dataset.ply); });
    $('#an-new').onclick = () => showSetup(pgn);
    const myRoot = root;
    keyHandler = (e) => {
      if (!myRoot.isConnected) { document.removeEventListener('keydown', keyHandler); return; }
      if (e.target.closest?.('input,textarea,select')) return;
      if (e.key === 'ArrowLeft') { go(ply - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { go(ply + 1); e.preventDefault(); }
      else if (e.key === 'Home') { go(0); e.preventDefault(); }
      else if (e.key === 'End') { go(n); e.preventDefault(); }
      else if (e.key === 'f') { flip = !flip; render(); }
    };
    document.addEventListener('keydown', keyHandler);
    // open on the last position, from the point of view of the human player when we know it
    flip = !!(history[0] && history[0].humanColor === 'b' && history[0].pgn === pgn);
    render();
  }

  // ================= START =================
  const pending = sessionStorage.getItem(PENDING_KEY);
  if (pending) {
    sessionStorage.removeItem(PENDING_KEY);
    showSetup(pending);
    root.querySelector('#an-start').click();
  } else showSetup();
}
