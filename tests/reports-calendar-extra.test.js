/**
 * Dodatkowe testy reports-calendar.js (pure/semi-pure functions)
 * oraz ui.js (getBasePath, updateShowMoreButton, showModuleSplitAlert).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };

    const elements = {};
    function makeEl() {
        return {
            value: '', innerHTML: '', textContent: '', innerText: '',
            style: {}, checked: false, disabled: false, dataset: {},
            previousElementSibling: null, parentElement: null,
            classList: {
                _s: new Set(),
                add(c) { this._s.add(c); },
                remove(c) { this._s.delete(c); },
                toggle(c, f) {
                    if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
                    else { f ? this._s.add(c) : this._s.delete(c); }
                },
                contains(c) { return this._s.has(c); }
            },
            getAttribute: () => null,
            setAttribute: () => {},
            focus: () => {},
            click: () => {},
            insertAdjacentElement: () => {},
            addEventListener: () => {},
            appendChild: (child) => { this._children = this._children || []; this._children.push(child); }
        };
    }

    globalThis.document = {
        getElementById: (id) => {
            if (!elements[id]) elements[id] = makeEl();
            return elements[id];
        },
        querySelectorAll: () => ({ forEach: () => {} }),
        querySelector: () => null,
        createElement: (tag) => ({
            tagName: tag, value: '', innerHTML: '', textContent: '',
            style: {}, className: '', id: '', type: '',
            dataset: {}, disabled: false,
            previousElementSibling: null, parentElement: null,
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            appendChild: () => {},
            insertAdjacentElement: () => {},
            addEventListener: () => {}
        }),
        body: { style: {}, overflow: '' }
    };

    globalThis.window = {
        matchMedia: () => ({ matches: false, addEventListener: () => {} }),
        setTimeout: (fn, ms) => { fn(); }
    };
    globalThis.location = { pathname: '/Portfel-PWA/index.html' };

    globalThis.alert = () => {};
    globalThis.confirm = () => true;

    // Firebase / external mocks
    globalThis.stateRef = { set: () => Promise.resolve(), on: () => {}, off: () => {} };
    globalThis.cloudBackupRef = { get: () => Promise.resolve({ exists: false, data: () => ({}) }) };

    globalThis.saveState = () => {};
    globalThis.hapticFeedback = () => {};
    globalThis.refreshCurrentView = () => {};
    globalThis.renderDashboard = () => {};
    globalThis.renderReportsCalendar = () => {};
    globalThis.renderReportsYearHeatmap = () => {};
    globalThis.renderDepositsCalendarList = () => {};
    globalThis.switchView = () => {};
    globalThis.closeCalendarDay = () => {};
    globalThis.openCalendarDay = () => {};

    globalThis.escapeHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d || '';
    globalThis.renderCategoryIcon = (main) => `<span>${main}</span>`;
    globalThis.migrateRecentCategories = () => {};

    loadScript('js/constants.js');
    loadScript('js/loan-details.js');
    loadScript('js/portfolio.js');
    loadScript('js/state.js');
    loadScript('js/assets.js');
    loadScript('js/cash.js');
    loadScript('js/credit-cards.js');
    loadScript('js/loans.js');
    loadScript('js/reports-core.js');
    loadScript('js/reports-debt.js');
    loadScript('js/reports-calendar.js');
    loadScript('js/ui.js');

    runInContext(`
        function _getAppState()      { return appState; }
        function _setAppState(s)     { appState = s; }
    `);
});

beforeEach(() => {
    _setAppState({
        transactions: [],
        loans: [],
        creditCards: [],
        assets: [],
        cashMovements: [],
        assetSnapshots: [],
        assetValueHistory: [],
        categoryBudgets: {},
        creditCardMovements: []
    });
});

// ===========================================================================
// getLoanInstallmentDay
// ===========================================================================
describe('getLoanInstallmentDay', () => {
    it('zwraca dzień z nextInstallmentDue', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentDue: '2024-03-15' });
        expect(getLoanInstallmentDay(loan)).toBe(15);
    });

    it('zwraca 1 dla daty 2024-01-01', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentDue: '2024-01-01' });
        expect(getLoanInstallmentDay(loan)).toBe(1);
    });

    it('zwraca null gdy brak nextInstallmentDue', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentDue: '' });
        expect(getLoanInstallmentDay(loan)).toBeNull();
    });

    it('zwraca null dla null', () => {
        expect(getLoanInstallmentDay(null)).toBeNull();
    });

    it('zwraca null dla undefined', () => {
        expect(getLoanInstallmentDay(undefined)).toBeNull();
    });

    it('zwraca 28 dla ostatniego dnia feba', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentDue: '2023-02-28' });
        expect(getLoanInstallmentDay(loan)).toBe(28);
    });
});

// ===========================================================================
// getEffectiveDueDay
// ===========================================================================
describe('getEffectiveDueDay', () => {
    it('zwraca dzień < liczba dni w miesiącu bez zmian', () => {
        // Marzec ma 31 dni; dzień 15 zostaje 15
        expect(getEffectiveDueDay(15, 2024, 2)).toBe(15);
    });

    it('przycina do max dni w miesiącu dla lutego', () => {
        // Luty 2024 ma 29 dni (rok przestępny); dzień 31 zostaje 29
        expect(getEffectiveDueDay(31, 2024, 1)).toBe(29);
    });

    it('przycina do 30 dla listopada (monthIndex=10)', () => {
        // Listopad ma 30 dni; dzień 31 zostaje 30
        expect(getEffectiveDueDay(31, 2024, 10)).toBe(30);
    });

    it('nie zmienia dnia 28 w lutym (rok zwykły)', () => {
        // Luty 2023 ma 28 dni
        expect(getEffectiveDueDay(28, 2023, 1)).toBe(28);
    });

    it('przycina 31 do 28 w lutym zwykłym roku', () => {
        expect(getEffectiveDueDay(31, 2023, 1)).toBe(28);
    });
});

// ===========================================================================
// getLoanPayoffEndDate
// ===========================================================================
describe('getLoanPayoffEndDate', () => {
    it('zwraca null gdy capitalLeft = 0', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 0 });
        expect(getLoanPayoffEndDate(loan)).toBeNull();
    });

    it('zwraca details.endDate gdy podana', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, details: { endDate: '2030-12-01', remainingInstallments: 72 } });
        expect(getLoanPayoffEndDate(loan)).toBe('2030-12-01');
    });

    it('oblicza na podstawie remainingInstallments', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, details: { remainingInstallments: 12 } });
        const result = getLoanPayoffEndDate(loan);
        // Wynik to data ~12 miesięcy w przód
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(result) > new Date()).toBe(true);
    });

    it('oblicza na podstawie nextInstallmentAmount', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 12000, nextInstallmentAmount: 1000, nextInstallmentDue: '2024-02-15' });
        const result = getLoanPayoffEndDate(loan);
        // 12000/1000 = 12 rat → ~12 miesięcy
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('zwraca null gdy brak danych do oszacowania', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentAmount: 0 });
        expect(getLoanPayoffEndDate(loan)).toBeNull();
    });
});

// ===========================================================================
// getCardRepaymentHint
// ===========================================================================
describe('getCardRepaymentHint', () => {
    it('zwraca null gdy saldo = 0', () => {
        const card = normalizeCreditCard({ id: 'c1', name: 'Test', limit: 5000, currentBalance: 0 });
        expect(getCardRepaymentHint(card)).toBeNull();
    });

    it('zwraca null gdy brak historii spłat', () => {
        const card = normalizeCreditCard({ id: 'c1', name: 'Test', limit: 5000, currentBalance: 2000 });
        _setAppState({ ..._getAppState(), creditCardMovements: [] });
        expect(getCardRepaymentHint(card)).toBeNull();
    });

    it('zwraca hint z estimated=true gdy są dane', () => {
        const card = normalizeCreditCard({ id: 'c1', name: 'Test', limit: 5000, currentBalance: 2000 });
        // Daty muszą być w oknie ostatnich 3 miesięcy (getRecentCardRepaymentAverage)
        const now = new Date();
        const m0 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const m1 = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-15`;
        const prev2 = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const m2 = `${prev2.getFullYear()}-${String(prev2.getMonth() + 1).padStart(2, '0')}-15`;
        _setAppState({ ..._getAppState(), creditCardMovements: [
            { id: 'm1', cardId: 'c1', type: 'repayment', amount: 500, date: m2 },
            { id: 'm2', cardId: 'c1', type: 'repayment', amount: 600, date: m1 },
            { id: 'm3', cardId: 'c1', type: 'repayment', amount: 550, date: m0 }
        ]});
        const hint = getCardRepaymentHint(card);
        expect(hint).not.toBeNull();
        expect(hint.estimated).toBe(true);
        expect(hint.day).toBe(15);
        expect(hint.amount).toBeGreaterThan(0);
    });

    it('ignoruje ruchy innych kart', () => {
        const card = normalizeCreditCard({ id: 'c1', name: 'Test', limit: 5000, currentBalance: 2000 });
        _setAppState({ ..._getAppState(), creditCardMovements: [
            { id: 'm1', cardId: 'c2', type: 'repayment', amount: 1000, date: '2024-01-20' }
        ]});
        expect(getCardRepaymentHint(card)).toBeNull();
    });

    it('ignoruje ruchy inne niż repayment', () => {
        const card = normalizeCreditCard({ id: 'c1', name: 'Test', limit: 5000, currentBalance: 2000 });
        _setAppState({ ..._getAppState(), creditCardMovements: [
            { id: 'm1', cardId: 'c1', type: 'transfer', amount: 1000, date: '2024-01-20' }
        ]});
        expect(getCardRepaymentHint(card)).toBeNull();
    });
});

// ===========================================================================
// getScheduledDebtPaymentsOnDate
// ===========================================================================
describe('getScheduledDebtPaymentsOnDate', () => {
    it('zwraca pustą tablicę gdy brak kredytów i kart', () => {
        expect(getScheduledDebtPaymentsOnDate('2024-03-15')).toEqual([]);
    });

    it('zwraca ratę kredytu w odpowiednim dniu', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000,
              nextInstallmentAmount: 2500, nextInstallmentDue: '2024-01-15' }
        ]});
        const items = getScheduledDebtPaymentsOnDate('2024-03-15');
        expect(items).toHaveLength(1);
        expect(items[0].type).toBe('loan');
        expect(items[0].amount).toBe(2500);
    });

    it('nie zwraca raty w niewłaściwym dniu', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000,
              nextInstallmentAmount: 2500, nextInstallmentDue: '2024-01-15' }
        ]});
        const items = getScheduledDebtPaymentsOnDate('2024-03-20');
        expect(items).toHaveLength(0);
    });

    it('nie zwraca raty gdy kredyt spłacony (capitalLeft=0)', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 0,
              nextInstallmentAmount: 2500, nextInstallmentDue: '2024-01-15' }
        ]});
        const items = getScheduledDebtPaymentsOnDate('2024-03-15');
        expect(items).toHaveLength(0);
    });

    it('nie zwraca raty przed firstYm (przed nextInstallmentDue)', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000,
              nextInstallmentAmount: 2500, nextInstallmentDue: '2024-06-15' }
        ]});
        // Data przed nextInstallmentDue
        const items = getScheduledDebtPaymentsOnDate('2024-05-15');
        expect(items).toHaveLength(0);
    });

    it('przycina dzień 31 do max w miesiącu (luty)', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000,
              nextInstallmentAmount: 2500, nextInstallmentDue: '2024-01-31' }
        ]});
        // Luty 2024 ma 29 dni — rata przechodzi na 29
        const items = getScheduledDebtPaymentsOnDate('2024-02-29');
        expect(items).toHaveLength(1);
    });
});

// ===========================================================================
// buildDebtPeakSeries
// ===========================================================================
describe('buildDebtPeakSeries', () => {
    it('zwraca tablice o długości monthsAhead', () => {
        const result = buildDebtPeakSeries(6);
        expect(result.labels).toHaveLength(6);
        expect(result.totals).toHaveLength(6);
    });

    it('wszystkie totals = 0 gdy brak długów', () => {
        const result = buildDebtPeakSeries(3);
        expect(result.totals.every((v) => v === 0)).toBe(true);
        expect(result.peakValue).toBe(0);
    });

    it('zawiera peakIdx, peakValue, peakLabel', () => {
        const result = buildDebtPeakSeries(3);
        expect(result).toHaveProperty('peakIdx');
        expect(result).toHaveProperty('peakValue');
        expect(result).toHaveProperty('peakLabel');
    });

    it('wykrywa miesiąc z największą ratą', () => {
        const now = new Date();
        // Kredyt z ratą 2500 płatną 15 każdego miesiąca, zaczynając od teraz
        const nextDue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000,
              nextInstallmentAmount: 2500, nextInstallmentDue: nextDue }
        ]});
        const result = buildDebtPeakSeries(3);
        expect(result.peakValue).toBe(2500);
    });
});

// ===========================================================================
// buildDebtFreedomTimeline
// ===========================================================================
describe('buildDebtFreedomTimeline', () => {
    it('zwraca pustą tablicę gdy brak długów', () => {
        expect(buildDebtFreedomTimeline()).toEqual([]);
    });

    it('zawiera pozycję dla aktywnego kredytu', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000,
              nextInstallmentAmount: 2500, nextInstallmentDue: '2024-02-15' }
        ]});
        const items = buildDebtFreedomTimeline();
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].kind).toBe('loan');
    });

    it('pomija kredyt ze spłaconym kapitałem (capitalLeft=0)', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 0,
              nextInstallmentAmount: 0, archived: true }
        ]});
        const items = buildDebtFreedomTimeline();
        expect(items.length).toBe(0);
    });

    it('sortuje po endDate (wcześniejsza pierwsza)', () => {
        const nextDue1 = '2024-01-15';
        const nextDue2 = '2024-01-15';
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l-big', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000,
              nextInstallmentAmount: 2500, nextInstallmentDue: nextDue1 },
            { id: 'l-small', subCategory: 'Gotówkowy', totalAmount: 10000, currentCapitalLeft: 5000,
              nextInstallmentAmount: 500, nextInstallmentDue: nextDue2 }
        ]});
        const items = buildDebtFreedomTimeline();
        // Mniejszy kredyt powinien być spłacony szybciej
        if (items.length >= 2 && items[0].endDate && items[1].endDate) {
            expect(items[0].endDate <= items[1].endDate).toBe(true);
        }
    });
});

// ===========================================================================
// storeReportsMonthChartMeta + resolveMonthFromChartIndex
// ===========================================================================
describe('storeReportsMonthChartMeta + resolveMonthFromChartIndex', () => {
    it('storeReportsMonthChartMeta przechowuje metadane', () => {
        storeReportsMonthChartMeta('2024', ['Sty', 'Lut'], null, []);
        // resolveMonthFromChartIndex powinno działać na tych danych
        const result = resolveMonthFromChartIndex(0);
        expect(result).toEqual({ year: 2024, month: 0 });
    });

    it('resolveMonthFromChartIndex dla period=all zwraca rok/miesiąc', () => {
        storeReportsMonthChartMeta('all', [], null, []);
        const result = resolveMonthFromChartIndex(11);
        expect(result).toHaveProperty('year');
        expect(result).toHaveProperty('month');
    });

    it('resolveMonthFromChartIndex używa monthKeys gdy dostępne', () => {
        const keys = [{ year: 2024, month: 5 }];
        storeReportsMonthChartMeta('2024', [], null, keys);
        const result = resolveMonthFromChartIndex(0);
        expect(result).toEqual({ year: 2024, month: 5 });
    });

    it('resolveMonthFromChartIndex zwraca null dla mode=range', () => {
        storeReportsMonthChartMeta('all', [], { mode: 'range' }, []);
        // Dla period=all i ctx.mode='range' → null
        // Ale period=all bypasses ctx check, więc sprawdzamy 'custom' period
        storeReportsMonthChartMeta('custom', [], { mode: 'range' }, []);
        expect(resolveMonthFromChartIndex(0)).toBeNull();
    });

    it('resolveMonthFromChartIndex zwraca null dla nieznanego period', () => {
        storeReportsMonthChartMeta('invalid', [], null, []);
        expect(resolveMonthFromChartIndex(0)).toBeNull();
    });
});

// ===========================================================================
// ui.js — getBasePath
// ===========================================================================
describe('getBasePath', () => {
    it('zwraca ścieżkę do Portfel-PWA gdy URL zawiera repo name', () => {
        globalThis.location = { pathname: '/Portfel-PWA/index.html' };
        expect(getBasePath()).toBe('/Portfel-PWA');
    });

    it('zwraca ścieżkę z username gdy jest w URL', () => {
        globalThis.location = { pathname: '/user/Portfel-PWA/subpage' };
        expect(getBasePath()).toBe('/user/Portfel-PWA');
    });

    it('zwraca "" gdy brak Portfel-PWA w URL', () => {
        globalThis.location = { pathname: '/index.html' };
        expect(getBasePath()).toBe('');
    });

    it('zwraca "" dla root URL', () => {
        globalThis.location = { pathname: '/' };
        expect(getBasePath()).toBe('');
    });
});

// ===========================================================================
// ui.js — updateShowMoreButton
// ===========================================================================
describe('updateShowMoreButton', () => {
    function makeBtn() {
        return {
            _hidden: false,
            previousElementSibling: null,
            parentElement: null,
            classList: {
                _s: new Set(),
                add(c) { this._s.add(c); },
                remove(c) { this._s.delete(c); },
                toggle(c, f) {
                    if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
                    else { f ? this._s.add(c) : this._s.delete(c); }
                },
                contains(c) { return this._s.has(c); }
            },
            insertAdjacentElement: () => {}
        };
    }

    it('ukrywa przycisk gdy totalCount <= visibleCount', () => {
        const btn = makeBtn();
        const parent = { appendChild: () => {} };
        updateShowMoreButton(btn, 5, 10, parent, null);
        expect(btn.classList.contains('hidden')).toBe(true);
    });

    it('pokazuje przycisk gdy totalCount > visibleCount', () => {
        const btn = makeBtn();
        btn.classList.add('hidden');
        const parent = { appendChild: () => {} };
        updateShowMoreButton(btn, 20, 10, parent, null);
        expect(btn.classList.contains('hidden')).toBe(false);
    });

    it('nie rzuca błędu gdy btn=null', () => {
        expect(() => updateShowMoreButton(null, 10, 5, {}, null)).not.toThrow();
    });

    it('nie rzuca błędu gdy parent=null', () => {
        const btn = makeBtn();
        expect(() => updateShowMoreButton(btn, 10, 5, null, null)).not.toThrow();
    });
});

// ===========================================================================
// ui.js — dismissModuleSplitBanner + showModuleSplitAlert
// ===========================================================================
describe('dismissModuleSplitBanner', () => {
    it('zapisuje timestamp do localStorage', () => {
        localStorage.clear();
        dismissModuleSplitBanner();
        // Klucz jest zdefiniowany w constants.js jako MODULE_SPLIT_BANNER_KEY
        const val = localStorage.getItem(MODULE_SPLIT_BANNER_KEY);
        expect(val).toBeTruthy();
        expect(Number(val)).toBeGreaterThan(0);
    });

    it('ukrywa banner', () => {
        const banner = document.getElementById('module-split-banner');
        banner.classList.remove('hidden');
        dismissModuleSplitBanner();
        expect(banner.classList.contains('hidden')).toBe(true);
    });
});

describe('showModuleSplitAlert', () => {
    it('ustawia textContent elementów', () => {
        showModuleSplitAlert('js/test.js', 750);
        const linesEl = document.getElementById('module-split-lines');
        expect(linesEl.textContent).toBe('750');
    });

    it('ustawia threshold z constants', () => {
        showModuleSplitAlert('js/test.js', 750);
        const thresholdEl = document.getElementById('module-split-threshold');
        expect(thresholdEl.textContent).toBe(String(MODULE_SPLIT_LINE_THRESHOLD));
    });

    it('ustawia tekst bannera z nazwą pliku', () => {
        showModuleSplitAlert('js/reports-core.js', 900);
        const bannerText = document.getElementById('module-split-banner-text');
        expect(bannerText.textContent).toContain('js/reports-core.js');
        expect(bannerText.textContent).toContain('900');
    });

    it('usuwa hidden z notice', () => {
        const notice = document.getElementById('module-split-notice');
        notice.classList.add('hidden');
        showModuleSplitAlert('js/test.js', 750);
        expect(notice.classList.contains('hidden')).toBe(false);
    });
});
