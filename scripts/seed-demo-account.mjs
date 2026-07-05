/**
 * Tworzy konto test@test.pl i wgrywa ~1000 transakcji demo do Firestore.
 *
 * Użycie (z katalogu scripts, po npm install):
 *   node seed-demo-account.mjs
 *
 * Hasło konta demo: test12 (Firebase wymaga min. 6 znaków; „test” jest za krótkie).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_PASSWORD } from './auth-allowed.mjs';
import { ensureDemoAuthUser } from './demo-auth.mjs';
import { generateDemoAppState } from './generate-demo-state.mjs';
import { writeUserImport } from './firestore-user-write.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const transactionCount = Number(process.env.DEMO_TX_COUNT) || 1000;

console.log(`Generowanie danych demo (${transactionCount} transakcji)…`);
const appState = generateDemoAppState({ transactionCount });

const exportPayload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    transactionCount: appState.transactions.length,
    archivedTransactions: [],
    monthCloseState: {},
    data: appState
};

const seedPath = join(ROOT, 'data', 'demo-test-account.json');
writeFileSync(seedPath, JSON.stringify(exportPayload, null, 2));
console.log(`Zapisano kopię JSON: ${seedPath}`);

console.log(`Logowanie / tworzenie konta ${DEMO_ACCOUNT_EMAIL}…`);
const user = await ensureDemoAuthUser(DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_PASSWORD);

console.log(`Wgrywanie do Firestore users/${user.uid}/state/main …`);
const written = await writeUserImport(user.uid, appState);

console.log('OK — konto demo gotowe:');
console.log(`  E-mail:   ${DEMO_ACCOUNT_EMAIL}`);
console.log(`  Hasło:    ${DEMO_ACCOUNT_PASSWORD}`);
console.log(`  UID:      ${user.uid}`);
console.log(`  Transakcje: ${written.transactions.length}`);
console.log(`  Kredyty:    ${written.loans.length}`);
console.log(`  Karty:      ${written.creditCards.length}`);
console.log(`  Aktywa:     ${written.assets.length}`);
