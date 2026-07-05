/**
 * Reprodukcja przepływu gotówki bez vitest — ładuje prawdziwe pliki JS.
 */
import vm from 'vm';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function load(relPath) {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  vm.runInThisContext(src, { filename: relPath });
}

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
globalThis.confirm = () => true;
globalThis.alert = () => {};
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => ({ forEach: () => {} }) };
globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
globalThis.EUR_PLN_RATE = 4.3;
globalThis.DEFAULT_CATEGORY_TREE = { expense: { Długi: [] }, income: {} };
globalThis.STORAGE_KEY = 'finanse_app_state';
globalThis.RECENT_CATEGORIES_KEY = 'recent';
globalThis.LIST_PAGE_SIZE = 20;
globalThis.ASSET_TYPES = ['investment', 'deposit', 'cash', 'retirement', 'other'];
globalThis.ASSET_TYPE_LABELS = { cash: 'Gotówka', investment: 'Inwestycja' };
globalThis.RETIREMENT_KINDS = ['PPK'];
globalThis.RETIREMENT_KIND_LABELS = {};
globalThis.ASSET_HORIZON_LABELS = { short: 'Krótkoterminowe', long: 'Długoterminowe' };
globalThis.ASSET_TYPE_ICONS = { cash: '💵' };
globalThis.ASSET_PORTFOLIO_GROUPS = [];
globalThis.CASH_TOTAL_AMOUNT = 710 + 5066.93 + 2738.33;
globalThis.saveState = () => {};
globalThis.showSettingsToast = () => {};
globalThis.showAppToast = () => {};
globalThis.renderReports = () => {};
globalThis.renderDashboard = () => {};
globalThis.renderAssets = () => {};
globalThis.renderLoans = () => {};
globalThis.setPlnAmountElement = () => {};
globalThis.formatPlnAmountHtml = (n) => String(n);
globalThis.formatTxDate = (d) => d;
globalThis.escapeHtml = (t) => String(t ?? '');
globalThis.hapticFeedback = () => {};
globalThis.getLoansFromPersistedRaw = () => [];
globalThis.mergeLoansById = (...lists) => lists.flat();
globalThis.mergeCreditCardsById = (...lists) => lists.flat();
globalThis.normalizeLoansArray = (loans) => loans || [];
globalThis.isLegacyTestLoan = () => false;
globalThis.migrateLoansArray = () => {};
globalThis.getTransactionCount = (raw) => (raw?.transactions || []).length;
globalThis.getDeletedAssetIds = () => globalThis.appState?.deletedAssetIds || [];
globalThis.getPersistedState = (raw) => raw || globalThis.appState;
globalThis.mergeLoansById = (...lists) => lists.flat();
globalThis.mergeCreditCardsById = (...lists) => lists.flat();
globalThis.normalizeLoansArray = (l) => l || [];
globalThis.migrateLoansArray = () => {};
globalThis.setSyncStatus = () => {};
globalThis.refreshCurrentView = () => {};
globalThis.checkAndProcessRecurringTransactions = () => {};
globalThis.STORAGE_KEY = 'finanse_app_state';

load('js/constants.js');
load('js/portfolio.js');
load('js/cash.js');
load('js/asset-analytics.js');
load('js/assets.js');
load('js/state.js');

function wireState(assets, cashMovements = [], transactions = []) {
  appState = {
    transactions,
    loans: [],
    creditCards: [],
    creditCardMovements: [],
    assets: JSON.parse(JSON.stringify(assets)),
    cashMovements: JSON.parse(JSON.stringify(cashMovements)),
    assetSnapshots: [],
    assetValueHistory: [],
    categoryBudgets: {},
    reportPrefs: {},
    deletedAssetIds: []
  };
}

function cashSnapshot() {
  const a = getAssetById(PRIMARY_CASH_ASSET_ID);
  return {
    amount: a?.amount,
    cashBaseline: a?.cashBaseline,
    movements: (appState.cashMovements || []).length,
    movementsTotal: getCashMovementsTotal(PRIMARY_CASH_ASSET_ID)
  };
}

function simulateIncome(amount, opts = {}) {
  const tx = {
    type: 'income',
    amount,
    date: '2026-06-29',
    mainCategory: 'Praca',
    subCategory: 'Test',
    note: 'test',
    affectsCash: opts.affectsCash !== undefined ? opts.affectsCash : true,
    ...(opts.linkedAssetId ? { linkedAssetId: opts.linkedAssetId } : {})
  };
  const okCash = syncCashOnTransactionSave(tx);
  const okAsset = syncAssetOnTransactionSave(tx);
  runCashMigrations();
  return { okCash, okAsset, tx, after: cashSnapshot() };
}

const cases = [];

// Case 1: seed state — baseline 8515, amount 0 (rozjazd po ręcznym zerowaniu)
wireState([{
  id: 'asset-cash-total', type: 'cash', name: 'Gotówka',
  amount: 0, cashBaseline: CASH_TOTAL_AMOUNT
}]);
cases.push({ name: 'seed baseline + amount 0, wpływ 1 zł', ...simulateIncome(1) });

// Case 2: fresh zero
wireState([{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0, cashBaseline: 0 }]);
cases.push({ name: 'baseline 0, wpływ 1 zł', ...simulateIncome(1) });

// Case 3: no asset — lazy create
wireState([]);
cases.push({ name: 'brak aktywa, wpływ 5 zł', ...simulateIncome(5) });

// Case 4: linked to Gotówka
wireState([{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0, cashBaseline: 0 }]);
cases.push({
  name: 'powiązany wpływ 2 zł na Gotówkę',
  ...simulateIncome(2, { linkedAssetId: 'asset-cash-total', affectsCash: false })
});

// Case 5: ensureUserAssetsSeed then income
wireState([]);
ensureUserAssetsSeed();
cases.push({ name: 'po seed, wpływ 1 zł', ...simulateIncome(1) });

// Case 6: manual zero with stale baseline from seed
wireState([{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0, cashBaseline: CASH_TOTAL_AMOUNT }]);
applyManualCashAmount(PRIMARY_CASH_ASSET_ID, 0);
cases.push({ name: 'ręczne 0 (naprawa baseline), wpływ 3 zł', ...simulateIncome(3) });

// Case 7: sync z chmury z zerowym remote (lokalny ma wpływ)
wireState(
  [{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 7, cashBaseline: 0 }],
  [{ id: 'm1', assetId: 'asset-cash-total', delta: 7, date: '2026-06-29' }],
  [{ type: 'income', amount: 7, date: '2026-06-29', cashMovementId: 'm1', mainCategory: 'P', subCategory: 'T' }]
);
localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
syncFromRemoteData({
  transactions: appState.transactions,
  assets: [{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0, cashBaseline: 0 }],
  cashMovements: [],
  loans: [],
  creditCards: [],
  creditCardMovements: [],
  categoryBudgets: {},
  reportPrefs: {},
  deletedAssetIds: []
});
runCashMigrations();
cases.push({
  name: 'sync remote zeruje — lokalny wpływ 7 zł',
  okCash: true,
  okAsset: true,
  after: cashSnapshot()
});

let failed = 0;
for (const c of cases) {
  const pass = c.after.amount > 0 && c.okCash && c.okAsset;
  const status = pass ? 'PASS' : 'FAIL';
  if (!pass) failed++;
  console.log(`[${status}] ${c.name}`);
  console.log(`       okCash=${c.okCash} okAsset=${c.okAsset} snapshot=${JSON.stringify(c.after)}`);
}

if (failed > 0) {
  console.error(`\n${failed} case(s) FAILED`);
  process.exit(1);
}
console.log('\nAll cases passed.');
