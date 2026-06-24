const CACHE_NAME = 'finanse-pwa-v77';

const ASSETS = [

  './',

  'index.html',

  'manifest.json',

  'styles.css',

  'js/constants.js',

  'js/firebase.js',

  'js/state.js',

  'js/format.js',

  'js/theme.js',

  'js/categories.js',

  'js/loan-details.js',

  'js/credit-cards.js',

  'js/portfolio.js',

  'js/ui.js',

  'js/transactions.js',

  'js/dashboard.js',

  'js/reports-core.js',

  'js/assets.js',

  'js/cash.js',

  'js/asset-analytics.js',

  'js/investments.js',

  'js/loans.js',

  'js/settings.js',

  'js/bootstrap.js',

  'js/reports-phase3.js',

  'icons/icon-192.png',

  'icons/icon-512.png',

  'icons/apple-touch-icon.png'

];



self.addEventListener('install', (e) => {

  e.waitUntil(

    caches.open(CACHE_NAME)

      .then((cache) => cache.addAll(ASSETS))

      .then(() => self.skipWaiting())

  );

});



self.addEventListener('activate', (e) => {

  e.waitUntil(

    caches.keys()

      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))

      .then(() => self.clients.claim())

  );

});



self.addEventListener('fetch', (e) => {

  if (e.request.method !== 'GET') return;



  e.respondWith(

    caches.match(e.request).then((cached) => {

      const networkFetch = fetch(e.request).then((response) => {

        if (response && response.status === 200 && e.request.url.startsWith(self.location.origin)) {

          const clone = response.clone();

          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));

        }

        return response;

      }).catch(() => cached);



      return cached || networkFetch;

    })

  );

});

