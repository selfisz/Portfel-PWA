const CACHE_NAME = 'finanse-pwa-v187';

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
  'js/reports-calendar.js',
  'js/reports-debt.js',
  'js/reports-assets.js',
  'js/reports-analysis-chart.js',
  'js/reports-phase3.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

function isAppShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  return path.endsWith('.js')
    || path.endsWith('.css')
    || path.endsWith('.html')
    || path.endsWith('/')
    || path.endsWith('manifest.json');
}

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

  const url = new URL(e.request.url);
  if (!isAppShellRequest(url)) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
