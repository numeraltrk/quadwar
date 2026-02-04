const CACHE_NAME = 'quadwar-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './game.html',
    './assets/css/landing.css',
    './assets/css/game.css',
    './assets/js/game/main.js',
    './assets/js/game/logic.js',
    './assets/js/game/constants.js',
    './assets/js/game/network.js',
    './assets/js/landing.js',
    './assets/icons/icon-192x192.png',
    './assets/icons/icon-512x512.png',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((response) => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});
