/**
 * Testy jednostkowe dla js/reports-phase3.js
 *
 * Testujemy czyste funkcje obliczeniowe.
 * Pomijamy DOM-heavy: renderReportsCompare, renderReportsFlow, renderReportsForecast, etc.
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
    getElementById: () => ({ value: '', classList: { toggle: () => {}, add: () => {}, remove: () => {} }, dataset: {}, style: {}, innerHTML: '' }),
    querySelector: () => null,
    addEventListener: () => {}
  };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }), open: () => null };
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.isLightTheme = () => true;
  globalThis.getThemeCssVar = (n, l) => l;
  globalThis.renderCategoryIcon = () => '';
  globalThis.renderReports = () => {};
  globalThis.syncReportsCalendarToPeriod = () => {};
  globalThis.syncReportsRankToggles = () => {};
  globalThis.renderReportsNetWorth = () => {};
  globalThis.renderReportsDebtDsr = () => {};
  globalThis.renderReportsLoanSummary = () => {};
  globalThis.renderReportsCreditCardSummary = () => {};
  globalThis.renderReportsDebtForecast = () => {};
  globalThis.renderReportsDebtOverpayment = () => {};
  globalThis.renderReportsDebtPaymentsChart = () => {};
  globalThis.renderReportsDebtTrendChart = () => {};
  globalThis.renderReportsDebtSplitChart = () => {};
  globalThis.renderReportsAssetAllocationChart = () => {};
  globalThis.renderReportsCashTrendChart = () => {};
  globalThis.renderReportsAssetsSection = () => {};
  globalThis.renderReportsDebtsSection = () => {};
  globalThis.renderDebtCalendarSection = () => {};
  globalThis.renderReportsYearReview = () => {};
  globalThis.buildReportsPrintHtml = () => '';
  globalThis.isLoanOrDebtPayment = undefined; // zdefiniujemy po załadowaniu
  globalThis.getActiveLoans = () => [];
  globalThis.getActiveCreditCards = () => [];
  globalThis.transactionMatchesLoan = () => false;
  globalThis.getLoanDisplayName = (l) => l?.name || 'Kredyt';
  globalThis.getCreditCardMovementsInRange = () => [];
  globalThis.sumCardRepaymentsInRange = () => 0;
  globalThis.formatTxDate = (d) => d;
  globalThis.formatPlnAmount = (n) => `${n} zł`;
  globalThis.formatCompactPln = (n) => String(Math.round(n));
  globalThis.escapeHtml = (t) => String(t ?? '');
  globalThis.reportsRankLevel = 'main';
  globalThis.reportsChartInstance = null;
  globalThis.reportsTrendChartInstance = null;
  globalThis.reportsYoyChartInstance = null;
  globalThis.reportsDowChartInstance = null;
  globalThis.reportsDebtChartInstance = null;
  globalThis.reportsDebtTrendChartInstance = null;
  globalThis.reportsDebtSplitChartInstance = null;
  globalThis.reportsDebtsTabChartInstance = null;
  globalThis.reportsDebtsTabSplitInstance = null;
  globalThis.reportsDebtPeakChartInstance = null;
  globalThis.reportsAssetAllocationChartInstance = null;
  globalThis.reportsAssetsTabAllocationInstance = null;
  globalThis.reportsCashTrendChartInstance = null;
  globalThis.reportsAssetsTabCashTrendInstance = null;
  globalThis.reportsNetWorthTrendChartInstance = null;
  globalThis.reportsAllocationTrendChartInstance = null;
  globalThis.reportsDiversificationChartInstance = null;

  // Załaduj zależności
  globalThis.isMortgageLoan = (loan) => /hipoteczn/i.test(loan?.subCategory || '');
  globalThis.normalizeLoan = (raw) => {
    const l = raw && typeof raw === 'object' ? { ...raw } : {};
    if (!l.id) l.id = `loan-${Date.now()}`;
    l.totalAmount = Math.max(0, parseFloat(l.totalAmount) || 0);
    l.currentCapitalLeft = Math.max(0, parseFloat(l.currentCapitalLeft) || 0);
    l.archived = !!l.archived;
    l.includeInSummary = l.includeInSummary !== false;
    l.details = l.details || {};
    return l;
  };
  globalThis.migrateLoansArray = () => {};
  globalThis.isLegacyTestLoan = () => false;
  globalThis.mergeCreditCardsById = (...lists) => lists.flat().filter(Boolean);
  globalThis.getTransactionsForReportsPeriod = (period) => {
    if (period === 'all') return globalThis.appState?.transactions || [];
    return (globalThis.appState?.transactions || []).filter((t) => t.date?.startsWith(period));
  };
  globalThis.getTransactionYears = () => [new Date().getFullYear()];

  loadScript('js/constants.js');
  loadScript('js/loan-details.js');
  loadScript('js/portfolio.js');
  loadScript('js/state.js');
  loadScript('js/reports-phase3.js');

  runInContext(`
    function _getAppState()     { return appState; }
    function _setAppState(s)    { appState = s; }
    function _getReportsCalendarYear()  { return reportsCalendarYear; }
    function _getReportsCalendarMonth() { return reportsCalendarMonth; }
    function _setReportsCalendarYear(v)  { reportsCalendarYear = v; }
    function _setReportsCalendarMonth(v) { reportsCalendarMonth = v; }
    function _getAnalysisSection() { return analysisSection; }
    function _setReportsPeriodMode(m) { reportsPeriodMode = m; }
    function _getReportsPeriodMode() { return reportsPeriodMode; }
  `);
});

beforeEach(() => {
  _setAppState({ transactions: [], loans: [], creditCards: [], assets: [], cashMovements: [], assetSnapshots: [], assetValueHistory: [], categoryBudgets: {} });
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// shiftArrayIndex
// ---------------------------------------------------------------------------
describe('shiftArrayIndex', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('przesuwa do przodu o 1', () => {
    expect(shiftArrayIndex(items, 'a', 1)).toBe('b');
    expect(shiftArrayIndex(items, 'c', 1)).toBe('d');
  });

  it('przesuwa do tyłu o 1', () => {
    expect(shiftArrayIndex(items, 'b', -1)).toBe('a');
  });

  it('zawijanie z końca do początku', () => {
    expect(shiftArrayIndex(items, 'd', 1)).toBe('a');
  });

  it('zawijanie z początku do końca', () => {
    expect(shiftArrayIndex(items, 'a', -1)).toBe('d');
  });

  it('zwraca pierwszy element gdy current nie istnieje', () => {
    expect(shiftArrayIndex(items, 'z', 1)).toBe('a');
  });

  it('obsługuje delta = 0 (ten sam element)', () => {
    expect(shiftArrayIndex(items, 'b', 0)).toBe('b');
  });

  it('obsługuje duże delty (modulo)', () => {
    expect(shiftArrayIndex(items, 'a', 8)).toBe('a'); // 8 % 4 = 0
    expect(shiftArrayIndex(items, 'a', 5)).toBe('b'); // 5 % 4 = 1
  });
});

// ---------------------------------------------------------------------------
// summarizePeriod
// ---------------------------------------------------------------------------
describe('summarizePeriod', () => {
  it('oblicza income, expense, balance, savings', () => {
    const tx = [
      { type: 'income', amount: 5000 },
      { type: 'income', amount: 1000 },
      { type: 'expense', amount: 2000 },
      { type: 'expense', amount: 500 }
    ];
    const result = summarizePeriod(tx);
    expect(result.income).toBe(6000);
    expect(result.expense).toBe(2500);
    expect(result.balance).toBe(3500);
    expect(result.savings).toBe(58); // Math.round(3500/6000*100)
  });

  it('zwraca savings = 0 gdy income = 0', () => {
    const result = summarizePeriod([{ type: 'expense', amount: 100 }]);
    expect(result.savings).toBe(0);
    expect(result.balance).toBe(-100);
  });

  it('zwraca ujemne savings gdy wydatki > wpływy', () => {
    const tx = [
      { type: 'income', amount: 1000 },
      { type: 'expense', amount: 1500 }
    ];
    const result = summarizePeriod(tx);
    expect(result.savings).toBe(-50); // Math.round(-500/1000*100)
  });

  it('zwraca 0 dla pustej listy', () => {
    const result = summarizePeriod([]);
    expect(result.income).toBe(0);
    expect(result.expense).toBe(0);
    expect(result.balance).toBe(0);
    expect(result.savings).toBe(0);
  });

  it('savings = 100% gdy nie ma wydatków', () => {
    const result = summarizePeriod([{ type: 'income', amount: 5000 }]);
    expect(result.savings).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// getTransactionsInRange
// ---------------------------------------------------------------------------
describe('getTransactionsInRange', () => {
  beforeEach(() => {
    _setAppState({ ..._getAppState(), transactions: [
      { date: '2024-01-01', amount: 100, type: 'expense' },
      { date: '2024-01-15', amount: 200, type: 'income' },
      { date: '2024-01-31', amount: 300, type: 'expense' },
      { date: '2024-02-01', amount: 400, type: 'expense' }
    ]});
  });

  it('zwraca transakcje w zakresie (inkluzywnie)', () => {
    const result = getTransactionsInRange('2024-01-01', '2024-01-31');
    expect(result).toHaveLength(3);
  });

  it('wyklucza transakcje poza zakresem', () => {
    const result = getTransactionsInRange('2024-01-01', '2024-01-31');
    const dates = result.map((t) => t.date);
    expect(dates).not.toContain('2024-02-01');
  });

  it('zwraca pustą tablicę dla null start/end', () => {
    expect(getTransactionsInRange(null, '2024-12-31')).toEqual([]);
    expect(getTransactionsInRange('2024-01-01', null)).toEqual([]);
  });

  it('zwraca pustą tablicę gdy zakres nie zawiera transakcji', () => {
    expect(getTransactionsInRange('2020-01-01', '2020-12-31')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isLoanOrDebtPayment
// ---------------------------------------------------------------------------
describe('isLoanOrDebtPayment', () => {
  it('rozpoznaje transakcję z mainCategory "Długi"', () => {
    expect(isLoanOrDebtPayment({ type: 'expense', mainCategory: 'Długi', subCategory: 'Meble', note: '' })).toBe(true);
  });

  it('rozpoznaje transakcję z "kredyt" w nazwie', () => {
    expect(isLoanOrDebtPayment({ type: 'expense', mainCategory: 'Dom', subCategory: 'Kredyt', note: '' })).toBe(true);
  });

  it('rozpoznaje transakcję z "rata" w podkategorii', () => {
    expect(isLoanOrDebtPayment({ type: 'expense', mainCategory: 'Dom', subCategory: 'rata', note: '' })).toBe(true);
  });

  it('rozpoznaje po "spłata" w notatce', () => {
    expect(isLoanOrDebtPayment({ type: 'expense', mainCategory: 'Różne', subCategory: 'Różne', note: 'spłata kredytu' })).toBe(true);
  });

  it('NIE rozpoznaje zwykłego wydatku', () => {
    expect(isLoanOrDebtPayment({ type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy', note: '' })).toBe(false);
  });

  it('zwraca false dla income', () => {
    expect(isLoanOrDebtPayment({ type: 'income', mainCategory: 'Długi', subCategory: 'Spłata', note: '' })).toBe(false);
  });

  it('rozpoznaje "hipotec" w podkategorii', () => {
    expect(isLoanOrDebtPayment({ type: 'expense', mainCategory: 'Dom', subCategory: 'hipoteczny', note: '' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRecurringGroupKey
// ---------------------------------------------------------------------------
describe('getRecurringGroupKey', () => {
  it('zwraca "mainCategory|subCategory" dla normalnej podkategorii', () => {
    expect(getRecurringGroupKey({ mainCategory: 'Dom', subCategory: 'Czynsz' })).toBe('Dom|Czynsz');
  });

  it('zwraca "mainCategory|" dla [Bez podkategorii]', () => {
    expect(getRecurringGroupKey({ mainCategory: 'Różne', subCategory: '[Bez podkategorii]' })).toBe('Różne|');
  });
});

// ---------------------------------------------------------------------------
// getExpenseGroupKey
// ---------------------------------------------------------------------------
describe('getExpenseGroupKey', () => {
  it('zwraca mainCategory dla rankLevel "main"', () => {
    expect(getExpenseGroupKey({ mainCategory: 'Dom', subCategory: 'Czynsz' }, 'main')).toBe('Dom');
  });

  it('zwraca "mainCategory|subCategory" dla rankLevel "sub"', () => {
    expect(getExpenseGroupKey({ mainCategory: 'Dom', subCategory: 'Czynsz' }, 'sub')).toBe('Dom|Czynsz');
  });
});

// ---------------------------------------------------------------------------
// getMonthBoundsFromValue (po naprawie timezone)
// ---------------------------------------------------------------------------
describe('getMonthBoundsFromValue', () => {
  it('zwraca poprawny start dla stycznia', () => {
    const { start } = getMonthBoundsFromValue('2024-01');
    expect(start).toBe('2024-01-01');
  });

  it('zwraca poprawny koniec dla stycznia (31 dni) — test timezone', () => {
    const { end } = getMonthBoundsFromValue('2024-01');
    expect(end).toBe('2024-01-31');
  });

  it('zwraca poprawny koniec dla lutego w roku przestępnym', () => {
    const { end } = getMonthBoundsFromValue('2024-02');
    expect(end).toBe('2024-02-29');
  });

  it('zwraca poprawny koniec dla lutego w roku nieprzestępnym', () => {
    const { end } = getMonthBoundsFromValue('2023-02');
    expect(end).toBe('2023-02-28');
  });

  it('zwraca poprawny koniec dla grudnia', () => {
    const { end } = getMonthBoundsFromValue('2024-12');
    expect(end).toBe('2024-12-31');
  });

  it('zwraca year i monthIndex', () => {
    const { year, monthIndex } = getMonthBoundsFromValue('2024-03');
    expect(year).toBe(2024);
    expect(monthIndex).toBe(2); // marzec = index 2 (0-based)
  });
});

// ---------------------------------------------------------------------------
// formatMonthLabel
// ---------------------------------------------------------------------------
describe('formatMonthLabel', () => {
  it('zwraca sformatowaną etykietę z dużej litery', () => {
    const label = formatMonthLabel('2024-01');
    expect(label).toBeTruthy();
    expect(label[0]).toBe(label[0].toUpperCase());
    expect(label).toMatch(/2024/);
  });

  it('zawiera miesiąc po polsku', () => {
    const label = formatMonthLabel('2024-06');
    expect(label.toLowerCase()).toMatch(/czerwiec|czerw/i);
  });
});

// ---------------------------------------------------------------------------
// getManualRecurringEntries
// ---------------------------------------------------------------------------
describe('getManualRecurringEntries', () => {
  it('zwraca pustą tablicę gdy brak cyklicznych transakcji', () => {
    expect(getManualRecurringEntries('main')).toEqual([]);
  });

  it('zwraca wpisy dla transakcji oznaczonych jako cykliczne', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { type: 'expense', amount: 800, date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz', recurringId: 'rec-1' },
      { type: 'expense', amount: 800, date: '2024-02-01', mainCategory: 'Dom', subCategory: 'Czynsz', recurringId: 'rec-1' }
    ]});
    const entries = getManualRecurringEntries('main');
    expect(entries).toHaveLength(1);
    expect(entries[0].mainCategory).toBe('Dom');
    expect(entries[0].amount).toBe(800);
  });

  it('zachowuje kwotę z najnowszego wpisu', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { type: 'expense', amount: 750, date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz', recurringId: 'rec-1' },
      { type: 'expense', amount: 850, date: '2024-02-01', mainCategory: 'Dom', subCategory: 'Czynsz', recurringId: 'rec-1' }
    ]});
    const entries = getManualRecurringEntries('main');
    expect(entries[0].amount).toBe(850); // nowszy wpis
  });

  it('sumuje różne recurringId w tej samej kategorii (rankLevel=main)', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { type: 'expense', amount: 500, date: '2024-01-01', mainCategory: 'Subskrypcje', subCategory: 'Netflix', recurringId: 'rec-a' },
      { type: 'expense', amount: 200, date: '2024-01-01', mainCategory: 'Subskrypcje', subCategory: 'Spotify', recurringId: 'rec-b' }
    ]});
    const entries = getManualRecurringEntries('main');
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(700); // 500 + 200
  });

  it('nie liczy transakcji income', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { type: 'income', amount: 5000, date: '2024-01-01', mainCategory: 'Wynagrodzenie', subCategory: 'Podstawa', recurringId: 'rec-x' }
    ]});
    expect(getManualRecurringEntries('main')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectRecurringExpenses
// ---------------------------------------------------------------------------
describe('detectRecurringExpenses', () => {
  it('zwraca pustą tablicę bez transakcji', () => {
    expect(detectRecurringExpenses('main')).toEqual([]);
  });

  it('nie wykrywa kategorii z tylko 1 miesiącem wydatków', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { type: 'expense', amount: 800, date: '2024-01-15', mainCategory: 'Dom', subCategory: 'Czynsz' }
    ]});
    expect(detectRecurringExpenses('main')).toHaveLength(0);
  });

  it('wykrywa kategorię po 3 miesiącach (bez słowa kluczowego w mainCategory)', () => {
    const now = new Date();
    const makeDate = (offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 10);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
    };
    _setAppState({ ..._getAppState(), transactions: [
      { type: 'expense', amount: 800, date: makeDate(0), mainCategory: 'Dom', subCategory: 'Czynsz' },
      { type: 'expense', amount: 800, date: makeDate(1), mainCategory: 'Dom', subCategory: 'Czynsz' },
      { type: 'expense', amount: 800, date: makeDate(2), mainCategory: 'Dom', subCategory: 'Czynsz' }
    ]});
    const results = detectRecurringExpenses('main');
    expect(results.some((r) => r.mainCategory === 'Dom')).toBe(true);
  });

  it('wykrywa kategorię ze słowem kluczowym w subCategory (rankLevel=sub) po 2 miesiącach', () => {
    const now = new Date();
    const makeDate = (offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 10);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
    };
    _setAppState({ ..._getAppState(), transactions: [
      { type: 'expense', amount: 800, date: makeDate(0), mainCategory: 'Dom', subCategory: 'Czynsz' },
      { type: 'expense', amount: 800, date: makeDate(1), mainCategory: 'Dom', subCategory: 'Czynsz' }
    ]});
    const results = detectRecurringExpenses('sub');
    expect(results.some((r) => r.mainCategory === 'Dom')).toBe(true);
  });

  it('wyniki są posortowane malejąco po amount', () => {
    const now = new Date();
    const makeMonthTx = (offset, main, sub, amount) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 10);
      return { type: 'expense', amount, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`, mainCategory: main, subCategory: sub };
    };
    _setAppState({ ..._getAppState(), transactions: [
      makeMonthTx(0, 'Dom', 'Czynsz', 800),
      makeMonthTx(1, 'Dom', 'Czynsz', 800),
      makeMonthTx(0, 'Rachunki/opłaty', 'Internet', 50),
      makeMonthTx(1, 'Rachunki/opłaty', 'Internet', 50),
    ]});
    const results = detectRecurringExpenses('main');
    if (results.length >= 2) {
      expect(results[0].amount).toBeGreaterThanOrEqual(results[1].amount);
    }
  });
});

// ---------------------------------------------------------------------------
// getAllRecurringEntries
// ---------------------------------------------------------------------------
describe('getAllRecurringEntries', () => {
  it('łączy ręczne i wykryte wpisy', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { type: 'expense', amount: 800, date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Czynsz', recurringId: 'rec-1' }
    ]});
    const entries = getAllRecurringEntries('main');
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('nie duplikuje wpisów które są zarówno ręczne i wykryte', () => {
    const now = new Date();
    const m1 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 10);
    const m2 = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-10`;

    _setAppState({ ..._getAppState(), transactions: [
      { type: 'expense', amount: 800, date: m1, mainCategory: 'Dom', subCategory: 'Czynsz', recurringId: 'rec-1' },
      { type: 'expense', amount: 800, date: m2, mainCategory: 'Dom', subCategory: 'Czynsz', recurringId: 'rec-1' }
    ]});
    const entries = getAllRecurringEntries('main');
    const domEntries = entries.filter((e) => e.mainCategory === 'Dom');
    expect(domEntries).toHaveLength(1);
  });

  it('sortuje malejąco po amount', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { type: 'expense', amount: 100, date: '2024-01-01', mainCategory: 'Zakupy', subCategory: 'X', recurringId: 'rec-a' },
      { type: 'expense', amount: 500, date: '2024-01-01', mainCategory: 'Dom', subCategory: 'Y', recurringId: 'rec-b' }
    ]});
    const entries = getAllRecurringEntries('main');
    if (entries.length >= 2) {
      expect(entries[0].amount).toBeGreaterThanOrEqual(entries[1].amount);
    }
  });
});

// ---------------------------------------------------------------------------
// getSixMonthsAgoDate (po naprawie timezone)
// ---------------------------------------------------------------------------
describe('getSixMonthsAgoDate', () => {
  it('zwraca datę w formacie YYYY-MM-DD', () => {
    expect(getSixMonthsAgoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('zwraca datę w przeszłości', () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(getSixMonthsAgoDate() < todayStr).toBe(true);
  });

  it('zwraca datę około 6 miesięcy temu', () => {
    const result = getSixMonthsAgoDate();
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    const expected = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-${String(sixMonthsAgo.getDate()).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });
});
