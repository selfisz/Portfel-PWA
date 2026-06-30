import { addDoc, setDoc } from 'firebase/firestore';
import {
    userCloudBackupRef,
    userSnapshotsCollection,
    userStateRef
} from './firebase-auth.mjs';

export function normalizeImportAppState(raw) {
    const appState = {
        transactions: raw.transactions || [],
        loans: Array.isArray(raw.loans) ? raw.loans : [],
        creditCards: Array.isArray(raw.creditCards) ? raw.creditCards : [],
        creditCardMovements: Array.isArray(raw.creditCardMovements) ? raw.creditCardMovements : [],
        assets: Array.isArray(raw.assets) ? raw.assets : [],
        cashMovements: Array.isArray(raw.cashMovements) ? raw.cashMovements : [],
        assetSnapshots: Array.isArray(raw.assetSnapshots) ? raw.assetSnapshots : [],
        assetValueHistory: Array.isArray(raw.assetValueHistory) ? raw.assetValueHistory : [],
        categoryBudgets: raw.categoryBudgets && typeof raw.categoryBudgets === 'object' ? raw.categoryBudgets : {}
    };

    if (raw.loan && typeof raw.loan === 'object' && !appState.loans.length) {
        appState.loan = raw.loan;
    }
    if (Array.isArray(raw.investments) && raw.investments.length) {
        appState.investments = raw.investments;
    }

    return appState;
}

export async function writeUserImport(uid, raw, { includeBackup = true } = {}) {
    const appState = normalizeImportAppState(raw);
    await setDoc(userStateRef(uid), appState);

    if (includeBackup) {
        const exportPayload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            transactionCount: appState.transactions.length,
            data: appState
        };
        await setDoc(userCloudBackupRef(uid), exportPayload);
        await addDoc(userSnapshotsCollection(uid), exportPayload);
    }

    return appState;
}
