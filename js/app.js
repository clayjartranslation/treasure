/* Clay Jar Treasure Bible (CTB) reader. Plain JavaScript, no dependencies, no tracking. */
(function () {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const main = $('#main');
  const root = document.documentElement;
  const NAME = 'Clay Jar Treasure Bible';
  const TM = '';

  // ---------- Settings ----------
  const settings = Object.assign({ theme: 'auto', size: 19, notes: true, resume: false, rate: 1, voice: '', autoNext: true }, readJSON('ctb-settings'));
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } }
  function saveSettings() { try { localStorage.setItem('ctb-settings', JSON.stringify(settings)); } catch (e) {} }
  function applySettings() {
    if (settings.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = settings.theme;
    root.style.setProperty('--read-size', settings.size + 'px');
    root.classList.toggle('notes-off', !settings.notes);
    $('#sizeOut').textContent = settings.size;
    $('#notesToggle').checked = settings.notes;
    $('#resumeToggle').checked = !!settings.resume;
    document.querySelectorAll('[data-theme-opt]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === settings.theme)));
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#1d1410' : '#fff9eb'));
  }
  $('#sizeDown').addEventListener('click', () => { settings.size = Math.max(14, settings.size - 1); applySettings(); saveSettings(); });
  $('#sizeUp').addEventListener('click', () => { settings.size = Math.min(30, settings.size + 1); applySettings(); saveSettings(); });
  $('#notesToggle').addEventListener('change', (e) => { settings.notes = e.target.checked; applySettings(); saveSettings(); });
  $('#resumeToggle').addEventListener('change', (e) => { settings.resume = e.target.checked; saveSettings(); });
  document.querySelectorAll('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => { settings.theme = b.dataset.themeOpt; applySettings(); saveSettings(); }));
  const settingsBtn = $('#settingsBtn'), settingsPanel = $('#settings');
  function toggleSettings(open) {
    const o = open === undefined ? settingsPanel.hidden : open;
    settingsPanel.hidden = !o; settingsBtn.setAttribute('aria-expanded', String(o));
  }
  settingsBtn.addEventListener('click', () => toggleSettings());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); toggleSettings(false); hideBar(); } });
  applySettings();

  // ---------- Data ----------
  let catalog = null, front = null;
  const bookCache = {};
  const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  async function loadCatalog() { return catalog || (catalog = await getJSON('data/books.json')); }
  async function loadFront() { return front || (front = await getJSON('data/front-matter.json')); }
  async function loadBook(id) {
    if (bookCache[id]) return bookCache[id];
    const cat = await loadCatalog();
    const b = cat.books.find((x) => x.id === id);
    if (!b || !b.file) return null;
    return (bookCache[id] = await getJSON(b.file));
  }

  // ---------- Helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = (t) => t.replace(/\{[a-z]+\}/g, '');
  const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  const DIV_NOTES = {
    'Old Testament': 'The 39 books of the Hebrew Bible, translated from the Hebrew and Aramaic and checked against the Dead Sea Scrolls, the Septuagint, and the Samaritan Pentateuch.',
    Apocrypha: 'Books accepted as Scripture by Catholic and Orthodox churches, translated mainly from the Septuagint and early Hebrew and Aramaic finds.',
    'New Testament': 'The 27 books of the New Testament, translated from the Greek with the earliest papyri and codices.',
    Pseudepigrapha: 'Ancient Jewish and Christian writings included for study. 1 Enoch and Jubilees are in the Ethiopian Orthodox canon.',
  };
  function setTitle(text, onClick) {
    const t = $('#barTitle');
    if (!text) { t.hidden = true; t.onclick = null; return; }
    t.hidden = false; t.textContent = text; t.onclick = onClick;
    t.setAttribute('aria-label', text + ': choose another chapter');
  }
  function render(html, title) {
    main.innerHTML = html;
    document.title = title ? title + ' · CTB' : NAME;
  }

  // ---------- Routes ----------
  async function route() {
    closeSheet(); toggleSettings(false); hideBar(); readerCtx = null;
    const hash = location.hash.replace(/^#\/?/, '');
    const [path, query] = hash.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    try {
      if (au.active && !au.advancing && parts[0] !== 'read') stopAudio();
      if (!parts.length) await home();
      else if (parts[0] === 'books') await books(parts[1]);
      else if (parts[0] === 'read') await reader(parts[1], +parts[2] || 1, +parts[3] || 0);
      else if (parts[0] === 'saved') await savedPage(parts[1]);
      else if (parts[0] === 'search') await search(new URLSearchParams(query || '').get('q') || '');
      else if (parts[0] === 'about') await about(parts[1]);
      else await home();
    } catch (err) {
      console.error(err);
      render('<p class="empty">This page could not be loaded. If you are offline, open it once while online so it can be saved for offline reading.</p>');
    }
  }
  window.addEventListener('hashchange', () => { route().then(() => { if (!/\/read\/.+\/\d+\/\d+/.test(location.hash) && !/#\/about\/./.test(location.hash)) window.scrollTo(0, 0); }); });

  // ----- Home -----
  async function home() {
    const [fm, cat] = await Promise.all([loadFront(), loadCatalog()]);
    const prayer = fm.sections.find((s) => s.id === 'prayer');
    const done = cat.books.filter((b) => b.translated.length);
    const totalCh = cat.books.reduce((n, b) => n + (parseInt(b.chapterCount, 10) || 0), 0);
    const doneCh = cat.books.reduce((n, b) => n + b.translated.length, 0);
    const first = done[0];
    const last = readJSON('ctb-last');
    setTitle('');
    const prayerHtml = prayer.blocks.filter((b) => b.type === 'text').map((b) => `<p>${esc(b.text)}</p>`).join('');
    render(`
      <section class="hero" aria-labelledby="homeTitle">
        <img class="hero-logo" src="icons/ctb-logo-720.jpg" width="330" height="330"
             alt="Clay Jar Treasure Bible logo: a terracotta clay jar holding a scroll, with rays of light rising from it.">
        <h1 id="homeTitle">${NAME}</h1>
        <p class="tag">The Bible in clear, everyday English. Free to read, with no sign-up and no ads.</p>
        <p class="free-line"><strong>Free forever:</strong> no sign-up, no ads, no tracking.</p>
        <div class="cta">
          ${last.book ? `<a class="btn primary" href="#/read/${esc(last.book)}/${last.ch}${last.v > 1 ? '/' + last.v : ''}">Continue ${esc(last.name)} ${last.ch}${last.v > 1 ? ':' + last.v : ''}</a>` : ''}
          ${first ? `<a class="btn ${last.book ? '' : 'primary'}" href="#/read/${first.id}/${first.translated[0]}">Start reading ${esc(first.name)}</a>` : ''}
          <a class="btn" href="#/books">All books</a>
        </div>
        <p class="verse-quote">God’s treasure, carried in clay jars like us.<br><small>Based on 2 Corinthians 4:7</small></p>
      </section>

      <section class="card prayer" aria-labelledby="prayerTitle">
        <h2 id="prayerTitle">${esc(prayer.heading)}</h2>
        ${prayerHtml}
      </section>

      <section class="card progress" aria-labelledby="progTitle">
        <h2 id="progTitle" style="margin:0;font-size:1.1rem">Progress</h2>
        <p class="muted" style="margin:.35rem 0 0">${done.map((b) => `${esc(b.name)} ${rangeText(b.translated)}`).join(', ') || 'Nothing yet'} translated so far: ${doneCh} of about ${totalCh} chapters in ${cat.books.length} books.</p>
        <div class="meter" role="img" aria-label="${doneCh} of about ${totalCh} chapters translated"><i style="width:${Math.max(1, (doneCh / totalCh) * 100).toFixed(2)}%"></i></div>
      </section>

      <section class="card share" aria-labelledby="shareTitle" style="margin-top:1.25rem">
        <h2 id="shareTitle" style="margin:0;font-size:1.1rem">Download and share</h2>
        <p class="muted" style="margin:.35rem 0 .75rem">This Bible is free to read online, and this site works offline once you have opened it. It is copyrighted. You may quote brief passages with credit (see the copyright page).</p>
        <div class="cta" style="justify-content:flex-start;margin:0">
          <button class="btn" type="button" id="shareBtn">Share this Bible</button>
        </div>
      </section>

      <ul class="links" aria-label="More">
        <li><a href="#/saved">Bookmarks and highlights <span>${store.bm.length} bookmark${store.bm.length === 1 ? '' : 's'}, ${store.hl.length} highlight${store.hl.length === 1 ? '' : 's'}</span></a></li>
        <li><a href="#/about">About this Bible <span>name, copyright, style, sources</span></a></li>
        <li><a href="#/about/approach">How we translate <span>thought for thought, in plain English</span></a></li>
        <li><a href="#/about/copyright">Copyright and quoting <span>how you may share it</span></a></li>
      </ul>`);
    $('#shareBtn').addEventListener('click', async () => {
      const data = { title: NAME, text: 'The Bible in clear, everyday English. Free to read.', url: location.href.split('#')[0] };
      if (navigator.share) { try { await navigator.share(data); } catch (e) {} return; }
      try { await navigator.clipboard.writeText(data.url); $('#shareBtn').textContent = 'Link copied'; } catch (e) { prompt('Copy this link:', data.url); }
    });
  }
  function rangeText(arr) {
    if (!arr.length) return '';
    const out = []; let s = arr[0], p = arr[0];
    for (const n of arr.slice(1).concat([null])) { if (n === p + 1) { p = n; continue; } out.push(s === p ? `${s}` : `${s}–${p}`); s = p = n; }
    return out.join(', ');
  }

  // ----- Book list -----
  async function books(openId) {
    const cat = await loadCatalog();
    let active = sessionStorage.getItem('ctb-div') || 'Old Testament';
    if (openId) { const b = cat.books.find((x) => x.id === openId); if (b) active = b.division; }
    setTitle('');
    const draw = () => {
      const list = cat.books.filter((b) => b.division === active);
      const tabs = cat.divisions.map((d) => {
        const n = cat.books.filter((b) => b.division === d).length;
        return `<button class="tab" role="tab" id="tab-${d.replace(/\s/g, '')}" aria-controls="bookPanel" aria-selected="${d === active}" tabindex="${d === active ? 0 : -1}" data-div="${esc(d)}">${esc(d)}<small>${n}</small></button>`;
      }).join('');
      const rows = list.map((b) => {
        const total = parseInt(b.chapterCount, 10);
        if (!b.translated.length) {
          return `<li><div class="book-row soon" aria-disabled="true"><span class="bname">${esc(b.name)}</span><span class="meta"><span class="pill">Coming soon</span></span></div></li>`;
        }
        const open = b.id === openId || (list.filter((x) => x.translated.length).length === 1 && !openId);
        let grid = '';
        if (!isNaN(total)) for (let i = 1; i <= total; i++) grid += b.translated.includes(i) ? `<a href="#/read/${b.id}/${i}" aria-label="${esc(b.name)} chapter ${i}">${i}</a>` : `<span aria-hidden="true">${i}</span>`;
        return `<li><button class="book-row" type="button" aria-expanded="${open}" aria-controls="ch-${b.id}" data-book="${b.id}"><span class="bname">${esc(b.name)}</span><span class="meta"><b>${b.translated.length}</b> of ${esc(b.chapterCount)} chapters ready</span></button>
          <div class="chapters" id="ch-${b.id}" ${open ? '' : 'hidden'} role="group" aria-label="${esc(b.name)} chapters">${grid}</div></li>`;
      }).join('');
      render(`<h1>Books</h1>
        <div class="tabs" role="tablist" aria-label="Collections">${tabs}</div>
        <div id="bookPanel" role="tabpanel" aria-labelledby="tab-${active.replace(/\s/g, '')}">
          <p class="division-note">${esc(DIV_NOTES[active] || '')}</p>
          <ul class="book-list">${rows}</ul>
        </div>`, 'Books');
      main.querySelectorAll('.tab').forEach((t) => {
        t.addEventListener('click', () => { active = t.dataset.div; sessionStorage.setItem('ctb-div', active); draw(); $('.tab[aria-selected="true"]').focus(); });
        t.addEventListener('keydown', (e) => {
          const i = cat.divisions.indexOf(active);
          const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
          if (j === null) return;
          active = cat.divisions[(j + cat.divisions.length) % cat.divisions.length]; sessionStorage.setItem('ctb-div', active); draw(); $('.tab[aria-selected="true"]').focus();
        });
      });
      main.querySelectorAll('.book-row[data-book]').forEach((btn) => btn.addEventListener('click', () => {
        const g = $('#ch-' + btn.dataset.book); g.hidden = !g.hidden; btn.setAttribute('aria-expanded', String(!g.hidden));
      }));
    };
    draw();
  }

  // ----- Reader -----
  async function reader(id, n, verse) {
    const [cat, book] = [await loadCatalog(), await loadBook(id)];
    if (!book) return books();
    const ch = book.chapters.find((c) => c.n === n) || book.chapters[0];
    const idx = book.chapters.indexOf(ch);
    const prev = book.chapters[idx - 1], next = book.chapters[idx + 1];
    const notesBy = {}; ch.notes.forEach((x) => (notesBy[x.m] = x));
    const starts = ch.paras.concat([ch.verses.length + 1]);
    const fnHtml = (t) => esc(t).replace(/\{([a-z]+)\}/g, (_, m) => notesBy[m] ? `<button type="button" class="fn" data-m="${m}" aria-label="Footnote ${m}" aria-haspopup="dialog">${m}</button>` : '');
    // Optional chapter heading (e.g., the five books of Psalms) and title (a psalm's superscription).
    const pre = (ch.heading ? `<h2 class="ch-heading">${esc(ch.heading)}</h2>` : '') + (ch.title ? `<p class="ch-title">${fnHtml(ch.title)}</p>` : '');
    const paras = ch.paras.map((s, pi) => {
      const vs = ch.verses.slice(s - 1, starts[pi + 1] - 1).map((v) => {
        const body = esc(v.text).replace(/\{([a-z]+)\}/g, (_, m) => {
          const note = notesBy[m];
          return note ? `<button type="button" class="fn" data-m="${m}" aria-label="Footnote ${m}" aria-haspopup="dialog">${m}</button>` : '';
        });
        const isFirst = v.v === 1;
        const sup = `<sup class="vnum${isFirst ? ' first' : ''}" role="button" tabindex="0" aria-label="Verse ${v.v}: bookmark or highlight">${v.v}</sup>`;
        // Poetry: a verse text may contain line breaks ("\n"); each becomes its own indented line.
        if (body.includes('\n')) {
          const lines = body.split('\n').map((l, li) => `<span class="pl">${li === 0 ? sup : ''}${l.trim()}</span>`).join('');
          return `<span class="verse" id="v${v.v}" data-v="${v.v}">${lines}</span>`;
        }
        return `<span class="verse" id="v${v.v}" data-v="${v.v}">${sup}${body}</span>`;
      }).join(' ');
      const poem = ch.verses.slice(s - 1, starts[pi + 1] - 1).some((v) => v.text.includes('\n'));
      const sub = ch.subheads && ch.subheads[s] ? `<h3 class="ch-sub">${esc(ch.subheads[s])}</h3>` : '';
      return `${sub}<p${poem ? ' class="poem"' : ''}>${vs}</p>`;
    }).join('');
    const notes = ch.notes.map((x) => `<li id="note-${x.m}"><span class="m">${x.m}</span><a class="r" href="#/read/${id}/${ch.n}/${x.ref.split(':')[1] || ''}">${esc(x.ref)}</a><span>${esc(x.text)}</span></li>`).join('');
    const bookMeta = cat.books.find((b) => b.id === id);
    setTitle(`${book.name} ${ch.n}`, () => { location.hash = '#/books/' + id; });
    render(`
      <article aria-labelledby="chTitle">
        <header class="reader-head">
          <p class="eyebrow">${esc(book.division)}</p>
          <h1 id="chTitle">${esc(book.name)} <span class="chapter-num">Chapter ${ch.n}</span></h1>
          ${(SPEECH || window.Audio) ? '<button type="button" class="btn listen-btn" id="listenBtn"></button>' : '<p class="muted listen-na">Listening is not available in this browser.</p>'}
        </header>
        <div class="scripture">${pre}${paras}</div>
        <section class="notes" aria-labelledby="notesTitle">
          <h2 id="notesTitle">Footnotes to ${esc(book.name)} ${ch.n}</h2>
          <ol>${notes}</ol>
        </section>
        ${book.sourceNote && !next ? `<p class="source-note">${esc(book.sourceNote)}</p>` : ''}
        <nav class="pager" aria-label="Chapters">
          <a class="btn" ${prev ? `href="#/read/${id}/${prev.n}"` : 'aria-disabled="true" tabindex="-1"'}>← ${prev ? esc(book.name) + ' ' + prev.n : ''}</a>
          <a class="btn" ${next ? `href="#/read/${id}/${next.n}"` : 'aria-disabled="true" tabindex="-1"'}>${next ? esc(book.name) + ' ' + next.n : ''} →</a>
        </nav>
        ${!next && bookMeta && bookMeta.translated.length < parseInt(bookMeta.chapterCount, 10) ? `<p class="empty">${esc(book.name)} ${ch.n + 1} and following are coming soon.</p>` : ''}
      </article>`, `${book.name} ${ch.n}`);
    main.querySelectorAll('.fn').forEach((b) => b.addEventListener('click', () => openSheet(notesBy[b.dataset.m], b)));
    readerCtx = { id, name: book.name, ch };
    try { localStorage.setItem('ctb-last', JSON.stringify({ book: id, name: book.name, ch: ch.n, v: verse || 0 })); } catch (e) {}
    afterReaderRender(book, ch, idx, verse);
    if (verse) {
      const el = $('#v' + verse);
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    } else window.scrollTo(0, 0);
  }

  // ---------- Footnote sheet ----------
  const sheet = $('#sheet'), backdrop = $('#sheetBackdrop');
  let lastTrigger = null;
  function openSheet(note, trigger) {
    if (!note) return;
    lastTrigger = trigger;
    document.querySelectorAll('.fn.active').forEach((x) => x.classList.remove('active'));
    trigger.classList.add('active');
    $('#sheetRef').textContent = `Note ${note.m} · ${note.ref}`;
    $('#sheetText').textContent = note.text;
    sheet.hidden = false; backdrop.hidden = false;
    $('#sheetClose').focus();
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true; backdrop.hidden = true;
    document.querySelectorAll('.fn.active').forEach((x) => x.classList.remove('active'));
    if (lastTrigger && document.body.contains(lastTrigger)) lastTrigger.focus();
  }
  $('#sheetClose').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); $('#sheetClose').focus(); } });

  // ----- Search -----
  async function search(q) {
    setTitle('');
    const cat = await loadCatalog();
    const avail = cat.books.filter((b) => b.file);
    render(`<h1>Search</h1>
      <form class="search-box" role="search" id="searchForm">
        <label for="q" class="visually-hidden">Search the translated text</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="q" type="search" placeholder="Search words or a reference, e.g. Genesis 3:15" value="${esc(q)}" autocomplete="off" enterkeyhint="search">
      </form>
      <div class="search-opts"><label><input type="checkbox" id="inNotes"> Include footnotes</label></div>
      <p class="count" id="count" aria-live="polite"></p>
      <ul class="results" id="results"></ul>`, 'Search');
    const input = $('#q'), inNotes = $('#inNotes');
    inNotes.checked = sessionStorage.getItem('ctb-innotes') === '1';
    const loaded = await Promise.all(avail.map((b) => loadBook(b.id)));
    const index = [];
    loaded.forEach((book) => book && book.chapters.forEach((c) => {
      c.verses.forEach((v) => index.push({ kind: 'v', book, c: c.n, v: v.v, text: plain(v.text) }));
      c.notes.forEach((x) => index.push({ kind: 'n', book, c: c.n, v: +(x.ref.split(':')[1] || 0), m: x.m, text: x.text }));
    }));
    const run = () => {
      const raw = input.value.trim();
      history.replaceState(null, '', '#/search' + (raw ? '?q=' + encodeURIComponent(raw) : ''));
      const out = $('#results'), count = $('#count');
      if (raw.length < 2) { out.innerHTML = ''; count.textContent = raw ? 'Type at least two letters.' : `Searching ${avail.map((b) => b.name + ' ' + rangeText(b.translated)).join(', ')}.`; return; }
      // Reference lookup, e.g. "gen 3:15" or "Genesis 3"
      const ref = /^([1-4]?\s*[a-z][a-z .]*?)\s*(\d+)(?::(\d+))?$/i.exec(raw);
      if (ref) {
        const nm = fold(ref[1]).replace(/\s+/g, '');
        const b = avail.find((x) => fold(x.name).replace(/\s+/g, '').startsWith(nm));
        if (b && b.translated.includes(+ref[2])) {
          count.textContent = '';
          out.innerHTML = `<li><a href="#/read/${b.id}/${ref[2]}${ref[3] ? '/' + ref[3] : ''}"><span class="ref">Go to ${esc(b.name)} ${ref[2]}${ref[3] ? ':' + ref[3] : ''}</span></a></li>`;
          return;
        }
      }
      const terms = fold(raw).replace(/"/g, '').split(/\s+/).filter(Boolean);
      const hits = index.filter((e) => (e.kind === 'v' || inNotes.checked) && terms.every((t) => fold(e.text).includes(t)));
      count.textContent = hits.length ? `${hits.length} result${hits.length === 1 ? '' : 's'}${hits.length > 200 ? ', showing the first 200' : ''}` : 'No matches in the chapters translated so far.';
      out.innerHTML = hits.slice(0, 200).map((e) => {
        const ref = `${e.book.name} ${e.c}:${e.v}`;
        return `<li><a href="#/read/${e.book.id}/${e.c}/${e.v}"><span class="ref">${esc(ref)}${e.kind === 'n' ? ` <small>footnote ${e.m}</small>` : ''}</span><span class="txt">${highlight(e.text, terms)}</span></a></li>`;
      }).join('');
    };
    let timer;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    inNotes.addEventListener('change', () => { sessionStorage.setItem('ctb-innotes', inNotes.checked ? '1' : '0'); run(); });
    $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); run(); input.blur(); });
    run();
    if (!q) input.focus();
  }
  function highlight(text, terms) {
    // Highlight on the folded string, map back to original positions (folding keeps length for these characters).
    const f = fold(text);
    if (f.length !== text.length) return esc(text);
    const marks = new Array(text.length).fill(false);
    terms.forEach((t) => { let i = f.indexOf(t); while (i > -1) { for (let k = i; k < i + t.length; k++) marks[k] = true; i = f.indexOf(t, i + t.length); } });
    let out = '', open = false;
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !open) { out += '<mark>'; open = true; }
      if (!marks[i] && open) { out += '</mark>'; open = false; }
      out += esc(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }

  // ----- Front matter -----
  async function about(anchor) {
    const fm = await loadFront();
    setTitle('');
    const block = (b, level) => {
      switch (b.type) {
        case 'text': return `<p>${esc(b.text)}</p>`;
        case 'callout': return `<div class="callout ${esc(b.tone)}" role="note"><strong>${esc(b.lead)}</strong><p>${esc(b.text)}</p></div>`;
        case 'properties': return `<dl class="props">${b.items.map((i) => `<dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd>`).join('')}</dl>`;
        case 'steps': return `<ol class="steps">${b.steps.map((s) => `<li><b>${esc(s.title)}</b><span>${esc(s.detail)}</span></li>`).join('')}</ol>`;
        case 'table': return `<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table class="stack"><thead><tr>${b.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td${b.columns[i] ? ` data-label="${esc(b.columns[i])}"` : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        case 'section': {
          const h = Math.min(level, 4);
          return `<section${b.id ? ` id="${esc(b.id)}"` : ''}><h${h}>${esc(b.heading)}</h${h}>${b.blocks.map((x) => block(x, level + 1)).join('')}</section>`;
        }
      }
      return '';
    };
    render(`<div class="fm prose">
      <p class="eyebrow">Front matter</p>
      <h1>${NAME}</h1>
      <p class="muted">${esc(fm.summary)}</p>
      <nav class="toc" aria-label="Sections">${fm.sections.map((s) => `<a href="#/about/${s.id}">${esc(s.heading)}</a>`).join('')}</nav>
      ${fm.sections.map((s) => block(s, 2)).join('')}
    </div>`, 'About');
    if (anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView(); }
    else window.scrollTo(0, 0);
  }

  // =====================================================================
  // Bookmarks, highlights, listening (all saved on this device only)
  // =====================================================================
  const COLORS = ['yellow', 'green', 'blue', 'pink'];
  const loadArr = (k) => { try { const a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const store = { bm: loadArr('ctb-bookmarks'), hl: loadArr('ctb-highlights') };
  let readerCtx = null;       // { id, name, ch } for the chapter on screen
  let storeWarned = false;
  function persist() {
    try {
      localStorage.setItem('ctb-bookmarks', JSON.stringify(store.bm));
      localStorage.setItem('ctb-highlights', JSON.stringify(store.hl));
    } catch (e) {
      if (!storeWarned) { storeWarned = true; toast('Your phone would not let this page save. Bookmarks and highlights may be lost when you close it.'); }
    }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const snip = (t, n = 110) => { t = plain(t).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };

  // ---------- Toast ----------
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg, action) {
    toastEl.innerHTML = `<span></span>${action ? '<button type="button" class="toast-act"></button>' : ''}`;
    toastEl.firstChild.textContent = msg;
    if (action) { const b = $('.toast-act', toastEl); b.textContent = action.label; b.addEventListener('click', () => { toastEl.hidden = true; action.fn(); }); }
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, action ? 6000 : 2600);
  }

  // ---------- Verse text and offsets ----------
  // A verse's "highlight text" is its visible words only: verse numbers and footnote markers are skipped.
  function textNodes(el) {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('.vnum,.fn') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let n; while ((n = w.nextNode())) out.push(n);
    return out;
  }
  const verseText = (el) => textNodes(el).map((n) => n.data).join('');
  // Number of visible characters in the verse before the point (node, off).
  function offsetAt(el, node, off) {
    let total = 0;
    const p = document.createRange(); p.setStart(node, off); p.collapse(true);
    for (const t of textNodes(el)) {
      const r = document.createRange(); r.selectNodeContents(t);
      const c = r.comparePoint(node, off);
      if (c < 0) return total;
      if (c === 0) {
        if (node === t) return total + off;
        if (p.compareBoundaryPoints(Range.START_TO_START, r) === 0) return total;
      }
      total += t.data.length;
    }
    return total;
  }

  // ---------- Highlights ----------
  function unpaint(el) {
    const ms = el.querySelectorAll('mark.hl');
    if (!ms.length) return;
    ms.forEach((m) => m.replaceWith(...m.childNodes));
    el.normalize();
  }
  function paintVerse(el) {
    if (!readerCtx) return;
    unpaint(el);
    const v = +el.dataset.v;
    const list = store.hl.filter((h) => h.book === readerCtx.id && h.ch === readerCtx.ch.n && h.v === v);
    if (!list.length) return;
    const nodes = textNodes(el); let pos = 0;
    const recs = nodes.map((n) => { const r = { n, s: pos, e: pos + n.data.length }; pos = r.e; return r; });
    const full = nodes.map((n) => n.data).join('');
    let dirty = false;
    list.sort((a, b) => b.s - a.s);
    for (const h of list) {
      let { s, e } = h;
      if (full.slice(s, e) !== h.text) {            // the translation text changed: find the words again
        const i = h.text ? full.indexOf(h.text) : -1;
        if (i < 0) continue;
        s = h.s = i; e = h.e = i + h.text.length; dirty = true;
      }
      for (let k = recs.length - 1; k >= 0; k--) {
        const r = recs[k], len = r.n.data.length;
        const a = Math.max(s, r.s) - r.s, b = Math.min(e, r.e) - r.s;
        if (b <= a || a >= len) continue;
        try {
          const rg = document.createRange(); rg.setStart(r.n, a); rg.setEnd(r.n, Math.min(b, len));
          const m = document.createElement('mark');
          m.className = 'hl hl-' + h.color; m.dataset.hid = h.id;
          rg.surroundContents(m);
        } catch (err) { /* skip a piece that cannot be wrapped */ }
      }
    }
    if (dirty) persist();
  }
  function paintAll() { main.querySelectorAll('.scripture .verse').forEach(paintVerse); }
  // Remove the characters s..e of a verse from every saved highlight there (splitting highlights as needed).
  function carve(book, ch, v, s, e) {
    const out = [];
    for (const h of store.hl) {
      if (h.book !== book || h.ch !== ch || h.v !== v || h.e <= s || h.s >= e) { out.push(h); continue; }
      if (h.s < s) out.push(Object.assign({}, h, { e: s, text: h.text.slice(0, s - h.s), whole: false }));
      if (h.e > e) out.push(Object.assign({}, h, { id: uid(), s: e, text: h.text.slice(e - h.s), whole: false }));
    }
    store.hl = out;
  }
  function addHighlight(a, color, whole) {
    const ctx = readerCtx;
    carve(ctx.id, ctx.ch.n, a.v, a.s, a.e);
    store.hl.push({ id: uid(), book: ctx.id, name: ctx.name, ch: ctx.ch.n, v: a.v, s: a.s, e: a.e, color, text: a.text, whole: !!whole, t: Date.now() });
  }

  // ---------- Bookmarks ----------
  const findBm = (book, ch, v) => store.bm.find((b) => b.book === book && b.ch === ch && b.v === v);
  function markBookmarks() {
    if (!readerCtx) return;
    main.querySelectorAll('.scripture .verse').forEach((el) => {
      const on = !!findBm(readerCtx.id, readerCtx.ch.n, +el.dataset.v);
      el.classList.toggle('bm', on);
      const sup = $('.vnum', el);
      if (sup) sup.setAttribute('aria-label', `Verse ${el.dataset.v}${on ? ', bookmarked' : ''}: bookmark or highlight`);
    });
  }
  function toggleBookmark(v) {
    const ctx = readerCtx; if (!ctx) return;
    const ex = findBm(ctx.id, ctx.ch.n, v);
    if (ex) {
      store.bm = store.bm.filter((b) => b !== ex); persist(); markBookmarks();
      toast(`Bookmark removed: ${ctx.name} ${ctx.ch.n}:${v}`, { label: 'Undo', fn: () => { store.bm.push(ex); persist(); markBookmarks(); } });
    } else {
      const verse = ctx.ch.verses.find((x) => x.v === v);
      store.bm.push({ id: uid(), book: ctx.id, name: ctx.name, ch: ctx.ch.n, v, text: snip(verse ? verse.text : ''), t: Date.now() });
      persist(); markBookmarks();
      toast(`Bookmarked ${ctx.name} ${ctx.ch.n}:${v}`);
    }
  }

  // ---------- Floating toolbar (tap a verse, tap a highlight, or select words) ----------
  const bar = $('#hlbar');
  const tb = { mode: null, anchors: [], hid: null, verse: 0, touching: false, hideTimer: null };
  const scriptureEl = () => $('.scripture', main);

  function anchorsFromRange(range) {
    const root = scriptureEl(); if (!root || !readerCtx) return [];
    const host = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!host || !root.contains(host)) return [];
    const out = [];
    root.querySelectorAll('.verse').forEach((el) => {
      if (!range.intersectsNode(el)) return;
      const text = verseText(el);
      let s = el.contains(range.startContainer) ? offsetAt(el, range.startContainer, range.startOffset) : 0;
      let e = el.contains(range.endContainer) ? offsetAt(el, range.endContainer, range.endOffset) : text.length;
      while (s < e && /\s/.test(text[s])) s++;
      while (e > s && /\s/.test(text[e - 1])) e--;
      if (e > s) out.push({ v: +el.dataset.v, s, e, text: text.slice(s, e), el });
    });
    return out;
  }
  function positionBar(rect, below) {
    bar.style.visibility = 'hidden'; bar.hidden = false;
    const w = bar.offsetWidth, h = bar.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), vw - w - 8) + window.scrollX;
    let top = rect.bottom + window.scrollY + below;
    if (rect.bottom + below + h > window.innerHeight - 8 && rect.top - h - 8 > 60) top = rect.top + window.scrollY - h - (below > 12 ? 52 : 8);
    bar.style.left = left + 'px'; bar.style.top = Math.max(top, 0) + 'px'; bar.style.visibility = '';
  }
  function showBar(mode, info) {
    clearTimeout(tb.hideTimer);
    Object.assign(tb, { mode }, info);
    const v = tb.mode === 'selection' ? tb.anchors[0].v : tb.verse;
    const bmOn = !!findBm(readerCtx.id, readerCtx.ch.n, v);
    const bb = $('#tbBm'); bb.setAttribute('aria-pressed', String(bmOn)); bb.setAttribute('aria-label', bmOn ? `Remove bookmark on verse ${v}` : `Bookmark verse ${v}`);
    $('#tbLabel').textContent = tb.mode === 'selection' ? 'Highlight selected words' : tb.mode === 'mark' ? 'Change or remove this highlight' : `Verse ${v}`;
    bar.querySelectorAll('.tb-color').forEach((b) => b.setAttribute('aria-label', (tb.mode === 'verse' ? 'Highlight whole verse ' : tb.mode === 'mark' ? 'Change highlight to ' : 'Highlight ') + b.dataset.color));
    $('#tbListen').hidden = !SPEECH;
    main.querySelectorAll('.verse.picked').forEach((x) => x.classList.remove('picked'));
    if (tb.mode === 'verse') { const el = $('#v' + v, main); if (el) el.classList.add('picked'); }
  }
  function hideBar() {
    if (bar.hidden && !tb.mode) return;
    bar.hidden = true; tb.mode = null; tb.anchors = []; tb.hid = null;
    main.querySelectorAll('.verse.picked').forEach((x) => x.classList.remove('picked'));
  }
  function openVerseBar(verseEl, viaKeyboard) {
    const v = +verseEl.dataset.v;
    if (tb.mode === 'verse' && tb.verse === v && !viaKeyboard) return hideBar();
    showBar('verse', { verse: v, anchors: [], hid: null });
    const rects = verseEl.getClientRects();
    const r = rects[0] || verseEl.getBoundingClientRect();
    positionBar(r, 6);
    if (viaKeyboard) $('#tbBm').focus();
  }
  function openMarkBar(markEl) {
    const hid = markEl.dataset.hid; const h = store.hl.find((x) => x.id === hid); if (!h) return;
    if (tb.mode === 'mark' && tb.hid === hid) return hideBar();
    showBar('mark', { hid, verse: h.v, anchors: [] });
    positionBar(markEl.getClientRects()[0] || markEl.getBoundingClientRect(), 6);
  }
  // Selection handling. iOS shows its own Copy menu above the words, so ours appears below them.
  let selTimer;
  function evaluateSelection() {
    if (!readerCtx) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if (tb.mode === 'selection' && !tb.touching) { clearTimeout(tb.hideTimer); tb.hideTimer = setTimeout(() => { if (tb.mode === 'selection' && !tb.touching) hideBar(); }, 350); }
      return;
    }
    const range = sel.getRangeAt(0);
    const anchors = anchorsFromRange(range);
    if (!anchors.length) { if (tb.mode === 'selection') hideBar(); return; }
    showBar('selection', { anchors, hid: null });
    const rs = range.getClientRects();
    const r = rs.length ? rs[rs.length - 1] : range.getBoundingClientRect();
    positionBar(r, 34);
  }
  document.addEventListener('selectionchange', () => { clearTimeout(selTimer); selTimer = setTimeout(evaluateSelection, 180); });
  // Keep the selection alive while a finger or pointer is on the toolbar.
  const touchOn = () => { tb.touching = true; clearTimeout(tb.hideTimer); };
  const touchOff = () => { setTimeout(() => { tb.touching = false; }, 700); };
  bar.addEventListener('touchstart', touchOn, { passive: true });
  bar.addEventListener('touchend', touchOff, { passive: true });
  bar.addEventListener('pointerdown', touchOn);
  bar.addEventListener('pointerup', touchOff);
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });

  function endAction(msg) {
    const sel = window.getSelection(); if (sel) sel.removeAllRanges();
    hideBar(); toast(msg);
  }
  function applyColor(color) {
    const ctx = readerCtx; if (!ctx) return;
    if (tb.mode === 'selection') {
      tb.anchors.forEach((a) => addHighlight(a, color, false));
      persist(); tb.anchors.forEach((a) => paintVerse(a.el)); endAction('Highlighted in ' + color);
    } else if (tb.mode === 'verse') {
      const el = $('#v' + tb.verse, main); const text = verseText(el);
      addHighlight({ v: tb.verse, s: 0, e: text.length, text }, color, true);
      persist(); paintVerse(el); endAction('Verse highlighted in ' + color);
    } else if (tb.mode === 'mark') {
      const h = store.hl.find((x) => x.id === tb.hid); if (!h) return hideBar();
      h.color = color; persist(); paintVerse($('#v' + h.v, main)); endAction('Highlight changed to ' + color);
    }
  }
  function clearHighlights() {
    const ctx = readerCtx; if (!ctx) return;
    let verses = [];
    if (tb.mode === 'selection') { tb.anchors.forEach((a) => carve(ctx.id, ctx.ch.n, a.v, a.s, a.e)); verses = tb.anchors.map((a) => a.el); }
    else if (tb.mode === 'verse') { const el = $('#v' + tb.verse, main); carve(ctx.id, ctx.ch.n, tb.verse, 0, 1e9); verses = [el]; }
    else if (tb.mode === 'mark') { const h = store.hl.find((x) => x.id === tb.hid); if (h) { store.hl = store.hl.filter((x) => x !== h); verses = [$('#v' + h.v, main)]; } }
    persist(); verses.forEach(paintVerse); endAction('Highlight removed');
  }
  bar.querySelectorAll('.tb-color').forEach((b) => b.addEventListener('click', () => applyColor(b.dataset.color)));
  $('#tbClear').addEventListener('click', clearHighlights);
  $('#tbBm').addEventListener('click', () => { const v = tb.mode === 'selection' ? tb.anchors[0].v : tb.verse; const sel = window.getSelection(); if (sel) sel.removeAllRanges(); hideBar(); toggleBookmark(v); });
  $('#tbListen').addEventListener('click', () => { const v = tb.mode === 'selection' ? tb.anchors[0].v : tb.verse; const sel = window.getSelection(); if (sel) sel.removeAllRanges(); hideBar(); listenFrom(v); });

  // Taps in the scripture: footnote buttons keep their own handler; highlights and verses open the toolbar.
  main.addEventListener('click', (e) => {
    if (!readerCtx || e.target.closest('.fn')) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;               // finishing a selection, not a tap
    const mk = e.target.closest('mark.hl');
    if (mk) return openMarkBar(mk);
    const vs = e.target.closest('.scripture .verse');
    if (vs) return openVerseBar(vs, false);
    if (!e.target.closest('.hlbar')) hideBar();
  });
  main.addEventListener('keydown', (e) => {
    const sup = e.target.closest && e.target.closest('.vnum[role="button"]');
    if (sup && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openVerseBar(sup.closest('.verse'), true); }
  });
  document.addEventListener('click', (e) => { if (tb.mode && !e.target.closest('.hlbar') && !e.target.closest('#main')) hideBar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tb.mode) { const f = tb.mode === 'verse' ? $('#v' + tb.verse, main) : null; hideBar(); if (f) { const s = $('.vnum', f); s && s.focus(); } } });

  // ---------- Listening (Web Speech API) ----------
  const SPEECH = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const synth = SPEECH ? window.speechSynthesis : null;
  const au = { active: false, playing: false, items: [], i: 0, c: 0, token: 0, advancing: false, utt: null, t0: 0, book: null, ch: null, voices: [], rt: 0, lastEl: null, mode: 'tts', rec: null, times: [], switching: false };
  const player = $('#player');

  function chunkText(text) {
    const sentences = text.match(/[^.!?;:]+(?:[.!?;:]+["'”’)\]]*|$)\s*/g) || [text];
    const out = []; let buf = '';
    const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = ''; };
    for (const s of sentences) {
      if (s.length > 220) {                              // very long sentence: split at spaces
        flush();
        let rest = s;
        while (rest.length > 220) { let k = rest.lastIndexOf(' ', 220); if (k < 60) k = 220; out.push(rest.slice(0, k).trim()); rest = rest.slice(k); }
        buf = rest; continue;
      }
      if (buf && (buf + s).length > 220) flush();
      buf += s;
    }
    flush();
    return out.length ? out : [text];
  }
  function buildItems(book, ch) {
    const items = [{ v: 0, kind: 'intro', text: `${book.name}, chapter ${ch.n}.` }];
    if (ch.title) items.push({ v: 0, kind: 'title', text: plain(ch.title).replace(/\s+/g, ' ').trim() });
    ch.verses.forEach((x) => items.push({ v: x.v, kind: 'verse', text: plain(x.text).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim() }));
    items.forEach((it) => { it.chunks = chunkText(it.text); });
    return items.filter((it) => it.text);
  }
  const itemEl = (it) => (it.kind === 'verse' ? document.getElementById('v' + it.v) : it.kind === 'title' ? $('.ch-title', main) : null);
  function markSpeaking() {
    main.querySelectorAll('.speaking').forEach((x) => x.classList.remove('speaking'));
    const it = au.items[au.i];
    if (!au.active || !it || !readerCtx || readerCtx.id !== au.book || readerCtx.ch.n !== au.ch) return;
    const el = itemEl(it);
    if (!el) return;
    el.classList.add('speaking');
    const r = el.getBoundingClientRect(), top = 70, bottom = window.innerHeight - 150;
    if (r.top < top || r.bottom > bottom) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function voiceList() {
    const all = synth ? synth.getVoices() : [];
    const en = all.filter((v) => /^en([-_]|$)/i.test(v.lang));
    return en.length ? en : all;
  }
  // Rank voices: Premium / Enhanced / Natural / Neural / Siri / Google / Microsoft Online first, novelty and robotic voices last.
  const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
  const FAMILIAR = /\b(ava|zoe|evan|nathan|allison|susan|samantha|alex|daniel|karen|moira|serena|tessa|tom|nicky|aaron|jenny|aria|guy|davis|libby|ryan|sonia)\b/i;
  function voiceTier(v) {
    const t = (v.name || '') + ' ' + (v.voiceURI || '');
    if (/premium/i.test(t)) return 'Premium';
    if (/enhanced/i.test(t)) return 'Enhanced';
    if (/natural|neural/i.test(t)) return 'Natural';
    if (/siri/i.test(t)) return 'Siri';
    if (/^microsoft.*online/i.test(v.name || '') || /online/i.test(v.name || '')) return 'Online';
    if (/^google/i.test(v.name || '')) return 'Google';
    return '';
  }
  function voiceScore(v) {
    const tier = voiceTier(v), n = v.name || '';
    let s = { Premium: 60, Enhanced: 52, Natural: 58, Siri: 54, Online: 46, Google: 36 }[tier] || 0;
    if (FAMILIAR.test(n)) s += 12;
    if (/espeak|compact|robot/i.test(n + ' ' + (v.voiceURI || ''))) s -= 25;
    if (NOVELTY.test(n)) s -= 80;
    const lg = (v.lang || '').replace('_', '-');
    s += /^en-US$/i.test(lg) ? 8 : /^en-(GB|AU|CA|IE|IN)$/i.test(lg) ? 5 : /^en/i.test(lg) ? 2 : 0;
    if (v.localService) s += 2;
    if (v.default) s += 1;
    return s;
  }
  function rankVoices(list) { return list.slice().sort((a, b) => voiceScore(b) - voiceScore(a) || String(a.name).localeCompare(String(b.name))); }
  function bestVoice(list) { return rankVoices(list)[0] || null; }
  function pickVoice() {
    const list = voiceList();
    if (settings.voice) {
      const v = list.find((x) => x.voiceURI === settings.voice) || (settings.voiceName && list.find((x) => x.name === settings.voiceName));
      if (v) return v;
    }
    return bestVoice(list);
  }
  function fillVoices() {
    const sel = $('#plVoice'); if (!sel) return;
    const list = rankVoices(voiceList());
    const best = list[0] || null;
    const label = (v) => `${v.name}${voiceTier(v) && !new RegExp(voiceTier(v), 'i').test(v.name) ? ' · ' + voiceTier(v) : ''} (${v.lang})`;
    sel.innerHTML = `<option value="">Automatic${best ? ' (' + esc(best.name) + ')' : ''}</option>` + list.map((v) => `<option value="${esc(v.voiceURI)}">${esc(label(v))}</option>`).join('');
    sel.value = list.some((v) => v.voiceURI === settings.voice) ? settings.voice : '';
    const cur = pickVoice(), hq = cur && voiceScore(cur) >= 46 && voiceTier(cur);
    const hint = $('#plHq');
    if (hint) hint.textContent = !cur ? 'No voices found yet.' : hq ? `Using ${cur.name} (${voiceTier(cur)}).` : `Only basic voices found. Using ${cur.name}.`;
  }
  if (SPEECH) {
    fillVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', fillVoices); else synth.onvoiceschanged = fillVoices;
    // Safari on iPhone often loads voices late and may never send "voiceschanged": look a few more times.
    let tries = 0;
    const poll = setInterval(() => { tries++; if (synth.getVoices().length || tries > 20) { fillVoices(); clearInterval(poll); } }, 400);
  }

  function speakNow() {
    if (!au.active) return;
    const it = au.items[au.i];
    if (!it) return finishChapter();
    const text = it.chunks[au.c];
    const tok = ++au.token;
    markSpeaking(); updatePlayer();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Number(settings.rate) || 1;
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.onend = () => { if (tok === au.token && au.playing) stepForward(); };
    u.onerror = (e) => {
      if (tok !== au.token) return;
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      pauseAudio(); toast('The voice stopped. Tap play to try again.');
    };
    au.utt = u;                        // keep a reference: Safari can drop an utterance that is garbage-collected mid-speech
    au.t0 = Date.now();
    try { synth.speak(u); } catch (err) { pauseAudio(); }
  }
  function stepForward() {
    const it = au.items[au.i];
    if (it && au.c + 1 < it.chunks.length) au.c++;
    else { au.i++; au.c = 0; }
    if (au.i >= au.items.length) return finishChapter();
    speakNow();
  }
  // Cancel the current speech, then (optionally) speak again after a short pause. iOS drops a speak() that comes right after cancel().
  function restartSoon() {
    au.token++; clearTimeout(au.rt);
    try { synth.cancel(); } catch (e) {}
    if (au.playing) au.rt = setTimeout(speakNow, 90);
  }
  function startAudio(fromVerse) {
    const ctx = readerCtx; if (!ctx) return;
    clearTimeout(au.rt);
    if (SPEECH && (synth.speaking || synth.pending)) { try { synth.cancel(); } catch (e) {} }
    au.items = buildItems({ name: ctx.name }, ctx.ch);
    au.book = ctx.id; au.ch = ctx.ch.n; au.c = 0;
    au.i = 0;
    if (fromVerse) { const k = au.items.findIndex((it) => it.kind === 'verse' && it.v === fromVerse); if (k >= 0) au.i = k; }
    au.active = true; au.playing = true;
    player.hidden = false; document.body.classList.add('has-player');
    if (startNarration(ctx, fromVerse)) return;   // a recording, when there is one for this chapter
    if (!SPEECH) { stopAudio(); toast('Listening is not available for this chapter on this browser.'); return; }
    au.mode = 'tts';
    speakNow();                        // called straight from the tap, as iOS requires
  }
  function listenFrom(v) { startAudio(v); }
  function pauseAudio() {
    if (!au.active) return;
    if (au.mode === 'rec') return pauseRec();
    au.playing = false; au.token++; clearTimeout(au.rt);
    try { synth.cancel(); } catch (e) {}
    updatePlayer();
  }
  function resumeAudio() {            // starts the current sentence again: more dependable on iOS than synth.resume()
    if (!au.active) return;
    if (au.mode === 'rec') return resumeRec();
    au.playing = true; speakNow();
  }
  function stopAudio() {
    au.active = false; au.playing = false; au.token++; clearTimeout(au.rt);
    stopRec();
    if (SPEECH) { try { synth.cancel(); } catch (e) {} }
    player.hidden = true; document.body.classList.remove('has-player');
    main.querySelectorAll('.speaking').forEach((x) => x.classList.remove('speaking'));
    updatePlayer();
  }
  function togglePlay() { if (!au.active) startAudio(); else if (au.playing) pauseAudio(); else resumeAudio(); }
  function skipVerse(dir) {
    if (!au.active) return;
    if (au.mode === 'rec') return skipRec(dir);
    let k = au.i + dir;
    while (k >= 0 && k < au.items.length && au.items[k].kind !== 'verse') k += dir;
    if (k < 0 || k >= au.items.length) { if (dir > 0) return finishChapter(); k = 0; }
    au.i = k; au.c = 0;
    if (au.playing) { markSpeaking(); restartSoon(); } else { markSpeaking(); updatePlayer(); }
  }
  // Where does listening go after the last verse? The next chapter, or the next book that has chapters ready.
  function nextTarget() {
    if (!catalog || au.book == null) return null;
    const b = catalog.books.find((x) => x.id === au.book);
    const later = b.translated.filter((n) => n > au.ch).sort((x, y) => x - y)[0];
    if (later) return `#/read/${b.id}/${later}`;
    const k = catalog.books.findIndex((x) => x.id === au.book);
    const nb = catalog.books.slice(k + 1).find((x) => x.translated.length && x.file);
    return nb ? `#/read/${nb.id}/${nb.translated[0]}` : null;
  }
  function finishChapter() {
    const nxt = settings.autoNext ? nextTarget() : null;
    if (!nxt) { stopAudio(); toast('Finished the chapter.'); return; }
    au.advancing = true; au.token++;
    chainRec(nxt);                      // recordings roll straight into the next chapter, even with the screen locked
    location.hash = nxt;                // reader() starts the new chapter when it has drawn it
  }
  function updatePlayer() {
    const it = au.items[au.i];
    const label = au.playing ? 'Pause' : au.active ? 'Resume' : 'Listen';
    const pb = $('#plPlay'); if (pb) { pb.setAttribute('aria-label', label === 'Listen' ? 'Play' : label); pb.dataset.state = au.playing ? 'playing' : 'paused'; }
    const lb = $('#listenBtn');
    if (lb) {
      const here = au.active && readerCtx && readerCtx.id === au.book && readerCtx.ch.n === au.ch;
      lb.textContent = here ? (au.playing ? '❚❚ Pause' : '▶ Resume listening') : '▶ Listen to this chapter';
      lb.setAttribute('aria-pressed', String(!!(here && au.playing)));
    }
    const now = $('#plNow');
    if (now && au.active) {
      const bk = catalog && catalog.books.find((x) => x.id === au.book);
      now.textContent = `${bk ? bk.name : ''} ${au.ch}${it && it.kind === 'verse' ? ':' + it.v : ''}${au.playing ? '' : ' (paused)'}`;
    }
  }
  $('#plPlay').addEventListener('click', togglePlay);
  $('#plStop').addEventListener('click', stopAudio);
  $('#plPrev').addEventListener('click', () => skipVerse(-1));
  $('#plNext').addEventListener('click', () => skipVerse(1));
  $('#plOpts').addEventListener('click', () => { const o = $('#plOptions'); o.hidden = !o.hidden; $('#plOpts').setAttribute('aria-expanded', String(!o.hidden)); });
  $('#plRate').value = String(settings.rate);
  if ($('#plRate').value === '') $('#plRate').value = '1';
  $('#plRate').addEventListener('change', (e) => { settings.rate = parseFloat(e.target.value) || 1; saveSettings(); if (au.mode === 'rec') audioEl.playbackRate = settings.rate; else if (au.active && au.playing) restartSoon(); });
  $('#plVoice').addEventListener('change', (e) => { settings.voice = e.target.value; const pv = voiceList().find((x) => x.voiceURI === settings.voice); settings.voiceName = pv ? pv.name : ''; fillVoices(); saveSettings(); if (au.active && au.playing && au.mode !== 'rec') restartSoon(); });
  $('#plAuto').checked = settings.autoNext !== false;
  $('#plAuto').addEventListener('change', (e) => { settings.autoNext = e.target.checked; saveSettings(); });
  main.addEventListener('click', (e) => { if (e.target.closest('#listenBtn')) togglePlay(); });
  // If the phone silently stopped speaking (screen lock, a call, Siri), show Play instead of pretending to play.
  document.addEventListener('visibilitychange', () => {
    if (!SPEECH || au.mode === 'rec' || !au.active || document.hidden || !au.playing) return;
    setTimeout(() => { if (au.playing && !synth.speaking && !synth.pending) pauseAudio(); }, 400);
  });
  window.addEventListener('pagehide', () => { if (SPEECH) try { synth.cancel(); } catch (e) {} });
  // Safety net: some browsers never send "end" for a sentence. If nothing is speaking for a while, move on.
  setInterval(() => {
    if (!SPEECH || au.mode === 'rec' || !au.active || !au.playing || document.hidden) return;
    if (!synth.speaking && !synth.pending && Date.now() - au.t0 > 2500) { au.token++; stepForward(); }
  }, 1500);

  // ---------- Recorded narration (Hugging Face) ----------
  // Natural recordings (Kokoro-82M, Apache-2.0) live in a public dataset. A chapter plays from its recording only when the
  // recording's source-text hash matches the text on screen; otherwise the device voice reads it (see /audio README).
  const REC_BASE = 'https://huggingface.co/datasets/pdoggjoe/clay-jar-treasure-audio/resolve/main/';
  const REC_VOICES = { af_heart: 'Recorded voice, female', am_michael: 'Recorded voice, male' };
  const audioEl = document.createElement('audio');
  audioEl.id = 'plAudio'; audioEl.preload = 'auto'; audioEl.setAttribute('playsinline', ''); audioEl.hidden = true;
  player.appendChild(audioEl);
  let recIndex = null; const recCache = new Map();
  function loadRecIndex() {
    return fetch(REC_BASE + 'index.json').then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.voices && Object.keys(j.voices).length) { recIndex = j; fillNarr(); } return recIndex; }).catch(() => null);
  }
  const recIndexP = loadRecIndex();
  function narrVoice() {
    if (!recIndex) return '';
    const c = settings.narr;
    if (c === 'device') return '';
    if (c && recIndex.voices[c]) return c;
    return recIndex.voices.af_heart ? 'af_heart' : recIndex.voices.am_michael ? 'am_michael' : '';
  }
  function fillNarr() {
    const sel = $('#plNarr'), wrap = $('#plNarrWrap'); if (!sel || !wrap) return;
    const vs = Object.keys(REC_VOICES).filter((v) => recIndex && recIndex.voices[v]);
    if (!vs.length) { wrap.hidden = true; return; }
    sel.innerHTML = vs.map((v) => `<option value="${v}">${REC_VOICES[v]}</option>`).join('') + '<option value="device">Device voice</option>';
    sel.value = narrVoice() || 'device'; wrap.hidden = false; $('#plNarrNote').hidden = false; updateNarrNote();
  }
  async function sha12(str) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(d)).slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const chapterHash = (ch) => sha12(ch.verses.map((v) => v.text).join('\n') + (ch.title ? '\n' + ch.title : ''));
  function recFor(bookId, ch, voice) {
    voice = voice || narrVoice(); if (!voice) return null;
    const key = voice + '/' + bookId + '/' + ch.n;
    if (recCache.has(key)) return recCache.get(key);
    const ent = { done: false, info: null, promise: null };
    const idx = recIndex && recIndex.voices[voice] && recIndex.voices[voice][bookId];
    const want = idx && idx[String(ch.n)];
    if (!want || !(window.crypto && crypto.subtle)) { ent.done = true; ent.promise = Promise.resolve(null); }
    else ent.promise = (async () => {
      try {
        if ((await chapterHash(ch)) !== want) return null;            // text changed since it was recorded: use the device voice
        const base = REC_BASE + voice + '/' + bookId + '/' + ch.n;
        const r = await fetch(base + '.json'); if (!r.ok) return null;
        const meta = await r.json(); if (meta.h !== want) return null;
        ent.info = { url: base + '.opus', meta, book: bookId, ch: ch.n, voice };
        return ent.info;
      } catch (e) { return null; }
    })().then((i) => { ent.done = true; return i; });
    recCache.set(key, ent); return ent;
  }
  function nextFor(id, n) {
    if (!catalog) return null;
    const b = catalog.books.find((x) => x.id === id); if (!b) return null;
    const later = b.translated.filter((m) => m > n).sort((x, y) => x - y)[0];
    if (later) return { id, n: later };
    const k = catalog.books.findIndex((x) => x.id === id);
    const nb = catalog.books.slice(k + 1).find((x) => x.translated.length && x.file);
    return nb ? { id: nb.id, n: nb.translated[0] } : null;
  }
  function prefetchNext(id, n) {
    if (!settings.autoNext || !recIndex) return;
    const nx = nextFor(id, n); if (!nx) return;
    loadBook(nx.id).then((bk) => { const c = bk && bk.chapters.find((x) => x.n === nx.n); if (c) recFor(nx.id, c); }).catch(() => {});
  }
  async function prepNarration(book, ch) {
    try {
      await recIndexP;
      const e = recFor(book.id, ch);
      if (e) await e.promise;
      updateNarrNote();
      if (e && e.info) prefetchNext(book.id, ch.n);
    } catch (err) {}
  }
  function updateNarrNote() {
    const n = $('#plNarrNote'); if (!n || !recIndex) return;
    const v = narrVoice();
    if (!v) { n.textContent = 'Reading with your device voice.'; return; }
    if (!readerCtx) { n.textContent = ''; return; }
    const e = recCache.get(v + '/' + readerCtx.id + '/' + readerCtx.ch.n);
    n.textContent = e && e.done ? (e.info ? 'A recording is ready for this chapter.' : 'There is no recording of this chapter yet, so your device voice reads it.') : '';
  }
  function startNarration(ctx, fromVerse) {
    const e = recFor(ctx.id, ctx.ch);
    if (!e || (e.done && !e.info)) { au.mode = 'tts'; return false; }
    au.mode = 'rec';
    if (e.info) { playRec(e.info, fromVerse); return true; }
    const tok = ++au.token;                                             // still checking the recording: wait for it
    e.promise.then((info) => {
      if (tok !== au.token || !au.active) return;
      if (info) playRec(info, fromVerse); else { au.mode = 'tts'; if (SPEECH) speakNow(); else stopAudio(); }
    });
    return true;
  }
  const recTimes = (info) => au.items.map((it) => (it.kind === 'verse' ? info.meta.v[String(it.v)] : info.meta[it.kind]));
  function playRec(info, fromVerse) {
    au.rec = info; au.times = recTimes(info); au.i = 0;
    let start = 0;
    if (fromVerse) { const k = au.items.findIndex((it) => it.kind === 'verse' && it.v === fromVerse); if (k >= 0 && au.times[k] != null) { au.i = k; start = au.times[k]; } }
    au.switching = true; au.mode = 'rec';
    if (audioEl.getAttribute('data-src') !== info.url) { audioEl.src = info.url; audioEl.setAttribute('data-src', info.url); }
    audioEl.playbackRate = Number(settings.rate) || 1;
    const seek = () => { try { audioEl.currentTime = start; } catch (e) {} };
    if (audioEl.readyState >= 1) seek(); else audioEl.addEventListener('loadedmetadata', seek, { once: true });
    au.playing = true;
    const pr = audioEl.play();
    if (pr && pr.catch) pr.catch((err) => { if (au.mode === 'rec' && au.active && err && err.name !== 'AbortError') { pauseRec(); toast('The recording could not start. Tap play to try again.'); } });
    au.switching = false;
    setMediaSession(); markSpeaking(); updatePlayer();
    prefetchNext(info.book, info.ch);
  }
  function pauseRec() { au.playing = false; au.token++; try { audioEl.pause(); } catch (e) {} updatePlayer(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; }
  function resumeRec() {
    au.playing = true; updatePlayer();
    const pr = audioEl.play();
    if (pr && pr.catch) pr.catch(() => { pauseRec(); toast('The recording could not start. Tap play to try again.'); });
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }
  function stopRec() {
    if (au.mode !== 'rec' && !au.rec) return;
    try { audioEl.pause(); } catch (e) {}
    au.mode = 'tts'; au.rec = null; au.times = [];
    if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'none'; } catch (e) {} }
  }
  function skipRec(dir) {
    let k = au.i + dir;
    const cur = au.items[au.i];
    if (dir < 0 && cur && cur.kind === 'verse' && au.times[au.i] != null && audioEl.currentTime - au.times[au.i] > 2.5) k = au.i;   // first tap goes back to the start of this verse
    else while (k >= 0 && k < au.items.length && (au.items[k].kind !== 'verse' || au.times[k] == null)) k += dir;
    if (k >= au.items.length) return finishChapter();
    if (k < 0) { try { audioEl.currentTime = 0; } catch (e) {} au.i = 0; }
    else { try { audioEl.currentTime = au.times[k]; } catch (e) {} au.i = k; }
    markSpeaking(); updatePlayer();
  }
  function chainRec(nxt) {
    if (au.mode !== 'rec' || !au.rec) return;
    const m = /^#\/read\/([^/]+)\/(\d+)/.exec(nxt); if (!m) return;
    const e = recCache.get(au.rec.voice + '/' + m[1] + '/' + m[2]);
    if (!e || !e.info) return;
    au.book = m[1]; au.ch = +m[2]; au.items = []; au.i = 0;
    playRec(e.info);
  }
  function syncRecItems(ch) {
    au.items = buildItems({ name: readerCtx.name }, ch); au.times = recTimes(au.rec); au.i = 0;
    markSpeaking(); updatePlayer();
  }
  function setMediaSession() {
    if (!('mediaSession' in navigator) || !au.rec) return;
    try {
      const bk = catalog && catalog.books.find((x) => x.id === au.book);
      const ms = navigator.mediaSession;
      ms.metadata = new MediaMetadata({ title: `${bk ? bk.name : ''} ${au.ch}`, artist: NAME, album: NAME, artwork: [{ src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }] });
      ms.playbackState = 'playing';
      ms.setActionHandler('play', () => { if (au.active) resumeAudio(); });
      ms.setActionHandler('pause', () => pauseAudio());
      ms.setActionHandler('previoustrack', () => skipVerse(-1));
      ms.setActionHandler('nexttrack', () => skipVerse(1));
    } catch (e) {}
  }
  audioEl.addEventListener('timeupdate', () => {
    if (au.mode !== 'rec' || !au.active || !au.times.length) return;
    const t = audioEl.currentTime + 0.05; let k = -1;
    for (let i = 0; i < au.times.length; i++) if (au.times[i] != null && au.times[i] <= t) k = i;
    if (k >= 0 && k !== au.i) { au.i = k; markSpeaking(); updatePlayer(); }
  });
  audioEl.addEventListener('ended', () => { if (au.mode === 'rec' && au.active && au.playing) finishChapter(); });
  audioEl.addEventListener('pause', () => {            // lock screen, headphones, a phone call
    if (au.mode === 'rec' && au.active && au.playing && !audioEl.ended && !au.switching) { au.playing = false; updatePlayer(); }
  });
  audioEl.addEventListener('play', () => { if (au.mode === 'rec' && au.active && !au.playing) { au.playing = true; updatePlayer(); } });
  audioEl.addEventListener('error', () => {            // the recording is unreachable: carry on with the device voice
    if (au.mode !== 'rec' || !au.active) return;
    const was = au.playing; au.mode = 'tts'; au.rec = null; au.times = [];
    if (SPEECH && was) { au.items = au.items.length ? au.items : buildItems({ name: readerCtx.name }, readerCtx.ch); speakNow(); }
    else { stopAudio(); toast('The recording could not be loaded.'); }
  });
  $('#plNarr').addEventListener('change', (e) => {
    settings.narr = e.target.value; saveSettings();
    if (au.active) {
      const it = au.items[au.i], v = it && it.kind === 'verse' ? it.v : 0, was = au.playing;
      stopAudio(); if (was) startAudio(v || undefined);
    }
    updateNarrNote();
  });

  // Called by reader() after it draws a chapter.
  function afterReaderRender(book, ch, idx, verse) {
    paintAll(); markBookmarks();
    // Leaving the chapter that is being read aloud stops the voice, unless this is the automatic move to the next chapter.
    if (au.active && !au.advancing && !(au.book === book.id && au.ch === ch.n)) stopAudio();
    updatePlayer();
    prepNarration(book, ch);
    if (au.active && au.book === book.id && au.ch === ch.n) markSpeaking();
    if (au.advancing) {
      au.advancing = false;
      if (au.active && au.mode === 'rec' && au.rec && au.book === book.id && au.ch === ch.n && au.playing) syncRecItems(ch);
      else if (au.active) { au.playing = true; startAudio(); }
    }
    trackPosition();
  }

  // ---------- Where I left off ----------
  let posTimer;
  function trackPosition() {
    clearTimeout(posTimer);
    const root = scriptureEl(); if (!root || !readerCtx) return;
    posTimer = setTimeout(() => {
      if (!readerCtx) return;
      const vs = main.querySelectorAll('.scripture .verse');
      let cur = 0;
      for (const el of vs) { if (el.getBoundingClientRect().bottom > 90) { cur = +el.dataset.v; break; } }
      if (window.scrollY < 120) cur = 0;
      try { localStorage.setItem('ctb-last', JSON.stringify({ book: readerCtx.id, name: readerCtx.name, ch: readerCtx.ch.n, v: cur })); } catch (e) {}
    }, 500);
  }
  window.addEventListener('scroll', () => { if (readerCtx) trackPosition(); }, { passive: true });

  // ---------- Saved page: bookmarks, highlights, backup ----------
  const ICON_DEL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
  async function savedPage(tab) {
    tab = ['bookmarks', 'highlights', 'backup'].includes(tab) ? tab : 'bookmarks';
    setTitle('');
    const cat = await loadCatalog();
    const order = (b) => cat.books.findIndex((x) => x.id === b);
    const bookName = (id, fb) => { const b = cat.books.find((x) => x.id === id); return b ? b.name : fb || id; };
    const cmp = (a, b) => order(a.book) - order(b.book) || a.ch - b.ch || a.v - b.v || (a.s || 0) - (b.s || 0);
    const tabs = [['bookmarks', 'Bookmarks', store.bm.length], ['highlights', 'Highlights', store.hl.length], ['backup', 'Backup', null]]
      .map(([k, l, n]) => `<a class="tab" href="#/saved/${k}" role="tab" aria-selected="${k === tab}">${l}${n === null ? '' : `<small>${n}</small>`}</a>`).join('');
    let body = '';
    if (tab === 'bookmarks') {
      const last = readJSON('ctb-last');
      const items = store.bm.slice().sort(cmp).map((b) => {
        const ref = `${bookName(b.book, b.name)} ${b.ch}:${b.v}`;
        return `<li class="saved-item"><a class="saved-link" href="#/read/${encodeURIComponent(b.book)}/${b.ch}/${b.v}"><span class="ref">${esc(ref)}</span><span class="txt">${esc(b.text || '')}</span></a>
          <button type="button" class="saved-del" data-del-bm="${esc(b.id)}" aria-label="Delete bookmark ${esc(ref)}">${ICON_DEL}</button></li>`;
      }).join('');
      body = `${last.book ? `<div class="card resume-card"><div><strong>Where I left off</strong><p class="muted">${esc(last.name)} ${last.ch}${last.v > 1 ? ':' + last.v : ''}</p></div><a class="btn" href="#/read/${encodeURIComponent(last.book)}/${last.ch}${last.v > 1 ? '/' + last.v : ''}">Continue</a></div>` : ''}
        <label class="switch resume-switch" for="resumeToggle2"><span class="setting-label">Open the app where I left off</span><input type="checkbox" id="resumeToggle2" role="switch"${settings.resume ? ' checked' : ''}><span class="track" aria-hidden="true"></span></label>
        ${items ? `<ul class="saved-list">${items}</ul>` : '<p class="empty">No bookmarks yet. While reading, tap a verse and then the ribbon button.</p>'}`;
    } else if (tab === 'highlights') {
      const f = sessionStorage.getItem('ctb-hlfilter') || 'all';
      const chips = ['all'].concat(COLORS).map((c) => `<button type="button" class="chip${c === f ? ' on' : ''}" data-filter="${c}" aria-pressed="${c === f}">${c === 'all' ? 'All' : `<i class="dot hl-${c}"></i>${c[0].toUpperCase() + c.slice(1)}`}</button>`).join('');
      const items = store.hl.filter((h) => f === 'all' || h.color === f).sort(cmp).map((h) => {
        const ref = `${bookName(h.book, h.name)} ${h.ch}:${h.v}`;
        return `<li class="saved-item"><a class="saved-link" href="#/read/${encodeURIComponent(h.book)}/${h.ch}/${h.v}"><span class="ref"><i class="dot hl-${esc(h.color)}"></i>${esc(ref)}${h.whole ? ' <small>whole verse</small>' : ''}</span><span class="txt"><span class="hl-sample hl-${esc(h.color)}">${esc(h.text)}</span></span></a>
          <button type="button" class="saved-del" data-del-hl="${esc(h.id)}" aria-label="Delete ${esc(h.color)} highlight in ${esc(ref)}">${ICON_DEL}</button></li>`;
      }).join('');
      body = `<div class="chips" role="group" aria-label="Filter by color">${chips}</div>
        ${items ? `<ul class="saved-list">${items}</ul>` : `<p class="empty">${store.hl.length ? 'No highlights in this color.' : 'No highlights yet. While reading, select some words or tap a verse, then pick a color.'}</p>`}`;
    } else {
      body = `<p class="muted">Your bookmarks and highlights are saved only on this phone, in this app. Save a backup file now and then so you never lose them, and use it to move them to another device.</p>
        <div class="cta" style="justify-content:flex-start;margin:1rem 0">
          <button type="button" class="btn primary" id="expBtn">Save backup file</button>
          <button type="button" class="btn" id="shareBk" hidden>Share backup…</button>
          <label class="btn" for="impFile">Restore from file</label><input type="file" id="impFile" accept="application/json,.json" class="visually-hidden">
        </div>
        <details class="paste"><summary>Copy or paste backup text instead</summary>
          <textarea id="bkText" rows="5" spellcheck="false" aria-label="Backup text"></textarea>
          <div class="cta" style="justify-content:flex-start;margin:.5rem 0 0"><button type="button" class="btn" id="copyBk">Copy backup text</button><button type="button" class="btn" id="pasteBk">Restore from this text</button></div>
        </details>
        <p class="count" id="bkMsg" role="status" aria-live="polite">${store.bm.length} bookmark${store.bm.length === 1 ? '' : 's'} and ${store.hl.length} highlight${store.hl.length === 1 ? '' : 's'} saved on this device.</p>`;
    }
    render(`<h1>Bookmarks and highlights</h1><nav class="tabs saved-tabs" role="tablist" aria-label="Saved items">${tabs}</nav><div class="saved-body">${body}</div>`, 'Bookmarks and highlights');
    window.scrollTo(0, 0);
    const again = () => savedPage(tab);
    main.querySelectorAll('[data-del-bm]').forEach((b) => b.addEventListener('click', () => {
      const ex = store.bm.find((x) => x.id === b.dataset.delBm); store.bm = store.bm.filter((x) => x !== ex); persist(); again();
      toast('Bookmark deleted', { label: 'Undo', fn: () => { store.bm.push(ex); persist(); again(); } });
    }));
    main.querySelectorAll('[data-del-hl]').forEach((b) => b.addEventListener('click', () => {
      const ex = store.hl.find((x) => x.id === b.dataset.delHl); store.hl = store.hl.filter((x) => x !== ex); persist(); again();
      toast('Highlight deleted', { label: 'Undo', fn: () => { store.hl.push(ex); persist(); again(); } });
    }));
    main.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('ctb-hlfilter', b.dataset.filter); again(); }));
    const rt2 = $('#resumeToggle2');
    if (rt2) rt2.addEventListener('change', () => { settings.resume = rt2.checked; saveSettings(); applySettings(); });
    if (tab === 'backup') wireBackup();
  }
  const backupData = () => ({ format: 'ctb-saved', version: 1, exportedAt: new Date().toISOString(), bookmarks: store.bm, highlights: store.hl, lastRead: readJSON('ctb-last') });
  const backupText = () => JSON.stringify(backupData(), null, 1);
  function importData(text) {
    let d; try { d = JSON.parse(text); } catch (e) { return { err: 'That does not look like a backup file.' }; }
    if (!d || d.format !== 'ctb-saved' || !Array.isArray(d.bookmarks) || !Array.isArray(d.highlights)) return { err: 'That file is not a Clay Jar Treasure Bible backup.' };
    const int = (x) => Number.isInteger(x) && x >= 0 && x < 100000;
    const str = (x, n = 600) => (typeof x === 'string' ? x.slice(0, n) : '');
    let nb = 0, nh = 0;
    d.bookmarks.slice(0, 20000).forEach((b) => {
      if (!b || typeof b.book !== 'string' || !int(b.ch) || !int(b.v) || findBm(b.book, b.ch, b.v)) return;
      store.bm.push({ id: str(b.id, 40) || uid(), book: str(b.book, 80), name: str(b.name, 80), ch: b.ch, v: b.v, text: str(b.text), t: Number(b.t) || Date.now() }); nb++;
    });
    d.highlights.slice(0, 50000).forEach((h) => {
      if (!h || typeof h.book !== 'string' || !int(h.ch) || !int(h.v) || !int(h.s) || !int(h.e) || h.e <= h.s || !COLORS.includes(h.color) || typeof h.text !== 'string') return;
      if (store.hl.some((x) => x.book === h.book && x.ch === h.ch && x.v === h.v && x.s === h.s && x.e === h.e && x.color === h.color)) return;
      carve(h.book, h.ch, h.v, h.s, h.e);
      store.hl.push({ id: str(h.id, 40) || uid(), book: str(h.book, 80), name: str(h.name, 80), ch: h.ch, v: h.v, s: h.s, e: h.e, color: h.color, text: str(h.text, 3000), whole: !!h.whole, t: Number(h.t) || Date.now() }); nh++;
    });
    persist();
    return { nb, nh };
  }
  function wireBackup() {
    const msg = (t) => { const m = $('#bkMsg'); if (m) m.textContent = t; };
    const done = (r) => msg(r.err || `Restored ${r.nb} bookmark${r.nb === 1 ? '' : 's'} and ${r.nh} highlight${r.nh === 1 ? '' : 's'}${r.nb + r.nh === 0 ? ' (nothing new: they were already here)' : ''}.`);
    const fname = () => `ctb-bookmarks-highlights-${new Date().toISOString().slice(0, 10)}.json`;
    $('#expBtn').addEventListener('click', () => {
      const blob = new Blob([backupText()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname(); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      msg('Backup file saved. On an iPhone, look in Downloads, or use Share backup to put it in Files or Notes.');
    });
    try {
      const f = new File([backupText()], fname(), { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        const sb = $('#shareBk'); sb.hidden = false;
        sb.addEventListener('click', async () => { try { await navigator.share({ files: [new File([backupText()], fname(), { type: 'application/json' })], title: 'CTB bookmarks and highlights' }); } catch (e) {} });
      }
    } catch (e) {}
    $('#impFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; done(importData(await f.text())); e.target.value = ''; });
    $('#copyBk').addEventListener('click', async () => {
      const ta = $('#bkText'); ta.value = backupText();
      try { await navigator.clipboard.writeText(ta.value); msg('Backup text copied. Paste it somewhere safe, like Notes.'); } catch (e) { ta.select(); msg('Select the text above and copy it.'); }
    });
    $('#pasteBk').addEventListener('click', () => done(importData($('#bkText').value)));
  }
  // Optional: open the app where the reader left off (only when the app is started fresh).
  (function resumeOnLaunch() {
    if (!settings.resume || sessionStorage.getItem('ctb-resumed')) return;
    sessionStorage.setItem('ctb-resumed', '1');
    if (location.hash && location.hash !== '#' && location.hash !== '#/') return;
    const l = readJSON('ctb-last');
    if (l.book && l.ch) history.replaceState(null, '', `#/read/${encodeURIComponent(l.book)}/${l.ch}${l.v > 1 ? '/' + l.v : ''}`);
  })();

  // ---------- Offline ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch((e) => console.warn('Offline mode unavailable:', e.message)));
  }
  function offlineBadge() {
    let b = $('.offline-badge');
    if (navigator.onLine) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.className = 'offline-badge'; b.setAttribute('role', 'status'); b.textContent = 'Offline: reading saved copy'; document.body.appendChild(b); }
  }
  window.addEventListener('online', offlineBadge); window.addEventListener('offline', offlineBadge);

  route();
})();
