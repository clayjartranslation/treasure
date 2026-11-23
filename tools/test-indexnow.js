const assert = require('assert');
const { KEY, KEY_LOCATION, BASE, urlFor, urlsFromFiles } = require('./ping-indexnow');

assert.strictEqual(KEY_LOCATION, 'https://clayjartranslation.github.io/' + KEY + '.txt');
assert.match(KEY, /^[a-zA-Z0-9-]{8,128}$/);
assert.ok(BASE.endsWith('/treasure/'));

assert.strictEqual(urlFor('index.html'), BASE);
assert.strictEqual(urlFor('devotional.html'), BASE + 'devotional.html');
assert.strictEqual(urlFor('downloads.html'), BASE + 'downloads.html');
assert.strictEqual(urlFor('s/genesis/1.html'), BASE + 's/genesis/1.html');
assert.strictEqual(urlFor('data/devotionals.json'), BASE + 'devotional.html');
assert.strictEqual(urlFor('data/bible-in-a-year.json'), BASE + 'bible-in-a-year.html');
assert.strictEqual(urlFor('yandex_53cf987660058f19.html'), null);
assert.strictEqual(urlFor('tools/ping-indexnow.js'), null);
assert.strictEqual(urlFor('sw.js'), null);

const urls = urlsFromFiles([
  'index.html',
  's/lamentations/1.html',
  'data/devotionals.json',
  'tools/build-sitemap.js',
]);
assert.deepStrictEqual(
  urls.sort(),
  [BASE, BASE + 's/lamentations/1.html', BASE + 'devotional.html'].sort()
);

console.log('indexnow tests passed');
