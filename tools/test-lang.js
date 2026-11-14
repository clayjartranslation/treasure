/* Language menu: list, labels, and translate-proxy URLs. No network. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const context = { URLSearchParams };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, 'js/languages.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(root, 'js/lang.js'), 'utf8'),
  context
);
const Lang = context.CTBLang;
assert.ok(Lang, 'CTBLang should load without a browser');
assert.strictEqual(Lang.languages.length, 248);
assert.strictEqual(Lang.languages.length + 1, 249);
assert.ok(Lang.known('en'));
assert.ok(Lang.known('es'));
assert.ok(Lang.known('ar'));
assert.ok(!Lang.known('xx'));
assert.ok(!Lang.languages.some((item) => item.code === 'en'));

let prev = '';
Lang.languages.forEach((item) => {
  assert.ok(item.english.localeCompare(prev, 'en', { sensitivity: 'base' }) >= 0, item.english + ' after ' + prev);
  prev = item.english;
});
const es = Lang.languages.find((item) => item.code === 'es');
const ar = Lang.languages.find((item) => item.code === 'ar');
const iw = Lang.languages.find((item) => item.code === 'iw');
assert.strictEqual(es.label, 'Español (Spanish)');
assert.strictEqual(es.rtl, false);
assert.strictEqual(ar.rtl, true);
assert.strictEqual(iw.rtl, true);
assert.ok(ar.label.includes('Arabic'));
assert.ok(ar.label.includes('العربية'));

const base = {
  protocol: 'https:',
  hostname: 'clayjartranslation.github.io',
  pathname: '/treasure/',
  search: '',
  hash: '#/read/genesis/1'
};
assert.strictEqual(
  Lang.urlFor(base, 'es'),
  'https://clayjartranslation-github-io.translate.goog/treasure/?_x_tr_sl=en&_x_tr_tl=es&_x_tr_hl=es&_x_tr_pto=wapp#/read/genesis/1'
);
assert.strictEqual(
  Lang.urlFor({
    protocol: 'https:',
    hostname: 'clayjartranslation.github.io',
    pathname: '/treasure/devotional.html',
    search: '?d=11-13',
    hash: ''
  }, 'ar'),
  'https://clayjartranslation-github-io.translate.goog/treasure/devotional.html?d=11-13&_x_tr_sl=en&_x_tr_tl=ar&_x_tr_hl=ar&_x_tr_pto=wapp'
);
assert.strictEqual(
  Lang.urlFor({
    protocol: 'https:',
    hostname: 'clayjartranslation-github-io.translate.goog',
    pathname: '/treasure/devotional.html',
    search: '?d=11-13&_x_tr_sl=en&_x_tr_tl=es&_x_tr_hl=es&_x_tr_pto=wapp',
    hash: '#today'
  }, 'ar'),
  'https://clayjartranslation-github-io.translate.goog/treasure/devotional.html?d=11-13&_x_tr_sl=en&_x_tr_tl=ar&_x_tr_hl=ar&_x_tr_pto=wapp#today'
);
assert.strictEqual(
  Lang.urlFor({
    protocol: 'https:',
    hostname: 'clayjartranslation-github-io.translate.goog',
    pathname: '/treasure/',
    search: '?_x_tr_sl=en&_x_tr_tl=es&_x_tr_hl=es&_x_tr_pto=wapp',
    hash: '#/read/genesis/1'
  }, 'en'),
  'https://clayjartranslation.github.io/treasure/?_ctb_lang=en#/read/genesis/1'
);
assert.strictEqual(Lang.urlFor(base, 'en'), 'https://clayjartranslation.github.io/treasure/#/read/genesis/1');
assert.strictEqual(Lang.urlFor({ protocol: 'http:', hostname: '127.0.0.1', pathname: '/index.html', search: '', hash: '' }, 'es'), null);
assert.strictEqual(Lang.urlFor(base, '<script>'), null);

const langSrc = fs.readFileSync(path.join(root, 'js/lang.js'), 'utf8');
assert.ok(!langSrc.includes('translate_a/element.js'));
assert.ok(!langSrc.includes('translate.google.com/translate_a'));
console.log('lang ok', Lang.languages.length + 1, 'languages');
