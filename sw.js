/* Service worker: saves the whole site for offline reading. Bump VERSION when files change
   (tools/add-book.js does this automatically). All paths are relative, so the site works
   from a domain root or a subpath such as https://USER.github.io/treasure/. */
const VERSION = 'ctb-v42';
const CORE = [
  './', 'index.html', 'terms.html', 'privacy.html', 'devotional.html', 'downloads.html', 'css/style.css', 'js/app.js', 'js/firebase-config.js', 'js/devotional-email-config.js', 'js/devotional.js', 'js/devotional-form.js', 'js/languages.js', 'js/lang.js', 'js/register-sw.js', 'js/sync-merge.js', 'js/phone-countries.js', 'js/accounts.js', 'manifest.webmanifest', '.well-known/security.txt',
  'data/books.json', 'data/front-matter.json', 'data/devotionals.json',
  'icons/ctb-logo-720.jpg', 'icons/emblem-96.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-48.png',
];

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
