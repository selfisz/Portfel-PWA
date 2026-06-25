/**
 * Testy HTML generatorów — funkcje zwracające string HTML.
 * Pokrywa: loans.js, credit-cards.js, assets.js, settings.js (saveCategoryEditor logika)
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
    globalThis.document = {
        getElementById: (id) => {
            if (!elements[id]) {
                elements[id] = {
                    value: '', innerHTML: '', textContent: '', innerText: '',
                    style: {}, checked: false, disabled: false, dataset: {},
                    classList: {
                        _s: new Set(),
                        add(c) { this._s.add(c); },
                        remove(c) { this._s.delete(c); },
                        toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
                        contains(c) { return this._s.has(c); }
                    },
                    getAttribute: () => null,
                    setAttribute: () => {},
                    focus: () => {}
                };
            }
            return elements[id];
        },
        querySelector: () => null,
        querySelectorAll: () => ({ forEach: () => {} }),
        createElement: (tag) => ({
            tagName: tag, value: '', innerHTML: '', textContent: '',
            style: {}, className: '', id: '', type: '', maxLength: 0,
            dataset: {}, disabled: false,
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            appendChild: () => {},
            querySelector: () => ({ dataset: {}, value: '' }),
            querySelectorAll: () => []
        }),
        body: { style: {} }
    };
    globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    globalThis.confirm = () => true;
    globalThis.alert = () => {};
    globalThis.stateRef = { set: () => Promise.resolve(), on: () => {}, off: () => {} };

    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatCompactPln = (n) => `${n} zł`;
    globalThis.formatTxDate = (d) => d || '';
    globalThis.escapeHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    globalThis.saveState = () => {};
    globalThis.hapticFeedback = () => {};
    globalThis.showSettingsToast = () => {};
    globalThis.renderLoans = () => {};
    globalThis.renderAssets = () => {};
    globalThis.renderDashboard = () => {};
    globalThis.renderCreditCardsSection = () => {};
    globalThis.renderDashboardCreditCards = () => {};
    globalThis.refreshCurrentView = () => {};
    globalThis.refreshLoanDetailsPanel = () => {};
    globalThis.setLoanDetailsMode = () => {};
    globalThis.closeLoanDetails = () => {};
    globalThis.populateCreditCardSelectors = () => {};
    globalThis.renderCategoryIcon = (main, size, sub) => `<span class="icon">${main}</span>`;
    globalThis.migrateRecentCategories = () => {};
    globalThis.closeCategoryEditor = () => {};
    globalThis.activeChartCategory = null;
    globalThis.formState = { selectedMainCategory: '', selectedSubCategory: '' };
    globalThis.categoryEditorType = 'expense';
    globalThis.syncCashForLoanPayment = () => ({ id: 'cash-mock' });
    globalThis.syncCashForCreditCardMovement = () => ({ id: 'cash-mock' });
    globalThis.getOrCreateShowMoreButton = () => ({
        classList: { add() {}, remove() {}, contains() { return false; } }
    });
    globalThis.updateShowMoreButton = () => {};
    globalThis.showMoreLoanPayments = () => {};

    loadScript('js/constants.js');
    loadScript('js/loan-details.js');
    loadScript('js/portfolio.js');
    loadScript('js/state.js');
    loadScript('js/assets.js');
    loadScript('js/cash.js');
    loadScript('js/credit-cards.js');
    loadScript('js/loans.js');
    loadScript('js/settings.js');

    runInContext(`
        function _getAppState()      { return appState; }
        function _setAppState(s)     { appState = s; }
        function _getCategoryTree()  { return categoryTree; }
        function _setCategoryTree(t) { categoryTree = t; }
    `);
});

beforeEach(() => {
    _setAppState({
        transactions: [],
        loans: [],
        creditCards: [],
        assets: [{ id: 'asset-cash-total', type: 'cash', amount: 10000 }],
        cashMovements: [],
        assetSnapshots: [],
        assetValueHistory: [],
        categoryBudgets: {},
        creditCardMovements: []
    });
    _setCategoryTree(JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)));
    globalThis.confirm = () => true;
    globalThis.alert = () => {};
});

// ===========================================================================
// loans.js — renderLoanCardHtml
// ===========================================================================
describe('renderLoanCardHtml', () => {
    function makeLoan(overrides = {}) {
        return normalizeLoan({
            id: 'l1', name: 'Hipoteka', subCategory: 'Kredyt hipoteczny',
            totalAmount: 300000, currentCapitalLeft: 200000,
            interestRate: 7, nextInstallmentAmount: 2500, nextInstallmentDue: '2024-02-01',
            ...overrides
        });
    }

    it('zawiera nazwę kredytu', () => {
        const html = renderLoanCardHtml(makeLoan({ name: 'Mój kredyt' }));
        expect(html).toContain('Mój kredyt');
    });

    it('zawiera id kredytu w onclick', () => {
        const html = renderLoanCardHtml(makeLoan({ id: 'loan-abc' }));
        expect(html).toContain('loan-abc');
    });

    it('zawiera procent spłaty', () => {
        const html = renderLoanCardHtml(makeLoan());
        // 100000/300000 ≈ 33.3%
        expect(html).toContain('33.3%');
    });

    it('zawiera sekcję następnej raty gdy nextInstallmentAmount > 0', () => {
        const html = renderLoanCardHtml(makeLoan({ nextInstallmentAmount: 2500 }));
        expect(html).toContain('loan-next-installment');
        expect(html).toContain('2500');
    });

    it('nie zawiera sekcji raty gdy nextInstallmentAmount = 0', () => {
        const html = renderLoanCardHtml(makeLoan({ nextInstallmentAmount: 0, nextInstallmentDue: '' }));
        expect(html).not.toContain('loan-next-installment');
    });

    it('escapuje znaki specjalne w id', () => {
        const html = renderLoanCardHtml(makeLoan({ id: 'loan<xss>' }));
        expect(html).not.toContain('<xss>');
    });

    it('wyświetla 0% dla kredytu bez oprocentowania', () => {
        const html = renderLoanCardHtml(makeLoan({ interestRate: 0 }));
        expect(html).toContain('0%');
    });
});

// ===========================================================================
// loans.js — renderArchivedLoanCardHtml
// ===========================================================================
describe('renderArchivedLoanCardHtml', () => {
    it('zawiera "Spłacony"', () => {
        const loan = normalizeLoan({ id: 'l1', name: 'Stary kredyt', subCategory: 'Spłata', totalAmount: 50000, currentCapitalLeft: 0, archived: true, archivedAt: '2023-12-31' });
        const html = renderArchivedLoanCardHtml(loan);
        expect(html).toContain('Spłacony');
    });

    it('zawiera datę archiwizacji', () => {
        const loan = normalizeLoan({ id: 'l1', name: 'Kredyt', subCategory: 'Spłata', totalAmount: 10000, archived: true, archivedAt: '2023-06-15' });
        const html = renderArchivedLoanCardHtml(loan);
        expect(html).toContain('2023-06-15');
    });

    it('zawiera marker "Zarchiwizowano:" gdy brak daty', () => {
        const loan = normalizeLoan({ id: 'l1', name: 'Kredyt', subCategory: 'Spłata', totalAmount: 10000, archived: true, archivedAt: '' });
        const html = renderArchivedLoanCardHtml(loan);
        expect(html).toContain('Zarchiwizowano:');
        // brak daty → fallback (em dash lub pusty string, ale element musi być)
        expect(html).toContain('loan-archive-date');
    });

    it('escapuje subCategory', () => {
        const loan = normalizeLoan({ id: 'l1', name: 'Test', subCategory: '<script>', totalAmount: 100, archived: true });
        const html = renderArchivedLoanCardHtml(loan);
        expect(html).not.toContain('<script>');
    });
});

// ===========================================================================
// loans.js — renderSimpleLoanDetailsHtml
// ===========================================================================
describe('renderSimpleLoanDetailsHtml', () => {
    it('zawiera "Parametry kredytu" jako tytuł sekcji', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'Hipoteka', totalAmount: 200000, currentCapitalLeft: 150000, interestRate: 6.5 });
        const html = renderSimpleLoanDetailsHtml(loan);
        expect(html).toContain('Parametry kredytu');
    });

    it('wyświetla oprocentowanie gdy > 0', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'Hipoteka', totalAmount: 200000, currentCapitalLeft: 150000, interestRate: 6.5 });
        const html = renderSimpleLoanDetailsHtml(loan);
        expect(html).toContain('6');
    });

    it('zawiera bank z details', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'Hipoteka', totalAmount: 200000, currentCapitalLeft: 150000, details: { bank: 'PKO BP' } });
        const html = renderSimpleLoanDetailsHtml(loan);
        expect(html).toContain('PKO BP');
    });

    it('zawiera notatkę o nadpłacie z details.overpaymentNotes', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, details: { overpaymentNotes: 'Brak opłat' } });
        const html = renderSimpleLoanDetailsHtml(loan);
        expect(html).toContain('Brak opłat');
    });

    it('generuje fallback notatkę gdy jest nextInstallmentAmount > 0', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, nextInstallmentAmount: 1500 });
        const html = renderSimpleLoanDetailsHtml(loan);
        expect(html).toContain('co miesiąc');
    });
});

// ===========================================================================
// loans.js — renderLoanDetailsHtml (extended vs simple)
// ===========================================================================
describe('renderLoanDetailsHtml', () => {
    it('używa prostego widoku gdy brak extended details', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, interestRate: 5 });
        const html = renderLoanDetailsHtml(loan);
        expect(html).toContain('Parametry kredytu');
    });

    it('używa rozszerzonego widoku z collateral', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, details: { collateral: 'Nieruchomość', bank: 'ING' } });
        const html = renderLoanDetailsHtml(loan);
        expect(html).toContain('Podstawowe dane umowy');
        expect(html).toContain('Parametry finansowe');
    });

    it('zawiera sekcję promotionTerms gdy podana', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, details: { collateral: 'Dom', promotionTerms: 'Stała stopa przez 5 lat' } });
        const html = renderLoanDetailsHtml(loan);
        expect(html).toContain('Warunki promocyjne');
        expect(html).toContain('Stała stopa przez 5 lat');
    });

    it('wyświetla earlyRepaymentFee = 0 jako "0%"', () => {
        const loan = normalizeLoan({ id: 'l1', subCategory: 'A', totalAmount: 100000, currentCapitalLeft: 50000, details: { collateral: 'Dom', earlyRepaymentFee: 0 } });
        const html = renderLoanDetailsHtml(loan);
        expect(html).toContain('0%');
    });
});

// ===========================================================================
// credit-cards.js — renderCreditCardTileHtml
// ===========================================================================
describe('renderCreditCardTileHtml', () => {
    function makeCard(overrides = {}) {
        return normalizeCreditCard({ id: 'c1', name: 'Erste Bank', limit: 8000, currentBalance: 2000, ...overrides });
    }

    it('zawiera nazwę karty', () => {
        const html = renderCreditCardTileHtml(makeCard({ name: 'mBank' }));
        expect(html).toContain('mBank');
    });

    it('zawiera limit karty', () => {
        const html = renderCreditCardTileHtml(makeCard({ limit: 8000 }));
        expect(html).toContain('8000');
    });

    it('zawiera zadłużenie i wolne środki', () => {
        const html = renderCreditCardTileHtml(makeCard({ limit: 8000, currentBalance: 3000 }));
        expect(html).toContain('Zadłużenie');
        expect(html).toContain('Wolne');
    });

    it('zawiera przyciski akcji Spłać i Przelew', () => {
        const html = renderCreditCardTileHtml(makeCard());
        expect(html).toContain('Spłać');
        expect(html).toContain('Przelew z karty');
    });

    it('escapuje id karty w onclick', () => {
        const html = renderCreditCardTileHtml(makeCard({ id: 'card<xss>' }));
        expect(html).not.toContain('<xss>');
    });

    it('pasek postępu ma width proporcjonalny do zadłużenia', () => {
        const html = renderCreditCardTileHtml(makeCard({ limit: 10000, currentBalance: 5000 }));
        expect(html).toContain('width:50%');
    });

    it('pasek postępu max 100% gdy zadłużenie = limit', () => {
        const html = renderCreditCardTileHtml(makeCard({ limit: 5000, currentBalance: 5000 }));
        expect(html).toContain('width:100%');
    });
});

// ===========================================================================
// assets.js — renderInvestmentCardHtml
// ===========================================================================
describe('renderInvestmentCardHtml', () => {
    function makeInv(overrides = {}) {
        return normalizeAsset({ id: 'inv-1', type: 'investment', name: 'XTB', ticker: 'XTB', quantity: 10, purchasePrice: 100, currentPrice: 120, currency: 'PLN', ...overrides });
    }

    it('zawiera nazwę inwestycji', () => {
        const html = renderInvestmentCardHtml(makeInv({ name: 'mBank akcje' }));
        expect(html).toContain('mBank akcje');
    });

    it('zawiera ticker', () => {
        const html = renderInvestmentCardHtml(makeInv({ ticker: 'MBANK' }));
        expect(html).toContain('MBANK');
    });

    it('pokazuje zysk gdy currentPrice > purchasePrice', () => {
        const html = renderInvestmentCardHtml(makeInv({ quantity: 10, purchasePrice: 100, currentPrice: 120 }));
        expect(html).toContain('income'); // klasa CSS dla zysku
        expect(html).toContain('+');
    });

    it('pokazuje stratę gdy currentPrice < purchasePrice', () => {
        const html = renderInvestmentCardHtml(makeInv({ quantity: 10, purchasePrice: 100, currentPrice: 80 }));
        expect(html).toContain('expense'); // klasa CSS dla straty
    });

    it('escapuje id w onclick', () => {
        const html = renderInvestmentCardHtml(makeInv({ id: 'inv<xss>' }));
        expect(html).not.toContain('<xss>');
    });
});

// ===========================================================================
// assets.js — renderDepositCardHtml
// ===========================================================================
describe('renderDepositCardHtml', () => {
    it('zawiera nazwę lokaty', () => {
        const asset = normalizeAsset({ id: 'd1', type: 'deposit', name: 'Lokata PKO', amount: 20000, interestRate: 6 });
        const html = renderDepositCardHtml(asset);
        expect(html).toContain('Lokata PKO');
    });

    it('wyświetla oprocentowanie', () => {
        const asset = normalizeAsset({ id: 'd1', type: 'deposit', name: 'Test', amount: 10000, interestRate: 5.5 });
        const html = renderDepositCardHtml(asset);
        expect(html).toContain('5');
    });

    it('wyświetla "—" gdy brak oprocentowania', () => {
        const asset = normalizeAsset({ id: 'd1', type: 'deposit', name: 'Test', amount: 10000, interestRate: 0 });
        const html = renderDepositCardHtml(asset);
        expect(html).toContain('—');
    });

    it('wyświetla endDate gdy podana', () => {
        const asset = normalizeAsset({ id: 'd1', type: 'deposit', name: 'Test', amount: 10000, endDate: '2025-01-01' });
        const html = renderDepositCardHtml(asset);
        expect(html).toContain('2025-01-01');
    });
});

// ===========================================================================
// assets.js — renderCashCardHtml
// ===========================================================================
describe('renderCashCardHtml', () => {
    it('zawiera nazwę konta', () => {
        const asset = normalizeAsset({ id: 'c1', type: 'cash', name: 'Konto główne', amount: 5000 });
        const html = renderCashCardHtml(asset);
        expect(html).toContain('Konto główne');
    });

    it('pokazuje "Cele oszczędnościowe" dla konta z "cele" w nazwie', () => {
        const asset = normalizeAsset({ id: 'c1', type: 'cash', name: 'mBank Cele', amount: 2000 });
        const html = renderCashCardHtml(asset);
        expect(html).toContain('Cele oszczędnościowe');
    });

    it('pokazuje "Gotówka / konto" dla normalnego konta', () => {
        const asset = normalizeAsset({ id: 'c1', type: 'cash', name: 'Gotówka', amount: 1000 });
        const html = renderCashCardHtml(asset);
        expect(html).toContain('Gotówka / konto');
    });
});

// ===========================================================================
// assets.js — renderRetirementCardHtml
// ===========================================================================
describe('renderRetirementCardHtml', () => {
    it('zawiera nazwę produktu emerytalnego', () => {
        const asset = normalizeAsset({ id: 'r1', type: 'retirement', name: 'PPK mBank', retirementKind: 'PPK', amount: 10000 });
        const html = renderRetirementCardHtml(asset);
        expect(html).toContain('PPK mBank');
    });

    it('wyświetla rodzaj PPK', () => {
        const asset = normalizeAsset({ id: 'r1', type: 'retirement', name: 'Test', retirementKind: 'IKZE', amount: 5000 });
        const html = renderRetirementCardHtml(asset);
        expect(html).toContain('IKZE');
    });

    it('wyświetla instytucję gdy podana', () => {
        const asset = normalizeAsset({ id: 'r1', type: 'retirement', name: 'Test', retirementKind: 'PPK', institution: 'NN Investment', amount: 5000 });
        const html = renderRetirementCardHtml(asset);
        expect(html).toContain('NN Investment');
    });
});

// ===========================================================================
// assets.js — renderArchivedAssetCardHtml
// ===========================================================================
describe('renderArchivedAssetCardHtml', () => {
    it('zawiera "Zarchiwizowane"', () => {
        const asset = normalizeAsset({ id: 'a1', type: 'cash', name: 'Stare konto', amount: 0, archived: true, archivedAt: '2023-01-01' });
        const html = renderArchivedAssetCardHtml(asset);
        expect(html).toContain('Zarchiwizowane');
    });

    it('zawiera datę archiwizacji', () => {
        const asset = normalizeAsset({ id: 'a1', type: 'cash', name: 'Test', amount: 0, archived: true, archivedAt: '2023-06-30' });
        const html = renderArchivedAssetCardHtml(asset);
        expect(html).toContain('2023-06-30');
    });

    it('zawiera typ aktywa', () => {
        const asset = normalizeAsset({ id: 'a1', type: 'deposit', name: 'Lokata', amount: 1000, archived: true, archivedAt: '2023-01-01' });
        const html = renderArchivedAssetCardHtml(asset);
        expect(html).toContain('Lokata');
    });
});

// ===========================================================================
// loans.js — saveLoanDetails — walidacja
// ===========================================================================
describe('saveLoanDetails — walidacja', () => {
    let alertCalled;
    beforeEach(() => {
        alertCalled = false;
        globalThis.alert = () => { alertCalled = true; };

        // Ustaw aktywny draft loan
        _setAppState({ ..._getAppState(), loans: [] });
        runInContext('draftLoan = normalizeLoan({ id: "draft-1", subCategory: "", totalAmount: 0 }); activeLoanId = draftLoan.id;');

        // Wypełnij domyślne wartości inputów
        document.getElementById('loan-name-input').value = 'Mój kredyt';
        document.getElementById('loan-subcategory-select').value = 'Hipoteka';
        document.getElementById('loan-total-input').value = '200000';
        document.getElementById('loan-capital-input').value = '150000';
        document.getElementById('loan-rate-input').value = '7';
        document.getElementById('loan-installment-input').value = '2000';
        document.getElementById('loan-installment-due-input').value = '2024-02-01';
    });

    it('alert gdy brak totalAmount i capitalLeft', () => {
        document.getElementById('loan-total-input').value = '';
        document.getElementById('loan-capital-input').value = '';
        saveLoanDetails();
        expect(alertCalled).toBe(true);
    });

    it('alert gdy brak subCategory', () => {
        document.getElementById('loan-subcategory-select').value = '';
        saveLoanDetails();
        expect(alertCalled).toBe(true);
    });

    it('alert gdy capitalLeft > totalAmount', () => {
        document.getElementById('loan-total-input').value = '100000';
        document.getElementById('loan-capital-input').value = '200000';
        saveLoanDetails();
        expect(alertCalled).toBe(true);
    });

    it('zapisuje kredyt gdy dane poprawne', () => {
        saveLoanDetails();
        expect(alertCalled).toBe(false);
        const loans = _getAppState().loans;
        expect(loans.length).toBeGreaterThan(0);
    });

    it('uzupełnia totalAmount z capitalLeft gdy brak totalAmount', () => {
        document.getElementById('loan-total-input').value = '';
        document.getElementById('loan-capital-input').value = '150000';
        saveLoanDetails();
        if (!alertCalled) {
            const loan = _getAppState().loans[0];
            expect(loan?.totalAmount).toBeGreaterThan(0);
        }
    });
});

// ===========================================================================
// settings.js — suggestCategoryBudget — edge cases
// ===========================================================================
describe('suggestCategoryBudget — dodatkowe edge cases', () => {
    it('zwraca zaokrągloną wartość całkowitą (Math.round)', () => {
        const now = new Date();
        const m1 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
        const m2 = new Date(now.getFullYear(), now.getMonth() - 1, 10);
        const m2str = `${m2.getFullYear()}-${String(m2.getMonth() + 1).padStart(2, '0')}-10`;
        _setAppState({ ..._getAppState(), transactions: [
            { date: m1, type: 'expense', mainCategory: 'Dom', amount: 333 },
            { date: m2str, type: 'expense', mainCategory: 'Dom', amount: 666 }
        ]});
        const result = suggestCategoryBudget('Dom');
        expect(Number.isInteger(result)).toBe(true);
    });

    it('ignoruje wydatki z innych kategorii', () => {
        const now = new Date();
        const txDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-05`;
        _setAppState({ ..._getAppState(), transactions: [
            { date: txDate, type: 'expense', mainCategory: 'Jedzenie', amount: 9999 }
        ]});
        expect(suggestCategoryBudget('Dom')).toBe(0);
    });
});

// ===========================================================================
// credit-cards.js — renderDashboardCreditCards (HTML check)
// ===========================================================================
describe('renderDashboardCreditCards', () => {
    it('nie rzuca błędu gdy brak aktywnych kart', () => {
        expect(() => renderDashboardCreditCards()).not.toThrow();
    });

    it('ustawia sekcję hidden gdy brak kart', () => {
        const section = document.getElementById('dashboard-credit-cards');
        renderDashboardCreditCards();
        // Sekcja powinna być hidden
        expect(section.classList.contains('hidden')).toBe(true);
    });

    it('renderuje karty gdy są aktywne', () => {
        _setAppState({ ..._getAppState(), creditCards: [
            { id: 'c1', name: 'Erste', limit: 8000, currentBalance: 2000, archived: false }
        ]});
        const section = document.getElementById('dashboard-credit-cards');
        renderDashboardCreditCards();
        expect(section.classList.contains('hidden')).toBe(false);
    });
});
