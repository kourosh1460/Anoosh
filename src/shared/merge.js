/**
 * Anoosh sync merge engine — shared by desktop (Electron main) and mobile.
 *
 * Merges two full data snapshots so that each device ends up with the union
 * of both, resolving conflicts deterministically:
 *   - an item present on one side only is added to the other, UNLESS the
 *     other side deleted it more recently (tombstones);
 *   - an item present on both sides keeps the version with the newer
 *     updatedAt;
 *   - deletions travel via tombstones {collection, id, deletedAt}; an edit
 *     made after a deletion resurrects the item and drops the tombstone;
 *   - sessions are immutable → simple union by id;
 *   - settings are device-local and never merged;
 *   - after merging, dangling links / folder references are scrubbed.
 *
 * merge(a, b) is symmetric: same result regardless of argument order.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Merge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLLECTIONS = ['tasks', 'notes', 'folders', 'ideas', 'events', 'reminders', 'habits', 'cycle'];
  var TOMBSTONE_TTL_MS = 180 * 24 * 3600 * 1000; // forget deletions after ~6 months

  function ts(iso) {
    var t = Date.parse(iso || '');
    return isNaN(t) ? 0 : t;
  }

  /** tombstones: map "collection/id" -> deletedAt(ms), keeping the newest. */
  function tombstoneMap(snapshot) {
    var map = {};
    var list = Array.isArray(snapshot.tombstones) ? snapshot.tombstones : [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || !t.id || !t.collection) continue;
      var key = t.collection + '/' + t.id;
      var at = ts(t.deletedAt);
      if (!map[key] || at > map[key]) map[key] = at;
    }
    return map;
  }

  function mergeCollection(name, a, b, tombs, out, deadTombs) {
    var byId = {};
    var order = [];
    var sides = [a[name] || [], b[name] || []];
    for (var s = 0; s < 2; s++) {
      for (var i = 0; i < sides[s].length; i++) {
        var item = sides[s][i];
        if (!item || typeof item.id !== 'string') continue;
        var existing = byId[item.id];
        if (!existing) {
          byId[item.id] = item;
          order.push(item.id);
        } else if (ts(item.updatedAt) > ts(existing.updatedAt)) {
          byId[item.id] = item;
        }
      }
    }
    var result = [];
    for (var j = 0; j < order.length; j++) {
      var id = order[j];
      var winner = byId[id];
      var key = name + '/' + id;
      var deletedAt = tombs[key] || 0;
      if (deletedAt && deletedAt >= ts(winner.updatedAt)) {
        // deletion is the most recent action → item stays deleted
        continue;
      }
      // item survives — either never deleted, or edited after the deletion,
      // in which case the tombstone must not propagate any further.
      if (deletedAt) deadTombs[key] = true;
      result.push(winner);
    }
    out[name] = result;
  }

  /** Remove references to items that didn't survive the merge. */
  function scrub(out) {
    var alive = {};
    for (var c = 0; c < COLLECTIONS.length; c++) {
      var coll = out[COLLECTIONS[c]];
      for (var i = 0; i < coll.length; i++) alive[coll[i].id] = true;
    }
    for (c = 0; c < COLLECTIONS.length; c++) {
      coll = out[COLLECTIONS[c]];
      for (i = 0; i < coll.length; i++) {
        var item = coll[i];
        if (Array.isArray(item.links)) {
          item.links = item.links.filter(function (l) { return l && alive[l.id]; });
        }
      }
    }
    for (i = 0; i < out.notes.length; i++) {
      if (out.notes[i].folderId && !alive[out.notes[i].folderId]) out.notes[i].folderId = null;
    }
    // sessions referencing a vanished task keep working (task lookup is optional)
  }

  /**
   * Merge two snapshots. Returns a NEW snapshot: merged collections,
   * merged+pruned tombstones, union of sessions. Does NOT include settings.
   */
  function merge(a, b, nowMs) {
    var now = nowMs || Date.now();
    var tombsA = tombstoneMap(a), tombsB = tombstoneMap(b);
    var tombs = {};
    var key;
    for (key in tombsA) tombs[key] = tombsA[key];
    for (key in tombsB) if (!tombs[key] || tombsB[key] > tombs[key]) tombs[key] = tombsB[key];

    var out = { version: 2 };
    var deadTombs = {};
    for (var c = 0; c < COLLECTIONS.length; c++) {
      mergeCollection(COLLECTIONS[c], a, b, tombs, out, deadTombs);
    }

    // Keep every live tombstone (within TTL) even if neither side still has
    // the item — a third device or a later file-sync round may still need it.
    var keptTombs = [];
    for (key in tombs) {
      if (deadTombs[key]) continue;
      if (now - tombs[key] >= TOMBSTONE_TTL_MS) continue;
      var slash = key.indexOf('/');
      keptTombs.push({
        collection: key.slice(0, slash),
        id: key.slice(slash + 1),
        deletedAt: new Date(tombs[key]).toISOString()
      });
    }

    // sessions: immutable union by id
    var seen = {};
    out.sessions = [];
    var sess = (a.sessions || []).concat(b.sessions || []);
    for (var i = 0; i < sess.length; i++) {
      var s = sess[i];
      if (s && typeof s.id === 'string' && !seen[s.id]) {
        seen[s.id] = true;
        out.sessions.push(s);
      }
    }

    scrub(out);
    out.tombstones = keptTombs;
    return out;
  }

  /** Summarize what a merge changed for one side (for the sync UI). */
  function diffStats(before, merged) {
    var stats = { added: 0, updated: 0, removed: 0 };
    for (var c = 0; c < COLLECTIONS.length; c++) {
      var name = COLLECTIONS[c];
      var beforeMap = {};
      var list = before[name] || [];
      for (var i = 0; i < list.length; i++) beforeMap[list[i].id] = list[i];
      var afterList = merged[name] || [];
      var afterIds = {};
      for (i = 0; i < afterList.length; i++) {
        var item = afterList[i];
        afterIds[item.id] = true;
        var prev = beforeMap[item.id];
        if (!prev) stats.added++;
        else if (ts(item.updatedAt) > ts(prev.updatedAt)) stats.updated++;
      }
      for (var id in beforeMap) if (!afterIds[id]) stats.removed++;
    }
    return stats;
  }

  return { merge: merge, diffStats: diffStats, COLLECTIONS: COLLECTIONS };
});
