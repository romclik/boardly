// Small shared UI helpers.
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function modal({ title, text, actions = [], content = null, wide = false }) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div class="modal-card${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
    <h3></h3>${text ? '<p class="modal-text"></p>' : ''}<div class="modal-body"></div><div class="modal-actions"></div></div>`;
  el.querySelector('h3').textContent = title;
  if (text) el.querySelector('.modal-text').textContent = text;
  if (content) el.querySelector('.modal-body').append(content);
  el.querySelector('.modal-card').setAttribute('aria-label', title);
  const box = el.querySelector('.modal-actions');
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  const buttons = actions.map((a) => {
    const b = document.createElement('button');
    b.className = `btn ${a.kind || 'ghost'}`;
    b.textContent = a.label;
    b.addEventListener('click', () => { if (a.keepOpen) { a.run?.(close); } else { close(); a.run?.(); } });
    box.append(b);
    return b;
  });
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  document.body.append(el);
  buttons[0]?.focus();
  return { el, close, buttons };
}

export function toast(msg, ms = 6000) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
