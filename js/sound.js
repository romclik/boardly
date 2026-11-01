// Synthesized chess sounds (no audio files). Each piece sound is a short filtered noise "click"
// plus a low "thump", like a piece landing on a wooden board. Bells are used for check and results.
let ctx, master, noiseBuf;

function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 0.3);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

function noise(t, { f, q = 1, dur, gain, type = 'bandpass' }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = f;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function thump(t, { f0, f1, dur, gain }) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function bell(t, freq, dur, gain) {
  [[1, 1], [2.01, 0.28], [3.02, 0.1]].forEach(([mul, amp]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mul;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mul ** 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
}

function drop(t, strength = 1, pitch = 1) {
  noise(t, { f: 2600 * pitch, q: 0.8, dur: 0.035, gain: 0.55 * strength });
  noise(t, { f: 750 * pitch, q: 1.1, dur: 0.1, gain: 0.8 * strength });
  thump(t, { f0: 190 * pitch, f1: 70, dur: 0.1, gain: 0.9 * strength });
}

const sounds = {
  move: (t) => drop(t, 0.9, 1),
  capture: (t) => {
    drop(t, 1.25, 0.85);
    noise(t + 0.01, { f: 1500, q: 0.7, dur: 0.14, gain: 0.5 });
    thump(t, { f0: 130, f1: 48, dur: 0.18, gain: 0.9 });
  },
  castle: (t) => { drop(t, 0.9, 1.05); drop(t + 0.12, 0.9, 0.9); },
  promote: (t) => { drop(t, 0.9, 1); bell(t + 0.07, 659, 0.35, 0.16); bell(t + 0.15, 988, 0.5, 0.16); },
  check: (t) => { drop(t, 1, 1); bell(t + 0.05, 880, 0.45, 0.2); },
  start: (t) => { bell(t, 523, 0.5, 0.15); bell(t + 0.11, 784, 0.7, 0.15); },
  win: (t) => { [523, 659, 784, 1047].forEach((f, i) => bell(t + i * 0.1, f, 0.9, 0.16)); },
  lose: (t) => { [494, 392, 330, 262].forEach((f, i) => bell(t + i * 0.14, f, 0.9, 0.15)); },
  draw: (t) => { bell(t, 523, 0.8, 0.15); bell(t + 0.16, 523, 0.9, 0.12); bell(t + 0.16, 392, 0.9, 0.12); },
};

// settings: { sound: boolean, volume: 0..100 }
export function play(kind, settings) {
  if (!settings?.sound || !sounds[kind]) return;
  try {
    init();
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = Math.max(0, Math.min(1, (settings.volume ?? 70) / 100)) * 0.9;
    sounds[kind](ctx.currentTime + 0.005);
  } catch { /* audio is optional */ }
}
