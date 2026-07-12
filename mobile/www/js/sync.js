'use strict';
/**
 * Sync — talks to the desktop app.
 *  - Wi-Fi: POST full snapshot to the desktop's sync server, adopt the merged
 *    result it returns. One round trip = both devices identical.
 *  - File: export a sync file (share anywhere — USB cable, messenger, drive)
 *    and merge such a file coming back. Merging never replaces data.
 */
const Sync = (() => {

  function normalizeAddress(addr) {
    let a = String(addr || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (a && !/:\d+$/.test(a)) a += ':38200';
    return a;
  }

  async function wifiSync(address, code) {
    const addr = normalizeAddress(address);
    if (!addr) throw new Error('Enter the address shown on your PC (e.g. 192.168.1.5:38200).');
    if (!/^\d{6}$/.test(String(code || '').trim())) throw new Error('Enter the 6-digit code shown on your PC.');

    await DB.flush(); // everything on disk before we negotiate
    const before = JSON.parse(JSON.stringify(DB.snapshot()));

    // Up to 3 attempts with short backoff — Wi-Fi wakeups are flaky.
    let res = null, lastErr = null;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 1200 * attempt));
      try {
        res = await fetch(`http://${addr}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Anoosh-Code': String(code).trim() },
          body: JSON.stringify({ deviceName: 'Android phone', data: before })
        });
      } catch (err) { lastErr = err; }
    }
    if (!res) throw new Error('Could not reach the PC. Same Wi-Fi network? Sync started on the desktop?');
    let body;
    try { body = await res.json(); } catch (e) { body = {}; }
    if (res.status === 403) throw new Error(body.error || 'Wrong code.');
    if (!res.ok || !body.ok || !body.data) throw new Error(body.error || 'Sync failed on the PC side.');

    // Sanity-check the merged payload before adopting it: refuse anything
    // that would silently wipe local data.
    const merged = body.data;
    const localCount = Merge.COLLECTIONS.reduce((n, c) => n + (before[c] || []).length, 0);
    const mergedCount = Merge.COLLECTIONS.reduce((n, c) => n + (Array.isArray(merged[c]) ? merged[c].length : 0), 0);
    const tombs = Array.isArray(merged.tombstones) ? merged.tombstones.length : 0;
    if (localCount > 0 && mergedCount === 0 && tombs === 0) {
      throw new Error('The PC sent an empty dataset — sync aborted, nothing was changed on this phone.');
    }

    const stats = Merge.diffStats(before, merged);
    try {
      DB.applyMerged(merged);
    } catch (err) {
      DB.applyMerged(before); // roll back to the pre-sync snapshot
      throw new Error('Applying the sync failed — your local data was restored unchanged.');
    }
    DB.setSettings({
      syncAddress: addr,
      syncCode: String(code).trim(),
      lastSyncAt: new Date().toISOString()
    });
    return { stats, deviceName: body.deviceName || 'PC' };
  }

  async function exportFile() {
    await DB.flush();
    const stamp = Fmt.todayStr();
    await Platform.shareFile(`anoosh-sync-${stamp}.json`, JSON.stringify(DB.snapshot()));
  }

  async function importFile() {
    const text = await Platform.pickFile();
    if (text == null) return null;
    let incoming;
    try { incoming = JSON.parse(text); } catch (e) {
      throw new Error('That file is not readable Anoosh data.');
    }
    const before = JSON.parse(JSON.stringify(DB.snapshot()));
    const merged = Merge.merge(before, incoming);
    const stats = Merge.diffStats(before, merged);
    DB.applyMerged(merged);
    DB.setSettings({ lastSyncAt: new Date().toISOString() });
    return { stats };
  }

  return { wifiSync, exportFile, importFile, normalizeAddress };
})();
