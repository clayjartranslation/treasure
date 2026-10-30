#!/usr/bin/env node
/*
 * Add or update a translated book in the app.
 *
 *   node tools/add-book.js path/to/exodus.json
 *
 * The book file must look like data/books/genesis.json:
 *   { "id": "exodus", "name": "Exodus", "division": "Old Testament", "sourceNote": "...",
 *     "chapters": [ { "n": 1, "paras": [1, 8, 15],
 *                     "verses": [ { "v": 1, "text": "These are the names{a} ..." } ],
 *                     "notes":  [ { "m": "a", "ref": "1:1", "text": "..." } ] } ] }
 *
 * Footnote markers are written inline as {a}, {b}, ... and must match a note in the same chapter.
 * The "id" must match a book id in data/books.json (lowercase name with dashes, e.g. "1-maccabees").
 * The script validates the file, copies it to data/books/<id>.json, marks its chapters as translated
 * in data/books.json, and bumps the offline cache version in sw.js so phones fetch the update.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const file = process.argv[2];
if (!file) { console.error('Usage: node tools/add-book.js path/to/book.json'); process.exit(1); }
const book = JSON.parse(fs.readFileSync(file, 'utf8'));
const catPath = path.join(ROOT, 'data/books.json');
const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
const entry = cat.books.find((b) => b.id === book.id);
const errors = [];
if (!entry) errors.push(`Unknown book id "${book.id}". Known ids: ${cat.books.map((b) => b.id).join(', ')}`);
if (!Array.isArray(book.chapters) || !book.chapters.length) errors.push('No chapters.');
for (const c of book.chapters || []) {
  if (!Number.isInteger(c.n)) errors.push('Chapter without a number.');
  (c.verses || []).forEach((v, i) => { if (v.v !== i + 1) errors.push(`${book.name} ${c.n}: verse ${i + 1} is numbered ${v.v}.`); });
  if (!Array.isArray(c.paras) || c.paras[0] !== 1) errors.push(`${book.name} ${c.n}: "paras" must start with 1 (verse numbers where paragraphs begin).`);
  const used = [c.title || ''].concat((c.verses || []).map((v) => v.text)).flatMap((t) => [...t.matchAll(/\{([a-z]+)\}/g)].map((x) => x[1]));
  const defined = (c.notes || []).map((x) => x.m);
  used.filter((m) => !defined.includes(m)).forEach((m) => errors.push(`${book.name} ${c.n}: marker {${m}} has no note.`));
  defined.filter((m) => !used.includes(m)).forEach((m) => errors.push(`${book.name} ${c.n}: note ${m} has no marker.`));
}
if (errors.length) { console.error('Not added:\n- ' + errors.join('\n- ')); process.exit(1); }
book.chapters.sort((a, b) => a.n - b.n);
book.division = entry.division;
const rel = `data/books/${book.id}.json`;
fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(book, null, 1) + '\n');
entry.translated = book.chapters.map((c) => c.n);
entry.file = rel;
fs.writeFileSync(catPath, JSON.stringify(cat, null, 1) + '\n');
const swPath = path.join(ROOT, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8').replace(/const VERSION = 'ctb-v(\d+)';/, (_, n) => `const VERSION = 'ctb-v${+n + 1}';`);
fs.writeFileSync(swPath, sw);
const nv = book.chapters.reduce((n, c) => n + c.verses.length, 0);
console.log(`Added ${book.name}: chapters ${entry.translated.join(', ')} (${nv} verses). Cache version bumped.`);
