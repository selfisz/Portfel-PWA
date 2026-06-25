/**
 * Rozszerzona diagnostyka sync
 */
import { chromium } from 'playwright';

const URL = process.env.APP_URL || 'https://selfisz.github.io/Portfel-PWA/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const network = [];
page.on('request', (req) => {
  const u = req.url();
  if (/firestore|firebase|googleapis/.test(u)) network.push(`REQ ${req.method()} ${u.slice(0, 120)}`);
});
page.on('response', async (res) => {
  const u = res.url();
  if (/firestore|firebase|googleapis/.test(u)) {
    network.push(`RES ${res.status()} ${u.slice(0, 120)}`);
  }
});

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(8000);

const diag = await page.evaluate(async () => {
  const out = {
    hasFetchAppStateRest: typeof fetchAppStateRest === 'function',
    hasStateRef: typeof stateRef !== 'undefined',
    hasFirebase: typeof firebase !== 'undefined',
    cloudSyncUnlocked,
    appStateTx: appState?.transactions?.length ?? null,
    syncClass: document.getElementById('sync-status')?.className ?? null,
    restTest: null,
    restError: null,
  };
  if (typeof fetchAppStateRest === 'function') {
    try {
      const data = await fetchAppStateRest();
      out.restTest = data?.transactions?.length ?? 'no-tx-array';
    } catch (e) {
      out.restError = String(e.message || e);
    }
  }
  return out;
});

console.log('=== DIAGNOSTYKA ===');
console.log(JSON.stringify(diag, null, 2));
console.log('\n=== BŁĘDY JS ===');
errors.forEach((e) => console.log(e));
console.log('\n=== RUCH FIRESTORE/FIREBASE (pierwsze 40) ===');
network.slice(0, 40).forEach((n) => console.log(n));
console.log(`\n... łącznie ${network.length} requestów firebase/firestore`);

await browser.close();
