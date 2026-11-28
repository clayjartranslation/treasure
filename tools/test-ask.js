/* Hidden Ask/Prayer preview page (ask.html): hidden from nav and sitemap, on-device only,
   tier detection order, consent before download, search-only answers and Scripture prayers. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const isCtb = fs.existsSync(path.join(root, 'downloads.html'));
const A = require('../js/ask.js');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  const html = read('ask.html');
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(html.includes('AI can make mistakes'));
  assert.ok(html.includes('988 Suicide &amp; Crisis Lifeline'));
  assert.ok(html.includes('data-mode="ask"') && html.includes('data-mode="pray"'));
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(/connect-src 'self';/.test(csp), 'ask page may only connect to this site');
  assert.ok(!/https?:/.test(csp) && !/unsafe-(inline|eval)/.test(csp));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'no inline script');
  assert.ok(!/<script[^>]+src="https?:/i.test(html));
  assert.ok(!/ style=/.test(html) && !/<style/.test(html));

  // Not linked from any page or script, and not in the sitemap.
  const linkers = fs.readdirSync(root).filter((f) => f.endsWith('.html') && f !== 'ask.html')
    .concat(fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js') && f !== 'ask.js').map((f) => 'js/' + f));
  linkers.forEach((f) => assert.ok(!read(f).includes('ask.html'), f + ' must not link the hidden ask page'));
  assert.ok(!read('sitemap.xml').includes('ask.html'), 'ask.html must stay out of the sitemap');
  assert.ok(read('tools/build-sitemap.js').includes('noindex'), 'sitemap builder skips noindex pages');

  const src = read('js/ask.js');
  assert.ok(!/https?:\/\//.test(src), 'ask.js must not name any server');
  assert.ok(!/XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|import\(/.test(src));
  assert.strictEqual((src.match(/fetch\(/g) || []).length, 1, 'one fetch, for this site\'s own data files');
  assert.ok(src.includes("getJSON('data/books.json')"));

  // Tier order: Gemini Nano, then WebGPU Qwen3 4B / 1.7B / 0.6B, then WASM, then search only.
  const gpu = (maxBuf, f16) => ({ requestAdapter: async () => ({ limits: { maxBufferSize: maxBuf, maxStorageBufferBindingSize: maxBuf }, features: new Set(f16 ? ['shader-f16'] : []) }) });
  const G = 1024 ** 3;
  const wasm = { instantiate() {} };
  assert.strictEqual((await A.detectTier({ LanguageModel: { availability: async () => 'available' }, gpu: gpu(4 * G), WebAssembly: wasm })).id, 'nano');
  const dl = await A.detectTier({ LanguageModel: { availability: async () => 'downloadable' } });
  assert.strictEqual(dl.id, 'nano'); assert.strictEqual(dl.ready, false);
  assert.strictEqual((await A.detectTier({ LanguageModel: { availability: async () => 'unavailable' }, gpu: gpu(2 * G), deviceMemory: 8, WebAssembly: wasm })).id, 'qwen4b');
  assert.strictEqual((await A.detectTier({ gpu: gpu(2 * G), deviceMemory: 4 })).id, 'qwen17b');
  assert.strictEqual((await A.detectTier({ gpu: gpu(2 * G) })).id, 'qwen17b');
  assert.strictEqual((await A.detectTier({ gpu: gpu(256 * 1024 * 1024), deviceMemory: 8 })).id, 'qwen06b');
  assert.strictEqual((await A.detectTier({ gpu: gpu(64 * 1024 * 1024), WebAssembly: wasm })).id, 'wasm');
  assert.strictEqual((await A.detectTier({ gpu: { requestAdapter: async () => null }, WebAssembly: wasm, deviceMemory: 8 })).id, 'wasm');
  assert.strictEqual((await A.detectTier({ WebAssembly: wasm, deviceMemory: 2 })).id, 'search');
  assert.strictEqual((await A.detectTier({})).id, 'search');
  assert.strictEqual((await A.detectTier({ LanguageModel: { availability: async () => { throw new Error('x'); } } })).id, 'search');
  ['qwen4b', 'qwen17b', 'qwen06b', 'wasm'].forEach((id) => assert.ok(A.TIERS[id].mb > 0 && /\d/.test(A.TIERS[id].size), id + ' shows its download size'));
  assert.ok(src.indexOf('openConsent') > 0 && src.includes('Nothing downloads unless you choose Download'));

  // Search-only answers from this site's own published verses.
  const cat = JSON.parse(read('data/books.json'));
  const avail = cat.books.filter((b) => b.file && b.translated && b.translated.length);
  let one;
  const published = new Set();
  if (isCtb) {
    const F = require('../js/find-verses.js');
    const entries = [];
    avail.forEach((meta) => {
      const book = JSON.parse(read(meta.file));
      F.entriesFromBook(book).forEach((e) => { if (e.kind === 'v' && meta.translated.includes(e.ch)) entries.push(e); });
      meta.translated.forEach((n) => published.add(meta.id + ':' + n));
    });
    const compiled = F.compile(entries);
    one = (q) => F.rank(compiled, q, { notes: false }).map((h) => ({ id: h.e.bookId, name: h.e.name, c: h.e.ch, v: h.e.v, text: h.e.text, score: h.score }));
  } else {
    const S = require('../js/verse-search.js');
    const index = [];
    avail.forEach((meta) => {
      const book = JSON.parse(read(meta.file));
      book.chapters.forEach((c) => {
        if (!meta.translated.includes(c.n)) return;
        published.add(meta.id + ':' + c.n);
        c.verses.forEach((v) => { const text = S.plain(v.text); index.push({ kind: 'v', book: meta, c: c.n, v: v.v, text, folded: S.fold(text), order: index.length }); });
      });
    });
    one = (q) => { const f = S.search(index, q, { notes: false, books: avail }); return f.kind === 'hits' ? f.hits.map((h) => ({ id: h.book.id, name: h.book.name, c: h.c, v: h.v, text: h.text, score: h.score || 1 })) : []; };
  }
  assert.deepStrictEqual(A.contentTerms('What does the Bible say about forgiveness?'), ['forgiveness']);
  for (const q of ['What does the Bible say about the shepherd?', 'I need mercy and peace', 'covenant']) {
    const got = A.findVerses(one, q, 8).hits;
    assert.ok(got.length > 0, 'no verses for ' + q);
    got.forEach((h) => assert.ok(published.has(h.id + ':' + h.c), 'answer from unpublished chapter ' + h.id + ' ' + h.c));
  }
  assert.strictEqual(A.findVerses(one, 'the and of', 8).hits.length, 0);

  // Scripture prayer: quotes verses exactly and ends with the required words.
  const verses = A.prayable(A.findVerses(one, 'mercy', 12).hits);
  assert.ok(verses.length <= 3);
  assert.ok(verses.length >= 1);
  const prayer = A.buildPrayer(verses);
  assert.strictEqual(A.ENDING, 'by the blood of Jesus Christ and through His name we pray, amen.');
  assert.ok(prayer.endsWith(A.ENDING));
  assert.ok(prayer.includes('Jesus Christ'));
  verses.forEach((h) => assert.ok(prayer.includes('“' + h.text.trim() + '” (' + h.name + ' ' + h.c + ':' + h.v + ')'), 'verse quoted exactly'));

  console.log('ask preview tests passed', avail.length, 'books');
})().catch((e) => { console.error(e); process.exit(1); });
