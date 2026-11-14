/* Merge rules for the shared Clay Jar account. No network. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Sync = require('../js/sync-merge.js');

const cfgSrc = fs.readFileSync(path.join(__dirname, '../js/firebase-config.js'), 'utf8');
assert(/apiKey: 'AIza[A-Za-z0-9_-]+'/.test(cfgSrc), 'committed config should include the public web API key so sign-in can turn on');
assert(cfgSrc.includes("projectId: 'clayjar-treasure'"), 'Treasure uses the clayjar-treasure project');
assert(cfgSrc.includes("authDomain: 'clayjar-treasure.firebaseapp.com'"));
assert(cfgSrc.includes("bibleId: 'ctb'"));
assert(cfgSrc.includes('apple: false'));
assert(cfgSrc.includes('phone: false'));
assert(cfgSrc.includes('useEmulator: false'));
assert.strictEqual(Sync.configEnabled({ apiKey: '', authDomain: '', projectId: '', appId: '' }), false);
assert.strictEqual(Sync.configEnabled({}), false);
assert.strictEqual(Sync.configEnabled({ apiKey: 'k', authDomain: 'a.firebaseapp.com', projectId: 'p', appId: 'app' }), true);
assert.strictEqual(Sync.configEnabled({ useEmulator: true, projectId: 'demo-clayjar' }), true);
assert.strictEqual(Sync.configEnabled({ useEmulator: true, projectId: '' }), false);
assert.deepStrictEqual(Sync.BIBLE_IDS, ['cjt', 'ctb']);

const bm = (id, v, t, extra) => Object.assign({ id, book: 'genesis', name: 'Genesis', ch: 1, v, text: 'words', t }, extra);
const hl = (id, s, e, color, t) => ({ id, book: 'genesis', name: 'Genesis', ch: 1, v: 1, s, e, color, text: 'words', whole: false, t });

// Union: both devices keep their own bookmarks.
let merged = Sync.mergeSnapshots(
  { bookmarks: [bm('a', 1, 10)], highlights: [], tombs: { bm: {}, hl: {} } },
  { bookmarks: [bm('b', 2, 20)], highlights: [hl('h1', 0, 4, 'yellow', 5)] }
);
assert.deepStrictEqual(merged.bookmarks.map((b) => b.id).sort(), ['a', 'b']);
assert.strictEqual(merged.highlights.length, 1);
assert.strictEqual(merged.highlights[0].color, 'yellow');

// Same verse, newer bookmark wins and the older id is a tombstone.
merged = Sync.mergeSnapshots(
  { bookmarks: [bm('local', 3, 10)], highlights: [] },
  { bookmarks: [bm('cloud', 3, 50, { text: 'newer' })] }
);
assert.strictEqual(merged.bookmarks.length, 1);
assert.strictEqual(merged.bookmarks[0].id, 'cloud');
assert.ok(merged.tombs.bm.local >= 50);

// A newer delete beats an older copy. An older delete does not beat a newer copy.
merged = Sync.mergeSnapshots(
  { bookmarks: [bm('a', 1, 10)], highlights: [], tombs: { bm: {}, hl: {} } },
  { bookmarks: [{ id: 'a', deleted: true, t: 30 }] }
);
assert.strictEqual(merged.bookmarks.length, 0);
assert.strictEqual(merged.tombs.bm.a, 30);

merged = Sync.mergeSnapshots(
  { bookmarks: [bm('a', 1, 40)], highlights: [] },
  { bookmarks: [{ id: 'a', deleted: true, t: 10 }] }
);
assert.strictEqual(merged.bookmarks.length, 1);
assert.strictEqual(merged.bookmarks[0].t, 40);

// Highlight color: newer edit wins. Identical range and color collapse to one.
merged = Sync.mergeSnapshots(
  { highlights: [hl('h', 0, 4, 'yellow', 10)] },
  { highlights: [hl('h', 0, 4, 'blue', 20)] }
);
assert.strictEqual(merged.highlights.length, 1);
assert.strictEqual(merged.highlights[0].color, 'blue');

merged = Sync.mergeSnapshots(
  { highlights: [hl('h1', 0, 4, 'green', 10)] },
  { highlights: [hl('h2', 0, 4, 'green', 15)] }
);
assert.strictEqual(merged.highlights.length, 1);
assert.strictEqual(merged.highlights[0].id, 'h2');
assert.ok(merged.tombs.hl.h1);

// Reading and listening: newer timestamp wins. A tie keeps the local side.
merged = Sync.mergeSnapshots(
  { reading: { book: 'genesis', name: 'Genesis', ch: 1, v: 2, t: 10 }, audio: { book: 'genesis', name: 'Genesis', ch: 1, v: 4, time: 12.2, mode: 'rec', narr: 'af_heart', t: 10 } },
  { reading: { book: 'psalms', name: 'Psalms', ch: 23, v: 1, t: 99 }, audioSettings: { rate: 1.25, voice: '', autoNext: true, narr: 'drama_f', sleepChoice: '30', sleepCustom: 20, t: 5 } }
);
assert.strictEqual(merged.reading.book, 'psalms');
assert.strictEqual(merged.audio.time, 12.2);
assert.strictEqual(merged.audioSettings.rate, 1.25);
assert.strictEqual(merged.audioSettings.narr, 'drama_f');

merged = Sync.mergeSnapshots(
  { reading: { book: 'genesis', name: 'Genesis', ch: 1, v: 1, t: 5 } },
  { reading: { book: 'psalms', name: 'Psalms', ch: 1, v: 1, t: 5 } }
);
assert.strictEqual(merged.reading.book, 'genesis');

// A place with no timestamp yields to a stamped one. Junk is dropped.
merged = Sync.mergeSnapshots(
  { reading: { book: 'genesis', ch: 1, v: 8 }, bookmarks: [{ book: '', ch: 1, v: 1 }, { nope: true }], highlights: [{ book: 'genesis', ch: 1, v: 1, s: 0, e: 3, color: 'orange', text: 'x', t: 1 }] },
  { reading: { book: 'job', name: 'Job', ch: 2, v: 3, t: 1 } }
);
assert.strictEqual(merged.reading.book, 'job');
assert.strictEqual(merged.bookmarks.length, 0);
assert.strictEqual(merged.highlights.length, 0);

// Sleep choice and rate are clamped.
const settings = Sync.cleanAudioSettings({ rate: 9, sleepChoice: 'nope', sleepCustom: 9999, autoNext: false, t: 3 });
assert.strictEqual(settings.rate, 2);
assert.strictEqual(settings.sleepChoice, 'off');
assert.strictEqual(settings.sleepCustom, 20);
assert.strictEqual(settings.autoNext, false);

// A different account on this device must not receive the previous person's local progress.
const wiped = Sync.localForAccount('user-a', 'user-b', { bookmarks: [bm('a', 1, 1)], reading: { book: 'genesis', ch: 1, v: 1, t: 1 } });
assert.deepStrictEqual(wiped.bookmarks, []);
assert.strictEqual(wiped.reading, null);
const kept = Sync.localForAccount('user-a', 'user-a', { bookmarks: [bm('a', 1, 1)] });
assert.strictEqual(kept.bookmarks.length, 1);
const first = Sync.localForAccount('', 'user-a', { bookmarks: [bm('a', 1, 1)] });
assert.strictEqual(first.bookmarks.length, 1);

const file = Sync.backupToSnapshot({
  format: 'ctb-saved', version: 2, exportedAt: '2026-01-02T00:00:00.000Z',
  bookmarks: [bm('file', 4, 10)], highlights: [hl('hf', 0, 3, 'pink', 10)],
  lastRead: { book: 'job', name: 'Job', ch: 1, v: 2, t: 50 },
  audio: { book: 'job', name: 'Job', ch: 1, v: 2, time: 4, mode: 'rec', narr: '', t: 50 },
  settings: { rate: 1.25, voice: '', autoNext: true, narr: '', sleepChoice: 'off', sleepCustom: 20, audioSettingsT: 50, theme: 'dark' }
});
assert.ok(!file.error);
const mergedFile = Sync.mergeSnapshots(
  { bookmarks: [bm('local', 1, 5)], highlights: [], reading: { book: 'genesis', name: 'Genesis', ch: 1, v: 1, t: 100 }, audioSettings: { rate: 1, voice: '', autoNext: true, narr: '', sleepChoice: 'off', sleepCustom: 20, t: 100 } },
  file.snapshot
);
assert.deepStrictEqual(mergedFile.bookmarks.map((b) => b.id).sort(), ['file', 'local']);
assert.strictEqual(mergedFile.reading.book, 'genesis');
assert.strictEqual(mergedFile.audioSettings.rate, 1);
assert.strictEqual(file.settings.theme, 'dark');
assert.ok(Sync.backupToSnapshot({ format: 'nope' }).error);
assert.strictEqual(Sync.cleanBookmark({ book: '<script>', ch: 1, v: 1, text: 'x', t: 1 }), null);
assert.ok(Sync.backupToSnapshot({ format: 'ctb-saved', bookmarks: ['nope'], highlights: [] }).error);
assert.ok(Sync.backupToSnapshot({
  format: 'ctb-saved',
  bookmarks: Array.from({ length: 5001 }, (_, i) => bm('b' + i, 1, 1)),
  highlights: []
}).error);
const keptText = Sync.cleanBookmark({ id: 'b1', book: 'genesis', name: 'Genesis', ch: 1, v: 1, text: '<img src=x onerror=alert(1)>', t: 1 });
assert.ok(keptText.text.includes('<img'));

console.log('sync-merge: ok');
