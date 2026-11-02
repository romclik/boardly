// Bot for custom boards and pieces: a small alpha-beta search over our own rules engine.
// Strength comes from search depth plus the same "human-like mistakes" picker the Stockfish bot uses.
import { CustomChess } from './rules.js';
import { pickHumanMove } from './engine.js';

const MATE = 30000;
const INF = 1e9;

export function botSettings(elo) {
  const depth = elo < 400 ? 1 : elo < 900 ? 2 : elo < 1500 ? 3 : 4;
  const timeMs = elo < 900 ? 500 : elo < 1500 ? 900 : elo < 2200 ? 1400 : 2200;
  return { depth, timeMs };
}

export function chooseMove(state, { elo, timeMs }) {
  const g = CustomChess.restore(state);
  const legal = g.legalInternal();
  if (!legal.length) return null;
  const out = (m) => ({ from: g.sqName(m.from), to: g.sqName(m.to), promotion: m.promo || undefined });
  if (legal.length === 1) return out(legal[0]);

  const { depth: maxDepth } = botSettings(elo);
  const defs = g.defs;
  const me = g.turn_;
  const deadline = performance.now() + timeMs;
  let nodes = 0, abort = false;

  const evalPos = () => {
    let s = 0;
    for (const p of g.b) if (p) { const v = defs[p.t].value * 100; s += p.c === g.turn_ ? v : -v; }
    return s;
  };
  const order = (list) => {
    list.forEach((m) => { m.o = (m.cap ? 1000 + defs[m.cap].value * 10 - defs[m.t].value : 0) + (m.promo ? 800 : 0); });
    return list.sort((a, b) => b.o - a.o);
  };
  const tick = () => { if ((++nodes & 255) === 0 && performance.now() > deadline) abort = true; return abort; };

  const quiesce = (alpha, beta, ply, qd) => {
    if (tick()) return 0;
    const stand = evalPos();
    if (qd === 0 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const caps = order(g.pseudo(g.turn_).filter((m) => m.cap));
    for (const m of caps) {
      if (defs[m.cap].royal) return MATE - ply;
      const rec = g.make(m);
      const v = -quiesce(-beta, -alpha, ply + 1, qd - 1);
      g.unmake(rec);
      if (abort) return 0;
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  };

  const negamax = (depth, alpha, beta, ply) => {
    if (tick()) return 0;
    if (depth === 0) return quiesce(alpha, beta, ply, 3);
    const moves = order(g.pseudo(g.turn_));
    if (!moves.length) return 0;
    let best = -INF;
    for (const m of moves) {
      if (m.cap && defs[m.cap].royal) return MATE - ply;
      const rec = g.make(m);
      const v = -negamax(depth - 1, -beta, -alpha, ply + 1);
      g.unmake(rec);
      if (abort) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  };

  const window = elo < 1000 ? 1500 : 400;      // weaker bots need accurate scores for more moves
  let result = null;
  for (let d = 1; d <= maxDepth; d++) {
    const scored = [];
    let bestSoFar = -INF;
    for (const m of order([...legal])) {
      const rec = g.make(m);
      let score;
      g._legal = null;
      const replies = g.legalInternal();
      if (!replies.length) score = g.hasCheck(g.turn_) ? MATE : 0;
      else score = -negamax(d - 1, -INF, -(bestSoFar - window), 1);
      g.unmake(rec);
      g._legal = null;
      if (abort) break;
      scored.push({ move: m, score });
      if (score > bestSoFar) bestSoFar = score;
    }
    if (abort) break;
    result = scored;
  }
  g._legal = null;
  if (!result) result = legal.map((m) => ({ move: m, score: 0 }));
  result.sort((a, b) => b.score - a.score);
  const cands = result.map((r) => ({ move: r.move, score: r.score }));
  const picked = pickHumanMove(cands.map((c) => ({ move: c.move, score: c.score })), elo);
  return out(picked);
}
