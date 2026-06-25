/**
 * Wgrywa import-result.json do Firestore:
 * - finances/my_state (stan aplikacji)
 * - finances/cloud_backup (kopia zapasowa do przywracania w UI)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { doc, getFirestore, setDoc } from "firebase/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));

const firebaseConfig = {
  apiKey: "AIzaSyAfvk2_lfsaf5QZkH_MVk-kWbG8GFvjSeI",
  authDomain: "portfel-pwa.firebaseapp.com",
  projectId: "portfel-pwa",
  storageBucket: "portfel-pwa.firebasestorage.app",
  messagingSenderId: "370658952228",
  appId: "1:370658952228:web:b5fedfe155ea1918e584b1",
};

const raw = JSON.parse(readFileSync(join(__dirname, "import-result.json"), "utf8"));

const appState = {
  transactions: raw.transactions || [],
  loans: Array.isArray(raw.loans) ? raw.loans : [],
  creditCards: Array.isArray(raw.creditCards) ? raw.creditCards : [],
  creditCardMovements: Array.isArray(raw.creditCardMovements) ? raw.creditCardMovements : [],
  assets: Array.isArray(raw.assets) ? raw.assets : [],
  cashMovements: Array.isArray(raw.cashMovements) ? raw.cashMovements : [],
  assetSnapshots: Array.isArray(raw.assetSnapshots) ? raw.assetSnapshots : [],
  assetValueHistory: Array.isArray(raw.assetValueHistory) ? raw.assetValueHistory : [],
  categoryBudgets: raw.categoryBudgets && typeof raw.categoryBudgets === "object" ? raw.categoryBudgets : {},
};

if (raw.loan && typeof raw.loan === "object" && !appState.loans.length) {
  appState.loan = raw.loan;
}
if (Array.isArray(raw.investments) && raw.investments.length) {
  appState.investments = raw.investments;
}

const exportPayload = {
  version: 1,
  exportedAt: new Date().toISOString(),
  transactionCount: appState.transactions.length,
  data: appState,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

await setDoc(doc(db, "finances", "my_state"), appState);
await setDoc(doc(db, "finances", "cloud_backup"), exportPayload);

console.log(`Przywrócono ${appState.transactions.length} transakcji → my_state + cloud_backup.`);
