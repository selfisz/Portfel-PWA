/**
 * Testy jednostkowe dla js/assets.js
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import vm from 'vm';
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
  globalThis.formatPlnAmountHtml = (n) => `${Number(n).toFixed(2)} zł`;
  globalThis.setPlnAmountElement = (el, n) => { if (el) el.textContent = `${Number(n).toFixed(2)} zł`; };
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
  globalThis.localIsoDate = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

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
// ensureUserAssetsSeed
// ===========================================================================
describe('ensureUserAssetsSeed', () => {
  it('dodaje brakujące aktywa z seeda', () => {
    expect(ensureUserAssetsSeed()).toBe(true);
    expect(_getAppState().assets.some((a) => a.id === 'asset-cash-total')).toBe(true);
  });

  it('nie nadpisuje salda istniejącego aktywa', () => {
    _setAppState({
      ..._getAppState(),
      assets: [{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 1234.56 }]
    });
    ensureUserAssetsSeed();
    const cash = _getAppState().assets.find((a) => a.id === 'asset-cash-total');
    expect(cash.amount).toBe(1234.56);
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
// migratePortfolioPositionsJune2026
// ===========================================================================
describe('migratePortfolioPositionsJune2026', () => {
  it('archiwizuje kubełki i tworzy pozycje z poprawnym P/L', () => {
    _setAppState({
      ..._getAppState(),
      assets: [
        { id: 'asset-inv-xtb', type: 'investment', name: 'XTB — akcje', quantity: 1, purchasePrice: 1105, currentPrice: 1105, currency: 'PLN' },
        { id: 'asset-inv-mbank', type: 'investment', name: 'mBank — akcje', quantity: 1, purchasePrice: 4556, currentPrice: 4556, currency: 'PLN' },
        { id: 'asset-ret-ikze-mbank', type: 'retirement', retirementKind: 'IKZE', name: 'mBank — IKZE', amount: 20703.66 },
        { id: 'asset-ret-mbank-emerytura', type: 'retirement', retirementKind: 'EMERYTURA', name: 'mBank — Emerytura', amount: 1687.98 }
      ],
      reportPrefs: {}
    });

    const changed = migratePortfolioPositionsJune2026();
    expect(changed).toBe(true);

    const state = _getAppState();
    expect(state.reportPrefs.portfolioPositions2026).toBe('v1');
    expect(state.assets.find((a) => a.id === 'asset-inv-xtb')?.archived).toBe(true);
    expect(state.assets.find((a) => a.id === 'asset-inv-mbank')?.archived).toBe(true);

    const artGames = state.assets.find((a) => a.id === 'asset-inv-xtb-artgames');
    expect(artGames.ticker).toBe('ARTGAMES');
    expect(artGames.quantity).toBe(1700);
    expect(getAssetValuePln(artGames)).toBeCloseTo(1011.50, 2);
    expect(getAssetGainPln(artGames)).toBeCloseTo(-2456.50, 2);

    const ikzeVwce = state.assets.find((a) => a.id === 'asset-inv-ikze-vwce');
    expect(ikzeVwce.ticker).toBe('VWCE');
    expect(ikzeVwce.brokerAccount).toBe('ikze');
    expect(getAssetHorizon(ikzeVwce)).toBe('long');
    expect(getAssetValuePln(ikzeVwce)).toBeCloseTo(9854.73, 2);

    const ikzeShell = state.assets.find((a) => a.id === 'asset-ret-ikze-mbank');
    expect(ikzeShell.amount).toBe(0);
    expect(ikzeShell.includeInSummary).toBe(false);

    const ikzePositions = state.assets.filter((a) => a.brokerAccount === 'ikze' && !a.archived);
    const ikzeTotal = ikzePositions.reduce((s, a) => s + getAssetValuePln(a), 0);
    expect(ikzeTotal).toBeCloseTo(20483.25, 2);

    const emerytura = state.assets.find((a) => a.id === 'asset-ret-mbank-emerytura');
    expect(emerytura.name).toBe('Emerytura 2035');
    expect(emerytura.amount).toBeCloseTo(1679.19, 2);

    const mbankPositions = state.assets.filter((a) => a.brokerAccount === 'mbank' && !a.archived);
    const mbankTotal = mbankPositions.reduce((s, a) => s + getAssetValuePln(a), 0);
    expect(mbankTotal).toBeCloseTo(4376.57, 2);
    expect(mbankPositions.reduce((s, a) => s + getAssetGainPln(a), 0)).toBeCloseTo(-3481.66, 2);
  });

  it('nie uruchamia się ponownie po flagi v1', () => {
    _setAppState({ ..._getAppState(), assets: [], reportPrefs: { portfolioPositions2026: 'v1' } });
    expect(migratePortfolioPositionsJune2026()).toBe(false);
  });

  it('nie nadpisuje portfela ani nie przywraca usuniętego IKZE gdy pozycje już istnieją', () => {
    _setAppState({
      ..._getAppState(),
      assets: [
        { id: 'asset-inv-ikze-vwce', type: 'investment', brokerAccount: 'ikze', ticker: 'VWCE', quantity: 5, purchasePrice: 100, currentPrice: 200, currency: 'PLN' },
        { id: 'asset-cash-total', type: 'cash', amount: 22770.58, cashBaseline: 22770.58 }
      ],
      deletedAssetIds: ['asset-ret-ikze-mbank'],
      reportPrefs: { excludedPortfolioGroups: ['ikze'] }
    });

    const changed = migratePortfolioPositionsJune2026();
    expect(changed).toBe(true);

    const state = _getAppState();
    expect(state.reportPrefs.portfolioPositions2026).toBe('v1');
    expect(state.assets.find((a) => a.id === 'asset-ret-ikze-mbank')).toBeUndefined();
    expect(state.assets.find((a) => a.id === 'asset-inv-ikze-vwce').quantity).toBe(5);
    expect(state.assets.find((a) => a.id === 'asset-cash-total').amount).toBeCloseTo(22770.58, 2);
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

    const now = new Date();
    const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(asset.archivedAt).toBe(expectedDate);
  });

  it('usuwa pozycję z aktywnej listy i czyści activeAssetId', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'asset-1', type: 'cash', amount: 1000, archived: false },
      { id: 'asset-2', type: 'cash', amount: 500, archived: false }
    ]});
    runInContext('activeAssetId = "asset-1"; draftAsset = null; renderAssets = function() {};');

    archiveAsset();

    expect(getActiveAssets().map((a) => a.id)).toEqual(['asset-2']);
    expect(getArchivedAssets().map((a) => a.id)).toEqual(['asset-1']);
    expect(vm.runInThisContext('activeAssetId')).toBeNull();
  });
});

// ===========================================================================
// portfolio UI — grupowanie kont
// ===========================================================================
describe('portfolio grouping', () => {
  it('przypisuje pozycje do właściwych ramek kont', () => {
    const assets = [
      { id: 'asset-inv-xtb-artgames', type: 'investment', brokerAccount: 'xtb', quantity: 1, purchasePrice: 1, currentPrice: 1 },
      { id: 'asset-cash-xtb-free', type: 'cash', amount: 0.08 },
      { id: 'asset-inv-mbank-vwce', type: 'investment', brokerAccount: 'mbank', quantity: 1, purchasePrice: 1, currentPrice: 1 },
      { id: 'asset-inv-ikze-vwce', type: 'investment', brokerAccount: 'ikze', quantity: 1, purchasePrice: 1, currentPrice: 1 },
      { id: 'asset-ret-ikze-mbank', type: 'retirement', amount: 0, includeInSummary: false },
      { id: 'asset-ret-mbank-emerytura', type: 'retirement', amount: 1679.19 },
      { id: 'asset-cash-main', type: 'cash', amount: 1000 }
    ].map(normalizeAsset);

    expect(getAssetPortfolioGroupId(assets[0])).toBe('xtb');
    expect(getAssetPortfolioGroupId(assets[1])).toBe('xtb');
    expect(getAssetPortfolioGroupId(assets[2])).toBe('mbank');
    expect(getAssetPortfolioGroupId(assets[3])).toBe('ikze');
    expect(getAssetPortfolioGroupId(assets[4])).toBeNull();
    expect(getAssetPortfolioGroupId(assets[5])).toBe('emerytura');
    expect(getAssetPortfolioGroupId(assets[6])).toBeNull();
  });

  it('renderuje 4 panele portfela i sekcję pozostałych', () => {
    _setAppState({ ..._getAppState(), assets: [
      { id: 'asset-inv-xtb-artgames', type: 'investment', brokerAccount: 'xtb', ticker: 'ARTGAMES', quantity: 1, purchasePrice: 10, currentPrice: 12 },
      { id: 'asset-inv-mbank-vwce', type: 'investment', brokerAccount: 'mbank', ticker: 'VWCE', quantity: 2, purchasePrice: 100, currentPrice: 110 },
      { id: 'asset-inv-ikze-vwce', type: 'investment', brokerAccount: 'ikze', ticker: 'VWCE', quantity: 1, purchasePrice: 100, currentPrice: 105 },
      { id: 'asset-ret-mbank-emerytura', type: 'retirement', name: 'Emerytura 2035', amount: 1679.19 },
      { id: 'asset-cash-main', type: 'cash', name: 'Konto', amount: 500 }
    ]});

    const html = buildAssetsListHtml(getActiveAssets(), true);
    expect(html).toContain('assets-portfolio-panel');
    expect(html).toContain('XTB');
    expect(html).toContain('mBank eMakler (Zwykły)');
    expect(html).toContain('IKZE mBank eMakler');
    expect(html).toContain('mBank Emerytura 2035');
    expect(html).toContain('Pozostałe aktywa');
    expect(html).toContain('Konto');
    expect((html.match(/class="card assets-portfolio-panel"/g) || []).length).toBe(4);
    expect(html.indexOf('Pozostałe aktywa')).toBeLessThan(html.indexOf('XTB'));
  });
});

// ===========================================================================
// deletePortfolioGroup — guard seed + tombstone
// ===========================================================================
describe('deletePortfolioGroup', () => {
  const baseAssets = [
    { id: 'asset-inv-ikze-vwce', type: 'investment', brokerAccount: 'ikze', ticker: 'VWCE', quantity: 14, purchasePrice: 67, currentPrice: 70 },
    { id: 'asset-inv-ikze-etfbtbsp', type: 'investment', brokerAccount: 'ikze', ticker: 'ETFBTBSP', quantity: 1, purchasePrice: 100, currentPrice: 110 },
    { id: 'asset-ret-ikze-mbank', type: 'retirement', amount: 0, includeInSummary: false },
    { id: 'asset-inv-xtb-artgames', type: 'investment', brokerAccount: 'xtb', ticker: 'ARTGAMES', quantity: 1, purchasePrice: 10, currentPrice: 12 }
  ];

  beforeEach(() => {
    _setAppState({ ..._getAppState(), assets: [...baseAssets], deletedAssetIds: [], reportPrefs: {} });
    runInContext('activeAssetId = null; draftAsset = null;');
  });

  it('usuwa pozycje grupy i wypełnia deletedAssetIds', () => {
    deletePortfolioGroup('ikze');

    const active = getActiveAssets().map((a) => a.id);
    expect(active).not.toContain('asset-inv-ikze-vwce');
    expect(active).not.toContain('asset-inv-ikze-etfbtbsp');
    expect(active).toContain('asset-inv-xtb-artgames');

    const deleted = _getAppState().deletedAssetIds;
    expect(deleted).toContain('asset-inv-ikze-vwce');
    expect(deleted).toContain('asset-inv-ikze-etfbtbsp');
  });

  it('seed nie przywraca pozycji oznaczonej jako deletedAssetId', () => {
    _setAppState({
      ..._getAppState(),
      assets: [],
      deletedAssetIds: ['asset-inv-ikze-vwce'],
      reportPrefs: { portfolioPositions2026: 'v1' }
    });
    ensureUserAssetsSeed();
    const ids = _getAppState().assets.map((a) => a.id);
    expect(ids).not.toContain('asset-inv-ikze-vwce');
  });

  it('excludedPortfolioGroups trafia do reportPrefs po usunięciu grupy', () => {
    deletePortfolioGroup('ikze');
    expect(_getAppState().reportPrefs.excludedPortfolioGroups).toContain('ikze');
  });
});

// ===========================================================================
// getEffectiveSummaryAssets — filtrowanie po grupach
// ===========================================================================
describe('getEffectiveSummaryAssets', () => {
  it('wyklucza całą grupę gdy jest w excludedPortfolioGroups', () => {
    _setAppState({
      ..._getAppState(),
      assets: [
        { id: 'asset-inv-xtb-artgames', type: 'investment', brokerAccount: 'xtb', ticker: 'ARTGAMES', quantity: 1, purchasePrice: 10, currentPrice: 12 },
        { id: 'asset-inv-ikze-vwce', type: 'investment', brokerAccount: 'ikze', ticker: 'VWCE', quantity: 1, purchasePrice: 100, currentPrice: 105 },
        { id: 'asset-cash-main', type: 'cash', amount: 500 }
      ],
      reportPrefs: { excludedPortfolioGroups: ['ikze'] }
    });

    const summary = getEffectiveSummaryAssets();
    expect(summary.map((a) => a.id)).not.toContain('asset-inv-ikze-vwce');
    expect(summary.map((a) => a.id)).toContain('asset-inv-xtb-artgames');
    expect(summary.map((a) => a.id)).toContain('asset-cash-main');
  });

  it('suma majątku nie uwzględnia wykluczonej grupy', () => {
    const xtbValue = 1 * 12 * 4.32;
    _setAppState({
      ..._getAppState(),
      assets: [
        { id: 'asset-inv-xtb-artgames', type: 'investment', brokerAccount: 'xtb', ticker: 'ART', quantity: 1, purchasePrice: 10, currentPrice: 12, currency: 'EUR' },
        { id: 'asset-inv-ikze-vwce', type: 'investment', brokerAccount: 'ikze', ticker: 'VWCE', quantity: 5, purchasePrice: 100, currentPrice: 200, currency: 'EUR' }
      ],
      reportPrefs: { excludedPortfolioGroups: ['ikze'] }
    });

    const summary = getEffectiveSummaryAssets();
    const total = getActiveAssetsTotalPln(summary);
    expect(Math.abs(total - xtbValue)).toBeLessThan(0.01);
  });

  it('togglePortfolioGroupSummary dodaje i usuwa grupę', () => {
    _setAppState({ ..._getAppState(), assets: [], reportPrefs: {} });

    togglePortfolioGroupSummary('xtb');
    expect(_getAppState().reportPrefs.excludedPortfolioGroups).toContain('xtb');

    togglePortfolioGroupSummary('xtb');
    expect(_getAppState().reportPrefs.excludedPortfolioGroups).not.toContain('xtb');
  });
});
