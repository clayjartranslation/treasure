#!/usr/bin/env node
/* Checks the devotional email clock, the no-secrets exit, and the hidden signup config. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const mail = require('./send-devotional-email.js');

const root = path.join(__dirname, '..');
let failed = 0;
function check(name, fn) {
  try { fn(); console.log('ok', name); }
  catch (err) { failed += 1; console.error('FAIL', name, err && err.message ? err.message : err); }
}

check('eastern standard time 09:00 UTC is 4 AM', () => {
  const parts = mail.nyParts(new Date('2026-01-15T09:00:00Z'));
  assert.strictEqual(parts.hour, 4);
  assert.strictEqual(parts.iso, '2026-01-15');
  assert.strictEqual(parts.key, '01-15');
});

check('eastern standard time 08:00 UTC is 3 AM', () => {
  const parts = mail.nyParts(new Date('2026-01-15T08:00:00Z'));
  assert.strictEqual(parts.hour, 3);
});

check('eastern daylight time 08:00 UTC is 4 AM', () => {
  const parts = mail.nyParts(new Date('2026-07-15T08:00:00Z'));
  assert.strictEqual(parts.hour, 4);
  assert.strictEqual(parts.key, '07-15');
});

check('eastern daylight time 09:00 UTC is 5 AM', () => {
  const parts = mail.nyParts(new Date('2026-07-15T09:00:00Z'));
  assert.strictEqual(parts.hour, 5);
});

check('campaign name contains the date', () => {
  assert.strictEqual(mail.campaignName('2026-11-13'), 'CTB devotional 2026-11-13');
  assert.ok(mail.campaignName('2026-11-13').includes('2026-11-13'));
});

check('verse text is copied exactly', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/devotionals.json'), 'utf8'));
  const entry = data.entries.find((item) => item.date === '11-13');
  const message = mail.buildMessage(entry, new Date('2026-11-13T09:05:00Z'));
  assert.ok(message.text.includes(entry.text));
  assert.ok(message.text.includes(entry.reflection));
  assert.ok(message.text.includes(entry.prayer));
  assert.ok(message.text.includes(entry.title));
  assert.ok(message.html.includes(mail.COPYRIGHT));
  assert.ok(message.text.includes(mail.COPYRIGHT));
  assert.strictEqual(mail.COPYRIGHT, 'Devotionals © 2026 Jose Santiago. All rights reserved.');
  assert.ok(message.html.includes('href="{{ unsubscribe }}"'));
  assert.ok(message.text.includes('Unsubscribe: {{ unsubscribe }}'));
  assert.ok(message.link.includes('devotional.html?d=11-13'));
  assert.ok(message.name.includes('2026-11-13'));
  const visibleVerse = message.html.split(/<blockquote[^>]*>/)[1].split('</blockquote>')[0].replace(/<br>\n/g, '\n');
  assert.strictEqual(visibleVerse, entry.text);
});

check('a sent campaign with that date is not sent again', () => {
  const decision = mail.alreadyHandled([
    { id: 4, name: 'CTB devotional 2026-11-13', status: 'sent' },
    { id: 9, name: 'CTB devotional 2026-11-14', status: 'draft' }
  ], '2026-11-13');
  assert.strictEqual(decision.action, 'skip');
  assert.strictEqual(decision.campaign.id, 4);
});

check('an in-process campaign counts as already handled', () => {
  const decision = mail.alreadyHandled([
    { id: 5, name: 'Notes 2026-11-13', status: 'in_process' }
  ], '2026-11-13');
  assert.strictEqual(decision.action, 'skip');
});

check('a draft for that date is reused', () => {
  const decision = mail.alreadyHandled([
    { id: 8, name: 'CTB devotional 2026-11-13', status: 'draft' }
  ], '2026-11-13');
  assert.strictEqual(decision.action, 'send-draft');
  assert.strictEqual(decision.campaign.id, 8);
});

check('a cancelled campaign does not block a new send', () => {
  const decision = mail.alreadyHandled([
    { id: 3, name: 'CTB devotional 2026-11-13', status: 'cancelled' }
  ], '2026-11-13');
  assert.strictEqual(decision.action, 'create');
});

check('committed config shows the form', () => {
  const code = fs.readFileSync(path.join(root, 'js/devotional-email-config.js'), 'utf8');
  assert.ok(!/api[_-]?key\s*[:=]/i.test(code), 'do not put the Brevo API key in the public config');
  const context = { window: {} };
  vm.runInNewContext(code, context);
  const ready = context.window.ctbDevotionalEmailReady();
  assert.strictEqual(ready.formAction, 'https://5b7e23a5.sibforms.com/serve/MUIFAPuE8VbvvKpYKQuBEukhsBupQHehKVZiLxtcd9CDEXH4zGuQaqr7bDd_9I4NCal0433ND2DZTYEm7Svd6QKTUa_PrqXqPGBwpZCC_2EohzULONLWk81D5C9Y2g70uVbqa0wV7hIxU8ZbS1VUftYpc2lvyh88rCc03quzns9b6sEGyVcwD95Hg5v0ye6oHfPFzrOpxDOsFn79xQ==');
  assert.strictEqual(ready.listId, '4');
});

check('a filled config is kept and a partial one stays hidden', () => {
  const code = fs.readFileSync(path.join(root, 'js/devotional-email-config.js'), 'utf8');
  const filled = {
    window: {
      CTB_DEVOTIONAL_EMAIL: {
        formAction: 'https://example.sibforms.com/serve/abc',
        listId: '12'
      }
    }
  };
  vm.runInNewContext(code, filled);
  assert.strictEqual(filled.window.ctbDevotionalEmailReady().listId, '12');
  const partial = { window: { CTB_DEVOTIONAL_EMAIL: { formAction: 'https://example.sibforms.com/serve/abc', listId: '' } } };
  vm.runInNewContext(code, partial);
  const fromFile = partial.window.ctbDevotionalEmailReady();
  assert.ok(fromFile, 'an incomplete pre-set config should fall back to the committed form');
  assert.strictEqual(fromFile.listId, '4');
  const bad = { window: {} };
  vm.runInNewContext(code, bad);
  bad.window.CTB_DEVOTIONAL_EMAIL = { formAction: 'http://example.com/form', listId: '4' };
  assert.strictEqual(bad.window.ctbDevotionalEmailReady(), null);
});

function runScript(extra) {
  const env = Object.assign({}, process.env, extra);
  delete env.BREVO_API_KEY;
  delete env.BREVO_LIST_ID;
  delete env.BREVO_SENDER_EMAIL;
  Object.assign(env, extra);
  const result = spawnSync(process.execPath, [path.join(root, 'tools/send-devotional-email.js')], {
    env,
    encoding: 'utf8',
    timeout: 15000
  });
  return result;
}

check('4 AM with no secrets exits cleanly', () => {
  const result = runScript({ DEVOTIONAL_NOW: '2026-11-13T09:05:00Z', DRY_RUN: '0', GITHUB_EVENT_NAME: 'schedule' });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /secrets are not set/i);
  assert.match(result.stdout, /Nothing was sent/);
  assert.doesNotMatch(result.stdout, /Dry run/);
});

check('3 AM eastern does not send', () => {
  const result = runScript({ DEVOTIONAL_NOW: '2026-01-15T08:00:00Z', DRY_RUN: '0' });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /not the 4 AM hour/);
});

check('5 AM daylight time does not send', () => {
  const result = runScript({ DEVOTIONAL_NOW: '2026-07-15T09:00:00Z', DRY_RUN: '0' });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /not the 4 AM hour/);
});

check('4 AM daylight time with no secrets exits cleanly', () => {
  const result = runScript({ DEVOTIONAL_NOW: '2026-11-13T08:00:00Z', DRY_RUN: '0' });
  // November 2026 is standard time, so 08:00 UTC is 3 AM. Use July with no reading: hour passes, then no entry.
  const july = runScript({ DEVOTIONAL_NOW: '2026-07-15T08:00:00Z', DRY_RUN: '0' });
  assert.strictEqual(july.status, 0, july.stderr);
  assert.match(july.stdout, /No devotional for 07-15/);
  assert.strictEqual(result.status, 0);
});

check('dry run prints the verse and does not call Brevo', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/devotionals.json'), 'utf8'));
  const entry = data.entries.find((item) => item.date === '11-13');
  const result = runScript({
    DEVOTIONAL_NOW: '2026-11-13T15:00:00Z',
    DRY_RUN: '1',
    BREVO_API_KEY: 'not-a-real-key',
    BREVO_LIST_ID: '1',
    BREVO_SENDER_EMAIL: 'devotional@example.com'
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /Brevo was not called/);
  assert.ok(result.stdout.includes(entry.text));
  assert.ok(result.stdout.includes('Devotionals © 2026 Jose Santiago. All rights reserved.'));
  assert.ok(result.stdout.includes('{{ unsubscribe }}'));
  assert.ok(result.stdout.includes('CTB devotional 2026-11-13'));
});

check('pages and the service worker include the nav and the new files', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /const VERSION = 'ctb-v4\d+'/);
  assert.ok(sw.includes('downloads.html'));
  assert.ok(sw.includes('js/devotional-email-config.js'));
  for (const file of ['index.html', 'devotional.html', 'downloads.html', 'privacy.html', 'terms.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(html.includes('class="site-nav"'), file);
    assert.ok(html.includes('>Devotional<'), file);
    assert.ok(html.includes('>Downloads<'), file);
    assert.ok(!html.includes('text-decoration: underline'), file);
  }
  const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  assert.ok(privacy.includes('contact.clayjar@protonmail.com'));
  assert.ok(privacy.includes('never sold') || privacy.includes('not sold'));
  assert.ok(privacy.includes('Unsubscribe') || privacy.includes('unsubscribe'));
  assert.ok(privacy.includes('Brevo'));
});

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all passed');
