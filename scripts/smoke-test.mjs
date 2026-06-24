import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.SMOKE_BASE || 'http://127.0.0.1:8765';

const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const scriptSrcs = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
const swAssets = readFileSync(path.join(root, 'sw.js'), 'utf8');
const cachedJs = [...swAssets.matchAll(/'js\/[^']+\.js'/g)].map((m) => m[0].slice(1, -1));

const staticAssets = [
    'index.html',
    'styles.css',
    'manifest.json',
    'sw.js',
    ...scriptSrcs,
    ...cachedJs
];
const uniqueAssets = [...new Set(staticAssets)];

let failed = 0;

async function checkAsset(asset) {
    const url = `${base}/${asset}`;
    const res = await fetch(url);
    if (!res.ok) {
        console.error(`FAIL ${asset} → HTTP ${res.status}`);
        failed++;
        return;
    }
    const text = await res.text();
    if (asset.endsWith('.js') && text.length < 10) {
        console.error(`FAIL ${asset} → empty or too short`);
        failed++;
        return;
    }
    console.log(`OK   ${asset} (${res.status}, ${text.length} B)`);
}

console.log(`\n=== Smoke test: static assets @ ${base} ===\n`);
for (const asset of uniqueAssets) {
    await checkAsset(asset);
}

console.log(`\n=== Syntax check (node --check) ===\n`);
import { execSync } from 'child_process';
for (const asset of scriptSrcs) {
    const file = path.join(root, asset);
    try {
        execSync(`node --check "${file}"`, { stdio: 'pipe' });
        console.log(`OK   syntax ${asset}`);
    } catch {
        console.error(`FAIL syntax ${asset}`);
        failed++;
    }
}

console.log(`\n=== Global symbols (grep) ===\n`);
const requiredGlobals = [
    'renderDashboard',
    'renderReports',
    'renderInvestments',
    'renderLoans',
    'saveTransaction',
    'getPortfolioValuePln',
    'renderPhase3Reports',
    'switchView',
    'initData'
];
const allJs = scriptSrcs.map((s) => readFileSync(path.join(root, s), 'utf8')).join('\n');
for (const name of requiredGlobals) {
    const defined = new RegExp(`function ${name}\\b`).test(allJs);
    if (!defined) {
        console.error(`FAIL missing function ${name}`);
        failed++;
    } else {
        console.log(`OK   function ${name}`);
    }
}

console.log(failed ? `\n❌ ${failed} problem(s)\n` : '\n✅ Static smoke test passed\n');
process.exit(failed ? 1 : 0);
