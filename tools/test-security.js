/* Static checks for the language menu, legal pages, and security headers. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pages = ['index.html', 'devotional.html', 'downloads.html', 'privacy.html', 'terms.html'];
const htmls = pages.map((name) => fs.readFileSync(path.join(root, name), 'utf8'));
const csps = htmls.map((html) => {
  const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(match, 'every page needs a Content-Security-Policy meta');
  return match[1];
});
csps.forEach((csp) => assert.strictEqual(csp, csps[0]));
const csp = csps[0];
assert.ok(csp.startsWith("default-src 'self'"));
assert.ok(!csp.includes("'unsafe-eval'"));
assert.ok(!csp.includes("'unsafe-inline'"));
assert.ok(csp.includes('script-src-attr \'none\''));
assert.ok(csp.includes('https://www.gstatic.com'));
assert.ok(csp.includes('https://huggingface.co'));
assert.ok(csp.includes('https://us.aws.cdn.hf.co'));
assert.ok(csp.includes('https://*.sibforms.com'));
assert.ok(csp.includes('https://www.paypal.com'));
assert.ok(csp.includes('https://translate.googleapis.com'));
assert.ok(csp.includes('upgrade-insecure-requests'));

htmls.forEach((html, i) => {
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), pages[i] + ' still has an inline script');
  assert.ok(!/<style[\s>]/.test(html), pages[i] + ' still has an inline style block');
  assert.ok(!/\sstyle=/.test(html), pages[i] + ' still has a style attribute');
  assert.ok(html.includes('js/languages.js') && html.includes('js/lang.js'), pages[i]);
  assert.ok(html.includes('js/register-sw.js'), pages[i]);
  assert.ok(html.includes('name="referrer" content="strict-origin-when-cross-origin"'), pages[i]);
  assert.ok(html.includes('id="langNotice"'), pages[i]);
  assert.ok(html.includes('Machine translation by Google. The English text is the official Clay Jar Treasure Bible.'), pages[i]);
  assert.ok(html.includes('class="notranslate" translate="no"'), pages[i]);
  assert.ok(html.includes('© 2026 Jose Santiago. All rights reserved.'), pages[i]);
  assert.ok(html.includes('class="site-nav"'), pages[i]);
  const blank = html.match(/<a [^>]*target="_blank"[^>]*>/g) || [];
  blank.forEach((tag) => {
    assert.ok(tag.includes('rel="noopener noreferrer"'), tag);
  });
});

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.match(sw, /const VERSION = 'ctb-v42'/);
assert.ok(sw.includes('js/lang.js'));
assert.ok(sw.includes('js/languages.js'));

const security = fs.readFileSync(path.join(root, '.well-known/security.txt'), 'utf8');
assert.ok(security.includes('Contact: mailto:contact.clayjar@protonmail.com'));
assert.ok(security.includes('Expires: 2027-11-14T23:59:59.000Z'));

const privacy = htmls[3];
const terms = htmls[4];
['Google Translate', 'local storage', 'Brevo', 'double opt-in', 'unsubscribe', 'PayPal', 'PIPL', 'APPI', 'POPIA', 'CCPA', 'LGPD', 'PIPEDA', 'contact.clayjar@protonmail.com', 'not sold'].forEach((phrase) => {
  assert.ok(privacy.includes(phrase), 'privacy missing ' + phrase);
});
['AS IS', 'AS AVAILABLE', 'US$50', 'Federal Arbitration Act', 'Plymouth County', '30 days', 'small claims', 'Marshfield', 'do not make a lawsuit impossible', '501(c)(3)', 'English text is the official', 'no license', 'Brevo', 'double opt-in', 'PayPal', 'Where your local law gives you rights'].forEach((phrase) => {
  assert.ok(terms.toLowerCase().includes(phrase.toLowerCase()), 'terms missing ' + phrase);
});
assert.ok(terms.includes('November 14, 2026'));
assert.ok(privacy.includes('November 14, 2026'));

const workflow = fs.readFileSync(path.join(root, '.github/workflows/devotional-email.yml'), 'utf8');
assert.ok(!workflow.includes('actions/checkout@v'));
assert.ok(workflow.includes('actions/checkout@11d5960a326750d5838078e36cf38b85af677262'));
assert.ok(workflow.includes('permissions:'));
assert.ok(workflow.includes('contents: read'));

const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
assert.ok(rules.includes('request.auth.uid == uid'));
assert.ok(rules.includes("bibleId == 'ctb'"));
assert.ok(!rules.includes('match /{document=**}') || rules.includes('allow read, write: if false'));

console.log('security ok');
