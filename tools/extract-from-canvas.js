#!/usr/bin/env node
/*
 * Extracts the CJT text from the Page (canvas) source into the app's JSON files.
 * Usage: node tools/extract-from-canvas.js <canvas-source.txt>
 * Writes data/front-matter.json, data/books/genesis.json and updates data/books.json.
 * The translation text is copied exactly as it appears on the Page; nothing is reworded.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(process.argv[2], 'utf8');
const ROOT = path.join(__dirname, '..');

// Find the matching close bracket for the opener at index i.
function matchBracket(s, i) {
  const open = s[i], close = { '[': ']', '{': '}', '(': ')' }[open];
  let depth = 0, inStr = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return j; }
  }
  throw new Error('Unbalanced bracket at ' + i);
}
const evalLiteral = (txt) => Function('"use strict"; return (' + txt + ');')();
function constArray(name) {
  const m = new RegExp('const ' + name + '\\s*:[^=]*=\\s*\\[').exec(src);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  return evalLiteral(src.slice(start, matchBracket(src, start) + 1));
}

// ---------- Scripture ----------
const chapters = [];
const chRe = /\{\s*n:\s*(\d+),\s*verses:\s*(\w+),\s*paras:\s*(\[[^\]]*\]),\s*notes:\s*(\w+)\s*\}/g;
let m;
while ((m = chRe.exec(src))) {
  const n = +m[1];
  const verses = constArray(m[2]);
  const notes = constArray(m[4]);
  if (!verses || !notes) throw new Error('Missing data for chapter ' + n);
  chapters.push({
    n,
    paras: evalLiteral(m[3]),
    verses: verses.map((text, i) => ({ v: i + 1, text })),
    notes: notes.map((x) => ({ m: x.m, ref: x.ref, text: x.text })),
  });
}
chapters.sort((a, b) => a.n - b.n);

// Source note paragraph that closes the Genesis section on the Page.
let sourceNote = '';
const gs = src.indexOf('id="genesis"');
if (gs > -1) {
  const tail = src.slice(gs);
  const tm = /<Text>([\s\S]*?)<\/Text>/.exec(tail.slice(tail.indexOf('renderChapter(c))')));
  if (tm) sourceNote = tm[1].trim();
}

// ---------- Front matter (generic JSX block scan) ----------
function scanBlocks(s) {
  const out = [];
  const tokRe = /<Section\b([^>]*?)>|<\/Section>|<Text>([\s\S]*?)<\/Text>|<Callout\s+lead="([^"]*)"\s+tone="([^"]*)">([\s\S]*?)<\/Callout>|<Properties\s+items=\{|<Steps\s+steps=\{|<Table\s+columns=\{/g;
  const stack = [{ blocks: out }];
  let t;
  while ((t = tokRe.exec(s))) {
    const top = stack[stack.length - 1];
    if (t[0].startsWith('<Section')) {
      const attrs = t[1];
      const h = /heading="([^"]*)"/.exec(attrs) || /heading=\{`([^`]*)`\}/.exec(attrs);
      const id = /id="([^"]*)"/.exec(attrs);
      const sec = { type: 'section', heading: h ? h[1] : '', id: id ? id[1] : undefined, blocks: [] };
      // A Section tag may carry actions={...} containing '>' characters: skip to the true end of the tag.
      const ai = s.indexOf('actions={', t.index);
      if (ai > -1 && ai < t.index + t[0].length) {
        const end = matchBracket(s, ai + 8);
        tokRe.lastIndex = s.indexOf('>', end) + 1;
      }
      top.blocks.push(sec);
      stack.push(sec);
    } else if (t[0] === '</Section>') {
      stack.pop();
    } else if (t[2] !== undefined) {
      top.blocks.push({ type: 'text', text: t[2].trim() });
    } else if (t[3] !== undefined) {
      top.blocks.push({ type: 'callout', lead: t[3], tone: t[4], text: t[5].trim() });
    } else {
      const bi = t.index + t[0].length - 1;
      const be = matchBracket(s, bi);
      const lit = s.slice(bi + 1, be);
      if (t[0].includes('Properties')) top.blocks.push({ type: 'properties', items: evalLiteral(lit) });
      else if (t[0].includes('Steps')) top.blocks.push({ type: 'steps', steps: evalLiteral(lit) });
      else {
        const columns = evalLiteral(lit);
        const ri = s.indexOf('rows={', be);
        const rb = ri + 5, re = matchBracket(s, rb);
        const rowsTxt = s.slice(rb + 1, re).trim();
        if (rowsTxt.startsWith('[')) top.blocks.push({ type: 'table', columns, rows: evalLiteral(rowsTxt) });
        tokRe.lastIndex = re;
      }
      if (!t[0].includes('Table')) tokRe.lastIndex = be;
    }
  }
  return out;
}
const pageStart = src.indexOf('<Page');
const titleM = /<Page\s+title="([^"]*)"\s+summary="([^"]*)"/.exec(src);
const sections = scanBlocks(src.slice(pageStart)).filter((b) => b.type === 'section' && b.id !== 'genesis');
const front = { title: titleM[1], summary: titleM[2], sections };

// ---------- Canon ----------
const lists = { 'Old Testament': constArray('OT'), Apocrypha: constArray('APOC'), 'New Testament': constArray('NT'), Pseudepigrapha: constArray('PSEUD') };
const slug = (s) => s.toLowerCase().replace(/[()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const booksPath = path.join(ROOT, 'data/books.json');
const old = fs.existsSync(booksPath) ? JSON.parse(fs.readFileSync(booksPath, 'utf8')) : null;
const oldById = {};
if (old) old.books.forEach((b) => (oldById[b.id] = b));
const books = [];
for (const [division, arr] of Object.entries(lists)) {
  for (const [name, ch] of arr) {
    const id = slug(name);
    const prev = oldById[id] || {};
    books.push({ id, name, division, chapterCount: String(ch), translated: prev.translated || [], file: prev.file || null });
  }
}
const gen = books.find((b) => b.id === 'genesis');
gen.translated = chapters.map((c) => c.n);
gen.file = 'data/books/genesis.json';

const genesis = { id: 'genesis', name: 'Genesis', division: 'Old Testament', sourceNote, chapters };
fs.writeFileSync(path.join(ROOT, 'data/books/genesis.json'), JSON.stringify(genesis, null, 1) + '\n');
fs.writeFileSync(path.join(ROOT, 'data/front-matter.json'), JSON.stringify(front, null, 1) + '\n');
fs.writeFileSync(booksPath, JSON.stringify({ edition: 'Draft 0.1', divisions: Object.keys(lists), books }, null, 1) + '\n');

// ---------- Checks ----------
let nv = 0, nn = 0;
for (const c of chapters) {
  nv += c.verses.length; nn += c.notes.length;
  const used = c.verses.flatMap((v) => [...v.text.matchAll(/\{([a-z])\}/g)].map((x) => x[1]));
  const defined = c.notes.map((x) => x.m);
  const missing = used.filter((x) => !defined.includes(x));
  const unused = defined.filter((x) => !used.includes(x));
  if (missing.length || unused.length) console.warn(`Genesis ${c.n}: markers without notes ${missing}, notes without markers ${unused}`);
}
console.log(`Chapters: ${chapters.map((c) => c.n).join(', ')} | verses: ${nv} | footnotes: ${nn} | front-matter sections: ${sections.length} | books: ${books.length}`);
