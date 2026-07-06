/**
 * Testy jednostkowe dla js/credit-cards.js i js/loans.js
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
      dataset: {}, style: {}, innerHTML: '', textContent: '', checked: false, disabled: false,
      focus: () => {}
    }),
    querySelector: () => null,
    querySelectorAll: () => ({ forEach: () => {}, length: 0 }),
    addEventListener: () => {},
    body: { style: {} }
  };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
  globalThis.confirm = () => true;
  globalThis.alert = () => {};
  globalThis.setTimeout = (fn) => fn();

  globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
  globalThis.formatTxDate = (d) => d;
  globalThis.escapeHtml = (t) => String(t ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  globalThis.stateRef = { set: () => Promise.resolve(), on: () => {}, off: () => {} };
  globalThis.saveState = () => {};
  globalThis.hapticFeedback = () => {};
  globalThis.showSettingsToast = () => {};
  globalThis.renderCreditCardsSection = () => {};
  globalThis.renderDashboardCreditCards = () => {};
  globalThis.populateCreditCardSelectors = () => {};
  globalThis.renderLoans = () => {};
  globalThis.renderDashboard = () => {};
  globalThis.refreshCurrentView = () => {};
  globalThis.switchView = () => {};
  globalThis.getOrCreateShowMoreButton = () => ({ classList: { add: () => {}, remove: () => {} } });
  globalThis.updateShowMoreButton = () => {};
  globalThis.openLoanDetails = () => {};
  globalThis.openNewLoan = () => {};
  globalThis.openCreditCardDetails = () => {};

  // Stubs dla powiązanych modułów
  globalThis.syncCashForCreditCardMovement = () => ({ id: 'cash-mock' });
  globalThis.syncCashForLoanPayment = (loanId, amount, date) => ({ id: 'cash-mock' });
  globalThis.registerCashMovement = () => ({ id: 'cash-mock' });
  globalThis.adjustCashAssetAmount = () => ({});
  globalThis.getCreditCardDebtTotal = () => 0;
  globalThis.getLoanSummaryTotal = () => 0;
  globalThis.getLoanSummaryCount = () => 0;
  globalThis.getLoanCapitalLeft = () => 0;
  globalThis.getLoanPaidPercent = (loan) => loan.totalAmount > 0 ? Math.round((1 - loan.currentCapitalLeft / loan.totalAmount) * 100) : 0;
  globalThis.getLoanPaidAmount = (loan) => (loan.totalAmount || 0) - (loan.currentCapitalLeft || 0);
  globalThis.getLoanDebtSubcategories = () => ['Spłata', 'Hipoteka'];
  globalThis.getLoanDisplayName = (loan) => loan?.name || loan?.subCategory || 'Kredyt';
  globalThis.transactionMatchesLoan = (tx, loan) => tx.subCategory === loan.subCategory;
  globalThis.renderLoansSummaryChips = () => {};
  globalThis.renderLoanPaymentsFilter = () => {};
  globalThis.renderLoanRecentPayments = () => {};
  globalThis.refreshLoanDetailsPanel = () => {};
  globalThis.setLoanDetailsMode = () => {};
  globalThis.closeLoanDetails = () => {};
  globalThis.renderLoanDetailsHtml = () => '';
  globalThis.hasLoanExtendedDetails = () => false;
  globalThis.isLoanConfigured = (loan) => !!(loan?.subCategory && loan?.totalAmount > 0);
  globalThis.isLoanActive = (loan) => !loan?.archived && (loan?.currentCapitalLeft || 0) > 0;
  globalThis.getArchivedLoans = () => [];
  globalThis.advanceLoanDueDate = (d) => d;

  globalThis.normalizeLoan = (raw) => {
    const l = raw && typeof raw === 'object' ? { ...raw } : {};
    l.id = l.id || `loan-${Date.now().toString(36)}`;
    l.name = l.name || '';
    l.subCategory = l.subCategory || '';
    l.totalAmount = Math.max(0, parseFloat(l.totalAmount) || 0);
    l.currentCapitalLeft = Math.max(0, parseFloat(l.currentCapitalLeft) || 0);
    l.interestRate = Math.max(0, parseFloat(l.interestRate) || 0);
    l.nextInstallmentAmount = Math.max(0, parseFloat(l.nextInstallmentAmount) || 0);
    l.nextInstallmentDue = l.nextInstallmentDue || '';
    l.archived = !!l.archived;
    l.archivedAt = l.archivedAt || '';
    l.includeInSummary = l.includeInSummary !== false;
    l.details = l.details || {};
    return l;
  };
  globalThis.migrateLoansArray = () => {};
  globalThis.isLegacyTestLoan = () => false;
  globalThis.runLoanMigrations = () => false;
  globalThis.runCreditCardMigrations = () => false;
  globalThis.updateLoanInState = (loan) => {
    const normalized = normalizeLoan(loan);
    const idx = (globalThis.appState?.loans || []).findIndex((l) => l.id === normalized.id);
    if (idx >= 0) globalThis.appState.loans[idx] = normalized;
    else globalThis.appState?.loans?.push(normalized);
    if (normalized.currentCapitalLeft === 0 && normalized.totalAmount > 0) normalized.archived = true;
    return normalized;
  };
  globalThis.getLoanById = (id) => {
    if (!id) return null;
    const l = (globalThis.appState?.loans || []).find((l) => l.id === id);
    return l ? normalizeLoan(l) : null;
  };
  globalThis.getLoans = () => (globalThis.appState?.loans || []).map(normalizeLoan);
  globalThis.getActiveLoans = () => getLoans().filter((l) => !l.archived && l.currentCapitalLeft > 0);
  globalThis.LIST_PAGE_SIZE = 20;

  loadScript('js/constants.js');
  loadScript('js/loan-details.js');
  loadScript('js/portfolio.js');
  loadScript('js/state.js');
  loadScript('js/cash.js');
  loadScript('js/credit-cards.js');
  loadScript('js/loans.js');

  runInContext(`
    function _getAppState()   { return appState; }
    function _setAppState(s)  { appState = s; }
    function _setCashStub()   {
      // Pozwól syncCashForLoanPayment działać pomijając adjustCashAssetAmount
      var _origRegisterCash = registerCashMovement;
      registerCashMovement = function(opts) { return { id: 'cash-stub-' + Date.now() }; };
    }
  `);
});

beforeEach(() => {
  _setAppState({
    transactions: [],
    loans: [],
    creditCards: [],
    assets: [{ id: 'asset-cash-total', type: 'cash', amount: 50000 }],
    cashMovements: [],
    assetSnapshots: [],
    assetValueHistory: [],
    categoryBudgets: {},
    creditCardMovements: []
  });
  globalThis.confirm = () => true;
  // Stub getAssetById aby zwracał gotówkę, przez co syncCash działa poprawnie
  globalThis.getAssetById = (id) => {
    const assets = _getAppState().assets || [];
    return assets.find((a) => a.id === id) || null;
  };
  globalThis.updateAssetInState = (a) => {
    const assets = _getAppState().assets || [];
    const idx = assets.findIndex((x) => x.id === a.id);
    if (idx >= 0) assets[idx] = a;
    return a;
  };
});

// ===========================================================================
// credit-cards.js — normalizeCreditCard
// ===========================================================================
describe('normalizeCreditCard', () => {
  it('zwraca kartę z domyślnymi wartościami dla pustego obiektu', () => {
    const card = normalizeCreditCard({});
    expect(card.limit).toBe(0);
    expect(card.currentBalance).toBe(0);
    expect(card.archived).toBe(false);
  });

  it('przycina nazwę', () => {
    const card = normalizeCreditCard({ id: 'c1', name: '  Moja Karta  ' });
    expect(card.name).toBe('Moja Karta');
  });

  it('clampuje currentBalance do limitu gdy za wysoki', () => {
    const card = normalizeCreditCard({ id: 'c1', name: 'Test', limit: 1000, currentBalance: 1500 });
    expect(card.currentBalance).toBe(1000);
  });

  it('zachowuje currentBalance <= limit', () => {
    const card = normalizeCreditCard({ id: 'c1', name: 'Test', limit: 1000, currentBalance: 800 });
    expect(card.currentBalance).toBe(800);
  });

  it('clampuje ujemny limit do 0', () => {
    const card = normalizeCreditCard({ id: 'c1', limit: -500 });
    expect(card.limit).toBe(0);
  });

  it('clampuje ujemny balance do 0', () => {
    const card = normalizeCreditCard({ id: 'c1', limit: 1000, currentBalance: -100 });
    expect(card.currentBalance).toBe(0);
  });

  it('generuje id gdy brak', () => {
    const card = normalizeCreditCard({ name: 'Test', limit: 1000 });
    expect(card.id).toBeTruthy();
    expect(card.id.startsWith('card-')).toBe(true);
  });

  it('zwraca domyślne wartości dla null', () => {
    const card = normalizeCreditCard(null);
    expect(card.limit).toBe(0);
  });
});

describe('getCreditCardRepaymentFullAmount', () => {
  it('zwraca bieżące zadłużenie karty', () => {
    _setAppState({
      ..._getAppState(),
      creditCards: [normalizeCreditCard({ id: 'c1', name: 'mBank', limit: 5000, currentBalance: 1234.5 })]
    });
    expect(getCreditCardRepaymentFullAmount('c1')).toBe(1234.5);
  });

  it('zwraca 0 dla nieistniejącej karty', () => {
    expect(getCreditCardRepaymentFullAmount('brak')).toBe(0);
  });
});

describe('formatCreditCardAmountInputValue', () => {
  it('formatuje kwotę do pola input', () => {
    expect(formatCreditCardAmountInputValue(1500)).toBe('1500');
    expect(formatCreditCardAmountInputValue(1234.5)).toBe('1234.50');
    expect(formatCreditCardAmountInputValue(0)).toBe('');
  });
});

// ===========================================================================
// credit-cards.js — normalizeCreditCardMovement
// ===========================================================================
describe('normalizeCreditCardMovement', () => {
  it('zwraca null dla null/undefined', () => {
    expect(normalizeCreditCardMovement(null)).toBeNull();
    expect(normalizeCreditCardMovement(undefined)).toBeNull();
  });

  it('zwraca null gdy brak cardId', () => {
    expect(normalizeCreditCardMovement({ type: 'repayment', amount: 100 })).toBeNull();
  });

  it('zwraca null gdy amount = 0', () => {
    expect(normalizeCreditCardMovement({ cardId: 'c1', amount: 0, type: 'repayment' })).toBeNull();
  });

  it('normalizuje spłatę (repayment)', () => {
    const result = normalizeCreditCardMovement({ cardId: 'c1', type: 'repayment', amount: 500, date: '2024-01-10' });
    expect(result).toBeTruthy();
    expect(result.type).toBe('repayment');
    expect(result.amount).toBe(500);
    expect(result.cardId).toBe('c1');
  });

  it('normalizuje przelew z karty (transfer_out)', () => {
    const result = normalizeCreditCardMovement({ cardId: 'c1', type: 'transfer_out', amount: 200, date: '2024-01-10' });
    expect(result.type).toBe('transfer_out');
  });

  it('traktuje nieznany typ jako repayment', () => {
    const result = normalizeCreditCardMovement({ cardId: 'c1', type: 'unknown', amount: 100, date: '2024-01-10' });
    expect(result.type).toBe('repayment');
  });

  it('używa lokalnej daty gdy brak date — format YYYY-MM-DD', () => {
    const result = normalizeCreditCardMovement({ cardId: 'c1', type: 'repayment', amount: 100 });
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ===========================================================================
// credit-cards.js — mergeCreditCardsById
// ===========================================================================
describe('mergeCreditCardsById', () => {
  it('zwraca pustą tablicę dla pustych list', () => {
    expect(mergeCreditCardsById([], [])).toEqual([]);
  });

  it('scala dwie listy bez duplikatów', () => {
    const list1 = [{ id: 'c1', name: 'Erste', limit: 8000, currentBalance: 500 }];
    const list2 = [{ id: 'c2', name: 'mBank', limit: 21000, currentBalance: 5000 }];
    const result = mergeCreditCardsById(list1, list2);
    expect(result).toHaveLength(2);
  });

  it('przy duplikacie id wybiera kartę z wyższym score (limit + balance)', () => {
    const old = { id: 'c1', name: 'Stara', limit: 5000, currentBalance: 0 };
    const updated = { id: 'c1', name: 'Nowa', limit: 8000, currentBalance: 500 };
    const result = mergeCreditCardsById([old], [updated]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Nowa');
  });

  it('zachowuje kartę ze starszym limitem gdy score jest wyższy', () => {
    const highLimit = { id: 'c1', name: 'Stara', limit: 10000, currentBalance: 0 };
    const lowLimit = { id: 'c1', name: 'Nowa', limit: 2000, currentBalance: 0 };
    const result = mergeCreditCardsById([highLimit], [lowLimit]);
    expect(result[0].name).toBe('Stara'); // 10000 > 2000
  });

  it('ignoruje null i nieprawidłowe obiekty', () => {
    const result = mergeCreditCardsById([null, undefined, 'invalid', { id: 'c1', limit: 1000 }]);
    expect(result).toHaveLength(1);
  });
});

// ===========================================================================
// credit-cards.js — getCreditCardAvailable
// ===========================================================================
describe('getCreditCardAvailable', () => {
  it('zwraca limit - balance', () => {
    const card = { id: 'c1', name: 'Test', limit: 5000, currentBalance: 1200 };
    expect(getCreditCardAvailable(card)).toBe(3800);
  });

  it('zwraca 0 gdy karta w pełni wykorzystana', () => {
    const card = { id: 'c1', name: 'Test', limit: 5000, currentBalance: 5000 };
    expect(getCreditCardAvailable(card)).toBe(0);
  });

  it('zwraca 0 gdy brak limitu', () => {
    const card = { id: 'c1', name: 'Test', limit: 0, currentBalance: 0 };
    expect(getCreditCardAvailable(card)).toBe(0);
  });

  it('nigdy nie zwraca wartości ujemnej (normalizacja clampuje balance do limitu)', () => {
    const card = { id: 'c1', name: 'Test', limit: 1000, currentBalance: 2000 };
    expect(getCreditCardAvailable(card)).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// credit-cards.js — getActiveCreditCards
// ===========================================================================
describe('getActiveCreditCards', () => {
  it('zwraca pustą tablicę gdy brak kart', () => {
    expect(getActiveCreditCards()).toEqual([]);
  });

  it('zwraca tylko aktywne karty z limitem > 0', () => {
    _setAppState({ ..._getAppState(), creditCards: [
      { id: 'c1', name: 'Aktywna', limit: 5000, currentBalance: 0, archived: false },
      { id: 'c2', name: 'Archiwum', limit: 3000, currentBalance: 0, archived: true },
      { id: 'c3', name: 'Bez limitu', limit: 0, currentBalance: 0, archived: false }
    ]});
    const result = getActiveCreditCards();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });
});

// ===========================================================================
// loans.js — loanDetailRow
// ===========================================================================
describe('loanDetailRow', () => {
  it('zwraca pusty string dla pustej wartości', () => {
    expect(loanDetailRow('Label', '')).toBe('');
    expect(loanDetailRow('Label', null)).toBe('');
    expect(loanDetailRow('Label', undefined)).toBe('');
  });

  it('generuje HTML z labelą i wartością', () => {
    const html = loanDetailRow('Bank', 'Pekao SA');
    expect(html).toContain('Bank');
    expect(html).toContain('Pekao SA');
  });

  it('escapuje label w HTML', () => {
    const html = loanDetailRow('<script>', 'val');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

// ===========================================================================
// loans.js — loanDetailSection
// ===========================================================================
describe('loanDetailSection', () => {
  it('zwraca pusty string gdy brak rowsHtml i noteHtml', () => {
    expect(loanDetailSection('Tytuł', '', '')).toBe('');
    expect(loanDetailSection('Tytuł', null, null)).toBe('');
  });

  it('generuje sekcję z tytułem i wierszami', () => {
    const html = loanDetailSection('Parametry', '<div>row</div>');
    expect(html).toContain('Parametry');
    expect(html).toContain('row');
    expect(html).toContain('<section');
  });

  it('generuje sekcję z notatką', () => {
    const html = loanDetailSection('Nadpłaty', '', 'Brak opłat za nadpłatę');
    expect(html).toContain('Brak opłat za nadpłatę');
  });

  it('escapuje tytuł sekcji', () => {
    const html = loanDetailSection('<b>Tytuł</b>', '<div>x</div>');
    expect(html).not.toContain('<b>Tytuł</b>');
  });
});

// ===========================================================================
// loans.js — registerLoanPayment (integracyjny)
// ===========================================================================
describe('registerLoanPayment', () => {
  beforeEach(() => {
    _setAppState({ ..._getAppState(), loans: [
      { id: 'loan-1', name: 'Kredyt hipoteczny', subCategory: 'Hipoteka',
        totalAmount: 400000, currentCapitalLeft: 350000, interestRate: 6.5,
        nextInstallmentAmount: 2000, nextInstallmentDue: '2024-02-01',
        archived: false, includeInSummary: true }
    ]});
  });

  it('zmniejsza currentCapitalLeft o kwotę spłaty', () => {
    const result = registerLoanPayment('loan-1', 5000, '2024-01-15', 'Spłata');
    expect(result).toBeTruthy();
    expect(result.currentCapitalLeft).toBe(345000);
  });

  it('zwraca null gdy loan nie istnieje', () => {
    expect(registerLoanPayment('brak-id', 1000, '2024-01-01', 'Test')).toBeNull();
  });

  it('zwraca null gdy amount <= 0', () => {
    expect(registerLoanPayment('loan-1', 0, '2024-01-01', 'Test')).toBeNull();
    expect(registerLoanPayment('loan-1', -100, '2024-01-01', 'Test')).toBeNull();
  });

  it('dodaje transakcję do appState.transactions', () => {
    registerLoanPayment('loan-1', 2000, '2024-01-15', 'Rata');
    const tx = _getAppState().transactions.find((t) => t.mainCategory === 'Długi');
    expect(tx).toBeTruthy();
    expect(tx.amount).toBe(2000);
  });

  it('clampuje capitalLeft do 0 (nie ujemny)', () => {
    const result = registerLoanPayment('loan-1', 500000, '2024-01-15', 'Nadpłata');
    if (result) {
      expect(result.currentCapitalLeft).toBeGreaterThanOrEqual(0);
    }
  });
});
