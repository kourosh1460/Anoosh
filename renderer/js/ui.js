'use strict';
/* UI helpers: formatting, modals, popovers, toasts, pickers, link chips. */

/* ---------- formatting ---------- */
const Fmt = (() => {
  const DAY = 86400000;

  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function dateToStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function strToDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(str, n) {
    const d = strToDate(str); d.setDate(d.getDate() + n); return dateToStr(d);
  }
  function niceDate(str, opts = {}) {
    if (!str) return '';
    const d = strToDate(str);
    const t = todayStr();
    if (str === t) return 'Today';
    if (str === addDays(t, 1)) return 'Tomorrow';
    if (str === addDays(t, -1)) return 'Yesterday';
    return d.toLocaleDateString(undefined, Object.assign({ month: 'short', day: 'numeric' },
      d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}, opts));
  }
  function fullDate(str) {
    return strToDate(str).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  function time12(hm) {
    if (!hm) return '';
    const [h, m] = hm.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function dateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${niceDate(dateToStr(d))}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  function relTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < DAY) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
    return niceDate(dateToStr(d));
  }
  function untilText(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (isNaN(ms)) return '';
    if (ms <= 0) {
      const a = -ms;
      if (a < 3600000) return `${Math.max(1, Math.floor(a / 60000))}m overdue`;
      if (a < DAY) return `${Math.floor(a / 3600000)}h overdue`;
      return `${Math.floor(a / DAY)}d overdue`;
    }
    if (ms < 3600000) return `in ${Math.max(1, Math.round(ms / 60000))}m`;
    if (ms < DAY) return `in ${Math.round(ms / 3600000)}h`;
    return `in ${Math.round(ms / DAY)}d`;
  }
  function duration(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    return `${h}h ${mins % 60 ? (mins % 60) + 'm' : ''}`.trim();
  }
  function hijriToday() {
    const t = new Date();
    return Hijri.fromGregorian(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  return { pad, todayStr, dateToStr, strToDate, addDays, niceDate, fullDate, time12, dateTime, relTime, untilText, duration, hijriToday };
})();

/* ---------- dom ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function debounce(fn, ms) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/* Sanitize pasted/loaded note HTML down to a safe, known subset. */
function sanitizeHtml(html) {
  const ALLOWED = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H1', 'H2', 'H3',
    'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'MARK', 'A', 'SPAN', 'IMG']);
  const SAFE_IMG = /^(data:image\/(png|jpeg|jpg|gif|webp);base64,|https:\/\/)/i;
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const walk = (node) => {
    for (const child of Array.from(node.children)) {
      walk(child);
      if (!ALLOWED.has(child.tagName)) {
        // unwrap unknown elements, keep their content
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        child.remove();
        continue;
      }
      if (child.tagName === 'IMG') {
        if (!SAFE_IMG.test(child.getAttribute('src') || '')) { child.remove(); continue; }
        for (const attr of Array.from(child.attributes)) {
          if (attr.name !== 'src' && attr.name !== 'alt') child.removeAttribute(attr.name);
        }
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const keep =
          (attr.name === 'href' && child.tagName === 'A' && /^https?:/i.test(child.getAttribute('href'))) ||
          (attr.name === 'class' && ['checklist'].includes(attr.value)) ||
          (attr.name === 'data-checked');
        if (!keep) child.removeAttribute(attr.name);
      }
      if (child.tagName === 'A') child.setAttribute('target', '_blank');
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/**
 * Convert an image file/blob to a data URL, downscaled to keep the offline
 * store light. PNG stays PNG (alpha), everything else becomes JPEG.
 */
function imageToDataUrl(file, maxDim = 1400) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale === 1 && file.size < 400 * 1024) {
          // Small enough: keep original bytes.
          const reader = new FileReader();
          reader.onload = () => { URL.revokeObjectURL(url); resolve(reader.result); };
          reader.onerror = reject;
          reader.readAsDataURL(file);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const isPng = file.type === 'image/png';
        resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85));
        URL.revokeObjectURL(url);
      } catch (err) { URL.revokeObjectURL(url); reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not a readable image')); };
    img.src = url;
  });
}

/* ---------- toast ---------- */
function toast(msg, opts = {}) {
  const root = document.getElementById('toast-root');
  const t = el(`<div class="toast">${icon(opts.icon || 'checkCircle')}<span>${esc(msg)}</span></div>`);
  if (opts.action) {
    const btn = el(`<button class="toast-action">${esc(opts.action)}</button>`);
    btn.addEventListener('click', () => { opts.onAction && opts.onAction(); dismiss(); });
    t.appendChild(btn);
  }
  root.appendChild(t);
  let gone = false;
  function dismiss() {
    if (gone) return; gone = true;
    t.classList.add('out');
    setTimeout(() => t.remove(), 260);
  }
  setTimeout(dismiss, opts.duration || 2600);
  return dismiss;
}

/* ---------- modal ---------- */
function openModal({ title, body, foot, wide, onClose, className }) {
  const root = document.getElementById('modal-root');
  const scrim = el(`<div class="modal-scrim"></div>`);
  const modal = el(`<div class="modal ${wide ? 'wide' : ''} ${className || ''}" role="dialog"></div>`);
  if (title != null) {
    const head = el(`<div class="modal-head"><div class="modal-title">${esc(title)}</div></div>`);
    const x = el(`<button class="iconbtn" title="Close">${icon('x')}</button>`);
    x.addEventListener('click', close);
    head.appendChild(x);
    modal.appendChild(head);
  }
  const bodyEl = el(`<div class="modal-body"></div>`);
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  modal.appendChild(bodyEl);
  if (foot) {
    const footEl = el(`<div class="modal-foot"></div>`);
    if (typeof foot === 'string') footEl.innerHTML = foot;
    else footEl.appendChild(foot);
    modal.appendChild(footEl);
  }
  scrim.appendChild(modal);
  root.appendChild(scrim);

  function close() {
    scrim.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose && onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  }
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', onKey, true);
  return { close, modal, body: bodyEl };
}

function confirmDialog(message, { danger = true, okText = 'Delete' } = {}) {
  return new Promise((resolve) => {
    const foot = el(`<div></div>`);
    const cancel = el(`<button class="btn ghost">Cancel</button>`);
    const ok = el(`<button class="btn ${danger ? 'danger' : 'primary'}">${esc(okText)}</button>`);
    foot.append(cancel, ok);
    const m = openModal({
      title: danger ? 'Are you sure?' : 'Confirm',
      body: `<div style="font-size:13.5px;color:var(--text-dim);line-height:1.5">${esc(message)}</div>`,
      foot,
      onClose: () => resolve(false)
    });
    cancel.addEventListener('click', () => { m.close(); });
    ok.addEventListener('click', () => { resolve(true); m.onClose = null; m.close(); });
  });
}

/* ---------- popover (anchored menu) ---------- */
function openPopover(anchor, contentEl, { align = 'end' } = {}) {
  const root = document.getElementById('popover-root');
  root.innerHTML = '';
  const pop = el(`<div class="popover"></div>`);
  pop.appendChild(contentEl);
  root.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  let x = align === 'end' ? r.right - pr.width : r.left;
  let y = r.bottom + 6;
  x = Math.max(8, Math.min(x, window.innerWidth - pr.width - 8));
  if (y + pr.height > window.innerHeight - 8) y = r.top - pr.height - 6;
  pop.style.left = x + 'px';
  pop.style.top = Math.max(8, y) + 'px';

  function close() {
    pop.remove();
    document.removeEventListener('mousedown', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function onDoc(e) { if (!pop.contains(e.target)) close(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
  });
  return { close, pop };
}

function menu(anchor, items) {
  const wrap = el(`<div></div>`);
  const p = { close: null };
  for (const it of items) {
    if (it === '-') { wrap.appendChild(el(`<div class="menu-sep"></div>`)); continue; }
    const btn = el(`<button class="menu-item ${it.danger ? 'danger' : ''}">${icon(it.icon || 'dots')}<span>${esc(it.label)}</span></button>`);
    btn.addEventListener('click', () => { p.close(); it.onClick && it.onClick(); });
    wrap.appendChild(btn);
  }
  const pop = openPopover(anchor, wrap);
  p.close = pop.close;
  return pop;
}

/* ---------- color swatches ---------- */
const PALETTE = ['#7c5cff', '#3e8bff', '#00b8d4', '#14b880', '#84cc16', '#f5a524', '#ff7847', '#f43f7d', '#c084fc', '#8a8f9e'];

function swatchRow(current, onPick, { palette = PALETTE, allowCustom = true } = {}) {
  const row = el(`<div class="swatches"></div>`);
  const set = (c) => { onPick(c); refresh(c); };
  const refresh = (cur) => {
    row.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.c === cur));
  };
  for (const c of palette) {
    const s = el(`<div class="swatch" data-c="${c}" style="background:${c}" title="${c}"></div>`);
    s.addEventListener('click', () => set(c));
    row.appendChild(s);
  }
  if (allowCustom) {
    const custom = el(`<div class="swatch custom" title="Custom color">${icon('palette')}<input type="color" value="${current || '#7c5cff'}"></div>`);
    custom.querySelector('input').addEventListener('input', (e) => set(e.target.value));
    row.appendChild(custom);
  }
  refresh(current);
  return row;
}

/* ---------- link chips + picker ---------- */
const TYPE_META = {
  task: { icon: 'tasks', label: 'Task' },
  note: { icon: 'note', label: 'Note' },
  idea: { icon: 'bulb', label: 'Idea' },
  event: { icon: 'calendar', label: 'Event' },
  reminder: { icon: 'bell', label: 'Reminder' },
  folder: { icon: 'folder', label: 'Folder' }
};

function renderLinkChips(container, ownerRef, { removable = true, compact = false } = {}) {
  container.innerHTML = '';
  const owner = DB.getByRef(ownerRef);
  if (!owner || !Array.isArray(owner.links)) return;
  for (const ref of owner.links) {
    const target = DB.getByRef(ref);
    if (!target) continue;
    const meta = TYPE_META[ref.type] || TYPE_META.task;
    const chip = el(`<span class="chip link" title="${esc(meta.label)}: ${esc(target.title || 'Untitled')}">
      ${icon(meta.icon)}<span>${esc(target.title || 'Untitled')}</span>
    </span>`);
    chip.addEventListener('click', (e) => {
      if (e.target.closest('.chip-x')) return;
      App.goto(ref.type, ref.id);
    });
    if (removable && !compact) {
      const x = el(`<span class="chip-x" title="Unlink">${icon('x')}</span>`);
      x.addEventListener('click', (e) => { e.stopPropagation(); DB.unlink(ownerRef, ref); });
      chip.appendChild(x);
    }
    container.appendChild(chip);
  }
}

function openLinkPicker(ownerRef, onDone) {
  const body = el(`<div></div>`);
  const input = el(`<input class="input" placeholder="Search tasks, notes, ideas, events, reminders…" autofocus>`);
  const results = el(`<div class="pal-results" style="max-height:300px;margin-top:10px"></div>`);
  body.append(input, results);
  const m = openModal({ title: 'Link to…', body, onClose: () => onDone && onDone() });

  const owner = DB.getByRef(ownerRef);
  const linked = new Set((owner.links || []).map(l => l.id));

  function draw() {
    const q = input.value.trim();
    results.innerHTML = '';
    let items;
    if (q) {
      items = DB.search(q, 30);
    } else {
      items = [];
      for (const [type, coll] of Object.entries(DB.TYPE_TO_COLL)) {
        if (type === 'session') continue;
        const sorted = [...DB.all(coll)].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        for (const item of sorted.slice(0, 5)) items.push({ type, item, sub: '' });
      }
    }
    let count = 0;
    for (const r of items) {
      if (r.type === 'folder') continue; // folders organize notes, they aren't linkable
      if (r.item.id === ownerRef.id || linked.has(r.item.id)) continue;
      const meta = TYPE_META[r.type];
      if (!meta) continue;
      const btn = el(`<button class="pal-item">${icon(meta.icon)}
        <span class="pal-text">${esc(r.item.title || 'Untitled')}</span>
        <span class="pal-sub">${esc(meta.label)}</span></button>`);
      btn.addEventListener('click', () => {
        DB.link(ownerRef, { type: r.type, id: r.item.id });
        toast(`Linked to ${meta.label.toLowerCase()} “${(r.item.title || 'Untitled').slice(0, 34)}”`, { icon: 'link' });
        m.close();
      });
      results.appendChild(btn);
      if (++count >= 24) break;
    }
    if (!count) results.innerHTML = `<div class="empty"><div class="empty-sub">${q ? 'No unlinked items match.' : 'Nothing to link yet.'}</div></div>`;
  }
  input.addEventListener('input', draw);
  setTimeout(() => input.focus());
  draw();
}
