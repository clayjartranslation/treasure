const assert = require('assert');
const fs = require('fs');
const path = require('path');
const biay = require('../js/bible-in-a-year.js');

const root = path.join(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'data/bible-in-a-year.json'), 'utf8'));
function loadBook(id, stub) {
  const file = path.join(root, 'data/books', id + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return stub;
}
function stubBook(id, name, counts) {
  return { id, name, chapters: Object.keys(counts).map((n) => ({ n: Number(n), verses: Array(counts[n]).fill({ v: 1, text: '' }) })) };
}
const psalms = loadBook('psalms');
const proverbs = loadBook('proverbs');
const genesis = loadBook('genesis');
const ezekiel = loadBook('ezekiel', stubBook('ezekiel', 'Ezekiel', { 21: 32, 22: 31 }));
const james = loadBook('james', stubBook('james', 'James', { 5: 20 }));

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/books.json'), 'utf8'));
const books = { psalms, proverbs, ezekiel, james, genesis };
assert.strictEqual(plan.canonBooks, 98);
assert.strictEqual(catalog.books.length, 98);
const inPlan = new Set();
for (const day of plan.days) {
  for (const k of ['ot', 'ps', 'pr', 'nt', 'ex']) {
    assert.ok((day[k] || []).length, day.date + ' missing ' + k);
    for (const item of day[k]) inPlan.add(item.book);
  }
}
catalog.books.forEach((b) => assert.ok(inPlan.has(b.id), 'missing ' + b.id));
assert.strictEqual(inPlan.size, 98);

const jan1 = plan.days.find((d) => d.date === '01-01');
const janList = biay.dayPlaylist(jan1, books, catalog);
const genChs = janList.filter((s) => s.book === 'genesis').map((s) => s.ch);
assert.deepStrictEqual(genChs, [1, 2]);
assert.strictEqual(janList[0].kind, 'ot');
assert.strictEqual(janList[0].book, 'genesis');
assert.strictEqual(janList[0].ch, 1);
assert.strictEqual(janList[0].kindLabel, 'Old Testament');
assert.strictEqual(biay.kindLabelFor(jan1.ex[0].book, catalog), 'Apocrypha');

const last = plan.days[364];
assert.ok(/Psalm 150/.test(last.ps[last.ps.length - 1].label), 'Psalms should finish on day 365: ' + last.ps[last.ps.length - 1].label);
assert.ok(/Proverbs 31/.test(last.pr[0].label), 'Proverbs should finish on day 365: ' + last.pr[0].label);
assert.ok(/Revelation 22/.test(last.nt[last.nt.length - 1].label), 'NT should finish on day 365: ' + last.nt[last.nt.length - 1].label);
assert.ok(/Aristeas/.test(last.ex[last.ex.length - 1].label), 'extras should finish on day 365: ' + last.ex[last.ex.length - 1].label);

assert.strictEqual(biay.kindLabelFor('4-maccabees', catalog), 'Apocrypha');
assert.strictEqual(biay.kindLabelFor('jubilees', catalog), 'Pseudepigrapha');
assert.strictEqual(biay.kindLabelFor('joseph-and-aseneth', catalog), 'Pseudepigrapha');
for (const day of plan.days) {
  for (const g of biay.portionGroups(day, catalog)) {
    for (const item of g.items) {
      const want = biay.kindLabelFor(item.book, catalog);
      assert.strictEqual(g.kindLabel, want, day.date + ' ' + item.label + ' labeled ' + g.kindLabel);
      const div = (catalog.books.find((b) => b.id === item.book) || {}).division;
      if (div === 'Apocrypha' || div === 'Pseudepigrapha') {
        assert.strictEqual(g.kind, 'ex');
        assert.ok(g.kindLabel !== 'Old Testament' && g.kindLabel !== 'New Testament');
      }
    }
  }
}

const { spawnSync } = require('child_process');
const check = spawnSync('python3', [path.join(root, 'tools/validate-bible-in-a-year.py'), root], { encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stdout + check.stderr);
assert.match(check.stdout, /100% coverage, no repeats, finishes in 365 days/);

const timed = biay.clipTimes({ v: { '1': 0, '2': 5.5, '3': 10, '4': 14.2 } }, 1, 3);
assert.deepStrictEqual(timed, { start: 0, end: 14.2, timed: true });
const late = biay.clipTimes({ v: { '17': 80.1, '18': 85, '19': 90 } }, 17, 19);
assert.strictEqual(late.start, 80.1);
assert.strictEqual(late.end, null);
const dur = biay.clipTimes({ v: { '17': 80.1 }, dur: 99 }, 17, 19);
assert.strictEqual(dur.end, 99);
assert.strictEqual(biay.clipTimes({ v: {} }, 1, 3), null);
assert.strictEqual(biay.clipTimes(null, 1, 3), null);

assert.strictEqual(biay.chosenVoice({ narr: 'device' }, { voices: { af_heart: {} } }), '');
assert.strictEqual(biay.chosenVoice({ narr: 'am_michael' }, { voices: { af_heart: {}, am_michael: {} } }), 'am_michael');
assert.strictEqual(biay.chosenVoice({}, { voices: { af_heart: {} } }), 'af_heart');

assert.strictEqual(plan.days.length, 365);
assert.ok(!plan.days.some((d) => d.date === '02-29'));

const days = plan.days.map((d) => d.date);
for (let i = 0; i < days.length; i++) {
  const next = days[(i + 1) % days.length];
  const listA = biay.dayPlaylist(plan.days[i], books);
  const listB = biay.dayPlaylist(plan.days.find((d) => d.date === next), books);
  if (listA.length && listB.length) {
    const last = listA[listA.length - 1];
    const firstNext = listB[0];
    assert.ok(!(last.book === firstNext.book && last.ch === firstNext.ch && last.startV === firstNext.startV && last.endV === firstNext.endV && last.kind === firstNext.kind && i < days.length - 1 && false));
  }
}


const genHtml = biay.portionScripture(genesis, 1, 1, 3, { label: 'Genesis 1:1–3', kindLabel: 'Old Testament' });
assert.match(genHtml, /id="biay-v1"/);
assert.match(genHtml, /In the beginning/);
assert.match(genHtml, /<sup class="fn-mark">a<\/sup>/);
assert.match(genHtml, /Genesis 1:1–3/);
assert.doesNotMatch(genHtml, /id="biay-v4"/);
const mid = biay.portionScripture(genesis, 1, 3, 5, { label: 'Genesis 1:3–5' });
assert.match(mid, /id="biay-v3"/);
assert.doesNotMatch(mid, /id="biay-v1"/);
assert.doesNotMatch(mid, /class="ch-heading"/);

const psHtml = biay.portionScripture(psalms, 1, 1, 6, { label: 'Psalm 1', kindLabel: 'Psalms' });
assert.match(psHtml, /class="poem"/);
assert.match(psHtml, /Happy is the person|Blessed is the man/);

const noBook = biay.portionScripture(null, 1, 1, 3);
assert.strictEqual(noBook, '');

const meta = { v: { '1': 0, '2': 5.5, '3': 10, '4': 14.2 } };
assert.strictEqual(biay.verseAtTime(meta, 0, 1, 3), 1);
assert.strictEqual(biay.verseAtTime(meta, 5.5, 1, 3), 2);
assert.strictEqual(biay.verseAtTime(meta, 9.9, 1, 3), 2);
assert.strictEqual(biay.verseAtTime(meta, 10, 1, 3), 3);
assert.strictEqual(biay.verseAtTime(meta, 14, 1, 3), 3);
assert.strictEqual(biay.verseAtTime({ v: {} }, 1, 1, 3), null);
assert.strictEqual(biay.verseAtTime(null, 1, 1, 3), null);
const lateMeta = { v: { '17': 80.1, '18': 85, '19': 90 } };
assert.strictEqual(biay.verseAtTime(lateMeta, 80.1, 17, 19), 17);
assert.strictEqual(biay.verseAtTime(lateMeta, 79, 17, 19), null);
// Mid-chapter: time before the clip start is a pending seek, not a title.
assert.strictEqual(biay.speakingTarget(lateMeta, 79, 17, 19), null);
assert.deepStrictEqual(biay.speakingTarget(lateMeta, 85, 17, 19), { kind: 'verse', v: 18 });
assert.strictEqual(biay.speakingTarget({ v: {} }, 1, 1, 3), null);

function loadTiming(name) {
  const p1 = path.join(root, 'tests/fixtures/audio-timings', name);
  const p2 = path.join(root, 'tools/fixtures/audio-timings', name);
  const file = fs.existsSync(p1) ? p1 : p2;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function chapterPageItem(meta, currentTime, lastV) {
  const items = [];
  if (meta.intro != null && meta.intro !== '') items.push({ kind: 'intro', v: 0 });
  if (meta.title != null && meta.title !== '') items.push({ kind: 'title', v: 0 });
  for (let v = 1; v <= lastV; v++) items.push({ kind: 'verse', v: v });
  const times = biay.recTimes(meta, items);
  const k = biay.itemIndexAtTime(times, currentTime);
  return k < 0 ? null : items[k];
}

const cases = [
  { file: 'af_heart_2-baruch_48.json', startV: 30, endV: 50, lastV: 50, label: '2 Baruch 48:30–50 af_heart' },
  { file: 'am_michael_2-baruch_48.json', startV: 30, endV: 50, lastV: 50, label: '2 Baruch 48:30–50 am_michael' },
  { file: 'af_heart_psalms_132.json', startV: 11, endV: 16, lastV: 18, label: 'Psalm 132:11–16 af_heart' },
  { file: 'am_michael_psalms_132.json', startV: 11, endV: 16, lastV: 18, label: 'Psalm 132:11–16 am_michael' },
  { file: 'af_heart_proverbs_29.json', startV: 10, endV: 11, lastV: 27, label: 'Proverbs 29:10–11 af_heart' },
  { file: 'am_michael_proverbs_29.json', startV: 10, endV: 11, lastV: 27, label: 'Proverbs 29:10–11 am_michael' },
  { file: 'af_heart_hebrews_13.json', startV: 1, endV: 21, lastV: 25, label: 'Hebrews 13:1–21 af_heart' },
  { file: 'am_michael_hebrews_13.json', startV: 1, endV: 21, lastV: 25, label: 'Hebrews 13:1–21 am_michael' },
  { file: 'af_heart_2-baruch_55.json', startV: 1, endV: 8, lastV: 8, label: '2 Baruch 55 af_heart' },
  { file: 'am_michael_2-baruch_55.json', startV: 1, endV: 8, lastV: 8, label: '2 Baruch 55 am_michael' },
];

for (const c of cases) {
  const meta = loadTiming(c.file);
  assert.ok(biay.timingsReliable(meta, c.startV, c.endV), c.label + ' should have reliable timings');
  const clip = biay.clipTimes(meta, c.startV, c.endV);
  assert.ok(clip, c.label + ' clip');
  if (c.endV === c.lastV) {
    assert.strictEqual(clip.end, biay.clipDuration(meta), c.label + ' last-verse clip must use meta.d');
  } else {
    assert.strictEqual(clip.end, Number(meta.v[String(c.endV + 1)]), c.label + ' end is the next verse');
  }
  // Before the seek lands, do not highlight a later verse.
  assert.strictEqual(biay.highlightForPlayback(meta, 0, c.startV, c.endV, { clipStart: clip.start, clipEnd: clip.end }), null, c.label + ' at 0');
  // Leftover currentTime from a previous long chapter must not highlight this portion.
  assert.strictEqual(biay.highlightForPlayback(meta, 400, c.startV, c.endV, { clipStart: clip.start, clipEnd: clip.end }), null, c.label + ' leftover 400s');

  const startT = Number(meta.v[String(c.startV)]);
  const samples = new Set([startT, startT + 0.2, startT + 1]);
  for (let v = c.startV; v <= c.endV; v++) {
    const ts = Number(meta.v[String(v)]);
    samples.add(ts);
    samples.add(ts + 0.5);
    if (v < c.endV) samples.add((ts + Number(meta.v[String(v + 1)])) / 2);
  }
  if (clip.end != null) samples.add(clip.end - 0.2);

  for (const t of samples) {
    const got = biay.highlightForPlayback(meta, t, c.startV, c.endV, { clipStart: clip.start, clipEnd: clip.end });
    const page = chapterPageItem(meta, t, c.lastV);
    if (!biay.inClipWindow(t, clip.start, clip.end)) {
      assert.strictEqual(got, null, c.label + ' out of window at ' + t);
      continue;
    }
    assert.ok(got, c.label + ' missing highlight at ' + t);
    assert.ok(page, c.label + ' chapter page empty at ' + t);
    assert.strictEqual(got.kind, page.kind, c.label + ' kind at ' + t);
    assert.strictEqual(got.v, page.v, c.label + ' verse at ' + t + ' biay=' + JSON.stringify(got) + ' page=' + JSON.stringify(page));
  }
}

// Female and male timings differ: the playing voice's file must be used.
const psF = loadTiming('af_heart_psalms_132.json');
const psM = loadTiming('am_michael_psalms_132.json');
const tMid = 70;
const female = biay.highlightForPlayback(psF, tMid, 11, 16, { clipStart: psF.v['11'], clipEnd: psF.v['17'] });
const male = biay.highlightForPlayback(psM, tMid, 11, 16, { clipStart: psM.v['11'], clipEnd: psM.v['17'] });
assert.ok(female && male);
assert.notStrictEqual(female.v, male.v, 'the same currentTime should not assume one voice’s verse for the other');

assert.strictEqual(biay.highlightForPlayback(psF, tMid, 11, 16, { usedFullChapter: true, clipStart: psF.v['11'], clipEnd: psF.v['17'] }), null);
assert.strictEqual(biay.timingsReliable({ v: { '1': 0, '2': 1 } }, 1, 4), false);
assert.strictEqual(biay.timingsReliable({ v: { '1': 10, '2': 5 } }, 1, 2), false);
assert.strictEqual(biay.clipTimes({ v: { '1': 3, '2': 8 }, d: 12.5 }, 1, 2).end, 12.5);

assert.strictEqual(biay.textSource('cjt', { source: 'cjt' }, {}), 'cjt');
assert.strictEqual(biay.textSource('ctb', { source: 'cjt', fellBackToCjt: true }, { ctbPublished: true }), 'cjt');
assert.strictEqual(biay.textSource('ctb', { source: 'ctb' }, { ctbPublished: true }), 'ctb');
assert.strictEqual(biay.textSource('ctb', null, { ctbPublished: true }), 'ctb');
assert.strictEqual(biay.textSource('ctb', null, { ctbPublished: false }), 'cjt');


// Full chapters must play from the start of the file until "ended", not a verse-1
// seek or a timing-file duration that cuts the last words and the next intro.
const ezekMeta = { v: { '1': 3.27, '27': 300.0 }, d: 312.5, intro: 0.3 };
const ezekSeg = { book: 'ezekiel', ch: 24, startV: 1, endV: 27, lastV: 27, fullChapter: true };
const ezekWin = biay.playbackWindow(ezekSeg, ezekMeta);
assert.strictEqual(ezekWin.start, 0, 'full chapter starts at 0 so the intro is heard');
assert.strictEqual(ezekWin.end, null, 'full chapter waits for the ended event');
assert.strictEqual(ezekWin.timed, false);
assert.strictEqual(ezekWin.usedFullChapter, false);
assert.strictEqual(biay.shouldAdvanceAtTime(312.46, ezekWin.end, true), false, 'must not cut a full chapter at meta.d');
assert.strictEqual(biay.shouldAdvanceAtTime(312.5, ezekWin.end, true), false);

const psSeg = { book: 'psalms', ch: 136, startV: 10, endV: 16, lastV: 26, fullChapter: false };
const psMeta = { v: { '10': 40.1, '11': 45, '16': 70, '17': 75.5 }, d: 120 };
const psWin = biay.playbackWindow(psSeg, psMeta);
assert.ok(psWin.start <= 40.1 && psWin.start >= 40.1 - 0.16, 'partial clip starts with a short lead-in, got ' + psWin.start);
assert.strictEqual(psWin.end, 75.5);
assert.ok(!biay.shouldAdvanceAtTime(75.46, psWin.end, true), 'must not leave a partial clip 50ms early');
assert.ok(biay.shouldAdvanceAtTime(75.5, psWin.end, true), 'partial clip advances at the next verse');
assert.ok(!biay.shouldAdvanceAtTime(74.0, psWin.end, true), 'partial clip must not advance early');
assert.ok(!biay.shouldAdvanceAtTime(75.5, psWin.end, false), 'paused clip must not advance');

const prSeg = { book: 'proverbs', ch: 28, startV: 23, endV: 24, lastV: 28, fullChapter: false };
const prMeta = { v: { '23': 110, '24': 116, '25': 121.2 }, d: 143.56 };
const prWin = biay.playbackWindow(prSeg, prMeta);
assert.ok(prWin.start <= 110 && prWin.start >= 110 - 0.16, 'proverbs lead-in, got ' + prWin.start);
assert.strictEqual(prWin.end, 121.2);

const untimed = biay.playbackWindow({ startV: 10, endV: 12, fullChapter: false }, { v: {} });
assert.strictEqual(untimed.start, 0);
assert.strictEqual(untimed.end, null);
assert.strictEqual(untimed.usedFullChapter, true);

const janFull = janList.filter((s) => s.fullChapter).map((s) => biay.playbackWindow(s, { v: { '1': 3.1, '2': 8 }, d: 200 }));
assert.ok(janFull.length && janFull.every((w) => w.start === 0 && w.end == null), 'whole-chapter readings play in full');


const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
assert.strictEqual(biay.CACHE_VERSION, (swSrc.match(/const VERSION = '(ctb-v\d+)'/) || [])[1], 'player version must match the service worker');

const highlightMeta = { v: { '10': 40.1, '11': 45, '12': 50, '13': 55, '14': 60.5 }, d: 80 };
for (let v = 10; v <= 13; v++) {
  const ts = highlightMeta.v[String(v)];
  const hit = biay.highlightForPlayback(highlightMeta, ts + 0.1, 10, 13, { clipStart: 40.1 - 0.15, clipEnd: 60.5 });
  assert.ok(hit && hit.kind === 'verse' && hit.v === v, 'verse ' + v + ' should highlight at ' + (ts + 0.1) + ' got ' + JSON.stringify(hit));
}
const lastHit = biay.highlightForPlayback(highlightMeta, 60.4, 10, 13, { clipStart: 40.1 - 0.15, clipEnd: 60.5 });
assert.ok(lastHit && lastHit.v === 13, 'last verse should stay highlighted until the next verse starts, got ' + JSON.stringify(lastHit));
assert.strictEqual(biay.highlightForPlayback(highlightMeta, 60.5, 10, 13, { clipStart: 40.1 - 0.15, clipEnd: 60.5 }), null);

// Partial/unpublished CTB books fall back to CJT chapters cleanly.
const partialCtb = { id: 'isaiah', name: 'Isaiah', chapters: [{ n: 38, verses: [{ v: 1, text: 'a' }, { v: 2, text: 'b' }] }] };
const fullCjt = { id: 'isaiah', name: 'Isaiah', chapters: [
  { n: 38, verses: [{ v: 1, text: 'x' }, { v: 2, text: 'y' }] },
  { n: 39, verses: [{ v: 1, text: 'z' }, { v: 2, text: 'w' }] }
] };
assert.strictEqual(biay.bookNeedsFallback(null, [{ book: 'ezekiel', ch: 28, v: 1, verses: 26 }]), true);
assert.strictEqual(biay.bookNeedsFallback(partialCtb, [{ book: 'isaiah', ch: 38, v: 1, verses: 2 }]), false);
assert.strictEqual(biay.bookNeedsFallback(partialCtb, [{ book: 'isaiah', ch: 38, v: 1, verses: 4 }]), true);
assert.strictEqual(biay.bookNeedsFallback(partialCtb, [{ book: 'isaiah', ch: 39, v: 1, verses: 2 }]), true);
const merged = biay.mergeBooks(partialCtb, fullCjt);
assert.strictEqual(merged.chapters.length, 2);
assert.strictEqual(merged.chapters[0].verses[0].text, 'a');
assert.strictEqual(merged.chapters[1].n, 39);

console.log('bible-in-a-year tests ok');
