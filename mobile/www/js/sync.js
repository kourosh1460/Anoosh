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

    const before = JSON.parse(JSON.stringify(DB.snapshot()));
    let res;
    try {
      res = await fetch(`http://${addr}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Anoosh-Code': String(code).trim() },
        body: JSON.stringify({ deviceName: 'Android phone', data: before })
      });
    } catch (err) {
      throw new Error('Could not reach the PC. Same Wi-Fi network? Sync started on the desktop?');
    }
    let body;
    try { body = await res.json(); } catch (e) { body = {}; }
    if (res.status === 403) throw new Error(body.error || 'Wrong code.');
    if (!res.ok || !body.ok || !body.data) throw new Error(body.error || 'Sync failed on the PC side.');

    const stats = Merge.diffStats(before, body.data);
    DB.applyMerged(body.data);
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
