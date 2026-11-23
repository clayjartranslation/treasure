#!/usr/bin/env node
/* Builds one small static page per published chapter at s/<book>/<chapter>.html.
   Each page carries Open Graph and Twitter tags so a shared verse link shows a preview,
   then sends the reader to the chapter (and verse, from ?v=) in the reader.
   These pages are also the indexable URL for each chapter (the reader uses hash routes,
   which search engines do not index), so they are listed in sitemap.xml and left indexable.
   Run: node tools/build-share-pages.js   (the share-pages workflow runs it when books change) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SITE = fs.existsSync(path.join(ROOT, 'downloads.html')) ? 'ctb' : 'cjt';
const CFG = {
  cjt: { name: 'Clay Jar Translation', abbr: 'CJT', base: 'https://clayjartranslation.github.io/', logo: 'icons/cjt-logo-720.jpg', rights: '© 2026 Jose Santiago, CC BY-NC-SA 4.0.' },
  ctb: { name: 'Clay Jar Treasure Bible', abbr: 'CTB', base: 'https://clayjartranslation.github.io/treasure/', logo: 'icons/ctb-logo-720.jpg', rights: '© 2026 Jose Santiago. All rights reserved.' }
}[SITE];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (t) => String(t || '').replace(/\{[a-z]+\}/g, '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
function snippet(ch) {
  let s = '';
  for (const v of ch.verses) { s += (s ? ' ' : '') + clean(v.text); if (s.length > 140) break; }
  if (s.length > 160) s = s.slice(0, 157).replace(/\s+\S*$/, '') + '…';
  return s;
}
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/books.json'), 'utf8'));
const OUT = path.join(ROOT, 's');
fs.rmSync(OUT, { recursive: true, force: true });
let count = 0;
for (const b of cat.books) {
  if (!b.file || !/^[a-z0-9-]+$/.test(b.id)) continue;
  const fp = path.join(ROOT, b.file);
  if (!fs.existsSync(fp)) continue;
  const book = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const published = new Set(b.translated || []);
  for (const ch of book.chapters || []) {
    if (published.size && !published.has(ch.n)) continue;
    const url = `${CFG.base}s/${b.id}/${ch.n}.html`;
    const title = `${book.name} ${ch.n} — ${CFG.name} (${CFG.abbr})`;
    const desc = `“${snippet(ch)}” Read ${book.name} ${ch.n} free in the ${CFG.name}. ${CFG.rights}`;
    const img = CFG.base + CFG.logo;
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(CFG.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="720">
<meta property="og:image:height" content="720">
<meta property="og:image:alt" content="${esc(CFG.name)} logo">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<meta name="twitter:image:alt" content="${esc(CFG.name)} logo">
<link rel="icon" href="../../icons/favicon-32.png">
<script src="../../js/share-go.js" data-book="${esc(b.id)}" data-ch="${ch.n}"></script>
</head>
<body>
<p><a href="../../#/read/${esc(b.id)}/${ch.n}">Read ${esc(book.name)} ${ch.n} in the ${esc(CFG.name)}</a></p>
</body>
</html>
`;
    fs.mkdirSync(path.join(OUT, b.id), { recursive: true });
    fs.writeFileSync(path.join(OUT, b.id, `${ch.n}.html`), html);
    count++;
  }
}
console.log(`Wrote ${count} share pages to s/`);
