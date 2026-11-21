/* Bible in a Year: today's four readings (Old Testament, Psalms, Proverbs, New Testament)
   and the whole 365-day plan from data/bible-in-a-year.json. "Today" is the date in
   America/New_York on the reader's clock; ?d=MM-DD shows another day. February 29 uses
   the February 28 portion. No third-party scripts, no tracking. */
(function () {
  'use strict';
  var main = document.getElementById('biay');
  if (!main) return;
  var site = main.getAttribute('data-site') || 'cjt';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var KINDS = [['ot', 'Old Testament'], ['ps', 'Psalms'], ['pr', 'Proverbs'], ['nt', 'New Testament']];
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nyToday() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      return { key: o.month + '-' + o.day, year: +o.year };
    } catch (e) {
      var d = new Date();
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
  Promise.all([
    fetch('data/bible-in-a-year.json').then(function (r) { if (!r.ok) throw new Error('plan'); return r.json(); }),
    fetch('data/books.json').then(function (r) { if (!r.ok) throw new Error('books'); return r.json(); })
  ]).then(function (res) {
    var plan = res[0], cat = res[1];
    var done = {};
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
    var html = '<section class="card biay-today" aria-labelledby="biayDay">' +
      '<p class="eyebrow">' + (isToday ? 'Today' : 'Day ' + (idx + 1) + ' of 365') + '</p>' +
      '<h2 id="biayDay">' + esc(niceDate(key, now.year)) + '</h2>' +
      (key === '02-29' ? '<p class="muted">Leap day: read the February 28 portion again, or catch up on a day you missed.</p>' : '') +
      '<ul class="biay-portions">' + KINDS.map(function (k) { return '<li><strong>' + k[1] + ':</strong> ' + portion(day, k[0]) + '</li>'; }).join('') + '</ul>' +
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
  }).catch(function () {
    main.removeAttribute('aria-busy');
    main.innerHTML = '<p class="muted">The reading plan could not be loaded. If you are offline, open this page once while online so it can be saved.</p>';
  });
  if (site === 'cjt' && navigator.serviceWorker) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
