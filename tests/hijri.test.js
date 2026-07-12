'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Hijri = require('../src/shared/hijri.js');

test('JDN round-trips across 200 years of Gregorian dates', () => {
  for (let jdn = 2415021; jdn < 2488070; jdn += 13) { // 1900..2100
    const g = Hijri.jdnToGregorian(jdn);
    assert.strictEqual(Hijri.gregorianToJdn(g.y, g.m, g.d), jdn);
  }
});

test('known anchor: Gregorian epoch of Islamic calendar', () => {
  // 1 Muharram 1 AH (civil) == 16 July 622 CE (Julian) == 19 July 622 (Gregorian proleptic)
  assert.strictEqual(Hijri.gregorianToJdn(622, 7, 19), 1948440);
});

test('Gregorian -> Hijri -> Gregorian round-trips for every day 1990..2069', () => {
  const start = Hijri.gregorianToJdn(1990, 1, 1);
  const end = Hijri.gregorianToJdn(2069, 12, 31);
  for (let jdn = start; jdn <= end; jdn++) {
    const g = Hijri.jdnToGregorian(jdn);
    const h = Hijri.fromGregorian(g.y, g.m, g.d);
    const back = Hijri.toGregorian(h.y, h.m, h.d);
    assert.deepStrictEqual(
      { y: back.y, m: back.m, d: back.d },
      { y: g.y, m: g.m, d: g.d },
      `round-trip failed at ${g.y}-${g.m}-${g.d} (hijri ${h.y}-${h.m}-${h.d})`
    );
  }
});

test('Hijri months are always 29 or 30 days, years 354 or 355', () => {
  for (let hy = 1410; hy <= 1490; hy++) {
    let yearDays = 0;
    for (let hm = 1; hm <= 12; hm++) {
      const len = Hijri.monthLength(hy, hm);
      assert.ok(len === 29 || len === 30, `month ${hy}/${hm} has ${len} days`);
      yearDays += len;
    }
    assert.ok(yearDays === 354 || yearDays === 355, `year ${hy} has ${yearDays} days`);
  }
});

test('known Umm al-Qura dates (spot checks)', (t) => {
  if (!Hijri._usingUmalqura) {
    t.skip('ICU islamic-umalqura not available; tabular fallback in use');
    return;
  }
  // Well-documented correspondences (Umm al-Qura civil calendar)
  const cases = [
    { g: [2024, 3, 11], h: [1445, 9, 1] },   // start of Ramadan 1445
    { g: [2024, 4, 10], h: [1445, 10, 1] },  // Eid al-Fitr 1445
    { g: [2024, 6, 16], h: [1445, 12, 10] }, // Eid al-Adha 1445
    { g: [2025, 3, 1],  h: [1446, 9, 1] },   // start of Ramadan 1446
    { g: [2000, 1, 1],  h: [1420, 9, 24] },
  ];
  for (const c of cases) {
    const h = Hijri.fromGregorian(...c.g);
    assert.deepStrictEqual([h.y, h.m, h.d], c.h,
      `G ${c.g.join('-')} => expected H ${c.h.join('-')}, got ${h.y}-${h.m}-${h.d}`);
    const g = Hijri.toGregorian(...c.h);
    assert.deepStrictEqual([g.y, g.m, g.d], c.g,
      `H ${c.h.join('-')} => expected G ${c.g.join('-')}, got ${g.y}-${g.m}-${g.d}`);
  }
});

test('isValid rejects impossible dates', () => {
  assert.strictEqual(Hijri.isValid(1446, 13, 1), false);
  assert.strictEqual(Hijri.isValid(1446, 0, 1), false);
  assert.strictEqual(Hijri.isValid(1446, 1, 31), false);
  assert.strictEqual(Hijri.isValid(1446, 1, 1), true);
});

test('dayOfWeek matches Gregorian weekday', () => {
  for (let jdn = 2458849; jdn < 2459580; jdn += 7) {
    const g = Hijri.jdnToGregorian(jdn);
    const h = Hijri.fromGregorian(g.y, g.m, g.d);
    const jsDow = new Date(Date.UTC(g.y, g.m - 1, g.d)).getUTCDay();
    assert.strictEqual(Hijri.dayOfWeek(h.y, h.m, h.d), jsDow);
  }
});
