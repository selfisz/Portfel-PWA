import { chromium } from 'playwright';

const base = process.env.SMOKE_BASE || 'http://127.0.0.1:8765';
const errors = [];
const views = [
    { id: 'dashboard', title: 'Pulpit', selector: '#db-total-expenses' },
    { id: 'add', title: 'Dodaj', selector: '#tx-amount' },
    { id: 'reports', title: 'Analiza', selector: '#reports-total-expense' },
    { id: 'investments', title: 'Aktywa', selector: '#assets-list' },
    { id: 'loans', title: 'Kredyty', selector: '#loans-list' },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});

console.log(`\n=== Browser smoke test @ ${base} ===\n`);

await page.goto(`${base}/index.html`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);

const globals = await page.evaluate(() => ({
    renderDashboard: typeof renderDashboard,
    renderReports: typeof renderReports,
    renderInvestments: typeof renderInvestments,
    renderLoans: typeof renderLoans,
    getPortfolioValuePln: typeof getPortfolioValuePln,
    renderPhase3Reports: typeof renderPhase3Reports,
    switchView: typeof switchView,
}));
for (const [name, type] of Object.entries(globals)) {
    const ok = type === 'function';
    console.log(`${ok ? 'OK' : 'FAIL'}  global ${name} → ${type}`);
    if (!ok) errors.push(`missing global ${name}`);
}

for (const view of views) {
    await page.evaluate(({ id, title }) => {
        const nav = [...document.querySelectorAll('.nav-item')].find((b) => b.getAttribute('onclick')?.includes(`'${id}'`));
        if (nav) nav.click();
        else switchView(id, title, null);
    }, view);
    await page.waitForTimeout(400);
    const visible = await page.locator(view.selector).isVisible();
    console.log(`${visible ? 'OK' : 'FAIL'}  view ${view.id} renders key element`);
    if (!visible) errors.push(`view ${view.id} missing key element`);
}

await page.evaluate(() => {
    if (typeof openSettings === 'function') openSettings();
});
await page.waitForTimeout(200);
const settingsOpen = await page.evaluate(() => !document.getElementById('settings-overlay').classList.contains('hidden'));
console.log(`${settingsOpen ? 'OK' : 'FAIL'}  openSettings()`);
if (!settingsOpen) errors.push('openSettings failed');

const periodSelect = await page.$('#dashboard-period-select');
if (periodSelect) {
    await page.evaluate(() => switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]));
    await page.waitForTimeout(300);
    await page.selectOption('#dashboard-period-select', 'all');
    await page.waitForTimeout(300);
    const label = await page.textContent('#db-period-label');
    const ok = label?.trim() === 'Wszystko';
    console.log(`${ok ? 'OK' : 'FAIL'}  dashboard period „Wszystko” → "${label?.trim()}"`);
    if (!ok) errors.push(`dashboard period label: ${label}`);
}

const ignorable = errors.filter((e) =>
    /Firebase persistence|permission|offline|Failed to load resource.*firebase/i.test(e)
);
const critical = errors.filter((e) => !ignorable.includes(e));

if (ignorable.length) {
    console.log(`\nℹ️  Ignored (${ignorable.length}): Firebase/offline expected without auth`);
    ignorable.forEach((e) => console.log(`   ${e}`));
}

await browser.close();

if (critical.length) {
    console.log(`\n❌ ${critical.length} critical issue(s):`);
    critical.forEach((e) => console.log(`   ${e}`));
    process.exit(1);
}

console.log('\n✅ Browser smoke test passed\n');
process.exit(0);
