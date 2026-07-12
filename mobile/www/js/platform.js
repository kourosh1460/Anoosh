'use strict';
/**
 * Platform — adapter between the app and the device.
 * On Android (Capacitor) it uses native storage, notifications, share and
 * the home-screen widget bridge. In a plain browser (development preview)
 * everything gracefully falls back to localStorage / no-ops.
 */
const Platform = (() => {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const P = () => window.Capacitor.Plugins;
  const DATA_FILE = 'anoosh-data.json';
  const LS_KEY = 'anoosh-data';

  /* ---------- storage ---------- */
  const BAK_FILE = 'anoosh-data.bak.json';
  const TMP_FILE = 'anoosh-data.tmp.json';
  let backupDone = false;

  async function readJson(path) {
    const res = await P().Filesystem.readFile({ path, directory: 'DATA', encoding: 'utf8' });
    return JSON.parse(res.data);
  }

  async function loadData() {
    if (isNative) {
      // main file → backup → temp (in case a rename was interrupted)
      for (const path of [DATA_FILE, BAK_FILE, TMP_FILE]) {
        try { return await readJson(path); } catch (err) { /* try next */ }
      }
      return null; // first run
    }
    try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; }
  }

  async function saveData(obj) {
    const text = JSON.stringify(obj);
    if (isNative) {
      // Once per session, preserve the last known-good file as a backup.
      if (!backupDone) {
        backupDone = true;
        try {
          await P().Filesystem.copy({ from: DATA_FILE, to: BAK_FILE, directory: 'DATA', toDirectory: 'DATA' });
        } catch (e) { /* no main file yet */ }
      }
      // Atomic-ish: write to temp, then rename over the main file, so a kill
      // mid-write can never corrupt the only copy.
      try {
        await P().Filesystem.writeFile({ path: TMP_FILE, directory: 'DATA', encoding: 'utf8', data: text });
        await P().Filesystem.rename({ from: TMP_FILE, to: DATA_FILE, directory: 'DATA', toDirectory: 'DATA' });
      } catch (e) {
        // rename unsupported/failed — fall back to direct write
        await P().Filesystem.writeFile({ path: DATA_FILE, directory: 'DATA', encoding: 'utf8', data: text });
      }
    } else {
      localStorage.setItem(LS_KEY, text);
    }
  }

  /* ---------- notifications ---------- */
  function notifId(id) {
    // stable positive 31-bit int from a string id
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  }

  let permissionAsked = false;
  async function ensureNotifPermission() {
    if (!isNative) return false;
    try {
      const status = await P().LocalNotifications.checkPermissions();
      if (status.display === 'granted') return true;
      if (permissionAsked) return false;
      permissionAsked = true;
      const req = await P().LocalNotifications.requestPermissions();
      return req.display === 'granted';
    } catch (e) { return false; }
  }

  /** (Re)schedule native notifications for all pending reminders. */
  async function scheduleReminders(reminders) {
    if (!isNative) return;
    if (!await ensureNotifPermission()) return;
    try {
      const LN = P().LocalNotifications;
      const pending = await LN.getPending();
      if (pending.notifications && pending.notifications.length) {
        await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
      }
      const now = Date.now();
      const upcoming = (reminders || [])
        .filter(r => !r.done && r.at && Date.parse(r.at) > now)
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(0, 48);
      if (!upcoming.length) return;
      await LN.schedule({
        notifications: upcoming.map(r => ({
          id: notifId(r.id),
          title: r.title || 'Reminder',
          body: r.body || 'Anoosh reminder',
          schedule: { at: new Date(r.at), allowWhileIdle: true },
          smallIcon: 'ic_stat_anoosh'
        }))
      });
    } catch (e) { console.warn('scheduleReminders failed', e); }
  }

  /** Fire an immediate notification (timer completion etc.). */
  async function notify(title, body) {
    if (isNative && await ensureNotifPermission()) {
      try {
        await P().LocalNotifications.schedule({
          notifications: [{ id: Math.floor(Math.random() * 2147000000), title, body }]
        });
        return;
      } catch (e) { /* fall through */ }
    }
    if (typeof toast === 'function') toast(`${title} — ${body}`, { icon: 'bell', duration: 4000 });
  }

  /* ---------- widget ---------- */
  let widgetTimer = null;
  function refreshWidget() {
    if (!isNative || !P().WidgetBridge) return;
    clearTimeout(widgetTimer);
    widgetTimer = setTimeout(() => {
      try { P().WidgetBridge.refresh(); } catch (e) { /* widget not placed */ }
    }, 400);
  }

  /* ---------- share / files (sync by cable or any channel) ---------- */
  async function shareFile(fileName, text) {
    if (isNative) {
      const write = await P().Filesystem.writeFile({
        path: fileName, directory: 'CACHE', encoding: 'utf8', data: text
      });
      await P().Share.share({
        title: 'Anoosh sync file',
        text: 'Anoosh data — merge it on the other device.',
        files: [write.uri]
      });
    } else {
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  }

  function pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => {
        const file = input.files[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      input.click();
    });
  }

  /* ---------- device chrome ---------- */
  async function applyStatusBar(theme) {
    if (!isNative || !P().StatusBar) return;
    try {
      const BG = {
        dark: '#0d0e1a', light: '#eef0fa', onyx: '#060607',
        toranj: '#ece2cf', 'toranj-warm': '#ece2cf', blossoms: '#171021'
      };
      const isLight = theme === 'light' || theme.startsWith('toranj');
      await P().StatusBar.setStyle({ style: isLight ? 'LIGHT' : 'DARK' });
      await P().StatusBar.setBackgroundColor({ color: BG[theme] || BG.dark });
    } catch (e) { /* older webview */ }
  }

  function haptic(kind = 'light') {
    if (!isNative || !P().Haptics) return;
    try { P().Haptics.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' }); } catch (e) { /* ok */ }
  }

  function onBackButton(handler) {
    if (!isNative || !P().App) return;
    P().App.addListener('backButton', handler);
  }

  function exitApp() {
    if (isNative && P().App) P().App.minimizeApp ? P().App.minimizeApp() : P().App.exitApp();
  }

  function deviceName() {
    return 'Phone';
  }

  return {
    isNative, loadData, saveData,
    scheduleReminders, notify, ensureNotifPermission,
    refreshWidget, shareFile, pickFile,
    applyStatusBar, haptic, onBackButton, exitApp, deviceName
  };
})();

// Shim so the shared timer-engine (written for the desktop preload bridge)
// can fire notifications on mobile without modification.
window.aurora = { notify: (title, body) => Platform.notify(title, body) };
