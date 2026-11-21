/* Find-verses search for the Search page.
   Keyword match (every word you type) plus a small topic map so a word like
   "shepherd" also finds flock and sheep, and "rainbow" also finds bow and covenant.
   Ranking prefers the words you typed, then related words that share a topic.
   Everything runs on the device. No network and no model.
   Loaded in the browser as a classic script and required by the node tests. */
(function (root) {
  'use strict';

  // words: any one of these satisfies a search for any other.
  // context: does not match on its own; it raises a verse that already matched.
  var TOPICS = [
    { words: ['shepherd', 'shepherds', 'flock', 'flocks', 'sheep'], context: ['lamb', 'pasture', 'graze'] },
    // Clouds weigh more than a bare "bow" or "covenant": this translation says "bow" in the clouds for the flood sign.
    { words: ['rainbow', 'bow', 'covenant'], context: [{ w: 'cloud', p: 36 }, { w: 'promise', p: 20 }, { w: 'sign', p: 16 }] },
    { words: ['forgive', 'forgiven', 'forgiveness', 'pardon', 'pardoned'], context: [] },
    { words: ['comfort', 'comforted', 'consolation'], context: [] },
    { words: ['wisdom', 'wise'], context: [] },
    { words: ['idol', 'idols'], context: [] },
    { words: ['pray', 'prayer', 'prayers'], context: [] },
    { words: ['mercy', 'merciful', 'compassion'], context: [] },
    { words: ['create', 'created', 'creator', 'creation'], context: [] },
    { words: ['sabbath', 'sabbaths'], context: [] }
  ];

  function fold(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  }
  function plain(t) { return String(t).replace(/\{[a-z]+\}/g, ''); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function collapse(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  // "shepherds" -> "shepherd", "flocks" -> "flock". Leaves short words alone.
  function keysFor(term) {
    var keys = [term];
    if (term.length >= 4 && term.charAt(term.length - 1) === 's' && term.slice(-2) !== 'ss') keys.push(term.slice(0, -1));
    if (term.length >= 5 && term.slice(-2) === "'s") keys.push(term.slice(0, -2));
    return keys;
  }
  function addToken(set, w) {
    if (!w) return;
    set[w] = 1;
    var keys = keysFor(w);
    for (var i = 1; i < keys.length; i++) set[keys[i]] = 1;
  }
  function topicFor(term) {
    var keys = keysFor(term);
    for (var i = 0; i < TOPICS.length; i++) {
      var words = TOPICS[i].words;
      for (var j = 0; j < words.length; j++) {
        if (keys.indexOf(words[j]) !== -1) return TOPICS[i];
      }
    }
    return null;
  }
  function sameFamily(a, b) {
    var ka = keysFor(a);
    var kb = keysFor(b);
    for (var i = 0; i < ka.length; i++) if (kb.indexOf(ka[i]) !== -1) return true;
    return false;
  }
  function wordsInSet(row, list) {
    var hit = [];
    for (var i = 0; i < list.length; i++) if (row.set[list[i]]) hit.push(list[i]);
    return hit;
  }
  function contextScore(row, topic) {
    var n = 0;
    var seen = {};
    var ctx = topic.context || [];
    for (var i = 0; i < ctx.length; i++) {
      var item = typeof ctx[i] === 'string' ? { w: ctx[i], p: 12 } : ctx[i];
      var base = keysFor(item.w);
      var key = base[base.length - 1];
      if (seen[key]) continue;
      if (row.set[item.w] || row.set[key]) { seen[key] = 1; n += item.p; }
    }
    return Math.min(80, n);
  }

  function parseReference(raw) {
    var ref = /^([1-4]?\s*[a-z][a-z .]*?)\s*(\d+)(?::(\d+))?$/i.exec(String(raw).trim());
    if (!ref) return null;
    return { name: ref[1], chapter: +ref[2], verse: ref[3] ? +ref[3] : 0 };
  }
  function termsOf(raw) {
    return collapse(fold(raw).replace(/"/g, '')).split(' ').filter(Boolean);
  }

  function entriesFromBook(book) {
    var out = [];
    if (!book || !book.chapters) return out;
    book.chapters.forEach(function (c) {
      (c.verses || []).forEach(function (v) {
        out.push({ kind: 'v', bookId: book.id, name: book.name, ch: c.n, v: v.v, text: plain(v.text) });
      });
      (c.notes || []).forEach(function (x) {
        out.push({
          kind: 'n', bookId: book.id, name: book.name, ch: c.n,
          v: +(String(x.ref).split(':')[1] || 0), m: x.m, text: String(x.text || '')
        });
      });
    });
    return out;
  }

  function compile(entries) {
    return entries.map(function (e, i) {
      var folded = fold(e.text);
      var set = {};
      var re = /[a-z0-9']+/g;
      var m;
      while ((m = re.exec(folded))) addToken(set, m[0]);
      return { e: e, i: i, fold: folded, set: set };
    });
  }

  function rank(compiled, raw, opts) {
    var notes = !!(opts && opts.notes);
    var terms = termsOf(raw);
    if (!terms.length) return [];
    var topics = terms.map(topicFor);
    var phrase = terms.length > 1 ? terms.join(' ') : '';
    var hits = [];
    for (var n = 0; n < compiled.length; n++) {
      var row = compiled[n];
      if (row.e.kind === 'n' && !notes) continue;
      var score = 0;
      var via = [];
      var related = false;
      var ok = true;
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        var at = row.fold.indexOf(term);
        if (at >= 0) {
          score += 100;
          if (row.set[term]) score += 30;
          var occ = 0;
          var from = at;
          while (from >= 0 && occ < 3) { occ++; from = row.fold.indexOf(term, from + term.length); }
          score += occ * 8;
          if (at < 48) score += 10;
          if (row.fold.length < 160) score += 8;
        } else if (topics[t]) {
          var syn = wordsInSet(row, topics[t].words).filter(function (w) { return !sameFamily(w, term); });
          if (!syn.length) { ok = false; break; }
          related = true;
          score += 35;
          for (var s = 0; s < syn.length && s < 4; s++) via.push(syn[s]);
        } else {
          ok = false;
          break;
        }
        if (topics[t]) {
          var extra = wordsInSet(row, topics[t].words).filter(function (w) { return !sameFamily(w, term); });
          score += Math.min(48, extra.length * 24);
          score += contextScore(row, topics[t]);
        }
      }
      if (!ok) continue;
      if (phrase && collapse(row.fold).indexOf(phrase) >= 0) score += 80;
      hits.push({ e: row.e, i: row.i, score: score, via: dedupe(via), related: related });
    }
    hits.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return hits;
  }

  function dedupe(list) {
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      if (seen[list[i]]) continue;
      seen[list[i]] = 1;
      out.push(list[i]);
    }
    return out;
  }

  function highlight(text, spec) {
    var f = fold(text);
    if (f.length !== text.length) return esc(text);
    var marks = new Array(text.length);
    var terms = (spec && spec.terms) || [];
    for (var t = 0; t < terms.length; t++) {
      var term = terms[t];
      if (!term) continue;
      var at = f.indexOf(term);
      while (at >= 0) {
        for (var k = at; k < at + term.length && k < text.length; k++) marks[k] = true;
        at = f.indexOf(term, at + term.length);
      }
    }
    var words = {};
    var list = (spec && spec.words) || [];
    for (var w = 0; w < list.length; w++) {
      var keys = keysFor(list[w]);
      for (var u = 0; u < keys.length; u++) words[keys[u]] = 1;
      words[list[w]] = 1;
    }
    if (list.length) {
      var re = /[a-z0-9']+/g;
      var m;
      while ((m = re.exec(f))) {
        var token = m[0];
        var base = keysFor(token);
        var bare = token.slice(-2) === "'s" ? token.slice(0, -2) : '';
        if (words[token] || words[base[base.length - 1]] || (bare && words[bare])) {
          for (var k2 = m.index; k2 < m.index + token.length; k2++) marks[k2] = true;
        }
      }
    }
    var out = '';
    var open = false;
    for (var i = 0; i < text.length; i++) {
      if (marks[i] && !open) { out += '<mark>'; open = true; }
      if (!marks[i] && open) { out += '</mark>'; open = false; }
      out += esc(text.charAt(i));
    }
    return out + (open ? '</mark>' : '');
  }

  root.CTBFind = {
    TOPICS: TOPICS,
    fold: fold,
    plain: plain,
    esc: esc,
    parseReference: parseReference,
    termsOf: termsOf,
    entriesFromBook: entriesFromBook,
    compile: compile,
    rank: rank,
    highlight: highlight
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') {
  module.exports = globalThis.CTBFind;
}
