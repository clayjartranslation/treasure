#!/usr/bin/env node
/* Send today's Clay Jar Treasure Bible devotional to the Brevo list at 4 AM in each
   subscriber's own time zone. Free plan. No send while Brevo secrets are
   missing (exit 0).

   The job runs every hour. Each run emails only confirmed subscribers
   whose local time is in the 4 AM hour and who have not already received
   today's (their local date) devotional. Sends go through Brevo
   transactional mail, one recipient per message version, so addresses
   are never shared on the To line. LAST_DEVO_DATE is saved after a
   successful send so a rerun never double-sends.

   Brevo's {{ unsubscribe }} tag is not available in transactional mail.
   Each email links to this site's unsubscribe page, and Brevo still
   adds its List-Unsubscribe header (the one-click control in Gmail,
   Yahoo, and Outlook). Contacts with emailBlacklisted, or on Brevo's
   transactional block list, are skipped.

   Usage: node tools/send-devotional-email.js
   Env: BREVO_API_KEY, BREVO_LIST_ID, BREVO_SENDER_EMAIL
        DRY_RUN=true prints counts and a sample message and does not send
        EVENT_NAME=workflow_dispatch allows a manual run (still only the
        4 AM hour, unless TEST_EMAIL is set)
        TEST_EMAIL=address sends today's devotional only to that address
        through Brevo transactional mail. The list is not emailed, and
        LAST_DEVO_DATE is not updated.
        DEVOTIONAL_NOW or NOW=ISO-8601 is a test clock. The workflow does not set it. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COPYRIGHT = 'Devotionals © 2026 Jose Santiago. All rights reserved.';
const NOTICE = COPYRIGHT;
const SITE = 'https://clayjartranslation.github.io/treasure/devotional.html';
const UNSUBSCRIBE_PAGE = 'https://clayjartranslation.github.io/treasure/unsubscribe.html';
const SENDER_NAME = 'Clay Jar Treasure Bible';
const DEFAULT_TZ = 'America/New_York';
const SEND_HOUR = 4;
const FREE_DAILY_LIMIT = 300;
const WARN_AT = 250;
const MESSAGE_BATCH = 1000;
const CONTACT_PAGE = 500;
const ATTR_TIMEZONE = 'TIMEZONE';
const ATTR_LAST_DEVO = 'LAST_DEVO_DATE';
const MONTHS = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function isValidIanaTimeZone(tz) {
  const name = String(tz || '').trim();
  if (!name || name.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name }).format(new Date());
    return true;
  } catch (e) {
    return false;
  }
}

function resolveTimeZone(raw) {
  const name = String(raw == null ? '' : raw).trim();
  return isValidIanaTimeZone(name) ? name : DEFAULT_TZ;
}

function tzParts(date, timeZone) {
  const tz = resolveTimeZone(timeZone);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const map = {};
  fmt.formatToParts(date).forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const month = map.month;
  const day = map.day;
  return {
    timeZone: tz,
    hour,
    minute: Number(map.minute),
    year: map.year,
    month,
    day,
    isoDate: map.year + '-' + month + '-' + day,
    key: month + '-' + day,
  };
}

function nyParts(date) {
  return tzParts(date, DEFAULT_TZ);
}

function inSendHour(parts) {
  return parts.hour === SEND_HOUR;
}

function contactAttributes(contact) {
  return (contact && contact.attributes) || {};
}

function contactEmail(contact) {
  return String((contact && (contact.email || contact.emailAddress)) || '').trim();
}

function contactTimeZone(contact) {
  const attrs = contactAttributes(contact);
  return resolveTimeZone(
    attrs[ATTR_TIMEZONE] ||
    attrs.CONTACT_TIMEZONE ||
    attrs['CONTACT TIMEZONE'] ||
    attrs.LAST_DETECTED_TIMEZONE
  );
}

function lastDevoDate(contact) {
  return String(contactAttributes(contact)[ATTR_LAST_DEVO] || '').trim();
}

function alreadyReceived(contact, isoDate) {
  return lastDevoDate(contact) === String(isoDate || '');
}

function isExcluded(contact, blockedSet) {
  if (!contact) return true;
  if (contact.emailBlacklisted === true) return true;
  const email = contactEmail(contact).toLowerCase();
  if (!email) return true;
  if (blockedSet && blockedSet.has(email)) return true;
  return false;
}

function groupByTimeZone(contacts, now, blockedSet) {
  const groups = new Map();
  function group(tz) {
    if (!groups.has(tz)) {
      const parts = tzParts(now, tz);
      groups.set(tz, {
        timeZone: tz,
        localDate: parts.isoDate,
        key: parts.key,
        hour: parts.hour,
        minute: parts.minute,
        due: inSendHour(parts),
        recipients: [],
        skippedAlready: 0,
        skippedExcluded: 0,
        skippedWrongHour: 0,
        total: 0,
      });
    }
    return groups.get(tz);
  }
  (contacts || []).forEach((contact) => {
    const tz = contactTimeZone(contact);
    const g = group(tz);
    g.total += 1;
    if (isExcluded(contact, blockedSet)) {
      g.skippedExcluded += 1;
      return;
    }
    if (alreadyReceived(contact, g.localDate)) {
      g.skippedAlready += 1;
      return;
    }
    if (!g.due) {
      g.skippedWrongHour += 1;
      return;
    }
    g.recipients.push(contact);
  });
  return Array.from(groups.values()).sort((a, b) => a.timeZone.localeCompare(b.timeZone));
}

function dueGroups(groups) {
  return (groups || []).filter((g) => g.due && g.recipients.length);
}

function alreadySentTodayCount(groups) {
  return (groups || []).reduce((n, g) => n + g.skippedAlready, 0);
}

function dueCount(groups) {
  return (groups || []).reduce((n, g) => n + (g.due ? g.recipients.length : 0), 0);
}

function applyDailyLimit(groups, alreadySent) {
  let remaining = FREE_DAILY_LIMIT - alreadySent;
  let truncated = 0;
  const limited = (groups || []).map((g) => {
    if (!g.due) return g;
    if (remaining <= 0) {
      truncated += g.recipients.length;
      return Object.assign({}, g, { recipients: [], truncated: g.recipients.length });
    }
    if (g.recipients.length <= remaining) {
      remaining -= g.recipients.length;
      return g;
    }
    const kept = g.recipients.slice(0, remaining);
    truncated += g.recipients.length - kept.length;
    remaining = 0;
    return Object.assign({}, g, { recipients: kept, truncated: g.recipients.length - kept.length });
  });
  return { groups: limited, truncated, remaining: Math.max(0, remaining) };
}

function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return String(iso || '');
  return MONTHS[Number(m[2])] + ' ' + Number(m[3]) + ', ' + m[1];
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function campaignName(isoDate) {
  return 'CTB devotional ' + isoDate;
}

function unsubscribeUrl(email) {
  if (!email) return UNSUBSCRIBE_PAGE;
  return UNSUBSCRIBE_PAGE + '?email=' + encodeURIComponent(String(email).trim());
}

function loadDevotionals(file) {
  const data = JSON.parse(fs.readFileSync(file || path.join(ROOT, 'data', 'devotionals.json'), 'utf8'));
  const list = data && Array.isArray(data.entries) ? data.entries : [];
  return list;
}

function usable(entry) {
  return !!(entry && /^\d{2}-\d{2}$/.test(entry.date) &&
    entry.title && entry.reference && entry.text && entry.reflection && entry.prayer);
}

function findEntry(entries, key) {
  return (entries || []).find((entry) => usable(entry) && entry.date === key) || null;
}

function chooseEntry(entries, key) {
  return findEntry(entries, key);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function pageUrl(key) {
  return SITE + '?d=' + encodeURIComponent(key);
}

function buildEmail(entry, isoDate, unsub) {
  const key = entry.date;
  const url = pageUrl(key);
  const when = longDate(isoDate);
  const title = String(entry.title || '').trim();
  const ref = String(entry.reference || '').trim();
  const verse = String(entry.text || '');
  const reflection = String(entry.reflection || '');
  const prayer = String(entry.prayer || '');
  const subject = 'Daily devotional: ' + title;
  const unsubLink = unsub || unsubscribeUrl('');
  const verseHtml = escapeHtml(verse).replace(/\n/g, '<br>\n');
  const reflectionHtml = reflection.split(/\n\n+/).map((para) =>
    `<p style="font-size:18px;line-height:1.6;margin:0 0 14px;">${escapeHtml(para)}</p>`).join('\n');
  const text = [
    title,
    when,
    '',
    ref,
    'Clay Jar Treasure Bible',
    '',
    verse,
    '',
    'Reflection',
    reflection,
    '',
    'Prayer',
    prayer,
    '',
    'Read this devotional:',
    url,
    '',
    COPYRIGHT,
    '',
    'Unsubscribe: ' + unsubLink,
    ''
  ].join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#fff9eb;color:#3f2416;font-family:Georgia,'Iowan Old Style',serif;">
  <div style="max-width:36rem;margin:0 auto;padding:24px 20px;">
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a6522d;margin:0 0 8px;">Clay Jar Treasure Bible</p>
    <h1 style="font-size:28px;line-height:1.25;margin:0 0 8px;">${escapeHtml(title)}</h1>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#6b4a37;margin:0 0 20px;">${escapeHtml(when)}</p>
    <blockquote style="margin:0 0 8px;padding:0 0 0 14px;border-left:3px solid #a6522d;font-size:20px;line-height:1.6;">${verseHtml}</blockquote>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#6b4a37;margin:0 0 20px;">${escapeHtml(ref)}, Clay Jar Treasure Bible</p>
    <h2 style="font-size:20px;margin:0 0 8px;">Reflection</h2>
    ${reflectionHtml}
    <h2 style="font-size:20px;margin:10px 0 8px;">Prayer</h2>
    <p style="font-size:18px;line-height:1.6;margin:0 0 24px;">${escapeHtml(prayer)}</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0 0 24px;"><a href="${escapeHtml(url)}" style="color:#a6522d;">Read this devotional</a></p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#6b4a37;margin:0 0 12px;">${escapeHtml(COPYRIGHT)}</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;margin:0;"><a href="${escapeHtml(unsubLink)}" style="color:#a6522d;">Unsubscribe</a></p>
  </div>
</body>
</html>`;
  const preview = String(verse).split('\n')[0].slice(0, 140);
  return {
    name: campaignName(isoDate),
    subject,
    previewText: preview,
    preview,
    html,
    text,
    isoDate,
    key,
    url,
    link: url,
    when,
    unsubscribeUrl: unsubLink,
  };
}

function buildMessage(entry, date, unsub) {
  const when = (date instanceof Date) ? tzParts(date, DEFAULT_TZ).isoDate : String(date || '');
  return buildEmail(entry, when, unsub);
}

function readSecrets(env) {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  const listRaw = String(env.BREVO_LIST_ID || '').trim();
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
    .replace(/<p[^>]*>\s*<a href="[^"]*unsubscribe\.html[^"]*"[^>]*>Unsubscribe<\/a>\s*<\/p>/g,
      '<p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:14px;line-height:1.5;color:#6b4a37;">This was a one-off test. The subscriber list was not emailed.</p>')
    .replace(/Unsubscribe:\s*https?:\S+/g,
      'This was a one-off test. The subscriber list was not emailed.')
    .replace(/Unsubscribe:\s*\{\{ unsubscribe \}\}/g,
      'This was a one-off test. The subscriber list was not emailed.')
    .replace(/\{\{ unsubscribe \}\}/g, '')
    .replace(/\{\{params\.unsubscribeUrl\}\}/g, '');
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
  const names = [ATTR_TIMEZONE, ATTR_LAST_DEVO];
  for (const name of names) {
    const res = await call(apiKey, 'POST', '/contacts/attributes/normal/' + name, { type: 'text' });
    if (res.ok || res.status === 201 || attributeExistsStatus(res)) continue;
    if (isPermissionDenied(res)) {
      if (log) {
        log('Could not create the ' + name + ' contact attribute (' + res.status + '). The Brevo API key needs Contacts permission to create attributes, list subscribers, and save LAST_DEVO_DATE. Continuing; missing time zones default to America/New_York.');
      }
      return { ok: false, denied: true, names };
    }
    const err = new Error('Could not create the ' + name + ' contact attribute (' + res.status + '). ' + clip(res.text));
    err.result = res;
    throw err;
  }
  return { ok: true, denied: false, names };
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
    if (!res.ok) {
      // The block list is helpful but not required. emailBlacklisted still applies.
      return set;
    }
    const batch = blockedEmailsFromPayload(res.json);
    batch.forEach((email) => set.add(String(email).trim().toLowerCase()));
    if (batch.length < limit) break;
    offset += limit;
  }
  return set;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function updateLastDevoDates(apiKey, contacts, isoDate, request) {
  const call = request || brevo;
  const rows = (contacts || []).map((c) => contactEmail(c)).filter(Boolean);
  if (!rows.length) return 0;
  const batches = chunk(rows, 100);
  let updated = 0;
  for (const batch of batches) {
    const res = await call(apiKey, 'POST', '/contacts/batch', {
      contacts: batch.map((email) => ({
        email,
        attributes: { [ATTR_LAST_DEVO]: isoDate },
      })),
    });
    if (res.ok || res.status === 201 || res.status === 204) {
      updated += batch.length;
      continue;
    }
    for (const email of batch) {
      const one = await call(apiKey, 'PUT', '/contacts/' + encodeURIComponent(email), {
        attributes: { [ATTR_LAST_DEVO]: isoDate },
      });
      if (!one.ok && one.status !== 204) {
        const err = new Error('Could not save LAST_DEVO_DATE for a contact (' + one.status + '). ' + clip(one.text));
        err.result = one;
        throw err;
      }
      updated += 1;
    }
  }
  return updated;
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
      const err = new Error('Brevo did not send the devotional (' + res.status + '). ' + clip(res.text));
      err.result = res;
      throw err;
    }
    sent += batch.length;
    const ids = res.json && (res.json.messageIds || (res.json.messageId ? [res.json.messageId] : []));
    if (ids && ids.length) messageIds.push.apply(messageIds, ids);
  }
  return { sent, messageIds };
}

function buildEmailFromExisting(email, unsubLink) {
  return {
    html: String(email.html).split(email.unsubscribeUrl).join(unsubLink),
    text: String(email.text).split(email.unsubscribeUrl).join(unsubLink),
  };
}

function isDryRun(env) {
  const value = String((env || process.env).DRY_RUN || '').toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function clock(env, deps) {
  if (deps && deps.now) return deps.now;
  const raw = env.DEVOTIONAL_NOW || env.NOW;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function describeGroups(groups) {
  if (!groups.length) return 'No contacts were returned for this list.';
  const lines = ['Contacts by time zone:'];
  groups.forEach((g) => {
    const clock = String(g.hour).padStart(2, '0') + ':' + String(g.minute).padStart(2, '0');
    lines.push(
      '- ' + g.timeZone + ': ' + g.total + ' contact' + (g.total === 1 ? '' : 's') +
      ', local ' + g.localDate + ' ' + clock +
      ', ' + g.recipients.length + ' due' +
      (g.skippedAlready ? ', ' + g.skippedAlready + ' already sent' : '') +
      (g.skippedExcluded ? ', ' + g.skippedExcluded + ' unsubscribed or blocked' : '') +
      (g.skippedWrongHour ? ', ' + g.skippedWrongHour + ' not in the 4 AM hour' : '') +
      (g.truncated ? ', ' + g.truncated + ' held for the daily limit' : '')
    );
  });
  return lines.join('\n');
}

async function run(env, deps) {
  const log = (deps && deps.log) || console.log;
  const now = clock(env, deps);
  const ny = nyParts(now);
  const dryValue = String(env.DRY_RUN || '').toLowerCase();
  const dry = dryValue === '1' || dryValue === 'true' || dryValue === 'yes';
  const testTo = parseTestEmail(env);
  const testing = testTo.set;
  const stamp = ny.isoDate + ' ' + String(ny.hour).padStart(2, '0') + ':' + String(ny.minute).padStart(2, '0') + ' ' + DEFAULT_TZ;

  if (testing && !testTo.ok) {
    log('TEST_EMAIL is set but is not an email address.');
    return 1;
  }

  const secrets = testing ? readTransactionalSecrets(env) : readSecrets(env);
  const entries = (deps && deps.load ? deps.load() : (deps && deps.loadEntries ? deps.loadEntries() : loadDevotionals()));

  if (testing) {
    const entry = findEntry(entries, ny.key);
    const email = entry ? buildEmail(entry, ny.isoDate, unsubscribeUrl('')) : null;
    if (dry) {
      if (!email) {
        log('Dry run. No devotional is written for ' + ny.key + ' (' + ny.isoDate + '). Nothing to send.');
        return 0;
      }
      log('Dry run for ' + stamp + '. The message below is not sent.');
      log('If sent, this would go only to ' + testTo.email + '. The list would not be emailed.');
      log('Campaign: ' + email.name);
      log('Subject: ' + email.subject);
      log('--- plain text ---');
      log(email.text);
      log('--- html ---');
      log(email.html);
      if (!secrets.ok && secrets.missing) log('Brevo secrets are not all set (' + secrets.missing.join(', ') + '). A real run would skip.');
      return 0;
    }
    if (!secrets.ok) {
      if (secrets.invalid) {
        log(secrets.invalid);
        return 1;
      }
      log('Brevo is not configured. Missing ' + secrets.missing.join(', ') + '. Skipping without sending.');
      return 0;
    }
    if (!email) {
      log('No devotional is written for ' + ny.key + ' (' + ny.isoDate + '). Skipping without sending.');
      return 0;
    }
    const request = (deps && deps.request) || brevo;
    const payload = {
      sender: { name: SENDER_NAME, email: secrets.sender },
      replyTo: { email: secrets.sender },
      to: [{ email: testTo.email }],
      subject: '[Test] ' + email.subject,
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

  const sampleEntry = findEntry(entries, ny.key);
  const sampleEmail = sampleEntry ? buildEmail(sampleEntry, ny.isoDate, unsubscribeUrl('')) : null;

  if (dry && (!secrets.ok && !secrets.invalid)) {
    log('Dry run for ' + stamp + '. Contacts were not loaded because Brevo secrets are not all set (' + (secrets.missing || []).join(', ') + '). Nothing is sent.');
    if (!sampleEmail) {
      log('No devotional is written for ' + ny.key + ' (' + ny.isoDate + ').');
      return 0;
    }
    log('Sample for ' + DEFAULT_TZ + ' on ' + ny.isoDate + ':');
    log('Campaign: ' + sampleEmail.name);
    log('Subject: ' + sampleEmail.subject);
    log('--- plain text ---');
    log(sampleEmail.text);
    log('--- html ---');
    log(sampleEmail.html);
    return 0;
  }

  if (!secrets.ok) {
    if (secrets.invalid) {
      log(secrets.invalid);
      return 1;
    }
    log('Brevo is not configured. Missing ' + secrets.missing.join(', ') + '. Skipping without sending.');
    return 0;
  }

  const request = (deps && deps.request) || brevo;
  await ensureAttributes(secrets.apiKey, request, log);
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
    log('The Brevo API key needs Contacts permission to list subscribers, store TIMEZONE, and record LAST_DEVO_DATE. Until that is granted, missing time zones default to America/New_York and hourly sends cannot go out.');
    if (!dry) throw err;
    if (!sampleEmail) {
      log('No devotional is written for ' + ny.key + ' (' + ny.isoDate + ').');
      return 0;
    }
    log('Dry run for ' + stamp + '. Contacts were not loaded. Nothing is sent.');
    log('Sample for ' + DEFAULT_TZ + ' on ' + ny.isoDate + ':');
    log('Campaign: ' + sampleEmail.name);
    log('Subject: ' + sampleEmail.subject);
    log('--- plain text ---');
    log(sampleEmail.text);
    log('--- html ---');
    log(sampleEmail.html);
    return 0;
  }
  let groups = groupByTimeZone(contacts, now, blocked);
  const alreadySent = alreadySentTodayCount(groups);
  const dueBeforeLimit = dueCount(groups);
  if (alreadySent + dueBeforeLimit >= WARN_AT) {
    log('Warning: ' + (alreadySent + dueBeforeLimit) + ' emails are at or near the free plan’s ' + FREE_DAILY_LIMIT + ' per day limit (' + alreadySent + ' already marked sent today, ' + dueBeforeLimit + ' due this hour).');
  }
  const limited = applyDailyLimit(groups, alreadySent);
  groups = limited.groups;
  if (limited.truncated) {
    log('The free plan’s ' + FREE_DAILY_LIMIT + ' per day limit was reached. ' + limited.truncated + ' due recipient' + (limited.truncated === 1 ? ' was' : 's were') + ' held back.');
  }
  log(describeGroups(groups));

  if (dry) {
    log('Dry run for ' + stamp + '. The counts above were loaded from the list. Nothing is sent, and LAST_DEVO_DATE is not updated.');
    const previewGroup = dueGroups(groups)[0];
    const previewDate = previewGroup ? previewGroup.localDate : ny.isoDate;
    const previewKey = previewGroup ? previewGroup.key : ny.key;
    const previewEntry = findEntry(entries, previewKey);
    if (!previewEntry) {
      log('No devotional is written for ' + previewKey + ' (' + previewDate + ').');
      return 0;
    }
    const email = buildEmail(previewEntry, previewDate, unsubscribeUrl(''));
    log('Sample for ' + (previewGroup ? previewGroup.timeZone : DEFAULT_TZ) + ' on ' + previewDate + ':');
    log('Campaign: ' + email.name);
    log('Subject: ' + email.subject);
    log('--- plain text ---');
    log(email.text);
    log('--- html ---');
    log(email.html);
    return 0;
  }

  const ready = dueGroups(groups);
  if (!ready.length) {
    log('No subscribers are in the 4 AM hour this run, or all of them have already received today’s reading. Nothing was sent.');
    return 0;
  }

  let totalSent = 0;
  for (const group of ready) {
    const entry = findEntry(entries, group.key);
    if (!entry) {
      log('No devotional is written for ' + group.key + ' (' + group.localDate + ') in ' + group.timeZone + '. Skipping that group.');
      continue;
    }
    const email = buildEmail(entry, group.localDate, unsubscribeUrl(''));
    const result = await sendTransactionalBatch(secrets.apiKey, secrets.sender, email, group.recipients, request);
    await updateLastDevoDates(secrets.apiKey, group.recipients, group.localDate, request);
    totalSent += result.sent;
    log('Sent ' + email.name + ' to ' + result.sent + ' subscriber' + (result.sent === 1 ? '' : 's') + ' in ' + group.timeZone + ' (list ' + secrets.listId + ').');
  }
  if (!totalSent) {
    log('Nothing was sent.');
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
  COPYRIGHT,
  NOTICE: COPYRIGHT,
  SITE,
  UNSUBSCRIBE_PAGE,
  DEFAULT_TZ,
  SEND_HOUR,
  FREE_DAILY_LIMIT,
  WARN_AT,
  ATTR_TIMEZONE,
  ATTR_LAST_DEVO,
  isValidIanaTimeZone,
  resolveTimeZone,
  tzParts,
  nyParts,
  inSendHour,
  contactTimeZone,
  alreadyReceived,
  isExcluded,
  groupByTimeZone,
  dueGroups,
  alreadySentTodayCount,
  dueCount,
  applyDailyLimit,
  longDate,
  campaignName,
  unsubscribeUrl,
  buildEmail,
  readSecrets,
  parseTestEmail,
  readTransactionalSecrets,
  forTestSend,
  findEntry,
  chooseEntry,
  usable,
  buildMessage,
  loadDevotionals,
  loadEntries: loadDevotionals,
  ensureAttributes,
  isPermissionDenied,
  describeGroups,
  isDryRun,
  run,
};

if (require.main === module) {
  main().then((code) => process.exit(code));
}
