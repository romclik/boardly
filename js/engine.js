// Stockfish 19 (lite, single-threaded WebAssembly) running in a Web Worker.
// Falls back to a tiny built-in bot if the worker can't start (e.g. page opened via file://).

export const ELO_MIN = 100;
export const ELO_MAX = 3200;
const SF_MIN = 1320;   // Stockfish's own strength limiter only works from here...
const SF_MAX = 3190;   // ...up to here. Above this we just turn the limiter off.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class Engine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.listeners = new Set();
    this.chain = Promise.resolve();
  }

  send(cmd) { this.worker.postMessage(cmd); }

  once(pred, cb) {
    const fn = (line) => {
      if (pred(line)) { this.listeners.delete(fn); cb(line); }
    };
    this.listeners.add(fn);
  }

  load() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      let w;
      try {
        w = new Worker(new URL('../engine/stockfish-19-lite-single.js', import.meta.url));
      } catch (e) { reject(e); return; }
      this.worker = w;
      const timer = setTimeout(() => reject(new Error('Engine start timed out')), 20000);
      w.onerror = (e) => { clearTimeout(timer); reject(e); };
      w.onmessage = (ev) => {
        const line = typeof ev.data === 'string' ? ev.data : String(ev.data);
        [...this.listeners].forEach((f) => f(line));
      };
      this.once((l) => l === 'uciok', () => {
        this.send('setoption name Threads value 1');
        this.send('setoption name Hash value 16');
        this.send('isready');
        this.once((l) => l === 'readyok', () => { clearTimeout(timer); resolve(); });
      });
      this.send('uci');
    });
    return this.ready;
  }

  newGame() {
    if (this.worker && this.ready) this.ready.then(() => this.send('ucinewgame')).catch(() => {});
  }

  stop() {
    if (this.worker) this.send('stop');
  }

  // Resolves with a move like "e2e4" or "e7e8q".
  bestMove(fen, { elo, movetime, legalCount = 30 }) {
    const run = async () => {
      await this.load();
      return elo < SF_MIN ? this.humanLike(fen, elo, legalCount) : this.limited(fen, elo, movetime);
    };
    const p = this.chain.then(run);
    this.chain = p.catch(() => {});
    return p;
  }

  // 1320+ : Stockfish's built-in Elo limiter.
  limited(fen, elo, movetime) {
    this.send('setoption name MultiPV value 1');
    if (elo >= SF_MAX) {
      this.send('setoption name UCI_LimitStrength value false');
    } else {
      this.send('setoption name UCI_LimitStrength value true');
      this.send(`setoption name UCI_Elo value ${Math.max(SF_MIN, elo)}`);
    }
    return new Promise((resolve) => {
      this.once((l) => l.startsWith('bestmove'), (l) => resolve(l.split(' ')[1]));
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${Math.round(movetime)}`);
    });
  }

  // Below 1320: shallow search for several candidate moves, then choose like a weak human would.
  humanLike(fen, elo, legalCount) {
    const { depth, multipv } = lowEloSearch(elo, legalCount);
    this.send('setoption name UCI_LimitStrength value false');
    this.send(`setoption name MultiPV value ${multipv}`);
    const lines = new Map();
    return new Promise((resolve) => {
      const onInfo = (l) => {
        if (!l.startsWith('info') || l.includes('bound')) return;
        const m = l.match(/depth (\d+).*? multipv (\d+) score (cp|mate) (-?\d+).*? pv (\S+)/);
        if (!m) return;
        const [, d, k, kind, val, move] = m;
        const prev = lines.get(+k);
        if (prev && prev.depth > +d) return;
        const v = +val;
        const score = kind === 'cp' ? v : Math.sign(v) * (3000 - Math.abs(v) * 10);
        lines.set(+k, { depth: +d, score, move });
      };
      this.listeners.add(onInfo);
      this.once((l) => l.startsWith('bestmove'), (l) => {
        this.listeners.delete(onInfo);
        const best = l.split(' ')[1];
        const cands = [...lines.values()].sort((a, b) => b.score - a.score);
        resolve(cands.length ? pickHumanMove(cands, elo) : best);
      });
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }
}

// How hard the weak bot looks: shallower search and more candidates the weaker it is.
export function lowEloSearch(elo, legalCount) {
  const depth = elo < 300 ? 1 : elo < 600 ? 2 : elo < 900 ? 3 : elo < 1150 ? 4 : 5;
  const multipv = clamp(elo < 600 ? 14 : elo < 1000 ? 10 : 7, 1, Math.max(1, legalCount));
  return { depth, multipv };
}

/**
 * Choose a move from Stockfish's candidate lines (sorted best first, scores in centipawns).
 * - Most moves: pick among candidates that lose less than a "budget", favouring better ones
 *   (softmax). That gives lots of small inaccuracies, like a real beginner.
 * - Sometimes (a "blunder moment") the budget is ignored and a much worse move can be played.
 * - Never random from the whole move list, so it doesn't throw away pieces for no reason
 *   every other move, and a mate in one is rarely missed.
 */
export function pickHumanMove(cands, elo, rand = Math.random) {
  if (cands.length === 1) return cands[0].move;
  let temp, budget, blunderChance;
  if (elo <= SF_MIN) {
    const t = clamp((elo - 100) / (SF_MIN - 100), 0, 1);
    temp = 700 * Math.pow(45 / 700, t);             // 700cp at 100 Elo -> 45cp at 1320
    budget = lerp(900, 100, Math.sqrt(t));           // biggest "normal" mistake in centipawns
    blunderChance = lerp(0.28, 0.03, t);             // chance of a real blunder moment
  } else {                                           // stronger than 1320 (used by the custom-board bot)
    const u = clamp((elo - SF_MIN) / (ELO_MAX - SF_MIN), 0, 1);
    temp = lerp(45, 3, u);
    budget = lerp(100, 8, u);
    blunderChance = lerp(0.03, 0, u);
  }
  const best = cands[0].score;
  const loss = (c) => clamp(best - c.score, 0, 2000);

  let pool = cands;
  let T = temp;
  if (rand() < blunderChance) {
    T = temp * 2;                                   // blunder moment: anything goes, but still weighted
  } else {
    pool = cands.filter((c) => loss(c) <= budget);
  }
  // A forced mate for us is spotted most of the time even by weak players (simple mate-in-1/2).
  if (best > 2900 && rand() < lerp(0.5, 0.95, clamp((elo - 100) / 2000, 0, 1))) return cands[0].move;

  const w = pool.map((c) => Math.exp(-loss(c) / T));
  const sum = w.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i].move; }
  return pool[0].move;
}

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Basic 2-ply material search, used only when Stockfish can't load.
export function fallbackMove(chess) {
  const moves = chess.moves({ verbose: true });
  const me = chess.turn();
  const score = () => {
    let s = 0;
    for (const row of chess.board()) for (const p of row) if (p) s += (p.color === me ? 1 : -1) * VALUE[p.type];
    return s;
  };
  let best = [], bestScore = -Infinity;
  for (const m of moves) {
    chess.move(m);
    let worst = Infinity;
    if (chess.isCheckmate()) worst = 1000;
    else {
      const replies = chess.moves({ verbose: true });
      if (!replies.length) worst = 0;
      for (const r of replies) {
        chess.move(r);
        worst = Math.min(worst, chess.isCheckmate() ? -1000 : score());
        chess.undo();
      }
    }
    chess.undo();
    if (worst > bestScore) { bestScore = worst; best = [m]; } else if (worst === bestScore) best.push(m);
  }
  const m = best[Math.floor(Math.random() * best.length)];
  return m.from + m.to + (m.promotion || '');
}
