const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const isCtb = fs.existsSync(path.join(root, 'downloads.html'));
const base = isCtb
  ? 'https://clayjartranslation.github.io/treasure/'
  : 'https://clayjartranslation.github.io/';

const xml = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
assert.ok(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
assert.ok(xml.includes('</urlset>'));

const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.ok(locs.length > 8, 'sitemap should list chapter pages, not only top-level pages');
assert.strictEqual(locs[0], base, 'homepage should be first');
assert.ok(locs.includes(base + 'devotional.html'));
assert.ok(locs.includes(base + 'bible-in-a-year.html'));
assert.ok(locs.includes(base + 'how-to-use.html'));
assert.ok(locs.includes(base + 's/genesis/1.html'));
if (isCtb) {
  assert.ok(locs.includes(base + 'downloads.html'));
  assert.ok(locs.includes(base + 's/lamentations/1.html'));
} else {
  assert.ok(locs.includes(base + 'downloads/'));
  assert.ok(locs.includes(base + 's/revelation/22.html'));
  assert.ok(locs.includes(base + 's/joseph-and-aseneth/1.html'));
}
assert.ok(!locs.some((u) => /google[0-9a-f]+\.html/i.test(u)), 'verification file must not be in the sitemap');
assert.ok(locs.every((u) => u.startsWith(base)), 'every URL must be absolute and on this site');
assert.strictEqual(new Set(locs).size, locs.length, 'duplicate URLs in sitemap');
assert.ok((xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length === locs.length);

if (!isCtb) {
  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  assert.ok(/^User-agent: \*\nAllow: \//m.test(robots), 'robots.txt should allow crawlers');
  assert.ok(robots.includes('Sitemap: https://clayjartranslation.github.io/sitemap.xml'));
  assert.ok(robots.includes('Sitemap: https://clayjartranslation.github.io/treasure/sitemap.xml'));
}

console.log('sitemap tests passed (' + locs.length + ' URLs)');
