import { Game } from './game.js';
import { ELO_MIN, ELO_MAX } from './engine.js';

// ---------- settings ----------
const DEFAULTS = {
  name: 'player',
  sound: true,
  hints: true,
  lastMove: true,
  animate: true,
  autoFlip: false,
  theme: 'violet',
};
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('boardly:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('boardly:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const settings = { ...DEFAULTS, ...store.get('settings', {}) };
const saveSettings = () => store.set('settings', settings);
document.documentElement.dataset.theme = settings.theme;

// ---------- play setup state ----------
const TIMES = ['1+0', '3+0', '3+2', '5+0', '10+0', '15+10', '30+0', 'Unlimited'];
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
          <label class="field right"><span>Time</span>
            <span class="select"><select id="f-time">${opt(TIMES, setup.time)}</select></span>
          </label>
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
  view.querySelector('#f-time').addEventListener('change', (e) => { setup.time = e.target.value; saveSetup(); });
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

// ---------- Settings ----------
function settingsPage() {
  const toggles = [
    ['sound', 'Sound effects', 'Play a small sound for moves, captures and checks.'],
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
      <div class="srow stack"><span class="s-title">Board colors</span>
        <div class="themes" role="radiogroup" aria-label="Board colors">
          ${[['violet', 'Violet'], ['lilac', 'Lilac'], ['slate', 'Slate']].map(([k, l]) => `
            <button class="theme t-${k}" role="radio" aria-checked="${settings.theme === k}" data-theme="${k}">
              <span class="sw"><i></i><i></i><i></i><i></i></span>${l}</button>`).join('')}
        </div>
      </div>
      ${toggles.map(([k, t, d]) => `
        <label class="srow"><span><span class="s-title">${t}</span><span class="s-desc">${d}</span></span>
          <input class="switch" type="checkbox" role="switch" data-k="${k}"${settings[k] ? ' checked' : ''}></label>`).join('')}
    </div>`;
  view.querySelector('#s-name').addEventListener('input', (e) => { settings.name = e.target.value.trim(); saveSettings(); });
  view.querySelectorAll('.switch').forEach((s) => s.addEventListener('change', () => { settings[s.dataset.k] = s.checked; saveSettings(); game?.render(); }));
  view.querySelectorAll('.theme').forEach((b) => b.addEventListener('click', () => {
    settings.theme = b.dataset.theme;
    document.documentElement.dataset.theme = settings.theme;
    saveSettings();
    view.querySelectorAll('.theme').forEach((x) => x.setAttribute('aria-checked', x === b));
  }));
}

route();
