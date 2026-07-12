'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Store } = require('../src/main/store.js');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-store-'));
  return path.join(dir, 'data.json');
}

test('starts empty, upserts and persists across reloads', () => {
  const file = tmpFile();
  const s1 = new Store(file);
  assert.deepStrictEqual(s1.snapshot().tasks, []);
  s1.upsert('tasks', { id: 't1', title: 'Buy milk', done: false, links: [] });
  s1.upsert('notes', { id: 'n1', title: 'Note', content: '<p>hi</p>', links: [] });
  s1.upsert('tasks', { id: 't1', title: 'Buy oat milk', done: false, links: [] }); // update
  s1.flush();

  const s2 = new Store(file);
  assert.strictEqual(s2.snapshot().tasks.length, 1);
  assert.strictEqual(s2.snapshot().tasks[0].title, 'Buy oat milk');
  assert.strictEqual(s2.snapshot().notes.length, 1);
});

test('remove deletes the item and scrubs dangling links everywhere', () => {
  const file = tmpFile();
  const s = new Store(file);
  s.upsert('tasks', { id: 't1', title: 'Task', links: [{ type: 'note', id: 'n1' }] });
  s.upsert('notes', { id: 'n1', title: 'Note', links: [{ type: 'task', id: 't1' }] });
  s.upsert('ideas', { id: 'i1', title: 'Idea', links: [{ type: 'note', id: 'n1' }] });
  s.remove('notes', 'n1');
  assert.strictEqual(s.get('notes', 'n1'), null);
  assert.deepStrictEqual(s.get('tasks', 't1').links, []);
  assert.deepStrictEqual(s.get('ideas', 'i1').links, []);
});

test('settings merge instead of replace', () => {
  const s = new Store(tmpFile());
  s.setSettings({ theme: 'dark' });
  s.setSettings({ accent: '#7c5cff' });
  assert.deepStrictEqual(s.snapshot().settings, { theme: 'dark', accent: '#7c5cff' });
});

test('corrupt file is backed up, store starts fresh instead of crashing', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{not json!!', 'utf8');
  const s = new Store(file);
  assert.deepStrictEqual(s.snapshot().tasks, []);
  const backups = fs.readdirSync(path.dirname(file)).filter(f => f.includes('corrupt'));
  assert.strictEqual(backups.length, 1);
});

test('replaceAll validates shape and drops junk', () => {
  const s = new Store(tmpFile());
  s.replaceAll({
    tasks: [{ id: 'a', title: 'ok' }, { title: 'no id — dropped' }, null],
    notes: 'not an array',
    settings: { theme: 'light' },
    extraneous: [1, 2, 3]
  });
  assert.strictEqual(s.snapshot().tasks.length, 1);
  assert.deepStrictEqual(s.snapshot().notes, []);
  assert.deepStrictEqual(s.snapshot().settings, { theme: 'light' });
  assert.strictEqual(s.snapshot().extraneous, undefined);
});

test('removals leave tombstones for sync; applyMerged keeps settings', () => {
  const s = new Store(tmpFile());
  s.setSettings({ theme: 'onyx' });
  s.upsert('tasks', { id: 't1', title: 'doomed' });
  s.remove('tasks', 't1');
  assert.strictEqual(s.snapshot().tombstones.length, 1);
  assert.strictEqual(s.snapshot().tombstones[0].id, 't1');
  assert.strictEqual(s.snapshot().tombstones[0].collection, 'tasks');
  s.applyMerged({ tasks: [{ id: 'merged-in', title: 'hi' }], tombstones: [] });
  assert.strictEqual(s.snapshot().tasks.length, 1);
  assert.strictEqual(s.snapshot().settings.theme, 'onyx'); // settings survive merges
});

test('rejects unknown collections and items without ids', () => {
  const s = new Store(tmpFile());
  assert.throws(() => s.upsert('nope', { id: 'x' }));
  assert.throws(() => s.upsert('tasks', { title: 'no id' }));
});
