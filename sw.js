// Saves the page's own files (HTML, CSS, JS, icons) on the phone so the app opens even with no signal.
// Files with a ?v= version tag never change, so they come straight from the phone (instant).
// The page itself (index.html) is fetched fresh when possible (3-second limit), else the saved copy.
// Sleeper data and data/*.json are handled by the page (js/sleeper.js), not here.
const SHELL = 'sd-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

async function save(req, res) {
  if (!res || !res.ok) return;
  const cache = await caches.open(SHELL);
  // Remove older versions of the same file (different ?v=) so storage doesn't pile up.
  const path = new URL(req.url).pathname;
  for (const old of await cache.keys()) {
    if (new URL(old.url).pathname === path && old.url !== req.url) cache.delete(old);
  }
  await cache.put(req, res);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/data/')) return;

  if (url.searchParams.has('v')) {
    // Versioned file: phone copy first.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { save(req, res.clone()); return res; })));
    return;
  }
  // Page / manifest: fresh if it arrives within 3 seconds, otherwise the saved copy.
  e.respondWith((async () => {
    const fresh = fetch(req).then(res => { save(req, res.clone()); return res; });
    const timeout = new Promise(resolve => setTimeout(resolve, 3000));
    const res = await Promise.race([fresh.catch(() => null), timeout]);
    if (res) return res;
    return (await caches.match(req)) || fresh;
  })());
});
