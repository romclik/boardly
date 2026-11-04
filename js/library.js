// Library of custom pieces and boards (saved in localStorage) + import/export.
//
// PIECE  { id, name, sym, royal, value, rel, ep, promo:[ids], img:{w,b}, moves:[CELL] }
// CELL   { dx, dy, m:'b'|'m'|'c', t:'leap'|'walk'|'slide', r:1..99, j:0|1, f:0|1 }
//          m = both / move only / capture only,  r = max repeats for slide (99 = unlimited),
//          j = slide can pass over pieces,  f = only on the piece's first move
//          dy < 0 is "forward" for White (towards the top of the screen).
// BOARD  { id, name, w, h, cells:[rowString...] (top row first, '1' = square exists),
//          setups:[{ id, name, pieces:[[x, y, pieceId, 'w'|'b'], ...] }] }

export const APP_VERSION = '2.2';
export const MAX_SIZE = 16;
const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMG = 160000;
const INF = 99;

// ---------- built-in pieces ----------
const cell = (dx, dy, m = 'b', t = 'leap', r = 1, j = 0, f = 0) => ({ dx, dy, m, t, r, j, f });
const around = (list, make) => list.map(([dx, dy]) => make(dx, dy));
const ORTHO = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const DIAG = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const KNIGHT = [[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]];

export function presetMoves(name) {
  const slide = (dx, dy) => cell(dx, dy, 'b', 'slide', INF);
  switch (name) {
    case 'King': return around([...ORTHO, ...DIAG], (x, y) => cell(x, y));
    case 'Queen': return around([...ORTHO, ...DIAG], slide);
    case 'Rook': return around(ORTHO, slide);
    case 'Bishop': return around(DIAG, slide);
    case 'Knight': return around(KNIGHT, (x, y) => cell(x, y));
    case 'Pawn': return [cell(0, -1, 'm'), cell(0, -2, 'm', 'walk', 1, 0, 1), cell(-1, -1, 'c'), cell(1, -1, 'c')];
    case 'Wazir (1 straight)': return around(ORTHO, (x, y) => cell(x, y));
    case 'Ferz (1 diagonal)': return around(DIAG, (x, y) => cell(x, y));
    case 'Alfil (2 diagonal jump)': return around(DIAG, (x, y) => cell(x * 2, y * 2));
    case 'Dabbaba (2 straight jump)': return around(ORTHO, (x, y) => cell(x * 2, y * 2));
    case 'Camel (3,1 jump)': return around([[1, -3], [3, -1], [3, 1], [1, 3], [-1, 3], [-3, 1], [-3, -1], [-1, -3]], (x, y) => cell(x, y));
    case 'Zebra (3,2 jump)': return around([[2, -3], [3, -2], [3, 2], [2, 3], [-2, 3], [-3, 2], [-3, -2], [-2, -3]], (x, y) => cell(x, y));
    case 'Nightrider': return around(KNIGHT, (x, y) => cell(x, y, 'b', 'slide', INF));
    default: return [];
  }
}
export const PRESET_NAMES = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn', 'Wazir (1 straight)', 'Ferz (1 diagonal)',
  'Alfil (2 diagonal jump)', 'Dabbaba (2 straight jump)', 'Camel (3,1 jump)', 'Zebra (3,2 jump)', 'Nightrider'];

const std = (id, name, sym, moves, extra = {}) => ({
  id, name, sym, royal: false, value: 1, rel: true, ep: false, promo: [],
  img: { w: `pieces/w${id}.svg`, b: `pieces/b${id}.svg` }, moves, builtin: true, ...extra,
});
export const BUILTIN_PIECES = [
  std('K', 'King', 'K', presetMoves('King'), { royal: true, value: 0 }),
  std('Q', 'Queen', 'Q', presetMoves('Queen'), { value: 9 }),
  std('R', 'Rook', 'R', presetMoves('Rook'), { value: 5 }),
  std('B', 'Bishop', 'B', presetMoves('Bishop'), { value: 3 }),
  std('N', 'Knight', 'N', presetMoves('Knight'), { value: 3 }),
  std('P', 'Pawn', '', presetMoves('Pawn'), { value: 1, ep: true, promo: ['Q', 'R', 'B', 'N'] }),
];

const BACK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
function classicSetup() {
  const p = [];
  BACK.forEach((id, x) => { p.push([x, 0, id, 'b'], [x, 1, 'P', 'b'], [x, 6, 'P', 'w'], [x, 7, id, 'w']); });
  return p;
}
export const CLASSIC_BOARD = {
  id: 'classic', name: 'Classic 8×8', w: 8, h: 8, builtin: true,
  cells: Array(8).fill('11111111'),
  setups: [{ id: 'standard', name: 'Standard', pieces: classicSetup() }],
};

// ---------- storage ----------
let lib = null;
function load() {
  if (lib) return lib;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem('boardly:library')); } catch { /* ignore */ }
  lib = { pieces: [], boards: [] };
  if (raw && typeof raw === 'object') {
    lib.pieces = (raw.pieces || []).map((p) => sanitizePiece(p)).filter(Boolean);
    const ids = new Set([...BUILTIN_PIECES, ...lib.pieces].map((p) => p.id));
    lib.boards = (raw.boards || []).map((b) => sanitizeBoard(b, ids)).filter(Boolean);
  }
  return lib;
}
export function persist() {
  try { localStorage.setItem('boardly:library', JSON.stringify(load())); return true; } catch { return false; }
}
export const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const customPieces = () => load().pieces;
export const customBoards = () => load().boards;
export const allPieces = () => [...BUILTIN_PIECES, ...load().pieces];
export const allBoards = () => [CLASSIC_BOARD, ...load().boards];
export const pieceById = (id) => allPieces().find((p) => p.id === id);
export const boardById = (id) => allBoards().find((b) => b.id === id);

export function savePiece(piece) {
  const l = load();
  const i = l.pieces.findIndex((p) => p.id === piece.id);
  if (i >= 0) l.pieces[i] = piece; else l.pieces.push(piece);
  return persist();
}
export function saveBoard(board) {
  const l = load();
  const i = l.boards.findIndex((b) => b.id === board.id);
  if (i >= 0) l.boards[i] = board; else l.boards.push(board);
  return persist();
}
export function boardsUsingPiece(id) {
  return load().boards.filter((b) => b.setups.some((s) => s.pieces.some((p) => p[2] === id)));
}
export function deletePiece(id) {
  const l = load();
  l.pieces = l.pieces.filter((p) => p.id !== id);
  l.pieces.forEach((p) => { p.promo = p.promo.filter((x) => x !== id); });
  l.boards.forEach((b) => b.setups.forEach((s) => { s.pieces = s.pieces.filter((p) => p[2] !== id); }));
  return persist();
}
export function deleteBoard(id) {
  load().boards = load().boards.filter((b) => b.id !== id);
  return persist();
}

// ---------- helpers ----------
export function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

// Rough strength guess from how many squares the piece reaches on an empty 8×8 board.
export function estimateValue(piece) {
  const rules = compileRules(piece);
  let total = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const seen = new Set();
    for (const r of rules) {
      for (let k = 1; k <= r.r; k++) {
        const nx = x + r.dx * k, ny = y + r.dy * k;
        if (nx < 0 || ny < 0 || nx > 7 || ny > 7) break;
        if (!r.e || k === r.r) seen.add(ny * 8 + nx);
      }
    }
    total += seen.size;
  }
  const mob = total / 64;
  return Math.max(1, Math.min(15, Math.round(0.35 * mob + 0.9)));
}

// Editor cells -> engine rules.
export function compileRules(piece) {
  const out = [];
  for (const c of piece.moves) {
    if (c.t === 'walk') {
      const g = gcd(c.dx, c.dy);
      if (g > 1) out.push({ dx: c.dx / g, dy: c.dy / g, m: c.m, r: g, e: 1, j: 0, f: c.f });
      else out.push({ dx: c.dx, dy: c.dy, m: c.m, r: 1, e: 0, j: 0, f: c.f });
    } else if (c.t === 'slide') {
      out.push({ dx: c.dx, dy: c.dy, m: c.m, r: c.r, e: 0, j: c.j, f: c.f });
    } else {
      out.push({ dx: c.dx, dy: c.dy, m: c.m, r: 1, e: 0, j: 0, f: c.f });
    }
  }
  return out;
}

// ---------- sanitizing (used for storage and for imported files) ----------
const str = (v, max, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);
const int = (v, lo, hi, fb) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb; };

function cleanImg(v, fallback) {
  if (typeof v !== 'string') return fallback;
  if (/^pieces\/[wb][KQRBNP]\.svg$/.test(v)) return v;
  if (v.length <= MAX_IMG && IMG_RE.test(v)) return v;
  return fallback;
}

export function sanitizePiece(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id, 40).replace(/[^\w-]/g, '');
  const name = str(raw.name, 30);
  if (!id || !name) return null;
  const moves = [];
  for (const c of Array.isArray(raw.moves) ? raw.moves.slice(0, 400) : []) {
    if (!c || typeof c !== 'object') continue;
    const dx = int(c.dx, -15, 15, 0), dy = int(c.dy, -15, 15, 0);
    if (!dx && !dy) continue;
    moves.push({
      dx, dy,
      m: ['b', 'm', 'c'].includes(c.m) ? c.m : 'b',
      t: ['leap', 'walk', 'slide'].includes(c.t) ? c.t : 'leap',
      r: int(c.r, 1, INF, INF), j: c.j ? 1 : 0, f: c.f ? 1 : 0,
    });
  }
  const w = cleanImg(raw.img?.w, null), b = cleanImg(raw.img?.b, null);
  if (!w || !b) return null;
  const p = {
    id, name,
    sym: str(raw.sym, 2) || name[0].toUpperCase(),
    royal: !!raw.royal, value: int(raw.value, 0, 30, 1),
    rel: raw.rel !== false, ep: !!raw.ep,
    promo: (Array.isArray(raw.promo) ? raw.promo : []).filter((x) => typeof x === 'string').slice(0, 20).map((x) => x.replace(/[^\w-]/g, '')),
    img: { w, b }, moves,
  };
  return p;
}

export function sanitizeBoard(raw, knownPieceIds) {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id, 40).replace(/[^\w-]/g, '');
  const name = str(raw.name, 40);
  const w = int(raw.w, 1, MAX_SIZE, 0), h = int(raw.h, 1, MAX_SIZE, 0);
  if (!id || !name || !w || !h || !Array.isArray(raw.cells) || raw.cells.length !== h) return null;
  const cells = raw.cells.map((r) => (typeof r === 'string' && r.length === w && /^[01]+$/.test(r) ? r : null));
  if (cells.includes(null) || !cells.some((r) => r.includes('1'))) return null;
  const setups = [];
  for (const s of (Array.isArray(raw.setups) ? raw.setups : []).slice(0, 30)) {
    if (!s || typeof s !== 'object') continue;
    const sid = str(s.id, 40).replace(/[^\w-]/g, '');
    const sname = str(s.name, 40);
    if (!sid || !sname) continue;
    const seen = new Set();
    const pieces = [];
    for (const e of (Array.isArray(s.pieces) ? s.pieces : []).slice(0, w * h)) {
      if (!Array.isArray(e)) continue;
      const [x, y, pid, col] = e;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) continue;
      if (cells[y][x] !== '1' || (col !== 'w' && col !== 'b') || typeof pid !== 'string') continue;
      if (knownPieceIds && !knownPieceIds.has(pid)) continue;
      if (seen.has(`${x},${y}`)) continue;
      seen.add(`${x},${y}`);
      pieces.push([x, y, pid, col]);
    }
    setups.push({ id: sid, name: sname, pieces });
  }
  if (!setups.length) setups.push({ id: uid('s'), name: 'Setup 1', pieces: [] });
  return { id, name, w, h, cells, setups };
}

// ---------- variant for the rules engine ----------
export function resolveVariant(boardId, setupId, pieceList = null) {
  const board = boardById(boardId);
  if (!board) return null;
  const setup = board.setups.find((s) => s.id === setupId) || board.setups[0];
  const list = pieceList || setup.pieces;
  const pieces = {};
  const add = (id) => {
    if (pieces[id]) return;
    const p = pieceById(id);
    if (!p) return;
    pieces[id] = p;
    p.promo.forEach(add);
  };
  list.forEach((e) => add(e[2]));
  return { boardId: board.id, name: board.name, w: board.w, h: board.h, cells: board.cells, setup: list.filter((e) => pieces[e[2]]), pieces };
}

// ---------- export / import ----------
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

export function exportLibrary() {
  const l = load();
  const strip = ({ builtin, ...rest }) => rest;
  const data = {
    app: 'Boardly', type: 'library', formatVersion: 1, appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    pieces: l.pieces.map(strip),
    boards: l.boards.map(strip),
  };
  return { filename: `${stamp()}.txt`, text: JSON.stringify(data, null, 2), pieces: l.pieces.length, boards: l.boards.length };
}

// Returns a preview object; call preview.apply() to actually add things.
export function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not a Boardly export (could not read it).'); }
  if (!data || data.app !== 'Boardly' || data.type !== 'library') throw new Error('This file is not a Boardly export.');
  if (!Array.isArray(data.pieces) || !Array.isArray(data.boards)) throw new Error('The file is missing its pieces or boards list.');
  if (data.pieces.length > 300 || data.boards.length > 300) throw new Error('The file has too many items.');

  const l = load();
  const pieces = data.pieces.map((p) => sanitizePiece(p));
  const boards = [];
  const skipped = { pieces: pieces.filter((p) => !p).length, boards: 0 };
  const known = new Set([...BUILTIN_PIECES, ...l.pieces].map((p) => p.id));
  const idMap = new Map();
  const toAdd = { pieces: [], boards: [] };
  let same = 0;

  for (const p of pieces.filter(Boolean)) {
    const ex = l.pieces.find((q) => q.id === p.id);
    if (ex && JSON.stringify(ex) === JSON.stringify(p)) { same++; idMap.set(p.id, p.id); continue; }
    if (ex || BUILTIN_PIECES.some((b) => b.id === p.id)) {
      const nid = uid('p');
      idMap.set(p.id, nid);
      toAdd.pieces.push({ ...p, id: nid, name: `${p.name} (imported)`.slice(0, 30) });
    } else { idMap.set(p.id, p.id); toAdd.pieces.push(p); }
  }
  const remap = (id) => idMap.get(id) ?? id;
  toAdd.pieces.forEach((p) => { p.promo = p.promo.map(remap); });
  const allIds = new Set([...known, ...toAdd.pieces.map((p) => p.id)]);

  for (const raw of data.boards) {
    const withMapped = raw && typeof raw === 'object' ? {
      ...raw,
      setups: (Array.isArray(raw.setups) ? raw.setups : []).map((s) => (s && Array.isArray(s.pieces)
        ? { ...s, pieces: s.pieces.map((e) => (Array.isArray(e) ? [e[0], e[1], remap(e[2]), e[3]] : e)) } : s)),
    } : raw;
    const b = sanitizeBoard(withMapped, allIds);
    if (!b) { skipped.boards++; continue; }
    const ex = l.boards.find((q) => q.id === b.id);
    if (ex && JSON.stringify(ex) === JSON.stringify(b)) { same++; continue; }
    if (ex || b.id === CLASSIC_BOARD.id) toAdd.boards.push({ ...b, id: uid('b'), name: `${b.name} (imported)`.slice(0, 40) });
    else toAdd.boards.push(b);
  }
  return {
    pieces: toAdd.pieces.length, boards: toAdd.boards.length, same, skipped,
    exportedAt: data.exportedAt,
    apply() {
      const L = load();
      L.pieces.push(...toAdd.pieces);
      L.boards.push(...toAdd.boards);
      return persist();
    },
  };
}
