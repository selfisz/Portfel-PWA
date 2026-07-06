import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScriptsInOrder, runInContext } from './helpers/load.js';

let onSnapshotSuccess;
let onSnapshotError;
let unsubscribe;

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };

    const syncStatusEl = {
        className: 'offline',
        title: '',
        dataset: {},
        setAttribute: () => {},
        addEventListener: () => {}
    };

    globalThis.document = {
        getElementById: (id) => (id === 'sync-status' ? syncStatusEl : null),
        addEventListener: () => {},
        visibilityState: 'visible'
    };

    unsubscribe = vi.fn();
    globalThis.stateRef = {
        onSnapshot: (optionsOrSuccess, successOrError, errorMaybe) => {
            if (typeof optionsOrSuccess === 'function') {
                onSnapshotSuccess = optionsOrSuccess;
                onSnapshotError = successOrError;
            } else {
                onSnapshotSuccess = successOrError;
                onSnapshotError = errorMaybe;
            }
            return unsubscribe;
        },
        set: () => Promise.resolve()
    };

    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', {
        addEventListener: () => {},
        setTimeout: (...args) => setTimeout(...args),
        clearTimeout: (...args) => clearTimeout(...args)
    });

    globalThis.isUserSignedIn = () => true;
    globalThis.isAppOffline = () => false;
    globalThis.isOfflineSessionActive = () => false;
    globalThis.hasPendingCloudSync = () => false;
    globalThis.isCloudSyncBlockingRemoteApply = () => false;
    globalThis.resumePendingCloudSync = () => Promise.resolve(false);
    globalThis.retryCloudSyncNow = () => Promise.resolve(false);
    globalThis.cloudSyncRetryAttempt = 0;
    globalThis.clearCloudSyncRetryTimer = () => {};
    globalThis.showAppToast = () => {};
    globalThis.formatOfflineSyncSuccessMessage = (n) => `${n} tx`;
    globalThis.autoRecoverFromCloudBackupIfNeeded = () => Promise.resolve(false);
    globalThis.syncFromRemoteData = () => {};
    globalThis.saveState = () => {};

    loadScriptsInOrder([
        'js/constants.js',
        'js/portfolio.js',
        'js/state-limits.js',
        'js/state.js',
        'js/sync-queue.js',
        'js/offline.js',
        'js/sync-lifecycle.js'
    ]);

    runInContext(`
        appState = { transactions: [{ date: '2024-01-01', type: 'expense', amount: 10, mainCategory: 'Dom', subCategory: 'A' }], loans: [], creditCards: [], assets: [], cashMovements: [] };
        cloudSyncUnlocked = true;
    `);
});

beforeEach(() => {
    onSnapshotSuccess = null;
    onSnapshotError = null;
    unsubscribe.mockClear();
    document.getElementById('sync-status').className = 'offline';
});

describe('sync-lifecycle', () => {
    it('startCloudSnapshotSync subskrybuje onSnapshot', () => {
        startCloudSnapshotSync();
        expect(typeof onSnapshotSuccess).toBe('function');
        expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('stopCloudSync anuluje subskrypcję', () => {
        startCloudSnapshotSync();
        stopCloudSync();
        expect(unsubscribe).toHaveBeenCalled();
    });

    it('reconnectCloudSnapshotSync ponawia przy statusie offline', () => {
        startCloudSnapshotSync();
        stopCloudSync();
        unsubscribe.mockClear();
        reconnectCloudSnapshotSync();
        expect(typeof onSnapshotSuccess).toBe('function');
    });

    it('reconnectCloudSnapshotSync pomija gdy status online i aktywna subskrypcja', () => {
        startCloudSnapshotSync();
        document.getElementById('sync-status').className = 'online';
        unsubscribe.mockClear();
        reconnectCloudSnapshotSync();
        expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('stopCloudSync nie resetuje cloudAutoRecoverChecked', () => {
        runInContext(`appState = { transactions: [], loans: [], creditCards: [], assets: [], cashMovements: [] };`);
        globalThis.isDemoFinanceSession = () => false;
        globalThis.hasPendingCloudSync = () => false;
        const autoRecoverSpy = vi.fn(() => Promise.resolve(false));
        globalThis.autoRecoverFromCloudBackupIfNeeded = autoRecoverSpy;

        startCloudSnapshotSync();
        expect(autoRecoverSpy).toHaveBeenCalledTimes(1);

        stopCloudSync();
        startCloudSnapshotSync();
        expect(autoRecoverSpy).toHaveBeenCalledTimes(1);
    });
});
