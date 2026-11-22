/* Bible in a Year: today's four readings (Old Testament, Psalms, Proverbs, New Testament)
   and the whole 365-day plan from data/bible-in-a-year.json. "Today" is the date in
   America/New_York on the reader's clock; ?d=MM-DD shows another day. February 29 uses
   the February 28 portion. Continuous play walks that day's portions in order and
   stops at the last one. No third-party scripts, no tracking. */
(function (factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.mount();
})(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var KINDS = [['ot', 'Old Testament'], ['ps', 'Psalms'], ['pr', 'Proverbs'], ['nt', 'New Testament']];
  var CJT_REC = 'https://huggingface.co/datasets/pdoggjoe/clay-jar-translation-audio/resolve/main/';
  var CTB_REC = 'https://huggingface.co/datasets/pdoggjoe/clay-jar-treasure-audio/resolve/main/';
  var REC_FALLBACK = { drama_f: 'af_heart', drama_m: 'am_michael' };
  var SETTINGS_KEY = { cjt: 'cjt-settings', ctb: 'ctb-settings' };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nyToday(now) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now || new Date());
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      return { key: o.month + '-' + o.day, year: +o.year };
    } catch (e) {
      var d = now || new Date();
      return { key: String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), year: d.getFullYear() };
    }
  }
  function niceDate(key, year) {
    var m = +key.slice(0, 2), d = +key.slice(3);
    var dt = new Date(Date.UTC(year, m - 1, d, 12));
    var wd = dt.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    return wd + ', ' + MONTHS[m - 1] + ' ' + d;
  }
  function shortDate(key) { return MONTHS[+key.slice(0, 2) - 1].slice(0, 3) + ' ' + (+key.slice(3)); }

  function chapterVerseCount(book, ch) {
    if (!book || !Array.isArray(book.chapters)) return 0;
    var c = book.chapters.filter(function (x) { return x.n === ch; })[0];
    return c && Array.isArray(c.verses) ? c.verses.length : 0;
  }

  function bookNameOf(book, id) { return (book && book.name) || id; }

  function segmentLabel(book, id, ch, startV, endV, lastV) {
    var name = bookNameOf(book, id);
    if (startV <= 1 && endV >= lastV) return name + ' ' + ch;
    if (startV === endV) return name + ' ' + ch + ':' + startV;
    return name + ' ' + ch + ':' + startV + '–' + endV;
  }

  function expandItem(item, book) {
    var segments = [];
    if (!item) return segments;
    var ch = Number(item.ch) || 1;
    var v = Number(item.v) || 1;
    var remaining = Number(item.verses);
    if (!remaining || remaining < 1) {
      var n0 = chapterVerseCount(book, ch);
      remaining = Math.max(0, n0 - v + 1);
    }
    var guard = 0;
    while (remaining > 0 && guard < 200) {
      guard += 1;
      var n = chapterVerseCount(book, ch);
      if (!n || v > n) break;
      var take = Math.min(remaining, n - v + 1);
      if (take <= 0) break;
      segments.push({
        book: item.book,
        bookName: bookNameOf(book, item.book),
        ch: ch,
        startV: v,
        endV: v + take - 1,
        lastV: n,
        fullChapter: v === 1 && (v + take - 1) >= n,
        label: segmentLabel(book, item.book, ch, v, v + take - 1, n),
        portionLabel: item.label || ''
      });
      remaining -= take;
      ch += 1;
      v = 1;
    }
    return segments;
  }

  function dayPlaylist(day, booksById) {
    var list = [];
    if (!day) return list;
    KINDS.forEach(function (k) {
      (day[k[0]] || []).forEach(function (item) {
        var segs = expandItem(item, booksById && booksById[item.book]);
        segs.forEach(function (s) {
          s.kind = k[0];
          s.kindLabel = k[1];
          list.push(s);
        });
      });
    });
    return list;
  }

  function clipDuration(meta) {
    if (!meta) return null;
    if (meta.d != null && meta.d !== '') return Number(meta.d);
    if (meta.dur != null && meta.dur !== '') return Number(meta.dur);
    if (meta.duration != null && meta.duration !== '') return Number(meta.duration);
    return null;
  }

  function clipTimes(meta, startV, endV) {
    if (!meta || !meta.v) return null;
    var start = meta.v[String(startV)];
    if (start == null || start === '') return null;
    var end = meta.v[String(Number(endV) + 1)];
    if (end == null || end === '') end = clipDuration(meta);
    return { start: Number(start), end: end == null || end === '' || isNaN(Number(end)) ? null : Number(end), timed: true };
  }

  function portionItems(meta, startV, endV) {
    var items = [];
    if (startV <= 1 && meta && meta.intro != null && meta.intro !== '') items.push({ kind: 'intro', v: 0 });
    if (startV <= 1 && meta && meta.title != null && meta.title !== '') items.push({ kind: 'title', v: 0 });
    for (var v = startV; v <= endV; v++) items.push({ kind: 'verse', v: v });
    return items;
  }

  // Same mapping the chapter pages use: verse times from meta.v, intro/title from meta.intro / meta.title.
  function recTimes(meta, items) {
    return (items || []).map(function (it) {
      if (it.kind === 'verse') {
        var ts = meta && meta.v && meta.v[String(it.v)];
        return (ts == null || ts === '') ? null : Number(ts);
      }
      var t = meta && meta[it.kind];
      return (t == null || t === '') ? null : Number(t);
    });
  }

  function itemIndexAtTime(times, currentTime) {
    var t = Number(currentTime) + 0.05, k = -1;
    if (isNaN(t)) return -1;
    for (var i = 0; i < times.length; i++) if (times[i] != null && !isNaN(times[i]) && times[i] <= t) k = i;
    return k;
  }

  function timingsReliable(meta, startV, endV) {
    if (!meta || !meta.v) return false;
    var prev = -Infinity, have = 0, need = endV - startV + 1;
    if (need < 1) return false;
    for (var v = startV; v <= endV; v++) {
      var ts = meta.v[String(v)];
      if (ts == null || ts === '' || isNaN(Number(ts))) continue;
      ts = Number(ts);
      if (ts < prev - 0.001) return false;
      prev = ts;
      have += 1;
    }
    if (!have) return false;
    return have >= need;
  }

  function inClipWindow(currentTime, clipStart, clipEnd) {
    var t = Number(currentTime);
    if (isNaN(t)) return false;
    if (clipStart != null && clipStart !== '' && t < Number(clipStart) - 0.35) return false;
    if (clipEnd != null && clipEnd !== '' && t >= Number(clipEnd) - 0.05) return false;
    return true;
  }

  // Highlight target at an audio currentTime. Returns null when the playhead is
  // outside this portion (seek not finished, leftover time from the previous
  // chapter) or when the timings are not safe to use.
  function highlightForPlayback(meta, currentTime, startV, endV, opts) {
    opts = opts || {};
    if (opts.usedFullChapter) return null;
    if (!timingsReliable(meta, startV, endV)) return null;
    if (!inClipWindow(currentTime, opts.clipStart, opts.clipEnd)) return null;
    var items = portionItems(meta, startV, endV);
    var times = recTimes(meta, items);
    var k = itemIndexAtTime(times, currentTime);
    if (k < 0) return null;
    return items[k];
  }

  function verseAtTime(meta, time, startV, endV) {
    var hit = highlightForPlayback(meta, time, startV, endV, {
      clipStart: meta && meta.v ? meta.v[String(startV)] : null
    });
    return hit && hit.kind === 'verse' ? hit.v : null;
  }

  function speakingTarget(meta, time, startV, endV) {
    var clipStart = null;
    if (startV <= 1) clipStart = 0;
    else if (meta && meta.v && meta.v[String(startV)] != null) clipStart = meta.v[String(startV)];
    return highlightForPlayback(meta, time, startV, endV, { clipStart: clipStart });
  }

  function portionScripture(book, chNum, startV, endV, opts) {
    opts = opts || {};
    if (!book) return '';
    var ch = (book.chapters || []).filter(function (x) { return x.n === chNum; })[0];
    if (!ch || !Array.isArray(ch.verses)) return '';
    var verses = ch.verses.filter(function (v) { return v.v >= startV && v.v <= endV; });
    if (!verses.length) return '';
    var usedMarks = {};
    function bodyOf(text) {
      return esc(text).replace(/\{([a-z]+)\}/g, function (_, m) {
        usedMarks[m] = true;
        return '<sup class="fn-mark">' + m + '</sup>';
      });
    }
    var paraStarts = (Array.isArray(ch.paras) && ch.paras.length) ? ch.paras.slice() : [ch.verses[0].v];
    var ends = paraStarts.concat([ch.verses[ch.verses.length - 1].v + 1]);
    var blocks = [];
    if (startV <= 1 && ch.heading) blocks.push('<h3 class="ch-heading">' + esc(ch.heading) + '</h3>');
    if (startV <= 1 && ch.title) blocks.push('<p class="ch-title">' + bodyOf(ch.title) + '</p>');
    for (var pi = 0; pi < paraStarts.length; pi++) {
      var fromV = paraStarts[pi];
      var toV = ends[pi + 1] - 1;
      var slice = ch.verses.filter(function (v) { return v.v >= fromV && v.v <= toV && v.v >= startV && v.v <= endV; });
      if (!slice.length) continue;
      var poem = slice.some(function (v) { return String(v.text).indexOf('\n') >= 0; });
      var sub = ch.subheads && ch.subheads[fromV] && fromV >= startV ? '<h3 class="ch-sub">' + esc(ch.subheads[fromV]) + '</h3>' : '';
      var html = slice.map(function (v) {
        var body = bodyOf(v.text);
        var isFirst = v.v === 1;
        var sup = '<sup class="vnum' + (isFirst ? ' first' : '') + '">' + v.v + '</sup>';
        if (body.indexOf('\n') >= 0) {
          var lines = body.split('\n').map(function (l, li) {
            return '<span class="pl">' + (li === 0 ? sup : '') + l.trim() + '</span>';
          }).join('');
          return '<span class="verse" id="biay-v' + v.v + '" data-v="' + v.v + '">' + lines + '</span>';
        }
        return '<span class="verse" id="biay-v' + v.v + '" data-v="' + v.v + '">' + sup + body + '</span>';
      }).join(' ');
      blocks.push(sub + '<p' + (poem ? ' class="poem"' : '') + '>' + html + '</p>');
    }
    var notes = (ch.notes || []).filter(function (n) { return usedMarks[n.m]; });
    if (notes.length) {
      blocks.push('<ol class="biay-fn">' + notes.map(function (n) {
        return '<li><span class="m">' + esc(n.m) + '</span> ' + esc(n.text) + '</li>';
      }).join('') + '</ol>');
    }
    var label = opts.label || ((book.name || '') + ' ' + chNum);
    var head = '<header class="biay-reading-head"><p class="eyebrow">' + esc(opts.kindLabel || 'Reading') + '</p><h3>' + esc(label) + '</h3>';
    if (opts.fellBack) head += '<p class="muted biay-source-note">Text and audio are from the Clay Jar Translation.</p>';
    head += '</header>';
    return head + '<div class="scripture biay-scripture-text">' + blocks.join('') + '</div>';
  }

  function textSource(site, info, seg) {
    if (info && info.source) return info.source;
    if (site === 'ctb' && seg && seg.ctbPublished) return 'ctb';
    return 'cjt';
  }

  function readSettings(site) {
    try {
      var raw = JSON.parse(localStorage.getItem(SETTINGS_KEY[site] || 'cjt-settings') || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) { return {}; }
  }

  function chosenVoice(settings, recIndex) {
    var c = settings && settings.narr;
    if (c === 'device') return '';
    if (c && recIndex && recIndex.voices && recIndex.voices[c]) return c;
    if (recIndex && recIndex.voices && recIndex.voices.af_heart) return 'af_heart';
    if (recIndex && recIndex.voices && recIndex.voices.am_michael) return 'am_michael';
    return c || '';
  }

  function indexHas(recIndex, voice, bookId, ch) {
    return !!(recIndex && recIndex.voices && recIndex.voices[voice] && recIndex.voices[voice][bookId] && recIndex.voices[voice][bookId][String(ch)]);
  }

  function wantedHash(recIndex, voice, bookId, ch) {
    return indexHas(recIndex, voice, bookId, ch) ? recIndex.voices[voice][bookId][String(ch)] : '';
  }

  async function sha12(str) {
    var d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(d)).slice(0, 6).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function chapterHashText(ch) {
    return ch.verses.map(function (v) { return v.text; }).join('\n') + (ch.title ? '\n' + ch.title : '');
  }

  function mount() {
    var main = typeof document !== 'undefined' ? document.getElementById('biay') : null;
    if (!main) return;
    var site = main.getAttribute('data-site') || 'cjt';
    var bookCache = {};
    var recIndexes = {};
    var audioCache = {};
    var player = {
      list: [],
      i: 0,
      playing: false,
      token: 0,
      clipEnd: null,
      usedFullChapter: false,
      skipped: [],
      fallbackNotes: [],
      audio: null,
      advancing: false,
      meta: null,
      canHighlight: false,
      seekPending: false,
      times: []
    };

    function recBase(which) { return which === 'ctb' ? CTB_REC : CJT_REC; }
    function bookUrl(which, id) {
      if (which === 'cjt' && site === 'ctb') return '../data/books/' + id + '.json';
      return 'data/books/' + id + '.json';
    }

    function loadBook(which, id) {
      var key = which + ':' + id;
      if (bookCache[key]) return bookCache[key];
      bookCache[key] = fetch(bookUrl(which, id)).then(function (r) {
        if (!r.ok) throw new Error('book');
        return r.json();
      }).catch(function () { return null; });
      return bookCache[key];
    }

    function loadIndex(which) {
      if (recIndexes[which] && recIndexes[which].then) return recIndexes[which];
      recIndexes[which] = fetch(recBase(which) + 'index.json').then(function (r) {
        return r.ok ? r.json() : null;
      }).catch(function () { return null; });
      return recIndexes[which];
    }

    async function resolveOne(seg, which, voice) {
      if (!voice || !window.crypto || !crypto.subtle) return null;
      var idx = await loadIndex(which);
      var v = voice;
      if (!indexHas(idx, v, seg.book, seg.ch) && REC_FALLBACK[v]) v = REC_FALLBACK[v];
      var want = wantedHash(idx, v, seg.book, seg.ch);
      if (!want) return null;
      var book = await loadBook(which, seg.book);
      if (!book) return null;
      var ch = (book.chapters || []).filter(function (x) { return x.n === seg.ch; })[0];
      if (!ch) return null;
      var h = await sha12(chapterHashText(ch));
      if (h !== want) return null;
      var base = recBase(which) + v + '/' + seg.book + '/' + seg.ch;
      var res = await fetch(base + '.json');
      if (!res.ok) return null;
      var meta = await res.json();
      if (meta.h !== want) return null;
      var clip = clipTimes(meta, seg.startV, seg.endV);
      var full = !!seg.fullChapter;
      var usedFull = !full && !clip;
      return {
        url: base + '.opus',
        meta: meta,
        voice: v,
        source: which,
        start: clip ? clip.start : 0,
        end: clip ? clip.end : null,
        timed: !!(clip && !full),
        usedFullChapter: usedFull,
        label: seg.label
      };
    }

    async function resolveAudio(seg, settings) {
      var key = [site, seg.book, seg.ch, seg.startV, seg.endV, (settings && settings.narr) || ''].join(':');
      if (audioCache[key]) return audioCache[key];
      var p = (async function () {
        var cjtIdx = await loadIndex('cjt');
        var ctbIdx = site === 'ctb' ? await loadIndex('ctb') : null;
        var voiceCtb = chosenVoice(settings, ctbIdx);
        var voiceCjt = chosenVoice(settings, cjtIdx);
        var tryCtb = site === 'ctb' && seg.ctbPublished;
        if (tryCtb) {
          var ctb = await resolveOne(seg, 'ctb', voiceCtb || voiceCjt);
          if (ctb) return ctb;
        }
        var cjt = await resolveOne(seg, 'cjt', voiceCjt || voiceCtb);
        if (cjt) {
          if (tryCtb) cjt.fellBackToCjt = true;
          return cjt;
        }
        return null;
      })();
      audioCache[key] = p;
      return p;
    }

    function setMediaSession(seg) {
      if (!('mediaSession' in navigator)) return;
      try {
        var ms = navigator.mediaSession;
        var title = (seg && (seg.label || (seg.bookName + ' ' + seg.ch))) || 'Bible in a Year';
        var artist = site === 'ctb' ? 'Clay Jar Treasure Bible' : 'Clay Jar Translation';
        ms.metadata = new MediaMetadata({
          title: title,
          artist: artist,
          album: 'Bible in a Year',
          artwork: [{ src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }]
        });
        ms.playbackState = player.playing ? 'playing' : 'paused';
        ms.setActionHandler('play', function () { resumePlay(); });
        ms.setActionHandler('pause', function () { pausePlay(); });
        ms.setActionHandler('previoustrack', function () { skip(-1); });
        ms.setActionHandler('nexttrack', function () { skip(1); });
        ms.setActionHandler('stop', function () { stopPlay(); });
      } catch (e) {}
    }

    function nowEl() { return document.getElementById('biayNow'); }
    function noteEl() { return document.getElementById('biayNote'); }
    function barEl() { return document.getElementById('biayPlayerBar'); }
    function toggleBtn() { return document.getElementById('biayToggle'); }
    function scriptureEl() { return document.getElementById('biayScripture'); }

    function setPlayerChrome(on) {
      var bar = barEl();
      if (bar) bar.hidden = !on;
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('biay-has-player', !!on);
      }
    }

    function clearSpeaking() {
      var root = scriptureEl();
      if (!root) return;
      Array.prototype.forEach.call(root.querySelectorAll('.speaking'), function (x) { x.classList.remove('speaking'); });
    }

    function markSpeaking() {
      var root = scriptureEl();
      if (!root) return;
      clearSpeaking();
      if (!player.canHighlight || player.seekPending || player.advancing) return;
      var seg = player.list[player.i];
      var audio = player.audio;
      if (!seg || !audio) return;
      var target = highlightForPlayback(player.meta, audio.currentTime, seg.startV, seg.endV, {
        clipStart: player.clipStart,
        clipEnd: player.clipEnd,
        usedFullChapter: !!player.clipUsedFull
      });
      if (!target) return;
      var el = target.kind === 'title' ? root.querySelector('.ch-title') : document.getElementById('biay-v' + target.v);
      if (!el) return;
      el.classList.add('speaking');
      var bar = barEl();
      var header = document.querySelector('header.bar');
      var top = ((header && header.getBoundingClientRect().bottom) || 70) + 8;
      var bottom = (bar && !bar.hidden ? bar.getBoundingClientRect().top : window.innerHeight) - 8;
      var r = el.getBoundingClientRect();
      if (r.top < top || r.bottom > bottom) {
        var reduce = false;
        try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
        el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      }
    }

    function renderPortion(seg, info, tok) {
      var pane = scriptureEl();
      if (!pane || !seg) return Promise.resolve();
      var which = textSource(site, info, seg);
      return loadBook(which, seg.book).then(function (book) {
        if (tok !== player.token) return { stale: true };
        if (!book && which !== 'cjt') return loadBook('cjt', seg.book).then(function (fb) {
          return tok !== player.token ? { stale: true } : fb;
        });
        return book;
      }).then(function (book) {
        if (tok !== player.token || (book && book.stale)) return;
        var html = portionScripture(book, seg.ch, seg.startV, seg.endV, {
          label: seg.label,
          kindLabel: seg.kindLabel,
          fellBack: !!(info && info.fellBackToCjt)
        });
        pane.innerHTML = html || '<p class="muted">The text for this portion could not be loaded.</p>';
        pane.hidden = false;
        markSpeaking();
      });
    }

    function updateUi() {
      var bar = barEl();
      if (bar && player.list.length === 0) bar.hidden = true;
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('biay-has-player', !!(bar && !bar.hidden));
      }
      var seg = player.list[player.i];
      var now = nowEl();
      if (now) {
        if (!seg) now.textContent = '';
        else now.textContent = (seg.kindLabel ? seg.kindLabel + ': ' : '') + seg.label + (player.playing ? '' : ' (paused)');
      }
      var tb = toggleBtn();
      if (tb) {
        tb.textContent = player.playing ? 'Pause' : 'Play';
        tb.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
      }
      var note = noteEl();
      if (note) {
        var bits = [];
        if (player.usedFullChapter) bits.push('A verse range in this day’s readings has no verse timings, so the full chapter is playing.');
        if (player.fallbackNotes.length) bits.push(player.fallbackNotes[player.fallbackNotes.length - 1]);
        if (player.skipped.length && !player.playing && player.i >= player.list.length) bits.push('Skipped ' + player.skipped.join(', ') + ' (no recording yet).');
        note.textContent = bits.join(' ');
      }
      if (seg) setMediaSession(seg);
    }

    function ensureAudio() {
      if (player.audio) return player.audio;
      var a = document.getElementById('biayAudio');
      if (!a) {
        a = document.createElement('audio');
        a.id = 'biayAudio';
        a.setAttribute('playsinline', '');
        a.setAttribute('preload', 'auto');
        a.hidden = true;
        var host = document.getElementById('biayPlayer') || main;
        host.appendChild(a);
      }
      a.addEventListener('ended', function () {
        if (!player.playing || player.advancing) return;
        advance(1, false);
      });
      a.addEventListener('timeupdate', function () {
        if (player.advancing) return;
        if (player.seekPending) {
          if (inClipWindow(a.currentTime, player.clipStart, player.clipEnd)) {
            player.seekPending = false;
            markSpeaking();
          }
          return;
        }
        if (player.playing && player.clipEnd != null && a.currentTime >= player.clipEnd - 0.05) {
          advance(1, false);
          return;
        }
        markSpeaking();
      });
      a.addEventListener('error', function () {
        if (!player.playing || player.advancing) return;
        var seg = player.list[player.i];
        if (seg) player.skipped.push(seg.label);
        advance(1, false);
      });
      player.audio = a;
      return a;
    }

    async function playIndex(i, fromStart) {
      var tok = ++player.token;
      player.advancing = true;
      var settings = readSettings(site);
      var list = player.list;
      while (i >= 0 && i < list.length) {
        var seg = list[i];
        var info = null;
        try { info = await resolveAudio(seg, settings); } catch (e) { info = null; }
        if (tok !== player.token) return;
        if (info) {
          player.i = i;
          if (info.usedFullChapter) player.usedFullChapter = true;
          if (info.fellBackToCjt) {
            player.fallbackNotes.push(seg.label + ' is playing from the Clay Jar Translation recording.');
          }
          var audio = ensureAudio();
          var start = fromStart === false ? (audio.currentTime || info.start || 0) : (info.start || 0);
          if (fromStart !== false) start = info.start || 0;
          player.meta = info.meta || null;
          player.clipStart = start;
          player.clipEnd = info.end;
          player.clipUsedFull = !!info.usedFullChapter;
          player.canHighlight = timingsReliable(player.meta, seg.startV, seg.endV) && !info.usedFullChapter;
          player.times = recTimes(player.meta, portionItems(player.meta, seg.startV, seg.endV));
          player.seekPending = start > 0.15;
          if (audio.getAttribute('data-src') !== info.url) {
            audio.src = info.url;
            audio.setAttribute('data-src', info.url);
            try { audio.load(); } catch (e) {}
          }
          audio.playbackRate = Number(settings.rate) || 1;
          var applySeek = function () {
            if (tok !== player.token) return;
            try {
              if (Math.abs((audio.currentTime || 0) - start) > 0.12) audio.currentTime = start;
            } catch (e) {}
          };
          var seekDone = function () {
            if (tok !== player.token) return;
            if (start <= 0.15 || inClipWindow(audio.currentTime, player.clipStart, player.clipEnd)) {
              player.seekPending = false;
              markSpeaking();
            }
          };
          if (audio.readyState >= 1) applySeek();
          else audio.addEventListener('loadedmetadata', applySeek, { once: true });
          audio.addEventListener('seeked', seekDone, { once: true });
          audio.addEventListener('playing', function () {
            if (tok !== player.token) return;
            if (player.seekPending) applySeek();
            else markSpeaking();
          }, { once: true });
          player.playing = true;
          player.advancing = false;
          updateUi();
          renderPortion(seg, info, tok);
          var pr = audio.play();
          if (pr && pr.then) {
            pr.then(function () { applySeek(); }).catch(function (err) {
              if (err && err.name === 'AbortError') return;
              player.playing = false;
              updateUi();
            });
          }
          prefetch(i + 1, settings);
          return;
        }
        player.skipped.push(seg.label);
        i += 1;
        fromStart = true;
      }
      player.i = Math.max(0, list.length - 1);
      player.playing = false;
      player.advancing = false;
      try { ensureAudio().pause(); } catch (e) {}
      if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'none'; } catch (e) {} }
      var note = noteEl();
      var endMsg = 'End of today’s readings.';
      if (player.skipped.length) endMsg += ' Skipped ' + player.skipped.join(', ') + ' (no recording yet).';
      if (note) note.textContent = endMsg;
      var now = nowEl();
      if (now && !player.playing) now.textContent = 'End of today’s readings';
      var tb = toggleBtn();
      if (tb) { tb.textContent = 'Play'; tb.setAttribute('aria-label', 'Play'); }
      clearSpeaking();
    }

    function prefetch(i, settings) {
      var seg = player.list[i];
      if (!seg) return;
      resolveAudio(seg, settings).catch(function () {});
    }

    function advance(dir, manual) {
      if (player.advancing && !manual) return;
      var next = player.i + (dir || 1);
      if (next < 0) {
        var audio = ensureAudio();
        try { audio.currentTime = 0; } catch (e) {}
        player.i = 0;
        player.advancing = false;
        updateUi();
        return;
      }
      if (next >= player.list.length) {
        player.token += 1;
        player.playing = false;
        player.advancing = false;
        player.clipEnd = null;
        try { ensureAudio().pause(); } catch (e) {}
        if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'none'; } catch (e) {} }
        var now = nowEl();
        if (now) now.textContent = 'End of today’s readings';
        var note = noteEl();
        if (note) note.textContent = 'End of today’s readings.';
        var tb = toggleBtn();
        if (tb) { tb.textContent = 'Play'; tb.setAttribute('aria-label', 'Play'); }
        clearSpeaking();
        return;
      }
      playIndex(next, true);
    }

    function pausePlay() {
      player.playing = false;
      try { ensureAudio().pause(); } catch (e) {}
      if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'paused'; } catch (e) {} }
      updateUi();
    }

    function resumePlay() {
      if (!player.list.length) return;
      var audio = ensureAudio();
      if (audio.getAttribute('data-src')) {
        player.playing = true;
        updateUi();
        var pr = audio.play();
        if (pr && pr.catch) pr.catch(function () { player.playing = false; updateUi(); });
        return;
      }
      playIndex(player.i, false);
    }

    function stopPlay() {
      player.token += 1;
      player.playing = false;
      player.advancing = false;
      player.clipEnd = null;
      player.seekPending = false;
      try { ensureAudio().pause(); } catch (e) {}
      if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'none'; } catch (e) {} }
      clearSpeaking();
      updateUi();
    }

    function skip(dir) {
      var audio = ensureAudio();
      if (dir < 0 && audio.currentTime > (player.clipStart || 0) + 2.5) {
        try { audio.currentTime = player.clipStart || 0; } catch (e) {}
        return;
      }
      advance(dir, true);
    }


    function startFrom(kind) {
      var list = player.list;
      var i = 0;
      if (kind) {
        var found = -1;
        for (var k = 0; k < list.length; k++) if (list[k].kind === kind) { found = k; break; }
        if (found >= 0) i = found;
      }
      player.skipped = [];
      player.fallbackNotes = [];
      player.usedFullChapter = false;
      setPlayerChrome(true);
      playIndex(i, true);
    }

    function attachPlayer(playlist) {
      player.list = playlist;
      player.i = 0;
      ensureAudio();
      var playDay = document.getElementById('biayPlayDay');
      if (playDay) playDay.addEventListener('click', function () { startFrom(null); });
      var toggle = document.getElementById('biayToggle');
      if (toggle) toggle.addEventListener('click', function () { if (player.playing) pausePlay(); else resumePlay(); });
      var prev = document.getElementById('biayPrev');
      if (prev) prev.addEventListener('click', function () { skip(-1); });
      var next = document.getElementById('biayNext');
      if (next) next.addEventListener('click', function () { skip(1); });
      var stop = document.getElementById('biayStop');
      if (stop) stop.addEventListener('click', function () { stopPlay(); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-biay-play]'), function (btn) {
        btn.addEventListener('click', function () { startFrom(btn.getAttribute('data-biay-play')); });
      });
    }

    function playerMarkup() {
      return '<div class="biay-player" id="biayPlayer">' +
        '<audio id="biayAudio" preload="auto" playsinline hidden></audio>' +
        '<button type="button" class="btn primary" id="biayPlayDay">Play today’s readings</button>' +
        '<p class="muted" id="biayPlayHint">As the recording plays, the words of that portion appear below, and the verse being read is marked.</p>' +
        '<div class="biay-scripture" id="biayScripture" hidden></div>' +
        '<div class="biay-player-bar" id="biayPlayerBar" hidden>' +
        '<p class="player-now" id="biayNow" aria-live="polite"></p>' +
        '<div class="biay-player-btns">' +
        '<button type="button" class="btn" id="biayPrev">Previous</button>' +
        '<button type="button" class="btn primary" id="biayToggle" aria-label="Pause">Pause</button>' +
        '<button type="button" class="btn" id="biayNext">Next</button>' +
        '<button type="button" class="btn" id="biayStop">Stop</button>' +
        '</div>' +
        '<p class="muted" id="biayNote"></p>' +
        '</div></div>';
    }

    Promise.all([
      fetch('data/bible-in-a-year.json').then(function (r) { if (!r.ok) throw new Error('plan'); return r.json(); }),
      fetch('data/books.json').then(function (r) { if (!r.ok) throw new Error('books'); return r.json(); })
    ]).then(function (res) {
      var plan = res[0], cat = res[1];
      var done = {};
      var needed = {};
      cat.books.forEach(function (b) { done[b.id] = {}; (b.translated || []).forEach(function (c) { done[b.id][c] = true; }); });
      var byKey = {};
      plan.days.forEach(function (d) { byKey[d.date] = d; });
      function link(p) {
        var path = '#/read/' + encodeURIComponent(p.book) + '/' + p.ch + (p.v > 1 ? '/' + p.v : '');
        if (site === 'ctb' && !(done[p.book] && done[p.book][p.ch])) {
          return '<a href="../' + path + '" title="Not yet in the Clay Jar Treasure Bible; opens the Clay Jar Translation">' + esc(p.label) + '</a> <small class="muted">(Clay Jar Translation)</small>';
        }
        return '<a href="./' + path + '">' + esc(p.label) + '</a>';
      }
      function portion(day, k) { return day[k].map(link).join('; '); }
      var now = nyToday();
      var q = new URLSearchParams(location.search).get('d');
      var key = /^\d\d-\d\d$/.test(q || '') ? q : now.key;
      var real = key === '02-29' ? '02-28' : key;
      var day = byKey[real];
      if (!day) { key = now.key; real = key === '02-29' ? '02-28' : key; day = byKey[real]; }
      var idx = plan.days.indexOf(day);
      var prev = plan.days[(idx + 364) % 365].date, next = plan.days[(idx + 1) % 365].date;
      var isToday = key === now.key;
      KINDS.forEach(function (k) {
        (day[k[0]] || []).forEach(function (p) { needed[p.book] = true; });
      });
      var loads = Object.keys(needed).map(function (id) {
        return loadBook(site === 'ctb' && done[id] ? 'ctb' : (site === 'ctb' ? 'cjt' : 'cjt'), id).then(function (bk) {
          return [id, bk];
        });
      });
      return Promise.all(loads).then(function (pairs) {
        var booksById = {};
        pairs.forEach(function (pair) { if (pair[1]) booksById[pair[0]] = pair[1]; });
        // For ranges that spill into a later unpublished chapter, still need verse counts from CJT.
        var extra = [];
        var playlistPreview = dayPlaylist(day, booksById);
        if (playlistPreview.length === 0) {
          // Book files may have failed; still render the page without a playlist.
        }
        var html = '<section class="card biay-today" aria-labelledby="biayDay">' +
          '<p class="eyebrow">' + (isToday ? 'Today' : 'Day ' + (idx + 1) + ' of 365') + '</p>' +
          '<h2 id="biayDay">' + esc(niceDate(key, now.year)) + '</h2>' +
          (key === '02-29' ? '<p class="muted">Leap day: read the February 28 portion again, or catch up on a day you missed.</p>' : '') +
          '<ul class="biay-portions">' + KINDS.map(function (k) {
            return '<li><strong>' + k[1] + ':</strong> ' + portion(day, k[0]) +
              ' <button type="button" class="btn biay-play-part" data-biay-play="' + k[0] + '">Play from here</button></li>';
          }).join('') + '</ul>' +
          playerMarkup() +
          '<p class="biay-nav"><a class="btn" href="?d=' + prev + '">← ' + esc(shortDate(prev)) + '</a> ' +
          (isToday ? '' : '<a class="btn" href="bible-in-a-year.html">Today</a> ') +
          '<a class="btn" href="?d=' + next + '">' + esc(shortDate(next)) + ' →</a></p></section>';
        html += '<h2 id="biayYear">The whole year</h2><p class="muted">Each day has a reading from the Old Testament, the Psalms, Proverbs, and the New Testament. Tap a reading to open it.</p>';
        for (var m = 0; m < 12; m++) {
          var mm = String(m + 1).padStart(2, '0');
          var rows = plan.days.filter(function (d) { return d.date.slice(0, 2) === mm; });
          html += '<details class="biay-month"' + (mm === real.slice(0, 2) ? ' open' : '') + '><summary>' + MONTHS[m] + '</summary><ol class="biay-list">' +
            rows.map(function (d) {
              return '<li id="d' + d.date + '"' + (d.date === real ? ' class="biay-current" aria-current="date"' : '') + '><a class="biay-date" href="?d=' + d.date + '">' + esc(shortDate(d.date)) + '</a> ' +
                KINDS.map(function (k) { return portion(d, k[0]); }).join(' · ') + '</li>';
            }).join('') + (mm === '02' ? '<li><span class="biay-date">Feb 29</span> <span class="muted">Leap day: repeat February 28 or catch up.</span></li>' : '') + '</ol></details>';
        }
        main.innerHTML = html;
        main.removeAttribute('aria-busy');
        var playlist = dayPlaylist(day, booksById);
        playlist.forEach(function (s) {
          s.ctbPublished = !!(done[s.book] && done[s.book][s.ch]);
        });
        attachPlayer(playlist);
        // Warm the first few audio lookups so a tap can start promptly.
        var settings = readSettings(site);
        playlist.slice(0, 3).forEach(function (s) { resolveAudio(s, settings).catch(function () {}); });
      });
    }).catch(function () {
      main.removeAttribute('aria-busy');
      main.innerHTML = '<p class="muted">The reading plan could not be loaded. If you are offline, open this page once while online so it can be saved.</p>';
    });
    if (site === 'cjt' && navigator.serviceWorker) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  return {
    KINDS: KINDS,
    esc: esc,
    nyToday: nyToday,
    niceDate: niceDate,
    shortDate: shortDate,
    chapterVerseCount: chapterVerseCount,
    expandItem: expandItem,
    dayPlaylist: dayPlaylist,
    clipTimes: clipTimes,
    clipDuration: clipDuration,
    portionItems: portionItems,
    recTimes: recTimes,
    itemIndexAtTime: itemIndexAtTime,
    timingsReliable: timingsReliable,
    inClipWindow: inClipWindow,
    highlightForPlayback: highlightForPlayback,
    portionScripture: portionScripture,
    verseAtTime: verseAtTime,
    speakingTarget: speakingTarget,
    textSource: textSource,
    chosenVoice: chosenVoice,
    mount: mount
  };
});
