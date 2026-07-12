'use strict';
/**
 * Anoosh Wi-Fi sync server (desktop side).
 *
 * While the user has the Sync panel open, a tiny HTTP server listens on the
 * local network. The phone posts its full snapshot; both sides are merged
 * with the shared engine, the desktop store adopts the merged result, and
 * the merged snapshot is returned for the phone to adopt too.
 *
 * Security model (LAN, short-lived, personal use):
 *  - server only runs while the user keeps it running;
 *  - every /sync call must carry the 6-digit code shown on the desktop;
 *  - payloads capped at 64 MB; JSON only.
 */
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const Merge = require('../shared/merge.js');

const PORT_RANGE_START = 38200;

class SyncServer {
  constructor(store, { onActivity, onDataChanged } = {}) {
    this.store = store;
    this.server = null;
    this.port = null;
    this.code = null;
    this.onActivity = onActivity || (() => {});
    this.onDataChanged = onDataChanged || (() => {});
  }

  isRunning() { return !!this.server; }

  addresses() {
    const out = [];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const info of ifaces[name] || []) {
        if (info.family === 'IPv4' && !info.internal) out.push(info.address);
      }
    }
    // Prefer typical LAN ranges so the primary address shown is the right one.
    out.sort((a, b) => {
      const rank = (ip) => ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2;
      return rank(a) - rank(b);
    });
    return out;
  }

  status() {
    return {
      running: this.isRunning(),
      port: this.port,
      code: this.code,
      addresses: this.isRunning() ? this.addresses() : [],
      deviceName: os.hostname()
    };
  }

  start() {
    if (this.server) return Promise.resolve(this.status());
    this.code = String(crypto.randomInt(100000, 999999));
    return new Promise((resolve, reject) => {
      const tryListen = (port, attemptsLeft) => {
        const server = http.createServer((req, res) => this._handle(req, res));
        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE' && attemptsLeft > 0) tryListen(port + 1, attemptsLeft - 1);
          else reject(err);
        });
        server.listen(port, '0.0.0.0', () => {
          this.server = server;
          this.port = port;
          this.onActivity(`Sync server started on port ${port}`);
          resolve(this.status());
        });
      };
      tryListen(PORT_RANGE_START, 20);
    });
  }

  stop() {
    if (this.server) {
      // Sever kept-alive sockets too, so the port frees immediately.
      if (this.server.closeAllConnections) this.server.closeAllConnections();
      this.server.close();
      this.server = null;
      this.port = null;
      this.code = null;
      this.onActivity('Sync server stopped');
    }
    return this.status();
  }

  _handle(req, res) {
    res.setHeader('Content-Type', 'application/json');
    // The phone's WebView enforces CORS — answer preflights and allow the code header.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Anoosh-Code');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    if (req.method === 'GET' && req.url === '/ping') {
      res.end(JSON.stringify({ app: 'anoosh', role: 'desktop', name: os.hostname(), version: 2 }));
      return;
    }
    if (req.method === 'POST' && req.url === '/sync') {
      if ((req.headers['x-anoosh-code'] || '') !== this.code) {
        this.onActivity('Rejected a sync attempt with a wrong code');
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, error: 'Wrong code. Check the 6-digit code on the desktop.' }));
        return;
      }
      let body = '';
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) { req.destroy(); return; }
        body += chunk;
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const clientData = payload.data || {};
          const mine = this.store.snapshot();
          const merged = Merge.merge(mine, clientData);
          const stats = Merge.diffStats(mine, merged);
          this.store.applyMerged(merged);
          this.store.flush();
          this.onDataChanged();
          const deviceName = String(payload.deviceName || 'phone').slice(0, 40);
          this.onActivity(`Synced with ${deviceName} — ${stats.added} added, ${stats.updated} updated, ${stats.removed} removed here`);
          res.end(JSON.stringify({ ok: true, data: merged, deviceName: os.hostname() }));
        } catch (err) {
          this.onActivity('Sync failed: ' + err.message);
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Could not read sync payload.' }));
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  }
}

module.exports = { SyncServer };
