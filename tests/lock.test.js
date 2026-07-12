'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Lock = require('../src/shared/lock.js');

test('create + verify round-trips; wrong PIN rejected', async () => {
  const rec = await Lock.create('4821');
  assert.ok(rec.salt.length === 32 && rec.hash.length === 64);
  assert.strictEqual(await Lock.verify('4821', rec), true);
  assert.strictEqual(await Lock.verify('0000', rec), false);
  assert.strictEqual(await Lock.verify('48210', rec), false);
});

test('same PIN gives different hashes (unique salt) — no rainbow lookups', async () => {
  const a = await Lock.create('1234');
  const b = await Lock.create('1234');
  assert.notStrictEqual(a.hash, b.hash);
  assert.notStrictEqual(a.salt, b.salt);
});

test('rejects weak/invalid PIN formats and bad records', async () => {
  await assert.rejects(() => Lock.create('12'));
  await assert.rejects(() => Lock.create('abcd'));
  assert.strictEqual(await Lock.verify('1234', null), false);
  assert.strictEqual(await Lock.verify('1234', { salt: 'x' }), false);
});
