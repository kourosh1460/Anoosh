/**
 * Gregorian <-> Solar Hijri (Persian / Jalali) calendar conversion.
 * Arithmetic algorithm from the well-known jalaali-js implementation
 * (33-year cycle break points) — exact for years 1178..3327 AP.
 *
 * Works as CommonJS module (tests) and browser global `Jalali` (renderer).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Jalali = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS_EN = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar',
    'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];

  var BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }

  function jalCal(jy, withoutLeap) {
    var bl = BREAKS.length, gy = jy + 621, leapJ = -14, jp = BREAKS[0],
      jm, jump, leap, leapG, march, n, i;
    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('Invalid Jalali year ' + jy);
    for (i = 1; i < bl; i += 1) {
      jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;
    if (!withoutLeap) {
      if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
      leap = mod(mod(n + 1, 33) - 1, 4);
      if (leap === -1) leap = 4;
    }
    return { leap: leap, gy: gy, march: march };
  }

  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
      div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  }

  function d2g(jdn) {
    var j = 4 * jdn + 139361631 + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    var i = div(mod(j, 1461), 4) * 5 + 308;
    var gd = div(mod(i, 153), 5) + 1;
    var gm = mod(div(i, 153), 12) + 1;
    var gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { y: gy, m: gm, d: gd };
  }

  function j2d(jy, jm, jd) {
    var r = jalCal(jy, true);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    var gy = d2g(jdn).y, jy = gy - 621, r = jalCal(jy, false),
      jdn1f = j2d(jy, 1, 1), k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) return { y: jy, m: 1 + div(k, 31), d: mod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    return { y: jy, m: 7 + div(k, 30), d: mod(k, 30) + 1 };
  }

  /* ---- public API (mirrors Hijri module) ---- */

  function fromGregorian(gy, gm, gd) {
    var j = d2j(g2d(gy, gm, gd));
    j.monthName = MONTHS_EN[j.m - 1];
    return j;
  }

  function toGregorian(jy, jm, jd) {
    return d2g(j2d(jy, jm, jd));
  }

  function isLeap(jy) { return jalCal(jy, false).leap === 0; }

  function monthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeap(jy) ? 30 : 29;
  }

  /** Day of week (0=Sunday..6=Saturday). */
  function dayOfWeek(jy, jm, jd) {
    var g = toGregorian(jy, jm, jd);
    // JDN of standard convention: reuse arithmetic (g2d matches standard JDN)
    return mod(g2d(g.y, g.m, g.d) + 1, 7);
  }

  function isValid(jy, jm, jd) {
    if (!jy || jm < 1 || jm > 12 || jd < 1) return false;
    try { return jd <= monthLength(jy, jm); } catch (e) { return false; }
  }

  function format(j, opts) {
    opts = opts || {};
    var name = MONTHS_EN[j.m - 1];
    if (opts.short) return j.d + ' ' + name + ' ' + j.y;
    return j.d + ' ' + name + ' ' + j.y + ' SH';
  }

  return {
    fromGregorian: fromGregorian,
    toGregorian: toGregorian,
    monthLength: monthLength,
    dayOfWeek: dayOfWeek,
    isLeap: isLeap,
    isValid: isValid,
    format: format,
    MONTHS_EN: MONTHS_EN
  };
});
