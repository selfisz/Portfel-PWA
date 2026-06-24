/**
 * Testy jednostkowe dla js/transactions.js
 *
 * Plik jest ściśle DOM-coupled (UI controller), dlatego:
 * - Testujemy efekty biznesowe (mutacje appState), nie wygląd UI
 * - Używamy szczegółowego mock DOM który symuluje wartości formularza
 * - Pomijamy czysto wizualne funkcje (renderMainCategoriesForm, switchView UI)
 *
 * Szczegółowy mock: makeDomMock() — konfigurowalny builder elementów formularza
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

// ---------------------------------------------------------------------------
// Builder DOM mock
// ---------------------------------------------------------------------------
function makeEl(overrides = {}) {
  return {
    value: '',
    checked: false,
    innerHTML: '',
    innerText: '',
    style: { display: '' },
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c);
        } else {
          force ? this._classes.add(c) : this._classes.delete(c);
        }
      },
      contains(c) { return this._classes.has(c); }
    },
    appendChild: () => {},
    remove: () => {},
    ...overrides
  };
}

/**
 * Buduje pełny mock document.getElementById dla saveTransaction.
 * Parametry odpowiadają wartościom formularza.
 */
function buildFormDom({
  amount = '500',
  date = '2024-06-15',
  note = 'testowa notatka',
  isRecurring = false,
  paidWithCard = false,
  creditCardId = '',
  affectsCash = true,
  linkedAsset = false,
  linkedAssetId = ''
} = {}) {
  const elements = {
    'tx-amount': makeEl({ value: amount }),
    'tx-date': makeEl({ value: date }),
    'tx-note': makeEl({ value: note }),
    'tx-recurring': makeEl({ checked: isRecurring }),
    'tx-credit-card': makeEl({ checked: paidWithCard }),
    'tx-credit-card-select': makeEl({ value: creditCardId }),
    'tx-affects-cash': makeEl({ checked: affectsCash }),
    'tx-linked-asset': makeEl({ checked: linkedAsset }),
    'tx-linked-asset-select': makeEl({ value: linkedAssetId }),
    'form-header': makeEl(),
    'btn-cancel-edit': makeEl(),
    'recurring-wrapper': makeEl(),
    'credit-card-purchase-wrapper': makeEl(),
    'btn-expense': makeEl(),
    'btn-income': makeEl(),
    'btn-loan-payment': makeEl(),
    'btn-card-payment': makeEl(),
    'sub-category-wrapper': makeEl(),
    'sub-category-grid': makeEl({ appendChild: () => {} }),
    'main-category-grid': makeEl({ appendChild: () => {}, innerHTML: '' }),
    'view-title': makeEl(),
    'view-dashboard': makeEl(),
    'view-reports': makeEl(),
    'view-investments': makeEl(),
    'view-loans': makeEl(),
    'view-add': makeEl(),
    'sync-status': makeEl(),
    'tx-income-cash-hint': makeEl(),
    'tx-affects-cash-wrapper': makeEl()
  };

  globalThis.document = {
    getElementById: (id) => elements[id] || makeEl(),
    querySelectorAll: () => ({ forEach: () => {} }),
    querySelector: () => null
  };

  return elements;
}

// ---------------------------------------------------------------------------
// Globalny setup
// ---------------------------------------------------------------------------
beforeAll(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };

  globalThis.stateRef = { set: () => Promise.resolve(), onSnapshot: () => () => {} };
  globalThis.document = {
    getElementById: () => makeEl(),
    querySelectorAll: () => ({ forEach: () => {} })
  };

  // Stuby zależności z innych modułów
  globalThis.mergeCreditCardsById = (...lists) => lists.flat().filter(Boolean);
  globalThis.runCreditCardMigrations = () => false;
  globalThis.runAssetMigrations = () => false;
  globalThis.runCashMigrations = () => false;
  globalThis.runAssetAnalyticsMigrations = () => false;
  globalThis.renderDashboard = () => {};
  globalThis.renderReports = () => {};
  globalThis.renderInvestments = () => {};
  globalThis.renderLoans = () => {};
  globalThis.saveState = () => {};
  globalThis.hapticFeedback = () => {};

  // Stuby sync funkcji (z cash.js, credit-cards.js, assets.js)
  globalThis.syncCashOnTransactionSave = () => true;
  globalThis.syncCashOnTransactionDelete = () => {};
  globalThis.syncAssetOnTransactionSave = () => true;
  globalThis.syncAssetOnTransactionDelete = () => {};
  globalThis.syncCreditCardOnTransactionSave = () => {};
  globalThis.syncCreditCardOnTransactionDelete = () => {};
  globalThis.resolveTransactionAffectsCash = (type, paidWithCard) =>
    type === 'income' ? true : !paidWithCard;
  globalThis.addRecentCategory = () => {};
  globalThis.populateCreditCardSelectors = () => {};
  globalThis.populateTransactionAssetSelect = () => {};
  globalThis.updateAddFormCashHints = () => {};
  globalThis.updateTransactionAssetHints = () => {};
  globalThis.populateAddLoanPaymentForm = () => {};
  globalThis.populateAddCreditCardForm = () => {};
  globalThis.onCreditCardPurchaseToggle = () => {};
  globalThis.createMainCategoryItem = () => makeEl();
  globalThis.createSubCategoryItem = () => makeEl();
  globalThis.renderRecentCategories = () => {};
  globalThis.focusAmountField = () => {};
  globalThis.resetDashboardTxListPagination = () => {};
  globalThis.resetLoanPaymentsListPagination = () => {};

  // Ładujemy zależności
  globalThis.isMortgageLoan = (loan) => /hipoteczn/i.test(loan?.subCategory || '') || /hipoteczn/i.test(loan?.name || '');
  globalThis.normalizeLoan = (raw) => {
    const loan = raw && typeof raw === 'object' ? { ...raw } : {};
    if (!loan.id) loan.id = `loan-${Date.now().toString(36)}`;
    loan.totalAmount = Math.max(0, parseFloat(loan.totalAmount) || 0);
    loan.currentCapitalLeft = Math.max(0, parseFloat(loan.currentCapitalLeft) || 0);
    loan.archived = !!loan.archived;
    loan.includeInSummary = loan.includeInSummary !== false;
    loan.details = typeof normalizeLoanDetails === 'function'
      ? normalizeLoanDetails(loan.details) : (loan.details || {});
    delete loan.lender;
    return loan;
  };
  globalThis.migrateLoansArray = () => {};
  globalThis.isLegacyTestLoan = () => false;

  loadScript('js/constants.js');
  loadScript('js/loan-details.js');
  loadScript('js/portfolio.js');
  loadScript('js/state.js');
  loadScript('js/transactions.js');

  // Bridge do wewnętrznych zmiennych state.js i transactions.js
  runInContext(`
    function _getAppState()          { return appState; }
    function _setAppState(s)         { appState = s; }
    function _getCategoryTree()      { return categoryTree; }
    function _setCategoryTree(t)     { categoryTree = t; }
    function _getFormState()         { return formState; }
    function _setFormState(s)        { formState = s; }
    function _getEditingTxIndex()    { return editingTxIndex; }
    function _setEditingTxIndex(i)   { editingTxIndex = i; }
  `);
});

beforeEach(() => {
  _setAppState({ transactions: [], loans: [], creditCards: [], creditCardMovements: [], assets: [], cashMovements: [], assetSnapshots: [], assetValueHistory: [], categoryBudgets: {} });
  _setCategoryTree(JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)));
  _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: '', selectedSubCategory: '' });
  _setEditingTxIndex(null);

  // Reset synców do domyślnie-sukces
  globalThis.syncCashOnTransactionSave = () => true;
  globalThis.syncAssetOnTransactionSave = () => true;
  globalThis.syncCreditCardOnTransactionSave = () => {};
  globalThis.alert = () => {};
  globalThis.confirm = () => true;
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// saveTransaction — walidacja
// ---------------------------------------------------------------------------
describe('saveTransaction — walidacja', () => {
  it('wywołuje alert gdy brak kwoty', () => {
    const alertSpy = vi.fn();
    globalThis.alert = alertSpy;
    buildFormDom({ amount: '' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(alertSpy).toHaveBeenCalledWith('Uzupełnij kwotę i kategorie.');
    expect(_getAppState().transactions).toHaveLength(0);
  });

  it('wywołuje alert gdy kwota wynosi 0', () => {
    const alertSpy = vi.fn();
    globalThis.alert = alertSpy;
    buildFormDom({ amount: '0' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(alertSpy).toHaveBeenCalled();
    expect(_getAppState().transactions).toHaveLength(0);
  });

  it('wywołuje alert gdy brak głównej kategorii', () => {
    const alertSpy = vi.fn();
    globalThis.alert = alertSpy;
    buildFormDom({ amount: '200' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: '', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(alertSpy).toHaveBeenCalled();
    expect(_getAppState().transactions).toHaveLength(0);
  });

  it('wywołuje alert gdy brak podkategorii', () => {
    const alertSpy = vi.fn();
    globalThis.alert = alertSpy;
    buildFormDom({ amount: '200' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: '' });
    saveTransaction();
    expect(alertSpy).toHaveBeenCalled();
    expect(_getAppState().transactions).toHaveLength(0);
  });

  it('wywołuje alert gdy brak daty', () => {
    const alertSpy = vi.fn();
    globalThis.alert = alertSpy;
    buildFormDom({ amount: '200', date: '' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(alertSpy).toHaveBeenCalled();
    expect(_getAppState().transactions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// saveTransaction — nowa transakcja
// ---------------------------------------------------------------------------
describe('saveTransaction — nowa transakcja', () => {
  it('dodaje transakcję do appState.transactions', () => {
    buildFormDom({ amount: '350', date: '2024-06-15', note: 'test' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    const txs = _getAppState().transactions;
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(350);
    expect(txs[0].type).toBe('expense');
    expect(txs[0].mainCategory).toBe('Dom');
    expect(txs[0].subCategory).toBe('Czynsz');
    expect(txs[0].date).toBe('2024-06-15');
    expect(txs[0].note).toBe('test');
  });

  it('ustawia type na income dla transakcji przychodowej', () => {
    buildFormDom({ amount: '5000', date: '2024-06-01' });
    _setFormState({ formMode: 'income', currentType: 'income', selectedMainCategory: 'Wynagrodzenie', selectedSubCategory: 'Podstawa' });
    saveTransaction();
    expect(_getAppState().transactions[0].type).toBe('income');
  });

  it('NIE ustawia recurringId gdy isRecurring = false', () => {
    buildFormDom({ amount: '100', date: '2024-01-01', isRecurring: false });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Zakupy', selectedSubCategory: 'Zakupy' });
    saveTransaction();
    expect(_getAppState().transactions[0].recurringId).toBeUndefined();
  });

  it('ustawia recurringId gdy isRecurring = true', () => {
    buildFormDom({ amount: '800', date: '2024-01-01', isRecurring: true });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(_getAppState().transactions[0].recurringId).toMatch(/^rec_/);
  });

  it('ustawia creditCardId gdy paidWithCard = true', () => {
    buildFormDom({ amount: '200', date: '2024-01-01', paidWithCard: true, creditCardId: 'card-1' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Zakupy', selectedSubCategory: 'Zakupy' });
    saveTransaction();
    expect(_getAppState().transactions[0].creditCardId).toBe('card-1');
  });

  it('sortuje transakcje malejąco po dacie po zapisie', () => {
    _setAppState({
      ..._getAppState(),
      transactions: [
        { amount: 100, type: 'expense', date: '2024-03-01', mainCategory: 'Dom', subCategory: 'Czynsz' }
      ]
    });
    buildFormDom({ amount: '200', date: '2024-01-01' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Zakupy', selectedSubCategory: 'Zakupy' });
    saveTransaction();
    const txs = _getAppState().transactions;
    expect(txs[0].date >= txs[1].date).toBe(true);
  });

  it('resetuje editingTxIndex po zapisie', () => {
    buildFormDom({ amount: '100', date: '2024-01-01' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(_getEditingTxIndex()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveTransaction — edycja transakcji
// ---------------------------------------------------------------------------
describe('saveTransaction — edycja transakcji', () => {
  it('zastępuje istniejącą transakcję na danym indeksie', () => {
    _setAppState({
      ..._getAppState(),
      transactions: [
        { amount: 100, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz' }
      ]
    });
    _setEditingTxIndex(0);
    buildFormDom({ amount: '999', date: '2024-06-01', note: 'zmieniono' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Zakupy', selectedSubCategory: 'Zakupy' });
    saveTransaction();
    const txs = _getAppState().transactions;
    expect(txs[0].amount).toBe(999);
    expect(txs[0].mainCategory).toBe('Zakupy');
    expect(txs[0].note).toBe('zmieniono');
  });

  it('zachowuje recurringId przy edycji', () => {
    _setAppState({
      ..._getAppState(),
      transactions: [
        { amount: 500, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz', recurringId: 'rec_original' }
      ]
    });
    _setEditingTxIndex(0);
    buildFormDom({ amount: '600', date: '2024-01-01' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(_getAppState().transactions[0].recurringId).toBe('rec_original');
  });

  it('resetuje editingTxIndex po pomyślnej edycji', () => {
    _setAppState({
      ..._getAppState(),
      transactions: [{ amount: 100, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz' }]
    });
    _setEditingTxIndex(0);
    buildFormDom({ amount: '150', date: '2024-01-01' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(_getEditingTxIndex()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveTransaction — rollback przy nieudanym syncCash (po naprawie critical buga)
// ---------------------------------------------------------------------------
describe('saveTransaction — rollback przy błędzie sync (po naprawie buga)', () => {
  it('rollback nowej transakcji gdy syncCash = false (shift)', () => {
    globalThis.syncCashOnTransactionSave = () => false;
    buildFormDom({ amount: '200', date: '2024-01-01' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(_getAppState().transactions).toHaveLength(0);
  });

  it('rollback edytowanej transakcji gdy syncCash = false (przywraca oryginał)', () => {
    const originalTx = { amount: 100, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz' };
    _setAppState({ ..._getAppState(), transactions: [{ ...originalTx }] });
    _setEditingTxIndex(0);
    globalThis.syncCashOnTransactionSave = () => false;
    buildFormDom({ amount: '999', date: '2024-06-01' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Zakupy', selectedSubCategory: 'Zakupy' });
    saveTransaction();
    // Po naprawie: oryginalna transakcja powinna być przywrócona (nie usunięta shift()em)
    const txs = _getAppState().transactions;
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(100);
    expect(txs[0].mainCategory).toBe('Dom');
  });

  it('rollback nowej transakcji gdy syncAsset = false', () => {
    globalThis.syncCashOnTransactionSave = () => true;
    globalThis.syncAssetOnTransactionSave = () => false;
    buildFormDom({ amount: '300', date: '2024-01-01' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Czynsz' });
    saveTransaction();
    expect(_getAppState().transactions).toHaveLength(0);
  });

  it('rollback edytowanej transakcji gdy syncAsset = false (przywraca oryginał)', () => {
    const originalTx = { amount: 50, type: 'expense', date: '2024-02-01', mainCategory: 'Zakupy', subCategory: 'Zakupy' };
    _setAppState({ ..._getAppState(), transactions: [{ ...originalTx }] });
    _setEditingTxIndex(0);
    globalThis.syncCashOnTransactionSave = () => true;
    globalThis.syncAssetOnTransactionSave = () => false;
    buildFormDom({ amount: '777', date: '2024-02-01' });
    _setFormState({ formMode: 'expense', currentType: 'expense', selectedMainCategory: 'Dom', selectedSubCategory: 'Remont' });
    saveTransaction();
    const txs = _getAppState().transactions;
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(50);
    expect(txs[0].mainCategory).toBe('Zakupy');
  });
});

// ---------------------------------------------------------------------------
// deleteTransaction
// ---------------------------------------------------------------------------
describe('deleteTransaction', () => {
  it('usuwa transakcję na podanym indeksie', () => {
    _setAppState({
      ..._getAppState(),
      transactions: [
        { amount: 100, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz' },
        { amount: 200, type: 'expense', date: '2024-01-02', mainCategory: 'Zakupy', subCategory: 'Zakupy' }
      ]
    });
    buildFormDom();
    deleteTransaction(0);
    expect(_getAppState().transactions).toHaveLength(1);
    expect(_getAppState().transactions[0].mainCategory).toBe('Zakupy');
  });

  it('nie usuwa transakcji gdy confirm = false', () => {
    globalThis.confirm = () => false;
    _setAppState({
      ..._getAppState(),
      transactions: [
        { amount: 100, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz' }
      ]
    });
    buildFormDom();
    deleteTransaction(0);
    expect(_getAppState().transactions).toHaveLength(1);
  });

  it('wywołuje sync funkcje przy usuwaniu', () => {
    const cashSpy = vi.fn();
    const assetSpy = vi.fn();
    const cardSpy = vi.fn();
    globalThis.syncCashOnTransactionDelete = cashSpy;
    globalThis.syncAssetOnTransactionDelete = assetSpy;
    globalThis.syncCreditCardOnTransactionDelete = cardSpy;
    _setAppState({
      ..._getAppState(),
      transactions: [{ amount: 100, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz' }]
    });
    buildFormDom();
    deleteTransaction(0);
    expect(cashSpy).toHaveBeenCalledOnce();
    expect(assetSpy).toHaveBeenCalledOnce();
    expect(cardSpy).toHaveBeenCalledOnce();
  });

  it('usuwa poprawny element przy indeksie > 0', () => {
    _setAppState({
      ..._getAppState(),
      transactions: [
        { amount: 100, type: 'expense', date: '2024-01-03', mainCategory: 'Dom', subCategory: 'Czynsz' },
        { amount: 200, type: 'expense', date: '2024-01-02', mainCategory: 'Zakupy', subCategory: 'Zakupy' },
        { amount: 300, type: 'income', date: '2024-01-01', mainCategory: 'Wynagrodzenie', subCategory: 'Podstawa' }
      ]
    });
    buildFormDom();
    deleteTransaction(1); // Usuń środkową
    const txs = _getAppState().transactions;
    expect(txs).toHaveLength(2);
    expect(txs[0].amount).toBe(100);
    expect(txs[1].amount).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// cancelEdit
// ---------------------------------------------------------------------------
describe('cancelEdit', () => {
  it('resetuje editingTxIndex do null', () => {
    _setEditingTxIndex(3);
    buildFormDom();
    cancelEdit();
    expect(_getEditingTxIndex()).toBeNull();
  });
});
