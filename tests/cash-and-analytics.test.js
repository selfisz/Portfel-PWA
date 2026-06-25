/**
 * Testy jednostkowe dla js/cash.js i js/asset-analytics.js
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
      dataset: {}, style: {}, innerHTML: '', textContent: '', checked: false
    }),
    querySelector: () => null,
    querySelectorAll: () => ({ forEach: () => {} }),
    addEventListener: () => {}
  };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
  globalThis.confirm = () => true;
  globalThis.alert = () => {};

  // Stubs zależności
  globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
  globalThis.escapeHtml = (t) => String(t ?? '');
  globalThis.saveState = () => {};
  globalThis.renderReports = () => {};
  globalThis.showSettingsToast = () => {};
  globalThis.getReportsPeriodContext = () => ({
    periodTx: [], mode: 'year', period: String(new Date().getFullYear()),
    rangeStart: null, rangeEnd: null
  });
  globalThis.getActiveLoans = () => [];
  globalThis.getActiveCreditCards = () => [];
  globalThis.getLoanCapitalLeft = () => 0;
  globalThis.getLoanSummaryTotal = () => 0;
  globalThis.getCreditCardDebtTotal = () => 0;
  globalThis.getPortfolioValuePln = () => 0;
  globalThis.getAssetsHorizonTotals = () => ({ short: 0, long: 0 });
  globalThis.getRecentCardRepaymentAverage = () => 0;
  globalThis.getSnapshotMonthChange = () => null;
  globalThis.getSummaryAssets = undefined;
  globalThis.getActiveAssets = () => [];
  globalThis.getAssetDisplayName = (a) => a?.name || 'Aktywo';
  globalThis.getAssetById = (id) => null;
  globalThis.updateAssetInState = (a) => a;
  globalThis.normalizeAsset = (a) => ({ ...a });
  globalThis.getActiveAssets = () => [];
  globalThis.getAssetsByHorizon = () => [];
  globalThis.getActiveAssetsTotalPln = () => 0;
  globalThis.getAssetHorizon = (a) => 'short';
  globalThis.getAnalysisSummaryAssets = () => (globalThis.appState?.assets || []).filter((a) => !a.archived);
  globalThis.getPeriodBoundsFromCtx = (ctx) => {
    if (ctx?.rangeStart && ctx?.rangeEnd) return { start: ctx.rangeStart, end: ctx.rangeEnd };
    const y = new Date().getFullYear();
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  };
  globalThis.getDebtPaymentsInPeriod = () => ({ loanPayments: 0, cardRepayments: 0, total: 0 });
  globalThis.shouldTransactionAffectCash = undefined; // will be defined after loading cash.js

  // Kolejność ładowania ważna: portfolio.js (localIsoDate), potem cash.js i asset-analytics.js
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
  globalThis.isMortgageLoan = () => false;
  globalThis.isLoanOrDebtPayment = () => false;
  globalThis.normalizeCreditCardMovement = (m) => m;
  globalThis.getCreditCardMovementsInRange = () => [];

  loadScript('js/constants.js');
  loadScript('js/loan-details.js');
  loadScript('js/portfolio.js');
  loadScript('js/state.js');
  loadScript('js/cash.js');
  loadScript('js/asset-analytics.js');

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
  globalThis.getAssetById = () => null;
  globalThis.getSummaryAssets = undefined;
  globalThis.confirm = () => true;
});

// ===========================================================================
// cash.js — normalizeCashMovement
// ===========================================================================
describe('normalizeCashMovement', () => {
  it('zwraca null dla null/undefined', () => {
    expect(normalizeCashMovement(null)).toBeNull();
    expect(normalizeCashMovement(undefined)).toBeNull();
  });

  it('zwraca null gdy delta = 0', () => {
    expect(normalizeCashMovement({ delta: 0, date: '2024-01-01' })).toBeNull();
  });

  it('zwraca null gdy delta to NaN', () => {
    expect(normalizeCashMovement({ delta: 'abc', date: '2024-01-01' })).toBeNull();
  });

  it('normalizuje ujemną deltę — amount jest absolutny', () => {
    const result = normalizeCashMovement({ delta: -500, date: '2024-01-10' });
    expect(result).toBeTruthy();
    expect(result.delta).toBe(-500);
    expect(result.amount).toBe(500);
  });

  it('zachowuje deltę dodatnią', () => {
    const result = normalizeCashMovement({ delta: 1200, date: '2024-02-01' });
    expect(result.delta).toBe(1200);
    expect(result.amount).toBe(1200);
  });

  it('przypisuje domyślny assetId gdy brak', () => {
    const result = normalizeCashMovement({ delta: 100, date: '2024-01-01' });
    expect(result.assetId).toBe(PRIMARY_CASH_ASSET_ID);
  });

  it('zachowuje assetId gdy podany', () => {
    const result = normalizeCashMovement({ delta: 100, assetId: 'custom-asset', date: '2024-01-01' });
    expect(result.assetId).toBe('custom-asset');
  });

  it('używa lokalnej daty gdy brak date — format YYYY-MM-DD', () => {
    const result = normalizeCashMovement({ delta: 50 });
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ===========================================================================
// cash.js — shouldTransactionAffectCash
// ===========================================================================
describe('shouldTransactionAffectCash', () => {
  it('zwraca false dla null/undefined', () => {
    expect(shouldTransactionAffectCash(null)).toBe(false);
    expect(shouldTransactionAffectCash(undefined)).toBe(false);
  });

  it('income wpływa na gotówkę gdy brak powiązania z aktywem', () => {
    expect(shouldTransactionAffectCash({ type: 'income' })).toBe(true);
    expect(shouldTransactionAffectCash({ type: 'income', affectsCash: true })).toBe(true);
  });

  it('income z linkedAssetId i affectsCash=false NIE wpływa na gotówkę', () => {
    expect(shouldTransactionAffectCash({
      type: 'income',
      linkedAssetId: 'asset-inv-1',
      affectsCash: false
    })).toBe(false);
  });

  it('wydatek kartą NIE wpływa na gotówkę', () => {
    expect(shouldTransactionAffectCash({ type: 'expense', creditCardId: 'card-1' })).toBe(false);
  });

  it('wydatek z affectsCash=false NIE wpływa', () => {
    expect(shouldTransactionAffectCash({ type: 'expense', affectsCash: false })).toBe(false);
  });

  it('wydatek z cashMovementId wpływa', () => {
    expect(shouldTransactionAffectCash({ type: 'expense', cashMovementId: 'cm-1' })).toBe(true);
  });

  it('wydatek z affectsCash=true wpływa', () => {
    expect(shouldTransactionAffectCash({ type: 'expense', affectsCash: true })).toBe(true);
  });

  it('wydatek bez flagy wpływa na gotówkę (domyślnie tak jak zaznaczony checkbox)', () => {
    expect(shouldTransactionAffectCash({ type: 'expense' })).toBe(true);
  });
});

// ===========================================================================
// cash.js — resolveTransactionAffectsCash
// ===========================================================================
describe('resolveTransactionAffectsCash', () => {
  it('income zawsze zwraca true', () => {
    expect(resolveTransactionAffectsCash('income', false, false)).toBe(true);
    expect(resolveTransactionAffectsCash('income', true, false)).toBe(true);
  });

  it('paidWithCard zwraca false', () => {
    expect(resolveTransactionAffectsCash('expense', true, true)).toBe(false);
  });

  it('expense + nie kartą + checkbox zaznaczony = true', () => {
    expect(resolveTransactionAffectsCash('expense', false, true)).toBe(true);
  });

  it('expense + nie kartą + checkbox niezaznaczony = false', () => {
    expect(resolveTransactionAffectsCash('expense', false, false)).toBe(false);
  });

  it('checkboxChecked = undefined traktowane jako true (domyślnie)', () => {
    expect(resolveTransactionAffectsCash('expense', false, undefined)).toBe(true);
  });
});

// ===========================================================================
// cash.js — getCashMovementsInRange
// ===========================================================================
describe('getCashMovementsInRange', () => {
  beforeEach(() => {
    _setAppState({ ..._getAppState(), cashMovements: [
      { id: 'cm1', assetId: PRIMARY_CASH_ASSET_ID, delta: 1000, date: '2024-01-05', note: '' },
      { id: 'cm2', assetId: PRIMARY_CASH_ASSET_ID, delta: -500, date: '2024-01-20', note: '' },
      { id: 'cm3', assetId: 'other-asset', delta: 200, date: '2024-01-10', note: '' },
      { id: 'cm4', assetId: PRIMARY_CASH_ASSET_ID, delta: 800, date: '2024-02-01', note: '' }
    ]});
  });

  it('zwraca ruch w zakresie dat (inkluzywnie)', () => {
    const result = getCashMovementsInRange('2024-01-01', '2024-01-31');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.every((m) => m.date >= '2024-01-01' && m.date <= '2024-01-31')).toBe(true);
  });

  it('filtruje po assetId gdy podany', () => {
    const result = getCashMovementsInRange('2024-01-01', '2024-01-31', PRIMARY_CASH_ASSET_ID);
    expect(result.every((m) => m.assetId === PRIMARY_CASH_ASSET_ID)).toBe(true);
  });

  it('zwraca wszystkie assetId gdy brak filtra', () => {
    const result = getCashMovementsInRange('2024-01-01', '2024-01-31', null);
    expect(result.some((m) => m.assetId === 'other-asset')).toBe(true);
  });

  it('zwraca pustą tablicę dla braku ruchów', () => {
    _setAppState({ ..._getAppState(), cashMovements: [] });
    expect(getCashMovementsInRange('2024-01-01', '2024-12-31')).toEqual([]);
  });

  it('wyklucza ruchy z delta=0 (normalizacja)', () => {
    _setAppState({ ..._getAppState(), cashMovements: [
      { id: 'cm-zero', delta: 0, date: '2024-01-10' }
    ]});
    expect(getCashMovementsInRange('2024-01-01', '2024-12-31')).toHaveLength(0);
  });
});

// ===========================================================================
// asset-analytics.js — normalizeAssetSnapshot
// ===========================================================================
describe('normalizeAssetSnapshot', () => {
  it('zwraca null dla null/undefined', () => {
    expect(normalizeAssetSnapshot(null)).toBeNull();
    expect(normalizeAssetSnapshot(undefined)).toBeNull();
  });

  it('zwraca null gdy monthKey jest nieprawidłowy', () => {
    expect(normalizeAssetSnapshot({ monthKey: 'invalid' })).toBeNull();
    expect(normalizeAssetSnapshot({ monthKey: '2024-1' })).toBeNull(); // bez zera
  });

  it('normalizuje poprawny snapshot', () => {
    const result = normalizeAssetSnapshot({
      monthKey: '2024-01',
      totalAssets: 100000,
      shortAssets: 60000,
      longAssets: 40000,
      totalDebt: 50000,
      loanDebt: 45000,
      cardDebt: 5000,
      netWorth: 50000,
      byType: { investment: 20000, cash: 40000, deposit: 0, retirement: 40000 },
      source: 'manual'
    });
    expect(result).toBeTruthy();
    expect(result.monthKey).toBe('2024-01');
    expect(result.totalAssets).toBe(100000);
    expect(result.netWorth).toBe(50000);
    expect(result.source).toBe('manual');
  });

  it('clampuje ujemne wartości do 0 (totalAssets, totalDebt, byType)', () => {
    const result = normalizeAssetSnapshot({
      monthKey: '2024-03',
      totalAssets: -1000,
      byType: { investment: -500 }
    });
    expect(result.totalAssets).toBe(0);
    expect(result.byType.investment).toBe(0);
  });

  it('pozwala na ujemny netWorth', () => {
    const result = normalizeAssetSnapshot({
      monthKey: '2024-06',
      totalAssets: 10000,
      netWorth: -5000
    });
    expect(result.netWorth).toBe(-5000);
  });

  it('generuje domyślne id gdy brak', () => {
    const result = normalizeAssetSnapshot({ monthKey: '2024-02' });
    expect(result.id).toBe('snap-2024-02');
  });

  it('generuje domyślną datę z monthKey gdy brak date', () => {
    const result = normalizeAssetSnapshot({ monthKey: '2024-07' });
    expect(result.date).toBe('2024-07-28');
  });

  it('wyznacza monthKey z date gdy monthKey brak', () => {
    const result = normalizeAssetSnapshot({ date: '2024-05-15' });
    expect(result?.monthKey).toBe('2024-05');
  });
});

// ===========================================================================
// asset-analytics.js — normalizeAssetValueHistoryEntry
// ===========================================================================
describe('normalizeAssetValueHistoryEntry', () => {
  it('zwraca null gdy brak valuePln lub NaN', () => {
    expect(normalizeAssetValueHistoryEntry(null)).toBeNull();
    expect(normalizeAssetValueHistoryEntry({ valuePln: 'abc' })).toBeNull();
  });

  it('normalizuje poprawny wpis', () => {
    const result = normalizeAssetValueHistoryEntry({
      assetId: 'asset-1',
      date: '2024-01-10',
      valuePln: 5000,
      note: 'test',
      source: 'manual'
    });
    expect(result).toBeTruthy();
    expect(result.assetId).toBe('asset-1');
    expect(result.valuePln).toBe(5000);
  });

  it('dopuszcza valuePln = 0', () => {
    const result = normalizeAssetValueHistoryEntry({ assetId: 'a', valuePln: 0, date: '2024-01-01' });
    expect(result).toBeTruthy();
    expect(result.valuePln).toBe(0);
  });

  it('używa lokalnej daty gdy brak date — format YYYY-MM-DD', () => {
    const result = normalizeAssetValueHistoryEntry({ valuePln: 1000 });
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ===========================================================================
// asset-analytics.js — getAssetSnapshots
// ===========================================================================
describe('getAssetSnapshots', () => {
  it('zwraca pustą tablicę gdy brak snapshotów', () => {
    expect(getAssetSnapshots()).toEqual([]);
  });

  it('filtruje nieprawidłowe snapshoty', () => {
    _setAppState({ ..._getAppState(), assetSnapshots: [
      null,
      { monthKey: 'invalid' },
      { monthKey: '2024-01', totalAssets: 100000 }
    ]});
    const result = getAssetSnapshots();
    expect(result).toHaveLength(1);
    expect(result[0].monthKey).toBe('2024-01');
  });

  it('sortuje chronologicznie po monthKey', () => {
    _setAppState({ ..._getAppState(), assetSnapshots: [
      { monthKey: '2024-03', totalAssets: 300000 },
      { monthKey: '2024-01', totalAssets: 100000 },
      { monthKey: '2024-02', totalAssets: 200000 }
    ]});
    const result = getAssetSnapshots();
    expect(result[0].monthKey).toBe('2024-01');
    expect(result[1].monthKey).toBe('2024-02');
    expect(result[2].monthKey).toBe('2024-03');
  });
});

// ===========================================================================
// asset-analytics.js — getSnapshotMonthChange
// ===========================================================================
describe('getSnapshotMonthChange', () => {
  it('zwraca null gdy mniej niż 2 snapshoty', () => {
    _setAppState({ ..._getAppState(), assetSnapshots: [
      { monthKey: '2024-01', totalAssets: 100000, netWorth: 50000 }
    ]});
    expect(getSnapshotMonthChange()).toBeNull();
  });

  it('zwraca różnicę między ostatnim a przedostatnim snapshotem', () => {
    _setAppState({ ..._getAppState(), assetSnapshots: [
      { monthKey: '2024-01', totalAssets: 100000, netWorth: 50000 },
      { monthKey: '2024-02', totalAssets: 110000, netWorth: 55000 }
    ]});
    const change = getSnapshotMonthChange();
    expect(change.netWorth).toBe(5000);
    expect(change.totalAssets).toBe(10000);
    expect(change.prevMonthKey).toBe('2024-01');
    expect(change.currentMonthKey).toBe('2024-02');
  });

  it('obsługuje ujemną zmianę', () => {
    _setAppState({ ..._getAppState(), assetSnapshots: [
      { monthKey: '2024-02', totalAssets: 110000, netWorth: 55000 },
      { monthKey: '2024-03', totalAssets: 100000, netWorth: 45000 }
    ]});
    const change = getSnapshotMonthChange();
    expect(change.netWorth).toBe(-10000);
    expect(change.totalAssets).toBe(-10000);
  });
});

// ===========================================================================
// asset-analytics.js — buildNetWorthTrendData
// ===========================================================================
describe('buildNetWorthTrendData', () => {
  it('zwraca puste tablice gdy mniej niż 2 snapshoty', () => {
    const result = buildNetWorthTrendData();
    expect(result.monthLabels).toEqual([]);
    expect(result.netData).toEqual([]);
  });

  it('zwraca dane dla 3 snapshotów', () => {
    _setAppState({ ..._getAppState(), assetSnapshots: [
      { monthKey: '2024-01', totalAssets: 100000, totalDebt: 50000, netWorth: 50000 },
      { monthKey: '2024-02', totalAssets: 105000, totalDebt: 48000, netWorth: 57000 },
      { monthKey: '2024-03', totalAssets: 110000, totalDebt: 46000, netWorth: 64000 }
    ]});
    const result = buildNetWorthTrendData();
    expect(result.monthLabels).toHaveLength(3);
    expect(result.assetsData).toEqual([100000, 105000, 110000]);
    expect(result.debtData).toEqual([50000, 48000, 46000]);
    expect(result.netData).toEqual([50000, 57000, 64000]);
  });
});

// ===========================================================================
// asset-analytics.js — getIkzeContributionsInYear
// ===========================================================================
describe('getIkzeContributionsInYear', () => {
  it('zwraca 0 gdy brak transakcji', () => {
    expect(getIkzeContributionsInYear(2024)).toBe(0);
  });

  it('sumuje tylko transakcje powiązane z IKZE w danym roku', () => {
    const ikzeAsset = { type: 'retirement', retirementKind: 'IKZE' };
    globalThis.getAssetById = (id) => id === 'ikze-1' ? ikzeAsset : null;
    _setAppState({ ..._getAppState(), transactions: [
      { date: '2024-03-01', type: 'expense', amount: 500, linkedAssetId: 'ikze-1' },
      { date: '2024-06-01', type: 'expense', amount: 300, linkedAssetId: 'ikze-1' },
      { date: '2024-01-01', type: 'expense', amount: 100, linkedAssetId: 'other-asset' }, // inny asset
      { date: '2023-12-01', type: 'expense', amount: 1000, linkedAssetId: 'ikze-1' } // inny rok
    ]});
    expect(getIkzeContributionsInYear(2024)).toBe(800); // 500 + 300
    globalThis.getAssetById = () => null;
  });

  it('nie liczy transakcji bez linkedAssetId', () => {
    _setAppState({ ..._getAppState(), transactions: [
      { date: '2024-01-01', type: 'expense', amount: 500 }
    ]});
    expect(getIkzeContributionsInYear(2024)).toBe(0);
  });
});

// ===========================================================================
// cash.js + asset-analytics.js — sync przy zapisie transakcji (wpływ → aktywa)
// ===========================================================================
describe('syncCashOnTransactionSave / syncAssetOnTransactionSave — wpływ', () => {
  function wireAssetHelpers() {
    globalThis.normalizeAsset = (raw) => {
      const a = raw && typeof raw === 'object' ? { ...raw } : {};
      a.amount = Math.max(0, parseFloat(a.amount) || 0);
      a.type = a.type || 'cash';
      return a;
    };
    globalThis.getAssetValuePln = (asset) => asset?.amount || 0;
    globalThis.getAssetById = (id) => _getAppState().assets.find((a) => a.id === id) || null;
    globalThis.updateAssetInState = (asset) => {
      const state = _getAppState();
      const idx = state.assets.findIndex((a) => a.id === asset.id);
      if (idx >= 0) state.assets[idx] = { ...asset };
      else state.assets.push({ ...asset });
      return asset;
    };
  }

  beforeEach(() => {
    wireAssetHelpers();
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

  it('tworzy gotówkę i zwiększa saldo przy wpływie bez powiązanego aktywa', () => {
    const tx = {
      type: 'income',
      amount: 5000,
      date: '2024-06-01',
      note: 'Wynagrodzenie',
      mainCategory: 'Praca',
      subCategory: 'Pensja'
    };
    expect(syncCashOnTransactionSave(tx)).toBe(true);
    const cash = _getAppState().assets.find((a) => a.id === PRIMARY_CASH_ASSET_ID);
    expect(cash).toBeTruthy();
    expect(cash.amount).toBe(5000);
    expect(tx.cashMovementId).toBeTruthy();
  });

  it('wpływ na powiązane aktywo nie zmienia salda gotówki', () => {
    _setAppState({
      ..._getAppState(),
      assets: [{ id: 'asset-savings', type: 'cash', name: 'Oszczędności', amount: 1000 }]
    });
    const tx = {
      type: 'income',
      amount: 3000,
      date: '2024-06-01',
      note: 'Premia',
      mainCategory: 'Praca',
      subCategory: 'Premia',
      linkedAssetId: 'asset-savings',
      affectsCash: false
    };
    expect(syncCashOnTransactionSave(tx)).toBe(true);
    expect(tx.cashMovementId).toBeUndefined();
    expect(_getAppState().assets.find((a) => a.id === PRIMARY_CASH_ASSET_ID)).toBeUndefined();
    expect(syncAssetOnTransactionSave(tx)).toBe(true);
    expect(_getAppState().assets.find((a) => a.id === 'asset-savings').amount).toBe(4000);
  });

  it('wpływ z kwotą jako string (kropka) poprawnie zwiększa saldo gotówki', () => {
    const tx = {
      type: 'income',
      amount: '47.30',
      date: '2024-06-01',
      note: 'Test',
      mainCategory: 'Praca',
      subCategory: 'Premia'
    };
    expect(syncCashOnTransactionSave(tx)).toBe(true);
    const cash = _getAppState().assets.find((a) => a.id === PRIMARY_CASH_ASSET_ID);
    expect(cash.amount).toBeCloseTo(47.3, 2);
  });
});
