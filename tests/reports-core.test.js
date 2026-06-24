/**
 * Testy jednostkowe dla js/reports-core.js
 *
 * Testujemy czyste funkcje obliczeniowe i filtrowania.
 * Pomijamy DOM-heavy: renderReports, renderReportsCalendar, renderReportsTrendChart, etc.
 * Mockujemy: appState, isLightTheme, localStorage, Chart.js.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };

  globalThis.document = {
    getElementById: () => ({ innerHTML: '', innerText: '', style: {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} }, getContext: () => null }),
    querySelectorAll: () => ({ forEach: () => {} }),
    querySelector: () => null,
    createElement: () => ({ href: '', download: '', click: () => {} }),
    body: { style: {} }
  };
  globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
  globalThis.Blob = class { constructor() {} };
  globalThis.Chart = class { constructor() {}; destroy() {} };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
  globalThis.isLightTheme = () => true;
  globalThis.getThemeCssVar = (name, light) => light;
  globalThis.renderCategoryIcon = () => '';
  globalThis.formatTxDate = (d) => d;
  globalThis.getReportsPeriodContext = undefined;
  globalThis.renderDetectedRecurringList = undefined;
  globalThis.renderReportsCalendarView = undefined;
  globalThis.openCalendarDayPanel = undefined;
  globalThis.getMonthBoundsFromValue = undefined;
  globalThis.getReportsMonthValue = undefined;
  globalThis.storeReportsMonthChartMeta = undefined;
  globalThis.attachReportsMonthChartClick = undefined;
  globalThis.syncReportsCalendarFromContext = undefined;
  globalThis.renderPhase3Reports = undefined;
  globalThis.reportsPeriodMode = undefined;
  globalThis.reportsCalendarView = undefined;
  globalThis.renderReportsYearHeatmap = undefined;

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

  loadScript('js/constants.js');
  loadScript('js/loan-details.js');
  loadScript('js/portfolio.js');   // ← dostarcza localIsoDate
  loadScript('js/state.js');

  // Stub format functions
  globalThis.formatPlnAmount = (n) => `${n} zł`;
  globalThis.formatCompactPln = (n) => String(Math.round(n));
  globalThis.escapeHtml = (t) => String(t ?? '');
  globalThis.escapeCsvField = (v) => String(v ?? '');

  loadScript('js/reports-core.js');

  runInContext(`
    function _getAppState()     { return appState; }
    function _setAppState(s)    { appState = s; }
    function _getReportsCalendarYear()  { return reportsCalendarYear; }
    function _getReportsCalendarMonth() { return reportsCalendarMonth; }
    function _setReportsCalendarYear(v)  { reportsCalendarYear = v; }
    function _setReportsCalendarMonth(v) { reportsCalendarMonth = v; }
    function _setReportsLastPeriod(v)    { reportsLastPeriod = v; }
    function _getReportsViewType() { return reportsViewType; }
    function _setReportsViewType(v) { reportsViewType = v; }
  `);
});

beforeEach(() => {
  _setAppState({ transactions: [], loans: [], creditCards: [], assets: [], cashMovements: [], assetSnapshots: [], assetValueHistory: [], categoryBudgets: {} });
  _setReportsCalendarYear(null);
  _setReportsCalendarMonth(0);
  _setReportsLastPeriod(null);
  globalThis.isLightTheme = () => true;
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// getTransactionYears
// ---------------------------------------------------------------------------
describe('getTransactionYears', () => {
  it('zawiera bieżący rok nawet bez transakcji', () => {
    const years = getTransactionYears();
    expect(years).toContain(new Date().getFullYear());
  });

  it('zwraca lata z transakcji posortowane malejąco', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { date: '2022-06-01', amount: 100, type: 'expense' },
      { date: '2023-03-15', amount: 200, type: 'expense' },
      { date: '2024-01-01', amount: 300, type: 'income' }
    ]});
    const years = getTransactionYears();
    expect(years).toContain(2022);
    expect(years).toContain(2023);
    expect(years).toContain(2024);
    // Malejąco
    for (let i = 0; i < years.length - 1; i++) {
      expect(years[i]).toBeGreaterThanOrEqual(years[i + 1]);
    }
  });

  it('nie duplikuje lat', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { date: '2023-01-01', amount: 100, type: 'expense' },
      { date: '2023-06-15', amount: 200, type: 'expense' },
      { date: '2023-12-31', amount: 300, type: 'income' }
    ]});
    const years = getTransactionYears();
    const count2023 = years.filter((y) => y === 2023).length;
    expect(count2023).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getTransactionsForYear
// ---------------------------------------------------------------------------
describe('getTransactionsForYear', () => {
  beforeEach(() => {
    _setAppState({ ..._getAppState(), transactions: [
      { date: '2022-12-31', amount: 100, type: 'expense' },
      { date: '2023-01-01', amount: 200, type: 'income' },
      { date: '2023-06-15', amount: 300, type: 'expense' },
      { date: '2023-12-31', amount: 400, type: 'income' },
      { date: '2024-01-01', amount: 500, type: 'expense' }
    ]});
  });

  it('zwraca tylko transakcje z danego roku', () => {
    const result = getTransactionsForYear(2023);
    expect(result).toHaveLength(3);
    result.forEach((t) => expect(t.date.startsWith('2023')).toBe(true));
  });

  it('zawiera transakcje z 1 stycznia i 31 grudnia (inkluzywnie)', () => {
    const result = getTransactionsForYear(2023);
    const dates = result.map((t) => t.date);
    expect(dates).toContain('2023-01-01');
    expect(dates).toContain('2023-12-31');
  });

  it('wyklucza transakcje z sąsiednich lat', () => {
    const result = getTransactionsForYear(2023);
    const dates = result.map((t) => t.date);
    expect(dates).not.toContain('2022-12-31');
    expect(dates).not.toContain('2024-01-01');
  });

  it('zwraca pustą tablicę dla roku bez transakcji', () => {
    expect(getTransactionsForYear(2000)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTransactionsForReportsPeriod
// ---------------------------------------------------------------------------
describe('getTransactionsForReportsPeriod', () => {
  beforeEach(() => {
    _setAppState({ ..._getAppState(), transactions: [
      { date: '2023-06-01', amount: 100, type: 'expense' },
      { date: '2024-03-01', amount: 200, type: 'income' }
    ]});
  });

  it('zwraca wszystkie transakcje dla "all"', () => {
    expect(getTransactionsForReportsPeriod('all')).toHaveLength(2);
  });

  it('zwraca transakcje z danego roku dla roku jako string', () => {
    const result = getTransactionsForReportsPeriod('2023');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2023-06-01');
  });
});

// ---------------------------------------------------------------------------
// getExpenseHeatColor
// ---------------------------------------------------------------------------
describe('getExpenseHeatColor', () => {
  it('zwraca "transparent" dla amount = 0', () => {
    expect(getExpenseHeatColor(0, 100)).toBe('transparent');
  });

  it('zwraca "transparent" dla amount <= 0', () => {
    expect(getExpenseHeatColor(-50, 100)).toBe('transparent');
  });

  it('zwraca kolor rgba dla amount > 0 (jasny motyw)', () => {
    globalThis.isLightTheme = () => true;
    const color = getExpenseHeatColor(50, 100);
    expect(color).toMatch(/^rgba\(220, 38, 38, /);
  });

  it('zwraca kolor rgba dla amount > 0 (ciemny motyw)', () => {
    globalThis.isLightTheme = () => false;
    const color = getExpenseHeatColor(50, 100);
    expect(color).toMatch(/^rgba\(248, 113, 113, /);
  });

  it('alpha rośnie gdy amount / maxAmount rośnie', () => {
    globalThis.isLightTheme = () => true;
    const low = getExpenseHeatColor(10, 100);
    const high = getExpenseHeatColor(90, 100);
    const alphaLow = parseFloat(low.match(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/)[1]);
    const alphaHigh = parseFloat(high.match(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/)[1]);
    expect(alphaHigh).toBeGreaterThan(alphaLow);
  });

  it('ogranicza ratio do 1 gdy amount > maxAmount', () => {
    globalThis.isLightTheme = () => true;
    const atMax = getExpenseHeatColor(100, 100);
    const overMax = getExpenseHeatColor(200, 100);
    expect(atMax).toBe(overMax);
  });

  it('obsługuje maxAmount = 0 (brak dzielenia przez zero)', () => {
    expect(() => getExpenseHeatColor(50, 0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getIncomeHeatColor
// ---------------------------------------------------------------------------
describe('getIncomeHeatColor', () => {
  it('zwraca "transparent" dla amount = 0', () => {
    expect(getIncomeHeatColor(0, 100)).toBe('transparent');
  });

  it('zwraca zielony kolor dla income (jasny motyw)', () => {
    globalThis.isLightTheme = () => true;
    expect(getIncomeHeatColor(50, 100)).toMatch(/^rgba\(22, 163, 74, /);
  });

  it('zwraca zielony kolor dla income (ciemny motyw)', () => {
    globalThis.isLightTheme = () => false;
    expect(getIncomeHeatColor(50, 100)).toMatch(/^rgba\(74, 222, 128, /);
  });
});

// ---------------------------------------------------------------------------
// blendCalendarHeat (po naprawie martwego kodu)
// ---------------------------------------------------------------------------
describe('blendCalendarHeat', () => {
  beforeEach(() => { globalThis.isLightTheme = () => true; });

  it('zwraca gradient gdy oba expense i income > 0', () => {
    const result = blendCalendarHeat(100, 200, 50, 100);
    expect(result).toMatch(/^linear-gradient/);
    expect(result).toContain('145deg');
  });

  it('zwraca kolor expense gdy tylko expense > 0', () => {
    const result = blendCalendarHeat(100, 200, 0, 0);
    expect(result).toMatch(/^rgba\(220, 38, 38,/);
  });

  it('zwraca kolor income gdy tylko income > 0', () => {
    const result = blendCalendarHeat(0, 0, 50, 100);
    expect(result).toMatch(/^rgba\(22, 163, 74,/);
  });

  it('zwraca "var(--input-bg)" gdy obydwa = 0', () => {
    expect(blendCalendarHeat(0, 0, 0, 0)).toBe('var(--input-bg)');
  });
});

// ---------------------------------------------------------------------------
// getMonthExpenseTotal (po naprawie timezone)
// ---------------------------------------------------------------------------
describe('getMonthExpenseTotal', () => {
  const txs = [
    { date: '2024-01-01', amount: 100, type: 'expense' },
    { date: '2024-01-15', amount: 200, type: 'expense' },
    { date: '2024-01-31', amount: 150, type: 'expense' },  // ostatni dzień!
    { date: '2024-01-20', amount: 999, type: 'income' },   // income — nie liczy
    { date: '2024-02-01', amount: 500, type: 'expense' }   // poza zakresem
  ];

  it('sumuje wydatki w danym miesiącu', () => {
    expect(getMonthExpenseTotal(2024, 0, txs)).toBe(450); // 100+200+150
  });

  it('uwzględnia ostatni dzień miesiąca (31 sty) — test timezone', () => {
    const result = getMonthExpenseTotal(2024, 0, txs);
    expect(result).toBe(450); // 150 zł z 2024-01-31 musi być uwzględnione
  });

  it('wyklucza income', () => {
    expect(getMonthExpenseTotal(2024, 0, txs)).not.toBe(1449); // bez income
  });

  it('wyklucza transakcje z następnego miesiąca', () => {
    expect(getMonthExpenseTotal(2024, 0, txs)).not.toContain(500);
    expect(getMonthExpenseTotal(2024, 0, txs)).toBe(450);
  });

  it('zwraca 0 dla miesiąca bez wydatków', () => {
    expect(getMonthExpenseTotal(2024, 5, txs)).toBe(0);
  });

  it('obsługuje luty w roku przestępnym (28 dni vs 29)', () => {
    const febTxs = [
      { date: '2024-02-29', amount: 100, type: 'expense' }, // 2024 = rok przestępny
      { date: '2024-03-01', amount: 200, type: 'expense' }  // poza lutym
    ];
    expect(getMonthExpenseTotal(2024, 1, febTxs)).toBe(100);
  });

  it('obsługuje luty w roku nieprzestępnym', () => {
    const febTxs = [
      { date: '2023-02-28', amount: 75, type: 'expense' },
      { date: '2023-03-01', amount: 200, type: 'expense' }
    ];
    expect(getMonthExpenseTotal(2023, 1, febTxs)).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// calcReportsDailyAverage
// ---------------------------------------------------------------------------
describe('calcReportsDailyAverage', () => {
  it('dla "all" — zwraca avg na podstawie ostatnich 30 dni i hint', () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const periodTx = [
      { date: todayStr, amount: 300, type: 'expense' }
    ];
    const { avg, hint } = calcReportsDailyAverage('all', periodTx);
    expect(avg).toBeCloseTo(300 / 30, 5);
    expect(hint).toBe('ostatnie 30 dni');
  });

  it('dla roku liczbowego — oblicza dni od 1 sty do końca roku', () => {
    const periodTx = [
      { date: '2022-06-01', amount: 3650, type: 'expense' }
    ];
    const { avg, hint } = calcReportsDailyAverage('2022', periodTx);
    expect(avg).toBeGreaterThan(0);
    expect(hint).toMatch(/cały rok/);
  });

  it('dla "range" — oblicza avg jako total / dni zakresu', () => {
    const periodTx = [
      { date: '2024-01-01', amount: 100, type: 'expense' },
      { date: '2024-01-10', amount: 200, type: 'expense' }
    ];
    const { avg, hint } = calcReportsDailyAverage('range', periodTx);
    // Zakres: 1 sty — 10 sty = 10 dni
    expect(avg).toBeCloseTo(300 / 10, 5);
    expect(hint).toMatch(/zakres/);
  });

  it('dla "range" bez transakcji — zwraca avg = 0', () => {
    const { avg } = calcReportsDailyAverage('range', []);
    expect(avg).toBe(0);
  });

  it('nie liczy income — tylko expense', () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const periodTx = [
      { date: todayStr, amount: 500, type: 'income' }  // income — nie powinno być liczone
    ];
    const { avg } = calcReportsDailyAverage('all', periodTx);
    expect(avg).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// loadSavingsGoal
// ---------------------------------------------------------------------------
describe('loadSavingsGoal', () => {
  it('zwraca 20 jako domyślną wartość gdy brak w localStorage', () => {
    expect(loadSavingsGoal()).toBe(20);
  });

  it('zwraca zapisaną wartość z localStorage', () => {
    localStorage.setItem(SAVINGS_GOAL_KEY, '35');
    expect(loadSavingsGoal()).toBe(35);
  });

  it('zwraca 20 dla nieprawidłowej wartości w localStorage', () => {
    localStorage.setItem(SAVINGS_GOAL_KEY, 'nie-liczba');
    expect(loadSavingsGoal()).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// buildReportsMonthChartData
// ---------------------------------------------------------------------------
describe('buildReportsMonthChartData', () => {
  const txs2024 = [
    { date: '2024-01-15', amount: 500, type: 'expense' },
    { date: '2024-01-20', amount: 2000, type: 'income' },
    { date: '2024-02-10', amount: 300, type: 'expense' },
    { date: '2024-03-01', amount: 150, type: 'expense' }
  ];

  it('dla roku — zwraca monthLabels i incomeData/expenseData', () => {
    const { monthLabels, incomeData, expenseData } = buildReportsMonthChartData('2024', txs2024);
    expect(monthLabels.length).toBeGreaterThan(0);
    expect(incomeData.length).toBe(monthLabels.length);
    expect(expenseData.length).toBe(monthLabels.length);
  });

  it('dla roku — poprawnie sumuje wydatki w każdym miesiącu', () => {
    const { expenseData } = buildReportsMonthChartData('2024', txs2024);
    // Styczeń (index 0) = 500 zł
    expect(expenseData[0]).toBe(500);
    // Luty (index 1) = 300 zł
    expect(expenseData[1]).toBe(300);
  });

  it('dla roku — poprawnie sumuje wpływy w każdym miesiącu', () => {
    const { incomeData } = buildReportsMonthChartData('2024', txs2024);
    expect(incomeData[0]).toBe(2000); // styczeń
  });

  it('dla "all" — zwraca 12 ostatnich miesięcy', () => {
    const { monthLabels } = buildReportsMonthChartData('all', txs2024);
    expect(monthLabels).toHaveLength(12);
  });

  it('dla "range" z datami — zwraca miesiące w zakresie', () => {
    const { monthLabels } = buildReportsMonthChartData('range', txs2024, '2024-01-01', '2024-03-31');
    expect(monthLabels).toHaveLength(3); // sty, lut, mar
  });

  it('dla "month" — zwraca dni miesiąca', () => {
    const { monthLabels } = buildReportsMonthChartData('month', txs2024, '2024-01-01', '2024-01-31');
    expect(monthLabels).toHaveLength(31);
    expect(monthLabels[0]).toBe('1');
    expect(monthLabels[30]).toBe('31');
  });

  it('zwraca title opisujący tryb', () => {
    const { title: titleYear } = buildReportsMonthChartData('2024', txs2024);
    expect(titleYear).toBeTruthy();
    const { title: titleAll } = buildReportsMonthChartData('all', txs2024);
    expect(titleAll).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// syncReportsCalendarToPeriod
// ---------------------------------------------------------------------------
describe('syncReportsCalendarToPeriod', () => {
  it('dla "all" — ustawia bieżący rok i miesiąc', () => {
    syncReportsCalendarToPeriod('all');
    const now = new Date();
    expect(_getReportsCalendarYear()).toBe(now.getFullYear());
    expect(_getReportsCalendarMonth()).toBe(now.getMonth());
  });

  it('dla konkretnego roku — ustawia ten rok', () => {
    syncReportsCalendarToPeriod('2022');
    expect(_getReportsCalendarYear()).toBe(2022);
  });

  it('dla przeszłego roku — ustawia miesiąc = 11 (grudzień)', () => {
    syncReportsCalendarToPeriod('2020');
    expect(_getReportsCalendarMonth()).toBe(11);
  });

  it('nie nadpisuje gdy period się nie zmienił i rok jest już ustawiony', () => {
    _setReportsLastPeriod('2022');
    _setReportsCalendarYear(2022);
    _setReportsCalendarMonth(5);
    syncReportsCalendarToPeriod('2022'); // ten sam period
    expect(_getReportsCalendarMonth()).toBe(5); // nie zmieniono
  });
});
