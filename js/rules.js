// Rules engine for custom boards (any shape up to 16×16) and custom pieces.
// It mimics the small part of the chess.js API that Game uses, so the same game screen works for both.
//
// Not supported in custom games: castling. (En passant works for pieces with the "en passant" option.)
import { compileRules } from './library.js';

export const FILES = 'abcdefghijklmnop';
const other = (c) => (c === 'w' ? 'b' : 'w');

export class CustomChess {
  /** variant: { w, h, cells:[rowStrings], setup:[[x,y,id,color]], pieces:{id:pieceDef} } */
  constructor(variant, skipSetup = false) {
    this.w = variant.w;
    this.h = variant.h;
    this.cellRows = variant.cells;
    this.playable = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.playable[y * this.w + x] = variant.cells[y][x] === '1' ? 1 : 0;
    this.defsRaw = variant.pieces;
    this.defs = {};
    for (const [id, p] of Object.entries(variant.pieces)) {
      this.defs[id] = {
        id, name: p.name, sym: p.sym ?? '', royal: !!p.royal, value: p.value ?? 1, rel: p.rel !== false,
        ep: !!p.ep, promo: p.promo || [], img: p.img, rules: compileRules(p), reset: !!p.ep || (p.promo || []).length > 0,
      };
    }
    // promotion squares: the last playable square of a column in the piece's forward direction
    this.promoCell = { w: new Uint8Array(this.w * this.h), b: new Uint8Array(this.w * this.h) };
    for (let x = 0; x < this.w; x++) {
      let top = -1, bottom = -1;
      for (let y = 0; y < this.h; y++) if (this.playable[y * this.w + x]) { if (top < 0) top = y; bottom = y; }
      if (top >= 0) { this.promoCell.w[top * this.w + x] = 1; this.promoCell.b[bottom * this.w + x] = 1; }
    }
    this.b = new Array(this.w * this.h).fill(null);
    this.turn_ = 'w';
    this.ep = null;
    this.hm = 0;
    this.hist = [];
    this.keys = [];
    this._legal = null;
    if (!skipSetup) {
      for (const [x, y, id, c] of variant.setup) if (this.defs[id]) this.b[y * this.w + x] = { t: id, c, m: false };
      this.keys.push(this.key());
    }
  }

  // ---------- naming ----------
  sqName(i) { return FILES[i % this.w] + (this.h - Math.floor(i / this.w)); }
  idxOf(name) {
    const x = FILES.indexOf(name[0]);
    const y = this.h - parseInt(name.slice(1), 10);
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x;
  }
  symOf(t) { const d = this.defs[t]; return d.sym !== '' ? d.sym : (d.id === 'P' ? '' : d.name[0].toUpperCase()); }

  geometry() {
    const cells = this.cellRows.map((r) => [...r].map((c) => c === '1'));
    return {
      w: this.w, h: this.h, cells, shaped: cells.some((r) => r.includes(false)),
      imgOf: (c, t) => this.defs[t].img[c],
      valueOf: (t) => this.defs[t].value,
      nameOf: (t) => this.defs[t].name.toLowerCase(),
      isRoyal: (t) => this.defs[t].royal,
    };
  }

  // ---------- move generation ----------
  genFrom(i, p, out) {
    const d = this.defs[p.t];
    const { w, h } = this;
    const x = i % w, y = (i / w) | 0;
    const sgn = d.rel && p.c === 'b' ? -1 : 1;
    const seen = new Set();
    const push = (j, cap, capIdx, isEp, epCell) => {
      const key = j * 2 + (isEp ? 1 : 0);
      if (seen.has(key)) return;
      seen.add(key);
      if (d.promo.length && this.promoCell[p.c][j]) {
        for (const pt of d.promo) if (this.defs[pt]) out.push({ from: i, to: j, t: p.t, c: p.c, cap, capIdx, promo: pt, isEp, epCell });
      } else out.push({ from: i, to: j, t: p.t, c: p.c, cap, capIdx, promo: null, isEp, epCell });
    };
    for (const r of d.rules) {
      if (r.f && p.m) continue;
      const dx = r.dx, dy = r.dy * sgn;
      for (let k = 1; k <= r.r; k++) {
        const nx = x + dx * k, ny = y + dy * k;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
        const j = ny * w + nx;
        if (!this.playable[j]) { if (r.j) continue; break; }
        const q = this.b[j];
        const exactMiddle = r.e && k < r.r;
        if (!q) {
          if (!exactMiddle) {
            if (r.m !== 'c') {
              const epCell = d.ep && dx === 0 && k >= 2 ? (y + dy * (k - 1)) * w + x : null;
              push(j, null, -1, false, epCell);
            } else if (d.ep && this.ep && this.ep.cell === j && this.ep.c !== p.c && k === 1) {
              push(j, this.b[this.ep.pawn].t, this.ep.pawn, true, null);
            }
          }
          continue;
        }
        if (exactMiddle) { if (r.j) continue; break; }
        if (q.c !== p.c) {
          if (r.m !== 'm') push(j, q.t, j, false, null);
          if (!r.j) break;
        } else if (!r.j) break;
      }
    }
  }

  canHit(i, p, target) {
    const d = this.defs[p.t];
    const { w, h } = this;
    const x = i % w, y = (i / w) | 0;
    const sgn = d.rel && p.c === 'b' ? -1 : 1;
    for (const r of d.rules) {
      if (r.m === 'm' || (r.f && p.m)) continue;
      const dx = r.dx, dy = r.dy * sgn;
      for (let k = 1; k <= r.r; k++) {
        const nx = x + dx * k, ny = y + dy * k;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
        const j = ny * w + nx;
        if (!this.playable[j]) { if (r.j) continue; break; }
        if (j === target && !(r.e && k < r.r)) return true;
        if (this.b[j] && !r.j) break;
        if (r.e && k < r.r && this.b[j]) break;
      }
    }
    return false;
  }

  pseudo(color) {
    const out = [];
    for (let i = 0; i < this.b.length; i++) {
      const p = this.b[i];
      if (p && p.c === color) this.genFrom(i, p, out);
    }
    return out;
  }

  royals(color) {
    const r = [];
    for (let i = 0; i < this.b.length; i++) { const p = this.b[i]; if (p && p.c === color && this.defs[p.t].royal) r.push(i); }
    return r;
  }

  attacked(target, by) {
    for (let i = 0; i < this.b.length; i++) {
      const p = this.b[i];
      if (p && p.c === by && this.canHit(i, p, target)) return true;
    }
    return false;
  }

  hasCheck(color) {
    const by = other(color);
    return this.royals(color).some((r) => this.attacked(r, by));
  }

  make(mv) {
    const p = this.b[mv.from];
    const capped = this.b[mv.capIdx >= 0 ? mv.capIdx : mv.to];
    const rec = { mv, prevT: p.t, prevM: p.m, capped, prevEp: this.ep, prevHm: this.hm, turn: this.turn_ };
    this.b[mv.from] = null;
    if (mv.isEp) this.b[mv.capIdx] = null;
    p.m = true;
    if (mv.promo) p.t = mv.promo;
    this.b[mv.to] = p;
    this.ep = mv.epCell != null ? { cell: mv.epCell, c: p.c, pawn: mv.to } : null;
    this.hm = mv.cap || this.defs[rec.prevT].reset ? 0 : this.hm + 1;
    this.turn_ = other(this.turn_);
    return rec;
  }

  unmake(rec) {
    const { mv } = rec;
    const p = this.b[mv.to];
    p.t = rec.prevT;
    p.m = rec.prevM;
    this.b[mv.to] = null;
    if (mv.isEp) this.b[mv.capIdx] = rec.capped; else this.b[mv.to] = rec.capped;
    this.b[mv.from] = p;
    this.ep = rec.prevEp;
    this.hm = rec.prevHm;
    this.turn_ = rec.turn;
  }

  legalInternal() {
    if (this._legal) return this._legal;
    const color = this.turn_;
    const has = this.royals(color).length > 0;
    const out = [];
    for (const mv of this.pseudo(color)) {
      if (!has) { out.push(mv); continue; }
      const rec = this.make(mv);
      const bad = this.hasCheck(color);
      this.unmake(rec);
      if (!bad) out.push(mv);
    }
    this._legal = out;
    return out;
  }

  key() {
    let s = this.turn_;
    for (let i = 0; i < this.b.length; i++) { const p = this.b[i]; if (p) s += `|${i}${p.c}${p.t}${p.m ? 1 : 0}`; }
    if (this.ep) s += `|e${this.ep.cell}`;
    return s;
  }

  // ---------- chess.js-like API ----------
  turn() { return this.turn_; }
  get(name) {
    const i = this.idxOf(name);
    const p = i >= 0 ? this.b[i] : null;
    return p ? { type: p.t, color: p.c, square: name } : null;
  }
  board() {
    const rows = [];
    for (let y = 0; y < this.h; y++) {
      const row = [];
      for (let x = 0; x < this.w; x++) {
        const p = this.b[y * this.w + x];
        row.push(p ? { type: p.t, color: p.c, square: this.sqName(y * this.w + x) } : null);
      }
      rows.push(row);
    }
    return rows;
  }
  verbose(mv, san = '') {
    return {
      from: this.sqName(mv.from), to: this.sqName(mv.to), color: mv.c, piece: mv.t,
      captured: mv.cap || undefined, promotion: mv.promo || undefined,
      flags: (mv.cap ? 'c' : 'n') + (mv.isEp ? 'e' : '') + (mv.promo ? 'p' : ''), san,
    };
  }
  moves(opts = {}) {
    let list = this.legalInternal();
    if (opts.square) { const i = this.idxOf(opts.square); list = list.filter((m) => m.from === i); }
    return opts.verbose ? list.map((m) => this.verbose(m)) : list.map((m) => this.sqName(m.from) + this.sqName(m.to));
  }
  inCheck() { return this.hasCheck(this.turn_); }
  checkedSquares() {
    const by = other(this.turn_);
    return this.royals(this.turn_).filter((r) => this.attacked(r, by)).map((i) => this.sqName(i));
  }
  annihilated() {
    return !this.b.some((p) => p && p.c === this.turn_);
  }
  isCheckmate() {
    return this.annihilated() || (this.inCheck() && this.legalInternal().length === 0);
  }
  isStalemate() { return !this.annihilated() && !this.inCheck() && this.legalInternal().length === 0; }
  isInsufficientMaterial() {
    return !this.b.some((p) => p && !this.defs[p.t].royal);
  }
  isThreefoldRepetition() {
    const k = this.keys[this.keys.length - 1];
    return this.keys.filter((x) => x === k).length >= 3;
  }
  isDrawByFiftyMoves() { return this.hm >= 100; }
  isGameOver() {
    return this.isCheckmate() || this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() || this.isDrawByFiftyMoves();
  }
  history(opts = {}) {
    return opts.verbose ? this.hist.map((h) => h.v) : this.hist.map((h) => h.v.san);
  }
  fen() { return ''; }

  move({ from, to, promotion }) {
    const f = this.idxOf(from), t = this.idxOf(to);
    const list = this.legalInternal();
    let cands = list.filter((m) => m.from === f && m.to === t);
    if (promotion) cands = cands.filter((m) => m.promo === promotion);
    if (cands.length !== 1) return null;
    const mv = cands[0];
    const san = this.sanFor(mv, list);
    const rec = this.make(mv);
    this._legal = null;
    this.keys.push(this.key());
    let suffix = '';
    if (this.isCheckmate() && !this.annihilated()) suffix = '#';
    else if (this.inCheck()) suffix = '+';
    const v = this.verbose(mv, san + suffix);
    this.hist.push({ rec, v });
    return v;
  }

  sanFor(mv, list) {
    let s = '';
    const sym = this.symOf(mv.t);
    const fx = mv.from % this.w, fy = Math.floor(mv.from / this.w);
    if (sym === '') { if (mv.cap) s += FILES[fx]; }
    else {
      s += sym;
      const others = list.filter((m) => m !== mv && m.t === mv.t && m.to === mv.to && m.from !== mv.from);
      if (others.length) {
        const sameFile = others.some((o) => o.from % this.w === fx);
        const sameRank = others.some((o) => Math.floor(o.from / this.w) === fy);
        if (!sameFile) s += FILES[fx];
        else if (!sameRank) s += this.h - fy;
        else s += FILES[fx] + (this.h - fy);
      }
    }
    if (mv.cap) s += 'x';
    s += this.sqName(mv.to);
    if (mv.promo) s += '=' + (this.symOf(mv.promo) || this.defs[mv.promo].name[0].toUpperCase());
    return s;
  }

  // ---------- (de)serialising, used to send positions to the bot worker ----------
  serialize() {
    const pieces = [];
    this.b.forEach((p, i) => { if (p) pieces.push([i, p.t, p.c, p.m ? 1 : 0]); });
    return {
      w: this.w, h: this.h, cells: this.cellRows, defs: this.defsRaw,
      pieces, turn: this.turn_, ep: this.ep, hm: this.hm,
    };
  }
  static restore(s) {
    const g = new CustomChess({ w: s.w, h: s.h, cells: s.cells, setup: [], pieces: s.defs }, true);
    s.pieces.forEach(([i, t, c, m]) => { g.b[i] = { t, c, m: !!m }; });
    g.turn_ = s.turn; g.ep = s.ep; g.hm = s.hm;
    return g;
  }

  // Used by the piece editor preview: pseudo-legal moves of the piece standing on (x, y).
  movesFrom(x, y) {
    const i = y * this.w + x;
    const p = this.b[i];
    const out = [];
    if (p) this.genFrom(i, p, out);
    return out.map((m) => ({ x: m.to % this.w, y: Math.floor(m.to / this.w), capture: !!m.cap }));
  }
}
