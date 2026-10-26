const CACHE = 'nunta-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/auth.js', 'js/db.js', 'js/ui.js', 'js/firebase-config.js',
  'js/modules/dashboard.js', 'js/modules/guests.js', 'js/modules/tables.js', 'js/modules/budget.js', 'js/modules/tasks.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

// Rețea întâi pentru fișierele proprii (ca actualizările să ajungă), cache ca rezervă offline.
// Apelurile Firebase (alt origin) nu sunt interceptate; Firestore își are propriul cache offline.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  } else if (url.hostname === 'www.gstatic.com') {
    // SDK Firebase: cache întâi (versiune fixată în URL).
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => {
      const copy = n.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return n;
    })));
  }
});
