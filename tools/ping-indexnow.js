#!/usr/bin/env node
/* Ping IndexNow (Bing, DuckDuckGo, Yandex, and others) after a deploy.
   The key is public by design: it lives at /{key}.txt on the site root.
   Usage:
     node tools/ping-indexnow.js            # URLs changed in this commit
     node tools/ping-indexnow.js --all      # every URL in sitemap.xml
     node tools/ping-indexnow.js --dry-run  # print URLs, do not POST
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KEY = '1f166bb5e2074e07a1cf4ec41522da36';
const HOST = 'clayjartranslation.github.io';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://yandex.com/indexnow',
];
const isCtb = fs.existsSync(path.join(ROOT, 'downloads.html'));
const BASE = isCtb
  ? `https://${HOST}/treasure/`
  : `https://${HOST}/`;

function isVerificationPage(name) {
  return /^google[0-9a-f]+\.html$/i.test(name)
    || /^yandex_[0-9a-f]+\.html$/i.test(name);
}

function urlFor(rel) {
  if (!rel) return null;
  const norm = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    norm.startsWith('tests/')
    || norm.startsWith('tools/')
    || norm.startsWith('.github/')
    || norm.startsWith('docs/')
    || norm.startsWith('email-images/')
  ) return null;
  const base = path.posix.basename(norm);
  if (isVerificationPage(base)) return null;
  if (norm === 'index.html') return BASE;
  if (norm === 'downloads/index.html') return BASE + 'downloads/';
  if (norm.endsWith('.html')) return BASE + norm;
  if (norm.startsWith('data/devotionals') || norm === 'js/devotional.js') {
    return BASE + 'devotional.html';
  }
  if (norm.startsWith('data/bible-in-a-year') || norm === 'js/bible-in-a-year.js') {
    return BASE + 'bible-in-a-year.html';
  }
  return null;
}

function filesFromGit() {
  const before = process.env.GITHUB_EVENT_BEFORE || '';
  const sha = process.env.GITHUB_SHA || 'HEAD';
  const empty = /^0+$/.test(before);
  let cmd;
  if (before && !empty) cmd = `git diff --name-only ${before} ${sha}`;
  else cmd = 'git diff --name-only HEAD~1 HEAD';
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function urlsFromSitemap() {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function urlsFromFiles(files) {
  const set = new Set();
  for (const rel of files) {
    const url = urlFor(rel);
    if (url) set.add(url);
  }
  return [...set];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForKey(timeoutMs) {
  const start = Date.now();
  let last = 'not fetched';
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(KEY_LOCATION, { cache: 'no-store' });
      const text = (await res.text()).trim();
      last = `${res.status} ${text.slice(0, 80)}`;
      if (res.ok && text === KEY) return;
    } catch (err) {
      last = String(err && err.message ? err.message : err);
    }
    await sleep(10000);
  }
  throw new Error(`IndexNow key file is not live yet (${last})`);
}

async function submit(urls, endpoint) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList: urls,
    }),
  });
  const body = await res.text();
  return { endpoint, status: res.status, body: body.slice(0, 300) };
}

async function main(argv) {
  const dry = argv.includes('--dry-run');
  const all = argv.includes('--all');
  const urls = all ? urlsFromSitemap() : urlsFromFiles(filesFromGit());
  if (!urls.length) {
    console.log('No public page URLs to submit to IndexNow.');
    return { urls, results: [] };
  }
  console.log(`IndexNow: ${urls.length} URL(s) from ${isCtb ? 'CTB' : 'CJT'}.`);
  if (dry) {
    for (const u of urls) console.log(u);
    return { urls, results: [] };
  }
  await waitForKey(3 * 60 * 1000);
  const results = [];
  for (const endpoint of ENDPOINTS) {
    const result = await submit(urls, endpoint);
    results.push(result);
    console.log(`${result.endpoint} -> ${result.status}`);
    if (result.body) console.log(result.body);
    if (![200, 202].includes(result.status)) {
      throw new Error(`IndexNow ${endpoint} returned ${result.status}`);
    }
  }
  return { urls, results };
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { KEY, KEY_LOCATION, BASE, urlFor, urlsFromFiles, urlsFromSitemap, main };
