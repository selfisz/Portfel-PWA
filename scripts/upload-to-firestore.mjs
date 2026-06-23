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

const raw = JSON.parse(
  readFileSync(join(__dirname, "import-result.json"), "utf8")
);

const appState = {
  transactions: raw.transactions,
  loan: raw.loan,
  investments: raw.investments,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

await setDoc(doc(db, "finances", "my_state"), appState);

console.log(`Wgrano ${appState.transactions.length} transakcji do Firestore.`);
process.exit(0);
