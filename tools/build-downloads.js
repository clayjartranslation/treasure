/* Build the all-rights-reserved PDF and EPUB from the books published so far.
   Only books with a data file are included, so the same command can be rerun as
   Jeremiah and later books land. The text is not CC BY. */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'downloads');
const WORK = path.join(OUT, '.build');
const EPUBCHECK = process.env.EPUBCHECK || '/tmp/epubcheck-5.2.1/epubcheck.jar';
const TITLE = 'Clay Jar Treasure Bible';
const PDF_NAME = 'clay-jar-treasure-bible.pdf';
const EPUB_NAME = 'clay-jar-treasure-bible.epub';
const LEGAL = '© 2026 Jose Santiago. All rights reserved. Clay Jar Treasure Bible™. Free for personal reading; no copying, redistribution, sale, or modification without written permission.';
const CONTACT = 'contact.clayjar@protonmail.com';
const TRADEMARK = 'Clay Jar Treasure Bible™, Clay Jar Translation™ and their logos are trademarks of Jose Santiago.';
const EPUB_UUID = 'urn:uuid:b7c2e1d4-8a6f-4c3b-9e20-5d14a8c7b691';

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function htmlEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function typstEsc(s) {
  return String(s).split('\n').map((line) => {
    let t = line.replace(/\\/g, '\\\\').replace(/[#$*_`<>@[\]|]/g, (ch) => '\\' + ch);
    t = t.replace(/\/\//g, '/\u200b/');
    if (t.startsWith('=') || t.startsWith('+') || t.startsWith('-') || t.startsWith('/')) t = '\u200b' + t;
    return t;
  }).join('\n');
}
function typstNote(ch, m) {
  const note = (ch.notes || []).find((n) => n.m === m);
  if (!note) return `#super[${typstEsc(m)}]`;
  const body = '(' + typstEsc(note.ref) + ') ' + typstEsc(note.text);
  return `#footnote(numbering: (..) => "${m}")[${body}]`;
}
function typstMarked(text, ch) {
  return String(text).split(/(\{[a-z]+\})/g).map((part) => {
    const mm = part.match(/^\{([a-z]+)\}$/);
    if (mm) return typstNote(ch, mm[1]);
    return typstEsc(part);
  }).join('');
}
function chapterParagraphs(ch) {
  const starts = new Set((ch.paras && ch.paras.length) ? ch.paras : [1]);
  const groups = [];
  let cur = [];
  for (const v of ch.verses || []) {
    if (starts.has(v.v) && cur.length) { groups.push(cur); cur = []; }
    cur.push(v);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function loadBooks() {
  const cat = readJSON(path.join(ROOT, 'data', 'books.json'));
  const books = [];
  for (const meta of cat.books) {
    if (!meta.file) continue;
    const fp = path.isAbsolute(meta.file) ? meta.file : path.join(ROOT, meta.file);
    if (!fs.existsSync(fp)) continue;
    const full = readJSON(fp);
    if (!full.chapters || !full.chapters.length) continue;
    books.push({ meta, full });
  }
  return { cat, books };
}

function bookRange(books) {
  if (!books.length) return 'no books yet';
  const first = books[0].full.name || books[0].meta.name;
  const last = books[books.length - 1].full.name || books[books.length - 1].meta.name;
  return books.length === 1 ? first : first + ' through ' + last;
}

function workInProgress(books, cat) {
  const edition = (cat && cat.edition) ? cat.edition + '. ' : '';
  return 'This is a work in progress. This file includes the books published so far, ' +
    bookRange(books) + '. More books will be added as they are finished. ' +
    edition + 'Made with AI assistance and not yet reviewed by scholars.';
}

function loadImageManifest() {
  const p = path.join(OUT, 'images', 'manifest.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function typstBookImage(bookId, images) {
  const im = images[bookId];
  if (!im || !im.file) return '';
  const src = '/images/' + im.file;
  const cap = typstEsc(im.caption || '');
  return `#align(center)[
  #block(width: 3.9in)[
    #image("${src}", width: 100%, height: 4.15in, fit: "contain")
    #v(0.28em)
    #text(size: 8.5pt, fill: rgb("#5a4632"), style: "italic")[${cap}]
  ]
]
#pagebreak()`;
}

function writeTypst(books, images, cat) {
  const wip = workInProgress(books, cat);
  const out = [];
  out.push(`#set document(title: "${TITLE}", author: "Jose Santiago", description: "${LEGAL} ${CONTACT}")`);
  out.push(`#set text(font: "Libertinus Serif", size: 14pt, lang: "en")`);
  out.push(`#set page(width: 5.5in, height: 8.5in, margin: (inside: 0.7in, outside: 0.55in, top: 0.72in, bottom: 0.65in), numbering: "1")`);
  out.push(`#set par(justify: true, leading: 0.78em, spacing: 0.82em, first-line-indent: 0pt)`);
  out.push(`#show footnote.entry: set text(size: 10pt)`);
  out.push(`#let vn(n) = super(text(size: 0.62em, weight: "bold", fill: rgb("#6b3a22"))[#n])`);
  out.push(`#show heading.where(level: 1): it => { pagebreak(weak: true); v(1em); align(center, text(size: 28pt, weight: "bold", it.body)); v(0.55em) }`);
  out.push(`#show heading.where(level: 2): set text(size: 18pt, weight: "bold")`);
  out.push(`#set par(justify: false); #set text(hyphenate: false)`);
  out.push(`#align(center)[
    #text(size: 28pt, weight: "bold")[${TITLE}]
    #v(0.8em)
    #text(size: 11pt)[
    ${typstEsc(LEGAL)}
    #v(0.55em)
    #link("mailto:${CONTACT}")[${typstEsc(CONTACT)}]
    ]
  ]`);
  out.push(`#pagebreak()`);
  out.push(`#align(center)[
    #text(size: 16pt, weight: "bold")[Copyright]
    #v(0.8em)
    #text(size: 11pt)[
    ${typstEsc(LEGAL)}
    #v(0.55em)
    Contact: #link("mailto:${CONTACT}")[${typstEsc(CONTACT)}]
    #v(0.55em)
    ${typstEsc(TRADEMARK)}
    #v(0.55em)
    ${typstEsc(wip)}
    #v(0.55em)
    Each book opens with a public-domain or CC0 image of its story or a related scene. Sources and licenses are listed in IMAGE-CREDITS.md.
    ]
  ]`);
  out.push(`#set par(justify: true, leading: 0.78em, spacing: 0.82em, first-line-indent: 0pt); #set text(hyphenate: auto)`);
  out.push(`#pagebreak()`);
  out.push(`#outline(title: [Contents], depth: 1)`);
  out.push(`#pagebreak()`);
  for (const { meta, full } of books) {
    out.push(`= ${typstEsc(full.name)}`);
    out.push(`#align(center)[#emph[${typstEsc(full.division || '')}]]`);
    const art = typstBookImage(meta.id, images);
    if (art) out.push(art);
    for (const ch of full.chapters || []) {
      out.push(`== Chapter ${ch.n}`);
      out.push('#counter(footnote).update(0)');
      if (ch.heading) out.push(`#align(center)[#smallcaps[${typstMarked(ch.heading, ch)}]]`);
      if (ch.title) out.push(`#align(center)[#emph[${typstMarked(ch.title, ch)}]]`);
      for (const group of chapterParagraphs(ch)) {
        const poetry = group.some((v) => String(v.text).includes('\n'));
        if (poetry) {
          for (const v of group) {
            if (ch.subheads && ch.subheads[v.v]) out.push(`#emph[${typstEsc(ch.subheads[v.v])}]`);
            const lines = String(v.text).split('\n');
            const bits = lines.map((line, i) => {
              return (i === 0 ? `#vn(${v.v}) ` : '#h(1.1em) ') + typstMarked(line, ch);
            });
            out.push(bits.join(' \\\n'));
          }
        } else {
          const sentence = group.map((v) => {
            const sub = ch.subheads && ch.subheads[v.v] ? `#emph[${typstEsc(ch.subheads[v.v])}] ` : '';
            return sub + `#vn(${v.v}) ` + typstMarked(v.text, ch);
          }).join(' ');
          out.push(sentence);
          out.push('');
        }
      }
    }
  }
  const file = path.join(WORK, 'book.typ');
  fs.writeFileSync(file, out.join('\n\n'));
  return file;
}

function htmlNoteRef(bookId, ch, m) {
  const id = 'fn-' + bookId + '-' + ch.n + '-' + m;
  const refid = 'fnref-' + bookId + '-' + ch.n + '-' + m;
  // Letter markers, not doc-noteref: Pandoc would otherwise renumber them 1, 2, 3.
  return `<sup class="fn"><a href="#${id}" id="${refid}" epub:type="noteref">${m}</a></sup>`;
}
function htmlMarked(text, bookId, ch) {
  return htmlEsc(text).replace(/\{([a-z]+)\}/g, (_, m) => htmlNoteRef(bookId, ch, m));
}
function htmlVerse(bookId, ch, v) {
  const text = htmlMarked(v.text, bookId, ch).replace(/\n/g, '<br>');
  return `<sup class="v">${v.v}</sup> ${text}`;
}

function writeHtml(books, images, cat) {
  const body = [];
  body.push('<div class="front">');
  body.push('<p class="eyebrow">All rights reserved</p>');
  body.push('<p class="site-title">' + htmlEsc(TITLE) + '</p>');
  body.push('<p>' + htmlEsc(LEGAL) + '</p>');
  body.push('<p>Contact: <a href="mailto:' + CONTACT + '">' + CONTACT + '</a></p>');
  body.push('<p>' + htmlEsc(TRADEMARK) + '</p>');
  body.push('<p>' + htmlEsc(workInProgress(books, cat)) + '</p>');
  body.push('<p>Each book opens with a public-domain or CC0 image of its story or a related scene. Sources and licenses are listed in IMAGE-CREDITS.md.</p>');
  body.push('</div>');
  for (const { meta, full } of books) {
    const bid = 'b-' + meta.id;
    body.push(`<h1 id="${htmlEsc(bid)}">${htmlEsc(full.name)}</h1>`);
    body.push(`<p class="div">${htmlEsc(meta.division)}</p>`);
    const im = images && images[meta.id];
    if (im && im.file) {
      body.push(`<figure class="book-art"><img src="images/${htmlEsc(im.file)}" alt="${htmlEsc(im.caption || full.name)}" /><figcaption>${htmlEsc(im.caption || '')}</figcaption></figure>`);
    }
    body.push('<div class="book-toc"><p>Chapters</p><ol>');
    for (const ch of full.chapters || []) {
      body.push(`<li><a href="#${bid}-c${ch.n}">Chapter ${ch.n}</a></li>`);
    }
    body.push('</ol></div>');
    for (const ch of full.chapters || []) {
      body.push(`<h2 id="${bid}-c${ch.n}">Chapter ${ch.n}</h2>`);
      if (ch.heading) body.push(`<p class="ch-heading">${htmlMarked(ch.heading, meta.id, ch)}</p>`);
      if (ch.title) body.push(`<p class="ch-title">${htmlMarked(ch.title, meta.id, ch)}</p>`);
      let first = true;
      for (const group of chapterParagraphs(ch)) {
        const poetry = group.some((v) => String(v.text).includes('\n'));
        const cls = (first ? 'first' : '') + (poetry ? ' poem' : '');
        const inner = group.map((v) => {
          const sub = ch.subheads && ch.subheads[v.v] ? `<strong class="sub">${htmlEsc(ch.subheads[v.v])}</strong> ` : '';
          return sub + htmlVerse(meta.id, ch, v);
        }).join(' ');
        body.push(`<p class="${cls.trim()}">${inner}</p>`);
        first = false;
      }
      if (ch.notes && ch.notes.length) {
        body.push('<div class="notes">');
        for (const n of ch.notes) {
          const id = 'fn-' + meta.id + '-' + ch.n + '-' + n.m;
          const refid = 'fnref-' + meta.id + '-' + ch.n + '-' + n.m;
          body.push(`<div id="${id}" class="fn" epub:type="footnote"><p><a href="#${refid}"><sup>${htmlEsc(n.m)}</sup></a> ${htmlEsc(n.ref)} ${htmlEsc(n.text)}</p></div>`);
        }
        body.push('</div>');
      }
    }
    if (full.sourceNote) body.push(`<p class="source">${htmlEsc(full.sourceNote)}</p>`);
  }
  const html = `<!DOCTYPE html>
<html lang="en" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
<meta charset="utf-8">
<title>${htmlEsc(TITLE)}</title>
</head>
<body>
${body.join('\n')}
</body>
</html>
`;
  const file = path.join(WORK, 'book.html');
  fs.writeFileSync(file, html);
  const css = `body{font-family:Georgia,serif;font-size:1.125rem;line-height:1.55;}
h1{page-break-before:always;font-size:1.75rem;}
h2{font-size:1.25rem;margin-top:1.4rem;}
.v,.fn{font-size:.65em;font-weight:700;vertical-align:super;}
p{margin:.45em 0;}
.poem{margin-left:1em;}
.book-toc{font-size:.9rem;}
.notes{font-size:.9rem;}
.front h1{page-break-before:auto;}
.book-art{margin:0.8em auto 1.2em;text-align:center;max-width:28rem;}
.book-art img{width:100%;height:auto;display:block;}
.book-art figcaption{font-size:.75rem;font-style:italic;color:#5a4632;margin-top:.4em;}
`;
  fs.writeFileSync(path.join(WORK, 'epub.css'), css);
  return file;
}

function embedEpubImages() {
  const script = `
import zipfile, re, os
from pathlib import Path
root = Path(os.environ['CTB_ROOT'])
src = root / 'downloads' / ${JSON.stringify(EPUB_NAME)}
imgdir = root / 'downloads' / 'images'
tmp = src.with_suffix('.epub.tmp')
images = sorted(imgdir.glob('*.jpg'))
with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(tmp, 'w') as zout:
    mout = zin.getinfo('mimetype')
    zout.writestr(mout, zin.read('mimetype'), compress_type=zipfile.ZIP_STORED)
    for info in zin.infolist():
        if info.filename == 'mimetype':
            continue
        data = zin.read(info)
        name = info.filename
        if name.endswith('.opf'):
            text = data.decode('utf-8')
            items = [f'    <item id="img-{p.stem}" href="images/{p.name}" media-type="image/jpeg"/>' for p in images]
            if '</manifest>' not in text:
                raise SystemExit('no manifest')
            text = text.replace('</manifest>', '\\n'.join(items) + '\\n  </manifest>', 1)
            data = text.encode('utf-8')
        elif name.endswith('.xhtml') or name.endswith('.html'):
            text = data.decode('utf-8')
            text = re.sub(r'src="[^"]*images/([^"]+)"', r'src="../images/\\1"', text)
            data = text.encode('utf-8')
        zout.writestr(info, data)
    for p in images:
        zout.write(p, f'EPUB/images/{p.name}', compress_type=zipfile.ZIP_DEFLATED)
tmp.replace(src)
print('embedded', len(images), 'images')
`;
  const r = spawnSync('python3', ['-c', script], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { CTB_ROOT: ROOT }),
  });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error('embed epub images failed');
  }
  if (r.stdout) console.log(r.stdout.trim());
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(cmd + ' failed with status ' + r.status);
}

function formatSize(n) {
  return (n / 1048576).toFixed(1) + ' MB';
}

function patchDownloadPage(pdfBytes, epubBytes) {
  const p = path.join(ROOT, 'downloads.html');
  let html = fs.readFileSync(p, 'utf8');
  const next = html
    .replace(/<!--pdf-size-->[\s\S]*?<!--\/pdf-size-->/, '<!--pdf-size-->' + formatSize(pdfBytes) + '<!--/pdf-size-->')
    .replace(/<!--epub-size-->[\s\S]*?<!--\/epub-size-->/, '<!--epub-size-->' + formatSize(epubBytes) + '<!--/epub-size-->');
  if (next === html) {
    console.warn('downloads.html size markers were not updated');
  } else {
    fs.writeFileSync(p, next);
  }
  fs.writeFileSync(path.join(OUT, 'sizes.json'), JSON.stringify({
    pdf: { file: PDF_NAME, bytes: pdfBytes, label: formatSize(pdfBytes) },
    epub: { file: EPUB_NAME, bytes: epubBytes, label: formatSize(epubBytes) },
  }, null, 2) + '\n');
}

function main() {
  fs.mkdirSync(WORK, { recursive: true });
  console.log('Loading published books…');
  const { cat, books } = loadBooks();
  console.log(books.length + ' books (' + bookRange(books) + ')');
  const images = loadImageManifest();
  const missingArt = books.filter(({ meta }) => !(images[meta.id] && images[meta.id].file)).map(({ meta }) => meta.id);
  if (missingArt.length) console.warn('No book image yet for: ' + missingArt.join(', '));
  const html = writeHtml(books, images, cat);
  const typ = writeTypst(books, images, cat);
  console.log('EPUB…');
  run('pandoc', [
    html, '-o', path.join(OUT, EPUB_NAME),
    '--from=html', '--to=epub3',
    '--toc', '--toc-depth=2',
    '--split-level=1',
    '--css', path.join(WORK, 'epub.css'),
    '--metadata', 'title=' + TITLE,
    '--metadata', 'lang=en',
    '--metadata', 'creator=Jose Santiago',
    '--metadata', 'rights=' + LEGAL + ' ' + CONTACT,
    '--metadata', 'identifier=' + EPUB_UUID,
    '--metadata', 'description=' + workInProgress(books, cat) + ' ' + LEGAL + ' ' + CONTACT,
  ]);
  console.log('Embedding book images in EPUB…');
  embedEpubImages();
  if (fs.existsSync(EPUBCHECK)) {
    console.log('epubcheck…');
    run('java', ['-jar', EPUBCHECK, path.join(OUT, EPUB_NAME)]);
  } else {
    console.warn('epubcheck jar not found, skipped');
  }
  console.log('PDF…');
  run('typst', ['compile', '--root', OUT, typ, path.join(OUT, PDF_NAME)]);
  const pdfBytes = fs.statSync(path.join(OUT, PDF_NAME)).size;
  const epubBytes = fs.statSync(path.join(OUT, EPUB_NAME)).size;
  console.log(PDF_NAME, pdfBytes);
  console.log(EPUB_NAME, epubBytes);
  if (pdfBytes > 95 * 1024 * 1024 || epubBytes > 95 * 1024 * 1024) {
    throw new Error('A download is over 95 MB. Host it on a GitHub Release instead of Pages.');
  }
  patchDownloadPage(pdfBytes, epubBytes);
  console.log('Done');
}

main();
