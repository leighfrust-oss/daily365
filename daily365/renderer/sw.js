// Service worker: lets the web app open offline once it has been loaded once.
// Network first, so a new version shows up as soon as you are online.
// If you add a new file to the app, add it to FILES. Bump CACHE to force a clean cache.
const CACHE = 'daily365-v1';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'render.js',
  'audio.js',
  'recorder.js',
  'platform.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
];

self.addEventListener('install', (event) => {
  // One missing file must not stop the whole install, so each file is cached on its own.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(FILES.map((file) => cache.add(file).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })),
  );
});
