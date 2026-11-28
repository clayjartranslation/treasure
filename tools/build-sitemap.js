#!/usr/bin/env node
/* Rebuilds sitemap.xml with every public HTML page (home, help pages, and
   each published chapter at s/<book>/<chapter>.html).
   Run: node tools/build-sitemap.js
   The share-pages workflow runs this when books change. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITE = fs.existsSync(path.join(ROOT, 'downloads.html')) ? 'ctb' : 'cjt';
const BASE = SITE === 'ctb'
  ? 'https://clayjartranslation.github.io/treasure/'
  : 'https://clayjartranslation.github.io/';
const SKIP_DIRS = new Set(['tests', 'tools', 'docs', 'node_modules', '.git', '.github']);
const today = new Date().toISOString().slice(0, 10);

function walkHtml(dir, rel) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const abs = path.join(dir, name);
    const child = rel ? rel + '/' + name : name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      out.push(...walkHtml(abs, child));
    } else if (name.endsWith('.html')) {
      out.push(child);
    }
  }
  return out;
}

function isPublic(rel) {
  const base = path.basename(rel);
  // Hidden preview pages (such as ask.html) carry robots noindex and stay out of the sitemap.
  if (/<meta name="robots" content="noindex">/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) return false;
  return !/^google[0-9a-f]+\.html$/i.test(base)
    && !/^yandex_[0-9a-f]+\.html$/i.test(base);
}

function locFor(rel) {
  if (rel === 'index.html') return BASE;
  if (rel === 'downloads/index.html') return BASE + 'downloads/';
  return BASE + rel;
}

function sortKey(rel) {
  const m = rel.match(/^s\/([^/]+)\/(\d+)\.html$/);
  if (m) return `2\t${m[1]}\t${String(Number(m[2])).padStart(4, '0')}`;
  if (rel === 'index.html') return '0';
  return '1\t' + rel;
}

function gitDates() {
  const map = new Map();
  try {
    const out = execSync('git log --format=%cs --name-only', {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
    });
    let date = null;
    for (const line of out.split('\n')) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(line)) { date = line; continue; }
      if (date && line && !map.has(line)) map.set(line, date);
    }
  } catch (_) {}
  return map;
}

function dirtyFiles() {
  const set = new Set();
  try {
    const out = execSync('git status --porcelain -uall', { cwd: ROOT, encoding: 'utf8' });
    for (const line of out.split('\n')) {
      if (line.length < 4) continue;
      const rest = line.slice(3);
      const dest = rest.includes(' -> ') ? rest.split(' -> ').pop() : rest;
      set.add(dest.replace(/^"|"$/g, ''));
    }
  } catch (_) {}
  return set;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const files = walkHtml(ROOT, '').filter(isPublic).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
const dates = gitDates();
const dirty = dirtyFiles();
const rows = files.map((rel) => {
  const lastmod = dirty.has(rel) || !dates.has(rel) ? today : dates.get(rel);
  return `  <url>\n    <loc>${esc(locFor(rel))}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
});
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`Wrote sitemap.xml with ${files.length} URLs for ${SITE}.`);
