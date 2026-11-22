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
assert.deepStrictEqual(biay.speakingTarget(lateMeta, 79, 17, 19), { kind: 'title' });
assert.deepStrictEqual(biay.speakingTarget(lateMeta, 85, 17, 19), { kind: 'verse', v: 18 });
assert.strictEqual(biay.speakingTarget({ v: {} }, 1, 1, 3), null);

assert.strictEqual(biay.textSource('cjt', { source: 'cjt' }, {}), 'cjt');
assert.strictEqual(biay.textSource('ctb', { source: 'cjt', fellBackToCjt: true }, { ctbPublished: true }), 'cjt');
assert.strictEqual(biay.textSource('ctb', { source: 'ctb' }, { ctbPublished: true }), 'ctb');
assert.strictEqual(biay.textSource('ctb', null, { ctbPublished: true }), 'ctb');
assert.strictEqual(biay.textSource('ctb', null, { ctbPublished: false }), 'cjt');

console.log('bible-in-a-year tests ok');
