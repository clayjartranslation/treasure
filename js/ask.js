/* Hidden preview: Ask and Prayer on this site's own verses (ask.html, not linked from the site).
   Everything runs in the reader's browser. Nothing typed is sent to any server or cloud AI.
   This step detects which on-device model tier the device could run and asks before any
   download, but it does not download or run a model yet: answers come from verse search,
   and the Prayer tab builds a prayer by quoting this site's verses exactly. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ClayJarAsk = api;
  if (typeof document !== 'undefined' && document.getElementById('askApp')) api.start(root, document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ENDING = 'by the blood of Jesus Christ and through His name we pray, amen.';
  var GB = 1024 * 1024 * 1024;
  var MB = 1024 * 1024;

  // Model tiers, best first. Sizes are approximate one-time downloads.
  var TIERS = {
    nano: { id: 'nano', name: 'Chrome built-in Gemini Nano', engine: 'Prompt API', mb: 0, size: 'about 2 to 4 GB, downloaded once by Chrome and shared with other sites' },
    qwen4b: { id: 'qwen4b', name: 'Qwen3 4B', engine: 'WebGPU', mb: 2300, size: 'about 2.3 GB' },
    qwen17b: { id: 'qwen17b', name: 'Qwen3 1.7B', engine: 'WebGPU', mb: 1000, size: 'about 1 GB' },
    qwen06b: { id: 'qwen06b', name: 'Qwen3 0.6B', engine: 'WebGPU', mb: 450, size: 'about 450 MB' },
    wasm: { id: 'wasm', name: 'Qwen3 0.6B (CPU)', engine: 'WebAssembly', mb: 600, size: 'about 600 MB' },
    search: { id: 'search', name: 'Verse search only', engine: 'none', mb: 0, size: 'no download' },
  };

  function tier(id, extra) {
    var t = {};
    var base = TIERS[id];
    for (var k in base) t[k] = base[k];
    for (var e in extra || {}) t[e] = extra[e];
    return t;
  }

  // Pick a WebGPU size from device memory (GB, Chrome only; capped at 8) and adapter limits.
  function pickGpuTier(mem, limits) {
    var buf = Math.min((limits && limits.maxBufferSize) || 0, (limits && limits.maxStorageBufferBindingSize) || 0);
    if (buf < 128 * MB) return null;
    if (mem >= 8 && buf >= GB) return 'qwen4b';
    if ((mem >= 4 || (!mem && buf >= GB)) && buf >= 512 * MB) return 'qwen17b';
    return 'qwen06b';
  }

  // env: { LanguageModel, ai, gpu, deviceMemory, WebAssembly }. Never downloads anything.
  async function detectTier(env) {
    env = env || {};
    var LM = env.LanguageModel || (env.ai && env.ai.languageModel);
    if (LM) {
      var a = '';
      try {
        if (typeof LM.availability === 'function') a = await LM.availability();
        else if (typeof LM.capabilities === 'function') a = (await LM.capabilities()).available;
      } catch (e) { a = ''; }
      if (a === 'available' || a === 'readily') return tier('nano', { ready: true, size: 'no download, already on this device' });
      if (a === 'downloadable' || a === 'downloading' || a === 'after-download') return tier('nano', { ready: false });
    }
    var mem = +env.deviceMemory || 0;
    if (env.gpu && typeof env.gpu.requestAdapter === 'function') {
      var adapter = null;
      try { adapter = await env.gpu.requestAdapter(); } catch (e) { adapter = null; }
      if (adapter) {
        var pick = pickGpuTier(mem, adapter.limits);
        if (pick) return tier(pick, { f16: !!(adapter.features && adapter.features.has && adapter.features.has('shader-f16')) });
      }
    }
    if (env.WebAssembly && typeof env.WebAssembly.instantiate === 'function' && (!mem || mem >= 4)) return tier('wasm');
    return tier('search');
  }

  var STOP = {};
  ('a an and are as at be but by can do does did for from god has have how i if in is it its me my of on or our say says ' +
    'so tell that the this to us was we what when where which who why will with you your about bible verse verses ' +
    'scripture scriptures please pray prayer help want need show find give some any there their they them his her ' +
    'he she am been being would could should shall into than then also just more most very').split(' ').forEach(function (w) { STOP[w] = 1; });

  function fold(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").toLowerCase();
  }
  function contentTerms(raw) {
    var seen = {};
    return fold(raw).split(/[^a-z0-9']+/).map(function (w) { return w.replace(/^'+|'+$/g, '').replace(/'s$/, ''); })
      .filter(function (w) {
        if (w.length < 3 || STOP[w] || seen[w]) return false;
        seen[w] = 1;
        return true;
      });
  }

  // searchOne(term) returns [{ id, name, c, v, text, score }] for one keyword query.
  function findVerses(searchOne, raw, max) {
    max = max || 8;
    var terms = contentTerms(raw);
    if (!terms.length) return { terms: terms, hits: [] };
    var all = terms.length > 1 ? searchOne(terms.join(' ')) : [];
    if (all.length >= 3) return { terms: terms, hits: all.slice(0, max) };
    var byKey = {};
    var list = [];
    all.forEach(function (h) { var k = h.id + ' ' + h.c + ':' + h.v; byKey[k] = { h: h, n: terms.length + 1, s: h.score || 0, o: list.length }; list.push(byKey[k]); });
    terms.forEach(function (t) {
      searchOne(t).slice(0, 60).forEach(function (h) {
        var k = h.id + ' ' + h.c + ':' + h.v;
        if (byKey[k]) { byKey[k].n++; byKey[k].s += h.score || 0; return; }
        byKey[k] = { h: h, n: 1, s: h.score || 0, o: list.length };
        list.push(byKey[k]);
      });
    });
    list.sort(function (a, b) { return b.n - a.n || b.s - a.s || a.o - b.o; });
    return { terms: terms, hits: list.slice(0, max).map(function (x) { return x.h; }) };
  }

  function refOf(h) { return h.name + ' ' + h.c + ':' + h.v; }

  // For prayers, prefer verses without words like no, not, never ("there is no peace"); keep three.
  function prayable(hits) {
    var neg = /\b(no|not|nothing|never|none|nor|without|cannot)\b|n't\b/i;
    var good = hits.filter(function (h) { return !neg.test(h.text); });
    return (good.length ? good : hits).slice(0, 3);
  }

  // A prayer that quotes the verses exactly and always ends with ENDING.
  function buildPrayer(verses) {
    var parts = ['Heavenly Father, we come to You in the name of Jesus Christ, Your Son.'];
    verses.forEach(function (h, i) {
      parts.push((i ? 'You also say, ' : 'Your word says, ') + '“' + h.text.trim() + '” (' + refOf(h) + ').');
    });
    parts.push('Thank You that in Jesus Christ every one of Your promises is yes. Help us to trust Your word, to walk in it today, and to rest in Your love; ' + ENDING);
    return parts.join(' ');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function linkOf(h) { return './#/read/' + encodeURIComponent(h.id) + '/' + h.c + '/' + h.v; }

  // ----- Browser page -----
  function start(win, doc) {
    var $ = function (s) { return doc.querySelector(s); };
    var site = doc.body.getAttribute('data-site');
    var mode = 'ask';
    var detected = null;
    var consent = '';
    var corpus = null;

    function status(t) { $('#askStatus').textContent = t; }

    async function getJSON(url) {
      var res = await fetch(url);
      if (!res.ok) throw new Error(url + ' ' + res.status);
      return res.json();
    }

    // Only published chapters: books with a file, chapters in their "translated" list.
    async function loadCorpus() {
      if (corpus) return corpus;
      var cat = await getJSON('data/books.json');
      var avail = cat.books.filter(function (b) { return b.file && b.translated && b.translated.length; });
      var books = await Promise.all(avail.map(function (b) { return getJSON(b.file); }));
      var one;
      if (site === 'ctb') {
        var F = win.CTBFind;
        var entries = [];
        books.forEach(function (book, i) {
          var ok = avail[i].translated;
          F.entriesFromBook(book).forEach(function (e) { if (e.kind === 'v' && ok.indexOf(e.ch) !== -1) entries.push(e); });
        });
        var compiled = F.compile(entries);
        one = function (q) {
          return F.rank(compiled, q, { notes: false }).map(function (h) { return { id: h.e.bookId, name: h.e.name, c: h.e.ch, v: h.e.v, text: h.e.text, score: h.score }; });
        };
      } else {
        var S = win.CJT_SEARCH;
        var index = [];
        var order = 0;
        books.forEach(function (book, i) {
          var meta = avail[i];
          book.chapters.forEach(function (c) {
            if (meta.translated.indexOf(c.n) === -1) return;
            c.verses.forEach(function (v) {
              var text = S.plain(v.text);
              index.push({ kind: 'v', book: meta, c: c.n, v: v.v, text: text, folded: S.fold(text), order: order++ });
            });
          });
        });
        one = function (q) {
          var found = S.search(index, q, { notes: false, books: avail });
          if (found.kind !== 'hits') return [];
          return found.hits.map(function (h) { return { id: h.book.id, name: h.book.name, c: h.c, v: h.v, text: h.text, score: h.score || 1 }; });
        };
      }
      corpus = { one: one };
      return corpus;
    }

    function verseList(hits) {
      return '<ul class="ask-verses">' + hits.map(function (h) {
        return '<li><a href="' + esc(linkOf(h)) + '"><span class="ref">' + esc(refOf(h)) + '</span><span class="txt">' + esc(h.text) + '</span></a></li>';
      }).join('') + '</ul>';
    }

    async function run(q) {
      status('Searching this site’s verses on your device…');
      var c = await loadCorpus();
      var found = findVerses(c.one, q, mode === 'pray' ? 12 : 8);
      var hits = mode === 'pray' ? prayable(found.hits) : found.hits;
      var out = $('#askOut');
      var note = '';
      if (mode === 'pray') {
        if (!hits.length) {
          var fallbacks = ['mercy', 'peace', 'love', 'light'];
          for (var i = 0; i < fallbacks.length && !hits.length; i++) hits = prayable(c.one(fallbacks[i]).slice(0, 12));
          note = '<p class="ask-note">No verses matched those words, so this prayer uses verses about God’s mercy and peace.</p>';
        }
        if (!hits.length) { out.innerHTML = '<p class="ask-note">No verses found to pray with yet.</p>'; status(''); return; }
        out.innerHTML = note + '<div class="ask-card"><h2>Pray with these verses</h2><p class="ask-prayer">' + esc(buildPrayer(hits)) +
          '</p><p class="ask-engine">Built straight from the verses below, quoted exactly. No AI was used.</p></div>' + verseList(hits);
      } else if (!hits.length) {
        out.innerHTML = '<p class="ask-note">No verses matched. Try other words, such as forgive, shepherd, or peace.</p>';
      } else {
        out.innerHTML = '<div class="ask-card"><h2>Verses for your question</h2><p class="ask-engine">Found by verse search on your device (no AI). Read each verse in context.</p></div>' + verseList(hits);
      }
      status('');
    }

    function showTier() {
      var t = detected;
      var box = $('#askTier');
      if (t.id === 'search') {
        box.innerHTML = '<p>This device can’t run the on-device AI helper, so Ask and Prayer use verse search. Everything still works offline.</p>';
        return;
      }
      var line = '<p>This device could run <strong>' + esc(t.name) + '</strong> (' + esc(t.engine) + '). Download: ' + esc(t.size) + '.</p>';
      if (consent === 'yes') line += '<p class="ask-note">Thank you. The on-device model is not switched on in this preview yet, so nothing was downloaded. Answers use verse search for now.</p>';
      else if (consent === 'no') line += '<p class="ask-note">No problem. Nothing was downloaded. Ask and Prayer use verse search.</p>';
      else line += '<p><button class="btn" type="button" id="askEnable">Use on-device AI…</button></p>';
      box.innerHTML = line;
      var b = $('#askEnable');
      if (b) b.addEventListener('click', openConsent);
    }

    function openConsent() {
      var t = detected;
      var box = $('#askConsent');
      box.innerHTML = '<h2 id="askConsentTitle">Download the AI helper?</h2>' +
        '<p>' + esc(t.name) + ' runs on this device. ' + (t.ready ? 'It is already on this device.' : 'It needs a one-time download of ' + esc(t.size) + '. Wi-Fi is recommended.') + '</p>' +
        '<p>Your questions and prayers never leave this device. Nothing downloads unless you choose Download.</p>' +
        '<p class="ask-actions"><button class="btn" type="button" id="askYes">' + (t.ready ? 'Turn on' : 'Download') + '</button> <button class="btn ghost" type="button" id="askNo">Not now</button></p>';
      box.hidden = false;
      $('#askYes').focus();
      $('#askYes').addEventListener('click', function () { consent = 'yes'; box.hidden = true; showTier(); });
      $('#askNo').addEventListener('click', function () { consent = 'no'; box.hidden = true; showTier(); });
    }

    function setMode(m) {
      mode = m;
      doc.querySelectorAll('.ask-tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-mode') === m)); });
      $('#askLabel').textContent = m === 'pray' ? 'What would you like to pray about?' : 'Ask a question about the Bible';
      $('#askGo').textContent = m === 'pray' ? 'Pray' : 'Ask';
      $('#askOut').innerHTML = '';
    }

    doc.querySelectorAll('.ask-tabs button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
    $('#askForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('#askQ').value.trim();
      if (q.length < 2) { status('Type a few words first.'); return; }
      run(q).catch(function (err) { status('Something went wrong: ' + (err && err.message || err)); });
    });
    setMode('ask');
    var nav = win.navigator || {};
    detectTier({ LanguageModel: win.LanguageModel, ai: win.ai, gpu: nav.gpu, deviceMemory: nav.deviceMemory, WebAssembly: win.WebAssembly })
      .catch(function () { return tier('search'); })
      .then(function (t) { detected = t; showTier(); });
  }

  return {
    ENDING: ENDING,
    TIERS: TIERS,
    pickGpuTier: pickGpuTier,
    detectTier: detectTier,
    contentTerms: contentTerms,
    findVerses: findVerses,
    buildPrayer: buildPrayer,
    prayable: prayable,
    start: start,
  };
});
