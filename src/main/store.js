'use strict';
/**
 * Aurora data store (main process).
 *
 * Single JSON file, loaded synchronously at startup, written atomically
 * (temp file + rename) with debouncing. The main process is the single
 * writer; renderer windows get snapshots and send mutations over IPC.
 */
const fs = require('fs');
const path = require('path');

const EMPTY = () => ({
  version: 2,
  tasks: [],
  notes: [],
  folders: [],
  ideas: [],
  events: [],
  reminders: [],
  habits: [],
  cycle: [],
  sessions: [],
  tombstones: [],
  settings: {}
});

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = EMPTY();
    this._saveTimer = null;
    this._dirty = false;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = Object.assign(EMPTY(), parsed);
      } else {
        // Recover from an interrupted write if a temp file survived.
        const tmp = this.filePath + '.tmp';
        if (fs.existsSync(tmp)) {
          this.data = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(tmp, 'utf8')));
          this._dirty = true;
          this.flush();
        }
      }
    } catch (err) {
      // Corrupt file: keep a backup rather than silently destroying data.
      try { fs.copyFileSync(this.filePath, this.filePath + '.corrupt-' + Date.now()); } catch (e) { /* ignore */ }
      this.data = EMPTY();
    }
  }

  snapshot() { return this.data; }

  collection(name) {
    if (!Array.isArray(this.data[name])) throw new Error('Unknown collection: ' + name);
    return this.data[name];
  }

  upsert(collName, item) {
    if (!item || typeof item.id !== 'string') throw new Error('Item requires a string id');
    const coll = this.collection(collName);
    const idx = coll.findIndex(x => x.id === item.id);
    if (idx >= 0) coll[idx] = item; else coll.push(item);
    this.scheduleSave();
    return item;
  }

  remove(collName, id) {
    const coll = this.collection(collName);
    const idx = coll.findIndex(x => x.id === id);
    if (idx >= 0) coll.splice(idx, 1);
    // Record the deletion so sync can propagate it to other devices.
    if (idx >= 0 && collName !== 'sessions') {
      if (!Array.isArray(this.data.tombstones)) this.data.tombstones = [];
      this.data.tombstones.push({ collection: collName, id, deletedAt: new Date().toISOString() });
      if (this.data.tombstones.length > 5000) this.data.tombstones.splice(0, 1000);
    }
    // Remove dangling links to the deleted item everywhere.
    for (const name of ['tasks', 'notes', 'ideas', 'events', 'reminders']) {
      for (const it of this.data[name]) {
        if (Array.isArray(it.links)) {
          const before = it.links.length;
          it.links = it.links.filter(l => l.id !== id);
          if (it.links.length !== before) it.updatedAt = new Date().toISOString();
        }
      }
    }
    this.scheduleSave();
    return idx >= 0;
  }

  get(collName, id) {
    return this.collection(collName).find(x => x.id === id) || null;
  }

  setSettings(patch) {
    this.data.settings = Object.assign({}, this.data.settings, patch);
    this.scheduleSave();
    return this.data.settings;
  }

  replaceAll(newData) {
    const base = EMPTY();
    for (const key of Object.keys(base)) {
      if (key === 'version') continue;
      if (key === 'settings') base.settings = (newData && typeof newData.settings === 'object' && newData.settings) || {};
      else if (key === 'tombstones') base.tombstones = Array.isArray(newData && newData.tombstones) ? newData.tombstones : [];
      else if (Array.isArray(newData && newData[key])) base[key] = newData[key].filter(x => x && typeof x.id === 'string');
    }
    this.data = base;
    this.scheduleSave();
  }

  /** Apply a merged snapshot from the sync engine — keeps this device's settings. */
  applyMerged(merged) {
    const settings = this.data.settings;
    this.replaceAll(Object.assign({}, merged, { settings }));
  }

  scheduleSave() {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flush();
    }, 250);
  }

  flush() {
    if (!this._dirty) return;
    this._dirty = false;
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    const tmp = this.filePath + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      this._dirty = true; // try again on next mutation / quit
    }
  }
}

module.exports = { Store };
