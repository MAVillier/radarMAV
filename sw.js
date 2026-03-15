const NAME = 'radar-cache-v8';
const CORE = [
  '/', '/index.html', '/styles.css', '/app.js',
  '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-maskable.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(NAME).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === NAME ? null : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Stale-While-Revalidate per al snapshot (també amb querystring)
  if (url.pathname.endsWith('/data/snapshot.json')) {
    e.respondWith(
      caches.open(NAME).then(async (cache) => {
        const cached = await cache.match(e.request);
        const network = fetch(e.request)
          .then((res) => { cache.put(e.request, res.clone()).catch(()=>{}); return res; })
          .catch(() => cached || Response.error());
        return cached || network;
      })
    );
    return;
  }

  // Cache-first per assets
  if (CORE.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
    return;
  }

  // Network-first general
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
