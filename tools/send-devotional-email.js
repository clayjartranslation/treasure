#!/usr/bin/env node
/*
 * Send today's Clay Jar Treasure Bible devotional through Brevo.
 *
 * Scheduled at 08:00 and 09:00 UTC. Sends only when America/New_York is in the
 * 4 AM hour, so daylight saving time still means 4:00 AM Eastern, once a day.
 * A campaign whose name contains that date is not sent again.
 *
 * Secrets (GitHub Actions): BREVO_API_KEY, BREVO_LIST_ID, BREVO_SENDER_EMAIL.
 * If any secret is missing, this exits 0 and does not call Brevo.
 *
 * DRY_RUN=1 prints the email and does not call Brevo.
 * DEVOTIONAL_NOW, if set, is an ISO time used instead of the clock (tests).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const COPYRIGHT = 'Devotionals © 2026 Jose Santiago. All rights reserved.';
const SITE = 'https://clayjartranslation.github.io/treasure/devotional.html';
const BLOCKED = new Set(['sent', 'queued', 'inprocess', 'suspended', 'inreview', 'archive']);

function nyParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long'
  });
  const map = {};
  fmt.formatToParts(date).forEach((part) => { map[part.type] = part.value; });
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const iso = `${map.year}-${map.month}-${map.day}`;
  return {
    hour,
    year: map.year,
    month: map.month,
    day: map.day,
    weekday: map.weekday,
    key: `${map.month}-${map.day}`,
    iso
  };
}

function longDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function campaignName(iso) {
  return `CTB devotional ${iso}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function usable(entry) {
  return !!(entry && /^\d{2}-\d{2}$/.test(entry.date) &&
    entry.title && entry.reference && entry.text && entry.reflection && entry.prayer);
}

function chooseEntry(entries, key) {
  const match = (entries || []).find((entry) => usable(entry) && entry.date === key);
  return match || null;
}

function buildMessage(entry, date) {
  const parts = nyParts(date);
  const name = campaignName(parts.iso);
  const when = longDate(date);
  const link = `${SITE}?d=${entry.date}`;
  const subject = `Daily devotional: ${entry.title}`;
  const preview = String(entry.text).split('\n')[0].slice(0, 140);
  const verseHtml = escapeHtml(entry.text).replace(/\n/g, '<br>\n');
  const reflection = String(entry.reflection).split(/\n\n+/).map((para) =>
    `<p style="font-size:18px;line-height:1.6;margin:0 0 14px;">${escapeHtml(para)}</p>`).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(entry.title)}</title>
</head>
<body style="margin:0;padding:0;background:#fff9eb;color:#3f2416;font-family:Georgia,'Iowan Old Style',serif;">
  <div style="max-width:36rem;margin:0 auto;padding:24px 20px;">
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a6522d;margin:0 0 8px;">Clay Jar Treasure Bible</p>
    <h1 style="font-size:28px;line-height:1.25;margin:0 0 8px;">${escapeHtml(entry.title)}</h1>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#6b4a37;margin:0 0 20px;">${escapeHtml(when)}</p>
    <blockquote style="margin:0 0 8px;padding:0 0 0 14px;border-left:3px solid #a6522d;font-size:20px;line-height:1.6;">${verseHtml}</blockquote>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#6b4a37;margin:0 0 20px;">${escapeHtml(entry.reference)}, Clay Jar Treasure Bible</p>
    <h2 style="font-size:20px;margin:0 0 8px;">Reflection</h2>
    ${reflection}
    <h2 style="font-size:20px;margin:10px 0 8px;">Prayer</h2>
    <p style="font-size:18px;line-height:1.6;margin:0 0 24px;">${escapeHtml(entry.prayer)}</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0 0 24px;"><a href="${escapeHtml(link)}" style="color:#a6522d;">Read this devotional</a></p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#6b4a37;margin:0 0 12px;">${escapeHtml(COPYRIGHT)}</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;margin:0;"><a href="{{ unsubscribe }}" style="color:#a6522d;">Unsubscribe</a></p>
  </div>
</body>
</html>`;
  const text = [
    entry.title,
    when,
    '',
    entry.reference,
    'Clay Jar Treasure Bible',
    '',
    entry.text,
    '',
    'Reflection',
    entry.reflection,
    '',
    'Prayer',
    entry.prayer,
    '',
    'Read this devotional:',
    link,
    '',
    COPYRIGHT,
    '',
    'Unsubscribe: {{ unsubscribe }}',
    ''
  ].join('\n');
  return { name, subject, preview, html, text, link, when };
}

function nowFromEnv() {
  if (!process.env.DEVOTIONAL_NOW) return new Date();
  const date = new Date(process.env.DEVOTIONAL_NOW);
  if (Number.isNaN(date.getTime())) throw new Error('DEVOTIONAL_NOW is not a valid time.');
  return date;
}

function isDryRun() {
  const value = String(process.env.DRY_RUN || '').toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function readSecrets() {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  const listRaw = String(process.env.BREVO_LIST_ID || '').trim();
  const sender = String(process.env.BREVO_SENDER_EMAIL || '').trim();
  const listId = /^[1-9]\d*$/.test(listRaw) ? Number(listRaw) : null;
  const senderOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender);
  return {
    ok: !!(apiKey && listId && senderOk),
    apiKey,
    listId,
    sender
  };
}

function loadEntries() {
  const file = path.join(__dirname, '..', 'data', 'devotionals.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.entries || [];
}

function normStatus(status) {
  return String(status || '').toLowerCase().replace(/_/g, '');
}

async function brevo(apiKey, method, apiPath, body) {
  const res = await fetch('https://api.brevo.com/v3' + apiPath, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      'api-key': apiKey,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch (e) { json = null; }
  }
  return { status: res.status, ok: res.ok, text, json };
}

async function listCampaigns(apiKey) {
  const statuses = ['draft', 'sent', 'queued', 'inProcess', 'suspended', 'inReview', 'archive', 'cancelled'];
  const found = [];
  for (const status of statuses) {
    let offset = 0;
    for (;;) {
      const query = new URLSearchParams({
        status,
        limit: '50',
        offset: String(offset),
        excludeHtmlContent: 'true'
      });
      const res = await brevo(apiKey, 'GET', '/emailCampaigns?' + query.toString());
      if (!res.ok) {
        throw new Error(`Listing campaigns failed (${status} ${res.status}).`);
      }
      const rows = (res.json && res.json.campaigns) || [];
      found.push(...rows);
      if (rows.length < 50) break;
      offset += rows.length;
      if (offset > 5000) break;
    }
  }
  return found;
}

function emptyList(res) {
  const msg = `${res.text || ''} ${(res.json && res.json.message) || ''}`.toLowerCase();
  return res.status === 400 && /empty|no recipient|no contact|nobody/.test(msg);
}

async function sendNow(apiKey, id) {
  const res = await brevo(apiKey, 'POST', `/emailCampaigns/${id}/sendNow`);
  if (res.ok || res.status === 204) return { sent: true };
  if (emptyList(res)) return { sent: false, empty: true };
  throw new Error(`Sending campaign ${id} failed (${res.status}).`);
}

async function createCampaign(apiKey, secrets, message) {
  const res = await brevo(apiKey, 'POST', '/emailCampaigns', {
    name: message.name,
    subject: message.subject,
    previewText: message.preview,
    sender: { name: 'Clay Jar Treasure Bible', email: secrets.sender },
    replyTo: secrets.sender,
    htmlContent: message.html,
    recipients: { listIds: [secrets.listId] },
    inlineImageActivation: false,
    mirrorActive: false,
    tag: 'ctb-devotional'
  });
  if (!res.ok || !res.json || !res.json.id) {
    throw new Error(`Creating the campaign failed (${res.status}).`);
  }
  return res.json.id;
}

function campaignDate(message) {
  const match = /(\d{4}-\d{2}-\d{2})$/.exec(message.name);
  return match ? match[1] : '';
}

function alreadyHandled(campaigns, stamp) {
  const dated = (campaigns || []).filter((campaign) => stamp && String(campaign.name || '').includes(stamp));
  const blocking = dated.filter((campaign) => BLOCKED.has(normStatus(campaign.status)));
  if (blocking.length) return { action: 'skip', campaign: blocking[0] };
  const draft = dated.find((campaign) => normStatus(campaign.status) === 'draft');
  if (draft) return { action: 'send-draft', campaign: draft };
  return { action: 'create' };
}

async function deliver(secrets, message) {
  const stamp = campaignDate(message);
  const decision = alreadyHandled(await listCampaigns(secrets.apiKey), stamp);
  if (decision.action === 'skip') {
    console.log(`A campaign named "${decision.campaign.name}" is already ${decision.campaign.status}. Not sending again.`);
    return;
  }
  if (decision.action === 'send-draft') {
    const draft = decision.campaign;
    const result = await sendNow(secrets.apiKey, draft.id);
    if (result.empty) {
      console.log('The Brevo list has no confirmed subscribers yet. Nothing was sent.');
      return;
    }
    console.log(`Sent the existing draft campaign ${draft.id}.`);
    return;
  }
  const id = await createCampaign(secrets.apiKey, secrets, message);
  const result = await sendNow(secrets.apiKey, id);
  if (result.empty) {
    console.log(`Created campaign ${id}. The list has no confirmed subscribers yet, so it was not sent.`);
    return;
  }
  console.log(`Sent campaign ${id} (${message.name}).`);
}

async function main() {
  const date = nowFromEnv();
  const parts = nyParts(date);
  const dry = isDryRun();
  if (!dry && parts.hour !== 4) {
    console.log(`America/New_York is ${parts.iso} hour ${parts.hour}, not the 4 AM hour. Nothing was sent.`);
    return;
  }
  const entry = chooseEntry(loadEntries(), parts.key);
  if (!entry) {
    console.log(`No devotional for ${parts.key} in data/devotionals.json. Nothing was sent.`);
    return;
  }
  const message = buildMessage(entry, date);
  if (!message.text.includes(entry.text)) throw new Error('The plain-text email dropped the verse.');
  if (!message.html.includes('{{ unsubscribe }}') || !message.text.includes('{{ unsubscribe }}')) {
    throw new Error('The email is missing the unsubscribe tag.');
  }
  if (!message.html.includes(COPYRIGHT) || !message.text.includes(COPYRIGHT)) {
    throw new Error('The email is missing the copyright line.');
  }
  if (dry) {
    const secrets = readSecrets();
    console.log('Dry run: email was not sent. Brevo was not called.');
    console.log('Secrets present: ' + (secrets.ok ? 'yes' : 'no'));
    console.log('Campaign name: ' + message.name);
    console.log('Subject: ' + message.subject);
    console.log('--- plain text ---');
    console.log(message.text);
    console.log('--- html ---');
    console.log(message.html);
    return;
  }
  const secrets = readSecrets();
  if (!secrets.ok) {
    console.log('Brevo secrets are not set (BREVO_API_KEY, BREVO_LIST_ID, BREVO_SENDER_EMAIL). Nothing was sent.');
    return;
  }
  await deliver(secrets, message);
}

module.exports = {
  nyParts,
  longDate,
  campaignName,
  chooseEntry,
  buildMessage,
  readSecrets,
  alreadyHandled,
  COPYRIGHT
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}
