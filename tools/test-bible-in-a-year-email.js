const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mail = require('./send-bible-in-a-year-email.js');

const root = path.join(__dirname, '..');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }

const page = read('bible-in-a-year.html');
assert.match(page, /Get each day’s reading by email/);
assert.match(page, /name="EMAIL"/);
assert.match(page, /name="email_address_check"/);
assert.match(page, /name="locale"/);
assert.match(page, /You’ll get a confirmation email first, and you can unsubscribe any time/);
assert.match(page, /action="https:\/\/5b7e23a5\.sibforms\.com\/serve\/MUIFAKwj8BW4A8yBKLWymZRj6WcPY2dE6tcgHpPnySZfjiKrM0UQsXr5qENxM8RiUxXJ_tysOhA-kQ8LaRYbRIUpTnVwm2mBnSl8d25vkBmkvv8QyL_7pfE_VWHNu_c5DEDDLsBF68a9kRlcEX4lU1Om1ix0nEAIH_1s116JlVEqjOsFHxiME0EHGlLaCTnkdMLlqVjxt4q2TvQBZg=="/);
assert.doesNotMatch(page, /sibforms\.com\/forms\/end-form/);
assert.doesNotMatch(page, /sib-styles\.css/);
assert.doesNotMatch(page, /assets\.brevo\.com/);
assert.match(page, /form-action 'self' https:\/\/\*\.sibforms\.com/);

const sw = read('sw.js');
assert.match(sw, /const VERSION = 'ctb-v72'/);
assert.match(sw, /if \(req\.method !== 'GET' \|\| new URL\(req\.url\)\.origin !== location\.origin\) return;/);
assert.match(sw, /bible-in-a-year\.html/);
assert.doesNotMatch(sw, /api[_-]?key/i);

assert.strictEqual(mail.DEFAULT_LIST_ID, '6');
assert.strictEqual(mail.SEND_HOUR, 4);
assert.strictEqual(mail.DEFAULT_TZ, 'America/New_York');
assert.ok(!fs.readFileSync(path.join(root, 'tools/send-bible-in-a-year-email.js'), 'utf8').includes('xkeysib-'));

const winter = mail.nyParts(new Date('2026-11-21T09:10:00Z'));
assert.strictEqual(winter.isoDate, '2026-11-21');
assert.strictEqual(winter.key, '11-21');
assert.strictEqual(winter.hour, 4);
assert.strictEqual(mail.inSendHour(winter), true);
assert.strictEqual(mail.inSendHour(mail.nyParts(new Date('2026-11-21T08:00:00Z'))), false);
assert.strictEqual(mail.inSendHour(mail.nyParts(new Date('2026-07-15T08:10:00Z'))), true, '08:00 UTC is 4 AM in July');
assert.strictEqual(mail.inSendHour(mail.nyParts(new Date('2026-07-15T09:10:00Z'))), false);

const loaded = mail.loadPlan();
assert.strictEqual(loaded.days.length, 365);
const leap = mail.findDay(loaded.days, '02-29');
assert.ok(leap);
assert.strictEqual(leap.date, '02-28');
const nov21 = mail.findDay(loaded.days, '11-21');
assert.ok(nov21);
const email = mail.buildEmail(nov21, '2026-11-21', loaded.published, mail.unsubscribeUrl('reader@example.com'), loaded.days);
assert.match(email.subject, /November 21, 2026/);
assert.match(email.text, /Ezekiel 21/);
assert.match(email.text, /Psalm 136:1/);
assert.match(email.text, /Proverbs 28:17/);
assert.match(email.text, /James 5/);
assert.match(email.text, /https:\/\/clayjartranslation\.github\.io\/#\/read\/ezekiel\/21/);
assert.match(email.text, /https:\/\/clayjartranslation\.github\.io\/treasure\/bible-in-a-year\.html\?d=11-21/);
assert.match(email.text, /https:\/\/clayjartranslation\.github\.io\/treasure\/#\/read\/psalms\/136/);
assert.match(email.text, /Clay Jar Translation/);
assert.match(email.text, /Manage or unsubscribe: https:\/\/clayjartranslation\.github\.io\/treasure\/unsubscribe\.html\?email=reader%40example\.com/);
assert.match(email.html, /Manage or unsubscribe/);
assert.match(email.text, /All rights reserved/);
assert.doesNotMatch(email.text, /xkeysib/);

const secrets = mail.readSecrets({ BREVO_API_KEY: '', BREVO_LIST_ID: '6', BREVO_SENDER_EMAIL: 'a@b.com' });
assert.strictEqual(secrets.ok, false);
assert.ok(secrets.missing.includes('BREVO_API_KEY'));

(async function () {
  const logs = [];
  const code = await mail.run(
    { DRY_RUN: 'true', BREVO_API_KEY: 'test-key', BREVO_LIST_ID: '6', BREVO_SENDER_EMAIL: 'sender@example.com', NOW: '2026-11-21T09:10:00Z' },
    {
      log: (s) => logs.push(String(s)),
      listContacts: async () => [],
      listBlocked: async () => new Set(),
      request: async (key, method, urlPath) => {
        if (String(urlPath).indexOf('/smtp/email') >= 0) throw new Error('should not call Brevo to send during a dry run');
        return { ok: true, status: 201, json: { contacts: [] }, text: '' };
      },
    }
  );
  assert.strictEqual(code, 0);
  const out = logs.join('\n');
  assert.match(out, /No contacts were returned for this list|0 contact/);
  assert.match(out, /Nothing is sent/);
  assert.match(out, /Ezekiel 21/);
  assert.doesNotMatch(out, /xkeysib/);

  const logs2 = [];
  const code2 = await mail.run(
    { DRY_RUN: 'true', NOW: '2026-11-21T09:10:00Z' },
    { log: (s) => logs2.push(String(s)) }
  );
  assert.strictEqual(code2, 0);
  assert.match(logs2.join('\n'), /Brevo secrets are not all set/);

  const due = mail.dueRecipients([], '2026-11-21', new Set());
  assert.strictEqual(due.total, 0);
  assert.strictEqual(due.due.length, 0);

  const mixed = mail.dueRecipients([
    { email: 'a@example.com', emailBlacklisted: false, attributes: {} },
    { email: 'b@example.com', emailBlacklisted: false, attributes: { LAST_BIAY_DATE: '2026-11-21' } },
    { email: 'c@example.com', emailBlacklisted: true, attributes: {} },
    { email: 'd@example.com', emailBlacklisted: false, attributes: {} },
  ], '2026-11-21', new Set(['d@example.com']));
  assert.strictEqual(mixed.due.length, 1);
  assert.strictEqual(mixed.due[0].email, 'a@example.com');
  assert.strictEqual(mixed.skippedAlready, 1);
  assert.strictEqual(mixed.skippedExcluded, 2);

  console.log('bible-in-a-year-email tests ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
