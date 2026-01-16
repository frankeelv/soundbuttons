const CACHE = 'soundbuttons-v2';
const BASE = '/soundbuttons';

const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/styles.css`,
  `${BASE}/app.js`,
  `${BASE}/sw.js`,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE) ? null : caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match(`${BASE}/`)) || (await c.match(`${BASE}/index.html`));
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const c = await caches.open(CACHE);
      c.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});

