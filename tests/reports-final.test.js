/**
 * Finalne testy pozostałych funkcji: getCategoryMonthlyTotals, getDebtPaymentsForBounds,
 * buildTrendEntries z reports-analysis.js + getTransactionsInRange.
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
    globalThis.document = {
        getElementById: () => null,
        querySelectorAll: () => ({ forEach: () => {} }),
        querySelector: () => null,
        createElement: () => ({ addEventListener: () => {}, appendChild: () => {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, style: {}, dataset: {} }),
        addEventListener: () => {},
        body: { style: {} }
    };
    globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    globalThis.alert = () => {};
    globalThis.confirm = () => true;
    globalThis.stateRef = { set: () => Promise.resolve(), on: () => {}, off: () => {} };
    globalThis.saveState = () => {};
    globalThis.hapticFeedback = () => {};
    globalThis.refreshCurrentView = () => {};

    globalThis.escapeHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d || '';
    globalThis.renderCategoryIcon = () => '';
    globalThis.Chart = class { constructor() {} destroy() {} };

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
    loadScript('js/reports-analysis.js');

    runInContext(`
        function _getAppState()  { return appState; }
        function _setAppState(s) { appState = s; }
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

// Pomocnicze — transakcja expense w bieżącym miesiącu
function txThisMonth(mainCategory, subCategory, amount) {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
    return { date, type: 'expense', mainCategory, subCategory, amount };
}
function txLastMonth(mainCategory, subCategory, amount) {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
    return { date, type: 'expense', mainCategory, subCategory, amount };
}
function txTwoMonthsAgo(mainCategory, subCategory, amount) {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
    return { date, type: 'expense', mainCategory, subCategory, amount };
}

// ===========================================================================
// getCategoryMonthlyTotals
// ===========================================================================
describe('getCategoryMonthlyTotals', () => {
    it('zwraca tablicę o długości monthsBack', () => {
        const result = getCategoryMonthlyTotals('Jedzenie', null, 'main', 3);
        expect(result).toHaveLength(3);
    });

    it('zwraca same zera gdy brak transakcji', () => {
        const result = getCategoryMonthlyTotals('Jedzenie', null, 'main', 3);
        expect(result.every((v) => v === 0)).toBe(true);
    });

    it('sumuje wydatki w bieżącym miesiącu', () => {
        _setAppState({ ..._getAppState(), transactions: [
            txThisMonth('Jedzenie', 'Biedronka', 200),
            txThisMonth('Jedzenie', 'Lidl', 150)
        ]});
        const result = getCategoryMonthlyTotals('Jedzenie', null, 'main', 3);
        // Ostatni element to bieżący miesiąc
        expect(result[result.length - 1]).toBe(350);
    });

    it('rozróżnia miesiące', () => {
        _setAppState({ ..._getAppState(), transactions: [
            txThisMonth('Jedzenie', 'Biedronka', 200),
            txLastMonth('Jedzenie', 'Biedronka', 100)
        ]});
        const result = getCategoryMonthlyTotals('Jedzenie', null, 'main', 3);
        expect(result[result.length - 1]).toBe(200); // bieżący
        expect(result[result.length - 2]).toBe(100); // poprzedni
    });

    it('ignoruje transakcje innych kategorii', () => {
        _setAppState({ ..._getAppState(), transactions: [
            txThisMonth('Transport', 'Paliwo', 300)
        ]});
        const result = getCategoryMonthlyTotals('Jedzenie', null, 'main', 3);
        expect(result.every((v) => v === 0)).toBe(true);
    });

    it('dla rankLevel=sub filtruje po subCategory', () => {
        _setAppState({ ..._getAppState(), transactions: [
            txThisMonth('Jedzenie', 'Biedronka', 200),
            txThisMonth('Jedzenie', 'Lidl', 150)
        ]});
        const result = getCategoryMonthlyTotals('Jedzenie', 'Biedronka', 'sub', 3);
        expect(result[result.length - 1]).toBe(200); // tylko Biedronka
    });

    it('dla rankLevel=sub ignoruje inne subkategorie', () => {
        _setAppState({ ..._getAppState(), transactions: [
            txThisMonth('Jedzenie', 'Lidl', 500)
        ]});
        const result = getCategoryMonthlyTotals('Jedzenie', 'Biedronka', 'sub', 3);
        expect(result[result.length - 1]).toBe(0);
    });

    it('używa 1 miesiąca gdy monthsBack=1', () => {
        const result = getCategoryMonthlyTotals('Jedzenie', null, 'main', 1);
        expect(result).toHaveLength(1);
    });
});

// ===========================================================================
// getDebtPaymentsForBounds
// ===========================================================================
describe('getDebtPaymentsForBounds', () => {
    it('zwraca { loanPayments:0, cardRepayments:0, total:0 } gdy brak danych', () => {
        const result = getDebtPaymentsForBounds('2024-01-01', '2024-12-31', []);
        expect(result).toEqual({ loanPayments: 0, cardRepayments: 0, total: 0 });
    });

    it('zlicza spłaty kredytów z listy transakcji', () => {
        const txs = [
            { date: '2024-03-15', type: 'expense', mainCategory: 'Długi', subCategory: 'Hipoteka', amount: 2500 },
            { date: '2024-03-15', type: 'expense', mainCategory: 'Długi', subCategory: 'Gotówkowy', amount: 800 }
        ];
        const result = getDebtPaymentsForBounds('2024-01-01', '2024-12-31', txs);
        expect(result.loanPayments).toBe(3300);
        expect(result.total).toBe(3300); // brak ruchów karty
    });

    it('nie zlicza transakcji income jako spłaty', () => {
        const txs = [
            { date: '2024-03-15', type: 'income', mainCategory: 'Długi', subCategory: 'Zwrot', amount: 1000 }
        ];
        const result = getDebtPaymentsForBounds('2024-01-01', '2024-12-31', txs);
        expect(result.loanPayments).toBe(0);
    });

    it('ignoruje regularne wydatki (nie pasujące do długów)', () => {
        const txs = [
            { date: '2024-03-15', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 200 }
        ];
        const result = getDebtPaymentsForBounds('2024-01-01', '2024-12-31', txs);
        expect(result.loanPayments).toBe(0);
    });

    it('sumuje zwroty kart kredytowych z appState.creditCardMovements', () => {
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
        _setAppState({ ..._getAppState(), creditCardMovements: [
            { id: 'm1', cardId: 'c1', type: 'repayment', amount: 1500, date }
        ]});
        const yearStart = `${now.getFullYear()}-01-01`;
        const yearEnd = `${now.getFullYear()}-12-31`;
        const result = getDebtPaymentsForBounds(yearStart, yearEnd, []);
        expect(result.cardRepayments).toBe(1500);
        expect(result.total).toBe(1500);
    });
});

// ===========================================================================
// buildTrendEntries
// ===========================================================================
describe('buildTrendEntries', () => {
    it('zwraca pustą tablicę gdy brak transakcji', () => {
        expect(buildTrendEntries('main')).toEqual([]);
    });

    it('dla rankLevel=main zwraca unikalne kategorie główne', () => {
        _setAppState({ ..._getAppState(), transactions: [
            txThisMonth('Jedzenie', 'Biedronka', 100),
            txThisMonth('Jedzenie', 'Lidl', 50),
            txThisMonth('Transport', 'Paliwo', 200)
        ]});
        const entries = buildTrendEntries('main');
        expect(entries).toHaveLength(2);
        const cats = entries.map((e) => e.mainCategory).sort();
        expect(cats).toEqual(['Jedzenie', 'Transport']);
    });

    it('dla rankLevel=sub zwraca unikalne pary main+sub', () => {
        _setAppState({ ..._getAppState(), transactions: [
            txThisMonth('Jedzenie', 'Biedronka', 100),
            txThisMonth('Jedzenie', 'Biedronka', 50), // duplikat
            txThisMonth('Jedzenie', 'Lidl', 200)
        ]});
        const entries = buildTrendEntries('sub');
        expect(entries).toHaveLength(2);
    });

    it('ignoruje przychody', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-10', type: 'income', mainCategory: 'Wynagrodzenie', subCategory: 'Pensja', amount: 5000 }
        ]});
        expect(buildTrendEntries('main')).toEqual([]);
    });

    it('entries zawierają { mainCategory, subCategory, label }', () => {
        _setAppState({ ..._getAppState(), transactions: [
            txThisMonth('Jedzenie', 'Biedronka', 100)
        ]});
        const entries = buildTrendEntries('main');
        expect(entries[0]).toHaveProperty('mainCategory');
        expect(entries[0]).toHaveProperty('subCategory');
        expect(entries[0]).toHaveProperty('label');
    });
});

// ===========================================================================
// getTransactionsInRange
// ===========================================================================
describe('getTransactionsInRange', () => {
    it('zwraca pustą tablicę gdy brak transakcji', () => {
        expect(getTransactionsInRange('2024-01-01', '2024-12-31')).toEqual([]);
    });

    it('zwraca transakcje w zakresie dat', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-03-10', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'A', amount: 100 },
            { date: '2024-07-15', type: 'income', mainCategory: 'Pensja', subCategory: 'B', amount: 5000 },
            { date: '2023-12-31', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'A', amount: 50 }
        ]});
        const result = getTransactionsInRange('2024-01-01', '2024-12-31');
        expect(result).toHaveLength(2);
        expect(result.every((t) => t.date >= '2024-01-01' && t.date <= '2024-12-31')).toBe(true);
    });

    it('zwraca transakcje na granicy zakresu (inclusive)', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'A', subCategory: 'B', amount: 10 },
            { date: '2024-12-31', type: 'expense', mainCategory: 'A', subCategory: 'B', amount: 20 }
        ]});
        const result = getTransactionsInRange('2024-01-01', '2024-12-31');
        expect(result).toHaveLength(2);
    });

    it('wyklucza transakcje poza zakresem', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2023-12-31', type: 'expense', mainCategory: 'A', subCategory: 'B', amount: 100 },
            { date: '2025-01-01', type: 'expense', mainCategory: 'A', subCategory: 'B', amount: 100 }
        ]});
        const result = getTransactionsInRange('2024-01-01', '2024-12-31');
        expect(result).toHaveLength(0);
    });
});
