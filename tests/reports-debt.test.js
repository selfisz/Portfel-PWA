/**
 * Testy jednostkowe dla js/reports-debt.js
 *
 * Skupiamy się na czystych funkcjach obliczeniowych:
 * getPeriodBoundsFromCtx, monthKeyToDateRange, classifyLoanPaymentAmount,
 * estimateLoanPayoff, estimateAnnualInterest, simulateOverpaymentMonths,
 * buildReportsPrintHtml, getChartParamsFromCtx, analyzeLoanPaymentsInPeriod
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
    querySelectorAll: () => ({ forEach: () => {} }),
    addEventListener: () => {}
  };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.Chart = class { constructor() {} destroy() {} };
  globalThis.isLightTheme = () => true;
  globalThis.getThemeCssVar = (n, l) => l;
  globalThis.formatTxDate = (d) => d;
  globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
  globalThis.formatCompactPln = (n) => String(Math.round(n));
  globalThis.escapeHtml = (t) => String(t ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  globalThis.getReportsChartTheme = () => ({ tooltipBg: '#fff' });
  globalThis.getReportsChartOptions = () => ({});
  globalThis.getChartSliceColors = () => [];
  globalThis.getChartBorderColor = () => '#fff';
  globalThis.getActiveLoans = () => [];
  globalThis.getActiveCreditCards = () => [];
  globalThis.transactionMatchesLoan = () => false;
  globalThis.getLoanDisplayName = (l) => l?.name || 'Kredyt';
  globalThis.getLoanPaidPercent = () => 50;
  globalThis.getLoanCapitalLeft = () => 0;
  globalThis.getLoanSummaryTotal = () => 0;
  globalThis.getLoanById = () => null;
  globalThis.getCreditCardDebtTotal = () => 0;
  globalThis.getCreditCardAvailable = (c) => (c.limit || 0) - (c.currentBalance || 0);
  globalThis.isMortgageLoan = () => false;
  globalThis.openLoanDetails = () => {};
  globalThis.openCreditCardDetails = () => {};
  globalThis.getLiquidityAfterOverpayment = null;
  globalThis.getReportsPeriodContext = () => ({ periodTx: [], mode: 'year', period: '2024' });
  globalThis.renderReportsDebtScenarios = () => {};
  globalThis.reportsDebtTrendChartInstance = null;
  globalThis.reportsDebtSplitChartInstance = null;
  globalThis.reportsDebtsTabChartInstance = null;
  globalThis.reportsDebtsTabSplitInstance = null;
  globalThis.reportsDebtChartInstance = null;

  globalThis.normalizeCreditCardMovement = (m) => m;
  globalThis.isMortgageLoan = (loan) => /hipoteczn/i.test(loan?.subCategory || '');
  globalThis.normalizeLoan = (raw) => {
    const l = raw && typeof raw === 'object' ? { ...raw } : {};
    l.totalAmount = Math.max(0, parseFloat(l.totalAmount) || 0);
    l.currentCapitalLeft = Math.max(0, parseFloat(l.currentCapitalLeft) || 0);
    l.details = l.details || {};
    return l;
  };
  globalThis.migrateLoansArray = () => {};
  globalThis.isLegacyTestLoan = () => false;
  globalThis.mergeCreditCardsById = (...lists) => lists.flat().filter(Boolean);
  globalThis.getTransactionsForReportsPeriod = (p) => globalThis.appState?.transactions || [];
  globalThis.getTransactionYears = () => [];
  globalThis.isLoanOrDebtPayment = (t) => t.mainCategory === 'Długi';
  globalThis.buildReportsMonthChartData = () => ({ monthLabels: [], monthKeys: [] });

  loadScript('js/constants.js');
  loadScript('js/loan-details.js');
  loadScript('js/portfolio.js');
  loadScript('js/state.js');
  loadScript('js/reports-core.js');
  loadScript('js/reports-phase3.js');
  loadScript('js/reports-debt.js');

  runInContext(`
    function _getAppState()    { return appState; }
    function _setAppState(s)   { appState = s; }
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

// ---------------------------------------------------------------------------
// getPeriodBoundsFromCtx
// ---------------------------------------------------------------------------
describe('getPeriodBoundsFromCtx', () => {
  it('zwraca rangeStart/rangeEnd gdy są zdefiniowane', () => {
    const ctx = { rangeStart: '2024-01-01', rangeEnd: '2024-01-31', periodTx: [] };
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    expect(start).toBe('2024-01-01');
    expect(end).toBe('2024-01-31');
  });

  it('zwraca rok 2024 gdy mode=year i period="2024"', () => {
    const ctx = { rangeStart: null, rangeEnd: null, mode: 'year', period: '2024', periodTx: [] };
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    expect(start).toBe('2024-01-01');
    expect(end).toBe('2024-12-31');
  });

  it('zwraca bieżący rok gdy periodTx jest pusta i nie ma zakresu', () => {
    const ctx = { rangeStart: null, rangeEnd: null, mode: 'year', period: 'all', periodTx: [] };
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    const y = new Date().getFullYear();
    expect(start).toBe(`${y}-01-01`);
    expect(end).toBe(`${y}-12-31`);
  });

  it('wyznacza zakres z dat transakcji gdy brak jawnego zakresu', () => {
    const ctx = {
      rangeStart: null, rangeEnd: null,
      mode: 'year', period: 'all',
      periodTx: [
        { date: '2024-03-15' },
        { date: '2024-01-01' },
        { date: '2024-06-30' }
      ]
    };
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    expect(start).toBe('2024-01-01');
    expect(end).toBe('2024-06-30');
  });
});

// ---------------------------------------------------------------------------
// monthKeyToDateRange (po naprawie timezone)
// ---------------------------------------------------------------------------
describe('monthKeyToDateRange', () => {
  it('zwraca zakres na konkretny dzień gdy day jest zdefiniowany', () => {
    const key = { year: 2024, month: 0, day: 15 }; // miesiąc 0 = styczeń
    const { start, end } = monthKeyToDateRange(key);
    expect(start).toBe('2024-01-15');
    expect(end).toBe('2024-01-15');
  });

  it('zwraca zakres całego miesiąca (styczeń = 31 dni) — test timezone', () => {
    const key = { year: 2024, month: 0 }; // styczeń
    const { start, end } = monthKeyToDateRange(key);
    expect(start).toBe('2024-01-01');
    expect(end).toBe('2024-01-31');
  });

  it('zwraca poprawny koniec dla lutego w roku przestępnym', () => {
    const key = { year: 2024, month: 1 }; // luty 2024 (przestępny)
    const { end } = monthKeyToDateRange(key);
    expect(end).toBe('2024-02-29');
  });

  it('zwraca poprawny koniec dla lutego w roku nieprzestępnym', () => {
    const key = { year: 2023, month: 1 }; // luty 2023
    const { end } = monthKeyToDateRange(key);
    expect(end).toBe('2023-02-28');
  });

  it('zwraca poprawny koniec dla grudnia', () => {
    const key = { year: 2024, month: 11 }; // grudzień
    const { end } = monthKeyToDateRange(key);
    expect(end).toBe('2024-12-31');
  });
});

// ---------------------------------------------------------------------------
// getChartParamsFromCtx
// ---------------------------------------------------------------------------
describe('getChartParamsFromCtx', () => {
  it('przekazuje period/rangeStart/rangeEnd dla trybu year', () => {
    const ctx = { mode: 'year', period: '2024', rangeStart: null, rangeEnd: null };
    const result = getChartParamsFromCtx(ctx);
    expect(result.chartPeriod).toBe('2024');
    expect(result.chartRangeStart).toBeNull();
  });

  it('ustawia chartPeriod = "month" dla trybu month', () => {
    const ctx = { mode: 'month', period: 'month', rangeStart: '2024-03-01', rangeEnd: '2024-03-31' };
    const result = getChartParamsFromCtx(ctx);
    expect(result.chartPeriod).toBe('month');
  });

  it('używa zakresu periodA dla trybu compare', () => {
    const ctx = {
      mode: 'compare',
      period: 'compare',
      periodA: { start: '2024-01-01', end: '2024-01-31' },
      rangeStart: null,
      rangeEnd: null
    };
    const result = getChartParamsFromCtx(ctx);
    expect(result.chartPeriod).toBe('range');
    expect(result.chartRangeStart).toBe('2024-01-01');
    expect(result.chartRangeEnd).toBe('2024-01-31');
  });
});

// ---------------------------------------------------------------------------
// classifyLoanPaymentAmount
// ---------------------------------------------------------------------------
describe('classifyLoanPaymentAmount', () => {
  it('klasyfikuje płatność <= 105% raty jako normalną', () => {
    const loan = { nextInstallmentAmount: 1000 };
    const result = classifyLoanPaymentAmount(loan, 1050);
    expect(result.regular).toBe(1050);
    expect(result.over).toBe(0);
  });

  it('klasyfikuje nadpłatę gdy kwota > 105% raty', () => {
    const loan = { nextInstallmentAmount: 1000 };
    const result = classifyLoanPaymentAmount(loan, 1500);
    expect(result.regular).toBe(1000);
    expect(result.over).toBe(500);
  });

  it('zwraca całość jako normalną gdy brak raty (inst = 0)', () => {
    const loan = { nextInstallmentAmount: 0 };
    const result = classifyLoanPaymentAmount(loan, 1000);
    expect(result.regular).toBe(1000);
    expect(result.over).toBe(0);
  });

  it('zwraca całość jako normalną gdy brak pola nextInstallmentAmount', () => {
    const loan = {};
    const result = classifyLoanPaymentAmount(loan, 800);
    expect(result.regular).toBe(800);
    expect(result.over).toBe(0);
  });

  it('dokładnie 105% to jeszcze "normalny" (granica)', () => {
    const loan = { nextInstallmentAmount: 1000 };
    const result = classifyLoanPaymentAmount(loan, 1050); // exactly 1000 * 1.05
    expect(result.regular).toBe(1050);
    expect(result.over).toBe(0);
  });

  it('jeden grosz powyżej 105% to nadpłata', () => {
    const loan = { nextInstallmentAmount: 1000 };
    const result = classifyLoanPaymentAmount(loan, 1051);
    expect(result.regular).toBe(1000);
    expect(result.over).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// estimateAnnualInterest
// ---------------------------------------------------------------------------
describe('estimateAnnualInterest', () => {
  it('zwraca capital * rate/100', () => {
    const loan = { currentCapitalLeft: 100000, interestRate: 7.5 };
    expect(estimateAnnualInterest(loan)).toBe(7500);
  });

  it('zwraca 0 gdy capital = 0', () => {
    const loan = { currentCapitalLeft: 0, interestRate: 7.5 };
    expect(estimateAnnualInterest(loan)).toBe(0);
  });

  it('zwraca 0 gdy rate = 0', () => {
    const loan = { currentCapitalLeft: 100000, interestRate: 0 };
    expect(estimateAnnualInterest(loan)).toBe(0);
  });

  it('zwraca 0 gdy brak pól', () => {
    expect(estimateAnnualInterest({})).toBe(0);
  });

  it('oblicza poprawnie dla bardzo małej stopy', () => {
    const loan = { currentCapitalLeft: 200000, interestRate: 0.01 };
    expect(estimateAnnualInterest(loan)).toBeCloseTo(20);
  });
});

// ---------------------------------------------------------------------------
// simulateOverpaymentMonths
// ---------------------------------------------------------------------------
describe('simulateOverpaymentMonths', () => {
  it('zwraca null gdy brak kapitału', () => {
    const loan = { currentCapitalLeft: 0, nextInstallmentAmount: 1000 };
    expect(simulateOverpaymentMonths(loan, 500)).toBeNull();
  });

  it('zwraca null gdy brak raty', () => {
    const loan = { currentCapitalLeft: 100000, nextInstallmentAmount: 0 };
    expect(simulateOverpaymentMonths(loan, 500)).toBeNull();
  });

  it('oblicza skrócenie spłaty przez nadpłatę', () => {
    const loan = { currentCapitalLeft: 12000, nextInstallmentAmount: 1000, interestRate: 0 };
    const sim = simulateOverpaymentMonths(loan, 200);
    expect(sim).toBeTruthy();
    expect(sim.baseMonths).toBe(12); // 12000 / 1000
    expect(sim.newMonths).toBe(10);  // 12000 / 1200
    expect(sim.savedMonths).toBe(2);
    expect(sim.totalPayment).toBe(1200);
  });

  it('używa remainingInstallments z umowy jako baseMonths gdy dostępne', () => {
    const loan = {
      currentCapitalLeft: 12000,
      nextInstallmentAmount: 1000,
      details: { remainingInstallments: 15 },
      interestRate: 0
    };
    const sim = simulateOverpaymentMonths(loan, 0);
    expect(sim.baseMonths).toBe(15);
  });

  it('nie daje skrócenia przy nadpłacie 0', () => {
    const loan = { currentCapitalLeft: 12000, nextInstallmentAmount: 1000, interestRate: 0 };
    const sim = simulateOverpaymentMonths(loan, 0);
    expect(sim.savedMonths).toBe(0);
  });

  it('obsługuje ujemną nadpłatę (traktuje jako 0)', () => {
    const loan = { currentCapitalLeft: 12000, nextInstallmentAmount: 1000, interestRate: 0 };
    const sim = simulateOverpaymentMonths(loan, -500);
    expect(sim.extraMonthly).toBe(0);
    expect(sim.totalPayment).toBe(1000);
  });

  it('oblicza annualInterestSaved jako przybliżenie', () => {
    const loan = { currentCapitalLeft: 120000, nextInstallmentAmount: 1000, interestRate: 6 };
    // estimateAnnualInterest = 120000 * 0.06 = 7200
    // baseMonths = ceil(120000/1000) = 120, newMonths = ceil(120000/1500) = 80
    // savedMonths = 40, annualInterestSaved = 7200 * (40/12) = 24000
    const sim = simulateOverpaymentMonths(loan, 500);
    expect(sim.annualInterestSaved).toBeCloseTo(7200 * (40 / 12), 0);
  });
});

// ---------------------------------------------------------------------------
// estimateLoanPayoff
// ---------------------------------------------------------------------------
describe('estimateLoanPayoff', () => {
  it('zwraca "Spłacony" gdy capital = 0', () => {
    const loan = { currentCapitalLeft: 0 };
    expect(estimateLoanPayoff(loan).label).toBe('Spłacony');
  });

  it('zwraca endDate gdy jest w details', () => {
    const loan = { currentCapitalLeft: 50000, details: { endDate: '2030-12-01' } };
    const result = estimateLoanPayoff(loan);
    expect(result.label).toBe('2030-12-01');
    expect(result.detail).toBe('termin z umowy');
  });

  it('zwraca liczbę rat gdy remainingInstallments > 0', () => {
    const loan = { currentCapitalLeft: 50000, details: { remainingInstallments: 24 } };
    const result = estimateLoanPayoff(loan);
    expect(result.label).toBe('~24 mies.');
  });

  it('oblicza miesięczność na podstawie nextInstallmentAmount', () => {
    const loan = { currentCapitalLeft: 10000, nextInstallmentAmount: 1000, details: {} };
    const result = estimateLoanPayoff(loan);
    expect(result.label).toBe('~10 mies.');
  });

  it('zwraca "—" gdy brak danych o racie', () => {
    const loan = { currentCapitalLeft: 50000, details: {} };
    const result = estimateLoanPayoff(loan);
    expect(result.label).toBe('—');
    expect(result.detail).toBe('brak danych o racie');
  });
});

// ---------------------------------------------------------------------------
// buildReportsPrintHtml
// ---------------------------------------------------------------------------
describe('buildReportsPrintHtml', () => {
  it('generuje poprawny HTML z nagłówkiem', () => {
    const ctx = {
      label: 'Styczeń 2024',
      periodTx: [
        { date: '2024-01-10', type: 'expense', amount: 100, mainCategory: 'Jedzenie', subCategory: '[Bez podkategorii]', note: '' },
        { date: '2024-01-05', type: 'income', amount: 500, mainCategory: 'Wynagrodzenie', subCategory: '[Bez podkategorii]', note: '' }
      ]
    };
    const html = buildReportsPrintHtml(ctx, 80);
    expect(html).toContain('Styczeń 2024');
    expect(html).toContain('Wpływy');
    expect(html).toContain('Wydatki');
    expect(html).toContain('DOCTYPE html');
  });

  it('sortuje transakcje chronologicznie w tabeli', () => {
    const ctx = {
      label: 'Test',
      periodTx: [
        { date: '2024-01-10', type: 'expense', amount: 100, mainCategory: 'A', subCategory: '[Bez podkategorii]', note: '' },
        { date: '2024-01-03', type: 'expense', amount: 50, mainCategory: 'B', subCategory: '[Bez podkategorii]', note: '' }
      ]
    };
    const html = buildReportsPrintHtml(ctx, 0);
    const pos10 = html.indexOf('2024-01-10');
    const pos03 = html.indexOf('2024-01-03');
    expect(pos03).toBeLessThan(pos10);
  });

  it('escapuje HTML w etykiecie okresu', () => {
    const ctx = {
      label: '<script>alert(1)</script>',
      periodTx: []
    };
    const html = buildReportsPrintHtml(ctx, 0);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('obsługuje pustą listę transakcji', () => {
    const ctx = { label: 'Pusty', periodTx: [] };
    const html = buildReportsPrintHtml(ctx, 0);
    expect(html).toContain('Pusty');
    expect(html).toContain('<tbody>');
  });
});

// ---------------------------------------------------------------------------
// addMonthsToToday (po naprawie timezone)
// ---------------------------------------------------------------------------
describe('addMonthsToToday', () => {
  it('zwraca datę w formacie YYYY-MM-DD', () => {
    expect(addMonthsToToday(1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('zwraca datę w przyszłości dla dodatnich miesięcy', () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(addMonthsToToday(1) > todayStr).toBe(true);
  });

  it('zwraca datę w przeszłości dla ujemnych miesięcy', () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(addMonthsToToday(-1) < todayStr).toBe(true);
  });

  it('zwraca przybliżoną datę po 12 miesiącach (+1 rok)', () => {
    const result = addMonthsToToday(12);
    const expectedYear = new Date().getFullYear() + 1;
    expect(result.startsWith(String(expectedYear))).toBe(true);
  });
});
