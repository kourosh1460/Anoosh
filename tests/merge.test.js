'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { merge, diffStats } = require('../src/shared/merge.js');

const T0 = '2026-07-01T10:00:00.000Z';
const T1 = '2026-07-02T10:00:00.000Z';
const T2 = '2026-07-03T10:00:00.000Z';
const NOW = Date.parse('2026-07-10T00:00:00.000Z');

function snap(over = {}) {
  return Object.assign({
    tasks: [], notes: [], folders: [], ideas: [], events: [],
    reminders: [], sessions: [], tombstones: []
  }, over);
}
const item = (id, updatedAt, extra = {}) =>
  Object.assign({ id, title: id, links: [], updatedAt, createdAt: T0 }, extra);

test('items unique to each side are combined', () => {
  const a = snap({ tasks: [item('t1', T1)], notes: [item('n1', T1)] });
  const b = snap({ tasks: [item('t2', T1)], ideas: [item('i1', T1)] });
  const m = merge(a, b, NOW);
  assert.deepStrictEqual(m.tasks.map(t => t.id).sort(), ['t1', 't2']);
  assert.strictEqual(m.notes.length, 1);
  assert.strictEqual(m.ideas.length, 1);
});

test('conflict: newer updatedAt wins regardless of side', () => {
  const older = item('n1', T1, { title: 'old title' });
  const newer = item('n1', T2, { title: 'new title' });
  assert.strictEqual(merge(snap({ notes: [older] }), snap({ notes: [newer] }), NOW).notes[0].title, 'new title');
  assert.strictEqual(merge(snap({ notes: [newer] }), snap({ notes: [older] }), NOW).notes[0].title, 'new title');
});

test('deletion beats older edits (tombstone wins)', () => {
  const a = snap({ tombstones: [{ collection: 'tasks', id: 't1', deletedAt: T2 }] });
  const b = snap({ tasks: [item('t1', T1)] });
  const m = merge(a, b, NOW);
  assert.strictEqual(m.tasks.length, 0);
  assert.strictEqual(m.tombstones.length, 1); // survives so a third device also deletes
});

test('edit after deletion resurrects the item and drops the tombstone', () => {
  const a = snap({ tombstones: [{ collection: 'tasks', id: 't1', deletedAt: T1 }] });
  const b = snap({ tasks: [item('t1', T2, { title: 'edited later' })] });
  const m = merge(a, b, NOW);
  assert.strictEqual(m.tasks.length, 1);
  assert.strictEqual(m.tasks[0].title, 'edited later');
  assert.strictEqual(m.tombstones.length, 0);
});

test('merge is symmetric', () => {
  const a = snap({
    tasks: [item('t1', T1), item('shared', T2, { title: 'A version' })],
    tombstones: [{ collection: 'notes', id: 'gone', deletedAt: T2 }]
  });
  const b = snap({
    tasks: [item('t2', T1), item('shared', T1, { title: 'B version' })],
    notes: [item('gone', T1)]
  });
  const ab = merge(a, b, NOW), ba = merge(b, a, NOW);
  const norm = (m) => JSON.stringify({
    tasks: [...m.tasks].sort((x, y) => x.id.localeCompare(y.id)),
    notes: m.notes, tombstones: m.tombstones
  });
  assert.strictEqual(norm(ab), norm(ba));
  assert.strictEqual(ab.tasks.find(t => t.id === 'shared').title, 'A version');
  assert.strictEqual(ab.notes.length, 0);
});

test('dangling links and folder refs are scrubbed after merge', () => {
  const a = snap({
    notes: [item('n1', T1, { links: [{ type: 'task', id: 't-deleted' }], folderId: 'f-deleted' })],
    tombstones: [
      { collection: 'tasks', id: 't-deleted', deletedAt: T2 },
      { collection: 'folders', id: 'f-deleted', deletedAt: T2 }
    ]
  });
  const b = snap({ tasks: [item('t-deleted', T1)], folders: [item('f-deleted', T1)] });
  const m = merge(a, b, NOW);
  assert.deepStrictEqual(m.notes[0].links, []);
  assert.strictEqual(m.notes[0].folderId, null);
});

test('sessions are unioned without duplicates', () => {
  const s1 = { id: 's1', kind: 'focus', durationMs: 100 };
  const s2 = { id: 's2', kind: 'break', durationMs: 200 };
  const m = merge(snap({ sessions: [s1, s2] }), snap({ sessions: [s1] }), NOW);
  assert.strictEqual(m.sessions.length, 2);
});

test('ancient tombstones are pruned, recent ones kept', () => {
  const recent = new Date(NOW - 24 * 3600 * 1000).toISOString();
  const ancient = new Date(NOW - 200 * 24 * 3600 * 1000).toISOString();
  const a = snap({
    tombstones: [
      { collection: 'tasks', id: 'recent', deletedAt: recent },
      { collection: 'tasks', id: 'ancient', deletedAt: ancient }
    ]
  });
  const m = merge(a, snap(), NOW);
  assert.deepStrictEqual(m.tombstones.map(t => t.id), ['recent']);
});

test('settings are never merged', () => {
  const m = merge(snap({ settings: { theme: 'onyx' } }), snap({ settings: { theme: 'light' } }), NOW);
  assert.strictEqual(m.settings, undefined);
});

test('diffStats reports adds/updates/removes', () => {
  const before = snap({ tasks: [item('keep', T1), item('gone', T1), item('stale', T1)] });
  const merged = merge(before, snap({
    tasks: [item('new1', T1), item('stale', T2)],
    tombstones: [{ collection: 'tasks', id: 'gone', deletedAt: T2 }]
  }), NOW);
  const stats = diffStats(before, merged);
  assert.deepStrictEqual(stats, { added: 1, updated: 1, removed: 1 });
});
