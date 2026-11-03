import { Chess } from '../vendor/chess.js';
import { CustomChess, FILES as CFILES } from './rules.js';
import { Engine, fallbackMove } from './engine.js';
import { parseTime } from './time.js';
import { modal, toast } from './ui.js';
import * as sfx from './sound.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const CLASSIC_GEO = {
  w: 8, h: 8, cells: Array.from({ length: 8 }, () => Array(8).fill(true)), shaped: false,
  imgOf: (c, t) => `pieces/${c}${t.toUpperCase()}.svg`,
  valueOf: (t) => VALUE[t] ?? 0,
  nameOf: (t) => NAMES[t],
  isRoyal: (t) => t === 'k',
};

// Bot for custom boards runs in a background worker so the page never freezes.
let botWorker = null, botFailed = false, botSeq = 0;
const botPending = new Map();
async function runCustomBot(state, opts) {
  if (!botFailed) {
    try {
      if (!botWorker) {
        botWorker = new Worker(new URL('./botworker.js', import.meta.url), { type: 'module' });
        botWorker.onmessage = (e) => {
          const p = botPending.get(e.data.id);
          if (!p) return;
          botPending.delete(e.data.id);
          if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.move);
        };
        botWorker.onerror = () => { botFailed = true; botPending.forEach((p) => p.reject(new Error('worker'))); botPending.clear(); };
      }
      return await new Promise((resolve, reject) => {
        const id = ++botSeq;
        botPending.set(id, { resolve, reject });
        botWorker.postMessage({ id, state, opts });
      });
    } catch { botFailed = true; }
  }
  const { chooseMove } = await import('./custombot.js');
  return chooseMove(state, { ...opts, timeMs: Math.min(opts.timeMs, 600) });
}
const other = (c) => (c === 'w' ? 'b' : 'w');

let sharedEngine = null;
const getEngine = () => (sharedEngine ||= new Engine());

export function formatClock(ms) {
  ms = Math.max(0, ms);
  if (ms < 10000) {
    const s = Math.floor(ms / 1000);
    return `0:0${s}.${Math.floor((ms % 1000) / 100)}`;
  }
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export class Game {
  /**
   * cfg: { mode: 'bot'|'friend', time: '15+10', elo, color: 'w'|'b' }
   * settings: live settings object
   * hooks: { onNew(), onRematch(), onChange() }
   */
  constructor(cfg, settings, hooks) {
    this.cfg = cfg;
    this.settings = settings;
    this.hooks = hooks;
    this.custom = !!cfg.variant;
    this.chess = this.custom ? new CustomChess(cfg.variant) : new Chess();
    this.geo = this.custom ? this.chess.geometry() : CLASSIC_GEO;
    const { base, inc } = parseTime(cfg.time);
    this.base = base;
    this.inc = inc;
    this.clocks = { w: base, b: base };
    this.lastTick = performance.now();
    this.humanColor = cfg.mode === 'bot' ? cfg.color : null;
    this.orientation = cfg.mode === 'bot' ? cfg.color : 'w';
    this.selected = null;
    this.targets = new Map();
    this.over = false;
    this.result = null;
    this.botThinking = false;
    this.token = 0;
    this.usingFallback = false;
    this.build();
    this.render();
    this.timer = setInterval(() => this.tick(), 100);
    sfx.play('start', this.settings);
    if (this.custom) this.checkEnd();            // an edited position may already be over
    if (this.over) return;
    if (cfg.mode === 'bot' && !this.custom) {
      getEngine().newGame();
      getEngine().load().catch(() => {});   // start loading right away
      this.maybeBotMove();
    } else if (cfg.mode === 'bot') this.maybeBotMove();
  }

  get active() { return !this.over; }

  // ---------- DOM ----------
  build() {
    const root = (this.root = document.createElement('section'));
    root.className = 'game';
    root.innerHTML = `
      <div class="gcol">
        <div class="prow" data-pos="top"></div>
        <div class="board-wrap">
          <div class="board" role="grid" aria-label="Chess board"></div>
          <div class="promo" hidden></div>
        </div>
        <div class="prow" data-pos="bottom"></div>
      </div>
      <aside class="moves-panel">
        <div class="mp-head"><h2>Moves</h2><span class="status" aria-live="polite"></span></div>
        <ol class="moves-list"></ol>
        <div class="result" hidden></div>
        <div class="mp-actions"></div>
      </aside>`;
    this.boardEl = root.querySelector('.board');
    this.promoEl = root.querySelector('.promo');
    this.listEl = root.querySelector('.moves-list');
    this.statusEl = root.querySelector('.status');
    this.resultEl = root.querySelector('.result');
    this.actionsEl = root.querySelector('.mp-actions');
    this.rows = {
      top: root.querySelector('[data-pos=top]'),
      bottom: root.querySelector('[data-pos=bottom]'),
    };
    this.buildBoard();
    this.buildActions();
    this.boardEl.addEventListener('pointerdown', (e) => this.onDown(e));
  }

  buildBoard() {
    const { w, h, cells } = this.geo;
    const m = Math.max(w, h);
    this.root.style.setProperty('--fw', w / m);
    this.root.style.setProperty('--fh', h / m);
    this.boardEl.style.gridTemplateColumns = `repeat(${w}, 1fr)`;
    this.boardEl.style.gridTemplateRows = `repeat(${h}, 1fr)`;
    this.boardEl.classList.toggle('shaped', !!this.geo.shaped);
    this.boardEl.textContent = '';
    this.sq = {};
    const o = this.orientation;
    const xy = (r, c) => (o === 'w' ? [c, r] : [w - 1 - c, h - 1 - r]);
    // where to print rank / file labels (first square of a row, last square of a column)
    const rankDone = new Set();
    const fileAt = {};
    for (let c = 0; c < w; c++) for (let r = h - 1; r >= 0; r--) { const [x, y] = xy(r, c); if (cells[y][x]) { fileAt[c] = r; break; } }
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const [x, y] = xy(r, c);
        const el = document.createElement('div');
        if (!cells[y][x]) { el.className = 'sq void'; this.boardEl.append(el); continue; }
        const name = CFILES[x] + (h - y);
        el.className = 'sq ' + ((x + (h - 1 - y)) % 2 === 0 ? 'dark' : 'light');
        el.dataset.sq = name;
        if (!rankDone.has(r)) { rankDone.add(r); el.insertAdjacentHTML('beforeend', `<i class="coord rank">${h - y}</i>`); }
        if (fileAt[c] === r) el.insertAdjacentHTML('beforeend', `<i class="coord file">${CFILES[x]}</i>`);
        this.boardEl.append(el);
        this.sq[name] = el;
      }
    }
  }

  buildActions() {
    const a = this.actionsEl;
    a.textContent = '';
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      a.append(b);
      return b;
    };
    if (this.cfg.mode === 'friend') {
      mk('Flip board', 'link-btn', () => this.flip());
      mk('Offer draw', 'link-btn', () => this.confirmDraw());
    }
    mk('Resign', 'link-btn danger', () => this.confirmResign());
  }

  // ---------- helpers ----------
  sideInfo(side) {
    if (this.cfg.mode === 'bot') {
      return side === this.humanColor
        ? { name: 'YOU', elo: null }
        : { name: 'BOT', elo: this.cfg.elo };
    }
    return { name: side === 'w' ? 'WHITE' : 'BLACK', elo: null };
  }

  canMoveColor(color) {
    if (this.over || this.promoPending) return false;
    if (this.cfg.mode === 'bot') return color === this.humanColor && this.chess.turn() === color && !this.botThinking;
    return color === this.chess.turn();
  }

  checkSquares() {
    if (!this.chess.inCheck()) return [];
    if (this.custom) return this.chess.checkedSquares();
    for (const row of this.chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === this.chess.turn()) return [p.square];
    return [];
  }

  flip() {
    this.orientation = other(this.orientation);
    this.buildBoard();
    this.render();
  }

  // ---------- rendering ----------
  render() {
    this.renderBoard();
    this.renderBars();
    this.renderMoves();
    this.renderStatus();
    this.hooks.onChange?.();
  }

  renderBoard() {
    const s = this.settings;
    const hist = this.chess.history({ verbose: true });
    const last = hist[hist.length - 1];
    const checkSet = new Set(this.checkSquares());
    const board = this.chess.board();
    const at = {};
    for (const row of board) for (const p of row) if (p) at[p.square] = p;

    for (const [name, el] of Object.entries(this.sq)) {
      el.classList.toggle('last', !!(s.lastMove && last && (last.from === name || last.to === name)));
      el.classList.toggle('sel', this.selected === name);
      el.classList.toggle('check', checkSet.has(name));
      const t = this.targets.get(name);
      el.classList.toggle('dest', !!(s.hints && t && !t.cap));
      el.classList.toggle('dest-cap', !!(s.hints && t && t.cap));
      el.querySelector('img.pc')?.remove();
      const p = at[name];
      if (p) {
        const img = new Image();
        img.className = 'pc';
        img.src = this.geo.imgOf(p.color, p.type);
        img.alt = `${p.color === 'w' ? 'White' : 'Black'} ${this.geo.nameOf(p.type)}`;
        img.draggable = false;
        el.prepend(img);
      }
    }
  }

  animateLast(fromSq) {
    if (!this.settings.animate) return;
    const hist = this.chess.history({ verbose: true });
    const last = hist[hist.length - 1];
    if (!last) return;
    const from = this.sq[fromSq || last.from];
    const to = this.sq[last.to];
    const img = to?.querySelector('img.pc');
    if (!img || !from) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    img.style.transition = 'none';
    img.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    img.style.zIndex = 3;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      img.style.transition = 'transform .16s cubic-bezier(.2,.7,.2,1)';
      img.style.transform = '';
      setTimeout(() => { img.style.zIndex = ''; }, 200);
    }));
  }

  captured() {
    const got = { w: [], b: [] };   // pieces each side has captured
    for (const m of this.chess.history({ verbose: true })) if (m.captured) got[m.color].push(m.captured);
    const val = (t) => this.geo.valueOf(t);
    for (const k of 'wb') got[k].sort((x, y) => val(y) - val(x));
    const sum = (arr) => arr.reduce((t, p) => t + val(p), 0);
    return { got, diff: sum(got.w) - sum(got.b) };
  }

  renderBars() {
    const top = other(this.orientation);
    const bottom = this.orientation;
    const cap = this.captured();
    [['top', top], ['bottom', bottom]].forEach(([pos, side]) => {
      const row = this.rows[pos];
      const info = this.sideInfo(side);
      const moving = !this.over && this.chess.turn() === side;
      const state = this.over
        ? (this.result.winner === null ? 'draw' : this.result.winner === side ? 'win' : 'lose')
        : '';
      const adv = side === 'w' ? cap.diff : -cap.diff;
      const icons = cap.got[side].map((t) => `<img src="${this.geo.imgOf(other(side), t)}" alt="">`).join('');
      row.innerHTML = `
        <div class="pbar side-${side} ${state}">
          <span class="pname">${info.name}${info.elo ? ` <span class="elo">(${info.elo})</span>` : ''}</span>
          <span class="took">${icons}${adv > 0 ? `<em>+${adv}</em>` : ''}</span>
          ${moving ? '<span class="turn-dot" title="To move"></span>' : ''}
        </div>
        <div class="clock side-${side} ${moving ? 'running' : ''}" data-side="${side}">--:--</div>`;
    });
    this.paintClocks();
  }

  paintClocks() {
    this.root.querySelectorAll('.clock').forEach((el) => {
      const side = el.dataset.side;
      el.textContent = this.base ? formatClock(this.clocks[side]) : '∞';
      el.classList.toggle('low', !!this.base && this.clocks[side] < 20000 && !this.over);
    });
  }

  renderMoves() {
    const h = this.chess.history();
    if (!h.length) {
      this.listEl.innerHTML = '<li class="empty">Moves will show up here once the game starts.</li>';
      return;
    }
    let html = '';
    for (let i = 0; i < h.length; i += 2) {
      const n = i / 2 + 1;
      const cls = (idx) => (idx === h.length - 1 ? 'mv now' : 'mv');
      html += `<li><span class="num">${n}</span><span class="${cls(i)}">${h[i]}</span>${h[i + 1] ? `<span class="${cls(i + 1)}">${h[i + 1]}</span>` : ''}</li>`;
    }
    this.listEl.innerHTML = html;
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  renderStatus() {
    let t = '';
    if (this.over) t = 'Game over';
    else if (this.cfg.mode === 'bot') t = this.botThinking ? 'Bot is thinking…' : this.chess.turn() === this.humanColor ? 'Your move' : '';
    else t = this.chess.turn() === 'w' ? 'White to move' : 'Black to move';
    if (!this.over && this.chess.inCheck()) t = (t ? t + ' · ' : '') + 'Check';
    this.statusEl.textContent = t;
  }

  // ---------- input ----------
  onDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    const sqEl = e.target.closest('.sq');
    if (!sqEl || this.over) return;
    const name = sqEl.dataset.sq;

    if (this.selected && this.targets.has(name)) {
      this.tryMove(this.selected, name);
      return;
    }
    const p = this.chess.get(name);
    if (p && this.canMoveColor(p.color)) {
      const wasSelected = this.selected === name;
      this.select(name);
      const img = sqEl.querySelector('img.pc');
      this.drag = { name, x: e.clientX, y: e.clientY, started: false, wasSelected, img, ghost: null };
      this.onMoveBound = (ev) => this.onDragMove(ev);
      this.onUpBound = (ev) => this.onDragEnd(ev);
      window.addEventListener('pointermove', this.onMoveBound);
      window.addEventListener('pointerup', this.onUpBound);
      window.addEventListener('pointercancel', this.onUpBound);
    } else if (this.selected) {
      this.selected = null;
      this.targets.clear();
      this.renderBoard();
    }
  }

  select(name) {
    this.selected = name;
    this.targets.clear();
    for (const m of this.chess.moves({ square: name, verbose: true })) {
      this.targets.set(m.to, { cap: !!m.captured || m.flags.includes('e') });
    }
    this.renderBoard();
    const img = this.sq[name].querySelector('img.pc');
    if (this.drag) this.drag.img = img;
  }

  onDragMove(e) {
    const d = this.drag;
    if (!d) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
      d.started = true;
      const rect = this.sq[d.name].getBoundingClientRect();
      const g = d.img.cloneNode();
      g.className = 'drag-ghost';
      g.style.width = g.style.height = rect.width * 1.08 + 'px';
      document.body.append(g);
      d.ghost = g;
      d.size = rect.width * 1.08;
      d.img.style.opacity = '.25';
    }
    d.ghost.style.left = e.clientX - d.size / 2 + 'px';
    d.ghost.style.top = e.clientY - d.size / 2 + 'px';
  }

  onDragEnd(e) {
    window.removeEventListener('pointermove', this.onMoveBound);
    window.removeEventListener('pointerup', this.onUpBound);
    window.removeEventListener('pointercancel', this.onUpBound);
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (!d.started) {
      if (d.wasSelected) { this.selected = null; this.targets.clear(); this.renderBoard(); }
      return;
    }
    d.ghost.remove();
    if (d.img) d.img.style.opacity = '';
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.sq');
    const to = under?.dataset.sq;
    if (to && to !== d.name && this.targets.has(to)) this.tryMove(d.name, to, true);
  }

  tryMove(from, to, dragged = false) {
    const options = this.chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!options.length) return;
    if (options.length > 1) { this.askPromotion(from, to, options, dragged); return; }
    this.play({ from, to, promotion: options[0].promotion }, !dragged);
  }

  askPromotion(from, to, options, dragged) {
    const color = options[0].color;
    this.promoPending = true;
    const el = this.promoEl;
    const col = this.sq[to].getBoundingClientRect();
    const wrap = this.boardEl.getBoundingClientRect();
    const size = col.width;
    const goesDown = (col.top - wrap.top) < wrap.height / 2;   // keep the picker on the board
    const types = options.map((o) => o.promotion).sort((a, b) => this.geo.valueOf(b) - this.geo.valueOf(a));
    if (!goesDown) types.reverse();
    el.hidden = false;
    el.style.width = size + 'px';
    el.style.left = col.left - wrap.left + 'px';
    el.style.top = goesDown ? col.top - wrap.top + 'px' : col.top - wrap.top - size * (types.length - 1) + 'px';
    el.innerHTML = types.map((t) => `<button data-t="${t}" aria-label="Promote to ${this.geo.nameOf(t)}"><img src="${this.geo.imgOf(color, t)}" alt=""></button>`).join('');
    el.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      this.closePromotion();
      this.play({ from, to, promotion: b.dataset.t }, !dragged);
    };
    this.promoBackdrop = (ev) => {
      if (!ev.target.closest('.promo')) { this.closePromotion(); this.render(); }
    };
    setTimeout(() => document.addEventListener('pointerdown', this.promoBackdrop), 0);
  }

  closePromotion() {
    this.promoPending = false;
    this.promoEl.hidden = true;
    this.promoEl.innerHTML = '';
    document.removeEventListener('pointerdown', this.promoBackdrop);
  }

  // ---------- moves ----------
  play(move, animate = true) {
    this.tick();
    let mv;
    try { mv = this.chess.move(move); } catch { return false; }
    if (!mv) return false;
    const plies = this.chess.history().length;
    if (this.base && plies > 2) this.clocks[mv.color] += this.inc;
    this.lastTick = performance.now();
    this.selected = null;
    this.targets.clear();
    if (this.cfg.mode === 'friend' && this.settings.autoFlip && !this.chess.isGameOver()) {
      this.orientation = this.chess.turn();
      this.buildBoard();
      animate = false;
    }
    this.checkEnd();
    this.render();
    if (animate) this.animateLast(mv.from);
    if (!this.over) {
      const kind = this.chess.inCheck() ? 'check' : mv.promotion ? 'promote'
        : mv.captured ? 'capture' : (mv.flags.includes('k') || mv.flags.includes('q')) ? 'castle' : 'move';
      sfx.play(kind, this.settings);
      this.maybeBotMove();
    }
    return true;
  }

  checkEnd() {
    const c = this.chess;
    if (c.isCheckmate()) this.finish(other(c.turn()), !this.custom ? 'by checkmate' : c.royalLost() ? 'by capturing the king' : c.annihilated() ? 'by capturing every piece' : 'by checkmate');
    else if (c.isStalemate()) this.finish(null, 'by stalemate');
    else if (c.isInsufficientMaterial()) this.finish(null, 'by insufficient material');
    else if (c.isThreefoldRepetition()) this.finish(null, 'by threefold repetition');
    else if (c.isDrawByFiftyMoves()) this.finish(null, 'by the fifty-move rule');
  }

  finish(winner, reason) {
    if (this.over) return;
    this.over = true;
    this.result = { winner, reason };
    this.token++;
    this.botThinking = false;
    this.closePromotion();
    if (this.cfg.mode === 'bot' && !this.custom) getEngine().stop();
    clearInterval(this.timer);
    const endKind = winner === null ? 'draw'
      : this.cfg.mode === 'bot' ? (winner === this.humanColor ? 'win' : 'lose') : 'win';
    sfx.play(endKind, this.settings);
    const title = winner === null ? 'Draw' : winner === 'w' ? 'White won' : 'Black won';
    this.resultEl.hidden = false;
    this.resultEl.innerHTML = `<strong>${title}</strong><span>${reason}</span>
      <div class="result-actions"><button class="btn primary" data-a="rematch">Rematch</button><button class="btn ghost" data-a="new">New game</button></div>`;
    this.resultEl.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'rematch') this.hooks.onRematch?.();
      if (a === 'new') this.hooks.onNew?.();
    };
    this.actionsEl.hidden = true;
    this.selected = null;
    this.targets.clear();
    this.render();
  }

  // ---------- clocks ----------
  tick() {
    const now = performance.now();
    if (this.over || !this.base) { this.lastTick = now; return; }
    if (this.chess.history().length >= 2) {
      const side = this.chess.turn();
      this.clocks[side] -= now - this.lastTick;
      if (this.clocks[side] <= 0) {
        this.clocks[side] = 0;
        this.lastTick = now;
        this.flag(side);
        return;
      }
    }
    this.lastTick = now;
    this.paintClocks();
  }

  flag(loser) {
    // If the opponent can't possibly checkmate, a flag is only a draw.
    const opp = other(loser);
    const mine = [];
    for (const row of this.chess.board()) for (const p of row) if (p && p.color === opp && !this.geo.isRoyal(p.type)) mine.push(p.type);
    const cannotMate = mine.length === 0 || (!this.custom && mine.length === 1 && (mine[0] === 'n' || mine[0] === 'b'));
    if (cannotMate) this.finish(null, 'on time, but the other side can’t checkmate');
    else this.finish(opp, 'on time');
  }

  // ---------- resign / draw ----------
  confirmResign() {
    if (this.over) return;
    if (this.cfg.mode === 'bot') {
      modal({
        title: 'Resign this game?',
        text: 'The bot wins and the game ends.',
        actions: [
          { label: 'Keep playing', kind: 'ghost' },
          { label: 'Resign', kind: 'danger', run: () => this.finish(other(this.humanColor), 'by resignation') },
        ],
      });
    } else {
      modal({
        title: 'Who is resigning?',
        actions: [
          { label: 'Cancel', kind: 'ghost' },
          { label: 'White resigns', kind: 'danger', run: () => this.finish('b', 'by resignation') },
          { label: 'Black resigns', kind: 'danger', run: () => this.finish('w', 'by resignation') },
        ],
      });
    }
  }

  confirmDraw() {
    if (this.over) return;
    modal({
      title: 'Draw by agreement?',
      text: 'Both players need to agree.',
      actions: [
        { label: 'Keep playing', kind: 'ghost' },
        { label: 'Agree to draw', kind: 'primary', run: () => this.finish(null, 'by agreement') },
      ],
    });
  }

  // ---------- bot ----------
  async maybeBotMove() {
    if (this.cfg.mode !== 'bot' || this.over || this.chess.turn() === this.humanColor || this.botThinking) return;
    this.botThinking = true;
    this.renderStatus();
    const token = ++this.token;
    const t0 = performance.now();
    const elo = this.cfg.elo;
    const remaining = this.clocks[other(this.humanColor)];
    let movetime = this.base ? Math.min(2500, Math.max(250, remaining / 35 + this.inc * 0.6)) : 1200;
    if (elo < 1800) movetime = Math.min(movetime, 400 + elo / 3);
    if (elo < 1320) movetime = 0;   // low-Elo search is depth-limited and instant

    let uci, mv = null;
    if (this.custom) {
      const st = { elo, timeMs: Math.min(2200, Math.max(400, this.base ? remaining / 35 + this.inc * 600 : 1200)) };
      try { mv = await runCustomBot(this.chess.serialize(), st); } catch { mv = null; }
      if (!mv) { const all = this.chess.moves({ verbose: true }); const r = all[Math.floor(Math.random() * all.length)]; mv = r && { from: r.from, to: r.to, promotion: r.promotion }; }
    } else {
      try {
        uci = await getEngine().bestMove(this.chess.fen(), { elo, movetime, legalCount: this.chess.moves().length });
      } catch (err) {
        if (!this.usingFallback) {
          this.usingFallback = true;
          this.toast('Stockfish couldn’t start here, so the bot is using a simpler brain. Open the site over http(s) to use Stockfish.');
        }
        uci = fallbackMove(this.chess);
      }
      if (uci && uci !== '(none)') mv = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
    }
    // Small pause so the bot never feels instant.
    const wait = 450 - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (token !== this.token || this.over) return;
    this.botThinking = false;
    if (!mv) { this.renderStatus(); return; }
    this.play(mv, true);
  }

  toast(msg) { toast(msg, 7000); }

  destroy() {
    clearInterval(this.timer);
    this.token++;
    this.root.remove();
  }
}
