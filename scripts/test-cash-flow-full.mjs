/**
 * Test sync Firebase + saveTransaction — pełniejszy przepływ.
 */
import vm from 'vm';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function load(relPath) {
  vm.runInThisContext(readFileSync(join(ROOT, relPath), 'utf8'), { filename: relPath });
}

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
globalThis.confirm = () => true;
globalThis.document = {
  getElementById: (id) => {
    const vals = {
      'tx-amount': { value: '7', classList: { toggle: () => {}, add: () => {}, remove: () => {} } },
      'tx-date': { value: '2026-06-29' },
      'tx-note': { value: '' },
      'tx-recurring': { checked: false },
      'tx-credit-card': { checked: false },
      'tx-affects-cash': { checked: true, classList: { toggle: () => {}, add: () => {}, remove: () => {} } },
      'tx-linked-asset': { checked: false },
      'tx-linked-asset-select': { value: '' },
      'tx-credit-card-select': { value: '' }
    };
    return vals[id] || { value: '', checked: false, classList: { toggle: () => {}, add: () => {}, remove: () => {} } };
  },
  querySelector: () => null,
  querySelectorAll: () => ({ forEach: () => {} })
};
globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
globalThis.EUR_PLN_RATE = 4.3;
globalThis.DEFAULT_CATEGORY_TREE = { expense: { Długi: ['Test'] }, income: { Praca: ['Test'] } };
globalThis.STORAGE_KEY = 'finanse_app_state';
globalThis.RECENT_CATEGORIES_KEY = 'recent';
globalThis.LIST_PAGE_SIZE = 20;
globalThis.ASSET_TYPES = ['investment', 'deposit', 'cash', 'retirement', 'other'];
globalThis.ASSET_TYPE_LABELS = { cash: 'Gotówka' };
globalThis.RETIREMENT_KINDS = ['PPK'];
globalThis.RETIREMENT_KIND_LABELS = {};
globalThis.ASSET_HORIZON_LABELS = { short: 'S', long: 'L' };
globalThis.ASSET_TYPE_ICONS = { cash: '💵' };
globalThis.ASSET_PORTFOLIO_GROUPS = [];
globalThis.CASH_TOTAL_AMOUNT = 710 + 5066.93 + 2738.33;
globalThis.saveState = () => {
  store[STORAGE_KEY] = JSON.stringify(getPersistedState(appState));
};
globalThis.showAppToast = () => {};
globalThis.showSettingsToast = () => {};
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
globalThis.normalizeLoansArray = (l) => l || [];
globalThis.isLegacyTestLoan = () => false;
globalThis.migrateLoansArray = () => false;
globalThis.getTransactionCount = (raw) => (raw?.transactions || []).length;
globalThis.getDeletedAssetIds = () => appState?.deletedAssetIds || [];
globalThis.parsePlnInput = (v) => parseFloat(String(v).replace(',', '.'));
globalThis.clearAddFormError = () => {};
globalThis.showAddFormError = () => {};
globalThis.addRecentCategory = () => {};
globalThis.resetStandardFormAfterSave = () => {};
globalThis.focusAmountField = () => {};
globalThis.onCreditCardPurchaseToggle = () => {};
globalThis.formatTransactionSavedToast = () => 'ok';
globalThis.syncCreditCardOnTransactionSave = () => {};
globalThis.setSyncStatus = () => {};
globalThis.refreshCurrentView = () => {};
globalThis.stateRef = { set: () => Promise.resolve() };
globalThis.runLoanMigrations = () => false;
globalThis.runCreditCardMigrations = () => false;
globalThis.runAssetAnalyticsMigrations = () => false;
globalThis.migrateCategoryData = () => false;
globalThis.migrateLoanCategoryTree = () => false;
globalThis.checkAndProcessRecurringTransactions = () => {};
globalThis.cloudSyncUnlocked = true;

load('js/constants.js');
load('js/portfolio.js');
load('js/cash.js');
load('js/asset-analytics.js');
load('js/assets.js');
load('js/state.js');
load('js/transactions.js');

// Stan jak u użytkownika: gotówka wyzerowana
appState = {
  transactions: [],
  loans: [],
  creditCards: [],
  creditCardMovements: [],
  assets: [{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0, cashBaseline: 0 }],
  cashMovements: [],
  assetSnapshots: [],
  assetValueHistory: [],
  categoryBudgets: {},
  reportPrefs: {},
  deletedAssetIds: []
};
categoryTree = DEFAULT_CATEGORY_TREE;
formState = { formMode: 'income', currentType: 'income', selectedMainCategory: 'Praca', selectedSubCategory: 'Test' };
editingTxIndex = null;

console.log('BEFORE saveTransaction:', JSON.stringify({
  amount: getAssetById('asset-cash-total')?.amount,
  baseline: getAssetById('asset-cash-total')?.cashBaseline,
  movements: appState.cashMovements.length
}));

saveTransaction();

const afterSave = getAssetById('asset-cash-total');
console.log('AFTER saveTransaction:', JSON.stringify({
  amount: afterSave?.amount,
  baseline: afterSave?.cashBaseline,
  movements: appState.cashMovements.length,
  txCount: appState.transactions.length
}));

// Symulacja Firebase nadpisującego amount=0 bez movements
const remoteBad = {
  transactions: appState.transactions,
  assets: [{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0, cashBaseline: 0 }],
  cashMovements: [],
  loans: [],
  creditCards: [],
  creditCardMovements: [],
  categoryBudgets: {},
  reportPrefs: {},
  deletedAssetIds: []
};
localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
syncFromRemoteData(remoteBad);

const afterSync = getAssetById('asset-cash-total');
console.log('AFTER syncFromRemoteData (remote zeruje):', JSON.stringify({
  amount: afterSync?.amount,
  baseline: afterSync?.cashBaseline,
  movements: appState.cashMovements.length
}));

renderAssets();
const afterRender = getAssetById('asset-cash-total');
console.log('AFTER renderAssets:', JSON.stringify({
  amount: afterRender?.amount,
  baseline: afterRender?.cashBaseline,
  movements: appState.cashMovements.length
}));

const pass = afterRender?.amount > 0;
console.log(pass ? '\nPASS: saldo > 0 po pełnym przepływie' : '\nFAIL: saldo nadal 0');

// Race: sync z Firebase zanim localStorage zdąży zapisać ruch gotówki
appState = {
  transactions: [],
  loans: [],
  creditCards: [],
  creditCardMovements: [],
  assets: [{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0, cashBaseline: 0 }],
  cashMovements: [],
  assetSnapshots: [],
  assetValueHistory: [],
  categoryBudgets: {},
  reportPrefs: {},
  deletedAssetIds: []
};
localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
const raceTx = { type: 'income', amount: 5, date: '2026-06-29', mainCategory: 'Praca', subCategory: 'Test', affectsCash: true };
appState.transactions.unshift(raceTx);
syncCashOnTransactionSave(raceTx);
syncFromRemoteData({
  transactions: [],
  assets: [{ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0, cashBaseline: 0 }],
  cashMovements: [],
  loans: [],
  creditCards: [],
  creditCardMovements: [],
  categoryBudgets: {},
  reportPrefs: {},
  deletedAssetIds: []
});
const raceAfter = getAssetById('asset-cash-total');
const racePass = raceAfter?.amount === 5 && appState.cashMovements.length === 1;
console.log('RACE sync przed zapisem localStorage:', JSON.stringify({
  amount: raceAfter?.amount,
  movements: appState.cashMovements.length
}));
console.log(racePass ? 'PASS: race' : 'FAIL: race');
process.exit(pass && racePass ? 0 : 1);
