/**
 * Testy jednostkowe dla js/assets.js
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
      querySelectorAll: () => { return { forEach: () => {} }; }
    }),
    querySelector: () => null,
    querySelectorAll: () => ({ forEach: () => {} }),
    body: { style: {} }
  };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
  globalThis.confirm = () => true;
  globalThis.alert = () => {};

  globalThis.stateRef = { set: () => Promise.resolve(), on: () => {}, off: () => {} };
  globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
  globalThis.formatTxDate = (d) => d;
  globalThis.escapeHtml = (t) => String(t ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  globalThis.saveState = () => {};
  globalThis.hapticFeedback = () => {};
  globalThis.showSettingsToast = () => {};
  globalThis.renderAssets = () => {};
  globalThis.renderReports = () => {};
  globalThis.openAssetDetails = () => {};
  globalThis.setAssetDetailsMode = () => {};
  globalThis.recordAssetValueHistory = () => {};

  loadScript('js/constants.js');
  loadScript('js/portfolio.js');
  loadScript('js/state.js');
  loadScript('js/assets.js');

  runInContext(`
    function _getAppState()  { return appState; }
    function _setAppState(s) { appState = s; }
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

// ===========================================================================
// normalizeAsset
// ===========================================================================
describe('normalizeAsset', () => {
  it('zwraca domyślne inwestycyjne dla null', () => {
    const a = normalizeAsset(null);
    expect(a.type).toBe('investment');
    expect(a.currency).toBe('PLN');
    expect(a.archived).toBe(false);
    expect(a.includeInSummary).toBe(true);
  });

  it('zachowuje poprawne dane inwestycji', () => {
    const a = normalizeAsset({ id: 'inv-1', type: 'investment', ticker: 'xtb', quantity: 10, purchasePrice: 50, currentPrice: 60, currency: 'PLN' });
    expect(a.ticker).toBe('XTB');
    expect(a.quantity).toBe(10);
    expect(a.purchasePrice).toBe(50);
    expect(a.currentPrice).toBe(60);
  });

  it('zamienia ticker na wielkie litery', () => {
    const a = normalizeAsset({ id: 'inv-1', type: 'investment', ticker: 'vwce', quantity: 1, purchasePrice: 100 });
    expect(a.ticker).toBe('VWCE');
  });

  it('ustawia name = ticker gdy brak nazwy dla inwestycji', () => {
    const a = normalizeAsset({ id: 'inv-1', type: 'investment', ticker: 'ETF', quantity: 1 });
    expect(a.name).toBe('ETF');
  });

  it('clampuje ujemne wartości do 0', () => {
    const a = normalizeAsset({ id: 'inv-1', type: 'investment', quantity: -5, purchasePrice: -100, currentPrice: -10 });
    expect(a.quantity).toBe(0);
    expect(a.purchasePrice).toBe(0);
    expect(a.currentPrice).toBe(0);
  });

  it('normalizuje lokatę (deposit)', () => {
    const a = normalizeAsset({ id: 'd-1', type: 'deposit', amount: 5000, interestRate: 6.5, endDate: '2024-12-31' });
    expect(a.type).toBe('deposit');
    expect(a.amount).toBe(5000);
    expect(a.interestRate).toBe(6.5);
    expect(a.endDate).toBe('2024-12-31');
  });

  it('normalizuje gotówkę (cash)', () => {
    const a = normalizeAsset({ id: 'cash-1', type: 'cash', amount: 10000 });
    expect(a.type).toBe('cash');
    expect(a.amount).toBe(10000);
  });

  it('normalizuje emeryturę (retirement)', () => {
    const a = normalizeAsset({ id: 'ret-1', type: 'retirement', retirementKind: 'IKZE', institution: ' mBank ', amount: 20000 });
    expect(a.retirementKind).toBe('IKZE');
    expect(a.institution).toBe('mBank');
  });

  it('nieznany retirementKind → "PPK"', () => {
    const a = normalizeAsset({ id: 'ret-1', type: 'retirement', retirementKind: 'UNKNOWN' });
    expect(a.retirementKind).toBe('PPK');
  });

  it('nieznany typ → "investment"', () => {
    const a = normalizeAsset({ id: 'x-1', type: 'stock' });
    expect(a.type).toBe('investment');
  });

  it('waluta: akceptuje tylko PLN i EUR', () => {
    const eur = normalizeAsset({ id: 'x', type: 'investment', currency: 'EUR' });
    const usd = normalizeAsset({ id: 'x', type: 'investment', currency: 'USD' });
    expect(eur.currency).toBe('EUR');
    expect(usd.currency).toBe('PLN');
  });

  it('generuje id gdy brak', () => {
    const a = normalizeAsset({ type: 'cash', amount: 100 });
    expect(a.id).toBeTruthy();
    expect(a.id.startsWith('asset-')).toBe(true);
  });

  it('ustawia includeInSummary = true gdy undefined', () => {
    const a = normalizeAsset({ id: 'x', includeInSummary: undefined });
    expect(a.includeInSummary).toBe(true);
  });

  it('zachowuje includeInSummary = false', () => {
    const a = normalizeAsset({ id: 'x', includeInSummary: false });
    expect(a.includeInSummary).toBe(false);
  });
});

// ===========================================================================
// getAssetDisplayName
// ===========================================================================
describe('getAssetDisplayName', () => {
  it('zwraca "Aktywo" dla null', () => {
    expect(getAssetDisplayName(null)).toBe('Aktywo');
  });

  it('zwraca przyciętą nazwę', () => {
    expect(getAssetDisplayName({ name: '  Akcje XTB  ', type: 'investment' })).toBe('Akcje XTB');
  });

  it('zwraca ticker gdy brak nazwy (investment)', () => {
    expect(getAssetDisplayName({ name: '', type: 'investment', ticker: 'VWCE' })).toBe('VWCE');
  });

  it('zwraca etykietę typu gdy brak nazwy i tickera', () => {
    expect(getAssetDisplayName({ name: '', type: 'cash' })).toBe('Gotówka');
  });

  it('zwraca "Aktywo" dla nieznanego typu bez nazwy', () => {
    expect(getAssetDisplayName({ name: '', type: 'unknown' })).toBe('Aktywo');
  });
});

// ===========================================================================
// getAssetHorizon
// ===========================================================================
describe('getAssetHorizon', () => {
  it('retirement → "long"', () => {
    expect(getAssetHorizon({ id: 'x', type: 'retirement', retirementKind: 'PPK', amount: 1000 })).toBe('long');
  });

  it('investment → "short"', () => {
    expect(getAssetHorizon({ id: 'x', type: 'investment', quantity: 1, purchasePrice: 100, currentPrice: 100 })).toBe('short');
  });

  it('deposit → "short"', () => {
    expect(getAssetHorizon({ id: 'x', type: 'deposit', amount: 5000 })).toBe('short');
  });

  it('cash → "short"', () => {
    expect(getAssetHorizon({ id: 'x', type: 'cash', amount: 1000 })).toBe('short');
  });
});

// ===========================================================================
// getAssetGainPln / getAssetGainPct
// ===========================================================================
describe('getAssetGainPln', () => {
  it('zwraca 0 dla nie-inwestycji', () => {
    expect(getAssetGainPln({ id: 'x', type: 'cash', amount: 1000 })).toBe(0);
    expect(getAssetGainPln({ id: 'x', type: 'deposit', amount: 5000 })).toBe(0);
  });

  it('oblicza zysk (bieżąca > zakup)', () => {
    const a = { id: 'x', type: 'investment', quantity: 10, purchasePrice: 50, currentPrice: 60, currency: 'PLN' };
    expect(getAssetGainPln(a)).toBeCloseTo(100); // (60-50)*10 = 100
  });

  it('oblicza stratę (bieżąca < zakup)', () => {
    const a = { id: 'x', type: 'investment', quantity: 5, purchasePrice: 100, currentPrice: 80, currency: 'PLN' };
    expect(getAssetGainPln(a)).toBeCloseTo(-100); // (80-100)*5 = -100
  });

  it('zwraca 0 gdy cena zakupu = 0', () => {
    const a = { id: 'x', type: 'investment', quantity: 10, purchasePrice: 0, currentPrice: 50, currency: 'PLN' };
    expect(getAssetGainPln(a)).toBeCloseTo(500); // (50-0)*10 = 500
  });
});

describe('getAssetGainPct', () => {
  it('zwraca 0 dla nie-inwestycji', () => {
    expect(getAssetGainPct({ id: 'x', type: 'retirement', amount: 5000 })).toBe(0);
  });

  it('zwraca 0 gdy koszt = 0 (dzielenie przez zero)', () => {
    const a = { id: 'x', type: 'investment', quantity: 10, purchasePrice: 0, currentPrice: 60, currency: 'PLN' };
    expect(getAssetGainPct(a)).toBe(0);
  });

  it('oblicza % zysku poprawnie', () => {
    const a = { id: 'x', type: 'investment', quantity: 10, purchasePrice: 100, currentPrice: 120, currency: 'PLN' };
    expect(getAssetGainPct(a)).toBeCloseTo(20); // (200/1000)*100 = 20%
  });

  it('oblicza % straty poprawnie', () => {
    const a = { id: 'x', type: 'investment', quantity: 10, purchasePrice: 100, currentPrice: 80, currency: 'PLN' };
    expect(getAssetGainPct(a)).toBeCloseTo(-20);
  });
});

// ===========================================================================
// getActiveAssetsTotalPln / getActiveAssetsGainPln / getActiveAssetsGainPct
// ===========================================================================
describe('getActiveAssetsTotalPln', () => {
  it('zwraca 0 dla pustej tablicy', () => {
    expect(getActiveAssetsTotalPln([])).toBe(0);
  });

  it('sumuje wartości aktywów PLN', () => {
    const assets = [
      { id: 'c1', type: 'cash', amount: 10000, currency: 'PLN' },
      { id: 'd1', type: 'deposit', amount: 5000, currency: 'PLN' }
    ].map(normalizeAsset);
    expect(getActiveAssetsTotalPln(assets)).toBeCloseTo(15000);
  });

  it('liczy inwestycje jako quantity * currentPrice', () => {
    const assets = [
      { id: 'inv-1', type: 'investment', quantity: 10, purchasePrice: 50, currentPrice: 100, currency: 'PLN' }
    ].map(normalizeAsset);
    expect(getActiveAssetsTotalPln(assets)).toBeCloseTo(1000);
  });
});

describe('getActiveAssetsGainPln', () => {
  it('zwraca 0 gdy brak inwestycji', () => {
    const assets = [{ id: 'c', type: 'cash', amount: 5000 }].map(normalizeAsset);
    expect(getActiveAssetsGainPln(assets)).toBe(0);
  });

  it('sumuje zyski tylko z inwestycji', () => {
    const assets = [
      { id: 'inv', type: 'investment', quantity: 10, purchasePrice: 100, currentPrice: 120, currency: 'PLN' },
      { id: 'cash', type: 'cash', amount: 5000 }
    ].map(normalizeAsset);
    expect(getActiveAssetsGainPln(assets)).toBeCloseTo(200); // 10*(120-100)
  });
});

describe('getActiveAssetsGainPct', () => {
  it('zwraca 0 gdy brak inwestycji', () => {
    const assets = [{ id: 'c', type: 'cash', amount: 5000 }].map(normalizeAsset);
    expect(getActiveAssetsGainPct(assets)).toBe(0);
  });

  it('zwraca 0 gdy koszt zerowy (guard dzielenia przez zero)', () => {
    const assets = [
      { id: 'inv', type: 'investment', quantity: 10, purchasePrice: 0, currentPrice: 100, currency: 'PLN' }
    ].map(normalizeAsset);
    expect(getActiveAssetsGainPct(assets)).toBe(0);
  });

  it('oblicza łączny % poprawnie', () => {
    const assets = [
      { id: 'inv', type: 'investment', quantity: 10, purchasePrice: 100, currentPrice: 110, currency: 'PLN' }
    ].map(normalizeAsset);
    expect(getActiveAssetsGainPct(assets)).toBeCloseTo(10);
  });
});

// ===========================================================================
// isLegacyVwceAsset
// ===========================================================================
describe('isLegacyVwceAsset', () => {
  it('wykrywa VWCE po tickerze', () => {
    expect(isLegacyVwceAsset({ id: 'x', type: 'investment', ticker: 'vwce', quantity: 1 })).toBe(true);
  });

  it('wykrywa VWCE w nazwie', () => {
    expect(isLegacyVwceAsset({ id: 'x', type: 'investment', name: 'Vanguard FTSE World', quantity: 1 })).toBe(true);
  });

  it('zwraca false dla nie-inwestycji', () => {
    expect(isLegacyVwceAsset({ id: 'x', type: 'cash', name: 'VWCE Fund', amount: 1000 })).toBe(false);
  });

  it('zwraca false dla normalnej inwestycji', () => {
    expect(isLegacyVwceAsset({ id: 'x', type: 'investment', ticker: 'XTB', name: 'XTB S.A.', quantity: 1 })).toBe(false);
  });
});

// ===========================================================================
// filterAssetsByHorizon
// ===========================================================================
describe('filterAssetsByHorizon', () => {
  let assets;
  beforeEach(() => {
    assets = [
      normalizeAsset({ id: 'short-1', type: 'cash', amount: 1000 }),
      normalizeAsset({ id: 'long-1', type: 'retirement', retirementKind: 'PPK', amount: 5000 })
    ];
    runInContext('assetsTypeFilter = "all"');
  });

  it('zwraca wszystkie przy filtrze "all"', () => {
    expect(filterAssetsByHorizon(assets)).toHaveLength(2);
  });

  it('filtruje short', () => {
    runInContext('assetsTypeFilter = "short"');
    const result = filterAssetsByHorizon(assets);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('short-1');
  });

  it('filtruje long', () => {
    runInContext('assetsTypeFilter = "long"');
    const result = filterAssetsByHorizon(assets);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('long-1');
  });
});

// ===========================================================================
// getAssetById
// ===========================================================================
describe('getAssetById', () => {
  beforeEach(() => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'a1', type: 'cash', amount: 1000 },
      { id: 'a2', type: 'deposit', amount: 5000, interestRate: 5 }
    ]});
  });

  it('zwraca null dla null/undefined id', () => {
    expect(getAssetById(null)).toBeNull();
    expect(getAssetById('')).toBeNull();
  });

  it('zwraca aktywo po id', () => {
    const result = getAssetById('a1');
    expect(result).toBeTruthy();
    expect(result.id).toBe('a1');
    expect(result.type).toBe('cash');
  });

  it('zwraca null gdy nie znaleziono', () => {
    expect(getAssetById('brak')).toBeNull();
  });
});

// ===========================================================================
// updateAssetInState
// ===========================================================================
describe('updateAssetInState', () => {
  it('dodaje nowe aktywo do pustej listy', () => {
    updateAssetInState({ id: 'new-1', type: 'cash', amount: 5000 });
    expect(_getAppState().assets).toHaveLength(1);
    expect(_getAppState().assets[0].id).toBe('new-1');
  });

  it('aktualizuje istniejące aktywo', () => {
    updateAssetInState({ id: 'a1', type: 'cash', amount: 1000 });
    updateAssetInState({ id: 'a1', type: 'cash', amount: 9999 });
    const assets = _getAppState().assets;
    expect(assets).toHaveLength(1);
    expect(assets[0].amount).toBe(9999);
  });

  it('normalizuje aktywo przed zapisem', () => {
    updateAssetInState({ id: 'a1', type: 'investment', quantity: -5, purchasePrice: -10 });
    const saved = _getAppState().assets[0];
    expect(saved.quantity).toBe(0);
    expect(saved.purchasePrice).toBe(0);
  });
});

// ===========================================================================
// getSummaryAssets
// ===========================================================================
describe('getSummaryAssets', () => {
  it('wyklucza aktywa z includeInSummary = false', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'a1', type: 'cash', amount: 1000, includeInSummary: true, archived: false },
      { id: 'a2', type: 'cash', amount: 2000, includeInSummary: false, archived: false },
      { id: 'a3', type: 'cash', amount: 3000, archived: true }
    ]});
    const result = getSummaryAssets();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('wyklucza zarchiwizowane', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'a1', type: 'cash', amount: 1000, archived: true }
    ]});
    expect(getSummaryAssets()).toHaveLength(0);
  });
});

// ===========================================================================
// migrateMbankEmeryturaAsset
// ===========================================================================
describe('migrateMbankEmeryturaAsset', () => {
  it('zwraca false gdy assets nie jest tablicą', () => {
    _setAppState({ ..._getAppState(), assets: null });
    expect(migrateMbankEmeryturaAsset()).toBe(false);
  });

  it('nie zmienia aktywów gdy brak legacy IKE', () => {
    _setAppState({ ..._getAppState(), assets: [{ id: 'x', type: 'cash', name: 'Gotówka', amount: 1000 }] });
    const changed = migrateMbankEmeryturaAsset();
    expect(changed).toBe(false);
  });

  it('migruje asset-ret-mbank-ike do emerytura', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'asset-ret-mbank-ike', type: 'retirement', retirementKind: 'IKE', name: 'mBank IKE', amount: 5000 }
    ]});
    const changed = migrateMbankEmeryturaAsset();
    expect(changed).toBe(true);
    const migrated = _getAppState().assets[0];
    expect(migrated.id).toBe('asset-ret-mbank-emerytura');
    expect(migrated.retirementKind).toBe('EMERYTURA');
  });
});

// ===========================================================================
// archiveAsset — bug fix: lokalny format daty
// ===========================================================================
describe('archiveAsset — timezone fix', () => {
  it('archivedAt używa lokalnego formatu YYYY-MM-DD', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'asset-1', type: 'cash', amount: 1000, archived: false }
    ]});
    runInContext('activeAssetId = "asset-1"; draftAsset = null;');

    archiveAsset();

    const asset = _getAppState().assets.find((a) => a.id === 'asset-1');
    expect(asset.archived).toBe(true);
    expect(asset.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Sprawdź że data jest lokalna (nie UTC przesuniętą)
    const now = new Date();
    const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(asset.archivedAt).toBe(expectedDate);
  });
});
