/* Service worker: saves the whole site for offline reading. Bump VERSION when files change
   (tools/add-book.js does this automatically). All paths are relative, so the site works
   from a domain root or a subpath such as https://USER.github.io/treasure/. */
const VERSION = 'ctb-v78';
const CORE = [
  './', 'index.html', 'terms.html', 'privacy.html', 'devotional.html', 'bible-in-a-year.html', 'unsubscribe.html', 'downloads.html', 'how-to-use.html', 'css/style.css', 'js/share.js', 'js/app.js', 'js/find-verses.js', 'js/firebase-config.js', 'js/devotional-email-config.js', 'js/devotional.js', 'js/bible-in-a-year.js', 'js/range-response.js', 'js/devotional-form.js', 'js/unsubscribe.js', 'js/languages.js', 'js/lang.js', 'js/register-sw.js', 'js/sync-merge.js', 'js/phone-countries.js', 'js/accounts.js', 'manifest.webmanifest', '.well-known/security.txt',
  'data/books.json', 'data/front-matter.json', 'data/devotionals.json', 'data/bible-in-a-year.json',
  'icons/ctb-logo-720.jpg', 'icons/emblem-96.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-48.png',
];

importScripts('js/range-response.js');


/* Serve byte ranges from the cache so iOS Safari can play cached audio. */
async function respondWithRange(event, req, cache, fallback) {
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached && cached.status === 200 && cached.ok) {
    return sliceRangeResponse(req, cached);
  }
  // Fetch the whole file (no Range) so the cache stores a complete copy,
  // then slice it. Never cache a 206 fragment.
  try {
    const fullReq = new Request(req.url, { method: 'GET', mode: req.mode, credentials: req.credentials });
    const res = await fetch(fullReq);
    if (res.ok && res.status === 200) {
      cache.put(req.url, res.clone());
      if (req.headers.has('Range')) return sliceRangeResponse(req, res);
      return res;
    }
  } catch (e) { /* offline */ }
  if (fallback) return fallback();
  return cached || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    // Also save every translated book listed in the catalog.
    const res = await cache.match('data/books.json');
    const cat = await res.json();
    const files = cat.books.filter((b) => b.file).map((b) => b.file);
    await cache.addAll(files.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  const isData = /\/data\/.+\.json$/.test(path);
  /* Account and devotional-email config are edited in place. Fetch them from the network when
     online so a filled-in file shows up without waiting for the next cache bump. */
  const isConfig = /\/js\/(?:firebase-config|devotional-email-config)\.js$/.test(path);
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (req.headers.has('Range')) {
      return respondWithRange(event, req, cache, null);
    }
    if (isData || isConfig) {
      // Data: always try the network first (bypassing the browser cache) so new chapters show up;
      // fall back to the saved copy when offline.
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) { cache.put(req, res.clone()); return res; }
      } catch (e) { /* offline */ }
      const saved = await cache.match(req, { ignoreSearch: true });
      return saved || Response.error();
    }
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});
