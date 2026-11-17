/* Brandel Family Recipes — service worker.
   Makes the site installable and usable offline.
   - App shell (HTML/CSS/JS/manifest/icons) is precached on install.
   - Navigations are network-first with a cached-shell fallback, so a new
     deploy is picked up on the next online visit.
   - Same-origin GETs (images, PDFs, data) are stale-while-revalidate.
   - Bridge GETs (recipe data) are network-first with a cache fallback,
     so the last-loaded recipes still show offline.
   - POSTs are never cached and always go to the network. */
var CACHE = 'brandel-recipes-v20261117a';
var SHELL = [
  './',
  'index.html',
  'styles.css?v=20261115a',
  'app.js?v=20261115a',
  'manifest.json',
  'assets/images/icon-192.png',
  'assets/images/icon-512.png',
  'assets/images/icon-512-maskable.png'
];
var BRIDGE_ORIGIN = 'https://recipe-bridge.brandelavi.workers.dev';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return; // never cache writes
  var url = new URL(req.url);

  // Navigations: network first, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put('index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('index.html');
      })
    );
    return;
  }

  // Bridge data reads: network first, cache fallback (last-loaded data offline).
  if (url.origin === BRIDGE_ORIGIN) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req);
      })
    );
    return;
  }

  // Same-origin static assets: serve from cache, refresh in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      })
    );
    return;
  }

  // Everything else (fonts, etc.): straight to the network.
});
