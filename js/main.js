import { Game } from './game.js';
import { ELO_MIN, ELO_MAX } from './engine.js';
import { SITE_THEMES, BOARD_THEMES, applyThemes } from './themes.js';
import { MINUTES, INCS, PRESETS, timeLabel, category, nearestIndex, minLabel } from './time.js';
import * as sfx from './sound.js';
import { createPage } from './create.js';
import { allBoards, boardById, pieceById, resolveVariant, customPieces, customBoards } from './library.js';
import { dropdown } from './dropdown.js';
import { thumbBoard, createGrid, setPiece } from './boardview.js';
import { openCustomSetup } from './customsetup.js';
import { toast } from './ui.js';

// ---------- settings ----------
const DEFAULTS = {
  name: 'player',
  sound: true,
  hints: true,
  lastMove: true,
  animate: true,
  autoFlip: false,
  volume: 70,
  accent: 'purple',
  board: 'violet',
};
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('boardly:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('boardly:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const settings = { ...DEFAULTS, ...store.get('settings', {}) };
if (settings.theme) {            // v1.0 stored the board colors as "theme"
  if (BOARD_THEMES.some((b) => b.id === settings.theme)) settings.board = settings.theme;
  delete settings.theme;
}
const saveSettings = () => store.set('settings', settings);
applyThemes(settings);

// ---------- play setup state ----------
const setup = { mode: 'bot', gamemode: 'Classic', time: '15+10', elo: 1800, color: 'w', boardId: 'classic', setupId: 'standard', ...store.get('setup', {}) };
const saveSetup = () => store.set('setup', setup);

let game = null;
let autoOpenCustom = false;   // set by the Home tiles so the Custom popup opens right away
let customEdit = null;      // an edited position for the next Custom game: { boardId, setupId, pieces }
const view = document.getElementById('view');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- router ----------
function route() {
  const parts = (location.hash.replace('#/', '') || 'home').split('?')[0].split('/');
  const name = parts[0];
  const pages = { home, play, settings: settingsPage, create: () => createPage(view, parts.slice(1)) };
  const page = pages[name] ? name : 'home';
  document.querySelectorAll('.sidebar a[data-route]').forEach((a) => {
    const on = a.dataset.route === page;
    a.classList.toggle('active', on);
    a.toggleAttribute('aria-current', on);
  });
  game?.root.remove();
  view.textContent = '';
  view.className = 'view page-' + page;
  pages[page]();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function updateLive() {
  document.querySelector('.live').hidden = !(game && game.active);
}

window.addEventListener('beforeunload', (e) => {
  if (game && game.active && game.chess.history().length) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Home ----------
const TIPS = [
  'Fight for the center early. Pawns and pieces there reach everywhere.',
  'Develop your knights and bishops before moving the same piece twice.',
  'Before every move ask: what is my opponent threatening?',
  'Look for checks, captures and threats first, then quieter moves.',
  'Rooks love open files. Put them where pawns have gone.',
  'A knight in the corner sees only two squares. Keep knights near the center.',
  'When you are ahead in material, trade pieces. When behind, keep the game complicated.',
  'In the endgame your king turns into a strong piece. Bring it to the center.',
  'Never leave a piece undefended if you can help it.',
  'Slow down on the clock: most blunders happen in a hurry.',
  'Try Custom mode: give a pawn knight moves and see what happens.',
  'Every piece you create can be tested on an empty board before you save it.',
  'Export your creations now and then. The file is your backup.',
  'Playing a bot below 1000 Elo? Practice spotting its mistakes and punish them.',
];

const HIST_MAX = 50;
let history = store.get('history', []);
function recordGame(info) {
  history.unshift(info);
  history.length = Math.min(history.length, HIST_MAX);
  store.set('history', history);
}

function ago(ts) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(ts).toLocaleDateString();
}

function outcome(g) {
  if (g.mode === 'bot') {
    if (g.winner === null) return { tag: 'Draw', cls: 'draw' };
    return g.winner === g.humanColor ? { tag: 'Win', cls: 'win' } : { tag: 'Loss', cls: 'lose' };
  }
  return g.winner === null ? { tag: 'Draw', cls: 'draw' } : { tag: g.winner === 'w' ? 'White' : 'Black', cls: 'friend' };
}

function home() {
  const name = esc(settings.name || 'player');
  const resume = game && game.active;
  const day = Math.floor(Date.now() / 86400000);
  const tip = TIPS[day % TIPS.length];
  const bots = history.filter((g) => g.mode === 'bot');
  const wins = bots.filter((g) => g.winner === g.humanColor);
  const best = wins.reduce((t, g) => Math.max(t, g.elo || 0), 0);
  const draws = bots.filter((g) => g.winner === null).length;
  const mine = { pieces: customPieces(), boards: customBoards() };
  const art = (a, b, cls = '') => `<div class="tile-art ${cls}" aria-hidden="true"><div class="tile-board"></div><img class="tp tp-k" src="${a}" alt=""><img class="tp tp-b" src="${b}" alt=""></div>`;

  view.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">HOME</h1>
      <p class="page-sub">Welcome, ${name}</p>
    </div>

    <section class="hero">
      <div class="hero-text">
        <h2>${resume ? 'Your game is waiting' : 'Ready for your next game?'}</h2>
        <p>${resume ? 'Pick up right where you left off.' : 'Challenge a Stockfish bot, play a friend on the same screen, or invent your own pieces and boards.'}</p>
        <div class="hero-actions">
          <a class="btn primary cta" href="#/play" id="h-play">${resume ? 'Resume game' : 'Play now'}</a>
          <a class="btn ghost cta" href="#/create">Create something</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="tile-board"></div>
        <img class="hp hp1" src="pieces/wK.svg" alt=""><img class="hp hp2" src="pieces/bB.svg" alt="">
        <img class="hp hp3" src="pieces/wN.svg" alt=""><img class="hp hp4" src="pieces/bQ.svg" alt="">
      </div>
    </section>

    <h3 class="home-h">Jump in</h3>
    <div class="tiles">
      <a class="tile" href="#/play" data-go="bot" aria-label="Play against a bot">${art('pieces/wK.svg', 'pieces/bB.svg')}<div class="tile-label">BOT<small>Stockfish, 100 to 3200 Elo</small></div></a>
      <a class="tile" href="#/play" data-go="friend" aria-label="Play with a friend">${art('pieces/wN.svg', 'pieces/bN.svg', 'alt1')}<div class="tile-label">FRIEND<small>Two players, one screen</small></div></a>
      <a class="tile" href="#/play" data-go="custom" aria-label="Play a custom game">${art(mine.pieces[0]?.img.w || 'pieces/wR.svg', mine.pieces[0]?.img.b || 'pieces/bP.svg', 'alt2')}<div class="tile-label">CUSTOM<small>Your boards and pieces</small></div></a>
      <a class="tile" href="#/create" aria-label="Create pieces and boards">${art('pieces/wQ.svg', 'pieces/bR.svg', 'alt3')}<div class="tile-label">CREATE<small>Draw pieces, shape boards</small></div></a>
    </div>

    <div class="home-grid">
      <section class="hcard" aria-labelledby="hs">
        <h3 id="hs">Your stats</h3>
        ${history.length ? `
        <div class="stat-grid">
          <div><b>${history.length}</b><span>games played</span></div>
          <div><b>${wins.length}</b><span>wins vs bot</span></div>
          <div><b>${draws}</b><span>draws vs bot</span></div>
          <div><b>${bots.length - wins.length - draws}</b><span>losses vs bot</span></div>
        </div>
        ${best ? `<p class="muted">Strongest bot beaten: <b>${best} Elo</b></p>` : '<p class="muted">Beat a bot to set your record.</p>'}` : '<p class="muted">Play your first game and your stats will show up here.</p>'}
      </section>

      <section class="hcard" aria-labelledby="hr">
        <h3 id="hr">Recent games</h3>
        ${history.length ? `<ul class="recent">${history.slice(0, 5).map((g) => {
    const o = outcome(g);
    const who = g.mode === 'bot' ? `Bot (${g.elo})` : 'Friend';
    return `<li><span class="res ${o.cls}">${o.tag}</span><span class="rt"><b>${who}${g.custom ? ' · Custom' : ''}</b><small>${ago(g.date)} · ${Math.ceil(g.plies / 2)} moves</small></span></li>`;
  }).join('')}</ul>` : '<p class="muted">No games yet.</p>'}
      </section>

      <section class="hcard tipcard" aria-labelledby="ht">
        <h3 id="ht">Tip of the day</h3>
        <p class="tip">${esc(tip)}</p>
      </section>

      <section class="hcard" aria-labelledby="hm">
        <h3 id="hm">Your creations</h3>
        ${mine.pieces.length || mine.boards.length ? `
        <p class="muted">${mine.pieces.length} piece${mine.pieces.length === 1 ? '' : 's'} · ${mine.boards.length} board${mine.boards.length === 1 ? '' : 's'}</p>
        <div class="mine-row">${mine.pieces.slice(0, 6).map((p) => `<a href="#/create/piece/${encodeURIComponent(p.id)}" title="${esc(p.name)}"><img src="${esc(p.img.w)}" alt="${esc(p.name)}"></a>`).join('')}</div>
        <a class="link-btn" href="#/create">Open Create →</a>` : `
        <p class="muted">Nothing yet. Make a piece that moves any way you like, then a board to play it on.</p>
        <a class="btn primary sm" href="#/create/piece/new">Make your first piece</a>`}
      </section>
    </div>`;

  view.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => {
    if (game && game.over) { game.destroy(); game = null; updateLive(); }
    if (game && game.active) { toast('Finish or resign your current game first.'); return; }
    const go = a.dataset.go;
    setup.gamemode = go === 'custom' ? 'Custom' : 'Classic';
    if (go !== 'custom') setup.mode = go;
    saveSetup();
    if (go === 'custom') autoOpenCustom = true;
  }));
  view.querySelector('#h-play').addEventListener('click', () => { if (game && game.over) { game.destroy(); game = null; updateLive(); } });
}

// ---------- Play ----------
function play() {
  if (game) { view.append(game.root); return; }
  const isBot = setup.mode === 'bot';
  const custom = setup.gamemode === 'Custom';
  const boards = allBoards();
  const board = boardById(setup.boardId) || boards[0];
  const curSetup = board.setups.find((s) => s.id === setup.setupId) || board.setups[0];
  if (custom) { setup.boardId = board.id; setup.setupId = curSetup.id; }
  const edited = custom && customEdit && customEdit.boardId === board.id && customEdit.setupId === curSetup.id;
  const opt = (list, cur) => list.map((t) => `<option${t === cur ? ' selected' : ''}>${t}</option>`).join('');
  view.innerHTML = `
    <div class="setup">
      <section class="setup-list">
        <h1 class="page-title">PLAY</h1>
        <p class="page-sub">Play a game of chess</p>
        <div class="mode-list" role="radiogroup" aria-label="Opponent">
          ${modeBtn('friend', 'With friend')}
          ${modeBtn('bot', 'With bot')}
        </div>
      </section>
      <section class="setup-panel" aria-labelledby="sp-title">
        <h2 id="sp-title">${isBot ? 'Play with bot' : 'Play with friend'}</h2>
        <div class="fields">
          <label class="field"><span>Gamemode</span>
            <span class="select"><select id="f-mode">${opt(['Classic', 'Custom'], setup.gamemode)}</select></span>
          </label>
          <div class="field right"><span id="lbl-time">Time</span>
            <span class="select"><button type="button" class="selbtn" id="f-time" aria-labelledby="lbl-time f-time" aria-haspopup="dialog">${timeLabel(setup.time)}</button></span>
          </div>
        </div>
        ${custom ? `
        <div class="custom-card">
          <div class="cc-thumb" id="cc-thumb"></div>
          <div class="cc-body"><b>${esc(board.name)}</b><small>${esc(curSetup.name)}${edited ? ' · edited position' : ''}${setup.kingCapture ? ' · King capture' : ''}${setup.noDraw ? ' · No draws' : ''}</small></div>
          <button type="button" class="btn primary sm" id="cc-open">Change setup…</button>
        </div>
        <p class="hint2">Pick a board and a starting layout, and move any pieces around for this game. Custom games have no castling.${isBot ? ' The bot uses its own engine here (Stockfish only knows normal chess).' : ''}</p>` : ''}
        ${isBot ? `
        <div class="diff">
          <label for="f-elo">Difficulty</label>
          <div class="range" style="--pct:${pct(setup.elo)}">
            <input id="f-elo" type="range" min="${ELO_MIN}" max="${ELO_MAX}" step="100" value="${setup.elo}">
            <output id="elo-out" for="f-elo">${setup.elo} Elo</output>
          </div>
        </div>
        <div class="diff">
          <span class="lbl" id="lbl-color">Play as</span>
          <div class="seg" role="radiogroup" aria-labelledby="lbl-color">
            ${['w:White', 'r:Random', 'b:Black'].map((s) => { const [v, l] = s.split(':'); return `<button type="button" role="radio" aria-checked="${setup.color === v}" data-color="${v}">${l}</button>`; }).join('')}
          </div>
        </div>` : ''}
        <button class="btn primary big start" id="start">PLAY</button>
      </section>
    </div>`;

  view.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => { setup.mode = b.dataset.mode; saveSetup(); play(); }));
  view.querySelector('#f-mode').addEventListener('change', (e) => { setup.gamemode = e.target.value; saveSetup(); play(); if (setup.gamemode === 'Custom') openCustomDialog(); });
  view.querySelector('#f-time').addEventListener('click', () => timePopup((t) => {
    setup.time = t; saveSetup();
    view.querySelector('#f-time').textContent = timeLabel(t);
  }));
  if (custom) {
    view.querySelector('#cc-thumb').append(thumbBoard(board, { pieces: edited ? customEdit.pieces : curSetup.pieces }, pieceById, 130));
    view.querySelector('#cc-open').addEventListener('click', openCustomDialog);
  }
  const elo = view.querySelector('#f-elo');
  if (elo) {
    elo.addEventListener('input', () => {
      setup.elo = +elo.value;
      elo.parentElement.style.setProperty('--pct', pct(setup.elo));
      view.querySelector('#elo-out').textContent = `${setup.elo} Elo`;
      saveSetup();
    });
    view.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      setup.color = b.dataset.color; saveSetup();
      view.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-checked', x === b));
    }));
  }
  view.querySelector('#start').addEventListener('click', startGame);
  if (autoOpenCustom && custom) { autoOpenCustom = false; openCustomDialog(); }
}

function openCustomDialog() {
  const match = customEdit && customEdit.boardId === setup.boardId && customEdit.setupId === setup.setupId;
  openCustomSetup({ boardId: setup.boardId, setupId: setup.setupId, pieces: match ? customEdit.pieces : null, rules: { kingCapture: setup.kingCapture, noDraw: setup.noDraw } }, (res) => {
    setup.boardId = res.boardId; setup.setupId = res.setupId;
    setup.kingCapture = res.rules.kingCapture; setup.noDraw = res.rules.noDraw;
    customEdit = res.edited ? { boardId: res.boardId, setupId: res.setupId, pieces: res.pieces } : null;
    saveSetup();
    play();
  });
}

const pct = (v) => (v - ELO_MIN) / (ELO_MAX - ELO_MIN);

function modeBtn(mode, label) {
  const on = setup.mode === mode;
  return `<button class="mode-btn${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-mode="${mode}">
    <span>${label}</span>
    ${on ? '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M4 12.5l5.2 5.2L20 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
  </button>`;
}

function startGame() {
  const color = setup.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color;
  let variant = null;
  if (setup.gamemode === 'Custom') {
    const useEdit = customEdit && customEdit.boardId === setup.boardId && customEdit.setupId === setup.setupId;
    variant = resolveVariant(setup.boardId, setup.setupId, useEdit ? customEdit.pieces : null);
    if (variant) variant.rules = { kingCapture: !!setup.kingCapture, noDraw: !!setup.noDraw };
    if (!variant) { toast('That board no longer exists. Pick another one.'); return; }
    if (!variant.setup.some((e) => e[3] === 'w') || !variant.setup.some((e) => e[3] === 'b')) {
      toast('This placement needs pieces for both White and Black. Edit the board in Create.');
      return;
    }
  }
  game?.destroy();
  game = new Game(
    { mode: setup.mode, time: setup.time, elo: setup.elo, color, variant },
    settings,
    {
      onChange: updateLive,
      onFinish: recordGame,
      onNew: () => { game?.destroy(); game = null; updateLive(); route(); },
      onRematch: () => { game?.destroy(); game = null; startGame(); },
    },
  );
  updateLive();
  route();
}

// ---------- Time popup ----------
function timePopup(onSave) {
  const unl = setup.time === 'Unlimited';
  const [m0, i0] = unl ? [15, 10] : setup.time.split('+').map(Number);
  let mi = nearestIndex(MINUTES, m0);
  let ii = nearestIndex(INCS, i0 || 0);
  let unlimited = unl;

  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `
    <div class="modal-card tc" role="dialog" aria-modal="true" aria-label="Time control">
      <h3>Time control</h3>
      <div class="tc-read"><strong id="tc-big"></strong><span id="tc-cat"></span></div>
      <div class="chips" role="group" aria-label="Quick picks">
        ${PRESETS.map((p) => `<button type="button" class="chip" data-p="${p}">${timeLabel(p)}</button>`).join('')}
      </div>
      <div class="tc-sliders">
        <div class="tc-row"><label for="tc-min">Total time</label><output id="tc-min-out"></output></div>
        <div class="range plain"><input id="tc-min" type="range" min="0" max="${MINUTES.length - 1}" step="1" value="${mi}"></div>
        <div class="tc-row"><label for="tc-inc">Increment per move</label><output id="tc-inc-out"></output></div>
        <div class="range plain"><input id="tc-inc" type="range" min="0" max="${INCS.length - 1}" step="1" value="${ii}"></div>
      </div>
      <label class="tc-unl"><span>No clock<small>Play without a time limit</small></span>
        <input class="switch" id="tc-unl" type="checkbox" role="switch"${unlimited ? ' checked' : ''}></label>
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-a="cancel">Cancel</button>
        <button type="button" class="btn primary" data-a="save">Save</button>
      </div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const current = () => (unlimited ? 'Unlimited' : `${MINUTES[mi]}+${INCS[ii]}`);
  const paint = () => {
    const t = current();
    $('#tc-big').textContent = unlimited ? 'Unlimited' : `${minLabel(MINUTES[mi])} + ${INCS[ii]}`;
    $('#tc-cat').textContent = category(t);
    $('#tc-min-out').textContent = `${minLabel(MINUTES[mi])} ${MINUTES[mi] <= 1 ? 'minute' : 'minutes'}`;
    $('#tc-inc-out').textContent = `${INCS[ii]} ${INCS[ii] === 1 ? 'second' : 'seconds'}`;
    $('#tc-min').parentElement.style.setProperty('--pct', mi / (MINUTES.length - 1));
    $('#tc-inc').parentElement.style.setProperty('--pct', ii / (INCS.length - 1));
    $('.tc-sliders').classList.toggle('off', unlimited);
    $('#tc-min').disabled = $('#tc-inc').disabled = unlimited;
    el.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', !unlimited && c.dataset.p === t));
  };
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('#tc-min').addEventListener('input', (e) => { mi = +e.target.value; paint(); });
  $('#tc-inc').addEventListener('input', (e) => { ii = +e.target.value; paint(); });
  $('#tc-unl').addEventListener('change', (e) => { unlimited = e.target.checked; paint(); });
  el.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    const [m, i] = c.dataset.p.split('+').map(Number);
    mi = nearestIndex(MINUTES, m); ii = nearestIndex(INCS, i); unlimited = false;
    $('#tc-min').value = mi; $('#tc-inc').value = ii; $('#tc-unl').checked = false;
    paint();
  }));
  $('[data-a=cancel]').addEventListener('click', close);
  $('[data-a=save]').addEventListener('click', () => { onSave(current()); close(); });
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  paint();
  document.body.append(el);
  $('[data-a=save]').focus();
}

// ---------- Settings ----------
function settingsPage() {
  const gameplay = [
    ['hints', 'Show legal moves', 'Mark where the selected piece can go.'],
    ['lastMove', 'Highlight last move', 'Tint the squares of the most recent move.'],
    ['animate', 'Animate pieces', 'Slide pieces across the board.'],
    ['autoFlip', 'Flip board after each move', 'For friend games on one screen. Turns the board toward whoever is moving.'],
  ];
  const sw = {
    site: (t) => `<span class="dotc" style="background:linear-gradient(135deg, ${t.hi}, ${t.main} 60%, ${t.sel})"></span>`,
    board: (t) => `<span class="sw" style="--l:${t.l};--d:${t.d}"><i></i><i></i><i></i><i></i></span>`,
  };
  const row = (title, desc, control) => `<div class="srow"><span><span class="s-title">${title}</span><span class="s-desc">${desc}</span></span>${control}</div>`;
  const toggle = (k, t, d) => row(t, d, `<input class="switch" type="checkbox" role="switch" aria-label="${t}" data-k="${k}"${settings[k] ? ' checked' : ''}>`);

  view.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">SETTINGS</h1>
      <p class="page-sub">Make Boardly yours</p>
    </div>
    <div class="settings">
      <section class="cat" aria-labelledby="c-prof"><h2 id="c-prof" class="cat-title">Profile</h2>
        <div class="srow stack"><label class="s-title" for="s-name">Your name</label><input class="text" id="s-name" maxlength="20" value="${esc(settings.name)}" placeholder="player" autocomplete="nickname"></div>
      </section>

      <section class="cat" aria-labelledby="c-app"><h2 id="c-app" class="cat-title">Appearance</h2>
        ${row('Site theme', 'The main color of buttons, highlights and sliders.', '<span id="dd-site"></span>')}
        ${row('Board theme', 'Colors of the squares.', '<span id="dd-board"></span>')}
        <div class="srow preview-row"><span class="s-title">Preview</span><div id="theme-prev"></div></div>
      </section>

      <section class="cat" aria-labelledby="c-snd"><h2 id="c-snd" class="cat-title">Sound</h2>
        ${toggle('sound', 'Sound effects', 'Piece sounds, checks and game results.')}
        <div class="srow stack"><label class="s-title" for="s-vol">Volume</label>
          <div class="range plain" style="--pct:${settings.volume / 100}"><input id="s-vol" type="range" min="0" max="100" step="5" value="${settings.volume}"></div></div>
      </section>

      <section class="cat" aria-labelledby="c-play"><h2 id="c-play" class="cat-title">Gameplay</h2>
        ${gameplay.map(([k, t, d]) => toggle(k, t, d)).join('')}
      </section>

      <p class="foot">Boardly 2026. Made by Claude. v2.3</p>
    </div>`;

  view.querySelector('#s-name').addEventListener('input', (e) => { settings.name = e.target.value.trim(); saveSettings(); });
  view.querySelectorAll('.switch').forEach((s) => s.addEventListener('change', () => {
    settings[s.dataset.k] = s.checked; saveSettings(); game?.render();
    if (s.dataset.k === 'sound' && s.checked) sfx.play('move', settings);
  }));
  const vol = view.querySelector('#s-vol');
  vol.addEventListener('input', () => { settings.volume = +vol.value; vol.parentElement.style.setProperty('--pct', vol.value / 100); saveSettings(); });
  vol.addEventListener('change', () => sfx.play('capture', settings));

  // theme dropdowns
  view.querySelector('#dd-site').replaceWith(dropdown({
    label: 'Site theme', value: settings.accent, items: SITE_THEMES.map((t) => ({ id: t.id, name: t.name, swatch: sw.site(t) })),
    onChange: (id) => { settings.accent = id; applyThemes(settings); saveSettings(); },
  }));
  view.querySelector('#dd-board').replaceWith(dropdown({
    label: 'Board theme', value: settings.board, items: BOARD_THEMES.map((t) => ({ id: t.id, name: t.name, swatch: sw.board(t) })),
    onChange: (id) => { settings.board = id; applyThemes(settings); saveSettings(); },
  }));

  // little board that follows the chosen colors
  const g = createGrid({ w: 6, h: 3, cell: 44, cells: Array.from({ length: 3 }, () => Array(6).fill(true)) });
  g.el.classList.add('thumb');
  [[1, 0, 'bK'], [3, 0, 'bQ'], [4, 1, 'bP'], [1, 2, 'wN'], [2, 2, 'wB'], [4, 2, 'wK']].forEach(([x, y, p]) => setPiece(g.at(x, y), `pieces/${p}.svg`));
  view.querySelector('#theme-prev').append(g.el);
}

route();
