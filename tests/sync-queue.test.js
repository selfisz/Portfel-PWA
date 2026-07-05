import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

let stateRefSet;

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };

    const syncStatusEl = {
        className: '',
        title: '',
        dataset: {},
        setAttribute: () => {},
        addEventListener: () => {}
    };

    globalThis.document = {
        getElementById: (id) => (id === 'sync-status' ? syncStatusEl : {
            className: '',
            title: '',
            dataset: {},
            setAttribute: () => {},
            addEventListener: () => {}
        }),
        addEventListener: () => {}
    };

    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', {
        addEventListener: () => {},
        setTimeout: (...args) => setTimeout(...args),
        clearTimeout: (...args) => clearTimeout(...args)
    });

    stateRefSet = vi.fn(() => Promise.resolve());
    globalThis.stateRef = { set: (...args) => stateRefSet(...args) };
    globalThis.cloudSyncUnlocked = true;
    globalThis.showAppToast = () => {};

    loadScript('js/constants.js');
    loadScript('js/portfolio.js');
    loadScript('js/state-limits.js');
    loadScript('js/state.js');
    loadScript('js/sync-queue.js');

    runInContext(`
        appState = { transactions: [{ date: '2024-01-01', type: 'expense', amount: 10, mainCategory: 'Dom', subCategory: 'A' }], loans: [], creditCards: [], assets: [], cashMovements: [] };
        cloudSyncUnlocked = true;
    `);
});

beforeEach(() => {
    localStorage.clear();
    clearCloudSyncRetryTimer();
    stateRefSet.mockReset();
    stateRefSet.mockImplementation(() => Promise.resolve());
    navigator.onLine = true;
    runInContext('cloudSyncUnlocked = true;');
});

afterEach(() => {
    vi.useRealTimers();
    clearCloudSyncRetryTimer();
});

describe('sync-queue', () => {
    it('flushCloudSync czyści flagę pending po sukcesie', async () => {
        markPendingCloudSync();
        const payload = getPersistedState(appState);
        await flushCloudSync(payload, { forceCloud: true });
        expect(hasPendingCloudSync()).toBe(false);
        expect(document.getElementById('sync-status').className).toBe('online');
    });

    it('flushCloudSync ustawia pending i planuje retry po błędzie', async () => {
        vi.useFakeTimers();
        stateRefSet.mockImplementation(() => Promise.reject(new Error('network')));
        const payload = getPersistedState(appState);
        const ok = await flushCloudSync(payload, { forceCloud: true });
        expect(ok).toBe(false);
        expect(hasPendingCloudSync()).toBe(true);
        expect(document.getElementById('sync-status').className).toBe('pending');
        stateRefSet.mockImplementation(() => Promise.resolve());
        await vi.advanceTimersByTimeAsync(5000);
        expect(stateRefSet.mock.calls.length).toBeGreaterThan(1);
    });

    it('resumePendingCloudSync ponawia zapis po powrocie online', async () => {
        markPendingCloudSync();
        stateRefSet.mockImplementation(() => Promise.resolve());
        const ok = await resumePendingCloudSync({ force: true });
        expect(ok).toBe(true);
        expect(stateRefSet).toHaveBeenCalled();
        expect(hasPendingCloudSync()).toBe(false);
    });

    it('resumePendingCloudSync używa zapamiętanego payloadu z regułami', async () => {
        markPendingCloudSync();
        const payload = {
            ...getPersistedState(appState),
            categoryRules: [{ id: 'rule_a', pattern: 'biedronka', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy', priority: 0 }]
        };
        stashPendingCloudSyncPayload(payload);
        appState.categoryRules = [];
        stateRefSet.mockImplementation(() => Promise.resolve());
        const ok = await resumePendingCloudSync({ force: true });
        expect(ok).toBe(true);
        expect(stateRefSet.mock.calls[0][0].categoryRules).toHaveLength(1);
    });

    it('sanitizeFirestorePayload usuwa undefined', () => {
        const cleaned = sanitizeFirestorePayload({ a: 1, b: undefined, c: { d: undefined, e: 2 } });
        expect(cleaned).toEqual({ a: 1, c: { e: 2 } });
    });

    it('canPushPayloadToCloud blokuje zbyt duży payload', () => {
        const huge = {
            transactions: Array.from({ length: 100 }, (_, i) => ({
                date: '2024-01-01',
                type: 'expense',
                amount: 10 + i,
                mainCategory: 'Dom',
                subCategory: 'X',
                note: 'x'.repeat(12000)
            })),
            loans: []
        };
        expect(canPushPayloadToCloud(huge, { forceCloud: true })).toBe(false);
    });
});
