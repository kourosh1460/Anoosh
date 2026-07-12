'use strict';
/**
 * Anoosh — Electron main process.
 *
 * Responsibilities:
 *  - Main window lifecycle (frameless, custom titlebar).
 *  - Authoritative data store (JSON, atomic writes) + IPC bridge.
 *  - Reminder scheduler -> native Windows notifications.
 *  - Pinned note windows: small always-on-top notes that float over
 *    every other application.
 *  - Screenshot harness for automated visual testing (ANOOSH_SHOT env).
 */
const { app, BrowserWindow, ipcMain, Notification, screen, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./src/main/store.js');
const { SyncServer } = require('./src/main/sync-server.js');
const Merge = require('./src/shared/merge.js');

// Windows: proper notification attribution + no duplicate instance.
app.setAppUserModelId('com.anoosh.productivity');
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// Test isolation: point userData at a scratch dir when requested.
if (process.env.ANOOSH_TEST_DIR) {
  app.setPath('userData', process.env.ANOOSH_TEST_DIR);
}

let store = null;
let syncServer = null;
let mainWindow = null;
const pinWindows = new Map(); // noteId -> BrowserWindow
let reminderTimer = null;
let quitting = false;

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

function createMainWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  // Visual-QA harness can force an exact window size (e.g. "940x600").
  const forced = /^(\d+)x(\d+)$/.exec(process.env.ANOOSH_SHOT_SIZE || '');
  mainWindow = new BrowserWindow({
    width: forced ? Number(forced[1]) : Math.min(1360, sw - 80),
    height: forced ? Number(forced[2]) : Math.min(860, sh - 60),
    minWidth: 940,
    minHeight: 600,
    frame: false,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#0d0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  const query = process.env.ANOOSH_SEED ? { seed: '1' } : {};
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('maximize', () => sendToMain('win:state', { maximized: true }));
  mainWindow.on('unmaximize', () => sendToMain('win:state', { maximized: false }));
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Closing the main window quits the app; keep pinnedToScreen flags so
    // floating notes come back on next launch.
    quitting = true;
    for (const win of pinWindows.values()) {
      if (!win.isDestroyed()) win.close();
    }
  });

  // External links go to the default browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function broadcast(channel, payload) {
  sendToMain(channel, payload);
  for (const win of pinWindows.values()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/* ------------------------------------------------------------------ */
/* Pinned (always-on-top) note windows                                 */
/* ------------------------------------------------------------------ */

function openPinWindow(noteId) {
  if (pinWindows.has(noteId)) {
    const existing = pinWindows.get(noteId);
    if (!existing.isDestroyed()) { existing.focus(); return true; }
    pinWindows.delete(noteId);
  }
  const note = store.get('notes', noteId);
  if (!note) return false;

  const display = screen.getPrimaryDisplay().workArea;
  const offset = (pinWindows.size % 5) * 32;
  const win = new BrowserWindow({
    width: 340,
    height: 420,
    x: display.x + display.width - 340 - 28 - offset,
    y: display.y + 28 + offset,
    minWidth: 240,
    minHeight: 180,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    fullscreenable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  // 'screen-saver' keeps the note above fullscreen apps and other
  // always-on-top windows — it stays visible no matter where you click.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, 'renderer', 'pin.html'), { query: { id: noteId } });
  win.once('ready-to-show', () => win.showInactive());

  win.on('closed', () => {
    pinWindows.delete(noteId);
    // Reflect unpinned state in data + UI (unless the whole app is quitting).
    if (!quitting && store) {
      const n = store.get('notes', noteId);
      if (n && n.pinnedToScreen) {
        n.pinnedToScreen = false;
        store.upsert('notes', n);
        sendToMain('db:changed', { collection: 'notes', item: n });
        sendToMain('pin:state', { noteId, pinned: false });
      }
    }
  });

  pinWindows.set(noteId, win);
  return true;
}

function closePinWindow(noteId) {
  const win = pinWindows.get(noteId);
  if (win && !win.isDestroyed()) win.close();
  pinWindows.delete(noteId);
}

function restorePinnedNotes() {
  for (const note of store.snapshot().notes) {
    if (note.pinnedToScreen) openPinWindow(note.id);
  }
}

/* ------------------------------------------------------------------ */
/* Reminders -> native notifications                                   */
/* ------------------------------------------------------------------ */

function nextOccurrence(iso, repeat) {
  const d = new Date(iso);
  const now = new Date();
  // Advance until strictly in the future (covers app closed for days).
  while (d <= now) {
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else break;
  }
  return d.toISOString();
}

function checkReminders() {
  if (!store) return;
  const now = Date.now();
  let changed = false;
  for (const r of store.snapshot().reminders) {
    if (r.done || r.notified) continue;
    const at = Date.parse(r.at);
    if (isNaN(at) || at > now) continue;

    showReminderNotification(r);
    if (r.repeat && r.repeat !== 'none') {
      r.at = nextOccurrence(r.at, r.repeat);
      r.lastFiredAt = new Date().toISOString();
    } else {
      r.notified = true;
      r.lastFiredAt = new Date().toISOString();
    }
    store.upsert('reminders', r);
    sendToMain('db:changed', { collection: 'reminders', item: r });
    sendToMain('reminder:fired', { id: r.id });
    changed = true;
  }
  if (changed) store.flush();
}

function showReminderNotification(reminder) {
  if (!Notification.isSupported() || process.env.ANOOSH_SELFTEST) return;
  const n = new Notification({
    title: reminder.title || 'Reminder',
    body: reminder.body || 'Anoosh reminder',
    urgency: 'critical',
    timeoutType: 'never'
  });
  n.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      sendToMain('nav:goto', { view: 'reminders', id: reminder.id });
    }
  });
  n.show();
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle('db:getAll', () => store.snapshot());

  ipcMain.handle('db:upsert', (e, { collection, item }) => {
    const saved = store.upsert(collection, item);
    // Keep every window in sync (pin windows live-update this way).
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents !== e.sender) win.webContents.send('db:changed', { collection, item: saved });
    }
    return saved;
  });

  ipcMain.handle('db:remove', (e, { collection, id }) => {
    const removed = store.remove(collection, id);
    if (collection === 'notes') closePinWindow(id);
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents !== e.sender) win.webContents.send('db:removed', { collection, id });
    }
    return removed;
  });

  ipcMain.handle('db:setSettings', (e, patch) => {
    const s = store.setSettings(patch);
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents !== e.sender) win.webContents.send('settings:changed', s);
    }
    return s;
  });

  ipcMain.handle('db:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Anoosh data',
      defaultPath: 'anoosh-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false };
    store.flush();
    fs.writeFileSync(filePath, JSON.stringify(store.snapshot(), null, 2), 'utf8');
    return { ok: true, path: filePath };
  });

  ipcMain.handle('db:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Anoosh data',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return { ok: false };
    try {
      const parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
      store.replaceAll(parsed);
      store.flush();
      broadcast('db:reload', store.snapshot());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'Could not read that file as Anoosh data.' };
    }
  });

  // Pinned notes
  ipcMain.handle('pin:open', (e, noteId) => {
    const ok = openPinWindow(noteId);
    if (ok) sendToMain('pin:state', { noteId, pinned: true });
    return ok;
  });
  ipcMain.handle('pin:close', (e, noteId) => {
    closePinWindow(noteId);
    const n = store.get('notes', noteId);
    if (n && n.pinnedToScreen) {
      n.pinnedToScreen = false;
      store.upsert('notes', n);
      sendToMain('db:changed', { collection: 'notes', item: n });
    }
    sendToMain('pin:state', { noteId, pinned: false });
    return true;
  });
  ipcMain.handle('pin:list', () => Array.from(pinWindows.keys()));
  ipcMain.handle('pin:focusApp', (e, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (payload && payload.noteId) sendToMain('nav:goto', { view: 'notes', id: payload.noteId });
    }
    return true;
  });
  ipcMain.handle('pin:setOpacity', (e, { noteId, opacity }) => {
    const win = pinWindows.get(noteId);
    if (win && !win.isDestroyed()) win.setOpacity(Math.min(1, Math.max(0.3, opacity)));
    return true;
  });

  // Window controls (frameless windows)
  ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('win:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

  // Ad-hoc notifications from renderer (e.g. timer finished)
  ipcMain.handle('notify', (e, { title, body }) => {
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title: String(title || 'Anoosh'), body: String(body || '') });
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
    });
    n.show();
    return true;
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataFile: path.join(app.getPath('userData'), 'anoosh-data.json'),
    platform: process.platform
  }));

  // Test hook: force a reminder sweep immediately (self-test mode only).
  ipcMain.handle('test:checkReminders', () => {
    if (!process.env.ANOOSH_SELFTEST) return false;
    checkReminders();
    return true;
  });

  // Launch-at-startup (only meaningful for the installed/packaged app).
  ipcMain.handle('app:setAutoLaunch', (e, enabled) => {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!enabled });
    return app.getLoginItemSettings().openAtLogin;
  });

  /* ---- sync ---- */
  ipcMain.handle('sync:start', async () => {
    try { return await syncServer.start(); }
    catch (err) { return { running: false, error: err.message }; }
  });
  ipcMain.handle('sync:stop', () => syncServer.stop());
  ipcMain.handle('sync:status', () => syncServer.status());

  // File-based sync: merge a sync/backup file into this device (for USB
  // cable transfers or any file share). Never replaces — always merges.
  ipcMain.handle('db:importMerge', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Merge Anoosh sync file',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return { ok: false };
    try {
      const incoming = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
      const mine = store.snapshot();
      const merged = Merge.merge(mine, incoming);
      const stats = Merge.diffStats(mine, merged);
      store.applyMerged(merged);
      store.flush();
      broadcast('db:reload', store.snapshot());
      return { ok: true, stats };
    } catch (err) {
      return { ok: false, error: 'That file could not be read as Anoosh data.' };
    }
  });
}

function applyAutoLaunch() {
  if (!app.isPackaged) return;
  const enabled = store.snapshot().settings.autoLaunch !== false; // default on
  app.setLoginItemSettings({ openAtLogin: enabled });
}

/* ------------------------------------------------------------------ */
/* Screenshot harness (visual QA)                                      */
/* ------------------------------------------------------------------ */

async function runScreenshotHarness(dir) {
  const views = (process.env.ANOOSH_SHOT_VIEWS ||
    'dashboard,tasks,notes,ideas,calendar,timer,reminders,settings').split(',');
  fs.mkdirSync(dir, { recursive: true });
  await new Promise(r => setTimeout(r, 1600)); // let fonts/animations settle
  for (const view of views) {
    sendToMain('shot:view', { view });
    await new Promise(r => setTimeout(r, 900));
    const img = await mainWindow.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${view.trim()}.png`), img.toPNG());
  }
  // Also capture a pin window if one exists.
  const firstPin = pinWindows.values().next().value;
  if (firstPin && !firstPin.isDestroyed()) {
    await new Promise(r => setTimeout(r, 400));
    const img = await firstPin.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'pin-note.png'), img.toPNG());
  }
  quitting = true;
  app.quit();
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

/** One-time migration: bring data over from the app's previous identity ("Aurora"). */
function migrateLegacyData(dataPath) {
  if (fs.existsSync(dataPath)) return;
  const roaming = path.dirname(app.getPath('userData'));
  const candidates = [
    path.join(app.getPath('userData'), 'aurora-data.json'),
    path.join(roaming, 'Aurora', 'aurora-data.json'),
    path.join(roaming, 'aurora-productivity', 'aurora-data.json')
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        fs.mkdirSync(path.dirname(dataPath), { recursive: true });
        fs.copyFileSync(candidate, dataPath);
        return;
      }
    } catch (err) { /* keep looking */ }
  }
}

app.whenReady().then(() => {
  const dataPath = path.join(app.getPath('userData'), 'anoosh-data.json');
  migrateLegacyData(dataPath);
  store = new Store(dataPath);
  syncServer = new SyncServer(store, {
    onActivity: (msg) => sendToMain('sync:activity', { msg, at: new Date().toISOString() }),
    onDataChanged: () => broadcast('db:reload', store.snapshot())
  });
  registerIpc();
  applyAutoLaunch();
  createMainWindow();
  restorePinnedNotes();

  reminderTimer = setInterval(checkReminders, 15000);
  setTimeout(checkReminders, 3000);

  if (process.env.ANOOSH_SELFTEST) {
    mainWindow.webContents.on('console-message', (e, level, message, line, sourceId) => {
      if (level >= 2) console.error(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const results = await mainWindow.webContents.executeJavaScript('window.__selfTest()', true);
        console.log('SELFTEST_RESULTS ' + JSON.stringify(results));
        const fails = results.filter(r => !r.pass).length;
        quitting = true;
        app.exit(fails ? 1 : 0);
      } catch (err) {
        console.error('selftest crashed:', err);
        quitting = true;
        app.exit(2);
      }
    });
  }

  if (process.env.ANOOSH_SHOT) {
    mainWindow.webContents.on('console-message', (e, level, message, line, sourceId) => {
      if (level >= 2) console.error(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.once('did-finish-load', () => {
      runScreenshotHarness(process.env.ANOOSH_SHOT).catch(err => {
        console.error('shot harness failed:', err);
        app.exit(1);
      });
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
  if (reminderTimer) clearInterval(reminderTimer);
  if (syncServer) syncServer.stop();
  if (store) store.flush();
});

app.on('window-all-closed', () => {
  if (store) store.flush();
  app.quit();
});
