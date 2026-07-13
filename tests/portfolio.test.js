/**
 * Testy jednostkowe dla js/portfolio.js
 *
 * Strategia mockowania:
 * - normalizeLoanDetails, isLegacyTestLoan — stubujemy jako globale przed załadowaniem skryptu
 * - appState, categoryTree — ustawiamy globalnie przed każdym testem
 * - getSummaryAssets, getActiveAssets, getActiveCreditCards — stuby dla funkcji z innych modułów
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
  // Stubujemy zależności z loan-details.js (ładowane normalnie przed portfolio.js)
  globalThis.normalizeLoanDetails = (details) => details || [];
  globalThis.isLegacyTestLoan = (loan) => !!(loan?.name === '__test__' || loan?.id === 'loan-test');

  // Stubujemy zależności z assets.js / credit-cards.js
  globalThis.getSummaryAssets = undefined;
  globalThis.getActiveAssets = undefined;
  globalThis.getActiveCreditCards = undefined;

  // Pusty appState
  globalThis.appState = { loans: [], transactions: [], assets: [], creditCards: [] };
  globalThis.categoryTree = { expense: { Długi: ['Kredyt hipoteczny', 'Meble'] } };

  loadScript('js/portfolio.js');
});

beforeEach(() => {
  globalThis.appState = { loans: [], transactions: [], assets: [], creditCards: [] };
  globalThis.categoryTree = { expense: { Długi: ['Kredyt hipoteczny', 'Meble', 'Remont'] } };
  globalThis.getSummaryAssets = undefined;
  globalThis.getActiveAssets = undefined;
  globalThis.getActiveCreditCards = undefined;
});

// ---------------------------------------------------------------------------
// convertToPln
// ---------------------------------------------------------------------------
describe('convertToPln', () => {
  it('zwraca kwotę bez zmian dla PLN', () => {
    expect(convertToPln(1000, 'PLN')).toBe(1000);
  });

  it('przelicza EUR na PLN (kurs 4.32)', () => {
    expect(convertToPln(100, 'EUR')).toBeCloseTo(432, 2);
  });

  it('domyślnie traktuje walutę jako PLN gdy nie podano', () => {
    expect(convertToPln(500)).toBe(500);
  });

  it('przelicza 0 EUR na 0 PLN', () => {
    expect(convertToPln(0, 'EUR')).toBe(0);
  });

  it('przelicza wartości ujemne', () => {
    expect(convertToPln(-100, 'EUR')).toBeCloseTo(-432, 2);
  });

  it('zwraca kwotę bez zmian dla nieznanej waluty', () => {
    expect(convertToPln(200, 'USD')).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// getAssetValuePln
// ---------------------------------------------------------------------------
describe('getAssetValuePln', () => {
  it('zwraca 0 dla null', () => {
    expect(getAssetValuePln(null)).toBe(0);
  });

  it('zwraca 0 dla undefined', () => {
    expect(getAssetValuePln(undefined)).toBe(0);
  });

  it('oblicza wartość aktywa inwestycyjnego w PLN (EUR)', () => {
    const asset = { type: 'investment', quantity: 10, currentPrice: 100, currency: 'EUR' };
    expect(getAssetValuePln(asset)).toBeCloseTo(4320, 2); // 10 * 100 * 4.32
  });

  it('oblicza wartość aktywa inwestycyjnego w PLN (PLN)', () => {
    const asset = { type: 'investment', quantity: 5, currentPrice: 200, currency: 'PLN' };
    expect(getAssetValuePln(asset)).toBe(1000); // 5 * 200 * 1
  });

  it('używa currentPriceManual gdy brak currentPrice', () => {
    const asset = { type: 'investment', quantity: 2, currentPriceManual: 50, currency: 'PLN' };
    expect(getAssetValuePln(asset)).toBe(100);
  });

  it('zwraca 0 dla aktywa inwestycyjnego bez quantity', () => {
    const asset = { type: 'investment', currentPrice: 100, currency: 'PLN' };
    expect(getAssetValuePln(asset)).toBe(0);
  });

  it('oblicza wartość aktywa gotówkowego w PLN', () => {
    const asset = { type: 'cash', amount: 500, currency: 'PLN' };
    expect(getAssetValuePln(asset)).toBe(500);
  });

  it('przelicza gotówkę w EUR na PLN', () => {
    const asset = { type: 'cash', amount: 100, currency: 'EUR' };
    expect(getAssetValuePln(asset)).toBeCloseTo(432, 2);
  });

  it('wykrywa typ investment po obecności ticker nawet bez type', () => {
    const asset = { ticker: 'ETF', quantity: 1, currentPrice: 400, currency: 'EUR' };
    expect(getAssetValuePln(asset)).toBeCloseTo(1728, 2);
  });

  it('domyślnie EUR dla inwestycji bez podanej waluty (znane zachowanie)', () => {
    const asset = { type: 'investment', quantity: 1, currentPrice: 100 };
    // Brak currency → domyślnie EUR → * 4.32
    expect(getAssetValuePln(asset)).toBeCloseTo(432, 2);
  });
});

// ---------------------------------------------------------------------------
// getAssetCostPln
// ---------------------------------------------------------------------------
describe('getAssetCostPln', () => {
  it('zwraca 0 dla null', () => {
    expect(getAssetCostPln(null)).toBe(0);
  });

  it('oblicza koszt inwestycji (quantity * purchasePrice * kurs)', () => {
    const asset = { type: 'investment', quantity: 10, purchasePrice: 50, currency: 'PLN' };
    expect(getAssetCostPln(asset)).toBe(500);
  });

  it('dla aktywów nie-inwestycyjnych zwraca bieżącą wartość (nie koszt nabycia)', () => {
    const asset = { type: 'cash', amount: 1000, currency: 'PLN' };
    expect(getAssetCostPln(asset)).toBe(1000);
  });

  it('zwraca 0 gdy brak purchasePrice', () => {
    const asset = { type: 'investment', quantity: 5, currency: 'PLN' };
    expect(getAssetCostPln(asset)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// normalizeLoan
// ---------------------------------------------------------------------------
describe('normalizeLoan', () => {
  it('zwraca obiekt z domyślnymi polami dla pustego obiektu', () => {
    const loan = normalizeLoan({});
    expect(loan.archived).toBe(false);
    expect(loan.includeInSummary).toBe(true);
    expect(loan.totalAmount).toBe(0);
    expect(loan.currentCapitalLeft).toBe(0);
    expect(typeof loan.id).toBe('string');
    expect(loan.id).toMatch(/^loan-/);
  });

  it('zwraca obiekt z domyślnymi polami dla null', () => {
    const loan = normalizeLoan(null);
    expect(loan.totalAmount).toBe(0);
    expect(loan.archived).toBe(false);
  });

  it('generuje id gdy brak', () => {
    const loan = normalizeLoan({ name: 'Test' });
    expect(loan.id).toBeTruthy();
    expect(loan.id).toMatch(/^loan-/);
  });

  it('zachowuje istniejące id', () => {
    const loan = normalizeLoan({ id: 'loan-abc123', totalAmount: 100000 });
    expect(loan.id).toBe('loan-abc123');
  });

  it('ustawia name z subCategory gdy brak name', () => {
    const loan = normalizeLoan({ subCategory: 'Kredyt hipoteczny' });
    expect(loan.name).toBe('Kredyt hipoteczny');
  });

  it('ustawia name z lender gdy brak name i subCategory', () => {
    const loan = normalizeLoan({ lender: 'PKO BP' });
    expect(loan.name).toBe('Kredyt PKO BP');
  });

  it('usuwa pole lender z wynikowego obiektu', () => {
    const loan = normalizeLoan({ lender: 'mBank' });
    expect('lender' in loan).toBe(false);
  });

  it('wymusza nieujemne wartości liczbowe', () => {
    const loan = normalizeLoan({ totalAmount: -1000, currentCapitalLeft: -500, interestRate: -2 });
    expect(loan.totalAmount).toBe(0);
    expect(loan.currentCapitalLeft).toBe(0);
    expect(loan.interestRate).toBe(0);
  });

  it('parsuje stringi liczbowe na liczby', () => {
    const loan = normalizeLoan({ totalAmount: '150000', currentCapitalLeft: '80000' });
    expect(loan.totalAmount).toBe(150000);
    expect(loan.currentCapitalLeft).toBe(80000);
  });

  it('auto-archiwizuje kredyt gdy currentCapitalLeft <= 0 i totalAmount > 0', () => {
    const loan = normalizeLoan({ totalAmount: 100000, currentCapitalLeft: 0 });
    expect(loan.archived).toBe(true);
    expect(loan.nextInstallmentAmount).toBe(0);
    expect(loan.nextInstallmentDue).toBe('');
  });

  it('nie archiwizuje gdy totalAmount === 0 (nie skonfigurowany)', () => {
    const loan = normalizeLoan({ totalAmount: 0, currentCapitalLeft: 0 });
    expect(loan.archived).toBe(false);
  });

  it('ogranicza currentCapitalLeft do totalAmount gdy currentCapitalLeft > totalAmount', () => {
    const loan = normalizeLoan({ totalAmount: 100000, currentCapitalLeft: 150000 });
    expect(loan.currentCapitalLeft).toBe(100000);
  });

  it('ustawia archivedAt gdy auto-archiwizuje', () => {
    const today = new Date().toISOString().split('T')[0];
    const loan = normalizeLoan({ totalAmount: 50000, currentCapitalLeft: 0 });
    expect(loan.archivedAt).toBe(today);
  });

  it('bug: nadpisuje ręczne archiwizowanie gdy currentCapitalLeft > 0', () => {
    // Znany problem: archived=true jest ignorowane gdy jest kapitał do spłaty
    const loan = normalizeLoan({ totalAmount: 100000, currentCapitalLeft: 50000, archived: true });
    expect(loan.archived).toBe(false); // nadpisane! — dokumentujemy aktualne zachowanie
  });
});

// ---------------------------------------------------------------------------
// normalizeLoansArray
// ---------------------------------------------------------------------------
describe('normalizeLoansArray', () => {
  it('zwraca pustą tablicę dla null/null', () => {
    expect(normalizeLoansArray(null, null)).toEqual([]);
  });

  it('normalizuje tablicę kredytów', () => {
    const loans = [{ id: 'l1', totalAmount: 100000, currentCapitalLeft: 50000 }];
    const result = normalizeLoansArray(loans, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l1');
  });

  it('usuwa testy-legacy z tablicy', () => {
    const loans = [
      { id: 'loan-test', name: '__test__', totalAmount: 1, currentCapitalLeft: 1 },
      { id: 'l1', totalAmount: 100000, currentCapitalLeft: 50000 }
    ];
    const result = normalizeLoansArray(loans, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l1');
  });

  it('konwertuje pojedynczy legacy loan (raw.loan) na tablicę 1-elementową', () => {
    const result = normalizeLoansArray(null, { id: 'old-loan', totalAmount: 200000, currentCapitalLeft: 100000 });
    expect(result).toHaveLength(1);
  });

  it('zwraca pustą tablicę gdy tablica jest pusta', () => {
    expect(normalizeLoansArray([], null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mergeLoansById
// ---------------------------------------------------------------------------
describe('mergeLoansById', () => {
  it('scala dwie tablice bez duplikatów', () => {
    const a = [{ id: 'l1', totalAmount: 100000, currentCapitalLeft: 50000 }];
    const b = [{ id: 'l2', totalAmount: 200000, currentCapitalLeft: 150000 }];
    const result = mergeLoansById(a, b);
    expect(result).toHaveLength(2);
  });

  it('przy duplikatach preferuje późniejszą wersję (np. lokalną po synchronizacji)', () => {
    const old = [{ id: 'l1', totalAmount: 100000, currentCapitalLeft: 80000 }];
    const newer = [{ id: 'l1', totalAmount: 100000, currentCapitalLeft: 60000 }];
    const result = mergeLoansById(old, newer);
    expect(result).toHaveLength(1);
    expect(result[0].currentCapitalLeft).toBe(60000);
  });

  it('pomija null i niepoprawne elementy', () => {
    const result = mergeLoansById([null, undefined, { id: 'l1', totalAmount: 50000, currentCapitalLeft: 10000 }]);
    expect(result).toHaveLength(1);
  });

  it('zwraca pustą tablicę dla pustych list', () => {
    expect(mergeLoansById([], [])).toEqual([]);
  });
});

describe('transactionBelongsToLoan', () => {
  it('wiąże wpłatę po loanId gdy jest ustawione', () => {
    const loan = { id: 'loan-mbank', subCategory: 'Remont' };
    const tx = { type: 'expense', mainCategory: 'Długi', subCategory: 'Remont', loanId: 'loan-mbank' };
    expect(transactionBelongsToLoan(tx, loan)).toBe(true);
  });

  it('nie przypisuje wspólnej podkategorii do wielu kredytów bez loanId', () => {
    globalThis.appState.loans = [
      { id: 'loan-mbank', subCategory: 'Remont', totalAmount: 10000, currentCapitalLeft: 5000, archived: false },
      { id: 'loan-velo', subCategory: 'Remont', totalAmount: 8000, currentCapitalLeft: 4000, archived: false }
    ];
    const tx = { type: 'expense', mainCategory: 'Długi', subCategory: 'Remont' };
    expect(transactionBelongsToLoan(tx, { id: 'loan-mbank', subCategory: 'Remont' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLoanConfigured / isLoanActive / isLoanArchived
// ---------------------------------------------------------------------------
describe('isLoanConfigured', () => {
  it('zwraca false dla null', () => {
    expect(isLoanConfigured(null)).toBe(false);
  });

  it('zwraca false dla kredytu z zerami', () => {
    expect(isLoanConfigured({ totalAmount: 0, currentCapitalLeft: 0 })).toBe(false);
  });

  it('zwraca true gdy totalAmount > 0', () => {
    expect(isLoanConfigured({ totalAmount: 100000, currentCapitalLeft: 0 })).toBe(true);
  });

  it('zwraca true gdy currentCapitalLeft > 0', () => {
    expect(isLoanConfigured({ totalAmount: 0, currentCapitalLeft: 5000 })).toBe(true);
  });
});

describe('isLoanActive', () => {
  it('zwraca true dla skonfigurowanego, niearchiwalnego kredytu', () => {
    expect(isLoanActive({ totalAmount: 100000, currentCapitalLeft: 50000, archived: false })).toBe(true);
  });

  it('zwraca false dla archiwalnego kredytu', () => {
    expect(isLoanActive({ totalAmount: 100000, currentCapitalLeft: 0, archived: true })).toBe(false);
  });

  it('zwraca false dla null', () => {
    expect(isLoanActive(null)).toBe(false);
  });
});

describe('isLoanArchived', () => {
  it('zwraca true dla skonfigurowanego, archiwalnego kredytu', () => {
    expect(isLoanArchived({ totalAmount: 100000, currentCapitalLeft: 0, archived: true })).toBe(true);
  });

  it('zwraca false dla niearchiwalnego', () => {
    expect(isLoanArchived({ totalAmount: 100000, currentCapitalLeft: 50000, archived: false })).toBe(false);
  });

  it('zwraca false dla null', () => {
    expect(isLoanArchived(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLoanDisplayName
// ---------------------------------------------------------------------------
describe('getLoanDisplayName', () => {
  it('zwraca name gdy istnieje', () => {
    expect(getLoanDisplayName({ name: 'Kredyt mieszkaniowy', subCategory: 'Inna' })).toBe('Kredyt mieszkaniowy');
  });

  it('zwraca subCategory gdy brak name', () => {
    expect(getLoanDisplayName({ name: '', subCategory: 'Kredyt hipoteczny' })).toBe('Kredyt hipoteczny');
  });

  it('zwraca "Kredyt" gdy brak name i subCategory', () => {
    expect(getLoanDisplayName({ name: '', subCategory: '' })).toBe('Kredyt');
  });

  it('zwraca "Kredyt" dla null', () => {
    expect(getLoanDisplayName(null)).toBe('Kredyt');
  });

  it('ignoruje whitespace w name', () => {
    expect(getLoanDisplayName({ name: '   ', subCategory: 'Meble' })).toBe('Meble');
  });
});

// ---------------------------------------------------------------------------
// getLoanTotalAmount / getLoanPaidAmount / getLoanPaidPercent
// ---------------------------------------------------------------------------
describe('getLoanTotalAmount', () => {
  it('zwraca totalAmount', () => {
    expect(getLoanTotalAmount({ totalAmount: 250000 })).toBe(250000);
  });

  it('zwraca 0 dla null', () => {
    expect(getLoanTotalAmount(null)).toBe(0);
  });

  it('zwraca 0 gdy brak pola', () => {
    expect(getLoanTotalAmount({})).toBe(0);
  });
});

describe('getLoanPaidAmount', () => {
  it('oblicza zapłaconą kwotę', () => {
    expect(getLoanPaidAmount({ totalAmount: 100000, currentCapitalLeft: 60000 })).toBe(40000);
  });

  it('zwraca 0 gdy nic nie zapłacono', () => {
    expect(getLoanPaidAmount({ totalAmount: 100000, currentCapitalLeft: 100000 })).toBe(0);
  });

  it('zwraca 0 zamiast wartości ujemnej (currentCapitalLeft > totalAmount)', () => {
    expect(getLoanPaidAmount({ totalAmount: 50000, currentCapitalLeft: 60000 })).toBe(0);
  });

  it('zwraca 0 dla null', () => {
    expect(getLoanPaidAmount(null)).toBe(0);
  });
});

describe('getLoanPaidPercent', () => {
  it('oblicza procent spłaty', () => {
    expect(getLoanPaidPercent({ totalAmount: 100000, currentCapitalLeft: 75000 })).toBeCloseTo(25, 5);
  });

  it('zwraca 0 gdy totalAmount === 0', () => {
    expect(getLoanPaidPercent({ totalAmount: 0, currentCapitalLeft: 0 })).toBe(0);
  });

  it('zwraca 100% dla w pełni spłaconego kredytu', () => {
    expect(getLoanPaidPercent({ totalAmount: 100000, currentCapitalLeft: 0 })).toBe(100);
  });

  it('zwraca 0% dla kredytu bez spłat', () => {
    expect(getLoanPaidPercent({ totalAmount: 100000, currentCapitalLeft: 100000 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// advanceLoanDueDate
// ---------------------------------------------------------------------------
describe('advanceLoanDueDate', () => {
  it('zwraca pusty string dla pustego wejścia', () => {
    expect(advanceLoanDueDate('')).toBe('');
    expect(advanceLoanDueDate(null)).toBe('');
  });

  it('przesuwa datę o miesiąc do przodu', () => {
    expect(advanceLoanDueDate('2024-03-15')).toBe('2024-04-15');
  });

  it('przesuwa z grudnia do stycznia następnego roku', () => {
    expect(advanceLoanDueDate('2024-12-10')).toBe('2025-01-10');
  });

  it('obsługuje koniec miesiąca (31 sty → overflow do marca w roku przestępnym)', () => {
    const result = advanceLoanDueDate('2024-01-31');
    // JS: setMonth(1) na 31 sty 2024 → luty ma 29 dni → overflow do 2 marca
    expect(result).toBe('2024-03-02');
  });

  it('zwraca oryginał dla niepoprawnej daty', () => {
    expect(advanceLoanDueDate('not-a-date')).toBe('not-a-date');
  });
});

// ---------------------------------------------------------------------------
// getMonthDateBounds
// ---------------------------------------------------------------------------
describe('getMonthDateBounds', () => {
  it('zwraca pierwszy i ostatni dzień miesiąca', () => {
    const date = new Date(2024, 0, 15); // 15 sty 2024
    const { startDate, endDate } = getMonthDateBounds(date);
    expect(startDate).toBe('2024-01-01');
    expect(endDate).toBe('2024-01-31');
  });

  it('obsługuje luty w roku przestępnym', () => {
    const date = new Date(2024, 1, 10); // luty 2024
    const { startDate, endDate } = getMonthDateBounds(date);
    expect(startDate).toBe('2024-02-01');
    expect(endDate).toBe('2024-02-29');
  });

  it('obsługuje luty w roku nieprzestępnym', () => {
    const date = new Date(2023, 1, 1); // luty 2023
    const { endDate } = getMonthDateBounds(date);
    expect(endDate).toBe('2023-02-28');
  });

  it('obsługuje grudzień', () => {
    const date = new Date(2024, 11, 1); // grudzień 2024
    const { startDate, endDate } = getMonthDateBounds(date);
    expect(startDate).toBe('2024-12-01');
    expect(endDate).toBe('2024-12-31');
  });

  it('używa bieżącego miesiąca gdy nie podano daty', () => {
    const { startDate, endDate } = getMonthDateBounds();
    const now = new Date();
    expect(startDate).toMatch(/^\d{4}-\d{2}-01$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(startDate.substring(0, 7)).toBe(endDate.substring(0, 7));
    expect(startDate.substring(0, 4)).toBe(String(now.getFullYear()));
  });
});

// ---------------------------------------------------------------------------
// daysUntilDate
// ---------------------------------------------------------------------------
describe('daysUntilDate', () => {
  it('zwraca null dla pustego stringa', () => {
    expect(daysUntilDate('')).toBeNull();
    expect(daysUntilDate(null)).toBeNull();
  });

  it('zwraca null dla niepoprawnej daty', () => {
    expect(daysUntilDate('invalid')).toBeNull();
  });

  it('zwraca 0 dla dzisiejszej daty', () => {
    const today = new Date().toISOString().substring(0, 10);
    expect(daysUntilDate(today)).toBe(0);
  });

  it('zwraca liczbę ujemną dla daty w przeszłości', () => {
    expect(daysUntilDate('2000-01-01')).toBeLessThan(0);
  });

  it('zwraca liczbę dodatnią dla daty w przyszłości', () => {
    expect(daysUntilDate('2099-12-31')).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isMortgageLoan
// ---------------------------------------------------------------------------
describe('isMortgageLoan', () => {
  it('rozpoznaje kredyt hipoteczny po subCategory', () => {
    expect(isMortgageLoan({ subCategory: 'Kredyt hipoteczny', name: '' })).toBe(true);
  });

  it('rozpoznaje kredyt Pekao SA', () => {
    expect(isMortgageLoan({ subCategory: 'Kredyt Pekao SA', name: '' })).toBe(true);
  });

  it('rozpoznaje kredyt po słowie hipoteczny w name', () => {
    expect(isMortgageLoan({ subCategory: '', name: 'Kredyt hipoteczny ING' })).toBe(true);
  });

  it('nie rozpoznaje zwykłego kredytu jako hipoteczny', () => {
    expect(isMortgageLoan({ subCategory: 'Meble', name: 'Kredyt na meble' })).toBe(false);
  });

  it('zwraca false dla null', () => {
    expect(isMortgageLoan(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLoanCapitalLeft (wymaga appState)
// ---------------------------------------------------------------------------
describe('getLoanCapitalLeft', () => {
  it('zwraca 0 gdy brak aktywnych kredytów', () => {
    globalThis.appState = { loans: [] };
    expect(getLoanCapitalLeft()).toBe(0);
  });

  it('sumuje currentCapitalLeft aktywnych kredytów', () => {
    globalThis.appState = {
      loans: [
        { id: 'l1', totalAmount: 100000, currentCapitalLeft: 60000, archived: false },
        { id: 'l2', totalAmount: 200000, currentCapitalLeft: 150000, archived: false }
      ]
    };
    expect(getLoanCapitalLeft()).toBe(210000);
  });

  it('wyklucza zarchiwizowane kredyty', () => {
    globalThis.appState = {
      loans: [
        { id: 'l1', totalAmount: 100000, currentCapitalLeft: 0, archived: true },
        { id: 'l2', totalAmount: 200000, currentCapitalLeft: 150000, archived: false }
      ]
    };
    expect(getLoanCapitalLeft()).toBe(150000);
  });
});

// ---------------------------------------------------------------------------
// getLoanSummaryTotal (wymaga appState + getCreditCardDebtTotal)
// ---------------------------------------------------------------------------
describe('getLoanSummaryTotal', () => {
  it('sumuje kredyty włączone do podsumowania + karty kredytowe', () => {
    globalThis.appState = {
      loans: [
        { id: 'l1', totalAmount: 100000, currentCapitalLeft: 50000, archived: false, includeInSummary: true },
        { id: 'l2', totalAmount: 50000, currentCapitalLeft: 20000, archived: false, includeInSummary: false }
      ]
    };
    globalThis.getActiveCreditCards = () => [{ currentBalance: 5000 }];
    // l1: 50000 + karta: 5000 = 55000
    expect(getLoanSummaryTotal()).toBe(55000);
  });

  it('pomija kredyty z includeInSummary === false', () => {
    globalThis.appState = {
      loans: [
        { id: 'l1', totalAmount: 100000, currentCapitalLeft: 50000, archived: false, includeInSummary: false }
      ]
    };
    globalThis.getActiveCreditCards = () => [];
    expect(getLoanSummaryTotal()).toBe(0);
  });

  it('zwraca 0 gdy brak kredytów i kart', () => {
    globalThis.appState = { loans: [] };
    globalThis.getActiveCreditCards = () => [];
    expect(getLoanSummaryTotal()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calcNetWorthPln (integracja: portfolio - dług)
// ---------------------------------------------------------------------------
describe('calcNetWorthPln', () => {
  it('oblicza net worth jako wartość portfela minus dług', () => {
    globalThis.appState = {
      loans: [{ id: 'l1', totalAmount: 100000, currentCapitalLeft: 50000, archived: false }],
      assets: [{ type: 'cash', amount: 200000, currency: 'PLN' }]
    };
    globalThis.getActiveAssets = () => [{ type: 'cash', amount: 200000, currency: 'PLN' }];
    // net worth = 200000 - 50000 = 150000
    expect(calcNetWorthPln()).toBe(150000);
  });

  it('zwraca wartość ujemną gdy dług > portfel', () => {
    globalThis.appState = {
      loans: [{ id: 'l1', totalAmount: 500000, currentCapitalLeft: 400000, archived: false }],
      assets: []
    };
    globalThis.getActiveAssets = () => [];
    expect(calcNetWorthPln()).toBe(-400000);
  });
});
