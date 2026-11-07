// SVG icons for move ratings and king results, plus arrow shapes. No emoji anywhere (v3.1).

// "!" centred on 0,0 (about 18 units tall) and "?" the same, drawn white.
const EXC = '<rect x="-1.7" y="-9.5" width="3.4" height="11.5" rx="1.7"/><circle cx="0" cy="6.8" r="2"/>';
const QST = '<path d="M-3.9 -5.2a4.3 4.3 0 1 1 6.4 3.7c-1.7 1-2.5 1.8-2.5 3.6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="0" cy="7" r="2"/>';
const at = (inner, x, s) => `<g transform="translate(${x} 12) scale(${s})" fill="#fff">${inner}</g>`;

const ICONS = {
  brilliant: at(EXC, 7.6, 0.62) + at(EXC, 16.4, 0.62),
  critical: at(EXC, 12, 0.78),
  best: '<path fill="#fff" d="M12 3.4l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  excellent: '<path fill="#fff" d="M3 10.5h3.6V20H3zM8.4 10.8l3.2-6.4c.3-.6 1-.9 1.6-.7 1 .3 1.5 1.3 1.3 2.3l-.6 2.9h4.6c1.2 0 2.1 1.2 1.8 2.3l-1.7 6.4c-.2.9-1 1.5-1.9 1.5H8.4z"/>',
  okay: '<path d="M5.8 12.6l4.1 4.2 8.3-9" fill="none" stroke="#fff" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>',
  inaccuracy: at(QST, 8.6, 0.62) + at(EXC, 17.4, 0.62),
  mistake: at(QST, 12, 0.78),
  blunder: at(QST, 7.6, 0.62) + at(QST, 16.4, 0.62),
  theory: '<path d="M3.6 5.8c3 0 5.9.6 8.4 2.2 2.5-1.6 5.4-2.2 8.4-2.2v12.4c-3 0-5.9.6-8.4 2.2-2.5-1.6-5.4-2.2-8.4-2.2z M12 8v12.4" fill="none" stroke="#fff" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"/>',
  crown: '<path fill="#fff" d="M3.8 8.2l4.2 3.6L12 5.2l4 6.6 4.2-3.6-1.5 9H5.3z"/><rect x="5.3" y="19" width="13.4" height="2.2" rx="1" fill="#fff"/>',
  mate: '<path d="M9.2 4.8l-1.1 14.4M15.9 4.8l-1.1 14.4M4.6 9.4h15.2M4.2 14.6h15.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
};

export const iconSvg = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[id] || ''}</svg>`;

// A coloured circle with the icon inside. size: CSS size like '26px' (default is set in CSS).
export function ratingBadge(id, color, { size = '', cls = '', title = '' } = {}) {
  return `<span class="rb ${cls}" style="--c:${color};${size ? `--rb:${size}` : ''}"${title ? ` title="${title}"` : ''}>${iconSvg(id)}</span>`;
}

// Result marker on a king: a green crown for the winner, a red "#" for the loser.
export function kingBadge(kind) {
  return `<span class="rb kb ${kind}" style="--c:${kind === 'win' ? '#7cb342' : '#e03c3a'}" title="${kind === 'win' ? 'Winner' : 'Lost'}">${iconSvg(kind === 'win' ? 'crown' : 'mate')}</span>`;
}

// Arrow from square centre p0 to p1 (board units). Knight jumps get an L shape: long leg first.
export function arrowSvg(p0, p1, { color, opacity = 0.85, knight = false, width = 0.17 }) {
  const dc = Math.abs(p1.x - p0.x), dr = Math.abs(p1.y - p0.y);
  const pts = knight ? [p0, dc > dr ? { x: p1.x, y: p0.y } : { x: p0.x, y: p1.y }, p1] : [p0, p1];
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  const ux = (last.x - prev.x) / len, uy = (last.y - prev.y) / len;
  const head = 0.46, tip = { x: last.x - ux * 0.04, y: last.y - uy * 0.04 };
  const base = { x: tip.x - ux * head, y: tip.y - uy * head };
  const line = [...pts.slice(0, -1), base].map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
  const hw = 0.27, px = -uy, py = ux;
  const tri = `${tip.x},${tip.y} ${base.x + px * hw},${base.y + py * hw} ${base.x - px * hw},${base.y - py * hw}`;
  return `<g opacity="${opacity}"><polyline points="${line}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/><polygon points="${tri}" fill="${color}"/></g>`;
}
