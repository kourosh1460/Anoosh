'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Jalali = require('../src/shared/jalali.js');
const Hijri = require('../src/shared/hijri.js');

test('known Nowruz anchors (official Iranian calendar)', () => {
  const cases = [
    { g: [2021, 3, 21], j: [1400, 1, 1] },
    { g: [2024, 3, 20], j: [1403, 1, 1] },
    { g: [2025, 3, 21], j: [1404, 1, 1] },
    { g: [2026, 3, 21], j: [1405, 1, 1] },
    { g: [2000, 3, 20], j: [1379, 1, 1] },
    { g: [2026, 7, 6],  j: [1405, 4, 15] } // today-ish spot check: 15 Tir 1405
  ];
  for (const c of cases) {
    const j = Jalali.fromGregorian(...c.g);
    assert.deepStrictEqual([j.y, j.m, j.d], c.j,
      `G ${c.g.join('-')} => expected J ${c.j.join('-')}, got ${j.y}-${j.m}-${j.d}`);
    const g = Jalali.toGregorian(...c.j);
    assert.deepStrictEqual([g.y, g.m, g.d], c.g,
      `J ${c.j.join('-')} => expected G ${c.g.join('-')}, got ${g.y}-${g.m}-${g.d}`);
  }
});

test('leap years: 1399 & 1403 leap, 1400 & 1404 not', () => {
  assert.strictEqual(Jalali.isLeap(1399), true);
  assert.strictEqual(Jalali.isLeap(1403), true);
  assert.strictEqual(Jalali.isLeap(1400), false);
  assert.strictEqual(Jalali.isLeap(1404), false);
  assert.strictEqual(Jalali.monthLength(1403, 12), 30);
  assert.strictEqual(Jalali.monthLength(1404, 12), 29);
  // 30 Esfand 1403 = 20 March 2025
  const g = Jalali.toGregorian(1403, 12, 30);
  assert.deepStrictEqual([g.y, g.m, g.d], [2025, 3, 20]);
});

test('month lengths: 1-6 are 31, 7-11 are 30', () => {
  for (let m = 1; m <= 6; m++) assert.strictEqual(Jalali.monthLength(1404, m), 31);
  for (let m = 7; m <= 11; m++) assert.strictEqual(Jalali.monthLength(1404, m), 30);
});

test('round-trips every day 1990..2069 and agrees with Gregorian JDN math', () => {
  const start = Hijri.gregorianToJdn(1990, 1, 1);
  const end = Hijri.gregorianToJdn(2069, 12, 31);
  for (let jdn = start; jdn <= end; jdn++) {
    const g = Hijri.jdnToGregorian(jdn);
    const j = Jalali.fromGregorian(g.y, g.m, g.d);
    const back = Jalali.toGregorian(j.y, j.m, j.d);
    assert.deepStrictEqual({ y: back.y, m: back.m, d: back.d }, g,
      `round-trip failed at ${g.y}-${g.m}-${g.d} (jalali ${j.y}-${j.m}-${j.d})`);
  }
});

test('dayOfWeek matches Gregorian weekday', () => {
  for (let jdn = 2458849; jdn < 2459580; jdn += 5) {
    const g = Hijri.jdnToGregorian(jdn);
    const j = Jalali.fromGregorian(g.y, g.m, g.d);
    const jsDow = new Date(Date.UTC(g.y, g.m - 1, g.d)).getUTCDay();
    assert.strictEqual(Jalali.dayOfWeek(j.y, j.m, j.d), jsDow);
  }
});

test('three-way conversion is consistent (G -> J -> G -> H == G -> H)', () => {
  for (let jdn = 2451545; jdn < 2469000; jdn += 97) {
    const g = Hijri.jdnToGregorian(jdn);
    const j = Jalali.fromGregorian(g.y, g.m, g.d);
    const g2 = Jalali.toGregorian(j.y, j.m, j.d);
    const h1 = Hijri.fromGregorian(g.y, g.m, g.d);
    const h2 = Hijri.fromGregorian(g2.y, g2.m, g2.d);
    assert.deepStrictEqual(h2, h1);
  }
});

test('isValid rejects impossible dates', () => {
  assert.strictEqual(Jalali.isValid(1404, 13, 1), false);
  assert.strictEqual(Jalali.isValid(1404, 12, 30), false); // not leap
  assert.strictEqual(Jalali.isValid(1403, 12, 30), true);  // leap
  assert.strictEqual(Jalali.isValid(1404, 1, 31), true);
  assert.strictEqual(Jalali.isValid(1404, 7, 31), false);
});
