/* Pure merge for Clay Jar account sync. No network and no DOM.
   The same rules apply to bibleId "ctb" (Treasure Bible) and "cjt" (Clay Jar Translation).
   Loaded in the browser as a classic script and required by the node tests. */
(function (root) {
  'use strict';

  var BIBLE_IDS = ['cjt', 'ctb'];
  var COLORS = { yellow: 1, green: 1, blue: 1, pink: 1 };
  var SLEEP = { off: 1, '5': 1, '10': 1, '15': 1, '30': 1, '45': 1, '60': 1, '90': 1, eoc: 1, custom: 1 };

  function configEnabled(c) {
    if (!c || typeof c !== 'object') return false;
    if (c.useEmulator === true) return typeof c.projectId === 'string' && c.projectId.trim().length > 0;
    return ['apiKey', 'authDomain', 'projectId', 'appId'].every(function (k) {
      return typeof c[k] === 'string' && c[k].trim().length > 0;
    });
  }

  function clip(s, n) { return typeof s === 'string' ? s.slice(0, n) : ''; }
  function isInt(x) { return Number.isInteger(x) && x >= 0 && x < 100000; }
  function ts(x) { return typeof x === 'number' && isFinite(x) ? x : 0; }

  function cleanBookmark(b) {
    if (!b || typeof b !== 'object') return null;
    var id = clip(b.id, 40);
    if (b.deleted) {
      if (!id) return null;
      return { id: id, deleted: true, t: ts(b.t), book: clip(b.book, 80), name: clip(b.name, 80), ch: isInt(b.ch) ? b.ch : 0, v: isInt(b.v) ? b.v : 0, text: '' };
    }
    if (typeof b.book !== 'string' || !b.book || !isInt(b.ch) || !isInt(b.v)) return null;
    if (!id) id = ('b' + clip(b.book, 20) + '-' + b.ch + '-' + b.v).slice(0, 40);
    return { id: id, deleted: false, book: clip(b.book, 80), name: clip(b.name, 80), ch: b.ch, v: b.v, text: clip(b.text, 600), t: ts(b.t) };
  }

  function cleanHighlight(h) {
    if (!h || typeof h !== 'object') return null;
    var id = clip(h.id, 40);
    if (h.deleted) {
      if (!id) return null;
      return { id: id, deleted: true, t: ts(h.t), book: clip(h.book, 80), name: '', ch: 0, v: 0, s: 0, e: 0, color: '', text: '', whole: false };
    }
    if (typeof h.book !== 'string' || !h.book || !isInt(h.ch) || !isInt(h.v) || !isInt(h.s) || !isInt(h.e) || h.e <= h.s) return null;
    if (!COLORS[h.color] || typeof h.text !== 'string') return null;
    if (!id) id = ('h' + clip(h.book, 12) + '-' + h.ch + '-' + h.v + '-' + h.s).slice(0, 40);
    return {
      id: id, deleted: false, book: clip(h.book, 80), name: clip(h.name, 80),
      ch: h.ch, v: h.v, s: h.s, e: h.e, color: h.color, text: clip(h.text, 4000), whole: !!h.whole, t: ts(h.t)
    };
  }

  function cleanReading(r) {
    if (!r || typeof r.book !== 'string' || !r.book || !isInt(r.ch)) return null;
    return { book: clip(r.book, 80), name: clip(r.name, 80), ch: r.ch, v: isInt(r.v) ? r.v : 0, t: ts(r.t) };
  }

  function cleanAudio(a) {
    if (!a || typeof a.book !== 'string' || !a.book || !isInt(a.ch)) return null;
    var time = typeof a.time === 'number' && isFinite(a.time) && a.time >= 0 && a.time < 86400 ? Math.round(a.time * 10) / 10 : 0;
    return {
      book: clip(a.book, 80), name: clip(a.name, 80), ch: a.ch, v: isInt(a.v) ? a.v : 0,
      time: time, mode: a.mode === 'rec' ? 'rec' : 'tts', narr: clip(a.narr, 40), t: ts(a.t)
    };
  }

  function cleanAudioSettings(s) {
    if (!s || typeof s !== 'object') return null;
    var rate = typeof s.rate === 'number' && isFinite(s.rate) ? Math.min(2, Math.max(0.5, s.rate)) : 1;
    var custom = isInt(s.sleepCustom) && s.sleepCustom >= 1 && s.sleepCustom <= 600 ? s.sleepCustom : 20;
    var choice = SLEEP[String(s.sleepChoice)] ? String(s.sleepChoice) : 'off';
    return {
      rate: rate, voice: clip(s.voice, 200), voiceName: clip(s.voiceName, 80),
      autoNext: s.autoNext !== false, narr: clip(s.narr, 40),
      sleepChoice: choice, sleepCustom: custom, t: ts(s.t)
    };
  }

  function expand(list, tombs, clean) {
    var out = [];
    (list || []).forEach(function (item) {
      var c = clean(item);
      if (c) out.push(c);
    });
    if (tombs) Object.keys(tombs).forEach(function (id) {
      var c = clean({ id: id, deleted: true, t: tombs[id] });
      if (c) out.push(c);
    });
    return out;
  }

  /* One row per id: the greater timestamp wins. A tie prefers an explicit delete. */
  function mergeById(items, dedupeKey) {
    var map = new Map();
    items.forEach(function (item) {
      if (!item || !item.id) return;
      var prev = map.get(item.id);
      if (!prev || item.t > prev.t || (item.t === prev.t && item.deleted && !prev.deleted)) map.set(item.id, item);
    });
    var tombs = {};
    var live = [];
    map.forEach(function (item) {
      if (item.deleted) tombs[item.id] = item.t;
      else live.push(item);
    });
    if (dedupeKey) {
      var best = new Map();
      live.forEach(function (item) {
        var key = dedupeKey(item);
        var prev = best.get(key);
        if (!prev || item.t > prev.t || (item.t === prev.t && item.id > prev.id)) best.set(key, item);
      });
      var keep = new Set();
      best.forEach(function (item) { keep.add(item.id); });
      live.forEach(function (item) {
        if (!keep.has(item.id)) {
          var winner = best.get(dedupeKey(item));
          tombs[item.id] = Math.max(item.t, winner ? winner.t : 0);
        }
      });
      live = live.filter(function (item) { return keep.has(item.id); });
    }
    return { live: live, tombs: tombs };
  }

  /* Equal timestamps keep the first argument so two devices do not bounce a value. */
  function pickNewer(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return ts(b.t) > ts(a.t) ? b : a;
  }

  function mergeSnapshots(local, remote) {
    local = local || {};
    remote = remote || {};
    var localTombs = local.tombs || {};
    var bm = mergeById(
      expand(local.bookmarks, localTombs.bm, cleanBookmark).concat(expand(remote.bookmarks, null, cleanBookmark)),
      function (b) { return b.book + '\n' + b.ch + '\n' + b.v; }
    );
    var hl = mergeById(
      expand(local.highlights, localTombs.hl, cleanHighlight).concat(expand(remote.highlights, null, cleanHighlight)),
      function (h) { return h.book + '\n' + h.ch + '\n' + h.v + '\n' + h.s + '\n' + h.e + '\n' + h.color; }
    );
    return {
      bookmarks: bm.live,
      highlights: hl.live,
      tombs: { bm: bm.tombs, hl: hl.tombs },
      reading: pickNewer(cleanReading(local.reading), cleanReading(remote.reading)),
      audio: pickNewer(cleanAudio(local.audio), cleanAudio(remote.audio)),
      audioSettings: pickNewer(cleanAudioSettings(local.audioSettings), cleanAudioSettings(remote.audioSettings))
    };
  }

  /* A different person signing in on this device must not receive the previous person's on-device progress. */
  function localForAccount(ownerId, uid, local) {
    if (ownerId && uid && ownerId !== uid) {
      return { bookmarks: [], highlights: [], tombs: { bm: {}, hl: {} }, reading: null, audio: null, audioSettings: null };
    }
    return local || { bookmarks: [], highlights: [], tombs: { bm: {}, hl: {} }, reading: null, audio: null, audioSettings: null };
  }

  root.ClayJarSync = {
    BIBLE_IDS: BIBLE_IDS,
    configEnabled: configEnabled,
    cleanBookmark: cleanBookmark,
    cleanHighlight: cleanHighlight,
    cleanReading: cleanReading,
    cleanAudio: cleanAudio,
    cleanAudioSettings: cleanAudioSettings,
    mergeSnapshots: mergeSnapshots,
    localForAccount: localForAccount
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') {
  module.exports = globalThis.ClayJarSync;
}
