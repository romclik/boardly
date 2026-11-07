// PGN export and the "game over" info popup (v2.3.2).
import { modal, toast, download, esc } from './ui.js';
import { timeLabel, category } from './time.js';

const pad = (n) => String(n).padStart(2, '0');

// info: { moves[] (verbose), winner, reason, mode, custom, boardName, rules, elo, humanColor, name, time, date }
export function playerNames(info) {
  if (info.mode === 'bot') {
    const me = info.name || 'player';
    const bot = `Boardly Bot (${info.elo} Elo)`;
    return info.humanColor === 'w' ? { w: me, b: bot } : { w: bot, b: me };
  }
  return { w: 'White', b: 'Black' };
}

export function resultCode(winner) {
  return winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2';
}

function tag(name, value) {
  return `[${name} "${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

export function buildPgn(info) {
  const d = new Date(info.date);
  const names = playerNames(info);
  const res = resultCode(info.winner);
  const tags = [
    tag('Event', info.mode === 'bot' ? 'Boardly game against a bot' : 'Boardly game with a friend'),
    tag('Site', 'Boardly'),
    tag('Date', `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`),
    tag('Round', '-'),
    tag('White', names.w),
    tag('Black', names.b),
    tag('Result', res),
  ];
  if (info.mode === 'bot') tags.push(tag(info.humanColor === 'w' ? 'BlackElo' : 'WhiteElo', info.elo));
  if (info.time && info.time !== 'Unlimited') {
    const [m, i] = info.time.split('+').map(Number);
    tags.push(tag('TimeControl', `${Math.round(m * 60)}+${i || 0}`));
  } else tags.push(tag('TimeControl', '-'));
  tags.push(tag('Termination', /on time/.test(info.reason) ? 'time forfeit' : 'normal'));
  if (info.custom) {
    tags.push(tag('Variant', 'Boardly Custom'));
    tags.push(tag('Board', info.boardName || 'Custom'));
    const r = [];
    if (info.rules?.kingCapture) r.push('King capture');
    if (info.rules?.noDraw) r.push('No draws');
    if (r.length) tags.push(tag('Rules', r.join(', ')));
  }

  // movetext: "1. e4 e5 2. Nf3 ..." A side that had to skip its turn (King capture) is written as "--".
  const parts = [];
  let expect = 'w';
  let n = 1;
  let whiteDone = false;                 // White's token for move number n was just written
  const step = (token) => {
    if (expect === 'w') { parts.push(`${n}. ${token}`); whiteDone = true; expect = 'b'; }
    else {
      parts.push(whiteDone ? token : `${n}... ${token}`);
      whiteDone = false; expect = 'w'; n++;
    }
  };
  for (const m of info.moves) {
    while (m.color !== expect) step('--');
    step(m.san);
  }
  parts.push(res);
  let text = '', line = '';
  for (const p of parts) {
    if ((line + ' ' + p).trim().length > 80) { text += line + '\n'; line = p; } else line = (line + ' ' + p).trim();
  }
  text += line;
  const note = info.custom ? '{ Custom board: piece letters are Boardly\'s own, so other chess programs may not read this game. }\n' : '';
  return tags.join('\n') + '\n\n' + note + text + '\n';
}

// Hand a finished game to the Analyze page.
export function openAnalysis(pgn) {
  try { sessionStorage.setItem('boardly:analyze-pending', pgn); } catch { /* ignore */ }
  location.hash = '#/analyze';
}

export function pgnFileName(date = Date.now()) {
  const d = new Date(date);
  return `boardly_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.pgn`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {                                   // older browsers / insecure pages
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-999px';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

// The popup shown when a game ends (also reopened from the "Game info" button).
// hooks: { onRematch, onNew }
export function gameInfoPopup(info, hooks = {}) {
  const title = info.winner === null ? 'Draw' : info.winner === 'w' ? 'White won' : 'Black won';
  const names = playerNames(info);
  const full = Math.ceil(info.moves.length / 2);
  const mode = info.custom ? `Custom: ${info.boardName || 'board'}` : 'Classic';
  const rules = [];
  if (info.rules?.kingCapture) rules.push('King capture');
  if (info.rules?.noDraw) rules.push('No draws');
  const rows = [
    ['White', names.w], ['Black', names.b], ['Result', `${resultCode(info.winner)} ${info.reason}`],
    ['Moves', info.moves.length ? `${full} (${info.moves.length} half-moves)` : 'none'],
    ['Time', info.time === 'Unlimited' ? 'Unlimited' : `${timeLabel(info.time)} · ${category(info.time)}`],
    ['Mode', mode + (rules.length ? ` · ${rules.join(', ')}` : '')],
    ['Played', new Date(info.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })],
  ];
  const body = document.createElement('div');
  body.innerHTML = `<dl class="ginfo">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="pgn-choice" hidden>
      <p>Save the game as PGN. How?</p>
      <div class="pgn-btns">
        <button type="button" class="btn primary" data-p="copy">Copy to clipboard</button>
        <button type="button" class="btn primary" data-p="file">Download file</button>
      </div>
      ${info.custom ? '<p class="pgn-note">Custom boards use Boardly’s own piece letters, so other chess sites may not open this PGN.</p>' : ''}
    </div>`;
  const choice = body.querySelector('.pgn-choice');
  const m = modal({
    title,
    text: info.reason.replace(/^by /, 'By ').replace(/^on /, 'On '),
    content: body,
    actions: [
      { label: 'Save PGN', kind: 'primary', keepOpen: true, run: () => { choice.hidden = !choice.hidden; } },
      ...(!info.custom && info.moves.length ? [{ label: 'Analyze', run: () => openAnalysis(buildPgn(info)) }] : []),
      ...(hooks.onRematch ? [{ label: 'Rematch', run: hooks.onRematch }] : []),
      ...(hooks.onNew ? [{ label: 'New game', run: hooks.onNew }] : []),
      { label: 'Close' },
    ],
  });
  m.el.querySelector('.modal-card').classList.add('ginfo-card');
  body.querySelector('.pgn-btns').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-p]');
    if (!b) return;
    const pgn = buildPgn(info);
    if (b.dataset.p === 'copy') {
      const ok = await copyText(pgn);
      toast(ok ? 'PGN copied to the clipboard.' : 'Could not copy. Try “Download file” instead.', 2800);
      if (ok) b.textContent = 'Copied ✓';
    } else {
      download(pgnFileName(info.date), pgn);
      toast('PGN downloaded.', 2800);
      b.textContent = 'Downloaded ✓';
    }
  });
  return m;
}
