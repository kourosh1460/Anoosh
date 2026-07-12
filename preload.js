'use strict';
const { contextBridge, ipcRenderer } = require('electron');

function on(channel, cb) {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('aurora', {
  // Data
  getAll: () => ipcRenderer.invoke('db:getAll'),
  upsert: (collection, item) => ipcRenderer.invoke('db:upsert', { collection, item }),
  remove: (collection, id) => ipcRenderer.invoke('db:remove', { collection, id }),
  setSettings: (patch) => ipcRenderer.invoke('db:setSettings', patch),
  exportData: () => ipcRenderer.invoke('db:export'),
  importData: () => ipcRenderer.invoke('db:import'),

  // Pinned notes
  pinNote: (noteId) => ipcRenderer.invoke('pin:open', noteId),
  unpinNote: (noteId) => ipcRenderer.invoke('pin:close', noteId),
  listPins: () => ipcRenderer.invoke('pin:list'),
  focusApp: (payload) => ipcRenderer.invoke('pin:focusApp', payload),
  setPinOpacity: (noteId, opacity) => ipcRenderer.invoke('pin:setOpacity', { noteId, opacity }),

  // Notifications
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  // Window controls
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  appInfo: () => ipcRenderer.invoke('app:info'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),

  // Sync
  syncStart: () => ipcRenderer.invoke('sync:start'),
  syncStop: () => ipcRenderer.invoke('sync:stop'),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  importMerge: () => ipcRenderer.invoke('db:importMerge'),
  onSyncActivity: (cb) => on('sync:activity', cb),

  testCheckReminders: () => ipcRenderer.invoke('test:checkReminders'),

  // Sync
  syncStart: () => ipcRenderer.invoke('sync:start'),
  syncStop: () => ipcRenderer.invoke('sync:stop'),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  importMerge: () => ipcRenderer.invoke('db:importMerge'),
  onSyncActivity: (cb) => on('sync:activity', cb),

  // Events from main
  onDbChanged: (cb) => on('db:changed', cb),
  onDbRemoved: (cb) => on('db:removed', cb),
  onDbReload: (cb) => on('db:reload', cb),
  onSettingsChanged: (cb) => on('settings:changed', cb),
  onWinState: (cb) => on('win:state', cb),
  onNavGoto: (cb) => on('nav:goto', cb),
  onReminderFired: (cb) => on('reminder:fired', cb),
  onPinState: (cb) => on('pin:state', cb),
  onShotView: (cb) => on('shot:view', cb)
});
