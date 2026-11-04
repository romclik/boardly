// An accessible dropdown whose options can show a colour swatch (native <select> can't).
import { esc } from './ui.js';

export function dropdown({ label, items, value, onChange }) {
  let cur = value;
  const root = document.createElement('div');
  root.className = 'dd';
  root.innerHTML = `<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false"><span class="dd-cur"></span><svg class="dd-chev" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <ul class="dd-list" role="listbox" tabindex="-1" hidden></ul>`;
  const btn = root.querySelector('.dd-btn');
  const list = root.querySelector('.dd-list');
  btn.setAttribute('aria-label', label);
  list.setAttribute('aria-label', label);

  const item = (id) => items.find((i) => i.id === id) || items[0];
  function paint() {
    const it = item(cur);
    btn.querySelector('.dd-cur').innerHTML = `${it.swatch}<span>${esc(it.name)}</span>`;
    list.innerHTML = items.map((i) => `<li role="option" tabindex="-1" data-id="${esc(i.id)}" aria-selected="${i.id === cur}">${i.swatch}<span>${esc(i.name)}</span></li>`).join('');
  }
  const opts = () => [...list.querySelectorAll('[role=option]')];
  const onOutside = (e) => { if (!root.contains(e.target)) close(); };

  function open() {
    if (!list.hidden) return;
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside);
    (opts().find((o) => o.getAttribute('aria-selected') === 'true') || opts()[0])?.focus();
    list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }
  function close(refocus) {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside);
    if (refocus) btn.focus();
  }
  function choose(id) {
    cur = id;
    paint();
    close(true);
    onChange(id);
  }

  btn.addEventListener('click', () => (list.hidden ? open() : close()));
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('[role=option]'); if (li) choose(li.dataset.id); });
  list.addEventListener('keydown', (e) => {
    const o = opts();
    const i = o.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); o[Math.min(o.length - 1, i + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); o[Math.max(0, i - 1)]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); o[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); o[o.length - 1]?.focus(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i >= 0) choose(o[i].dataset.id); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
  });
  paint();
  return root;
}
