'use strict';
/**
 * DB — renderer-side data layer.
 * Optimistic in-memory cache over the main-process store, with a simple
 * subscription model. Cross-entity links are kept bidirectional here.
 */
const DB = (() => {
  const TYPE_TO_COLL = {
    task: 'tasks', note: 'notes', idea: 'ideas',
    event: 'events', reminder: 'reminders', session: 'sessions'
  };

  let data = null;
  const listeners = new Set();

  function emit(change) {
    for (const fn of listeners) {
      try { fn(change); } catch (err) { console.error('DB listener failed', err); }
    }
  }

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)));
  }

  function now() { return new Date().toISOString(); }

  async function init() {
    data = await window.aurora.getAll();

    window.aurora.onDbChanged(({ collection, item }) => {
      const coll = data[collection];
      if (!coll) return;
      const idx = coll.findIndex(x => x.id === item.id);
      if (idx >= 0) coll[idx] = item; else coll.push(item);
      emit({ kind: 'upsert', collection, item, remote: true });
    });

    window.aurora.onDbRemoved(({ collection, id }) => {
      const coll = data[collection];
      if (!coll) return;
      const idx = coll.findIndex(x => x.id === id);
      if (idx >= 0) coll.splice(idx, 1);
      scrubLinksLocal(id);
      emit({ kind: 'remove', collection, id, remote: true });
    });

    window.aurora.onDbReload((snapshot) => {
      data = snapshot;
      emit({ kind: 'reload' });
    });

    window.aurora.onSettingsChanged((s) => {
      data.settings = s;
      emit({ kind: 'settings', settings: settings() });
    });
  }

  function all(collection) { return data[collection] || []; }
  function get(collection, id) { return all(collection).find(x => x.id === id) || null; }
  function getByRef(ref) {
    if (!ref) return null;
    const coll = TYPE_TO_COLL[ref.type];
    return coll ? get(coll, ref.id) : null;
  }

  function upsert(collection, item) {
    item.updatedAt = now();
    if (!item.createdAt) item.createdAt = item.updatedAt;
    const coll = data[collection];
    const idx = coll.findIndex(x => x.id === item.id);
    if (idx >= 0) coll[idx] = item; else coll.push(item);
    window.aurora.upsert(collection, JSON.parse(JSON.stringify(item)));
    emit({ kind: 'upsert', collection, item });
    return item;
  }

  function scrubLinksLocal(id) {
    for (const name of ['tasks', 'notes', 'ideas', 'events', 'reminders']) {
      for (const it of data[name] || []) {
        if (Array.isArray(it.links)) it.links = it.links.filter(l => l.id !== id);
      }
    }
  }

  function remove(collection, id) {
    const coll = data[collection];
    const idx = coll.findIndex(x => x.id === id);
    if (idx >= 0) coll.splice(idx, 1);
    scrubLinksLocal(id);
    window.aurora.remove(collection, id);
    emit({ kind: 'remove', collection, id });
  }

  /* ----- factories ----- */

  function newTask(props = {}) {
    return Object.assign({
      id: uid(), title: '', notes: '', done: false, doneAt: null,
      dueDate: null, dueTime: null, priority: 0,
      tags: [], links: [], timeSpentMs: 0, createdAt: now(), updatedAt: now()
    }, props);
  }

  function newNote(props = {}) {
    const s = settings();
    return Object.assign({
      id: uid(), title: '', content: '',
      headerColor: s.noteDefaultColor || '#7c5cff',
      favorite: false, pinnedToScreen: false, folderId: null,
      tags: [], links: [], createdAt: now(), updatedAt: now()
    }, props);
  }

  function newFolder(props = {}) {
    return Object.assign({
      id: uid(), name: '', color: '#7c5cff', pinned: false,
      createdAt: now(), updatedAt: now()
    }, props);
  }

  /** Delete a folder; its notes move to "All notes" (unfiled). */
  function removeFolder(folderId) {
    for (const n of all('notes')) {
      if (n.folderId === folderId) { n.folderId = null; upsert('notes', n); }
    }
    remove('folders', folderId);
  }

  function newIdea(props = {}) {
    return Object.assign({
      id: uid(), title: '', content: '', status: 'spark',
      tags: [], links: [], createdAt: now(), updatedAt: now()
    }, props);
  }

  function newEvent(props = {}) {
    return Object.assign({
      id: uid(), title: '', date: null, time: null, endTime: null,
      color: '#3ec6ff', notes: '', links: [], createdAt: now(), updatedAt: now()
    }, props);
  }

  function newReminder(props = {}) {
    return Object.assign({
      id: uid(), title: '', body: '', at: null, repeat: 'none',
      done: false, notified: false, links: [], createdAt: now(), updatedAt: now()
    }, props);
  }

  /* ----- linking (bidirectional) ----- */

  function typeOf(collection) {
    return Object.keys(TYPE_TO_COLL).find(t => TYPE_TO_COLL[t] === collection);
  }

  function link(refA, refB) {
    if (!refA || !refB || (refA.id === refB.id)) return;
    const a = getByRef(refA), b = getByRef(refB);
    if (!a || !b) return;
    a.links = a.links || []; b.links = b.links || [];
    if (!a.links.some(l => l.id === refB.id)) a.links.push({ type: refB.type, id: refB.id });
    if (!b.links.some(l => l.id === refA.id)) b.links.push({ type: refA.type, id: refA.id });
    upsert(TYPE_TO_COLL[refA.type], a);
    upsert(TYPE_TO_COLL[refB.type], b);
  }

  function unlink(refA, refB) {
    const a = getByRef(refA), b = getByRef(refB);
    if (a) { a.links = (a.links || []).filter(l => l.id !== refB.id); upsert(TYPE_TO_COLL[refA.type], a); }
    if (b) { b.links = (b.links || []).filter(l => l.id !== refA.id); upsert(TYPE_TO_COLL[refB.type], b); }
  }

  /* ----- search ----- */

  function textOfHtml(html) {
    const div = document.createElement('div');
    // Insert spaces at tag boundaries so block elements don't glue words
    // together ("Oat milk</li><li>Dates" -> "Oat milk Dates").
    div.innerHTML = (html || '').replace(/></g, '> <');
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function search(query, limit = 24) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    const scan = (collection, type, textFn, subFn) => {
      for (const item of all(collection)) {
        const title = (item.title || '').toLowerCase();
        const body = (textFn ? textFn(item) : '').toLowerCase();
        let score = -1;
        if (title.startsWith(q)) score = 0;
        else if (title.includes(q)) score = 1;
        else if (body.includes(q)) score = 2;
        if (score >= 0) out.push({ type, item, score, sub: subFn ? subFn(item) : '' });
      }
    };
    scan('tasks', 'task', t => t.notes || '', t => t.done ? 'completed' : (t.dueDate || ''));
    scan('notes', 'note', n => textOfHtml(n.content), n => Fmt.relTime(n.updatedAt));
    scan('ideas', 'idea', i => textOfHtml(i.content), i => i.status || '');
    scan('events', 'event', e => e.notes || '', e => e.date || '');
    scan('reminders', 'reminder', r => r.body || '', r => r.at ? Fmt.dateTime(r.at) : '');
    for (const f of all('folders')) {
      const name = (f.name || '').toLowerCase();
      if (name.includes(q)) {
        const count = all('notes').filter(n => n.folderId === f.id).length;
        out.push({
          type: 'folder', score: name.startsWith(q) ? 0 : 1,
          item: { id: f.id, title: f.name }, sub: `${count} note${count === 1 ? '' : 's'}`
        });
      }
    }
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, limit);
  }

  /* ----- settings ----- */

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    accent: '#7c5cff',
    noteDefaultColor: '#7c5cff',
    calendarPrimary: 'gregorian',
    firstDayOfWeek: 1, // 0 Sun, 1 Mon, 6 Sat
    reduceEffects: false,
    reduceMotion: false,
    timerSound: true,
    autoLaunch: true,
    pomodoro: { work: 25, short: 5, long: 15, rounds: 4 },
    userName: ''
  };

  function settings() {
    return Object.assign({}, DEFAULT_SETTINGS, (data && data.settings) || {});
  }

  function setSettings(patch) {
    data.settings = Object.assign({}, data.settings, patch);
    window.aurora.setSettings(patch);
    emit({ kind: 'settings', settings: settings() });
  }

  return {
    init, all, get, getByRef, upsert, remove, uid, now,
    newTask, newNote, newIdea, newEvent, newReminder, newFolder, removeFolder,
    link, unlink, typeOf, TYPE_TO_COLL,
    search, textOfHtml,
    settings, setSettings,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
