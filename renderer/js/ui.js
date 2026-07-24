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
      // Filter style down to the font props our size/family picker writes.
      let keptStyle = '';
      if (child.hasAttribute('style')) {
        const size = /font-size:\s*(\d{1,2}px)/.exec(child.getAttribute('style'));
        const fam = /font-family:\s*([^;"]+)/.exec(child.getAttribute('style'));
        const align = /text-align:\s*(left|center|right)/.exec(child.getAttribute('style'));
        if (size) keptStyle += `font-size:${size[1]};`;
        if (fam) keptStyle += `font-family:${fam[1]};`;
        if (align && /^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE)$/.test(child.tagName)) keptStyle += `text-align:${align[1]};`;
      }
      for (const attr of Array.from(child.attributes)) {
        const keep =
          (attr.name === 'href' && child.tagName === 'A' && /^https?:/i.test(child.getAttribute('href'))) ||
          (attr.name === 'class' && ['checklist'].includes(attr.value)) ||
          (attr.name === 'dir' && ['rtl', 'ltr', 'auto'].includes(attr.value)) ||
          (attr.name === 'data-checked');
        if (!keep) child.removeAttribute(attr.name);
      }
      if (keptStyle) child.setAttribute('style', keptStyle);
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

/* ---------- text direction & typography (Persian/RTL support) ---------- */

/** 'rtl' | 'ltr' | null from the first strong-direction character. */
function detectDir(text) {
  const m = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]|[֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.exec(text || '');
  if (!m) return null;
  return /[֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(m[0]) ? 'rtl' : 'ltr';
}

/**
 * Attach a compact align + direction bar above a textarea or contenteditable
 * detail box. Alignment maps to text-align; RTL/LTR set the dir attribute.
 * Also auto-detects direction from the first typed characters when unset.
 */
function attachTextTools(target) {
  if (!target || target.dataset.textTools) return;
  target.dataset.textTools = '1';
  const isField = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
  const bar = el(`<div class="texttools">
    <button type="button" data-al="left" title="Align left">${icon('alignL')}</button>
    <button type="button" data-al="center" title="Align center">${icon('alignC')}</button>
    <button type="button" data-al="right" title="Align right">${icon('alignR')}</button>
    <span class="tt-sep"></span>
    <button type="button" data-dir="rtl" title="Right-to-left (فارسی)">RTL</button>
    <button type="button" data-dir="ltr" title="Left-to-right">LTR</button>
  </div>`);
  target.parentNode.insertBefore(bar, target);
  const paint = () => {
    const dir = target.getAttribute('dir');
    const al = target.style.textAlign || '';
    bar.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('on', b.dataset.dir === dir));
    bar.querySelectorAll('[data-al]').forEach(b => b.classList.toggle('on', b.dataset.al === al));
  };
  bar.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus/selection
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dir) {
      target.setAttribute('dir', target.getAttribute('dir') === b.dataset.dir ? 'auto' : b.dataset.dir);
      target.dataset.dirManual = '1';
    } else if (b.dataset.al) {
      if (isField) {
        target.style.textAlign = target.style.textAlign === b.dataset.al ? '' : b.dataset.al;
      } else {
        target.focus();
        document.execCommand(b.dataset.al === 'left' ? 'justifyLeft' : b.dataset.al === 'center' ? 'justifyCenter' : 'justifyRight', false, null);
      }
    }
    paint();
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // First-keystroke auto direction when nothing set explicitly.
  if (!target.getAttribute('dir')) target.setAttribute('dir', 'auto');
  target.addEventListener('input', () => {
    if (target.dataset.dirManual) return;
    const text = isField ? target.value : target.textContent;
    const d = detectDir((text || '').slice(0, 80));
    if (d) target.setAttribute('dir', d);
    paint();
  });
  paint();
  return bar;
}

/** Every plain input/textarea in the app gets browser-native auto direction. */
(function autoDirEverywhere() {
  const apply = (root) => {
    root.querySelectorAll('input[type="text"], input:not([type]), textarea, .ne-title, .pal-input')
      .forEach(i => { if (!i.hasAttribute('dir')) i.setAttribute('dir', 'auto'); });
  };
  const mo = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1) apply(n.querySelectorAll ? n : document);
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply(document);
    mo.observe(document.body, { childList: true, subtree: true });
  });
})();

/* Font size + family picker for rich editors. Sizes carry suggested uses;
   families stay deliberately tiny, with an even shorter Persian set. */
const FONT_SIZES = [
  { px: 13, label: 'Small — captions' },
  { px: 16, label: 'Body — everyday text' },
  { px: 19, label: 'Subheading' },
  { px: 24, label: 'Heading' },
  { px: 32, label: 'Display' }
];
const FONT_FAMILIES = {
  Simple: [
    { name: 'Default', css: '' },
    { name: 'Serif', css: 'Georgia, serif' },
    { name: 'Mono', css: 'Consolas, monospace' }
  ],
  Fancy: [
    { name: 'Handwritten', css: '"Segoe Script", cursive' },
    { name: 'Rounded', css: '"Comic Sans MS", "Segoe UI", cursive' }
  ],
  'Persian · فارسی': [
    { name: 'Default (Vazir-style)', css: '' },
    { name: 'Tahoma', css: 'Tahoma, "Segoe UI", sans-serif' }
  ]
};

/** Normalize the <font> tags execCommand produces into sanitizer-safe spans. */
function normalizeFontTags(rootEl, px, family) {
  rootEl.querySelectorAll('font').forEach(f => {
    let style = '';
    if (f.getAttribute('size') === '7' && px) style += `font-size:${px}px;`;
    if (f.getAttribute('face') && family) style += `font-family:${family};`;
    if (style) {
      const span = document.createElement('span');
      span.setAttribute('style', style);
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    } else {
      // unwrap: keep children, drop the font tag
      while (f.firstChild) f.parentNode.insertBefore(f.firstChild, f);
      f.remove();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Event reminders — the user picks how far ahead to be notified.      */
/* ------------------------------------------------------------------ */
const EVENT_REMIND_OFFSETS = [
  { min: 0, label: 'At event time', short: 'now' },
  { min: 10, label: '10 minutes before', short: '10 minutes' },
  { min: 30, label: '30 minutes before', short: '30 minutes' },
  { min: 60, label: '1 hour before', short: '1 hour' },
  { min: 180, label: '3 hours before', short: '3 hours' },
  { min: 1440, label: '1 day before', short: '1 day' }
];

/** The (not yet completed) reminder linked to this event, if any. */
function eventLinkedReminder(ev) {
  for (const l of (ev.links || [])) {
    if (l.type !== 'reminder') continue;
    const r = DB.get('reminders', l.id);
    if (r && !r.done) return r;
  }
  return null;
}

/** Which offset the linked reminder currently sits at, or null. */
function eventReminderCurrentMin(ev) {
  const r = eventLinkedReminder(ev);
  if (!r || !r.at || !ev.date) return null;
  const base = new Date(`${ev.date}T${ev.time || '09:00'}`);
  const min = Math.round((base.getTime() - Date.parse(r.at)) / 60000);
  return EVENT_REMIND_OFFSETS.some(o => o.min === min) ? min : null;
}

function eventReminderOptionsHtml(selectedMin) {
  return `<option value="">No reminder</option>` + EVENT_REMIND_OFFSETS.map(o =>
    `<option value="${o.min}"${selectedMin === o.min ? ' selected' : ''}>${o.label}</option>`).join('');
}

/**
 * Create, retime or remove the reminder linked to an event.
 * value: '' removes it, otherwise minutes-before as a string/number.
 * Call after the event itself has been upserted.
 */
function applyEventReminder(ev, value) {
  const existing = eventLinkedReminder(ev);
  if (value === '' || value === null || value === undefined) {
    if (existing) {
      DB.unlink({ type: 'event', id: ev.id }, { type: 'reminder', id: existing.id });
      DB.remove('reminders', existing.id);
    }
    return;
  }
  const min = Number(value);
  const base = new Date(`${ev.date}T${ev.time || '09:00'}`);
  const at = new Date(base.getTime() - min * 60000);
  const o = EVENT_REMIND_OFFSETS.find(x => x.min === min);
  const bodyTxt = min === 0
    ? `Starting now${ev.time ? ' · ' + Fmt.time12(ev.time) : ''}`
    : `Starts in ${o ? o.short : min + ' min'}${ev.time ? ' · ' + Fmt.time12(ev.time) : ''}`;
  if (existing) {
    existing.title = ev.title;
    existing.body = bodyTxt;
    existing.at = at.toISOString();
    existing.done = false;
    existing.notified = false;
    DB.upsert('reminders', existing);
  } else {
    const rem = DB.newReminder({ title: ev.title, body: bodyTxt, at: at.toISOString() });
    DB.upsert('reminders', rem);
    DB.link({ type: 'event', id: ev.id }, { type: 'reminder', id: rem.id });
  }
}

/* ------------------------------------------------------------------ */
/* Editor undo/redo                                                    */
/* ------------------------------------------------------------------ */
/* The browser's native undo stack breaks whenever we touch the DOM
   directly (checklists, highlights, font normalization), so rich
   editors use this snapshot history instead. Edits made within 400ms
   collapse into one step; each snapshot remembers the caret. */

function selCharOffsets(root) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !root.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  const pre = r.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  return { start, end: start + r.toString().length };
}

function restoreSelFromOffsets(root, off) {
  root.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false); // fallback: caret at end
  if (off) {
    let idx = 0, found = false, endFound = false;
    const stack = [root];
    let node;
    while (!endFound && (node = stack.pop())) {
      if (node.nodeType === 3) {
        const next = idx + node.length;
        if (!found && off.start >= idx && off.start <= next) {
          range.setStart(node, off.start - idx); found = true;
        }
        if (found && off.end >= idx && off.end <= next) {
          range.setEnd(node, off.end - idx); endFound = true;
        }
        idx = next;
      } else {
        let i = node.childNodes.length;
        while (i--) stack.push(node.childNodes[i]);
      }
    }
    if (found && !endFound) range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * attachEditorHistory(bodyEl, { onApply, onChange })
 *  - onApply(): called after undo/redo rewrites the content (save it, refresh UI)
 *  - onChange(h): called whenever canUndo/canRedo may have flipped (paint buttons)
 * Call h.reset() when a different document is loaded into the editor and
 * h.snapshot() right after any programmatic DOM change (no input event).
 */
function attachEditorHistory(bodyEl, opts = {}) {
  const LIMIT = 200, GROUP_MS = 400;
  let undoStack = [], redoStack = [];
  let last = { html: bodyEl.innerHTML, sel: null };
  let timer = null, applying = false;

  const changed = () => { opts.onChange && opts.onChange(api); };

  function commit() {
    clearTimeout(timer); timer = null;
    if (bodyEl.innerHTML === last.html) return;
    undoStack.push(last);
    if (undoStack.length > LIMIT) undoStack.shift();
    last = { html: bodyEl.innerHTML, sel: selCharOffsets(bodyEl) };
    redoStack = [];
    changed();
  }

  bodyEl.addEventListener('input', () => {
    if (applying) return;
    if (redoStack.length) redoStack = [];
    clearTimeout(timer);
    timer = setTimeout(commit, GROUP_MS);
    changed();
  });

  function apply(snap) {
    applying = true;
    bodyEl.innerHTML = snap.html;
    restoreSelFromOffsets(bodyEl, snap.sel);
    applying = false;
    opts.onApply && opts.onApply();
    changed();
  }

  const api = {
    reset() {
      clearTimeout(timer); timer = null;
      undoStack = []; redoStack = [];
      last = { html: bodyEl.innerHTML, sel: null };
      changed();
    },
    snapshot() { if (timer || bodyEl.innerHTML !== last.html) commit(); },
    canUndo() { return undoStack.length > 0 || !!timer || bodyEl.innerHTML !== last.html; },
    canRedo() { return redoStack.length > 0; },
    undo() {
      api.snapshot();
      if (!undoStack.length) return;
      redoStack.push(last);
      last = undoStack.pop();
      apply(last);
    },
    redo() {
      api.snapshot(); // pending edits invalidate redo — flush first
      if (!redoStack.length) return;
      undoStack.push(last);
      if (undoStack.length > LIMIT) undoStack.shift();
      last = redoStack.pop();
      apply(last);
    }
  };

  // Our stack replaces the native one — intercept every undo/redo gesture.
  bodyEl.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); api.undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); api.redo(); }
  });
  bodyEl.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'historyUndo') { e.preventDefault(); api.undo(); }
    else if (e.inputType === 'historyRedo') { e.preventDefault(); api.redo(); }
  });

  changed();
  return api;
}

function openFontTools(anchor, bodyEl, onApplied) {
  const wrap = el(`<div class="fontpop">
    <div class="fp-head">Size</div>
    ${FONT_SIZES.map(s => `<button class="menu-item" data-px="${s.px}"><span style="width:30px;font-weight:700">${s.px}</span><span class="muted" style="font-size:12px">${s.label}</span></button>`).join('')}
    ${Object.entries(FONT_FAMILIES).map(([group, fonts]) => `
      <div class="fp-head">${group}</div>
      ${fonts.map(f => `<button class="menu-item" data-fam="${esc(f.css)}"><span style="font-family:${esc(f.css) || 'inherit'}">${f.name}</span></button>`).join('')}`).join('')}
  </div>`);
  const pop = openPopover(anchor, wrap);
  wrap.addEventListener('mousedown', e => e.preventDefault());
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('.menu-item');
    if (!b) return;
    bodyEl.focus();
    if (b.dataset.px) {
      document.execCommand('fontSize', false, '7');
      normalizeFontTags(bodyEl, Number(b.dataset.px), undefined);
    } else {
      const fam = b.dataset.fam;
      if (fam) {
        document.execCommand('fontName', false, fam.split(',')[0].replace(/"/g, ''));
        normalizeFontTags(bodyEl, null, fam);
      } else {
        document.execCommand('removeFormat', false, null);
      }
    }
    pop.close();
    onApplied && onApplied();
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
