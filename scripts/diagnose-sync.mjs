/**
 * Diagnostyka sync — uruchamia stronę GitHub Pages w czystym kontekście
 * i raportuje: błędy konsoli, kolor kropki, liczbę transakcji w DOM/localStorage.
 */
import { chromium } from 'playwright';

const URL = process.env.APP_URL || 'https://selfisz.github.io/Portfel-PWA/';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: undefined });
const page = await context.newPage();

const consoleLogs = [];
const consoleErrors = [];
page.on('console', (msg) => {
  const line = `[${msg.type()}] ${msg.text()}`;
  if (msg.type() === 'error') consoleErrors.push(line);
  else consoleLogs.push(line);
});
page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));

console.log('Otwieram:', URL);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });

const snapshots = [];
for (const sec of [0, 2, 5, 10, 15]) {
  if (sec > 0) await page.waitForTimeout(sec * 1000 - (snapshots.length ? snapshots[snapshots.length - 1].t : 0) * 1000);
  const snap = await page.evaluate(() => {
    const status = document.getElementById('sync-status');
    const txItems = document.querySelectorAll('#tx-list .tx-item, #tx-list li, .tx-row');
    let storedCount = null;
    try {
      const raw = JSON.parse(localStorage.getItem('app_finance_state') || 'null');
      storedCount = raw?.transactions?.length ?? null;
    } catch { /* ignore */ }
    return {
      syncClass: status?.className ?? 'MISSING',
      syncTitle: status?.title ?? '',
      txDomCount: txItems.length,
      storedCount,
      cloudSyncUnlocked: typeof cloudSyncUnlocked !== 'undefined' ? cloudSyncUnlocked : 'undefined',
      appStateCount: typeof appState !== 'undefined' && appState?.transactions
        ? appState.transactions.length
        : 'undefined',
    };
  });
  snapshots.push({ t: sec, ...snap });
  console.log(`t+${sec}s:`, JSON.stringify(snap));
}

console.log('\n--- Błędy konsoli ---');
if (consoleErrors.length === 0) console.log('(brak)');
else consoleErrors.forEach((e) => console.log(e));

console.log('\n--- Ostrzeżenia sync/firebase ---');
consoleLogs
  .filter((l) => /sync|firestore|firebase|REST|tryFetch|Błąd/i.test(l))
  .slice(0, 30)
  .forEach((l) => console.log(l));

await browser.close();

const last = snapshots[snapshots.length - 1];
const ok = last.syncClass === 'online' && (last.storedCount >= 100 || last.appStateCount >= 100);
process.exit(ok ? 0 : 1);
