import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

beforeAll(() => {
    const store = {};
    const sessionStore = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
        key: (i) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; }
    };
    globalThis.sessionStorage = {
        getItem: (k) => sessionStore[k] ?? null,
        setItem: (k, v) => { sessionStore[k] = String(v); },
        removeItem: (k) => { delete sessionStore[k]; },
        clear: () => { Object.keys(sessionStore).forEach((k) => delete sessionStore[k]); }
    };

    globalThis.document = {
        readyState: 'loading',
        body: { classList: { add: () => {}, remove: () => {} } },
        getElementById: () => ({
            className: '',
            title: '',
            setAttribute: () => {},
            classList: { add: () => {}, remove: () => {} }
        }),
        addEventListener: () => {}
    };

    vi.stubGlobal('navigator', { onLine: true, userAgent: '' });
    vi.stubGlobal('window', {
        location: { hostname: 'localhost', href: 'http://localhost/', pathname: '/' },
        history: { replaceState: () => {} },
        addEventListener: () => {}
    });

    globalThis.getBasePath = () => '';
    globalThis.auth = {
        currentUser: null,
        onAuthStateChanged: () => {},
        setPersistence: () => Promise.resolve(),
        getRedirectResult: () => Promise.resolve(null)
    };
    globalThis.firebase = {
        auth: {
            GoogleAuthProvider: function GoogleAuthProvider() {},
            Auth: { Persistence: { LOCAL: 'local', SESSION: 'session' } }
        }
    };
    globalThis.stopCloudSync = () => {};
    globalThis.configureFirestoreRefs = () => {};
    globalThis.bootstrapApp = () => {};
    globalThis.hideAuthOverlay = () => {};
    globalThis.registerServiceWorker = () => {};
    globalThis.isEmailAllowedInConfig = () => true;
    globalThis.initTheme = () => {};
    globalThis.isMortgageLoan = () => false;
    globalThis.mergeCreditCardsById = (...lists) => {
        const map = new Map();
        lists.flat().forEach((card) => {
            if (card?.id) map.set(card.id, card);
        });
        return [...map.values()];
    };

    loadScript('js/constants.js');
    loadScript('js/auth-config.js');
    loadScript('js/loan-details.js');
    loadScript('js/portfolio.js');
    loadScript('js/state-limits.js');
    loadScript('js/state.js');
    loadScript('js/sync-queue.js');
    loadScript('js/auth.js');
});

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setFinanceStorageKey(null);
    clearPendingCloudSync();
    clearPreferRemoteFinanceState();
    runInContext(`
        appState = {
            transactions: [{ date: '2024-01-01', type: 'expense', amount: 99, mainCategory: 'Dom', subCategory: 'A' }],
            loans: [{ id: 'loan-main', name: 'Hipoteka' }],
            creditCards: [{ id: 'card-main', name: 'Visa' }],
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
            deletedAssetIds: []
        };
        cloudSyncUnlocked = true;
    `);
});

describe('izolacja kont — klucze localStorage', () => {
    it('backup i pending sync są per uid', () => {
        setFinanceStorageKey('uid-demo');
        expect(getLocalBackupStorageKey()).toBe('finanse_local_backup_uid-demo');
        expect(getPendingCloudSyncStorageKey()).toBe('finanse_pending_cloud_sync_uid-demo');

        setFinanceStorageKey('uid-main');
        expect(getLocalBackupStorageKey()).toBe('finanse_local_backup_uid-main');
        expect(getPendingCloudSyncStorageKey()).toBe('finanse_pending_cloud_sync_uid-main');
    });

    it('readStoredAppStateRaw czyta tylko aktywny klucz uid', () => {
        localStorage.setItem('app_finance_state_uid-main', JSON.stringify({
            transactions: [{ id: 'main-tx' }],
            loans: [{ id: 'loan-main' }]
        }));
        localStorage.setItem('app_finance_state_uid-demo', JSON.stringify({
            transactions: [{ id: 'demo-tx' }],
            loans: [{ id: 'loan-demo-hipoteka' }]
        }));

        setFinanceStorageKey('uid-demo');
        const demoRaw = readStoredAppStateRaw();
        expect(demoRaw.transactions[0].id).toBe('demo-tx');
        expect(demoRaw.loans[0].id).toBe('loan-demo-hipoteka');

        setFinanceStorageKey('uid-main');
        const mainRaw = readStoredAppStateRaw();
        expect(mainRaw.transactions[0].id).toBe('main-tx');
        expect(mainRaw.loans[0].id).toBe('loan-main');
    });
});

describe('izolacja kont — migracja legacy', () => {
    it('nie kopiuje legacy stanu do nowego uid gdy istnieją inne konta', () => {
        const legacy = JSON.stringify({ transactions: [{ id: 'legacy' }], loans: [] });
        localStorage.setItem('app_finance_state', legacy);
        localStorage.setItem('app_finance_state_uid-main', JSON.stringify({ transactions: [{ id: 'main' }], loans: [] }));

        migrateLocalStorageToUidKey('uid-demo');

        expect(localStorage.getItem('app_finance_state_uid-demo')).toBeNull();
        expect(localStorage.getItem('app_finance_state')).toBe(legacy);
    });

    it('nie kopiuje legacy do uid gdy właścicielem legacy jest inne konto', () => {
        const legacy = JSON.stringify({ transactions: [{ id: 'legacy' }], loans: [] });
        localStorage.setItem('app_finance_state', legacy);
        localStorage.setItem(LEGACY_STORAGE_OWNER_KEY, 'uid-main');

        migrateLocalStorageToUidKey('uid-demo');

        expect(localStorage.getItem('app_finance_state_uid-demo')).toBeNull();
    });

    it('kopiuje legacy tylko gdy brak innych kont i brak właściciela', () => {
        const legacy = JSON.stringify({ transactions: [{ id: 'legacy' }], loans: [] });
        localStorage.setItem('app_finance_state', legacy);

        migrateLocalStorageToUidKey('uid-first');

        expect(localStorage.getItem('app_finance_state_uid-first')).toBe(legacy);
        expect(localStorage.getItem(LEGACY_STORAGE_OWNER_KEY)).toBe('uid-first');
    });
});

describe('izolacja kont — przełączenie sesji', () => {
    it('resetAppStateForAccountSwitch czyści stan w pamięci', () => {
        resetAppStateForAccountSwitch();
        expect(appState.transactions).toEqual([]);
        expect(appState.loans).toEqual([]);
        expect(appState.creditCards).toEqual([]);
        expect(cloudSyncUnlocked).toBe(false);
    });

    it('mergeRemoteTransactions nie scala transakcji z innego konta w RAM', () => {
        setFinanceStorageKey('uid-demo');
        localStorage.setItem('app_finance_state_uid-demo', JSON.stringify({
            transactions: [{ amount: 10, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'A' }],
            loans: []
        }));

        const remote = {
            transactions: [{ amount: 20, type: 'expense', date: '2024-01-02', mainCategory: 'Dom', subCategory: 'B' }],
            loans: [{ id: 'loan-demo-hipoteka' }]
        };

        const merged = mergeRemoteTransactions(readStoredAppStateRaw(), remote);
        expect(merged).toHaveLength(2);
        expect(merged.some((tx) => tx.amount === 99)).toBe(false);
    });

    it('resumePendingCloudSync odrzuca pending z innego uid', async () => {
        setFinanceStorageKey('uid-main');
        currentAuthUser = { uid: 'uid-main' };
        localStorage.setItem('finanse_pending_cloud_sync_uid-main', JSON.stringify({
            at: Date.now(),
            uid: 'uid-demo'
        }));

        const ok = await resumePendingCloudSync({ force: true });
        expect(ok).toBe(false);
        expect(hasPendingCloudSync()).toBe(false);
    });
});

describe('izolacja kont — demo i chmura', () => {
    it('beginFinanceSessionForUid na demo czyści lokalny cache i preferuje chmurę', () => {
        setFinanceStorageKey(DEMO_ACCOUNT_UID);
        localStorage.setItem(getFinanceStorageKey(), JSON.stringify({
            transactions: [],
            loans: [{ id: 'loan-main-real', name: 'Moja hipoteka' }],
            creditCards: [],
            assets: [{ id: 'asset-real-ppk', type: 'retirement', name: 'PPK' }]
        }));

        beginFinanceSessionForUid(DEMO_ACCOUNT_UID);

        expect(shouldPreferRemoteFinanceState()).toBe(true);
        expect(localStorage.getItem(getFinanceStorageKey())).toBeNull();
    });

    it('syncFromRemoteData w trybie remote-authoritative ignoruje skażony localStorage', () => {
        setFinanceStorageKey(DEMO_ACCOUNT_UID);
        markPreferRemoteFinanceState();
        localStorage.setItem(getFinanceStorageKey(), JSON.stringify({
            transactions: [{ amount: 99, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'A' }],
            loans: [{ id: 'loan-main-real', name: 'Moja hipoteka' }],
            creditCards: [{ id: 'card-main', name: 'Visa' }],
            assets: [{ id: 'asset-real-ppk', type: 'retirement', name: 'PPK' }]
        }));

        const remote = {
            transactions: [{ amount: 10, type: 'expense', date: '2024-01-02', mainCategory: 'Dom', subCategory: 'B' }],
            loans: [{ id: 'loan-demo-hipoteka', name: 'Kredyt hipoteczny (demo)', totalAmount: 1, currentCapitalLeft: 1 }],
            creditCards: [{ id: 'card-demo-mbank', name: 'mBank Visa (demo)', limit: 1, currentBalance: 0 }],
            assets: [{ id: 'asset-demo-ppk', type: 'retirement', name: 'PPK — konto demo', amount: 1000 }]
        };

        syncFromRemoteData(remote);

        expect(appState.loans).toHaveLength(1);
        expect(appState.loans[0].id).toBe('loan-demo-hipoteka');
        expect(appState.assets).toHaveLength(1);
        expect(appState.assets[0].id).toBe('asset-demo-ppk');
        expect(shouldPreferRemoteFinanceState()).toBe(false);
    });

    it('stripForeignDemoFinancePayload usuwa obce kredyty i aktywa z zapisu demo', () => {
        setFinanceStorageKey(DEMO_ACCOUNT_UID);
        const payload = {
            transactions: [],
            loans: [
                { id: 'loan-demo-hipoteka', name: 'demo' },
                { id: 'loan-main-real', name: 'moja' }
            ],
            creditCards: [
                { id: 'card-demo-mbank', name: 'demo' },
                { id: 'card-main', name: 'moja' }
            ],
            assets: [
                { id: 'asset-demo-ppk', name: 'demo' },
                { id: 'asset-real', name: 'moja' }
            ]
        };
        const cleaned = stripForeignDemoFinancePayload(payload);
        expect(cleaned.loans).toHaveLength(1);
        expect(cleaned.creditCards).toHaveLength(1);
        expect(cleaned.assets).toHaveLength(1);
    });
});
