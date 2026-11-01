// Tiny synthesized sounds, no audio files needed.
let ctx;
function tone(freq, dur, type = 'triangle', gain = 0.12, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
export function play(kind, enabled) {
  if (!enabled) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (kind === 'move') tone(240, 0.09);
    else if (kind === 'capture') { tone(190, 0.12, 'square', 0.09); tone(120, 0.14, 'triangle', 0.14, 0.015); }
    else if (kind === 'check') { tone(520, 0.12, 'sine', 0.1); tone(390, 0.18, 'sine', 0.1, 0.09); }
    else if (kind === 'end') { tone(330, 0.25, 'sine', 0.12); tone(247, 0.35, 'sine', 0.12, 0.18); }
  } catch { /* audio is optional */ }
}
