/**
 * Testy jednostkowe dla js/state.js
 *
 * Wyzwanie techniczne: state.js używa `let appState` i `let categoryTree` (nie `var`),
 * więc zmienne są w V8 script scope, niedostępne bezpośrednio z ESM.
 * Rozwiązanie: po załadowaniu state.js wstrzykujemy helper functions przez
 * runInContext(), które mają dostęp do tych zmiennych przez closure.
 *
 * Mockujemy: localStorage, stateRef (Firebase), DOM-dependent functions,
 * mergeCreditCardsById (credit-cards.js — jeszcze nie testowany).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

// ---------------------------------------------------------------------------
// Globalny setup środowiska
// ---------------------------------------------------------------------------
beforeAll(() => {
  // Mock localStorage
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };

  // Mock stateRef (Firebase) — stub bez-operacyjny
  globalThis.stateRef = {
    set: () => Promise.resolve(),
    onSnapshot: () => () => {}
  };

  // Mock DOM functions używanych w saveState / refreshCurrentView
  globalThis.document = {
    getElementById: () => ({ className: '', classList: { contains: () => false } })
  };

  // Stuby z innych modułów
  globalThis.mergeCreditCardsById = (...lists) => lists.flat().filter(Boolean);
  globalThis.runCreditCardMigrations = () => false;
  globalThis.runAssetMigrations = () => false;
  globalThis.runCashMigrations = () => false;
  globalThis.runAssetAnalyticsMigrations = () => false;
  globalThis.renderDashboard = () => {};
  globalThis.renderReports = () => {};
  globalThis.renderAssets = () => {};
  globalThis.renderLoans = () => {};

  // Załaduj zależności w poprawnej kolejności
  loadScript('js/constants.js');

  // Stuby potrzebne przed loan-details.js
  globalThis.isMortgageLoan = (loan) => {
    const sub = loan?.subCategory?.trim() || '';
    const name = loan?.name?.trim() || '';
    return ['Kredyt hipoteczny', 'Kredyt Pekao SA', 'Kredyt na mieszkanie'].includes(sub)
      || /hipoteczn/i.test(sub) || /hipoteczn/i.test(name);
  };
  globalThis.normalizeLoan = (raw) => {
    const loan = raw && typeof raw === 'object' ? { ...raw } : {};
    if (!loan.id) loan.id = `loan-${Date.now().toString(36)}`;
    loan.totalAmount = Math.max(0, parseFloat(loan.totalAmount) || 0);
    loan.currentCapitalLeft = Math.max(0, parseFloat(loan.currentCapitalLeft) || 0);
    loan.interestRate = Math.max(0, parseFloat(loan.interestRate) || 0);
    loan.nextInstallmentAmount = Math.max(0, parseFloat(loan.nextInstallmentAmount) || 0);
    loan.archived = !!loan.archived;
    loan.includeInSummary = loan.includeInSummary !== false;
    loan.details = typeof normalizeLoanDetails === 'function'
      ? normalizeLoanDetails(loan.details) : (loan.details || {});
    delete loan.lender;
    return loan;
  };

  loadScript('js/loan-details.js');
  loadScript('js/portfolio.js');
  loadScript('js/state-limits.js');
  loadScript('js/state.js');
  loadScript('js/recurring-confirm.js');

  // Bridge: helper functions dostępne dla testów przez V8 script scope
  runInContext(`
    function _getAppState()       { return appState; }
    function _setAppState(s)      { appState = s; }
    function _getCategoryTree()   { return categoryTree; }
    function _setCategoryTree(t)  { categoryTree = t; }
    function _getActiveChartCategory()    { return activeChartCategory; }
    function _setActiveChartCategory(v)   { activeChartCategory = v; }
  `);
});

beforeEach(() => {
  _setAppState({
    transactions: [],
    loans: [],
    creditCards: [],
    creditCardMovements: [],
    assets: [],
    cashMovements: [],
    assetSnapshots: [],
    assetValueHistory: [],
    categoryBudgets: {}
  });
  _setCategoryTree(JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)));
  _setActiveChartCategory(null);
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// getPersistedState
// ---------------------------------------------------------------------------
describe('getPersistedState', () => {
  it('zwraca wszystkie wymagane klucze', () => {
    const result = getPersistedState({});
    expect(result).toHaveProperty('transactions');
    expect(result).toHaveProperty('loans');
    expect(result).toHaveProperty('creditCards');
    expect(result).toHaveProperty('creditCardMovements');
    expect(result).toHaveProperty('assets');
    expect(result).toHaveProperty('cashMovements');
    expect(result).toHaveProperty('assetSnapshots');
    expect(result).toHaveProperty('assetValueHistory');
    expect(result).toHaveProperty('categoryTree');
    expect(result).toHaveProperty('categoryBudgets');
  });

  it('zastępuje niepoprawne tablice pustymi tablicami', () => {
    const result = getPersistedState({ transactions: 'zły typ', assets: null, loans: undefined });
    expect(Array.isArray(result.transactions)).toBe(true);
    expect(result.transactions).toHaveLength(0);
    expect(Array.isArray(result.assets)).toBe(true);
    expect(result.assets).toHaveLength(0);
  });

  it('zachowuje poprawne tablice', () => {
    const txs = [{
      amount: 100,
      type: 'expense',
      date: '2024-01-01',
      mainCategory: 'Dom',
      subCategory: 'Czynsz'
    }];
    const result = getPersistedState({ transactions: txs });
    expect(result.transactions[0]).toMatchObject(txs[0]);
  });

  it('używa DEFAULT_CATEGORY_TREE gdy brak categoryTree', () => {
    const result = getPersistedState({});
    expect(result.categoryTree).toBeDefined();
    expect(result.categoryTree.expense).toBeDefined();
    expect(result.categoryTree.income).toBeDefined();
  });

  it('zachowuje niestandardowy categoryTree', () => {
    const customTree = { expense: { Test: ['A', 'B'] }, income: {} };
    const result = getPersistedState({ categoryTree: customTree });
    expect(result.categoryTree).toEqual(customTree);
  });

  it('używa pustego obiektu gdy brak categoryBudgets', () => {
    const result = getPersistedState({});
    expect(result.categoryBudgets).toEqual({});
  });

  it('zachowuje categoryBudgets', () => {
    const budgets = { Dom: 2000, Jedzenie: 500 };
    const result = getPersistedState({ categoryBudgets: budgets });
    expect(result.categoryBudgets).toEqual(budgets);
  });

  it('nie zawiera pól UI (currentType, selectedMainCategory)', () => {
    const result = getPersistedState({
      currentType: 'income',
      selectedMainCategory: 'Dom',
      transactions: []
    });
    expect(result).not.toHaveProperty('currentType');
    expect(result).not.toHaveProperty('selectedMainCategory');
  });

  it('działa dla null — używa aktualnego appState', () => {
    const result = getPersistedState(null);
    expect(result).toHaveProperty('transactions');
  });
});

// ---------------------------------------------------------------------------
// migrateLoanCategoryTree
// ---------------------------------------------------------------------------
describe('migrateLoanCategoryTree', () => {
  it('zwraca false gdy wszystkie podkategorie już istnieją', () => {
    _setCategoryTree({
      expense: { Długi: ['Kredyt hipoteczny', 'Meble', 'Remont', 'Karta kredytowa'] }
    });
    expect(migrateLoanCategoryTree()).toBe(false);
  });

  it('dodaje "Kredyt hipoteczny" gdy brakuje', () => {
    _setCategoryTree({ expense: { Długi: ['Meble', 'Remont'] } });
    const changed = migrateLoanCategoryTree();
    expect(changed).toBe(true);
    expect(_getCategoryTree().expense.Długi[0]).toBe('Kredyt hipoteczny');
  });

  it('dodaje "Meble" gdy brakuje', () => {
    _setCategoryTree({ expense: { Długi: ['Kredyt hipoteczny', 'Remont'] } });
    const changed = migrateLoanCategoryTree();
    expect(changed).toBe(true);
    expect(_getCategoryTree().expense.Długi).toContain('Meble');
  });

  it('dodaje "Remont" gdy brakuje', () => {
    _setCategoryTree({ expense: { Długi: ['Kredyt hipoteczny', 'Meble'] } });
    const changed = migrateLoanCategoryTree();
    expect(changed).toBe(true);
    expect(_getCategoryTree().expense.Długi).toContain('Remont');
  });

  it('zwraca false gdy brak klucza Długi (nie rzuca błędu)', () => {
    _setCategoryTree({ expense: {} });
    expect(migrateLoanCategoryTree()).toBe(false);
  });

  it('zwraca false gdy categoryTree jest null', () => {
    _setCategoryTree(null);
    expect(migrateLoanCategoryTree()).toBe(false);
  });

  it('aktualizuje appState.categoryTree po zmianie', () => {
    _setCategoryTree({ expense: { Długi: ['Meble'] } });
    _setAppState({ ..._getAppState(), categoryTree: undefined });
    migrateLoanCategoryTree();
    expect(_getAppState().categoryTree).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// migrateCategoryData
// ---------------------------------------------------------------------------
describe('migrateCategoryData', () => {
  it('zwraca false gdy brak transakcji do migracji', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { mainCategory: 'Dom', amount: 100 }
    ]});
    expect(migrateCategoryData()).toBe(false);
  });

  it('zmienia "Komunikacja" na "Transport" w transakcjach', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { mainCategory: 'Komunikacja', amount: 50, date: '2024-01-01' },
      { mainCategory: 'Dom', amount: 100, date: '2024-01-02' }
    ]});
    const changed = migrateCategoryData();
    expect(changed).toBe(true);
    const txs = _getAppState().transactions;
    expect(txs[0].mainCategory).toBe('Transport');
    expect(txs[1].mainCategory).toBe('Dom');
  });

  it('zmienia "Komunikacja" na "Transport" w activeChartCategory', () => {
    _setActiveChartCategory('Komunikacja');
    _setAppState({ ..._getAppState(), transactions: [] });
    migrateCategoryData();
    expect(_getActiveChartCategory()).toBe('Transport');
  });

  it('nie zmienia innych kategorii', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { mainCategory: 'Transport', amount: 50, date: '2024-01-01' },
      { mainCategory: 'Zakupy', amount: 80, date: '2024-01-02' }
    ]});
    const changed = migrateCategoryData();
    expect(changed).toBe(false);
    const txs = _getAppState().transactions;
    expect(txs[0].mainCategory).toBe('Transport');
    expect(txs[1].mainCategory).toBe('Zakupy');
  });

  it('migruje recents z localStorage', () => {
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify([
      { mainCategory: 'Komunikacja', subCategory: 'MPK' }
    ]));
    _setAppState({ ..._getAppState(), transactions: [] });
    migrateCategoryData();
    const recents = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY));
    expect(recents[0].mainCategory).toBe('Transport');
  });

  it('obsługuje zepsute dane w localStorage bez rzucania błędu', () => {
    localStorage.setItem(RECENT_CATEGORIES_KEY, 'nie-json-{{{');
    _setAppState({ ..._getAppState(), transactions: [] });
    expect(() => migrateCategoryData()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// migrateLoansArray
// ---------------------------------------------------------------------------
describe('migrateLoansArray', () => {
  it('usuwa stare pole loan i zostawia puste loans gdy brak danych', () => {
    _setAppState({ ..._getAppState(), loan: undefined, loans: [] });
    migrateLoansArray();
    const state = _getAppState();
    expect(state.loans).toEqual([]);
    expect('loan' in state).toBe(false);
  });

  it('konwertuje legacy appState.loan na appState.loans tablicę', () => {
    _setAppState({
      ..._getAppState(),
      loans: [],
      loan: { id: 'loan-abc', totalAmount: 100000, currentCapitalLeft: 80000 }
    });
    const changed = migrateLoansArray();
    expect(changed).toBe(true);
    const state = _getAppState();
    expect(Array.isArray(state.loans)).toBe(true);
    expect('loan' in state).toBe(false);
  });

  it('normalizuje istniejącą tablicę kredytów i usuwa legacy', () => {
    _setAppState({
      ..._getAppState(),
      loans: [
        { id: 'loan-primary', totalAmount: 1, currentCapitalLeft: 1 },
        { id: 'loan-real', totalAmount: 50000, currentCapitalLeft: 30000 }
      ]
    });
    migrateLoansArray();
    const state = _getAppState();
    // loan-primary jest legacy → powinien być usunięty
    expect(state.loans.every((l) => l.id !== 'loan-primary')).toBe(true);
  });

  it('usuwa legacy test loan z appState.loan', () => {
    _setAppState({
      ..._getAppState(),
      loans: [],
      loan: { id: 'loan-primary', totalAmount: 1, currentCapitalLeft: 1 }
    });
    const changed = migrateLoansArray();
    expect(changed).toBe(true);
    const state = _getAppState();
    expect(state.loans).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mergeRemoteTransactions / getTransactionCount
// ---------------------------------------------------------------------------
describe('mergeRemoteTransactions', () => {
  it('scala lokalne i zdalne transakcje bez utraty wpisów', () => {
    const local = { transactions: [
      { amount: 100, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'A' },
      { amount: 200, type: 'expense', date: '2024-02-01', mainCategory: 'Dom', subCategory: 'B' }
    ]};
    const remote = { transactions: [] };
    const merged = mergeRemoteTransactions(local, remote);
    expect(merged).toHaveLength(2);
  });

  it('dodaje brakujące transakcje z chmury', () => {
    const local = { transactions: [] };
    const remote = { transactions: [
      { amount: 50, type: 'income', date: '2024-03-01', mainCategory: 'Wynagrodzenie', subCategory: 'A' }
    ]};
    const merged = mergeRemoteTransactions(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(50);
  });

  it('przy tym samym wpisie nie duplikuje', () => {
    const tx = { amount: 10, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'A' };
    const local = { transactions: [tx] };
    const remote = { transactions: [{ ...tx }] };
    const merged = mergeRemoteTransactions(local, remote);
    expect(merged).toHaveLength(1);
  });

  it('przy różnych wpisach o tej samej liczbie zachowuje oba', () => {
    const local = { transactions: [{ amount: 10, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'A' }] };
    const remote = { transactions: [{ amount: 99, type: 'expense', date: '2024-01-02', mainCategory: 'Dom', subCategory: 'A' }] };
    const merged = mergeRemoteTransactions(local, remote);
    expect(merged).toHaveLength(2);
  });
});

describe('mergeAssetsById', () => {
  it('łączy listy aktywów — późniejsza wygrywa przy konflikcie id', () => {
    const remote = [{ id: 'a1', type: 'cash', amount: 1000 }];
    const local = [{ id: 'a1', type: 'cash', amount: 900 }];
    const merged = mergeAssetsById(remote, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(900);
  });
});

describe('mergeCashMovementsById', () => {
  it('łączy ruchy gotówki — późniejsza wygrywa przy konflikcie id', () => {
    const remote = [{ id: 'm1', delta: 100 }];
    const local = [{ id: 'm1', delta: -50 }];
    const merged = mergeCashMovementsById(remote, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].delta).toBe(-50);
  });
});

describe('getTransactionCount', () => {
  it('zwraca 0 dla pustego stanu', () => {
    expect(getTransactionCount(null)).toBe(0);
    expect(getTransactionCount({})).toBe(0);
  });

  it('liczy transakcje w raw', () => {
    expect(getTransactionCount({
      transactions: [
        { amount: 1, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', subCategory: 'A' },
        { amount: 2, type: 'expense', date: '2024-01-02', mainCategory: 'Dom', subCategory: 'B' }
      ]
    })).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// applyRemoteAppState
// ---------------------------------------------------------------------------
describe('applyRemoteAppState', () => {
  it('zwraca false gdy brak pól UI', () => {
    const raw = { transactions: [], loans: [], assets: [] };
    expect(applyRemoteAppState(raw)).toBe(false);
  });

  it('zwraca true gdy raw ma pola UI', () => {
    const rawWithUi = { currentType: 'income', transactions: [] };
    expect(applyRemoteAppState(rawWithUi)).toBe(true);
  });

  it('ustawia appState na podstawie raw', () => {
    const txs = [{ amount: 200, type: 'income', date: '2024-06-01', mainCategory: 'Wynagrodzenie' }];
    applyRemoteAppState({ transactions: txs, loans: [] });
    expect(_getAppState().transactions).toEqual([{
      amount: 200,
      type: 'income',
      date: '2024-06-01',
      mainCategory: 'Wynagrodzenie',
      subCategory: '[Bez podkategorii]',
      note: ''
    }]);
  });

  it('scala kredyty lokalne z zdalnymi przez mergeLoansById', () => {
    const remote = { loans: [{ id: 'l-remote', totalAmount: 200000, currentCapitalLeft: 180000 }] };
    const local = [{ id: 'l-local', totalAmount: 50000, currentCapitalLeft: 40000 }];
    applyRemoteAppState(remote, [local]);
    const loans = _getAppState().loans.map((l) => l.id);
    expect(loans).toContain('l-remote');
    expect(loans).toContain('l-local');
  });

  it('ustawia categoryTree z załadowanego stanu', () => {
    const customTree = { expense: { MójDom: ['Wynajem'] }, income: {} };
    applyRemoteAppState({ categoryTree: customTree });
    expect(_getCategoryTree()).toEqual(customTree);
  });

  it('obsługuje null bez rzucania błędu', () => {
    expect(() => applyRemoteAppState(null)).not.toThrow();
    expect(Array.isArray(_getAppState().transactions)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkAndProcessRecurringTransactions (po naprawie bugów)
// ---------------------------------------------------------------------------
describe('checkAndProcessRecurringTransactions', () => {
  // Mock saveState żeby nie pisał do Firebase/DOM w testach
  beforeEach(() => {
    globalThis.saveState = () => {};
    globalThis.renderRecurringConfirmOverlay = () => {};
  });

  it('nie zmienia nic gdy brak transakcji cyklicznych', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 100, type: 'expense', date: '2024-01-15', mainCategory: 'Dom' }
    ]});
    checkAndProcessRecurringTransactions();
    expect(_getAppState().transactions).toHaveLength(1);
  });

  it('dodaje oczekujące potwierdzenie cyklicznej transakcji na bieżący miesiąc', () => {
    const pastMonth = '2024-01-15';
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 500, type: 'expense', date: pastMonth, mainCategory: 'Wynagrodzenie', recurringId: 'rec-1' }
    ], pendingRecurringConfirmations: [] });
    checkAndProcessRecurringTransactions();
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const pending = _getAppState().pendingRecurringConfirmations || [];
    const addedThisMonth = pending.some(
      (item) => item.recurringId === 'rec-1' && item.monthKey === currentMonth
    );
    expect(addedThisMonth).toBe(true);
  });

  it('NIE dodaje duplikatu gdy transakcja już jest w bieżącym miesiącu', () => {
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 500, type: 'expense', date: `${currentMonth}-05`, mainCategory: 'Dom', recurringId: 'rec-2' }
    ]});
    checkAndProcessRecurringTransactions();
    const txs = _getAppState().transactions;
    const thisMonthCount = txs.filter((t) => t.recurringId === 'rec-2' && t.date.startsWith(currentMonth)).length;
    expect(thisMonthCount).toBe(1);
  });

  it('ustawia datę oczekującej transakcji na 1. dzień bieżącego miesiąca', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 300, type: 'expense', date: '2024-01-10', mainCategory: 'Dom', recurringId: 'rec-3' }
    ], pendingRecurringConfirmations: [] });
    checkAndProcessRecurringTransactions();
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const pending = _getAppState().pendingRecurringConfirmations || [];
    const added = pending.find((item) => item.recurringId === 'rec-3' && item.monthKey === currentMonth);
    expect(added?.transaction?.date).toBe(`${currentMonth}-01`);
  });

  it('klonuje z najnowszego wpisu (po naprawie buga history[0])', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 300, type: 'expense', date: '2024-01-10', mainCategory: 'Dom', recurringId: 'rec-4' },
      { amount: 450, type: 'expense', date: '2024-02-10', mainCategory: 'Dom', recurringId: 'rec-4' }
    ], pendingRecurringConfirmations: [] });
    checkAndProcessRecurringTransactions();
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const pending = _getAppState().pendingRecurringConfirmations || [];
    const added = pending.find((item) => item.recurringId === 'rec-4' && item.monthKey === currentMonth);
    expect(added?.transaction?.amount).toBe(450);
  });

  it('dodaje wpis do kolejki pendingRecurringConfirmations', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 100, type: 'expense', date: '2024-01-05', mainCategory: 'Dom', recurringId: 'rec-5' }
    ], pendingRecurringConfirmations: [] });
    checkAndProcessRecurringTransactions();
    const pending = _getAppState().pendingRecurringConfirmations || [];
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].recurringId).toBe('rec-5');
  });

  it('obsługuje wiele różnych recurringId niezależnie', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 100, type: 'expense', date: '2024-01-01', mainCategory: 'Dom', recurringId: 'rec-a' },
      { amount: 200, type: 'expense', date: '2024-01-01', mainCategory: 'Zakupy', recurringId: 'rec-b' }
    ], pendingRecurringConfirmations: [] });
    checkAndProcessRecurringTransactions();
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const pending = _getAppState().pendingRecurringConfirmations || [];
    const addedA = pending.some((item) => item.recurringId === 'rec-a' && item.monthKey === currentMonth);
    const addedB = pending.some((item) => item.recurringId === 'rec-b' && item.monthKey === currentMonth);
    expect(addedA).toBe(true);
    expect(addedB).toBe(true);
  });

  it('używa lokalnego czasu (nie UTC) dla bieżącego miesiąca', () => {
    const today = new Date();
    const localMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 50, type: 'expense', date: '2020-01-01', mainCategory: 'Dom', recurringId: 'rec-tz' }
    ], pendingRecurringConfirmations: [] });
    checkAndProcessRecurringTransactions();
    const pending = _getAppState().pendingRecurringConfirmations || [];
    const added = pending.find((item) => item.recurringId === 'rec-tz' && item.monthKey === localMonth);
    expect(added?.transaction?.date).toBe(`${localMonth}-01`);
  });
});

describe('autoRecoverFromCloudBackupIfNeeded', () => {
  beforeEach(() => {
    globalThis.auth = { currentUser: { uid: 'user-1' } };
    globalThis.hasPendingCloudSync = () => false;
    globalThis.isDemoFinanceSession = () => false;
    globalThis.applyBackupPayload = vi.fn(() => Promise.resolve());
    globalThis.getCloudBackupPayload = vi.fn();
    localStorage.removeItem('finanse_auto_cloud_recover_done_user-1');
  });

  it('nie nadpisuje gdy lokalnie są transakcje', async () => {
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 10, type: 'expense', date: '2026-01-01', mainCategory: 'Dom', subCategory: 'A' }
    ]});
    globalThis.getCloudBackupPayload = vi.fn().mockResolvedValue({
      transactionCount: 999,
      data: { transactions: [{ amount: 1, type: 'expense', date: '2026-01-01', mainCategory: 'Dom', subCategory: 'A' }] }
    });
    const recovered = await autoRecoverFromCloudBackupIfNeeded();
    expect(recovered).toBe(false);
    expect(globalThis.applyBackupPayload).not.toHaveBeenCalled();
    expect(isAutoCloudRecoverDone()).toBe(true);
  });

  it('nie przywraca gdy backup ma więcej przez archiwum a lokalnie są aktywne tx', async () => {
    _setAppState({ ..._getAppState(), transactions: [
      { amount: 10, type: 'expense', date: '2026-01-01', mainCategory: 'Dom', subCategory: 'A' }
    ]});
    globalThis.getCloudBackupPayload = vi.fn().mockResolvedValue({
      transactionCount: 15,
      archivedTransactions: new Array(10).fill({ amount: 1, type: 'expense', date: '2025-01-01', mainCategory: 'Dom', subCategory: 'A' }),
      data: { transactions: [{ amount: 1, type: 'expense', date: '2026-01-01', mainCategory: 'Dom', subCategory: 'A' }] }
    });
    const recovered = await autoRecoverFromCloudBackupIfNeeded();
    expect(recovered).toBe(false);
    expect(globalThis.applyBackupPayload).not.toHaveBeenCalled();
    expect(globalThis.getCloudBackupPayload).not.toHaveBeenCalled();
  });

  it('przywraca tylko przy pustym lokalnym stanie', async () => {
    globalThis.getCloudBackupPayload = vi.fn().mockResolvedValue({
      data: { transactions: [{ amount: 10, type: 'expense', date: '2026-01-01', mainCategory: 'Dom', subCategory: 'A' }] }
    });
    const recovered = await autoRecoverFromCloudBackupIfNeeded();
    expect(recovered).toBe(true);
    expect(globalThis.applyBackupPayload).toHaveBeenCalled();
  });
});
