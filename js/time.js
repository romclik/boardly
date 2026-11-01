// Time control helpers. A time control is stored as "minutes+incrementSeconds", e.g. "15+10",
// or the word "Unlimited".

export const MINUTES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40, 45, 60, 90, 120, 180];
export const INCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 45, 60, 90, 120, 180];
export const PRESETS = ['1+0', '3+2', '5+0', '10+0', '15+10', '30+0'];

export function parseTime(str) {
  if (!str || str === 'Unlimited') return { base: 0, inc: 0 };
  const [m, i] = str.split('+').map(Number);
  return { base: m * 60000, inc: (i || 0) * 1000 };
}

export function minLabel(m) {
  return { 0.25: '¼', 0.5: '½', 0.75: '¾' }[m] ?? String(m);
}

export function timeLabel(str) {
  if (!str || str === 'Unlimited') return 'Unlimited';
  const [m, i] = str.split('+').map(Number);
  return `${minLabel(m)}+${i || 0}`;
}

// Same buckets Lichess uses: estimated game length = time + 40 × increment.
export function category(str) {
  if (!str || str === 'Unlimited') return 'No clock';
  const [m, i] = str.split('+').map(Number);
  const est = m * 60 + (i || 0) * 40;
  if (est < 30) return 'UltraBullet';
  if (est < 180) return 'Bullet';
  if (est < 480) return 'Blitz';
  if (est < 1500) return 'Rapid';
  return 'Classical';
}

export function nearestIndex(list, value) {
  let best = 0;
  list.forEach((v, k) => { if (Math.abs(v - value) < Math.abs(list[best] - value)) best = k; });
  return best;
}
