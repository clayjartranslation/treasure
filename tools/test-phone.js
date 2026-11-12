/* E.164 checks for the optional phone sign-in field. No network. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Phone = require('../js/phone-countries.js');

const cfg = fs.readFileSync(path.join(__dirname, '../js/firebase-config.js'), 'utf8');
assert(cfg.includes('phone: false'), 'phone sign-in must ship turned off');

assert(Phone.countries.length >= 230, 'country picker should cover the world, got ' + Phone.countries.length);
const isos = {};
Phone.countries.forEach((c) => {
  assert(!isos[c.iso], 'duplicate ' + c.iso);
  isos[c.iso] = 1;
  assert(/^[A-Z]{2}$/.test(c.iso), c.iso);
  assert(/^\d{1,3}$/.test(c.dial), c.name + ' dial');
  assert(c.min >= 4 && c.max <= 14 && c.min <= c.max, c.name + ' length');
  assert(c.dial.length + c.max <= 15, c.name + ' exceeds E.164');
  const sample = '1'.repeat(c.min);
  const got = Phone.toE164(c.iso, sample);
  assert(got.e164 && /^\+[1-9]\d{6,14}$/.test(got.e164), c.name + ' sample ' + JSON.stringify(got));
});

assert.strictEqual(Phone.toE164('US', '(202) 555-0199').e164, '+12025550199');
assert.strictEqual(Phone.toE164('GB', '07911 123456').e164, '+447911123456');
assert.strictEqual(Phone.toE164('IT', '06 6982 1234').e164, '+390669821234');
assert.ok(Phone.toE164('US', '123').error);
assert.ok(Phone.toE164('US', 'abcdefghij').error);
assert.ok(Phone.toE164('ZZ', '2025550199').error);
assert.ok(Phone.find('us') && Phone.find('us').name === 'United States');

console.log('phone: ok (' + Phone.countries.length + ' countries)');
