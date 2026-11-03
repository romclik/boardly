// A small step-by-step shell used by the piece and board creators.
import { toast } from './ui.js';

/**
 * steps: [{ label, title, hint, mount(body), validate?() -> string|null (may be async), leave?() (may be async) }]
 * Validation and leave() must work from the editor's own state (not from the step's DOM).
 */
export function wizard(view, { title, steps, saveLabel = 'Save', onSave }) {
  let cur = -1;
  let max = 0;
  view.innerHTML = `
    <div class="editor wiz">
      <div class="ed-head">
        <a class="back" href="#/create">← Back</a>
        <h1 class="page-title"></h1>
        <div class="ed-head-actions"><a class="btn ghost" href="#/create">Cancel</a></div>
      </div>
      <ol class="stepper" aria-label="Steps">${steps.map((s, i) => `<li><button type="button" data-i="${i}"><span class="num">${i + 1}</span><span class="lab">${s.label}</span></button></li>`).join('')}</ol>
      <section class="card wiz-card">
        <div class="wiz-head"><h2></h2><p class="hint"></p></div>
        <div class="wiz-body"></div>
      </section>
      <div class="wiz-foot"><button type="button" class="btn ghost" id="w-prev">Back</button><button type="button" class="btn primary" id="w-next">Next</button></div>
    </div>`;
  view.querySelector('.page-title').textContent = title;
  const $ = (s) => view.querySelector(s);
  const body = $('.wiz-body');
  let busy = false;

  function show(i) {
    cur = i;
    max = Math.max(max, i);
    const s = steps[i];
    $('.wiz-head h2').textContent = s.title;
    $('.wiz-head .hint').textContent = s.hint || '';
    body.replaceChildren();
    s.mount(body);
    view.querySelectorAll('.stepper button').forEach((b) => {
      const k = +b.dataset.i;
      b.classList.toggle('cur', k === i);
      b.classList.toggle('done', k < i || k < max);
      b.toggleAttribute('aria-current', k === i);
    });
    $('#w-prev').hidden = i === 0;
    $('#w-next').textContent = i === steps.length - 1 ? saveLabel : `Next: ${steps[i + 1].label}`;
    window.scrollTo(0, 0);
  }

  // Check steps from..to-1 and close them. Returns false if one of them needs fixing.
  async function advance(to) {
    for (let k = cur; k < to; k++) {
      const err = await steps[k].validate?.();
      if (err) { toast(err); if (k !== cur) show(k); return false; }
      await steps[k].leave?.();
    }
    return true;
  }

  async function go(i) {
    if (busy || i === cur) return;
    busy = true;
    try {
      if (i > cur) { if (!(await advance(i))) return; } else await steps[cur].leave?.();
      show(i);
    } finally { busy = false; }
  }

  view.querySelectorAll('.stepper button').forEach((b) => b.addEventListener('click', () => go(+b.dataset.i)));
  $('#w-prev').addEventListener('click', () => go(cur - 1));
  $('#w-next').addEventListener('click', async () => {
    if (cur < steps.length - 1) { go(cur + 1); return; }
    if (busy) return;
    busy = true;
    try {
      if (await advance(steps.length - 1) !== true) return;
      const err = await steps[cur].validate?.();
      if (err) { toast(err); return; }
      await steps[cur].leave?.();
      await onSave();
    } finally { busy = false; }
  });
  show(0);
}
