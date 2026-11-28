/* Find-verses search: keyword match, topic expansion, and coverage of every chapter.
   No network. The search reads the chapter files directly, so there is no separate index to go stale.
   A new chapter in data/books is included here automatically; if a catalog chapter has no text, this fails. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Find = require('../js/find-verses.js');

const root = path.join(__dirname, '..');
const STOP = {};
'that this with from have they their there were which would about because shall into your when them then than some'.split(' ').forEach((w) => { STOP[w] = 1; });

function loadCorpus() {
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'data/books.json'), 'utf8'));
  const books = [];
  cat.books.forEach((meta) => {
    if (!meta.file) return;
    const book = JSON.parse(fs.readFileSync(path.join(root, meta.file), 'utf8'));
    book.translated = meta.translated || [];
    books.push(book);
  });
  return books;
}

function probeWord(ch) {
  let best = '';
  (ch.verses || []).forEach((v) => {
    Find.fold(Find.plain(v.text)).split(/[^a-z0-9']+/).forEach((w) => {
      if (w.length > best.length && w.length >= 4 && !STOP[w]) best = w;
    });
  });
  return best;
}

function refOf(h) {
  return h.e.name + ' ' + h.e.ch + ':' + h.e.v + ' (' + h.score + (h.related ? ' related:' + h.via.join('/') : '') + ')';
}

const books = loadCorpus();
assert.ok(books.length >= 20, 'expected the translated books on disk');
const entries = [];
books.forEach((book) => entries.push.apply(entries, Find.entriesFromBook(book)));
const compiled = Find.compile(entries);
const verseCount = entries.filter((e) => e.kind === 'v').length;
assert.ok(verseCount > 1000, 'verse entries missing');

// Every chapter in every book file is searchable, and every catalog chapter exists in that file.
const missing = [];
let chapters = 0;
books.forEach((book) => {
  const seen = {};
  (book.chapters || []).forEach((ch) => {
    chapters++;
    seen[ch.n] = true;
    assert.ok((ch.verses || []).length > 0, book.name + ' ' + ch.n + ' has no verses');
    const probe = probeWord(ch);
    if (!probe) { missing.push(book.name + ' ' + ch.n + ' (no probe word)'); return; }
    const hits = Find.rank(compiled, probe, { notes: false });
    const ok = hits.some((h) => h.e.kind === 'v' && h.e.bookId === book.id && h.e.ch === ch.n);
    if (!ok) missing.push(book.name + ' ' + ch.n + ' probe ' + probe);
  });
  (book.translated || []).forEach((n) => {
    if (!seen[n]) missing.push(book.name + ' lists chapter ' + n + ' but the chapter file has no such chapter');
  });
});
assert.deepStrictEqual(missing, [], missing.slice(0, 8).join('; '));
assert.ok(chapters > 400, 'expected chapters across the translated books');

// Reference lookup still understands the forms the Search page already accepted.
assert.deepStrictEqual(Find.parseReference('Genesis 3:15'), { name: 'Genesis', chapter: 3, verse: 15 });
assert.deepStrictEqual(Find.parseReference('gen 3'), { name: 'gen', chapter: 3, verse: 0 });
assert.deepStrictEqual(Find.parseReference('1 Samuel 17:4'), { name: '1 Samuel', chapter: 17, verse: 4 });
assert.deepStrictEqual(Find.parseReference('Psalm 23'), { name: 'Psalm', chapter: 23, verse: 0 });
assert.strictEqual(Find.parseReference('shepherd'), null);
function resolve(raw) {
  const ref = Find.parseReference(raw);
  if (!ref) return null;
  const nm = Find.fold(ref.name).replace(/\s+/g, '');
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'data/books.json'), 'utf8'));
  const b = cat.books.find((x) => Find.fold(x.name).replace(/\s+/g, '').startsWith(nm));
  if (!b || !(b.translated || []).includes(ref.chapter)) return null;
  return b.id + ' ' + ref.chapter + (ref.verse ? ':' + ref.verse : '');
}
assert.strictEqual(resolve('gen 3:15'), 'genesis 3:15');
assert.strictEqual(resolve('Psalm 23'), 'psalms 23');
assert.strictEqual(resolve('1 sam 17'), '1-samuel 17');
assert.strictEqual(resolve('song of songs 2'), 'song-of-songs 2');

// Keyword AND still requires every typed word, and does not invent a topic match.
const grass = Find.rank(compiled, 'quiet pools', { notes: false });
assert.ok(grass.some((h) => h.e.bookId === 'psalms' && h.e.ch === 23 && h.e.v === 2), refOf(grass[0] || { e: { name: 'none', ch: 0, v: 0 }, score: 0, related: false, via: [] }));
assert.strictEqual(Find.rank(compiled, 'shapeless vineyard', { notes: false }).length, 0);
const begin = Find.rank(compiled, 'shapeless', { notes: false });
assert.strictEqual(begin[0].e.bookId, 'genesis');
assert.strictEqual(begin[0].e.ch, 1);
assert.strictEqual(begin[0].e.v, 2);
assert.strictEqual(begin[0].related, false);

// Every verse the old substring search found is still found (topic matches are added, not swapped in).
function oldVerseKeys(query) {
  const terms = Find.termsOf(query);
  const keys = [];
  entries.forEach((e) => {
    if (e.kind !== 'v') return;
    const folded = Find.fold(e.text);
    if (terms.every((t) => folded.indexOf(t) >= 0)) keys.push(e.bookId + ' ' + e.ch + ':' + e.v);
  });
  return keys;
}
const dropped = [];
['shapeless', 'quiet pools', 'in the beginning', 'shepherd', 'bow'].forEach((q) => {
  const neu = {};
  Find.rank(compiled, q, { notes: false }).forEach((h) => {
    if (h.e.kind === 'v') neu[h.e.bookId + ' ' + h.e.ch + ':' + h.e.v] = 1;
  });
  oldVerseKeys(q).forEach((key) => { if (!neu[key]) dropped.push(q + ' lost ' + key); });
});
assert.deepStrictEqual(dropped, [], dropped.slice(0, 6).join('; '));

// Footnotes stay out until the reader asks for them.
assert.strictEqual(Find.rank(compiled, 'qeshet', { notes: false }).length, 0);
const noted = Find.rank(compiled, 'qeshet', { notes: true });
assert.ok(noted.some((h) => h.e.kind === 'n' && h.e.bookId === 'genesis' && h.e.ch === 9));

// Topic expansion: shepherd finds flock/sheep, with the word itself ranked first.
const shepherd = Find.rank(compiled, 'shepherd', { notes: false });
assert.ok(shepherd.length > 5, 'shepherd returned too little');
assert.ok(shepherd.slice(0, 8).every((h) => !h.related && /shepherd/i.test(h.e.text)), 'top shepherd hits should contain the word itself: ' + shepherd.slice(0, 8).map(refOf).join('; '));
const isa4011 = shepherd.find((h) => h.e.bookId === 'isaiah' && h.e.ch === 40 && h.e.v === 11);
assert.ok(isa4011 && !isa4011.related, 'Isaiah 40:11 should remain a direct shepherd hit');
assert.ok(shepherd.indexOf(isa4011) < 12, 'Isaiah 40:11 should stay near the top: ' + shepherd.slice(0, 12).map(refOf).join('; '));
const psalm23 = shepherd.find((h) => h.e.bookId === 'psalms' && h.e.ch === 23 && h.e.v === 1);
assert.ok(psalm23, 'Psalms 23:1 missing for shepherd');
assert.ok(shepherd.indexOf(psalm23) < 50, 'Psalms 23:1 ranked too low: ' + shepherd.indexOf(psalm23));
const sheepOnly = shepherd.filter((h) => h.related && !/shepherd/i.test(h.e.text));
assert.ok(sheepOnly.length > 0, 'shepherd did not expand to flock or sheep');
assert.ok(sheepOnly[0].score < psalm23.score, 'a related-only hit outranked Psalms 23:1');

// A verse that says "rainbow" leads. The flood promise still leads the related "bow" hits.
const rainbow = Find.rank(compiled, 'rainbow', { notes: false });
assert.ok(rainbow.length > 3, 'rainbow returned too little');
assert.strictEqual(rainbow[0].e.bookId, 'ezekiel', 'top rainbow hit: ' + rainbow.slice(0, 6).map(refOf).join('; '));
assert.strictEqual(rainbow[0].e.ch, 1);
assert.strictEqual(rainbow[0].e.v, 28);
assert.strictEqual(rainbow[0].related, false);
const floodBow = rainbow.find((h) => h.e.bookId === 'genesis' && h.e.ch === 9 && h.e.v === 13);
assert.ok(floodBow && floodBow.related && floodBow.via.indexOf('bow') !== -1, 'Genesis 9:13 should explain the related word bow');
[13, 14, 16, 17].forEach((v) => {
  assert.ok(rainbow.slice(0, 6).some((h) => h.e.bookId === 'genesis' && h.e.ch === 9 && h.e.v === v), 'Genesis 9:' + v + ' missing near the top: ' + rainbow.slice(0, 8).map(refOf).join('; '));
});
const bowDown = rainbow.find((h) => /bow down|bow to|bow before|bow low/i.test(h.e.text));
if (bowDown) assert.ok(bowDown.score < floodBow.score, 'a bow-down verse tied the flood bow');

// Highlight marks the typed word and a related word, and escapes HTML.
const marked = Find.highlight('My bow rests in the clouds.', { terms: ['rainbow'], words: ['bow'] });
assert.ok(marked.includes('<mark>bow</mark>'), marked);
assert.ok(!marked.includes('<mark>rainbow</mark>'));
const safe = Find.highlight('a <b> & "word"', { terms: ['word'], words: [] });
assert.ok(safe.includes('&lt;b&gt;'));
assert.ok(safe.includes('&amp;'));
assert.ok(!safe.includes('<b>'));

// The page, the offline cache, and the progress checklist stay in step with this search.
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(indexHtml.includes('href="#/search"'), 'header Search link should open #/search');
assert.ok(indexHtml.includes('js/find-verses.js'));
assert.ok(!indexHtml.includes('ask.html') && !indexHtml.includes('ask.js'));
assert.ok(!indexHtml.includes('web-llm') && !indexHtml.includes('vectors.i8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.ok(sw.includes('js/find-verses.js'));
const version = Number((sw.match(/const VERSION = 'ctb-v(\d+)'/) || [])[1]);
assert.ok(version >= 70, 'cache version should move past main and include the find-verses script');
assert.ok(sw.includes('bible-in-a-year.html') && sw.includes('js/bible-in-a-year.js') && sw.includes('data/bible-in-a-year.json'));
const progress = fs.readFileSync(path.join(root, 'docs/ai-helper-progress.md'), 'utf8');
assert.ok(progress.includes('[x] a. Find verses search on Search page'));
assert.ok(progress.includes('[ ] b. AI Ask & Prayer tabs'));
assert.ok(progress.includes('[ ] c. Prompt tuning'));
assert.ok(progress.includes('[ ] d. AI sections in Terms & Privacy'));
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
assert.ok(app.includes('CTBFind.rank'));
assert.ok(!app.includes('ask.js') && !app.includes('vectors.i8'));

console.log('chapters', chapters, 'verses', verseCount);
console.log('psalm 23:1 rank', shepherd.indexOf(psalm23) + 1, 'of', shepherd.length);
console.log('shepherd top', shepherd.slice(0, 8).map(refOf).join(' | '));
console.log('rainbow top', rainbow.slice(0, 8).map(refOf).join(' | '));
console.log('find-verses ok');
