// A tiny pixel/paint editor. The canvas is only 64×64 so saved pieces stay small.
export const PX = 64;
const SHAPES = ['line', 'rect', 'ellipse'];
const PALETTE = ['#000000', '#ffffff', '#6b6b73', '#c9c9d1', '#e03131', '#f76707', '#fab005', '#40c057', '#12b886', '#228be6', '#5c14ee', '#be4bdb', '#f06595', '#8b5a2b', '#ffd8a8', '#3b2f2f'];

export class PixelEditor {
  constructor({ onChange } = {}) {
    this.onChange = onChange || (() => {});
    this.tool = 'pen';
    this.size = 4;
    this.fillShapes = false;
    this.mirror = false;
    this.color = '#5c14ee';
    this.undoStack = [];
    this.redoStack = [];
    this.token = 0;
    this.el = document.createElement('div');
    this.el.className = 'px';
    this.el.innerHTML = `
      <div class="px-stage"><canvas width="${PX}" height="${PX}" class="px-canvas" aria-label="Drawing area"></canvas></div>
      <div class="px-tools" role="radiogroup" aria-label="Tool">
        <button type="button" class="tool on" data-tool="pen" role="radio" aria-checked="true">Pen</button>
        <button type="button" class="tool" data-tool="line" role="radio" aria-checked="false">Line</button>
        <button type="button" class="tool" data-tool="rect" role="radio" aria-checked="false">Rectangle</button>
        <button type="button" class="tool" data-tool="ellipse" role="radio" aria-checked="false">Circle</button>
        <button type="button" class="tool" data-tool="fill" role="radio" aria-checked="false">Fill</button>
        <button type="button" class="tool" data-tool="eraser" role="radio" aria-checked="false">Eraser</button>
        <button type="button" class="tool" data-tool="pick" role="radio" aria-checked="false">Pick color</button>
      </div>
      <label class="px-row"><span>Brush size</span><input type="range" min="1" max="16" value="${this.size}" class="px-size"><output>${this.size}</output></label>
      <div class="px-opts">
        <label class="chk"><input type="checkbox" class="px-fill"> Fill shapes</label>
        <label class="chk"><input type="checkbox" class="px-mirror"> Mirror left ↔ right while drawing</label>
      </div>
      <div class="px-colors">
        <input type="color" class="px-color" value="${this.color}" aria-label="Color">
        ${PALETTE.map((c) => `<button type="button" class="sw-c" style="background:${c}" data-c="${c}" aria-label="${c}"></button>`).join('')}
      </div>
      <div class="px-actions">
        <button type="button" class="btn ghost sm" data-a="undo">↶ Undo</button>
        <button type="button" class="btn ghost sm" data-a="redo">Redo ↷</button>
        <button type="button" class="btn ghost sm" data-a="flip">Flip ↔</button>
        <button type="button" class="btn ghost sm" data-a="flipv">Flip ↕</button>
        <button type="button" class="btn ghost sm" data-a="bg">Remove background</button>
        <button type="button" class="btn ghost sm" data-a="clear">Clear</button>
        <label class="btn primary sm upload">⬆ Upload an image<input type="file" accept="image/*" hidden></label>
      </div>
    `;
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.bind();
  }

  bind() {
    const $ = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => {
      this.tool = b.dataset.tool;
      this.el.querySelectorAll('.tool').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    }));
    $('.px-size').addEventListener('input', (e) => { this.size = +e.target.value; $('.px-row output').textContent = this.size; });
    $('.px-color').addEventListener('input', (e) => { this.color = e.target.value; });
    $('.px-fill').addEventListener('change', (e) => { this.fillShapes = e.target.checked; });
    $('.px-mirror').addEventListener('change', (e) => { this.mirror = e.target.checked; });
    this.el.querySelectorAll('.sw-c').forEach((b) => b.addEventListener('click', () => { this.setColor(b.dataset.c); }));
    this.el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => this.action(b.dataset.a)));
    $('input[type=file]').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) this.uploadFile(f); });

    let last = null;
    let shape = null;
    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * PX, ((e.clientY - r.top) / r.height) * PX];
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [x, y] = pos(e);
      if (this.tool === 'pick') { this.pickColor(x, y); return; }
      this.snapshot();
      if (this.tool === 'fill') { this.fill(Math.floor(x), Math.floor(y)); this.changed(); return; }
      this.canvas.setPointerCapture(e.pointerId);
      if (SHAPES.includes(this.tool)) { shape = { start: [x, y], base: this.ctx.getImageData(0, 0, PX, PX) }; return; }
      last = [x, y];
      this.stamp(x, y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (shape) {
        const [sx, sy] = pos(e);
        this.ctx.putImageData(shape.base, 0, 0);
        this.drawShape(shape.start, [sx, sy]);
        return;
      }
      if (!last) return;
      const [x, y] = pos(e);
      const dist = Math.hypot(x - last[0], y - last[1]);
      const steps = Math.max(1, Math.ceil(dist * 2));
      for (let i = 1; i <= steps; i++) this.stamp(last[0] + ((x - last[0]) * i) / steps, last[1] + ((y - last[1]) * i) / steps);
      last = [x, y];
    });
    const end = () => { if (shape) { shape = null; this.changed(); return; } if (last) { last = null; this.changed(); } };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  setColor(c) { this.color = c; this.el.querySelector('.px-color').value = c; }

  stamp(x, y) {
    const ctx = this.ctx;
    ctx.save();
    if (this.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = this.color;
    for (const px of this.mirror ? [x, PX - x] : [x]) {
      ctx.beginPath();
      ctx.arc(px, y, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawShape(a, b) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = this.size;
    ctx.strokeStyle = ctx.fillStyle = this.color;
    const one = (p, q) => {
      ctx.beginPath();
      if (this.tool === 'line') { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); return; }
      const x = Math.min(p[0], q[0]), y = Math.min(p[1], q[1]), w = Math.abs(q[0] - p[0]), h = Math.abs(q[1] - p[1]);
      if (this.tool === 'rect') { ctx.rect(x, y, w, h); }
      else { ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 0.5), Math.max(h / 2, 0.5), 0, 0, Math.PI * 2); }
      if (this.fillShapes) ctx.fill(); else ctx.stroke();
    };
    one(a, b);
    if (this.mirror) one([PX - a[0], a[1]], [PX - b[0], b[1]]);
    ctx.restore();
  }

  pickColor(x, y) {
    const d = this.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    if (d[3] < 10) return;
    this.setColor('#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
  }

  fill(sx, sy) {
    if (sx < 0 || sy < 0 || sx >= PX || sy >= PX) return;
    const img = this.ctx.getImageData(0, 0, PX, PX);
    const d = img.data;
    const idx = (x, y) => (y * PX + x) * 4;
    const t = d.slice(idx(sx, sy), idx(sx, sy) + 4);
    const hex = this.color.slice(1);
    const fc = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
    const near = (i) => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) + Math.abs(d[i + 3] - t[3]) < 60;
    if (fc.every((v, k) => Math.abs(v - t[k]) < 2)) return;
    const stack = [[sx, sy]];
    const seen = new Uint8Array(PX * PX);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= PX || y >= PX || seen[y * PX + x]) continue;
      const i = idx(x, y);
      if (!near(i)) continue;
      seen[y * PX + x] = 1;
      d[i] = fc[0]; d[i + 1] = fc[1]; d[i + 2] = fc[2]; d[i + 3] = 255;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    this.ctx.putImageData(img, 0, 0);
  }

  snapshot() {
    this.undoStack.push(this.ctx.getImageData(0, 0, PX, PX));
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }
  changed() { this.onChange(); }

  action(a) {
    if (a === 'undo' && this.undoStack.length) {
      this.redoStack.push(this.ctx.getImageData(0, 0, PX, PX));
      this.ctx.putImageData(this.undoStack.pop(), 0, 0);
      this.changed();
    } else if (a === 'redo' && this.redoStack.length) {
      this.undoStack.push(this.ctx.getImageData(0, 0, PX, PX));
      this.ctx.putImageData(this.redoStack.pop(), 0, 0);
      this.changed();
    } else if (a === 'clear') {
      this.snapshot(); this.ctx.clearRect(0, 0, PX, PX); this.changed();
    } else if (a === 'flip') {
      this.snapshot();
      const copy = document.createElement('canvas');
      copy.width = copy.height = PX;
      copy.getContext('2d').drawImage(this.canvas, 0, 0);
      this.ctx.clearRect(0, 0, PX, PX);
      this.ctx.save(); this.ctx.translate(PX, 0); this.ctx.scale(-1, 1); this.ctx.drawImage(copy, 0, 0); this.ctx.restore();
      this.changed();
    } else if (a === 'flipv') {
      this.snapshot();
      const copy = document.createElement('canvas');
      copy.width = copy.height = PX;
      copy.getContext('2d').drawImage(this.canvas, 0, 0);
      this.ctx.clearRect(0, 0, PX, PX);
      this.ctx.save(); this.ctx.translate(0, PX); this.ctx.scale(1, -1); this.ctx.drawImage(copy, 0, 0); this.ctx.restore();
      this.changed();
    } else if (a === 'bg') {
      this.snapshot(); this.removeBackground(); this.changed();
    }
  }

  // Make the plain background (the color touching the edges) transparent.
  removeBackground(tol = 70) {
    const img = this.ctx.getImageData(0, 0, PX, PX);
    const d = img.data;
    const at = (x, y) => (y * PX + x) * 4;
    const corners = [[0, 0], [PX - 1, 0], [0, PX - 1], [PX - 1, PX - 1]].map(([x, y]) => d.slice(at(x, y), at(x, y) + 4));
    const ref = corners.find((c) => c[3] > 200) || null;
    if (!ref) return;
    const near = (i) => d[i + 3] > 0 && Math.abs(d[i] - ref[0]) + Math.abs(d[i + 1] - ref[1]) + Math.abs(d[i + 2] - ref[2]) < tol;
    const seen = new Uint8Array(PX * PX);
    const stack = [];
    for (let k = 0; k < PX; k++) stack.push([k, 0], [k, PX - 1], [0, k], [PX - 1, k]);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= PX || y >= PX || seen[y * PX + x]) continue;
      const i = at(x, y);
      if (!near(i)) continue;
      seen[y * PX + x] = 1;
      d[i + 3] = 0;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    this.ctx.putImageData(img, 0, 0);
  }

  drawFit(img) {
    this.ctx.clearRect(0, 0, PX, PX);
    const s = Math.min(PX / img.width, PX / img.height);
    const w = img.width * s, h = img.height * s;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(img, (PX - w) / 2, (PX - h) / 2, w, h);
  }

  uploadFile(file) {
    if (file.size > 10 * 1024 * 1024) { this.onError?.('That image is too big (max 10 MB).'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.snapshot();
      this.drawFit(img);
      URL.revokeObjectURL(url);
      this.changed();
    };
    img.onerror = () => { URL.revokeObjectURL(url); this.onError?.('Could not read that image.'); };
    img.src = url;
  }

  // Load an image (data URL or file path) without marking it as edited.
  load(src) {
    const token = ++this.token;
    this.undoStack = []; this.redoStack = [];
    return new Promise((resolve) => {
      if (!src) { this.ctx.clearRect(0, 0, PX, PX); resolve(); return; }
      const img = new Image();
      img.onload = () => { if (token === this.token) this.drawFit(img); resolve(); };
      img.onerror = () => resolve();
      img.src = src;
    });
  }

  isEmpty() {
    const d = this.ctx.getImageData(0, 0, PX, PX).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 12) return false;
    return true;
  }
  toDataURL() { return this.canvas.toDataURL('image/png'); }
}

// Copy of an image with its colors inverted (transparency stays). Used to auto-make the black version.
export function invertDataURL(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = PX;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, PX, PX);
      const data = x.getImageData(0, 0, PX, PX);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
      x.putImageData(data, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
