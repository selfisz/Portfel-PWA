/**
 * Uzupełniające testy jednostkowe dla js/portfolio.js i js/state.js
 * — funkcje niepokryte w poprzednich plikach testowych.
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
        getElementById: () => ({
            value: '', classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
            style: {}, innerHTML: '', textContent: ''
        }),
        querySelector: () => null,
        querySelectorAll: () => ({ forEach: () => {} }),
        body: { style: {} }
    };
    globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    globalThis.confirm = () => true;
    globalThis.alert = () => {};
    globalThis.stateRef = { set: () => Promise.resolve(), on: () => {}, off: () => {} };
    globalThis.saveState = () => {};
    globalThis.hapticFeedback = () => {};
    globalThis.showSettingsToast = () => {};
    globalThis.renderAssets = () => {};
    globalThis.renderLoans = () => {};
    globalThis.renderDashboard = () => {};
    globalThis.refreshCurrentView = () => {};
    globalThis.activeChartCategory = null;
    globalThis.chartViewType = 'expense';

    loadScript('js/constants.js');
    loadScript('js/loan-details.js');
    loadScript('js/portfolio.js');
    loadScript('js/state.js');
    loadScript('js/assets.js');
    loadScript('js/credit-cards.js');

    runInContext(`
        function _getAppState()  { return appState; }
        function _setAppState(s) { appState = s; }
        function _getCategoryTree() { return categoryTree; }
        function _setCategoryTree(t) { categoryTree = t; }
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
        creditCardMovements: [],
        categoryTree: undefined
    });
    _setCategoryTree(JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)));
});

// ===========================================================================
// portfolio.js — getLoanDebtSubcategories
// ===========================================================================
describe('getLoanDebtSubcategories', () => {
    it('zwraca podkategorie Długi z categoryTree', () => {
        const subs = getLoanDebtSubcategories();
        expect(Array.isArray(subs)).toBe(true);
        expect(subs.length).toBeGreaterThan(0);
        expect(subs).toContain('Kredyt hipoteczny');
    });

    it('zwraca pustą tablicę gdy brak categoryTree', () => {
        _setCategoryTree(null);
        expect(getLoanDebtSubcategories()).toEqual([]);
    });
});

// ===========================================================================
// portfolio.js — getLoanSummaryCount
// ===========================================================================
describe('getLoanSummaryCount', () => {
    it('zwraca 0 gdy brak kredytów', () => {
        expect(getLoanSummaryCount()).toBe(0);
    });

    it('zlicza aktywne kredyty uwzględnione w sumie', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'A', totalAmount: 100, currentCapitalLeft: 50, includeInSummary: true, archived: false },
            { id: 'l2', subCategory: 'B', totalAmount: 100, currentCapitalLeft: 30, includeInSummary: false, archived: false },
            { id: 'l3', subCategory: 'C', totalAmount: 100, currentCapitalLeft: 0, archived: true }
        ]});
        expect(getLoanSummaryCount()).toBe(1); // tylko l1 aktywny + includeInSummary
    });
});

// ===========================================================================
// portfolio.js — getCreditCardDebtTotal
// ===========================================================================
describe('getCreditCardDebtTotal', () => {
    it('zwraca 0 gdy brak kart', () => {
        expect(getCreditCardDebtTotal()).toBe(0);
    });

    it('sumuje zadłużenia aktywnych kart', () => {
        _setAppState({ ..._getAppState(), creditCards: [
            { id: 'c1', name: 'Erste', limit: 8000, currentBalance: 1500, archived: false },
            { id: 'c2', name: 'mBank', limit: 21000, currentBalance: 3000, archived: false },
            { id: 'c3', name: 'Archiwum', limit: 5000, currentBalance: 500, archived: true }
        ]});
        expect(getCreditCardDebtTotal()).toBeCloseTo(4500); // 1500+3000, c3 wykluczone
    });
});

// ===========================================================================
// portfolio.js — getLoanSummaryTotal
// ===========================================================================
describe('getLoanSummaryTotal', () => {
    it('uwzględnia kredyty + zadłużenie kart', () => {
        _setAppState({ ..._getAppState(),
            loans: [
                { id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 80000, archived: false }
            ],
            creditCards: [
                { id: 'c1', name: 'Test', limit: 5000, currentBalance: 2000, archived: false }
            ]
        });
        expect(getLoanSummaryTotal()).toBeCloseTo(82000);
    });

    it('pomija kredyty z includeInSummary = false', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 80000, archived: false, includeInSummary: false }
        ]});
        expect(getLoanSummaryTotal()).toBe(0);
    });
});

// ===========================================================================
// portfolio.js — getPortfolioValuePln
// ===========================================================================
describe('getPortfolioValuePln', () => {
    it('zwraca 0 gdy brak aktywów', () => {
        expect(getPortfolioValuePln()).toBe(0);
    });

    it('sumuje wartość wszystkich aktywów', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'cash-1', type: 'cash', amount: 10000, currency: 'PLN', archived: false, includeInSummary: true },
            { id: 'dep-1', type: 'deposit', amount: 5000, currency: 'PLN', archived: false, includeInSummary: true }
        ]});
        expect(getPortfolioValuePln()).toBeCloseTo(15000);
    });

    it('wyklucza zarchiwizowane aktywa', () => {
        _setAppState({ ..._getAppState(), assets: [
            { id: 'cash-1', type: 'cash', amount: 10000, currency: 'PLN', archived: false, includeInSummary: true },
            { id: 'dep-1', type: 'deposit', amount: 5000, currency: 'PLN', archived: true, includeInSummary: true }
        ]});
        expect(getPortfolioValuePln()).toBeCloseTo(10000);
    });
});

// ===========================================================================
// portfolio.js — calcNetWorthPln
// ===========================================================================
describe('calcNetWorthPln', () => {
    it('majątek - zobowiązania', () => {
        _setAppState({ ..._getAppState(),
            assets: [{ id: 'c', type: 'cash', amount: 50000, currency: 'PLN', archived: false, includeInSummary: true }],
            loans: [{ id: 'l', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 30000, archived: false }]
        });
        expect(calcNetWorthPln()).toBeCloseTo(20000); // 50000 - 30000
    });

    it('zwraca 0 gdy brak aktywów i długów', () => {
        expect(calcNetWorthPln()).toBe(0);
    });
});

// ===========================================================================
// portfolio.js — isMortgageLoan
// ===========================================================================
describe('isMortgageLoan', () => {
    it('wykrywa kredyt hipoteczny po subCategory', () => {
        expect(isMortgageLoan({ subCategory: 'Kredyt hipoteczny', name: '' })).toBe(true);
        expect(isMortgageLoan({ subCategory: 'Kredyt Pekao SA', name: '' })).toBe(true);
    });

    it('wykrywa hipotekę po słowie kluczowym w subCategory', () => {
        expect(isMortgageLoan({ subCategory: 'kredyt hipoteczny prywatny', name: '' })).toBe(true);
    });

    it('wykrywa hipotekę po słowie kluczowym w name', () => {
        expect(isMortgageLoan({ subCategory: 'Inne', name: 'Kredyt hipoteczny ING' })).toBe(true);
    });

    it('zwraca false dla zwykłego kredytu', () => {
        expect(isMortgageLoan({ subCategory: 'Kredyt gotówkowy', name: 'Pożyczka' })).toBe(false);
    });

    it('zwraca false dla null', () => {
        expect(isMortgageLoan(null)).toBe(false);
    });
});

// ===========================================================================
// portfolio.js — getLoanPaymentSubcategories
// ===========================================================================
describe('getLoanPaymentSubcategories', () => {
    it('zwraca null gdy brak subCategory', () => {
        expect(getLoanPaymentSubcategories({ subCategory: '' })).toBeNull();
        expect(getLoanPaymentSubcategories({})).toBeNull();
    });

    it('zwraca [subCategory] dla zwykłego kredytu', () => {
        const result = getLoanPaymentSubcategories({ subCategory: 'Kredyt gotówkowy', name: 'Test' });
        expect(result).toEqual(['Kredyt gotówkowy']);
    });

    it('zwraca zestaw subkategorii dla hipoteki', () => {
        const result = getLoanPaymentSubcategories({ subCategory: 'Kredyt hipoteczny', name: '' });
        expect(Array.isArray(result)).toBe(true);
        expect(result).toContain('Kredyt hipoteczny');
        expect(result.length).toBeGreaterThan(1);
    });

    it('uwzględnia historyczne subkategorie transakcji przy hipotece', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { type: 'expense', mainCategory: 'Długi', subCategory: 'Pekao hipoteka', amount: 2000, date: '2024-01-01' }
        ]});
        const result = getLoanPaymentSubcategories({ subCategory: 'Kredyt hipoteczny', name: '' });
        expect(result).toContain('Pekao hipoteka');
    });
});

// ===========================================================================
// portfolio.js — transactionMatchesLoan
// ===========================================================================
describe('transactionMatchesLoan', () => {
    it('zwraca false dla transaction.type != expense', () => {
        const t = { type: 'income', mainCategory: 'Długi', subCategory: 'Spłata', amount: 100, date: '2024-01-01' };
        const loan = { subCategory: 'Spłata', name: 'Test' };
        expect(transactionMatchesLoan(t, loan)).toBe(false);
    });

    it('zwraca false dla mainCategory != Długi', () => {
        const t = { type: 'expense', mainCategory: 'Dom', subCategory: 'Spłata', amount: 100, date: '2024-01-01' };
        const loan = { subCategory: 'Spłata', name: 'Test' };
        expect(transactionMatchesLoan(t, loan)).toBe(false);
    });

    it('zwraca true gdy subCategory pasuje', () => {
        const t = { type: 'expense', mainCategory: 'Długi', subCategory: 'Spłata', amount: 100, date: '2024-01-01' };
        const loan = { subCategory: 'Spłata', name: 'Test' };
        expect(transactionMatchesLoan(t, loan)).toBe(true);
    });

    it('zwraca false gdy subCategory nie pasuje', () => {
        const t = { type: 'expense', mainCategory: 'Długi', subCategory: 'Inna spłata', amount: 100, date: '2024-01-01' };
        const loan = { subCategory: 'Spłata', name: 'Test' };
        expect(transactionMatchesLoan(t, loan)).toBe(false);
    });
});

// ===========================================================================
// portfolio.js — getUpcomingLoanInstallments / hasScheduledLoanInstallments
// ===========================================================================
describe('getUpcomingLoanInstallments', () => {
    it('zwraca pustą tablicę gdy brak kredytów', () => {
        expect(getUpcomingLoanInstallments()).toEqual([]);
    });

    it('zwraca kredyty z ratą w bieżącym miesiącu', () => {
        const now = new Date();
        const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000,
              nextInstallmentAmount: 2000, nextInstallmentDue: dueDate, archived: false }
        ]});
        const result = getUpcomingLoanInstallments();
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0].nextInstallmentDue).toBe(dueDate);
    });

    it('nie zwraca rat poza bieżącym miesiącem', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000,
              nextInstallmentAmount: 2000, nextInstallmentDue: '2020-01-15', archived: false }
        ]});
        expect(getUpcomingLoanInstallments()).toHaveLength(0);
    });

    it('sortuje rosnąco po dacie', () => {
        const now = new Date();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000,
              nextInstallmentAmount: 1000, nextInstallmentDue: `${y}-${m}-20`, archived: false },
            { id: 'l2', subCategory: 'B', totalAmount: 50000, currentCapitalLeft: 25000,
              nextInstallmentAmount: 500, nextInstallmentDue: `${y}-${m}-05`, archived: false }
        ]});
        const result = getUpcomingLoanInstallments();
        if (result.length >= 2) {
            expect(result[0].nextInstallmentDue < result[1].nextInstallmentDue).toBe(true);
        }
    });
});

describe('hasScheduledLoanInstallments', () => {
    it('zwraca false gdy brak kredytów', () => {
        expect(hasScheduledLoanInstallments()).toBe(false);
    });

    it('zwraca true gdy kredyt ma ustawioną ratę', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000,
              nextInstallmentAmount: 2000, nextInstallmentDue: '2025-01-15', archived: false }
        ]});
        expect(hasScheduledLoanInstallments()).toBe(true);
    });

    it('zwraca false gdy nextInstallmentAmount = 0', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000,
              nextInstallmentAmount: 0, nextInstallmentDue: '2025-01-15', archived: false }
        ]});
        expect(hasScheduledLoanInstallments()).toBe(false);
    });
});

// ===========================================================================
// state.js — getPersistedState
// ===========================================================================
describe('getPersistedState', () => {
    it('zwraca tablice dla wszystkich kluczowych pól', () => {
        const result = getPersistedState({
            transactions: [{ date: '2024-01-01', type: 'expense', amount: 100, mainCategory: 'Dom', subCategory: '' }],
            loans: [],
            creditCards: [],
            assets: [],
            cashMovements: [],
            creditCardMovements: [],
            assetSnapshots: [],
            assetValueHistory: []
        });
        expect(Array.isArray(result.transactions)).toBe(true);
        expect(Array.isArray(result.loans)).toBe(true);
        expect(Array.isArray(result.assets)).toBe(true);
    });

    it('zwraca DEFAULT_CATEGORY_TREE gdy brak categoryTree w danych', () => {
        const result = getPersistedState({ transactions: [] });
        expect(result.categoryTree).toBeTruthy();
        expect(result.categoryTree.expense).toBeTruthy();
    });

    it('zachowuje categoryTree z danych wejściowych', () => {
        const customTree = { expense: { 'Custom': [] }, income: {} };
        const result = getPersistedState({ transactions: [], categoryTree: customTree });
        expect(result.categoryTree.expense.Custom).toBeDefined();
    });

    it('normalizuje null transactions do pustej tablicy', () => {
        const result = getPersistedState({ transactions: null });
        expect(Array.isArray(result.transactions)).toBe(true);
        expect(result.transactions).toHaveLength(0);
    });

    it('zwraca pusty obiekt dla categoryBudgets gdy brak', () => {
        const result = getPersistedState({ transactions: [] });
        expect(typeof result.categoryBudgets).toBe('object');
    });
});

// ===========================================================================
// state.js — migrateLoansArray
// ===========================================================================
describe('migrateLoansArray', () => {
    it('migruje pojedynczy loan (legacy) do tablicy loans', () => {
        _setAppState({
            ..._getAppState(),
            loans: null,
            loan: {
                id: 'test-loan',
                name: 'Testowy kredyt',
                subCategory: 'Hipoteka',
                totalAmount: 100000,
                currentCapitalLeft: 80000
            }
        });
        const changed = migrateLoansArray();
        expect(changed).toBe(true);
        expect(Array.isArray(_getAppState().loans)).toBe(true);
        expect(_getAppState().loans.length).toBeGreaterThanOrEqual(1);
        expect(_getAppState().loan).toBeUndefined();
    });

    it('nie zmienia istniejącej tablicy loans', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000 }
        ]});
        migrateLoansArray();
        expect(Array.isArray(_getAppState().loans)).toBe(true);
        expect(_getAppState().loans.length).toBeGreaterThanOrEqual(1);
    });

    it('tworzy pustą tablicę gdy brak loans i loan', () => {
        _setAppState({ ..._getAppState(), loans: null, loan: null });
        migrateLoansArray();
        expect(Array.isArray(_getAppState().loans)).toBe(true);
    });
});

// ===========================================================================
// state.js — migrateCategoryData
// ===========================================================================
describe('migrateCategoryData', () => {
    it('zmienia "Komunikacja" na "Transport" w transakcjach', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Komunikacja', subCategory: 'Bus', amount: 50 },
            { date: '2024-01-02', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Restauracje', amount: 100 }
        ]});
        const changed = migrateCategoryData();
        expect(changed).toBe(true);
        const txs = _getAppState().transactions;
        expect(txs[0].mainCategory).toBe('Transport');
        expect(txs[1].mainCategory).toBe('Jedzenie'); // nie zmienione
    });

    it('zwraca false gdy brak do migracji', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Dom', subCategory: 'Czynsz', amount: 1000 }
        ]});
        const changed = migrateCategoryData();
        expect(changed).toBe(false);
    });
});

// ===========================================================================
// loan-details.js — hasLoanExtendedDetails
// ===========================================================================
describe('hasLoanExtendedDetails', () => {
    it('zwraca false gdy brak details', () => {
        expect(hasLoanExtendedDetails(null)).toBe(false);
        expect(hasLoanExtendedDetails({ details: null })).toBe(false);
        expect(hasLoanExtendedDetails({ details: {} })).toBe(false);
    });

    it('zwraca true gdy jest collateral', () => {
        expect(hasLoanExtendedDetails({ details: { collateral: 'Hipoteka' } })).toBe(true);
    });

    it('zwraca true gdy są promotionTerms', () => {
        expect(hasLoanExtendedDetails({ details: { promotionTerms: 'Stała stopa 5%' } })).toBe(true);
    });

    it('zwraca true gdy jest propertyValue', () => {
        expect(hasLoanExtendedDetails({ details: { propertyValue: 500000 } })).toBe(true);
    });

    it('zwraca true gdy jest mortgageLimit', () => {
        expect(hasLoanExtendedDetails({ details: { mortgageLimit: 600000 } })).toBe(true);
    });

    it('zwraca false dla pustych pól extended', () => {
        expect(hasLoanExtendedDetails({ details: { bank: 'PKO', contractNumber: '123' } })).toBe(false);
    });
});

// ===========================================================================
// loan-details.js — isLegacyTestLoan
// ===========================================================================
describe('isLegacyTestLoan', () => {
    it('wykrywa kredyt po loan-primary id', () => {
        expect(isLegacyTestLoan({ id: 'loan-primary' })).toBe(true);
    });

    it('wykrywa legacy loan po dokładnym LEGACY_TEST_CAPITAL (412500)', () => {
        expect(isLegacyTestLoan({ id: 'random-id', currentCapitalLeft: 412500, totalAmount: 600000, interestRate: 7 })).toBe(true);
    });

    it('wykrywa legacy loan po LEGACY_TEST_TOTAL + LEGACY_TEST_RATE (500000 / 6.75%)', () => {
        expect(isLegacyTestLoan({ id: 'random-id', currentCapitalLeft: 100000, totalAmount: 500000, interestRate: 6.75 })).toBe(true);
    });

    it('zwraca false dla normalnego kredytu', () => {
        expect(isLegacyTestLoan({ id: 'loan-abc123', subCategory: 'Hipoteka', totalAmount: 300000, currentCapitalLeft: 250000, interestRate: 7 })).toBe(false);
    });

    it('zwraca false dla null', () => {
        expect(isLegacyTestLoan(null)).toBe(false);
    });
});
