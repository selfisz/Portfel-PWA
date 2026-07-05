import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.getFinanceStorageKey = () => 'app_finance_state_test_uid';
    globalThis.getUserAuthEmail = () => 'test@example.com';
    globalThis.getCurrentAuthUser = () => ({ uid: 'test_uid' });
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
    loadScript('js/app-lock.js');
});

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});

describe('app lock — ustawienia', () => {
    it('wykrywa wyłączoną blokadę', () => {
        expect(isAppLockEnabled()).toBe(false);
        expect(isAppLockPinEnabled()).toBe(false);
        expect(isAppLockBiometricEnabled()).toBe(false);
    });

    it('włącza PIN i biometrię niezależnie', () => {
        writeAppLockFlag(APP_LOCK_PIN_ENABLED_KEY, true);
        expect(isAppLockPinEnabled()).toBe(true);
        expect(isAppLockEnabled()).toBe(true);

        writeAppLockFlag(APP_LOCK_BIO_ENABLED_KEY, true);
        expect(isAppLockBiometricEnabled()).toBe(true);
        expect(isAppLockEnabled()).toBe(true);
    });
});

describe('app lock — PIN hash', () => {
    it('zapisuje i weryfikuje PIN', async () => {
        await storeAppLockPin('1234');
        expect(hasStoredAppLockPin()).toBe(true);
        expect(await verifyAppLockPin('1234')).toBe(true);
        expect(await verifyAppLockPin('9999')).toBe(false);
    });
});

describe('app lock — quick add', () => {
    it('domyślnie włącza szybki wpis', () => {
        expect(isAppLockQuickAddEnabled()).toBe(true);
    });

    it('blokuje widoki poza dodawaniem w trybie ograniczonym', () => {
        appLockRestricted = true;
        expect(canAccessAppLockView('add')).toBe(true);
        expect(canAccessAppLockView('dashboard')).toBe(false);
        appLockRestricted = false;
    });
});

describe('app lock — bezczynność', () => {
    it('nie blokuje tuż po odblokowaniu', () => {
        markAppLockSessionUnlocked();
        expect(shouldLockDueToIdle()).toBe(false);
    });

    it('blokuje po 5 minutach bezczynności', () => {
        markAppLockSessionUnlocked();
        sessionStorage.setItem(APP_LOCK_LAST_ACTIVITY_KEY, String(Date.now() - APP_LOCK_IDLE_MS - 1000));
        expect(shouldLockDueToIdle()).toBe(true);
    });

    it('blokuje bez aktywnej sesji', () => {
        touchAppLockActivity();
        expect(shouldLockDueToIdle()).toBe(true);
    });
});
