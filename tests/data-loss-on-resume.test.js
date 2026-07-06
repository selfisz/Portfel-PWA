/**
 * Regresja: utrata danych po cold start iOS (preferRemote + sync).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

const LOCAL_TX = {
    amount: 50,
    type: 'expense',
    date: '2026-07-05',
    mainCategory: 'Dom',
    subCategory: 'Zakupy'
};
const LOCAL_ONLY_TX = {
    amount: 99,
    type: 'expense',
    date: '2026-07-06',
    mainCategory: 'Dom',
    subCategory: 'Nowa'
};
const REMOTE_OLD_TX = {
    amount: 10,
    type: 'expense',
    date: '2026-01-01',
    mainCategory: 'Dom',
    subCategory: 'Stara'
};

function emptyAppStateShell() {
    return {
        transactions: [],
        loans: [],
        creditCards: [],
        creditCardMovements: [],
        assets: [],
        cashMovements: [],
        assetSnapshots: [],
        assetValueHistory: [],
        categoryBudgets: {},
        subCategoryBudgets: {},
        categoryIcons: { expense: { mains: {}, subs: {} }, income: { mains: {}, subs: {} } },
        reportPrefs: {},
        categoryRules: [],
        pendingRecurringConfirmations: [],
        skippedRecurringMonths: {},
        deletedAssetIds: [],
        todoLists: [],
        todos: []
    };
}

function seedLocalStorage(transactions) {
    localStorage.setItem(getFinanceStorageKey(), JSON.stringify({
        ...emptyAppStateShell(),
        transactions
    }));
}

beforeAll(() => {
    const store = {};
    const sessionStore = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };
    globalThis.sessionStorage = {
        getItem: (k) => sessionStore[k] ?? null,
        setItem: (k, v) => { sessionStore[k] = String(v); },
        removeItem: (k) => { delete sessionStore[k]; },
        clear: () => { Object.keys(sessionStore).forEach((k) => delete sessionStore[k]); }
    };
    globalThis.document = {
        getElementById: () => ({
            className: '',
            title: '',
            setAttribute: () => {},
            classList: { contains: () => false }
        })
    };
    globalThis.refreshCurrentView = () => {};
    globalThis.checkAndProcessRecurringTransactions = () => {};
    globalThis.isDemoFinanceSession = () => false;
    globalThis.hasPendingCloudSync = () => false;
    globalThis.repairMissingCashMovementsFromTransactions = () => {};
    globalThis.runCreditCardMigrations = () => false;
    globalThis.runLoanMigrations = () => false;
    globalThis.runAssetMigrations = () => false;
    globalThis.runCashMigrations = () => false;
    globalThis.runAssetAnalyticsMigrations = () => false;
    globalThis.migrateCategoryData = () => false;
    globalThis.migrateLoanCategoryTree = () => false;
    globalThis.mergeCreditCardsById = (...lists) => {
        const map = new Map();
        lists.flat().forEach((card) => { if (card?.id) map.set(card.id, card); });
        return [...map.values()];
    };
    globalThis.stateRef = { onSnapshot: () => () => {}, set: () => Promise.resolve() };

    loadScript('js/constants.js');
    loadScript('js/loan-details.js');
    loadScript('js/portfolio.js');
    loadScript('js/state-limits.js');
    loadScript('js/state.js');

    runInContext(`
        runLoanMigrations = () => false;
        runCreditCardMigrations = () => false;
        runAssetMigrations = () => false;
        runCashMigrations = () => false;
        runAssetAnalyticsMigrations = () => false;
        checkAndProcessRecurringTransactions = () => {};
    `);
});

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setFinanceStorageKey('uid-main');
    clearPreferRemoteFinanceState();
    runInContext(`appState = ${JSON.stringify(emptyAppStateShell())}; cloudSyncUnlocked = true;`);
});

describe('cold start iOS — lokalne dane są chronione', () => {
    it('beginFinanceSessionForUid NIE ustawia preferRemote przy pustym sessionStorage (cold start)', () => {
        sessionStorage.clear();
        beginFinanceSessionForUid('uid-main');
        expect(shouldPreferRemoteFinanceState()).toBe(false);
    });

    it('beginFinanceSessionForUid ustawia preferRemote tylko przy przełączeniu konta', () => {
        sessionStorage.setItem(FINANCE_SESSION_UID_KEY, 'uid-other');
        beginFinanceSessionForUid('uid-main');
        expect(shouldPreferRemoteFinanceState()).toBe(true);
    });

    it('loadLocalFinanceState ładuje dane nawet gdy preferRemote=true (konto nie-demo)', () => {
        seedLocalStorage([LOCAL_TX]);
        markPreferRemoteFinanceState();
        const loaded = loadLocalFinanceState();
        expect(loaded).toBe(true);
        expect(appState.transactions).toHaveLength(1);
    });

    it('po cold start loadLocalFinanceState ładuje dane przed sync', () => {
        seedLocalStorage([LOCAL_TX]);
        sessionStorage.clear();
        beginFinanceSessionForUid('uid-main');
        expect(shouldPreferRemoteFinanceState()).toBe(false);
        expect(loadLocalFinanceState()).toBe(true);
        expect(appState.transactions).toHaveLength(1);
    });
});

describe('syncFromRemoteData — nie nadpisuje lokalnych danych', () => {
    it('pusta chmura + lokalne dane → zachowuje localStorage i ładuje do RAM', () => {
        seedLocalStorage([LOCAL_TX]);
        markPreferRemoteFinanceState();
        runInContext(`appState = ${JSON.stringify(emptyAppStateShell())};`);

        syncFromRemoteData(emptyAppStateShell());

        expect(appState.transactions).toHaveLength(1);
        expect(appState.transactions[0].amount).toBe(50);
        const stored = JSON.parse(localStorage.getItem(getFinanceStorageKey()));
        expect(stored.transactions).toHaveLength(1);
    });

    it('starsza chmura + lokalne nowsze → merge (union) transakcji', () => {
        seedLocalStorage([LOCAL_TX, LOCAL_ONLY_TX]);
        markPreferRemoteFinanceState();
        runInContext(`appState = ${JSON.stringify(emptyAppStateShell())};`);

        syncFromRemoteData({
            ...emptyAppStateShell(),
            transactions: [REMOTE_OLD_TX]
        });

        expect(appState.transactions).toHaveLength(3);
        expect(appState.transactions.some((tx) => tx.amount === 99)).toBe(true);
        expect(appState.transactions.some((tx) => tx.amount === 10)).toBe(true);
        const stored = JSON.parse(localStorage.getItem(getFinanceStorageKey()));
        expect(stored.transactions).toHaveLength(3);
    });

    it('gdy chmura pusta, hydratuje appState z localStorage', () => {
        seedLocalStorage([LOCAL_TX, LOCAL_ONLY_TX]);
        clearPreferRemoteFinanceState();
        runInContext(`appState = ${JSON.stringify(emptyAppStateShell())};`);

        syncFromRemoteData(emptyAppStateShell());

        expect(appState.transactions).toHaveLength(2);
        const stored = JSON.parse(localStorage.getItem(getFinanceStorageKey()));
        expect(stored.transactions).toHaveLength(2);
    });

    it('merge łączy lokalne i zdalne transakcje', () => {
        seedLocalStorage([LOCAL_ONLY_TX]);
        clearPreferRemoteFinanceState();
        runInContext(`appState = ${JSON.stringify(emptyAppStateShell())};`);

        syncFromRemoteData({
            ...emptyAppStateShell(),
            transactions: [REMOTE_OLD_TX]
        });

        expect(appState.transactions).toHaveLength(2);
    });
});

describe('pełny scenariusz: odłożenie telefonu → iOS zabija PWA', () => {
    it('cold start + pusta chmura = dane zachowane', () => {
        seedLocalStorage([LOCAL_TX, LOCAL_ONLY_TX]);
        sessionStorage.clear();
        beginFinanceSessionForUid('uid-main');
        runInContext(`appState = ${JSON.stringify(emptyAppStateShell())};`);

        expect(shouldPreferRemoteFinanceState()).toBe(false);
        loadLocalFinanceState();
        syncFromRemoteData(emptyAppStateShell());

        expect(appState.transactions).toHaveLength(2);
        expect(JSON.parse(localStorage.getItem(getFinanceStorageKey())).transactions).toHaveLength(2);
    });

    it('cold start + starsza chmura = merge, bez utraty lokalnych tx', () => {
        seedLocalStorage([LOCAL_TX, LOCAL_ONLY_TX]);
        sessionStorage.clear();
        beginFinanceSessionForUid('uid-main');
        runInContext(`appState = ${JSON.stringify(emptyAppStateShell())};`);

        loadLocalFinanceState();
        syncFromRemoteData({
            ...emptyAppStateShell(),
            transactions: [REMOTE_OLD_TX]
        });

        expect(appState.transactions).toHaveLength(3);
        const stored = JSON.parse(localStorage.getItem(getFinanceStorageKey()));
        expect(stored.transactions).toHaveLength(3);
        expect(stored.transactions.some((tx) => tx.amount === 99)).toBe(true);
    });
});
