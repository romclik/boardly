import { chooseMove } from './custombot.js';
self.onmessage = (e) => {
  const { id, state, opts } = e.data;
  try { self.postMessage({ id, move: chooseMove(state, opts) }); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
