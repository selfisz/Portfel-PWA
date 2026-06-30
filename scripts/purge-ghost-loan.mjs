#!/usr/bin/env node
/** One-shot: remove legacy test loan (412500) from Firestore. */
import { getDoc, setDoc } from 'firebase/firestore';
import { signInForScripts, userStateRef } from './firebase-auth.mjs';

const LEGACY_TEST_CAPITAL = 412500;
const LEGACY_TEST_TOTAL = 500000;
const LEGACY_TEST_RATE = 6.75;
const PEKAO_CONTRACT = '00621649687/2/KH/25082025';

function isLegacyTestLoan(raw) {
    if (!raw || typeof raw !== 'object') return false;
    if (raw.details?.contractNumber === PEKAO_CONTRACT) return false;
    if (raw.id === 'loan-pekao' && (raw.currentCapitalLeft || 0) >= 600000) return false;
    if (raw.id === 'loan-primary') return true;
    const cap = parseFloat(raw.currentCapitalLeft) || 0;
    const total = parseFloat(raw.totalAmount) || 0;
    const rate = parseFloat(raw.interestRate) || 0;
    if (Math.abs(cap - LEGACY_TEST_CAPITAL) < 0.01) return true;
    if (Math.abs(total - LEGACY_TEST_TOTAL) < 0.01 && Math.abs(rate - LEGACY_TEST_RATE) < 0.01) return true;
    return false;
}

const uid = await signInForScripts();
const ref = userStateRef(uid);
const snap = await getDoc(ref);

if (!snap.exists()) {
    console.log(`Brak dokumentu users/${uid}/state/main.`);
    process.exit(0);
}

const data = snap.data();
const loans = Array.isArray(data.loans) ? data.loans : [];
const before = loans.length;
const cleaned = loans.filter((l) => !isLegacyTestLoan(l));
const removed = before - cleaned.length;

if (!removed) {
    console.log('Brak kredytu testowego do usunięcia.');
    process.exit(0);
}

const payload = { ...data, loans: cleaned };
delete payload.loan;

await setDoc(ref, payload);
console.log(`Usunięto ${removed} kredyt(ów) testowych. Pozostało ${cleaned.length} kredytów.`);
