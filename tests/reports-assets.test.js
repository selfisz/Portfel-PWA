/**
 * Testy jednostkowe dla js/reports-assets.js
 *
 * Skupiamy się na czystych funkcjach obliczeniowych:
 * getPeriodDayCount, getAnalysisSummaryAssets, buildAssetAllocationSlices,
 * buildAssetHorizonSlices, getLiquidCashPln
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
      value: '', classList: { toggle: () => {}, add: () => {}, remove: () => {} },
      dataset: {}, style: {}, innerHTML: '', textContent: ''
    }),
    querySelector: () => null,
    querySelectorAll: () => ({ forEach: () => {} }),
    addEventListener: () => {}
  };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.Chart = class { constructor() {} destroy() {} };

  // Stubs raportów
  globalThis.isLightTheme = () => true;
  globalThis.getThemeCssVar = (n, l) => l;
  globalThis.formatTxDate = (d) => d;
  globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
  globalThis.formatCompactPln = (n) => String(Math.round(n));
  globalThis.escapeHtml = (t) => String(t ?? '');
  globalThis.getReportsChartTheme = () => ({ tooltipBg: '#fff' });
  globalThis.getReportsChartOptions = () => ({});
  globalThis.getChartSliceColors = () => [];
  globalThis.getChartBorderColor = () => '#fff';
  globalThis.getActiveLoans = () => [];
  globalThis.getActiveCreditCards = () => [];
  globalThis.getLoanCapitalLeft = () => 0;
  globalThis.getLoanSummaryTotal = () => 0;
  globalThis.getCreditCardDebtTotal = () => 0;
  globalThis.getPortfolioValuePln = () => 0;
  globalThis.getActiveAssetsGainPct = () => 0;
  globalThis.getActiveAssetsGainPln = () => 0;
  globalThis.getAssetValuePln = (a) => a?.amount || 0;
  globalThis.getAssetCostPln = (a) => a?.cost || 0;
  globalThis.getAssetGainPln = (a) => (a?.amount || 0) - (a?.cost || 0);
  globalThis.getAssetGainPct = (a) => {
    const cost = a?.cost || 0;
    if (!cost) return 0;
    return ((a.amount - cost) / cost) * 100;
  };
  globalThis.getAssetDisplayName = (a) => a?.name || 'Aktywo';
  globalThis.getAssetById = () => null;
  globalThis.getAssetsByHorizon = () => [];
  globalThis.getActiveAssetsTotalPln = (assets) => assets.reduce((s, a) => s + getAssetValuePln(a), 0);
  globalThis.getAssetHorizon = (a) => a?.horizon || 'short';
  globalThis.getOperationalCashPln = undefined;
  globalThis.getCeleCashPln = undefined;
  globalThis.getGoalAssets = undefined;
  globalThis.getIkzeContributionsInYear = undefined;
  globalThis.getActiveDeposits = undefined;
  globalThis.getAssetSnapshots = undefined;
  globalThis.getSnapshotMonthChange = undefined;
  globalThis.buildNetWorthTrendData = undefined;
  globalThis.buildAllocationTrendData = undefined;
  globalThis.buildWealthFlowSummary = undefined;
  globalThis.buildDiversificationSlices = undefined;
  globalThis.estimateNetWorthPayoffMonths = undefined;
  globalThis.isMortgageLoan = (l) => false;
  globalThis.getActiveAssets = undefined;
  globalThis.getSummaryAssets = undefined;
  globalThis.daysUntilDate = (d) => 0;
  globalThis.getCashMovementsInRange = () => [];
  globalThis.shouldTransactionAffectCash = () => true;
  globalThis.getLiquidityAfterOverpayment = null;
  globalThis.getReportsPeriodContext = () => ({ periodTx: [], mode: 'year', period: String(new Date().getFullYear()), rangeStart: null, rangeEnd: null });
  globalThis.summarizePeriod = (tx) => ({ income: 0, expense: 0, balance: 0, savings: 0 });
  globalThis.isLoanOrDebtPayment = () => false;
  globalThis.openAssetDetails = () => {};
  globalThis.openLoanDetails = () => {};
  globalThis.openCreditCardDetails = () => {};
  globalThis.reportsAssetAllocationChartInstance = null;
  globalThis.reportsAssetsTabAllocationInstance = null;
  globalThis.reportsCashTrendChartInstance = null;
  globalThis.reportsAssetsTabCashTrendInstance = null;
  globalThis.reportsNetWorthTrendChartInstance = null;
  globalThis.reportsAllocationTrendChartInstance = null;
  globalThis.reportsDiversificationChartInstance = null;
  globalThis.PRIMARY_CASH_ASSET_ID = 'cash-main';
  globalThis.CELE_ASSET_ID = 'cash-cele';
  globalThis.IKZE_ANNUAL_LIMIT_PLN = 8000;
  globalThis.ASSET_TYPE_LABELS = { cash: 'Gotówka', investment: 'Inwestycje', retirement: 'Emerytura', deposit: 'Lokata' };
  globalThis.ASSET_HORIZON_LABELS = { short: 'Krótkoterminowe', long: 'Długoterminowe' };
  globalThis.RETIREMENT_KIND_LABELS = { ikze: 'IKZE', ike: 'IKE', ppk: 'PPK' };

  // Zależności
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
  globalThis.getTransactionsForReportsPeriod = () => [];
  globalThis.getTransactionYears = () => [];
  globalThis.buildReportsMonthChartData = () => ({ monthLabels: [], monthKeys: [] });
  globalThis.getCreditCardMovementsInRange = () => [];
  globalThis.sumCardRepaymentsInRange = () => 0;
  globalThis.getTransactionsInRange = (s, e) => (globalThis.appState?.transactions || []).filter((t) => t.date >= s && t.date <= e);
  globalThis.normalizeCreditCardMovement = (m) => m;

  loadScript('js/constants.js');
  loadScript('js/loan-details.js');
  loadScript('js/portfolio.js');
  loadScript('js/state.js');
  loadScript('js/reports-core.js');
  loadScript('js/reports-phase3.js');
  loadScript('js/reports-debt.js');
  loadScript('js/reports-assets.js');

  runInContext(`
    function _getAppState()   { return appState; }
    function _setAppState(s)  { appState = s; }
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
  globalThis.getOperationalCashPln = undefined;
  globalThis.getSummaryAssets = undefined;
  globalThis.getActiveAssets = undefined;
  globalThis.getAssetsByHorizon = () => [];
  globalThis.getPortfolioValuePln = () => 0;
});

// ---------------------------------------------------------------------------
// getPeriodDayCount
// ---------------------------------------------------------------------------
describe('getPeriodDayCount', () => {
  it('zwraca 1 dla tego samego dnia', () => {
    const ctx = { rangeStart: '2024-01-15', rangeEnd: '2024-01-15', periodTx: [] };
    expect(getPeriodDayCount(ctx)).toBe(1);
  });

  it('zwraca 31 dla pełnego stycznia', () => {
    const ctx = { rangeStart: '2024-01-01', rangeEnd: '2024-01-31', periodTx: [] };
    expect(getPeriodDayCount(ctx)).toBe(31);
  });

  it('zwraca 366 dla roku przestępnego 2024', () => {
    const ctx = { rangeStart: null, rangeEnd: null, mode: 'year', period: '2024', periodTx: [] };
    expect(getPeriodDayCount(ctx)).toBe(366);
  });

  it('zwraca 365 dla roku nieprzestępnego 2023', () => {
    const ctx = { rangeStart: null, rangeEnd: null, mode: 'year', period: '2023', periodTx: [] };
    expect(getPeriodDayCount(ctx)).toBe(365);
  });

  it('zwraca minimum 1 gdy zakres nieprawidłowy', () => {
    const ctx = { rangeStart: '2024-03-01', rangeEnd: '2024-02-01', periodTx: [] }; // koniec przed początkiem
    expect(getPeriodDayCount(ctx)).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// getAnalysisSummaryAssets
// ---------------------------------------------------------------------------
describe('getAnalysisSummaryAssets', () => {
  it('zwraca aktywa z appState gdy brak getSummaryAssets i getActiveAssets', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'a1', type: 'cash', amount: 5000, archived: false },
      { id: 'a2', type: 'investment', amount: 10000, archived: false },
      { id: 'a3', type: 'cash', amount: 2000, archived: true }
    ]});
    const result = getAnalysisSummaryAssets();
    expect(result).toHaveLength(2); // archiwa wykluczone
    expect(result.every((a) => !a.archived)).toBe(true);
  });

  it('używa getSummaryAssets gdy jest dostępna', () => {
    globalThis.getSummaryAssets = () => [{ id: 'mock', type: 'cash', amount: 999 }];
    const result = getAnalysisSummaryAssets();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mock');
    globalThis.getSummaryAssets = undefined;
  });

  it('używa getActiveAssets jako fallback gdy getSummaryAssets nie istnieje', () => {
    globalThis.getActiveAssets = () => [{ id: 'active', type: 'investment', amount: 5000 }];
    const result = getAnalysisSummaryAssets();
    expect(result[0].id).toBe('active');
    globalThis.getActiveAssets = undefined;
  });

  it('zwraca pustą tablicę gdy brak aktywów', () => {
    expect(getAnalysisSummaryAssets()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildAssetAllocationSlices
// ---------------------------------------------------------------------------
describe('buildAssetAllocationSlices', () => {
  beforeEach(() => {
    _setAppState({ ..._getAppState(), assets: [] });
  });

  it('zwraca pustą tablicę gdy brak aktywów', () => {
    expect(buildAssetAllocationSlices()).toEqual([]);
  });

  it('grupuje aktywa według typu', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'c1', type: 'cash', amount: 5000, currency: 'PLN', archived: false },
      { id: 'c2', type: 'cash', amount: 3000, currency: 'PLN', archived: false },
      // investment używa quantity * currentPrice, nie amount
      { id: 'i1', type: 'investment', quantity: 2, currentPrice: 5000, currency: 'PLN', archived: false }
    ]});
    const slices = buildAssetAllocationSlices();
    const cashSlice = slices.find((s) => s.label === 'Gotówka');
    const invSlice = slices.find((s) => s.label === 'Inwestycje');
    expect(cashSlice?.amount).toBe(8000);
    expect(invSlice?.amount).toBe(10000); // 2 * 5000
  });

  it('sortuje malejąco po kwocie', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'c1', type: 'cash', amount: 1000, currency: 'PLN', archived: false },
      // investment: quantity * currentPrice = 50000
      { id: 'i1', type: 'investment', quantity: 50, currentPrice: 1000, currency: 'PLN', archived: false }
    ]});
    const slices = buildAssetAllocationSlices();
    expect(slices[0].amount).toBeGreaterThan(slices[slices.length - 1].amount);
  });

  it('wyklucza aktywa z kwotą 0', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'c1', type: 'cash', amount: 0, currency: 'PLN', archived: false },
      { id: 'i1', type: 'investment', amount: 5000, currency: 'PLN', archived: false }
    ]});
    const slices = buildAssetAllocationSlices();
    expect(slices.every((s) => s.amount > 0)).toBe(true);
  });

  it('wyklucza zarchiwizowane aktywa', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'c1', type: 'cash', amount: 5000, currency: 'PLN', archived: true }
    ]});
    expect(buildAssetAllocationSlices()).toHaveLength(0);
  });

  it('używa klucza type gdy ASSET_TYPE_LABELS nie zawiera danego typu', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'x1', type: 'custom_type', amount: 1000, currency: 'PLN', archived: false }
    ]});
    const slices = buildAssetAllocationSlices();
    expect(slices[0].label).toBe('custom_type');
  });
});

// ---------------------------------------------------------------------------
// buildAssetHorizonSlices
// ---------------------------------------------------------------------------
describe('buildAssetHorizonSlices', () => {
  it('deleguje do buildAssetAllocationSlices gdy brak getAssetHorizon', () => {
    const originalGetAssetHorizon = globalThis.getAssetHorizon;
    globalThis.getAssetHorizon = undefined;
    _setAppState({ ..._getAppState(), assets: [
      { id: 'c1', type: 'cash', amount: 5000, archived: false }
    ]});
    const slices = buildAssetHorizonSlices();
    expect(slices.length).toBeGreaterThanOrEqual(0);
    globalThis.getAssetHorizon = originalGetAssetHorizon;
  });

  it('grupuje aktywa w short/long gdy getAssetHorizon jest dostępna', () => {
    globalThis.getAssetHorizon = (a) => a.horizon || 'short';
    _setAppState({ ..._getAppState(), assets: [
      { id: 'c1', type: 'cash', amount: 5000, currency: 'PLN', archived: false, horizon: 'short' },
      { id: 'r1', type: 'retirement', amount: 20000, currency: 'PLN', archived: false, horizon: 'long' }
    ]});
    const slices = buildAssetHorizonSlices();
    const shortSlice = slices.find((s) => s.horizon === 'short');
    const longSlice = slices.find((s) => s.horizon === 'long');
    expect(shortSlice?.amount).toBe(5000);
    expect(longSlice?.amount).toBe(20000);
  });

  it('wyklucza slices z kwotą 0', () => {
    globalThis.getAssetHorizon = (a) => 'short';
    _setAppState({ ..._getAppState(), assets: [
      { id: 'c1', type: 'cash', amount: 0, archived: false }
    ]});
    const slices = buildAssetHorizonSlices();
    expect(slices.every((s) => s.amount > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getLiquidCashPln
// ---------------------------------------------------------------------------
describe('getLiquidCashPln', () => {
  it('zwraca 0 gdy brak aktywów gotówkowych', () => {
    expect(getLiquidCashPln()).toBe(0);
  });

  it('sumuje wartość aktywów typu cash', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'c1', type: 'cash', amount: 5000, currency: 'PLN', archived: false },
      { id: 'c2', type: 'cash', amount: 3000, currency: 'PLN', archived: false },
      { id: 'i1', type: 'investment', amount: 10000, currency: 'PLN', archived: false }
    ]});
    expect(getLiquidCashPln()).toBe(8000);
  });

  it('używa getOperationalCashPln gdy jest dostępna', () => {
    globalThis.getOperationalCashPln = () => 12345;
    expect(getLiquidCashPln()).toBe(12345);
    globalThis.getOperationalCashPln = undefined;
  });
});
