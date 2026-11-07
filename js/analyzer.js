// Game analyzer (v3.0): runs Stockfish over every position of a game and rates each move.
import { Chess } from '../vendor/chess.js';

// ---------- effort presets ----------
export const EFFORTS = [
  { id: 'fast', label: 'More speed', depth: 12, ms: 300, lines: 2, hash: 16, text: 'Quick look. A normal game takes well under half a minute. May miss deep tactics.' },
  { id: 'auto', label: 'Auto', depth: 18, ms: 0, lines: 2, hash: 32, text: 'Picks the time per position so a normal game takes about one to two minutes.' },
  { id: 'deep', label: 'More effort', depth: 24, ms: 5000, lines: 3, hash: 64, text: 'Thorough. A long game can take five minutes or more.' },
];
export const DEFAULT_ADVANCED = { depth: 16, ms: 800, lines: 2, hash: 32, book: true, special: true };

export const CLASSES = [
  { id: 'brilliant', label: 'Brilliant', color: '#26c2a3' },
  { id: 'critical', label: 'Critical', color: '#6b9bc4' },
  { id: 'best', label: 'Best', color: '#96bc4b' },
  { id: 'excellent', label: 'Excellent', color: '#96bc4b' },
  { id: 'okay', label: 'Okay', color: '#8a9a78' },
  { id: 'inaccuracy', label: 'Inaccuracy', color: '#f7c631' },
  { id: 'mistake', label: 'Mistake', color: '#f0902e' },
  { id: 'blunder', label: 'Blunder', color: '#e03c3a' },
  { id: 'theory', label: 'Theory', color: '#b08d62' },
];
export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

// ---------- maths ----------
// Chance (0..100) that White scores, from a White-view evaluation { cp } or { mate }.
export function winPct(sc) {
  if (sc.mate !== undefined) return sc.mate === 0 ? sc.winner : sc.mate > 0 ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * sc.cp)) - 1);
}
export function moveAccuracy(loss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669 + 1));
}
export function evalText(sc) {
  if (!sc) return '';
  if (sc.mate !== undefined) return sc.mate === 0 ? (sc.winner === 100 ? '1-0' : '0-1') : `${sc.mate > 0 ? '+' : '-'}M${Math.abs(sc.mate)}`;
  const v = sc.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(chess) {
  let d = 0;
  for (const row of chess.board()) for (const s of row) if (s) d += (s.color === 'w' ? 1 : -1) * VAL[s.type];
  return d;   // White minus Black
}
const toMove = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });

// ---------- engine ----------
export class AnalysisEngine {
  constructor() { this.w = null; this.listeners = new Set(); }

  send(c) { this.w.postMessage(c); }

  once(pred, cb) {
    const fn = (l) => { if (pred(l)) { this.listeners.delete(fn); cb(l); } };
    this.listeners.add(fn);
  }

  load(hash = 32) {
    return new Promise((resolve, reject) => {
      try { this.w = new Worker(new URL('../engine/stockfish-19-lite-single.js', import.meta.url)); } catch (e) { reject(e); return; }
      const t = setTimeout(() => reject(new Error('Engine start timed out')), 25000);
      this.w.onerror = (e) => { clearTimeout(t); reject(e); };
      this.w.onmessage = (ev) => { const l = String(ev.data); [...this.listeners].forEach((f) => f(l)); };
      this.once((l) => l === 'uciok', () => {
        this.send('setoption name Threads value 1');
        this.send(`setoption name Hash value ${hash}`);
        this.send('setoption name UCI_LimitStrength value false');
        this.send('isready');
        this.once((l2) => l2 === 'readyok', () => { clearTimeout(t); resolve(); });
      });
      this.send('uci');
    });
  }

  // Returns lines (best first): { cp | mate, pv: [uci...] } with scores from the side to move's view.
  analyse(fen, { depth, ms, lines }) {
    this.send(`setoption name MultiPV value ${lines}`);
    const found = new Map();
    return new Promise((resolve) => {
      const onInfo = (l) => {
        if (!l.startsWith('info') || l.includes('bound')) return;
        const m = l.match(/depth (\d+).*? multipv (\d+) score (cp|mate) (-?\d+).*? pv (.+)$/) || l.match(/depth (\d+).*? score (cp|mate) (-?\d+).*? pv (.+)$/);
        if (!m) return;
        const hasK = m.length === 6;
        const d = +m[1], k = hasK ? +m[2] : 1, kind = hasK ? m[3] : m[2], val = +(hasK ? m[4] : m[3]);
        const pv = (hasK ? m[5] : m[4]).trim().split(/\s+/).slice(0, 4);
        const prev = found.get(k);
        if (prev && prev.depth > d) return;
        found.set(k, { depth: d, [kind]: val, pv });
      };
      this.listeners.add(onInfo);
      this.once((l) => l.startsWith('bestmove'), () => {
        this.listeners.delete(onInfo);
        resolve([...found.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v));
      });
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}${ms > 0 ? ` movetime ${Math.round(ms)}` : ''}`);
    });
  }

  newGame() { this.send('ucinewgame'); }
  stop() { try { this.send('stop'); } catch { /* not started */ } }
  terminate() { this.listeners.clear(); this.w?.terminate(); this.w = null; }
}

// ---------- opening book ----------
let bookPromise = null;
export function loadBook() {
  bookPromise ||= fetch(new URL('../data/openings.json', import.meta.url)).then((r) => r.json()).catch(() => ({}));
  return bookPromise;
}
const fen4 = (fen) => fen.split(' ').slice(0, 4).join(' ');

// ---------- reading a PGN ----------
// Returns { startFen, moves: [{ san, uci, color, from, to, piece, captured }], headers } or throws a friendly Error.
export function readPgn(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Paste a PGN first.');
  const chess = new Chess();
  try { chess.loadPgn(t); } catch (e) { throw new Error('This does not look like a valid PGN. ' + (String(e.message || '').split('\n')[0] || '')); }
  const headers = chess.header();
  if (headers.Variant && !/^(standard|chess)$/i.test(headers.Variant)) throw new Error(`This PGN is a “${headers.Variant}” game. The analyzer only knows classic chess.`);
  const verbose = chess.history({ verbose: true });
  if (!verbose.length) throw new Error('This game has no moves.');
  const startFen = headers.FEN || new Chess().fen();
  return {
    startFen, headers,
    moves: verbose.map((m) => ({ san: m.san, uci: m.from + m.to + (m.promotion || ''), color: m.color, from: m.from, to: m.to, piece: m.piece, captured: m.captured || null })),
  };
}

export const fensOf = (startFen, moves) => {
  const c = new Chess(startFen);
  const out = [c.fen()];
  for (const m of moves) { c.move(toMove(m.uci)); out.push(c.fen()); }
  return out;
};

// ---------- one position ----------
// White-view evaluation { lines: [{ cp | mate, pv }] } of a position. Finished games need no engine.
export async function evalFen(eng, fen, o) {
  const chess = new Chess(fen);
  const white = chess.turn() === 'w';
  if (chess.isCheckmate()) return { lines: [{ mate: 0, winner: white ? 0 : 100, pv: [] }] };
  if (chess.isDraw() || chess.isStalemate()) return { lines: [{ cp: 0, pv: [] }] };
  const raw = await eng.analyse(fen, { depth: o.depth, ms: o.ms, lines: Math.min(o.lines, chess.moves().length) });
  const s = white ? 1 : -1;                         // turn the score to White's view
  return { lines: raw.map((r) => { const l = { pv: r.pv }; if (r.mate !== undefined) l.mate = r.mate * s; else l.cp = r.cp * s; return l; }) };
}

// ---------- the main loop ----------
// onProgress(done, total); shouldStop() -> bool. Resolves with { evals } (White view) or null when stopped.
export async function runAnalysis(game, opts, onProgress, shouldStop) {
  const fens = fensOf(game.startFen, game.moves);
  const total = fens.length;
  const ms = opts.ms > 0 ? opts.ms : Math.max(300, Math.min(2500, Math.round(90000 / total)));
  const eng = new AnalysisEngine();
  const evals = [];
  try {
    await eng.load(opts.hash);
    eng.newGame();
    for (let i = 0; i < total; i++) {
      if (shouldStop()) return null;
      evals.push(await evalFen(eng, fens[i], { depth: opts.depth, ms, lines: opts.lines }, shouldStop));
      if (shouldStop()) return null;
      onProgress(i + 1, total);
    }
  } finally { eng.terminate(); }
  return { evals };
}

// ---------- rating the moves ----------
// Rates one move. evBefore / evAfter are White-view evaluations of the positions before and after it.
export function classifyMove({ fenBefore, move: m, evBefore, evAfter, theory, opts }) {
  const me = m.color;
  const mine = (x) => (me === 'w' ? x : 100 - x);
  const before = mine(winPct(evBefore.lines[0])), after = mine(winPct(evAfter.lines[0]));
  const loss = Math.max(0, before - after);
  const top = evBefore.lines[0];
  const isBest = top?.pv?.[0] === m.uci || loss <= 0.3;
  let cls;
  if (theory) cls = 'theory';
  else if (isBest) {
    cls = 'best';
    if (opts.special) {
      // Critical: the only move that holds the position (the next best line is much worse)
      const second = evBefore.lines[1];
      if (second && before - mine(winPct(second)) >= 15 && before > 12 && before < 90 && top.pv[0] === m.uci) cls = 'critical';
      // Brilliant: a real sacrifice that still works
      if ((before < 97 || top.mate !== undefined) && after >= 50 && isSacrifice(fenBefore, m, evAfter.lines[0]?.pv || [])) cls = 'brilliant';
    }
  } else if (loss <= 2) cls = 'excellent';
  else if (loss <= 5) cls = 'okay';
  else if (loss <= 10) cls = 'inaccuracy';
  else if (loss <= 20) cls = 'mistake';
  else cls = 'blunder';
  return { cls, loss: Math.round(loss * 10) / 10, acc: moveAccuracy(loss) };
}

export function rate(game, evals, opts, book = {}) {
  const fens = fensOf(game.startFen, game.moves);
  const res = [];
  const accSum = { w: 0, b: 0 }, accN = { w: 0, b: 0 };
  const names = [];
  let lastName = null;
  for (let i = 0; i < game.moves.length; i++) {
    const m = game.moves[i];
    const posName = opts.book ? book[fen4(fens[i + 1])] : null;
    if (posName) lastName = posName;
    names.push(lastName);
    const c = classifyMove({ fenBefore: fens[i], move: m, evBefore: evals[i], evAfter: evals[i + 1], theory: !!posName, opts });
    accSum[m.color] += c.acc; accN[m.color]++;
    res.push({ cls: c.cls, loss: c.loss });
  }
  return {
    cls: res,
    names,
    acc: { w: accN.w ? accSum.w / accN.w : null, b: accN.b ? accSum.b / accN.b : null },
  };
}

export const bookName = (book, fen) => book[fen4(fen)] || null;

// Material the mover has given up for good: play the engine's follow-up line and compare.
function isSacrifice(fenBefore, m, pv) {
  try {
    const c = new Chess(fenBefore);
    const m0 = material(c);
    c.move(toMove(m.uci));
    const sign = m.color === 'w' ? 1 : -1;
    const take = pv.length - (pv.length % 2);       // end after the mover's own reply
    for (let k = 0; k < take; k++) if (!c.move(toMove(pv[k]))) break;
    const gave = (material(c) - m0) * sign;
    return gave <= -2 && m.piece !== 'p' || gave <= -3;
  } catch { return false; }
}

export const sanFor = (fen, uci) => {
  try { return new Chess(fen).move(toMove(uci)).san; } catch { return uci; }
};
