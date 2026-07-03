import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
        key: (i) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; }
    };

    globalThis.document = {
        getElementById: () => ({
            classList: { add: () => {}, remove: () => {} }
        })
    };

    vi.stubGlobal('navigator', { onLine: true });

    loadScript('js/constants.js');
    loadScript('js/offline.js');
});

beforeEach(() => {
    localStorage.clear();
    clearOfflineSession();
    navigator.onLine = true;
});

describe('offline helpers', () => {
    it('hasLocalFinanceData wykrywa zapis per uid', () => {
        localStorage.setItem('app_finance_state_abc', JSON.stringify({ transactions: [{ id: '1' }] }));
        expect(hasLocalFinanceData()).toBe(true);
        expect(findStoredFinanceUid()).toBe('abc');
    });

    it('findStoredFinanceUid wybiera większy zbiór transakcji', () => {
        localStorage.setItem('app_finance_state_a', JSON.stringify({ transactions: [{ id: '1' }] }));
        localStorage.setItem('app_finance_state_b', JSON.stringify({ transactions: [{ id: '1' }, { id: '2' }] }));
        expect(findStoredFinanceUid()).toBe('b');
    });

    it('isAppOffline reaguje na navigator.onLine', () => {
        navigator.onLine = false;
        expect(isAppOffline()).toBe(true);
    });

    it('formatOfflineSyncSuccessMessage odmienia transakcje', () => {
        expect(formatOfflineSyncSuccessMessage(1)).toContain('1 transakcja');
        expect(formatOfflineSyncSuccessMessage(3)).toContain('3 transakcje');
        expect(formatOfflineSyncSuccessMessage(5)).toContain('5 transakcji');
    });
});
