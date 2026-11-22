/* Send today's Bible in a Year readings to the Brevo list at 4 AM
   Eastern Time (America/New_York). Free plan. No send while Brevo
   secrets are missing (exit 0).

   The job runs every hour. Each run emails confirmed subscribers only
   when it is the 4 AM hour in America/New_York and they have not already
   received that Eastern Time day's email. The four readings and their
   links match the Bible in a Year page. Sends go through Brevo
   transactional mail, one recipient per message version, so addresses
   are never shared on the To line. LAST_BIAY_DATE is saved after a
   successful send so a rerun never double-sends.

   Brevo's {{ unsubscribe }} tag is not available in transactional mail.
   Each email links to this site's unsubscribe page, and Brevo still
   adds its List-Unsubscribe header (the one-click control in Gmail,
   Yahoo, and Outlook). Contacts with emailBlacklisted, or on Brevo's
   transactional block list, are skipped. An empty list is not an error.

   Usage: node tools/send-bible-in-a-year-email.js
   Env: BREVO_API_KEY, BREVO_LIST_ID, BREVO_SENDER_EMAIL
        DRY_RUN=true prints counts and a sample message and does not send
        TEST_EMAIL=address sends today's readings only to that address
        through Brevo transactional mail. The list is not emailed, and
        LAST_BIAY_DATE is not updated.
        NOW=ISO-8601 is a test clock. The workflow does not set it. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_NAME = 'Clay Jar Treasure Bible';
const SITE_ORIGIN = 'https://clayjartranslation.github.io/treasure';
const SITE_BASE = SITE_ORIGIN + '/';
const CJT_BASE = 'https://clayjartranslation.github.io/';
const BIAY_PAGE = SITE_ORIGIN + '/bible-in-a-year.html';
const UNSUBSCRIBE_PAGE = SITE_ORIGIN + '/unsubscribe.html';
const SENDER_NAME = SITE_NAME;
const NOTICE = 'Readings from the Clay Jar Treasure Bible, © 2026 Jose Santiago. All rights reserved.';
const DEFAULT_TZ = 'America/New_York';
const SEND_HOUR = 4;
const FREE_DAILY_LIMIT = 300;
const WARN_AT = 250;
const MESSAGE_BATCH = 1000;
const CONTACT_PAGE = 500;
const ATTR_LAST = 'LAST_BIAY_DATE';
const DEFAULT_LIST_ID = '6';
const SITE_KIND = 'ctb';
const KINDS = [['ot', 'Old Testament'], ['ps', 'Psalms'], ['pr', 'Proverbs'], ['nt', 'New Testament']];
const MONTHS = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function publishedChapters(catalog) {
  const done = {};
  const books = catalog && Array.isArray(catalog.books) ? catalog.books : [];
  books.forEach((b) => {
    done[b.id] = {};
    (b.translated || []).forEach((c) => { done[b.id][c] = true; });
  });
  return done;
}

function loadPlan(planFile, catalogFile) {
  const plan = JSON.parse(fs.readFileSync(planFile || path.join(ROOT, 'data', 'bible-in-a-year.json'), 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(catalogFile || path.join(ROOT, 'data', 'books.json'), 'utf8'));
  const days = plan && Array.isArray(plan.days) ? plan.days : [];
  return { days, catalog, published: publishedChapters(catalog) };
}

function findDay(days, key) {
  const real = key === '02-29' ? '02-28' : key;
  return (days || []).find((d) => d && d.date === real) || null;
}

function readingUrl(p, published) {
  const pathHash = '#/read/' + encodeURIComponent(p.book) + '/' + p.ch + (p.v > 1 ? '/' + p.v : '');
  if (SITE_KIND === 'ctb' && !(published[p.book] && published[p.book][p.ch])) {
    return { url: CJT_BASE + pathHash, fallback: true, label: p.label };
  }
  return { url: SITE_BASE + pathHash, fallback: false, label: p.label };
}

function portionLinks(day, kind, published) {
  return (day[kind] || []).map((p) => readingUrl(p, published));
}

function tzParts(date, timeZone) {
  const tz = timeZone || DEFAULT_TZ;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const o = {};
  fmt.formatToParts(date).forEach((p) => { o[p.type] = p.value; });
  let hour = Number(o.hour);
  if (hour === 24) hour = 0;
  const isoDate = o.year + '-' + o.month + '-' + o.day;
  const key = o.month + '-' + o.day;
  return {
    timeZone: tz,
    year: Number(o.year),
    month: Number(o.month),
    day: Number(o.day),
    hour,
    minute: Number(o.minute),
    isoDate,
    key,
  };
}

function nyParts(date) {
  return tzParts(date, DEFAULT_TZ);
}

function inSendHour(parts) {
  return parts && parts.hour === SEND_HOUR;
}

function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  const wd = WEEKDAYS[dt.getUTCDay()];
  return wd + ', ' + MONTHS[Number(m[2])] + ' ' + Number(m[3]) + ', ' + m[1];
}

function dayNumber(days, day) {
  const i = (days || []).indexOf(day);
  return i >= 0 ? i + 1 : 0;
}

function pageUrl(key) {
  return BIAY_PAGE + '?d=' + encodeURIComponent(key);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function campaignName(isoDate) {
  return SITE_NAME + ' Bible in a Year ' + isoDate;
}

function unsubscribeUrl(email) {
  if (!email) return UNSUBSCRIBE_PAGE;
  return UNSUBSCRIBE_PAGE + '?email=' + encodeURIComponent(String(email).trim());
}

function buildEmail(day, isoDate, published, unsub, days) {
  const key = day.date;
  const url = pageUrl(key);
  const when = longDate(isoDate);
  const n = dayNumber(days, day);
  const unsubLink = unsub || unsubscribeUrl('');
  const subject = 'Bible in a Year · ' + when;
  const lines = [];
  const htmlParts = [];
  KINDS.forEach(([k, label]) => {
    const links = portionLinks(day, k, published);
    const textBits = links.map((l) => l.label + (l.fallback ? ' (Clay Jar Translation)' : '') + '\n' + l.url);
    lines.push(label + ':');
    textBits.forEach((b) => lines.push(b));
    lines.push('');
    const htmlBits = links.map((l) => {
      const note = l.fallback ? ' <span style="color:#6b4a37;font-size:14px;">(Clay Jar Translation)</span>' : '';
      return '<a href="' + esc(l.url) + '" style="color:#a6522d;">' + esc(l.label) + '</a>' + note;
    }).join('; ');
    htmlParts.push('<p style="margin:0 0 12px;"><strong>' + esc(label) + ':</strong> ' + htmlBits + '</p>');
  });
  const text = [
    SITE_NAME,
    'Bible in a Year',
    when + (n ? ' · Day ' + n + ' of 365' : ''),
    '',
    ...lines,
    'Open today’s readings on the site:',
    url,
    '',
    NOTICE,
    '',
    'Manage or unsubscribe: ' + unsubLink,
    '',
  ].join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f3e4c4;color:#3f2416;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f3e4c4;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background-color:#fffaf3;border:1px solid #e4d2ae;">
          <tr>
            <td style="background-color:#7a3b22;padding:14px 22px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#f7e7c8;">${esc(SITE_NAME)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 22px 8px;font-family:Georgia,'Iowan Old Style',Times,serif;font-size:18px;line-height:1.6;color:#3f2416;">
    <h1 style="margin:0 0 8px;font-size:28px;line-height:1.2;font-weight:600;">Bible in a Year</h1>
    <p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;color:#6b4a37;">${esc(when)}${n ? ' · Day ' + n + ' of 365' : ''}</p>
    ${htmlParts.join('\n    ')}
    <p style="margin:28px 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;"><a href="${esc(url)}" style="color:#a6522d;">Open today’s readings on the site</a></p>
    <p style="margin:20px 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#6b4a37;">${esc(NOTICE)}</p>
    <p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;"><a href="${esc(unsubLink)}" style="color:#a6522d;">Manage or unsubscribe</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
  const first = (day.ot && day.ot[0] && day.ot[0].label) || '';
  const preview = first ? first + ' and today’s other readings' : 'Today’s Bible in a Year readings';
  return {
    name: campaignName(isoDate),
    subject,
    previewText: preview.length > 140 ? preview.slice(0, 137) + '...' : preview,
    html,
    text,
    isoDate,
    key,
    url,
    unsubscribeUrl: unsubLink,
  };
}

function readSecrets(env) {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  const listRaw = String(env.BREVO_LIST_ID || DEFAULT_LIST_ID).trim();
  const sender = String(env.BREVO_SENDER_EMAIL || '').trim();
  const missing = [];
  if (!apiKey) missing.push('BREVO_API_KEY');
  if (!listRaw) missing.push('BREVO_LIST_ID');
  if (!sender) missing.push('BREVO_SENDER_EMAIL');
  if (missing.length) return { ok: false, missing };
  if (!/^[1-9]\d*$/.test(listRaw)) return { ok: false, invalid: 'BREVO_LIST_ID is set but is not a list number.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) return { ok: false, invalid: 'BREVO_SENDER_EMAIL is set but is not an email address.' };
  return { ok: true, apiKey, listId: Number(listRaw), sender };
}

function parseTestEmail(env) {
  const raw = String((env && env.TEST_EMAIL) || '').trim();
  if (!raw) return { set: false, ok: true, email: '' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { set: true, ok: false, email: raw };
  return { set: true, ok: true, email: raw };
}

function readTransactionalSecrets(env) {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  const sender = String(env.BREVO_SENDER_EMAIL || '').trim();
  const missing = [];
  if (!apiKey) missing.push('BREVO_API_KEY');
  if (!sender) missing.push('BREVO_SENDER_EMAIL');
  if (missing.length) return { ok: false, missing };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
    return { ok: false, invalid: 'BREVO_SENDER_EMAIL is set but is not an email address.' };
  }
  return { ok: true, apiKey, sender };
}

function forTestSend(content) {
  return String(content || '')
    .replace(/<p[^>]*>\s*<a href="[^"]*unsubscribe\.html[^"]*"[^>]*>Manage or unsubscribe<\/a>\s*<\/p>/g,
      '<p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:14px;line-height:1.5;color:#6b4a37;">This was a one-off test. The subscriber list was not emailed.</p>')
    .replace(/Manage or unsubscribe:\s*https?:\S+/g,
      'This was a one-off test. The subscriber list was not emailed.');
}

function clip(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > 400 ? t.slice(0, 400) : t;
}

async function brevo(apiKey, method, urlPath, body) {
  const headers = { 'api-key': apiKey, accept: 'application/json' };
  const opts = { method, headers, signal: AbortSignal.timeout(30000) };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('https://api.brevo.com/v3' + urlPath, opts);
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch (e) { json = null; }
  }
  return { status: res.status, ok: res.ok, json, text };
}

function attributeExistsStatus(res) {
  if (!res) return false;
  if (res.status === 400 || res.status === 409) return true;
  const t = String((res.json && (res.json.message || res.json.error)) || res.text || '').toLowerCase();
  return /already exist|duplicate|has already/.test(t);
}

function isPermissionDenied(res) {
  if (!res) return false;
  if (res.status === 401 || res.status === 403) return true;
  const t = String((res.json && (res.json.message || res.json.code || res.json.error)) || res.text || '').toLowerCase();
  return /permission_denied|not authorized|unauthorized/.test(t);
}

async function ensureAttributes(apiKey, request, log) {
  const call = request || brevo;
  const res = await call(apiKey, 'POST', '/contacts/attributes/normal/' + ATTR_LAST, { type: 'text' });
  if (res.ok || res.status === 201 || attributeExistsStatus(res)) return { ok: true, denied: false };
  if (isPermissionDenied(res)) {
    if (log) {
      log('Could not create the ' + ATTR_LAST + ' contact attribute (' + res.status + '). Continuing without it.');
    }
    return { ok: false, denied: true };
  }
  const err = new Error('Could not create the ' + ATTR_LAST + ' contact attribute (' + res.status + '). ' + clip(res.text));
  err.result = res;
  throw err;
}

function contactsFromPayload(json) {
  if (!json) return [];
  if (Array.isArray(json.contacts)) return json.contacts;
  if (Array.isArray(json)) return json;
  return [];
}

async function listContacts(apiKey, listId, request) {
  const call = request || brevo;
  const all = [];
  let offset = 0;
  let limit = CONTACT_PAGE;
  for (let page = 0; page < 100; page++) {
    const res = await call(apiKey, 'GET', '/contacts?limit=' + limit + '&offset=' + offset + '&listIds=' + listId);
    if (!res.ok && limit > 50 && (res.status === 400 || res.status === 422)) {
      limit = 50;
      const retry = await call(apiKey, 'GET', '/contacts?limit=' + limit + '&offset=' + offset + '&listIds=' + listId);
      if (!retry.ok) {
        const err = new Error('Could not list contacts (' + retry.status + '). ' + clip(retry.text));
        err.result = retry;
        throw err;
      }
      const batch = contactsFromPayload(retry.json);
      all.push.apply(all, batch);
      if (batch.length < limit) break;
      offset += limit;
      continue;
    }
    if (!res.ok) {
      const err = new Error('Could not list contacts (' + res.status + '). ' + clip(res.text));
      err.result = res;
      throw err;
    }
    const batch = contactsFromPayload(res.json);
    all.push.apply(all, batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
}

function blockedEmailsFromPayload(json) {
  const rows = (json && (json.contacts || json.blockedContacts || json)) || [];
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (typeof row === 'string') return row;
    return row && (row.email || row.emailAddress);
  }).filter(Boolean);
}

async function listBlockedTransactional(apiKey, request) {
  const call = request || brevo;
  const set = new Set();
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 50; page++) {
    const res = await call(apiKey, 'GET', '/smtp/blockedContacts?limit=' + limit + '&offset=' + offset);
    if (!res.ok) return set;
    const batch = blockedEmailsFromPayload(res.json);
    batch.forEach((email) => set.add(String(email).trim().toLowerCase()));
    if (batch.length < limit) break;
    offset += limit;
  }
  return set;
}

function contactEmail(contact) {
  return contact && contact.email ? String(contact.email).trim() : '';
}

function contactAttributes(contact) {
  return (contact && contact.attributes) || {};
}

function lastSentDate(contact) {
  const v = contactAttributes(contact)[ATTR_LAST];
  return v ? String(v).trim() : '';
}

function alreadyReceived(contact, isoDate) {
  return lastSentDate(contact) === isoDate;
}

function isExcluded(contact, blockedSet) {
  if (!contact) return true;
  if (contact.emailBlacklisted === true) return true;
  const email = contactEmail(contact);
  if (!email) return true;
  if (blockedSet && blockedSet.has(email.toLowerCase())) return true;
  return false;
}

function dueRecipients(contacts, isoDate, blockedSet) {
  const due = [];
  let skippedAlready = 0;
  let skippedExcluded = 0;
  (contacts || []).forEach((c) => {
    if (isExcluded(c, blockedSet)) { skippedExcluded += 1; return; }
    if (alreadyReceived(c, isoDate)) { skippedAlready += 1; return; }
    due.push(c);
  });
  return { due, skippedAlready, skippedExcluded, total: (contacts || []).length };
}

function applyDailyLimit(due, alreadySent) {
  const room = Math.max(0, FREE_DAILY_LIMIT - alreadySent);
  if (due.length <= room) return { due, truncated: 0 };
  return { due: due.slice(0, room), truncated: due.length - room };
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function updateLastDates(apiKey, contacts, isoDate, request) {
  const call = request || brevo;
  const rows = (contacts || []).map((c) => contactEmail(c)).filter(Boolean);
  if (!rows.length) return 0;
  const batches = chunk(rows, 100);
  let updated = 0;
  for (const batch of batches) {
    const res = await call(apiKey, 'POST', '/contacts/batch', {
      contacts: batch.map((email) => ({
        email,
        attributes: { [ATTR_LAST]: isoDate },
      })),
    });
    if (res.ok || res.status === 201 || res.status === 204) {
      updated += batch.length;
      continue;
    }
    for (const email of batch) {
      const one = await call(apiKey, 'PUT', '/contacts/' + encodeURIComponent(email), {
        attributes: { [ATTR_LAST]: isoDate },
      });
      if (!one.ok && one.status !== 204) {
        const err = new Error('Could not save ' + ATTR_LAST + ' for a contact (' + one.status + '). ' + clip(one.text));
        err.result = one;
        throw err;
      }
      updated += 1;
    }
  }
  return updated;
}

function buildEmailFromExisting(email, unsubLink) {
  return {
    html: String(email.html).split(email.unsubscribeUrl).join(unsubLink),
    text: String(email.text).split(email.unsubscribeUrl).join(unsubLink),
  };
}

async function sendTransactionalBatch(apiKey, sender, email, recipients, request) {
  const call = request || brevo;
  const batches = chunk(recipients, MESSAGE_BATCH);
  let sent = 0;
  const messageIds = [];
  for (const batch of batches) {
    const versions = batch.map((contact) => {
      const address = contactEmail(contact);
      const personalized = buildEmailFromExisting(email, unsubscribeUrl(address));
      return {
        to: [{ email: address }],
        htmlContent: personalized.html,
        textContent: personalized.text,
      };
    });
    const payload = {
      sender: { name: SENDER_NAME, email: sender },
      replyTo: { email: sender },
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
      messageVersions: versions,
    };
    const res = await call(apiKey, 'POST', '/smtp/email', payload);
    if (!res.ok) {
      const err = new Error('Brevo did not send the Bible in a Year email (' + res.status + '). ' + clip(res.text));
      err.result = res;
      throw err;
    }
    sent += batch.length;
    const ids = res.json && (res.json.messageIds || (res.json.messageId ? [res.json.messageId] : []));
    if (ids && ids.length) messageIds.push.apply(messageIds, ids);
  }
  return { sent, messageIds };
}

function clock(env, deps) {
  if (deps && deps.now) return deps.now;
  if (env.NOW) {
    const d = new Date(env.NOW);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function describeList(stats, isoDate, sendHour) {
  const lines = [
    'List ' + (stats.listId || '') + ' for ' + isoDate + (sendHour ? ' (4 AM Eastern Time hour)' : ' (not the 4 AM Eastern Time hour)'),
    '- ' + stats.total + ' contact' + (stats.total === 1 ? '' : 's'),
    '- ' + stats.due.length + ' due',
  ];
  if (stats.skippedAlready) lines.push('- ' + stats.skippedAlready + ' already sent');
  if (stats.skippedExcluded) lines.push('- ' + stats.skippedExcluded + ' unsubscribed or blocked');
  if (stats.truncated) lines.push('- ' + stats.truncated + ' held for the daily limit');
  if (!stats.total) lines.push('No contacts were returned for this list.');
  return lines.join('\n');
}

function logSample(log, email) {
  log('Campaign: ' + email.name);
  log('Subject: ' + email.subject);
  log('--- plain text ---');
  log(email.text);
  log('--- html ---');
  log(email.html);
}

async function run(env, deps) {
  const log = (deps && deps.log) || console.log;
  const now = clock(env, deps);
  const ny = nyParts(now);
  const dry = String(env.DRY_RUN || '').toLowerCase() === 'true';
  const testTo = parseTestEmail(env);
  const testing = testTo.set;
  const stamp = ny.isoDate + ' ' + String(ny.hour).padStart(2, '0') + ':' + String(ny.minute).padStart(2, '0') + ' ' + DEFAULT_TZ;
  const loaded = (deps && deps.load) ? deps.load() : loadPlan();
  const day = findDay(loaded.days, ny.key);
  const email = day ? buildEmail(day, ny.isoDate, loaded.published, unsubscribeUrl(''), loaded.days) : null;

  if (testing && !testTo.ok) {
    log('TEST_EMAIL is set but is not an email address.');
    return 1;
  }

  const secrets = testing ? readTransactionalSecrets(env) : readSecrets(env);

  if (testing) {
    if (dry) {
      if (!email) {
        log('Dry run. No Bible in a Year reading is on the plan for ' + ny.key + ' (' + ny.isoDate + '). Nothing to send.');
        return 0;
      }
      log('Dry run for ' + stamp + '. The message below is not sent.');
      log('If sent, this would go only to ' + testTo.email + '. The list would not be emailed.');
      logSample(log, email);
      if (!secrets.ok && secrets.missing) log('Brevo secrets are not all set (' + secrets.missing.join(', ') + '). A real run would skip.');
      return 0;
    }
    if (!secrets.ok) {
      if (secrets.invalid) { log(secrets.invalid); return 1; }
      log('Brevo is not configured. Missing ' + secrets.missing.join(', ') + '. Skipping without sending.');
      return 0;
    }
    if (!email) {
      log('No Bible in a Year reading is on the plan for ' + ny.key + ' (' + ny.isoDate + '). Skipping without sending.');
      return 0;
    }
    const request = (deps && deps.request) || brevo;
    const payload = {
      sender: { name: SENDER_NAME, email: secrets.sender },
      replyTo: { email: secrets.sender },
      to: [{ email: testTo.email }],
      subject: '[Preview] ' + email.subject,
      htmlContent: forTestSend(email.html),
      textContent: forTestSend(email.text),
    };
    const sent = await request(secrets.apiKey, 'POST', '/smtp/email', payload);
    if (!sent.ok) {
      const err = new Error('Brevo did not send the test email (' + sent.status + '). ' + clip(sent.text));
      err.result = sent;
      throw err;
    }
    const messageId = sent.json && sent.json.messageId;
    log('Sent a test of ' + email.name + ' only to ' + testTo.email + (messageId ? ' (messageId ' + messageId + ')' : '') + '. The list was not emailed.');
    return 0;
  }

  if (dry && (!secrets.ok && !secrets.invalid)) {
    log('Dry run for ' + stamp + '. Contacts were not loaded because Brevo secrets are not all set (' + (secrets.missing || []).join(', ') + '). Nothing is sent.');
    if (!email) {
      log('No Bible in a Year reading is on the plan for ' + ny.key + ' (' + ny.isoDate + ').');
      return 0;
    }
    logSample(log, email);
    return 0;
  }

  if (!secrets.ok) {
    if (secrets.invalid) { log(secrets.invalid); return 1; }
    log('Brevo is not configured. Missing ' + secrets.missing.join(', ') + '. Skipping without sending.');
    return 0;
  }

  const request = (deps && deps.request) || brevo;
  const attr = await ensureAttributes(secrets.apiKey, request, log);
  let contacts = [];
  let blocked = new Set();
  try {
    contacts = deps && deps.listContacts
      ? await deps.listContacts(secrets.apiKey, secrets.listId)
      : await listContacts(secrets.apiKey, secrets.listId, request);
    blocked = deps && deps.listBlocked
      ? await deps.listBlocked(secrets.apiKey)
      : await listBlockedTransactional(secrets.apiKey, request);
  } catch (err) {
    const message = (err && err.message) ? err.message : String(err);
    log('Could not load the subscriber list. ' + message);
    if (!dry) throw err;
    log('Dry run for ' + stamp + '. Contacts were not loaded. Nothing is sent.');
    if (email) logSample(log, email);
    return 0;
  }

  const sendHour = inSendHour(ny);
  const stats = dueRecipients(contacts, ny.isoDate, blocked);
  stats.listId = secrets.listId;
  if (stats.due.length + stats.skippedAlready >= WARN_AT) {
    log('Warning: ' + (stats.due.length + stats.skippedAlready) + ' emails are at or near the free plan’s ' + FREE_DAILY_LIMIT + ' per day limit.');
  }
  const limited = applyDailyLimit(stats.due, stats.skippedAlready);
  stats.due = limited.due;
  stats.truncated = limited.truncated;
  log(describeList(stats, ny.isoDate, sendHour));

  if (dry) {
    log('Dry run for ' + stamp + '. The counts above were loaded from the list. Nothing is sent, and ' + ATTR_LAST + ' is not updated.');
    if (!email) {
      log('No Bible in a Year reading is on the plan for ' + ny.key + ' (' + ny.isoDate + ').');
      return 0;
    }
    logSample(log, email);
    return 0;
  }

  if (!sendHour) {
    log('It is not the 4 AM Eastern Time hour. Nothing was sent.');
    return 0;
  }
  if (!email) {
    log('No Bible in a Year reading is on the plan for ' + ny.key + ' (' + ny.isoDate + '). Skipping without sending.');
    return 0;
  }
  if (!stats.due.length) {
    log('No subscribers are due this run. Nothing was sent.');
    return 0;
  }

  const result = await sendTransactionalBatch(secrets.apiKey, secrets.sender, email, stats.due, request);
  if (attr && attr.denied) {
    log('Sent ' + email.name + ' to ' + result.sent + ' subscriber' + (result.sent === 1 ? '' : 's') + ' (list ' + secrets.listId + '). ' + ATTR_LAST + ' was not saved because the API key cannot create attributes.');
  } else {
    await updateLastDates(secrets.apiKey, stats.due, ny.isoDate, request);
    log('Sent ' + email.name + ' to ' + result.sent + ' subscriber' + (result.sent === 1 ? '' : 's') + ' (list ' + secrets.listId + ').');
  }
  return 0;
}

async function main() {
  try {
    return await run(process.env, {});
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    return 1;
  }
}

module.exports = {
  SITE_NAME,
  SITE_KIND,
  SITE_BASE,
  CJT_BASE,
  BIAY_PAGE,
  UNSUBSCRIBE_PAGE,
  NOTICE,
  DEFAULT_TZ,
  SEND_HOUR,
  DEFAULT_LIST_ID,
  ATTR_LAST,
  publishedChapters,
  loadPlan,
  findDay,
  readingUrl,
  portionLinks,
  tzParts,
  nyParts,
  inSendHour,
  longDate,
  pageUrl,
  campaignName,
  unsubscribeUrl,
  buildEmail,
  readSecrets,
  parseTestEmail,
  alreadyReceived,
  isExcluded,
  dueRecipients,
  applyDailyLimit,
  forTestSend,
  run,
};

if (require.main === module) {
  main().then((code) => process.exit(code));
}
