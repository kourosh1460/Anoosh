'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { SyncServer } = require('../src/main/sync-server.js');

function fakeStore(initial) {
  const state = { data: initial, flushed: 0 };
  return {
    state,
    snapshot: () => state.data,
    applyMerged: (merged) => { state.data = Object.assign({}, merged, { settings: state.data.settings }); },
    flush: () => { state.flushed++; }
  };
}

function post(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, path, method: 'POST', agent: false,
      headers: Object.assign({ Connection: 'close', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, headers)
    }, (res) => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(out) }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, agent: false, headers: { Connection: 'close' } }, (res) => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(out) }));
    }).on('error', reject);
  });
}

const T1 = '2026-07-02T10:00:00.000Z';
const base = () => ({
  tasks: [], notes: [], folders: [], ideas: [], events: [],
  reminders: [], sessions: [], tombstones: [], settings: { theme: 'onyx' }
});

test('full sync round trip: both sides end up with the union', async () => {
  const desktopData = base();
  desktopData.tasks.push({ id: 'desk-task', title: 'From desktop', links: [], updatedAt: T1 });
  const store = fakeStore(desktopData);
  const server = new SyncServer(store);
  const status = await server.start();
  assert.ok(status.running && status.port);

  const ping = await get(status.port, '/ping');
  assert.strictEqual(ping.body.app, 'anoosh');

  const phoneData = base();
  phoneData.notes.push({ id: 'phone-note', title: 'From phone', links: [], updatedAt: T1 });
  const res = await post(status.port, '/sync',
    { deviceName: 'TestPhone', data: phoneData },
    { 'x-anoosh-code': status.code });

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.ok);
  // response contains merged data for the phone
  assert.ok(res.body.data.tasks.some(t => t.id === 'desk-task'));
  assert.ok(res.body.data.notes.some(n => n.id === 'phone-note'));
  // desktop store adopted merge and kept its own settings
  assert.ok(store.snapshot().notes.some(n => n.id === 'phone-note'));
  assert.strictEqual(store.snapshot().settings.theme, 'onyx');
  assert.ok(store.state.flushed > 0);

  server.stop();
  assert.strictEqual(server.isRunning(), false);
});

test('wrong code is rejected and data untouched', async () => {
  const store = fakeStore(base());
  const server = new SyncServer(store);
  const status = await server.start();
  const res = await post(status.port, '/sync',
    { data: { tasks: [{ id: 'evil', updatedAt: T1 }] } },
    { 'x-anoosh-code': '000000' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(store.snapshot().tasks.length, 0);
  server.stop();
});

test('deletion on phone propagates to desktop through tombstones', async () => {
  const desktopData = base();
  desktopData.tasks.push({ id: 'shared', title: 'kill me', links: [], updatedAt: T1 });
  const store = fakeStore(desktopData);
  const server = new SyncServer(store);
  const status = await server.start();
  const phoneData = base();
  phoneData.tombstones.push({ collection: 'tasks', id: 'shared', deletedAt: '2026-07-05T00:00:00.000Z' });
  const res = await post(status.port, '/sync', { data: phoneData }, { 'x-anoosh-code': status.code });
  assert.ok(res.body.ok);
  assert.strictEqual(store.snapshot().tasks.length, 0);
  server.stop();
});
