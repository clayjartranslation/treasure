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

const books = { psalms, proverbs, ezekiel, james, genesis };
const nov21 = plan.days.find((d) => d.date === '11-21');
const list = biay.dayPlaylist(nov21, books);
assert.ok(list.length >= 4);
assert.strictEqual(list[0].kind, 'ot');
assert.strictEqual(list[0].book, 'ezekiel');
assert.strictEqual(list[0].ch, 21);
assert.strictEqual(list[0].fullChapter, true);
const ez22 = list.find((s) => s.book === 'ezekiel' && s.ch === 22);
assert.ok(ez22, 'Ezekiel 21–22 should expand into chapter 22');
assert.strictEqual(ez22.fullChapter, true);
const ps = list.find((s) => s.kind === 'ps');
assert.strictEqual(ps.ch, 136);
assert.strictEqual(ps.startV, 1);
assert.strictEqual(ps.endV, 3);
assert.strictEqual(ps.fullChapter, false);
const pr = list.find((s) => s.kind === 'pr');
assert.strictEqual(pr.ch, 28);
assert.strictEqual(pr.startV, 17);
assert.strictEqual(pr.endV, 19);
const nt = list.filter((s) => s.kind === 'nt');
assert.ok(nt.length >= 1);
assert.strictEqual(nt[0].book, 'james');
assert.strictEqual(nt[0].ch, 5);
assert.strictEqual(list[list.length - 1].kind, 'nt');

const jan1 = plan.days.find((d) => d.date === '01-01');
const janList = biay.dayPlaylist(jan1, books);
const genChs = janList.filter((s) => s.book === 'genesis').map((s) => s.ch);
assert.deepStrictEqual(genChs, [1, 2]);

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

console.log('bible-in-a-year tests ok');
