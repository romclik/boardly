// Small static / interactive boards used by the editors and the Play setup preview.
export const rowsToBool = (rows) => rows.map((r) => [...r].map((c) => c === '1'));
export const boolToRows = (cells) => cells.map((r) => r.map((c) => (c ? '1' : '0')).join(''));

export function createGrid({ w, h, cells, cell = 40, ghost = false }) {
  const el = document.createElement('div');
  el.className = 'mini';
  el.style.setProperty('--cell', `${cell}px`);
  el.style.gridTemplateColumns = `repeat(${w}, var(--cell))`;
  const map = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const c = document.createElement('div');
      const on = cells[y][x];
      c.className = 'mc ' + (on ? ((x + (h - 1 - y)) % 2 === 0 ? 'dark' : 'light') : `void${ghost ? ' ghost' : ''}`);
      c.dataset.x = x;
      c.dataset.y = y;
      el.append(c);
      row.push(c);
    }
    map.push(row);
  }
  return { el, w, h, at: (x, y) => map[y]?.[x] };
}

export function setPiece(cellEl, src, alt = '') {
  cellEl.querySelector('img.pc')?.remove();
  if (!src) return;
  const img = new Image();
  img.className = 'pc';
  img.src = src;
  img.alt = alt;
  img.draggable = false;
  cellEl.append(img);
}

// A non-interactive picture of a board with a setup on it.
export function thumbBoard(board, setup, pieceLookup, maxPx = 150) {
  const cell = Math.max(6, Math.floor(maxPx / Math.max(board.w, board.h)));
  const g = createGrid({ w: board.w, h: board.h, cells: rowsToBool(board.cells), cell });
  g.el.classList.add('thumb');
  for (const [x, y, id, c] of setup?.pieces || []) {
    const p = pieceLookup(id);
    if (p && g.at(x, y)) setPiece(g.at(x, y), p.img[c], p.name);
  }
  return g.el;
}
