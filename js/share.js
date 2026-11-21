/* Verse sharing. Privacy: no third-party scripts, widgets, pixels, or trackers.
   Each platform button is a plain link that opens only when the reader taps it.
   "Share…" uses the device's own share sheet (Web Share API) where available. */
(function () {
  'use strict';
  var me = document.currentScript;
  var site = (me && me.dataset && me.dataset.site) || 'cjt';
  var CFGS = {
    cjt: {
      abbr: 'CJT', name: 'Clay Jar Translation',
      base: 'https://clayjartranslation.github.io/',
      attr: 'Clay Jar Translation (CJT), © 2026 Jose Santiago, CC BY 4.0',
      attrShort: 'Clay Jar Translation (CJT), CC BY 4.0',
      max: 0
    },
    ctb: {
      abbr: 'CTB', name: 'Clay Jar Treasure Bible',
      base: 'https://clayjartranslation.github.io/treasure/',
      attr: '© 2026 Jose Santiago. Clay Jar Treasure Bible™. Used by permission. All rights reserved.',
      attrShort: '© 2026 Jose Santiago. Clay Jar Treasure Bible™. Used by permission.',
      max: 0
    }
  };
  var CFG = CFGS[site] || CFGS.cjt;
  var enc = encodeURIComponent;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(t) { return String(t || '').replace(/\{[a-z]+\}/g, '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim(); }

  function build(o) {
    var vs = (o.verses || []).filter(function (x) { return x && x.text; }).slice().sort(function (a, b) { return a.v - b.v; });
    var trimmed = false;
    if (CFG.max && vs.length > CFG.max) { vs = vs.slice(0, CFG.max); trimmed = true; }
    if (!vs.length) return null;
    var first = vs[0].v, last = vs[vs.length - 1].v;
    var ref = o.bookName + ' ' + o.ch + ':' + first + (last !== first ? '–' + last : '');
    var quote = vs.map(function (x) { return clean(x.text); }).join(' ');
    var url = CFG.base + 's/' + enc(o.bookId) + '/' + o.ch + '.html' + (first > 1 ? '?v=' + first : '');
    var text = '“' + quote + '”\n— ' + ref + ' (' + CFG.abbr + ')\n' + CFG.attr;
    return { ref: ref, quote: quote, url: url, text: text, trimmed: trimmed, title: ref + ' (' + CFG.abbr + ')' };
  }
  // Fit the quote into a platform's character limit, keeping the reference and attribution whole.
  function fit(d, limit) {
    var tail = '”\n— ' + d.ref + ' (' + CFG.abbr + ')\n' + CFG.attrShort;
    var room = limit - tail.length - 1;
    var q = d.quote;
    if (q.length > room) q = q.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, '') + '…';
    return '“' + q + tail;
  }
  function targets(d) {
    var full = d.text + '\n' + d.url;
    return [
      { name: 'Facebook', href: 'https://www.facebook.com/sharer/sharer.php?u=' + enc(d.url), copy: true },
      { name: 'X', href: 'https://twitter.com/intent/tweet?text=' + enc(fit(d, 250)) + '&url=' + enc(d.url) },
      { name: 'Threads', href: 'https://www.threads.com/intent/post?text=' + enc(fit(d, 420)) + '&url=' + enc(d.url) },
      { name: 'Truth Social', href: 'https://truthsocial.com/share?text=' + enc(fit(d, 420)) + '&url=' + enc(d.url) },
      { name: 'WhatsApp', href: 'https://wa.me/?text=' + enc(full) },
      { name: 'Telegram', href: 'https://t.me/share/url?url=' + enc(d.url) + '&text=' + enc(d.text) },
      { name: 'Email', href: 'mailto:?subject=' + enc(d.title) + '&body=' + enc(d.text + '\n\n' + d.url), self: true },
      { name: 'Text message', href: 'sms:?&body=' + enc(full), self: true }
    ];
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, no) {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : no(); } catch (e) { no(e); } finally { ta.remove(); }
    });
  }

  var sheet = null, lastFocus = null;
  function close() {
    if (!sheet) return;
    if (sheet.close && sheet.open) sheet.close(); else sheet.removeAttribute('open');
    sheet.remove(); sheet = null;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function open(o) {
    var d = build(o); if (!d) return;
    close();
    lastFocus = document.activeElement;
    var canNative = typeof navigator.share === 'function';
    var t = targets(d);
    sheet = document.createElement('dialog');
    sheet.className = 'share-sheet';
    sheet.setAttribute('aria-labelledby', 'shareSheetTitle');
    sheet.innerHTML =
      '<div class="share-card">' +
      '<div class="share-head"><h2 id="shareSheetTitle">Share ' + esc(d.ref) + '</h2>' +
      '<button type="button" class="share-x" data-close aria-label="Close sharing"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<blockquote class="share-quote notranslate" translate="no">' + esc(d.text).replace(/\n/g, '<br>') + '</blockquote>' +
      (d.trimmed ? '<p class="share-note">Sharing is limited to ' + CFG.max + ' verses at a time, so this share includes the first ' + CFG.max + '.</p>' : '') +
      (canNative ? '<button type="button" class="btn primary share-native" data-native>Share…</button>' : '') +
      '<div class="share-grid">' +
      t.map(function (x, i) { return '<a class="share-opt" data-i="' + i + '" href="' + esc(x.href) + '"' + (x.self ? '' : ' target="_blank" rel="noopener noreferrer"') + '>' + esc(x.name) + '</a>'; }).join('') +
      '<button type="button" class="share-opt" data-copy>Copy text and link</button>' +
      '</div>' +
      '<p class="share-status" role="status" aria-live="polite"></p>' +
      '<p class="share-privacy">Nothing loads from these sites until you tap one. Each site’s own terms and privacy policy apply. See the <a href="privacy.html#sharing">Privacy Policy</a> and <a href="terms.html#sharing">Terms</a>.</p>' +
      '</div>';
    document.body.appendChild(sheet);
    var status = sheet.querySelector('.share-status');
    function say(m) { status.textContent = m; }
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('[data-close]')) { close(); return; }
      if (e.target.closest('[data-copy]')) {
        copy(d.text + '\n' + d.url).then(function () { say('Copied. Paste it anywhere.'); }, function () { say('Could not copy. Press and hold the text above to copy it.'); });
        return;
      }
      var a = e.target.closest('a.share-opt');
      if (a && t[+a.dataset.i] && t[+a.dataset.i].copy) {
        copy(d.text + '\n' + d.url).then(function () { say('The verse is copied too. Paste it into your Facebook post.'); }, function () {});
      }
      if (e.target.closest('[data-native]')) {
        navigator.share({ title: d.title, text: d.text, url: d.url }).then(function () { close(); }, function (err) {
          if (!err || err.name !== 'AbortError') say('This device could not open its share menu. Use a button below.');
        });
      }
    });
    sheet.addEventListener('close', function () { if (sheet) { sheet.remove(); sheet = null; } });
    if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', '');
    var first = sheet.querySelector('[data-native]') || sheet.querySelector('.share-opt');
    if (first) first.focus();
  }
  window.ScriptureShare = { open: open, build: build, targets: targets, fit: fit, config: CFG };
})();
