const CACHE_NAME = 'finanse-pwa-v223';

const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'styles.css',
  'js/constants.js',
  'js/firebase.js',
  'js/auth.js',
  'js/state.js',
  'js/format.js',
  'js/theme.js',
  'js/categories.js',
  'js/loan-details.js',
  'js/credit-cards.js',
  'js/portfolio.js',
  'js/state-limits.js',
  'js/backup-import.js',
  'js/sync-queue.js',
  'js/ui.js',
  'js/transactions.js',
  'js/dashboard.js',
  'js/reports-core.js',
  'js/assets.js',
  'js/market-prices.js',
  'js/cash.js',
  'js/asset-analytics.js',
  'js/investments.js',
  'js/loans.js',
  'js/settings.js',
  'js/notifications.js',
  'js/budget-ui.js',
  'js/budget-alerts.js',
  'js/debt-reminders.js',
  'js/spending-insights.js',
  'js/subscription-center.js',
  'js/surplus-allocator.js',
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

function isAuthNavigation(url) {
  const search = url.search || '';
  return search.includes('apiKey=')
    || search.includes('oobCode=')
    || search.includes('mode=signIn')
    || search.includes('code=')
    || url.pathname.includes('__/auth/');
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

  // OAuth / Firebase Auth — nigdy nie przechwytuj (szczególnie iOS Safari / PWA).
  if (e.request.mode === 'navigate' || isAuthNavigation(url)) return;

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

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'SHOW_NOTIFICATION' || !data.notification) return;
  const n = data.notification;
  event.waitUntil(
    self.registration.showNotification(n.title || 'Finanse', {
      body: n.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: n.id,
      data: { id: n.id },
      actions: [
        { action: 'snooze', title: 'Przypomnij jutro' },
        { action: 'dismiss', title: 'Odrzuć' }
      ]
    })
  );
});

function focusOrOpenClient(clientList, message) {
  for (let i = 0; i < clientList.length; i++) {
    const client = clientList[i];
    if ('focus' in client) {
      client.postMessage(message);
      return client.focus();
    }
  }
  if (self.clients.openWindow) {
    return self.clients.openWindow('./index.html').then((client) => {
      if (client) client.postMessage(message);
      return client;
    });
  }
  return Promise.resolve();
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data?.id;
  if (!id) return;
  const action = event.action;
  let messageType = 'NOTIFICATION_OPENED';
  if (action === 'dismiss') messageType = 'NOTIFICATION_DISMISS';
  if (action === 'snooze') messageType = 'NOTIFICATION_SNOOZE';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => focusOrOpenClient(clients, { type: messageType, id }))
  );
});
