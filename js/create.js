import { pieceEditor } from './pieceeditor.js';
import { boardEditor } from './boardeditor.js';
import {
  BUILTIN_PIECES, CLASSIC_BOARD, customPieces, customBoards, pieceById, savePiece, saveBoard, deletePiece, deleteBoard,
  boardsUsingPiece, uid, exportLibrary, parseImport,
} from './library.js';
import { thumbBoard } from './boardview.js';
import { esc, modal, toast, download } from './ui.js';

export function createPage(view, parts) {
  if (parts[0] === 'piece') return pieceEditor(view, parts[1]);
  if (parts[0] === 'board') return boardEditor(view, parts[1]);
  return overview(view);
}

function overview(view) {
  const pieces = customPieces();
  const boards = customBoards();
  view.innerHTML = `
    <div class="create-head">
      <div><h1 class="page-title">CREATE</h1><p class="page-sub">Make your own boards and pieces</p></div>
      <div class="head-actions">
        <button type="button" class="btn ghost" id="imp">Import</button>
        <button type="button" class="btn ghost" id="exp">Export</button>
      </div>
    </div>
    <ol class="how">
      <li><b>1.</b> Make a <b>piece</b>: name it, draw it, say how it moves, test it.</li>
      <li><b>2.</b> Make a <b>board</b>: pick any shape and place the pieces.</li>
      <li><b>3.</b> Go to <b>Play</b>, choose the <b>Custom</b> gamemode and play.</li>
    </ol>
    <div class="sectors">
      <section class="sector" aria-labelledby="h-pieces">
        <header><h2 id="h-pieces">Pieces <span class="count">${pieces.length}</span></h2><a class="btn primary sm" href="#/create/piece/new">+ New piece</a></header>
        <div class="cards" id="c-pieces"></div>
        <details class="std"><summary>Standard pieces (copy one to change it)</summary><div class="cards" id="c-std"></div></details>
      </section>
      <section class="sector" aria-labelledby="h-boards">
        <header><h2 id="h-boards">Boards <span class="count">${boards.length}</span></h2><a class="btn primary sm" href="#/create/board/new">+ New board</a></header>
        <div class="cards" id="c-boards"></div>
        <details class="std"><summary>Standard board (copy it to change it)</summary><div class="cards" id="c-stdb"></div></details>
      </section>
    </div>
    <p class="hint create-note">Everything you make is saved in this browser. Use <b>Export</b> to keep a backup file, and <b>Import</b> to bring it back or move it to another device.</p>`;
  const $ = (s) => view.querySelector(s);

  const pieceCard = (p) => {
    const el = document.createElement('article');
    el.className = 'item';
    el.innerHTML = `<div class="item-pic"><img src="${esc(p.img.w)}" alt=""><img src="${esc(p.img.b)}" alt=""></div>
      <div class="item-body"><strong>${esc(p.name)}</strong><small>${p.royal ? 'Royal · ' : ''}${p.moves.length} move mark${p.moves.length === 1 ? '' : 's'}</small></div>
      <div class="item-actions">${p.builtin ? '' : `<a class="link-btn" href="#/create/piece/${encodeURIComponent(p.id)}">Edit</a>`}
        <button type="button" class="link-btn" data-a="dup">Copy</button>${p.builtin ? '' : '<button type="button" class="link-btn danger" data-a="del">Delete</button>'}</div>`;
    el.querySelector('[data-a=dup]').addEventListener('click', () => {
      const { builtin, ...rest } = structuredClone(p);
      const copy = { ...rest, id: uid('p'), name: `${p.name} copy`.slice(0, 30), promo: rest.promo.filter((x) => x !== p.id) };
      if (!savePiece(copy)) { toast('Could not save. Browser storage may be full.'); return; }
      location.hash = `#/create/piece/${copy.id}`;
    });
    el.querySelector('[data-a=del]')?.addEventListener('click', () => {
      const used = boardsUsingPiece(p.id);
      modal({
        title: `Delete “${p.name}”?`,
        text: used.length ? `It is used on ${used.length} board${used.length === 1 ? '' : 's'}. Those placements will be removed too.` : 'This can’t be undone. Export first if you want a backup.',
        actions: [{ label: 'Keep it' }, { label: 'Delete', kind: 'danger', run: () => { deletePiece(p.id); overview(view); } }],
      });
    });
    return el;
  };

  const boardCard = (b) => {
    const el = document.createElement('article');
    el.className = 'item board';
    el.innerHTML = `<div class="item-pic"></div>
      <div class="item-body"><strong>${esc(b.name)}</strong><small>${b.w}×${b.h} · ${b.setups.length} placement${b.setups.length === 1 ? '' : 's'}</small></div>
      <div class="item-actions">${b.builtin ? '' : `<a class="link-btn" href="#/create/board/${encodeURIComponent(b.id)}">Edit</a>`}
        <button type="button" class="link-btn" data-a="dup">Copy</button>${b.builtin ? '' : '<button type="button" class="link-btn danger" data-a="del">Delete</button>'}</div>`;
    el.querySelector('.item-pic').append(thumbBoard(b, b.setups[0], pieceById, 130));
    el.querySelector('[data-a=dup]').addEventListener('click', () => {
      const { builtin, ...rest } = structuredClone(b);
      const copy = { ...rest, id: uid('b'), name: `${b.name} copy`.slice(0, 40), setups: rest.setups.map((s) => ({ ...s, id: uid('s') })) };
      if (!saveBoard(copy)) { toast('Could not save. Browser storage may be full.'); return; }
      location.hash = `#/create/board/${copy.id}`;
    });
    el.querySelector('[data-a=del]')?.addEventListener('click', () => {
      modal({
        title: `Delete “${b.name}”?`, text: 'This can’t be undone. Export first if you want a backup.',
        actions: [{ label: 'Keep it' }, { label: 'Delete', kind: 'danger', run: () => { deleteBoard(b.id); overview(view); } }],
      });
    });
    return el;
  };

  const empty = (t) => { const p = document.createElement('p'); p.className = 'empty-note'; p.textContent = t; return p; };
  if (pieces.length) pieces.forEach((p) => $('#c-pieces').append(pieceCard(p))); else $('#c-pieces').append(empty('No custom pieces yet. Draw one and give it its own moves.'));
  if (boards.length) boards.forEach((b) => $('#c-boards').append(boardCard(b))); else $('#c-boards').append(empty('No custom boards yet. Make any shape you like.'));
  BUILTIN_PIECES.forEach((p) => $('#c-std').append(pieceCard(p)));
  $('#c-stdb').append(boardCard(CLASSIC_BOARD));

  $('#exp').addEventListener('click', () => {
    const out = exportLibrary();
    if (!out.pieces && !out.boards) { toast('Nothing to export yet. Create a piece or a board first.'); return; }
    download(out.filename, out.text);
    toast(`Exported ${out.pieces} piece${out.pieces === 1 ? '' : 's'} and ${out.boards} board${out.boards === 1 ? '' : 's'} to ${out.filename}`, 6000);
  });
  $('#imp').addEventListener('click', () => importDialog(() => overview(view)));
}

function importDialog(done) {
  const box = document.createElement('div');
  box.innerHTML = `<label class="drop" tabindex="0"><input type="file" accept=".txt,.json,text/plain,application/json" hidden>
    <strong>Drop your Boardly .txt file here</strong><span>or click to choose a file</span></label><div class="imp-result" aria-live="polite"></div>`;
  let pending = null;
  const m = modal({
    title: 'Import', content: box, wide: true,
    actions: [
      { label: 'Cancel' },
      { label: 'Add to my library', kind: 'primary', keepOpen: true, run: (close) => {
        if (!pending) return;
        if (!pending.apply()) { toast('Could not save. Browser storage may be full.'); return; }
        toast(`Imported ${pending.pieces} piece${pending.pieces === 1 ? '' : 's'} and ${pending.boards} board${pending.boards === 1 ? '' : 's'}.`);
        close(); done();
      } },
    ],
  });
  m.buttons[1].disabled = true;
  const drop = box.querySelector('.drop');
  const input = box.querySelector('input');
  const result = box.querySelector('.imp-result');

  async function handle(file) {
    pending = null; m.buttons[1].disabled = true;
    result.className = 'imp-result';
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) { result.textContent = 'That file is too big.'; result.classList.add('bad'); return; }
    try {
      const p = parseImport(await file.text());
      pending = p;
      const parts = [];
      if (p.pieces) parts.push(`${p.pieces} new piece${p.pieces === 1 ? '' : 's'}`);
      if (p.boards) parts.push(`${p.boards} new board${p.boards === 1 ? '' : 's'}`);
      let t = parts.length ? `Found ${parts.join(' and ')} in “${file.name}”.` : `Nothing new in “${file.name}”.`;
      if (p.same) t += ` ${p.same} item${p.same === 1 ? ' is' : 's are'} already in your library and will be skipped.`;
      const sk = p.skipped.pieces + p.skipped.boards;
      if (sk) t += ` ${sk} item${sk === 1 ? ' was' : 's were'} damaged and will be ignored.`;
      result.textContent = t;
      result.classList.add('ok');
      m.buttons[1].disabled = !(p.pieces || p.boards);
    } catch (err) {
      result.textContent = err.message;
      result.classList.add('bad');
    }
  }
  input.addEventListener('change', () => handle(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handle(e.dataTransfer.files[0]));
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
}
