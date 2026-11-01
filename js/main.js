import { Game } from './game.js';
import { ELO_MIN, ELO_MAX } from './engine.js';
import { SITE_THEMES, BOARD_THEMES, applyThemes } from './themes.js';
import { MINUTES, INCS, PRESETS, timeLabel, category, nearestIndex, minLabel } from './time.js';
import * as sfx from './sound.js';

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
const setup = { mode: 'bot', gamemode: 'Classic', time: '15+10', elo: 1800, color: 'w', ...store.get('setup', {}) };
const saveSetup = () => store.set('setup', setup);

let game = null;
const view = document.getElementById('view');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- router ----------
function route() {
  const name = (location.hash.replace('#/', '') || 'home').split('?')[0];
  const page = { home, play, settings: settingsPage }[name] ? name : 'home';
  document.querySelectorAll('.sidebar a[data-route]').forEach((a) => {
    const on = a.dataset.route === page;
    a.classList.toggle('active', on);
    a.toggleAttribute('aria-current', on);
  });
  game?.root.remove();
  view.textContent = '';
  view.className = 'view page-' + page;
  ({ home, play, settings: settingsPage })[page]();
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
function home() {
  view.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">HOME</h1>
      <p class="page-sub">Welcome, ${esc(settings.name || 'player')}</p>
    </div>
    <a class="tile" href="#/play" aria-label="Play chess">
      <div class="tile-art" aria-hidden="true">
        <div class="tile-board"></div>
        <img class="tp tp-k" src="pieces/wK.svg" alt="">
        <img class="tp tp-b" src="pieces/bB.svg" alt="">
      </div>
      <div class="tile-label">PLAY</div>
    </a>`;
}

// ---------- Play ----------
function play() {
  if (game) { view.append(game.root); return; }
  const isBot = setup.mode === 'bot';
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
            <span class="select"><select id="f-mode">${opt(['Classic'], setup.gamemode)}</select></span>
          </label>
          <div class="field right"><span id="lbl-time">Time</span>
            <span class="select"><button type="button" class="selbtn" id="f-time" aria-labelledby="lbl-time f-time" aria-haspopup="dialog">${timeLabel(setup.time)}</button></span>
          </div>
        </div>
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
  view.querySelector('#f-mode').addEventListener('change', (e) => { setup.gamemode = e.target.value; saveSetup(); });
  view.querySelector('#f-time').addEventListener('click', () => timePopup((t) => {
    setup.time = t; saveSetup();
    view.querySelector('#f-time').textContent = timeLabel(t);
  }));
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
  game?.destroy();
  game = new Game(
    { mode: setup.mode, time: setup.time, elo: setup.elo, color },
    settings,
    {
      onChange: updateLive,
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
  const toggles = [
    ['hints', 'Show legal moves', 'Mark where the selected piece can go.'],
    ['lastMove', 'Highlight last move', 'Tint the squares of the most recent move.'],
    ['animate', 'Animate pieces', 'Slide pieces across the board.'],
    ['autoFlip', 'Flip board after each move', 'For friend games on one screen. Turns the board toward whoever is moving.'],
  ];
  view.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">SETTINGS</h1>
      <p class="page-sub">Make Boardly yours</p>
    </div>
    <div class="settings">
      <label class="srow stack"><span class="s-title">Your name</span>
        <input class="text" id="s-name" maxlength="20" value="${esc(settings.name)}" placeholder="player" autocomplete="nickname"></label>

      <div class="srow stack"><span class="s-title">Site theme</span>
        <span class="s-desc">Changes the main color across Boardly.</span>
        <div class="swatches" id="site-themes" role="radiogroup" aria-label="Site theme">
          ${SITE_THEMES.map((t) => `
            <button class="swatch" role="radio" aria-checked="${settings.accent === t.id}" data-id="${t.id}" title="${t.name}">
              <span class="dotc" style="background:linear-gradient(135deg, ${t.hi}, ${t.main} 60%, ${t.sel})"></span>${t.name}
            </button>`).join('')}
        </div>
      </div>

      <div class="srow stack"><span class="s-title">Board theme</span>
        <span class="s-desc">Colors of the squares.</span>
        <div class="swatches" id="board-themes" role="radiogroup" aria-label="Board theme">
          ${BOARD_THEMES.map((t) => `
            <button class="swatch" role="radio" aria-checked="${settings.board === t.id}" data-id="${t.id}" title="${t.name}">
              <span class="sw" style="--l:${t.l};--d:${t.d}"><i></i><i></i><i></i><i></i></span>${t.name}
            </button>`).join('')}
        </div>
      </div>

      <label class="srow"><span><span class="s-title">Sound effects</span><span class="s-desc">Piece sounds, checks and game results.</span></span>
        <input class="switch" type="checkbox" role="switch" data-k="sound"${settings.sound ? ' checked' : ''}></label>
      <div class="srow stack"><label class="s-title" for="s-vol">Volume</label>
        <div class="range plain" style="--pct:${settings.volume / 100}"><input id="s-vol" type="range" min="0" max="100" step="5" value="${settings.volume}"></div>
      </div>

      ${toggles.map(([k, t, d]) => `
        <label class="srow"><span><span class="s-title">${t}</span><span class="s-desc">${d}</span></span>
          <input class="switch" type="checkbox" role="switch" data-k="${k}"${settings[k] ? ' checked' : ''}></label>`).join('')}

      <p class="foot">Boardly 2026. Made by Claude. v1.1</p>
    </div>`;

  view.querySelector('#s-name').addEventListener('input', (e) => { settings.name = e.target.value.trim(); saveSettings(); });
  view.querySelectorAll('.switch').forEach((s) => s.addEventListener('change', () => {
    settings[s.dataset.k] = s.checked; saveSettings(); game?.render();
    if (s.dataset.k === 'sound' && s.checked) sfx.play('move', settings);
  }));
  const vol = view.querySelector('#s-vol');
  vol.addEventListener('input', () => { settings.volume = +vol.value; vol.parentElement.style.setProperty('--pct', vol.value / 100); saveSettings(); });
  vol.addEventListener('change', () => sfx.play('capture', settings));
  const pick = (groupId, key) => view.querySelectorAll(`#${groupId} .swatch`).forEach((b) => b.addEventListener('click', () => {
    settings[key] = b.dataset.id;
    applyThemes(settings);
    saveSettings();
    view.querySelectorAll(`#${groupId} .swatch`).forEach((x) => x.setAttribute('aria-checked', x === b));
  }));
  pick('site-themes', 'accent');
  pick('board-themes', 'board');
}

route();
