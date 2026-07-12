/**
 * Lock — app-entry PIN hashing/verification (desktop + mobile).
 * No default credential exists anywhere: the lock is off until the user
 * creates a PIN, and the stored value is a salted, iterated SHA-256 hash
 * kept in this device's local settings (never synced — settings are
 * per-device by design).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lock = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ITERATIONS = 20000;

  function bytesToHex(buf) {
    var v = new Uint8Array(buf), s = '';
    for (var i = 0; i < v.length; i++) s += v[i].toString(16).padStart(2, '0');
    return s;
  }

  function getCrypto() {
    if (typeof self !== 'undefined' && self.crypto && self.crypto.subtle) return self.crypto;
    // node (tests)
    return require('crypto').webcrypto;
  }

  async function digest(text) {
    var c = getCrypto();
    var data = new TextEncoder().encode(text);
    for (var i = 0; i < ITERATIONS; i++) {
      data = new Uint8Array(await c.subtle.digest('SHA-256', data));
    }
    return bytesToHex(data);
  }

  function randomSalt() {
    var c = getCrypto();
    var b = new Uint8Array(16);
    c.getRandomValues(b);
    return bytesToHex(b);
  }

  /** Create a stored record { salt, hash } for a new PIN. */
  async function create(pin) {
    if (!/^\d{4,10}$/.test(String(pin))) throw new Error('PIN must be 4–10 digits');
    var salt = randomSalt();
    return { salt: salt, hash: await digest(salt + ':' + pin) };
  }

  /** Verify a PIN attempt against a stored record. */
  async function verify(pin, record) {
    if (!record || !record.salt || !record.hash) return false;
    return (await digest(record.salt + ':' + pin)) === record.hash;
  }

  return { create: create, verify: verify };
});
