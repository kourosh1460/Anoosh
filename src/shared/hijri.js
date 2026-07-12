/**
 * Gregorian <-> Hijri (Islamic lunar) calendar conversion.
 *
 * Strategy:
 *  - A tabular (arithmetic/Kuwaiti) algorithm gives a fast first estimate.
 *  - Where the JS runtime provides Intl with the `islamic-umalqura` calendar
 *    (Chromium/Node with full ICU — always true in Electron), the estimate is
 *    corrected against Umm al-Qura, the reference civil lunar calendar, so the
 *    displayed dates match what users see on printed lunar calendars.
 *  - Conversion Hijri -> Gregorian inverts via a small local search around the
 *    tabular estimate, which is always within a few days of the true date.
 *
 * Works both as a CommonJS module (Node tests / Electron main) and as a
 * browser global `Hijri` (renderer).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Hijri = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HIJRI_EPOCH_JDN = 1948440; // 1 Muharram 1 AH (civil epoch), Julian Day Number

  var MONTHS_EN = [
    'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani",
    'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
    'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah'
  ];

  // ---- Julian Day Number helpers (proleptic Gregorian) ----

  function gregorianToJdn(y, m, d) {
    var a = Math.floor((14 - m) / 12);
    var yy = y + 4800 - a;
    var mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
      Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }

  function jdnToGregorian(jdn) {
    var a = jdn + 32044;
    var b = Math.floor((4 * a + 3) / 146097);
    var c = a - Math.floor(146097 * b / 4);
    var d = Math.floor((4 * c + 3) / 1461);
    var e = c - Math.floor(1461 * d / 4);
    var m = Math.floor((5 * e + 2) / 153);
    return {
      y: 100 * b + d - 4800 + Math.floor(m / 10),
      m: m + 3 - 12 * Math.floor(m / 10),
      d: e - Math.floor((153 * m + 2) / 5) + 1
    };
  }

  // ---- Tabular Islamic calendar (arithmetic, leap years 2,5,7,10,13,16,18,21,24,26,29 of 30) ----

  function tabularIslamicToJdn(y, m, d) {
    return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 +
      Math.floor((3 + 11 * y) / 30) + HIJRI_EPOCH_JDN - 1;
  }

  function jdnToTabularIslamic(jdn) {
    var l = jdn - HIJRI_EPOCH_JDN + 10632;
    var n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    var j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
            Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
        Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    var m = Math.floor((24 * l) / 709);
    var d = l - Math.floor((709 * m) / 24);
    var y = 30 * n + j - 30;
    return { y: y, m: m, d: d };
  }

  // ---- Umm al-Qura correction via Intl (when available) ----

  var umalquraFmt = null;
  try {
    umalquraFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC'
    });
    // Probe: some minimal ICU builds silently fall back to gregorian.
    var probe = umalquraFmt.resolvedOptions().calendar;
    if (probe.indexOf('islamic') === -1) umalquraFmt = null;
  } catch (e) { umalquraFmt = null; }

  function utcDateFromJdn(jdn) {
    // JDN 2440588 == 1970-01-01 (Unix epoch)
    return new Date((jdn - 2440588) * 86400000);
  }

  function umalquraFromJdn(jdn) {
    if (!umalquraFmt) return null;
    // Umm al-Qura is defined only within a bounded range; ICU throws or
    // misbehaves far outside it, so fall back to tabular there.
    var g = jdnToGregorian(jdn);
    if (g.y < 1938 || g.y > 2075) return null;
    try {
      var parts = umalquraFmt.formatToParts(utcDateFromJdn(jdn));
      var out = {};
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.type === 'year' || p.type === 'relatedYear') out.y = parseInt(p.value, 10);
        else if (p.type === 'month') out.m = parseInt(p.value, 10);
        else if (p.type === 'day') out.d = parseInt(p.value, 10);
      }
      if (!out.y || !out.m || !out.d) return null;
      return out;
    } catch (e) { return null; }
  }

  // ---- Public API ----

  /** Gregorian (y, m 1-12, d) -> { y, m (1-12), d, monthName } Hijri */
  function fromGregorian(gy, gm, gd) {
    var jdn = gregorianToJdn(gy, gm, gd);
    var h = umalquraFromJdn(jdn) || jdnToTabularIslamic(jdn);
    h.monthName = MONTHS_EN[h.m - 1];
    return h;
  }

  /** Hijri (y, m 1-12, d) -> { y, m (1-12), d } Gregorian */
  function toGregorian(hy, hm, hd) {
    var estimate = tabularIslamicToJdn(hy, hm, hd);
    if (umalquraFmt) {
      // Search a window around the tabular estimate for the exact
      // Umm al-Qura match (tabular is never more than ~3 days off).
      for (var off = 0; off <= 4; off++) {
        var candidates = off === 0 ? [0] : [off, -off];
        for (var i = 0; i < candidates.length; i++) {
          var jdn = estimate + candidates[i];
          var h = umalquraFromJdn(jdn);
          if (h && h.y === hy && h.m === hm && h.d === hd) return jdnToGregorian(jdn);
        }
      }
    }
    return jdnToGregorian(estimate);
  }

  /** Number of days in a Hijri month (29 or 30). */
  function monthLength(hy, hm) {
    var nextY = hm === 12 ? hy + 1 : hy;
    var nextM = hm === 12 ? 1 : hm + 1;
    var a = toGregorian(hy, hm, 1);
    var b = toGregorian(nextY, nextM, 1);
    return gregorianToJdn(b.y, b.m, b.d) - gregorianToJdn(a.y, a.m, a.d);
  }

  /** Day of week (0=Sunday..6=Saturday) for a Hijri date. */
  function dayOfWeek(hy, hm, hd) {
    var g = toGregorian(hy, hm, hd);
    return (gregorianToJdn(g.y, g.m, g.d) + 1) % 7;
  }

  /** Validate a Hijri date. */
  function isValid(hy, hm, hd) {
    if (!hy || hm < 1 || hm > 12 || hd < 1) return false;
    return hd <= monthLength(hy, hm);
  }

  function format(h, opts) {
    opts = opts || {};
    var name = MONTHS_EN[h.m - 1];
    if (opts.short) return h.d + ' ' + name.split(' ')[0] + ' ' + h.y;
    return h.d + ' ' + name + ' ' + h.y + ' AH';
  }

  return {
    fromGregorian: fromGregorian,
    toGregorian: toGregorian,
    monthLength: monthLength,
    dayOfWeek: dayOfWeek,
    isValid: isValid,
    format: format,
    gregorianToJdn: gregorianToJdn,
    jdnToGregorian: jdnToGregorian,
    MONTHS_EN: MONTHS_EN,
    _usingUmalqura: !!umalquraFmt
  };
});
