/**
 * Wgrywa import-result.json do Firestore (users/{uid}/state/main + backup).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signInForScripts } from './firebase-auth.mjs';
import { writeUserImport } from './firestore-user-write.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(__dirname, 'import-result.json'), 'utf8'));

const uid = await signInForScripts();
const appState = await writeUserImport(uid, raw);

console.log(`Przywrócono ${appState.transactions.length} transakcji → users/${uid}/state/main + cloud_backup + snapshots.`);
