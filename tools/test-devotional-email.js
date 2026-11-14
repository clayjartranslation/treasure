#!/usr/bin/env node
/* Checks the devotional email clock, timezone grouping, the no-secrets exit, and the hidden signup config. */
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
  const parts = mail.tzParts(new Date('2026-01-15T09:00:00Z'), 'America/New_York');
  assert.strictEqual(parts.hour, 4);
  assert.strictEqual(parts.isoDate, '2026-01-15');
  assert.strictEqual(parts.key, '01-15');
});

check('eastern standard time 08:00 UTC is 3 AM', () => {
  const parts = mail.tzParts(new Date('2026-01-15T08:00:00Z'), 'America/New_York');
  assert.strictEqual(parts.hour, 3);
});

check('eastern daylight time 08:00 UTC is 4 AM', () => {
  const parts = mail.tzParts(new Date('2026-07-15T08:00:00Z'), 'America/New_York');
  assert.strictEqual(parts.hour, 4);
  assert.strictEqual(parts.key, '07-15');
});

check('eastern daylight time 09:00 UTC is 5 AM', () => {
  const parts = mail.tzParts(new Date('2026-07-15T09:00:00Z'), 'America/New_York');
  assert.strictEqual(parts.hour, 5);
});

check('spring-forward and fall-back mornings still have a 4 AM hour', () => {
  assert.strictEqual(mail.tzParts(new Date('2026-03-08T08:00:00Z'), 'America/New_York').hour, 4);
  assert.strictEqual(mail.tzParts(new Date('2026-11-01T09:00:00Z'), 'America/New_York').hour, 4);
});

check('other time zones resolve DST-safe local dates', () => {
  const la = mail.tzParts(new Date('2026-11-14T12:00:00Z'), 'America/Los_Angeles');
  assert.strictEqual(la.hour, 4);
  assert.strictEqual(la.isoDate, '2026-11-14');
  const india = mail.tzParts(new Date('2026-11-14T22:30:00Z'), 'Asia/Kolkata');
  assert.strictEqual(india.hour, 4);
  assert.strictEqual(india.isoDate, '2026-11-15');
  const akl = mail.tzParts(new Date('2026-11-14T15:00:00Z'), 'Pacific/Auckland');
  assert.strictEqual(akl.hour, 4);
  assert.strictEqual(akl.isoDate, '2026-11-15');
  assert.strictEqual(mail.resolveTimeZone('Not/A_Zone'), 'America/New_York');
  assert.strictEqual(mail.resolveTimeZone(''), 'America/New_York');
});

check('contacts are grouped by timezone and only the 4 AM hour is due', () => {
  const groups = mail.groupByTimeZone([
    { email: 'ny@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York' } },
    { email: 'la@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/Los_Angeles' } },
    { email: 'again@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York', LAST_DEVO_DATE: '2026-11-13' } },
    { email: 'gone@example.com', emailBlacklisted: true, attributes: { TIMEZONE: 'America/New_York' } },
    { email: 'blocked@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York' } },
    { email: 'missing@example.com', emailBlacklisted: false, attributes: {} },
    { email: 'badtz@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'Not/A_Zone' } },
  ], new Date('2026-11-13T09:10:00Z'), new Set(['blocked@example.com']));
  const byTz = Object.fromEntries(groups.map((g) => [g.timeZone, g]));
  assert.strictEqual(byTz['America/New_York'].due, true);
  assert.deepStrictEqual(byTz['America/New_York'].recipients.map((c) => c.email).sort(), [
    'badtz@example.com', 'missing@example.com', 'ny@example.com'
  ]);
  assert.strictEqual(byTz['America/New_York'].skippedAlready, 1);
  assert.strictEqual(byTz['America/New_York'].skippedExcluded, 2);
  assert.strictEqual(byTz['America/Los_Angeles'].due, false);
  assert.strictEqual(mail.dueCount(groups), 3);
});

check('campaign name contains the date', () => {
  assert.strictEqual(mail.campaignName('2026-11-13'), 'CTB devotional 2026-11-13');
  assert.ok(mail.campaignName('2026-11-13').includes('2026-11-13'));
});

check('verse text is copied exactly and unsubscribe points at the site page', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/devotionals.json'), 'utf8'));
  const entry = data.entries.find((item) => item.date === '11-13');
  const message = mail.buildMessage(entry, new Date('2026-11-13T09:05:00Z'), mail.unsubscribeUrl('reader@example.com'));
  assert.ok(message.text.includes(entry.text));
  assert.ok(message.text.includes(entry.reflection));
  assert.ok(message.text.includes(entry.prayer));
  assert.ok(message.text.includes(entry.title));
  assert.ok(message.html.includes(mail.COPYRIGHT));
  assert.ok(message.text.includes(mail.COPYRIGHT));
  assert.strictEqual(mail.COPYRIGHT, 'Devotionals © 2026 Jose Santiago. All rights reserved.');
  assert.ok(message.html.includes(mail.unsubscribeUrl('reader@example.com')));
  assert.ok(message.text.includes('Unsubscribe: ' + mail.unsubscribeUrl('reader@example.com')));
  assert.ok(!message.html.includes('{{ unsubscribe }}'));
  assert.ok(!message.text.includes('{{ unsubscribe }}'));
  assert.ok(message.link.includes('devotional.html?d=11-13'));
  assert.ok(message.name.includes('2026-11-13'));
  const visibleVerse = message.html.split(/<blockquote[^>]*>/)[1].split('</blockquote>')[0].replace(/<br>\n/g, '\n');
  assert.strictEqual(visibleVerse, entry.text);
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
  assert.match(result.stdout, /secrets are not set|not all set|not configured/i);
  assert.match(result.stdout, /Skipping without sending|Nothing was sent/);
  assert.doesNotMatch(result.stdout, /Dry run/);
});

check('signup form records TIMEZONE and local 4 AM copy', () => {
  const html = fs.readFileSync(path.join(root, 'devotional.html'), 'utf8');
  const formJs = fs.readFileSync(path.join(root, 'js/devotional-form.js'), 'utf8');
  assert.match(html, /name="TIMEZONE"/);
  assert.match(html, /4:00 in your time zone/);
  assert.ok(formJs.includes('resolvedOptions().timeZone'));
  assert.ok(formJs.includes('TIMEZONE'));
});

check('dry run without secrets prints a sample and does not call Brevo', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/devotionals.json'), 'utf8'));
  const entry = data.entries.find((item) => item.date === '11-13');
  const result = runScript({
    DEVOTIONAL_NOW: '2026-11-13T15:00:00Z',
    DRY_RUN: '1'
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run|Nothing is sent|not sent/i);
  assert.ok(result.stdout.includes(entry.text));
  assert.ok(result.stdout.includes('Devotionals © 2026 Jose Santiago. All rights reserved.'));
  assert.ok(result.stdout.includes(mail.UNSUBSCRIBE_PAGE));
  assert.ok(!result.stdout.includes('{{ unsubscribe }}'));
  assert.ok(result.stdout.includes('CTB devotional 2026-11-13'));
});

check('pages and the service worker include the nav and the new files', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /const VERSION = 'ctb-v4\d+'/);
  assert.ok(sw.includes('downloads.html'));
  assert.ok(sw.includes('unsubscribe.html'));
  assert.ok(sw.includes('js/devotional-email-config.js'));
  for (const file of ['index.html', 'devotional.html', 'downloads.html', 'privacy.html', 'terms.html', 'unsubscribe.html']) {
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
  assert.ok(privacy.includes('time zone'));
  assert.ok(privacy.includes('Brevo'));
});

check('workflow runs hourly and keeps dry_run and test_email', () => {
  const yml = fs.readFileSync(path.join(root, '.github/workflows/devotional-email.yml'), 'utf8');
  assert.match(yml, /cron:\s*'0 \* \* \* \*'/);
  assert.ok(!/cron:\s*'0 8 \* \* \*'/.test(yml));
  assert.match(yml, /test_email:/);
  assert.match(yml, /TEST_EMAIL:/);
  assert.match(yml, /dry_run:/);
});

check('test send helpers validate the address and drop the unsubscribe link', () => {
  assert.strictEqual(mail.parseTestEmail({}).set, false);
  assert.strictEqual(mail.parseTestEmail({ TEST_EMAIL: 'not-an-email' }).ok, false);
  assert.deepStrictEqual(mail.parseTestEmail({ TEST_EMAIL: ' reader@example.com ' }), {
    set: true, ok: true, email: 'reader@example.com'
  });
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/devotionals.json'), 'utf8'));
  const entry = data.entries.find((item) => item.date === '11-13');
  const message = mail.buildMessage(entry, new Date('2026-11-13T15:00:00Z'), mail.unsubscribeUrl('reader@example.com'));
  const stripped = mail.forTestSend(message.html + '\n' + message.text);
  assert.ok(!stripped.includes('unsubscribe.html'));
  assert.ok(stripped.includes('This was a one-off test. The subscriber list was not emailed.'));
  assert.ok(stripped.includes(entry.text));
});

function mockRequest(handlers) {
  return async (key, method, url, body) => {
    const fn = handlers[method + ' ' + url] || handlers[method] || handlers['*'];
    if (!fn) throw new Error('unexpected ' + method + ' ' + url);
    return fn(key, method, url, body);
  };
}

async function asyncChecks() {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/devotionals.json'), 'utf8'));
  const entry = data.entries.find((item) => item.date === '11-13');
  const logs = [];
  const log = (line) => logs.push(String(line));

  logs.length = 0;
  let code = await mail.run({
    TEST_EMAIL: 'not-an-email',
    DEVOTIONAL_NOW: '2026-11-13T15:00:00Z',
    DRY_RUN: '0'
  }, { log });
  check('invalid TEST_EMAIL exits 1', () => {
    assert.strictEqual(code, 1);
    assert.match(logs.join('\n'), /not an email address/);
  });

  const calls = [];
  logs.length = 0;
  code = await mail.run({
    TEST_EMAIL: 'reader@example.com',
    DEVOTIONAL_NOW: '2026-11-13T15:00:00Z',
    DRY_RUN: '0',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '4',
    BREVO_SENDER_EMAIL: 'news@example.com'
  }, {
    log,
    request: async (key, method, url, body) => {
      calls.push({ method, url, body });
      if (method === 'POST' && url === '/smtp/email') {
        return { ok: true, status: 201, json: { messageId: '<ctb-test-id@smtp-relay.mailin.fr>' }, text: '' };
      }
      throw new Error('unexpected ' + method + ' ' + url);
    }
  });
  check('test email uses transactional send and does not touch the list', () => {
    assert.strictEqual(code, 0);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, '/smtp/email');
    assert.deepStrictEqual(calls[0].body.to, [{ email: 'reader@example.com' }]);
    assert.ok(calls[0].body.subject.startsWith('[Test] '));
    assert.ok(calls[0].body.htmlContent.includes(entry.text.split('\n')[0]));
    assert.ok(calls[0].body.textContent.includes(entry.text));
    assert.ok(!calls[0].body.htmlContent.includes('unsubscribe.html'));
    assert.ok(!JSON.stringify(calls[0].body).includes('listIds'));
    const out = logs.join('\n');
    assert.match(out, /only to reader@example.com/);
    assert.match(out, /messageId <ctb-test-id@smtp-relay.mailin.fr>/);
    assert.match(out, /The list was not emailed/);
    assert.ok(!out.includes('secret-key'), 'logs must not print the API key');
  });

  const sendCalls = [];
  const stored = [];
  logs.length = 0;
  code = await mail.run({
    DEVOTIONAL_NOW: '2026-11-13T09:10:00Z',
    DRY_RUN: '0',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '4',
    BREVO_SENDER_EMAIL: 'news@example.com'
  }, {
    log,
    request: mockRequest({
      '*': async (key, method, url, body) => {
        sendCalls.push({ method, url, body });
        if (method === 'POST' && url.startsWith('/contacts/attributes/')) return { ok: false, status: 400, json: { message: 'Attribute already exists' }, text: 'Attribute already exists' };
        if (method === 'GET' && url.startsWith('/contacts?')) return { ok: true, status: 200, json: { contacts: [
          { email: 'due@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York' } },
          { email: 'done@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/New_York', LAST_DEVO_DATE: '2026-11-13' } },
          { email: 'west@example.com', emailBlacklisted: false, attributes: { TIMEZONE: 'America/Los_Angeles' } },
          { email: 'left@example.com', emailBlacklisted: true, attributes: { TIMEZONE: 'America/New_York' } }
        ] }, text: '' };
        if (method === 'GET' && url.startsWith('/smtp/blockedContacts')) return { ok: true, status: 200, json: { contacts: [] }, text: '' };
        if (method === 'POST' && url === '/smtp/email') return { ok: true, status: 201, json: { messageIds: ['<id-1>'] }, text: '' };
        if (method === 'POST' && url === '/contacts/batch') { stored.push(body); return { ok: true, status: 204, json: null, text: '' }; }
        throw new Error('unexpected ' + method + ' ' + url);
      }
    })
  });
  check('hourly send emails only due recipients and records LAST_DEVO_DATE', () => {
    assert.strictEqual(code, 0);
    const posted = sendCalls.filter((c) => c.url === '/smtp/email');
    assert.strictEqual(posted.length, 1);
    assert.deepStrictEqual(posted[0].body.messageVersions.map((v) => v.to), [[{ email: 'due@example.com' }]]);
    assert.ok(posted[0].body.htmlContent.includes(entry.text.split('\n')[0]));
    assert.ok(posted[0].body.messageVersions[0].htmlContent.includes(mail.unsubscribeUrl('due@example.com')));
    assert.ok(!JSON.stringify(posted[0].body).includes('west@example.com'));
    assert.strictEqual(stored[0].contacts[0].attributes.LAST_DEVO_DATE, '2026-11-13');
    assert.match(logs.join('\n'), /Sent CTB devotional 2026-11-13 to 1 subscriber/);
    assert.ok(!logs.join('\n').includes('secret-key'));
  });

  const dryCalls = [];
  logs.length = 0;
  code = await mail.run({
    DEVOTIONAL_NOW: '2026-11-13T09:10:00Z',
    DRY_RUN: '1',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '4',
    BREVO_SENDER_EMAIL: 'news@example.com'
  }, {
    log,
    request: mockRequest({
      '*': async (key, method, url, body) => {
        dryCalls.push({ method, url, body });
        if (method === 'POST' && url.startsWith('/contacts/attributes/')) return { ok: true, status: 201, json: {}, text: '' };
        if (method === 'GET' && url.startsWith('/contacts?')) return { ok: true, status: 200, json: { contacts: [
          { email: 'due@example.com', attributes: { TIMEZONE: 'America/New_York' } },
          { email: 'west@example.com', attributes: { TIMEZONE: 'America/Los_Angeles' } }
        ] }, text: '' };
        if (method === 'GET' && url.startsWith('/smtp/blockedContacts')) return { ok: true, status: 200, json: { contacts: [] }, text: '' };
        throw new Error('dry run must not send ' + method + ' ' + url);
      }
    })
  });
  check('dry run lists timezone counts and does not send', () => {
    assert.strictEqual(code, 0);
    assert.strictEqual(dryCalls.filter((c) => c.url === '/smtp/email' || c.url === '/contacts/batch').length, 0);
    assert.match(logs.join('\n'), /America\/New_York/);
    assert.match(logs.join('\n'), /America\/Los_Angeles/);
    assert.match(logs.join('\n'), /1 due/);
    assert.ok(logs.join('\n').includes(entry.text));
    assert.ok(!logs.join('\n').includes('secret-key'));
  });

  const second = [];
  logs.length = 0;
  code = await mail.run({
    DEVOTIONAL_NOW: '2026-11-13T09:40:00Z',
    DRY_RUN: '0',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '4',
    BREVO_SENDER_EMAIL: 'news@example.com'
  }, {
    log,
    request: mockRequest({
      '*': async (key, method, url) => {
        second.push({ method, url });
        if (method === 'POST' && url.startsWith('/contacts/attributes/')) return { ok: true, status: 201, json: {}, text: '' };
        if (method === 'GET' && url.startsWith('/contacts?')) return { ok: true, status: 200, json: { contacts: [
          { email: 'due@example.com', attributes: { TIMEZONE: 'America/New_York', LAST_DEVO_DATE: '2026-11-13' } }
        ] }, text: '' };
        if (method === 'GET' && url.startsWith('/smtp/blockedContacts')) return { ok: true, status: 200, json: { contacts: [] }, text: '' };
        throw new Error('should not send again ' + method + ' ' + url);
      }
    })
  });
  check('reruns do not double-send after LAST_DEVO_DATE is saved', () => {
    assert.strictEqual(code, 0);
    assert.strictEqual(second.filter((c) => c.url === '/smtp/email').length, 0);
    assert.match(logs.join('\n'), /already received|already sent|Nothing was sent/i);
  });

  logs.length = 0;
  code = await mail.run({
    DEVOTIONAL_NOW: '2026-11-13T09:10:00Z',
    DRY_RUN: '1',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '4',
    BREVO_SENDER_EMAIL: 'news@example.com'
  }, {
    log,
    request: mockRequest({
      '*': async (key, method, url) => {
        if (method === 'POST' && url.startsWith('/contacts/attributes/')) {
          return { ok: false, status: 403, json: { message: 'api key is not authorized for resource "contacts"', code: 'permission_denied' }, text: '' };
        }
        if (method === 'GET' && url.startsWith('/contacts?')) return { ok: true, status: 200, json: { contacts: [
          { email: 'due@example.com', attributes: { TIMEZONE: 'America/New_York' } }
        ] }, text: '' };
        if (method === 'GET' && url.startsWith('/smtp/blockedContacts')) return { ok: true, status: 200, json: { contacts: [] }, text: '' };
        throw new Error('dry run must not send ' + method + ' ' + url);
      }
    })
  });
  check('dry run continues when attribute creation is forbidden', () => {
    assert.strictEqual(code, 0);
    assert.match(logs.join('\n'), /needs Contacts permission/);
    assert.match(logs.join('\n'), /1 due/);
    assert.ok(!logs.join('\n').includes('secret-key'));
  });

  logs.length = 0;
  code = await mail.run({
    DEVOTIONAL_NOW: '2026-11-13T09:10:00Z',
    DRY_RUN: '1',
    BREVO_API_KEY: 'secret-key',
    BREVO_LIST_ID: '4',
    BREVO_SENDER_EMAIL: 'news@example.com'
  }, {
    log,
    request: mockRequest({
      '*': async (key, method, url) => {
        if (method === 'POST' && url.startsWith('/contacts/attributes/')) {
          return { ok: false, status: 403, json: { code: 'permission_denied' }, text: '' };
        }
        if (method === 'GET' && url.startsWith('/contacts?')) {
          const err = new Error('Could not list contacts (403). permission_denied');
          err.result = { status: 403, ok: false, text: 'permission_denied' };
          throw err;
        }
        throw new Error('unexpected ' + method + ' ' + url);
      }
    })
  });
  check('dry run still prints a sample if the list cannot be loaded', () => {
    assert.strictEqual(code, 0);
    assert.match(logs.join('\n'), /Could not load the subscriber list/);
    assert.match(logs.join('\n'), /Nothing is sent/);
    assert.ok(logs.join('\n').includes(entry.text));
  });
}

asyncChecks().then(() => {
  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log('all passed');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
