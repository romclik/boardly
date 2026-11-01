// Stockfish 19 (lite, single-threaded WebAssembly) running in a Web Worker.
// Falls back to a tiny built-in bot if the worker can't start (e.g. page opened via file://).

export const ELO_MIN = 400;
export const ELO_MAX = 3200;
const SF_MIN = 1320;
const SF_MAX = 3190;

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
  bestMove(fen, { elo, movetime }) {
    const run = async () => {
      await this.load();
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
    };
    const p = this.chain.then(run);
    this.chain = p.catch(() => {});
    return p;
  }
}

// Below Stockfish's minimum rating, the bot sometimes plays a random legal move instead.
export function blunderChance(elo) {
  if (elo >= SF_MIN) return 0;
  return ((SF_MIN - elo) / (SF_MIN - ELO_MIN)) * 0.6;
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
