import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.localStorage = {
        _data: {},
        getItem(key) { return this._data[key] ?? null; },
        setItem(key, value) { this._data[key] = String(value); },
        removeItem(key) { delete this._data[key]; },
        clear() { this._data = {}; }
    };
    globalThis.sessionStorage = {
        _data: {},
        getItem(key) { return this._data[key] ?? null; },
        setItem(key, value) { this._data[key] = String(value); },
        removeItem(key) { delete this._data[key]; },
        clear() { this._data = {}; }
    };
    const surplusInput = { value: '300', dataset: { touched: '1', periodKey: 'old' } };
    const searchInput = { value: 'kawa' };
    globalThis.document = {
        getElementById: (id) => {
            if (id === 'dashboard-period-select') return { value: 'next-month' };
            if (id === 'db-search') return searchInput;
            if (id === 'reports-surplus-input') return surplusInput;
            return null;
        }
    };
    globalThis.resetDashboardPeriod = () => { globalThis._dashboardReset = true; };
    globalThis.resetReportsPeriod = () => { globalThis._reportsReset = true; };
    globalThis.showAppToast = () => {};
    globalThis.APP_LOCK_IDLE_MS = 5 * 60 * 1000;
    globalThis.getAppLockLastActivityTs = () => 0;
    loadScript('js/ui-idle-reset.js');
    loadScript('js/app-lock.js');
});

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    globalThis._dashboardReset = false;
    globalThis._reportsReset = false;
    localStorage.setItem('analysis_period_mode', 'year');
    localStorage.setItem('analysis_compare_preset', 'yoy');
});

describe('resetEphemeralUiState', () => {
    it('przywraca domyślny okres i czyści symulacje', () => {
        resetEphemeralUiState({ silent: true });
        expect(globalThis._dashboardReset).toBe(true);
        expect(globalThis._reportsReset).toBe(true);
        expect(localStorage.getItem('analysis_period_mode')).toBeNull();
        expect(localStorage.getItem('analysis_compare_preset')).toBeNull();
        const surplus = document.getElementById('reports-surplus-input');
        expect(surplus.value).toBe('');
        expect(surplus.dataset.touched).toBeUndefined();
        expect(document.getElementById('db-search').value).toBe('');
    });
});

describe('shouldRunEphemeralIdleReset', () => {
    it('nie resetuje bez znacznika aktywności', () => {
        expect(shouldRunEphemeralIdleReset()).toBe(false);
    });

    it('resetuje po 5 minutach bezczynności', () => {
        sessionStorage.setItem(APP_LOCK_LAST_ACTIVITY_KEY, String(Date.now() - APP_LOCK_IDLE_MS - 500));
        expect(shouldRunEphemeralIdleReset()).toBe(true);
    });
});
