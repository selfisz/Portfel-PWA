/**
 * Dodatkowe testy czystych/semi-czystych funkcji reports-debt.js i reports-assets.js.
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
        body: { style: {} }
    };
    globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    globalThis.alert = () => {};
    globalThis.confirm = () => true;
    globalThis.stateRef = { set: () => Promise.resolve(), on: () => {}, off: () => {} };
    globalThis.saveState = () => {};
    globalThis.hapticFeedback = () => {};
    globalThis.refreshCurrentView = () => {};
    globalThis.renderDashboard = () => {};

    globalThis.escapeHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d || '';
    globalThis.renderCategoryIcon = (main) => `<span>${main}</span>`;

    // Chart.js mock (renderReportsDebt* uses it but we skip those tests)
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
    loadScript('js/reports-assets.js');

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

// Pomocniczy ctx
function makeCtx(txs = [], overrides = {}) {
    return { periodTx: txs, mode: 'all', period: 'all', ...overrides };
}

// ===========================================================================
// getPeriodBoundsFromCtx
// ===========================================================================
describe('getPeriodBoundsFromCtx', () => {
    it('zwraca rangeStart/End gdy podane', () => {
        const ctx = makeCtx([], { rangeStart: '2024-01-01', rangeEnd: '2024-06-30' });
        expect(getPeriodBoundsFromCtx(ctx)).toEqual({ start: '2024-01-01', end: '2024-06-30' });
    });

    it('zwraca rok gdy mode=year i period != all', () => {
        const ctx = makeCtx([], { mode: 'year', period: '2023' });
        expect(getPeriodBoundsFromCtx(ctx)).toEqual({ start: '2023-01-01', end: '2023-12-31' });
    });

    it('zwraca bieżący rok gdy brak transakcji', () => {
        const ctx = makeCtx([]);
        const { start, end } = getPeriodBoundsFromCtx(ctx);
        const yr = new Date().getFullYear();
        expect(start).toBe(`${yr}-01-01`);
        expect(end).toBe(`${yr}-12-31`);
    });

    it('wyznacza zakres z dat transakcji', () => {
        const ctx = makeCtx([
            { date: '2024-03-10', type: 'expense', amount: 100 },
            { date: '2024-01-05', type: 'income', amount: 500 },
            { date: '2024-11-20', type: 'expense', amount: 200 }
        ]);
        const { start, end } = getPeriodBoundsFromCtx(ctx);
        expect(start).toBe('2024-01-05');
        expect(end).toBe('2024-11-20');
    });
});

// ===========================================================================
// monthKeyToDateRange
// ===========================================================================
describe('monthKeyToDateRange', () => {
    it('dla klucza miesięcznego (bez day) zwraca pierwszy i ostatni dzień', () => {
        const range = monthKeyToDateRange({ year: 2024, month: 0 });
        expect(range.start).toBe('2024-01-01');
        expect(range.end).toBe('2024-01-31');
    });

    it('dla klucza dziennego (z day) zwraca pojedynczą datę', () => {
        const range = monthKeyToDateRange({ year: 2024, month: 5, day: 15 });
        expect(range.start).toBe('2024-06-15');
        expect(range.end).toBe('2024-06-15');
    });

    it('obsługuje grudzień poprawnie (12 miesięcy)', () => {
        const range = monthKeyToDateRange({ year: 2024, month: 11 });
        expect(range.start).toBe('2024-12-01');
        expect(range.end).toBe('2024-12-31');
    });

    it('obsługuje luty roku przestępnego', () => {
        const range = monthKeyToDateRange({ year: 2024, month: 1 });
        expect(range.start).toBe('2024-02-01');
        expect(range.end).toBe('2024-02-29');
    });
});

// ===========================================================================
// classifyLoanPaymentAmount
// ===========================================================================
describe('classifyLoanPaymentAmount', () => {
    it('zwraca całość jako regular gdy brak installmentu', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentAmount: 0 });
        expect(classifyLoanPaymentAmount(loan, 2000)).toEqual({ regular: 2000, over: 0 });
    });

    it('zwraca regular=amount gdy amount <= inst * 1.05', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentAmount: 2000 });
        // 2000 * 1.05 = 2100; płatność 2050 <= 2100
        expect(classifyLoanPaymentAmount(loan, 2050)).toEqual({ regular: 2050, over: 0 });
    });

    it('rozdziela na regular + over gdy amount > inst * 1.05', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentAmount: 2000 });
        // 2000 * 1.05 = 2100; płatność 3000 > 2100
        const result = classifyLoanPaymentAmount(loan, 3000);
        expect(result.regular).toBe(2000);
        expect(result.over).toBe(1000);
    });

    it('granica 5% tolerance — dokładnie inst*1.05', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentAmount: 1000 });
        // 1000 * 1.05 = 1050; płatność 1050 <= 1050
        expect(classifyLoanPaymentAmount(loan, 1050)).toEqual({ regular: 1050, over: 0 });
    });

    it('każda kwota to regular gdy installment = 0', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentAmount: 0 });
        expect(classifyLoanPaymentAmount(loan, 9999)).toEqual({ regular: 9999, over: 0 });
    });
});

// ===========================================================================
// estimateAnnualInterest
// ===========================================================================
describe('estimateAnnualInterest', () => {
    it('zwraca capital * rate/100', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 100000, interestRate: 8 });
        expect(estimateAnnualInterest(loan)).toBeCloseTo(8000, 1);
    });

    it('zwraca 0 gdy brak kapitału', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 0, interestRate: 8 });
        expect(estimateAnnualInterest(loan)).toBe(0);
    });

    it('zwraca 0 gdy brak oprocentowania', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, interestRate: 0 });
        expect(estimateAnnualInterest(loan)).toBe(0);
    });

    it('obsługuje ułamkowe oprocentowanie', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, interestRate: 7.5 });
        expect(estimateAnnualInterest(loan)).toBeCloseTo(3750, 1);
    });
});

// ===========================================================================
// simulateOverpaymentMonths
// ===========================================================================
describe('simulateOverpaymentMonths', () => {
    it('zwraca null gdy brak kapitału', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 0, nextInstallmentAmount: 2000 });
        expect(simulateOverpaymentMonths(loan, 500)).toBeNull();
    });

    it('zwraca null gdy brak raty', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentAmount: 0 });
        expect(simulateOverpaymentMonths(loan, 500)).toBeNull();
    });

    it('zwraca baseMonths = ceil(capital/installment) bez remainingInstallments', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 12000, nextInstallmentAmount: 1000 });
        const result = simulateOverpaymentMonths(loan, 0);
        expect(result.baseMonths).toBe(12);
    });

    it('używa remainingInstallments z details gdy dostępne', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 60000, nextInstallmentAmount: 1000, details: { remainingInstallments: 60 } });
        const result = simulateOverpaymentMonths(loan, 0);
        expect(result.baseMonths).toBe(60);
    });

    it('nadpłata skraca czas spłaty', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 12000, nextInstallmentAmount: 1000 });
        const result = simulateOverpaymentMonths(loan, 1000);
        expect(result.newMonths).toBeLessThan(result.baseMonths);
        expect(result.savedMonths).toBeGreaterThan(0);
    });

    it('extra=0 nie zmienia czasu spłaty', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 12000, nextInstallmentAmount: 1000 });
        const result = simulateOverpaymentMonths(loan, 0);
        expect(result.savedMonths).toBe(0);
        expect(result.newMonths).toBe(result.baseMonths);
    });

    it('ujemne extra jest traktowane jako 0', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 12000, nextInstallmentAmount: 1000 });
        const result0 = simulateOverpaymentMonths(loan, 0);
        const resultNeg = simulateOverpaymentMonths(loan, -500);
        expect(resultNeg.savedMonths).toBe(result0.savedMonths);
    });

    it('zwraca annualInterestSaved > 0 gdy rata > 0 i jest oprocentowanie', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 12000, nextInstallmentAmount: 1000, interestRate: 8 });
        const result = simulateOverpaymentMonths(loan, 500);
        expect(result.annualInterestSaved).toBeGreaterThanOrEqual(0);
    });
});

// ===========================================================================
// estimateLoanPayoff
// ===========================================================================
describe('estimateLoanPayoff', () => {
    it('zwraca "Spłacony" gdy capital = 0', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 0 });
        expect(estimateLoanPayoff(loan).label).toBe('Spłacony');
    });

    it('zwraca details.endDate jako label', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, details: { endDate: '2030-12-01' } });
        const result = estimateLoanPayoff(loan);
        expect(result.label).toBe('2030-12-01');
        expect(result.detail).toBe('termin z umowy');
    });

    it('szacuje z remainingInstallments', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, details: { remainingInstallments: 48 } });
        const result = estimateLoanPayoff(loan);
        expect(result.label).toBe('~48 mies.');
    });

    it('szacuje z nextInstallmentAmount', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 12000, nextInstallmentAmount: 1000 });
        const result = estimateLoanPayoff(loan);
        expect(result.label).toBe('~12 mies.');
    });

    it('zwraca "—" gdy brak danych o racie', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentAmount: 0 });
        expect(estimateLoanPayoff(loan).label).toBe('—');
    });
});

// ===========================================================================
// estimateCardPayoff
// ===========================================================================
describe('estimateCardPayoff', () => {
    it('zwraca "Spłacona" gdy saldo = 0', () => {
        const card = normalizeCreditCard({ id: 'c1', name: 'Test', limit: 5000, currentBalance: 0 });
        expect(estimateCardPayoff(card).label).toBe('Spłacona');
    });

    it('zwraca "—" gdy brak historii spłat', () => {
        const card = normalizeCreditCard({ id: 'c1', name: 'Test', limit: 5000, currentBalance: 2000 });
        _setAppState({ ..._getAppState(), creditCardMovements: [] });
        expect(estimateCardPayoff(card).label).toBe('—');
    });
});

// ===========================================================================
// analyzeLoanPaymentsInPeriod
// ===========================================================================
describe('analyzeLoanPaymentsInPeriod', () => {
    it('zwraca { regular:0, over:0, total:0 } gdy brak transakcji', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000, nextInstallmentAmount: 2500 }
        ]});
        const result = analyzeLoanPaymentsInPeriod(makeCtx([]));
        expect(result).toEqual({ regular: 0, over: 0, total: 0 });
    });

    it('klasyfikuje zwykłą spłatę jako regular', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000, nextInstallmentAmount: 2500 }
        ]});
        const ctx = makeCtx([
            { date: '2024-01-15', type: 'expense', mainCategory: 'Długi', subCategory: 'Hipoteka', amount: 2500 }
        ]);
        const result = analyzeLoanPaymentsInPeriod(ctx);
        expect(result.regular).toBe(2500);
        expect(result.over).toBe(0);
    });

    it('transakcja z notatką "nadpłata" trafia do over', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000, nextInstallmentAmount: 2500 }
        ]});
        const ctx = makeCtx([
            { date: '2024-01-15', type: 'expense', mainCategory: 'Długi', subCategory: 'Hipoteka', amount: 5000, note: 'nadpłata' }
        ]);
        const result = analyzeLoanPaymentsInPeriod(ctx);
        expect(result.over).toBe(5000);
        expect(result.regular).toBe(0);
    });

    it('duże kwoty > inst*1.05 rozdzielane na regular+over', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000, nextInstallmentAmount: 2000 }
        ]});
        // 2000 * 1.05 = 2100; płatność 3000 > 2100
        const ctx = makeCtx([
            { date: '2024-01-15', type: 'expense', mainCategory: 'Długi', subCategory: 'Hipoteka', amount: 3000 }
        ]);
        const result = analyzeLoanPaymentsInPeriod(ctx);
        expect(result.regular).toBe(2000);
        expect(result.over).toBe(1000);
        expect(result.total).toBe(3000);
    });
});

// ===========================================================================
// buildDebtSplitData
// ===========================================================================
describe('buildDebtSplitData', () => {
    it('zwraca pustą tablicę gdy brak kredytów i transakcji', () => {
        const result = buildDebtSplitData(makeCtx([]));
        expect(result).toEqual([]);
    });

    it('zwraca slice dla kredytu ze spłatami', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000 }
        ]});
        const ctx = makeCtx([
            { date: '2024-01-15', type: 'expense', mainCategory: 'Długi', subCategory: 'Hipoteka', amount: 2500 }
        ]);
        const result = buildDebtSplitData(ctx);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].amount).toBe(2500);
    });

    it('sortuje od największej kwoty', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000 },
            { id: 'l2', subCategory: 'Gotówkowy', totalAmount: 10000, currentCapitalLeft: 5000 }
        ]});
        const ctx = makeCtx([
            { date: '2024-01-15', type: 'expense', mainCategory: 'Długi', subCategory: 'Hipoteka', amount: 2500 },
            { date: '2024-01-15', type: 'expense', mainCategory: 'Długi', subCategory: 'Gotówkowy', amount: 500 }
        ]);
        const result = buildDebtSplitData(ctx);
        expect(result[0].amount >= result[result.length - 1].amount).toBe(true);
    });
});

// ===========================================================================
// getPeriodDayCount
// ===========================================================================
describe('getPeriodDayCount', () => {
    it('zwraca 30 gdy daty nieprawidłowe', () => {
        const ctx = makeCtx([], { rangeStart: 'invalid', rangeEnd: 'invalid' });
        expect(getPeriodDayCount(ctx)).toBe(30);
    });

    it('zwraca poprawną liczbę dni między datami', () => {
        const ctx = makeCtx([], { rangeStart: '2024-01-01', rangeEnd: '2024-01-31' });
        expect(getPeriodDayCount(ctx)).toBe(31);
    });

    it('zwraca min 1 dzień', () => {
        const ctx = makeCtx([], { rangeStart: '2024-06-15', rangeEnd: '2024-06-15' });
        expect(getPeriodDayCount(ctx)).toBe(1);
    });

    it('liczy cały rok', () => {
        const ctx = makeCtx([], { rangeStart: '2024-01-01', rangeEnd: '2024-12-31' });
        expect(getPeriodDayCount(ctx)).toBe(366); // 2024 przestępny
    });
});

// ===========================================================================
// getLiquidCashPln
// ===========================================================================
describe('getLiquidCashPln', () => {
    it('zwraca 0 gdy brak aktywów gotówkowych', () => {
        expect(getLiquidCashPln()).toBe(0);
    });

    it('sumuje wartość kont gotówkowych', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'c1', type: 'cash', name: 'Konto', amount: 5000, currency: 'PLN' },
            { id: 'c2', type: 'cash', name: 'Gotówka', amount: 3000, currency: 'PLN' }
        ]});
        expect(getLiquidCashPln()).toBe(8000);
    });

    it('nie uwzględnia inwestycji', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'c1', type: 'cash', name: 'Konto', amount: 5000, currency: 'PLN' },
            { id: 'i1', type: 'investment', name: 'ETF', ticker: 'VWCE', quantity: 10, currentPrice: 500, currency: 'PLN' }
        ]});
        expect(getLiquidCashPln()).toBe(5000);
    });
});

// ===========================================================================
// getAssetsHorizonTotals
// ===========================================================================
describe('getAssetsHorizonTotals', () => {
    it('zwraca { short, long } jako liczby', () => {
        const result = getAssetsHorizonTotals();
        expect(typeof result.short).toBe('number');
        expect(typeof result.long).toBe('number');
    });

    it('short obejmuje cash i deposit', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'c1', type: 'cash', name: 'Konto', amount: 10000, currency: 'PLN' },
            { id: 'd1', type: 'deposit', name: 'Lokata', amount: 20000, currency: 'PLN' }
        ]});
        const { short } = getAssetsHorizonTotals();
        expect(short).toBe(30000);
    });

    it('long obejmuje retirement', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'r1', type: 'retirement', name: 'PPK', retirementKind: 'PPK', amount: 15000, currency: 'PLN' }
        ]});
        const { long } = getAssetsHorizonTotals();
        expect(long).toBe(15000);
    });
});

// ===========================================================================
// buildAssetAllocationSlices
// ===========================================================================
describe('buildAssetAllocationSlices', () => {
    it('zwraca pustą tablicę gdy brak aktywów', () => {
        expect(buildAssetAllocationSlices()).toEqual([]);
    });

    it('grupuje aktywa po typie', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'c1', type: 'cash', name: 'Konto', amount: 5000, currency: 'PLN' },
            { id: 'c2', type: 'cash', name: 'Gotówka', amount: 3000, currency: 'PLN' },
            { id: 'd1', type: 'deposit', name: 'Lokata', amount: 10000, currency: 'PLN' }
        ]});
        const slices = buildAssetAllocationSlices();
        const cashSlice = slices.find((s) => s.label === ASSET_TYPE_LABELS['cash']);
        expect(cashSlice?.amount).toBe(8000);
    });

    it('sortuje od największej wartości', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'd1', type: 'deposit', name: 'Lokata', amount: 20000, currency: 'PLN' },
            { id: 'c1', type: 'cash', name: 'Konto', amount: 5000, currency: 'PLN' }
        ]});
        const slices = buildAssetAllocationSlices();
        expect(slices[0].amount >= slices[slices.length - 1].amount).toBe(true);
    });

    it('wyklucza slices z amount = 0', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'c1', type: 'cash', name: 'Konto', amount: 5000, currency: 'PLN' }
        ]});
        const slices = buildAssetAllocationSlices();
        expect(slices.every((s) => s.amount > 0)).toBe(true);
    });
});

// ===========================================================================
// buildAssetHorizonSlices
// ===========================================================================
describe('buildAssetHorizonSlices', () => {
    it('zwraca co najmniej pustą tablicę gdy brak aktywów', () => {
        const slices = buildAssetHorizonSlices();
        expect(Array.isArray(slices)).toBe(true);
    });

    it('zwraca slices short/long dla mieszanych aktywów', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'c1', type: 'cash', name: 'Konto', amount: 5000, currency: 'PLN' },
            { id: 'r1', type: 'retirement', name: 'PPK', retirementKind: 'PPK', amount: 10000, currency: 'PLN' }
        ]});
        const slices = buildAssetHorizonSlices();
        const horizons = slices.map((s) => s.horizon);
        expect(horizons).toContain('short');
        expect(horizons).toContain('long');
    });
});
