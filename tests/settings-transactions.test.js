/**
 * Testy settings.js (saveCategoryEditor, saveBudgetEditor, getExportPayload, applyBackupPayload)
 * oraz transactions.js (deleteTransaction, editTransaction, logika zapisywania).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

let querySelectorAllOverride = null; // pozwala testom nadpisać document.querySelectorAll

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };

    const elements = {};
    function makeEl() {
        return {
            value: '', innerHTML: '', textContent: '', innerText: '',
            style: {}, checked: false, disabled: false, dataset: {},
            classList: {
                _s: new Set(),
                add(c) { this._s.add(c); },
                remove(c) { this._s.delete(c); },
                toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
                contains(c) { return this._s.has(c); }
            },
            getAttribute: () => null,
            setAttribute: () => {},
            focus: () => {},
            click: () => {},
            querySelector: () => null,
            querySelectorAll: () => []
        };
    }

    globalThis.document = {
        getElementById: (id) => {
            if (!elements[id]) elements[id] = makeEl();
            return elements[id];
        },
        querySelectorAll: (sel) => {
            if (querySelectorAllOverride) return querySelectorAllOverride(sel);
            return { forEach: () => {} };
        },
        querySelector: () => null,
        createElement: (tag) => ({
            tagName: tag, value: '', innerHTML: '', textContent: '',
            style: {}, className: '', id: '', type: '', maxLength: 0,
            dataset: {}, disabled: false, href: '', download: '',
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            appendChild: () => {},
            querySelector: () => ({ dataset: {}, value: '' }),
            querySelectorAll: () => []
        }),
        body: { style: {} }
    };

    globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    globalThis.confirm = () => true;
    globalThis.alert = () => {};

    // Firebase mocks
    globalThis.stateRef = { set: () => Promise.resolve(), on: () => {}, off: () => {} };
    globalThis.cloudBackupRef = { get: () => Promise.resolve({ exists: false, data: () => ({}) }) };
    globalThis.listCloudBackupSnapshots = () => Promise.resolve([]);
    globalThis.saveCloudBackupSnapshot = () => Promise.resolve();
    globalThis.getCloudBackupSnapshotById = () => Promise.resolve(null);
    globalThis.getCloudBackupPayload = () => Promise.resolve(null);

    // Minimal function stubs
    globalThis.saveState = () => {};
    globalThis.hapticFeedback = () => {};
    globalThis.refreshCurrentView = () => {};
    globalThis.renderDashboard = () => {};
    globalThis.switchView = () => {};
    globalThis.populateCreditCardSelectors = () => {};
    globalThis.onCreditCardPurchaseToggle = () => {};
    globalThis.updateAddFormCashHints = () => {};
    globalThis.setFormMode = () => {};
    globalThis.focusAmountField = () => {};
    globalThis.populateTransactionAssetSelect = () => {};
    globalThis.renderCategoryEditor = () => {};
    globalThis.showSettingsToast = () => {};
    globalThis.migrateRecentCategories = () => {};
    globalThis.purgeRecentCategoriesForDeleted = () => {};

    globalThis.escapeHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d || '';
    globalThis.renderCategoryIcon = (main) => `<span>${main}</span>`;

    // URL / Blob (backupToPhone)
    globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
    globalThis.Blob = class { constructor(parts, opts) { this.data = parts; this.type = opts?.type; } };

    loadScript('js/constants.js');
    loadScript('js/loan-details.js');
    loadScript('js/portfolio.js');
    loadScript('js/state.js');
    loadScript('js/state-limits.js');
    loadScript('js/backup-import.js');
    loadScript('js/format.js');
    loadScript('js/ui.js');
    loadScript('js/assets.js');
    loadScript('js/cash.js');
    loadScript('js/credit-cards.js');
    loadScript('js/loans.js');
    loadScript('js/transactions.js');
    loadScript('js/notifications.js');
    loadScript('js/budget-ui.js');
    loadScript('js/settings.js');

    runInContext(`
        function _getAppState()      { return appState; }
        function _setAppState(s)     { appState = s; }
        function _getCategoryTree()  { return categoryTree; }
        function _setCategoryTree(t) { categoryTree = t; }
        function _getCategoryEditorType() { return categoryEditorType; }
        function _setCategoryEditorType(t) { categoryEditorType = t; }
        function _getFormState()     { return formState; }
    `);
});

beforeEach(() => {
    querySelectorAllOverride = null;
    _setAppState({
        transactions: [],
        loans: [],
        creditCards: [],
        assets: [],
        cashMovements: [],
        assetSnapshots: [],
        assetValueHistory: [],
        categoryBudgets: {},
        subCategoryBudgets: {},
        reportPrefs: {},
        creditCardMovements: []
    });
    _setCategoryTree(JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)));
    globalThis.alert = () => {};
    globalThis.confirm = () => true;
    _setCategoryEditorType('expense');
});

// ===========================================================================
// Helper: buildGroups
// ===========================================================================
function buildGroups(groups) {
    return groups.map(({ mainOrig, mainNew, subs = [] }) => {
        const subInputs = subs.map(([oldSub, newSub]) => ({
            dataset: { original: oldSub }, value: newSub, focus() {}
        }));
        const mainInput = { dataset: { original: mainOrig }, value: mainNew, focus() {} };
        return {
            querySelector: (sel) => sel === '.category-edit-input--main' ? mainInput : null,
            querySelectorAll: (sel) => sel === '.category-edit-input--sub' ? subInputs : []
        };
    });
}

function setGroups(groups) {
    const mocked = buildGroups(groups);
    querySelectorAllOverride = (sel) => {
        if (sel === '#category-editor-list .category-edit-group') return mocked;
        return { forEach: () => {} };
    };
}

// ===========================================================================
// settings.js — formatCloudBackupCount
// ===========================================================================
describe('formatCloudBackupCount', () => {
    it('odmienia liczbę kopii po polsku', () => {
        expect(formatCloudBackupCount(1)).toBe('1 kopia');
        expect(formatCloudBackupCount(2)).toBe('2 kopie');
        expect(formatCloudBackupCount(4)).toBe('4 kopie');
        expect(formatCloudBackupCount(5)).toBe('5 kopii');
        expect(formatCloudBackupCount(22)).toBe('22 kopie');
    });
});

// ===========================================================================
// settings.js — getExportPayload
// ===========================================================================
describe('getExportPayload', () => {
    it('zwraca obiekt z version = 2 i archiwum', () => {
        const payload = getExportPayload();
        expect(payload.version).toBe(2);
        expect(Array.isArray(payload.archivedTransactions)).toBe(true);
    });

    it('zawiera exportedAt jako ISO string', () => {
        const payload = getExportPayload();
        expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('zawiera transactionCount równy liczbie transakcji', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Restauracje', amount: 100 },
            { date: '2024-01-02', type: 'income', mainCategory: 'Wynagrodzenie', subCategory: 'Premia', amount: 5000 }
        ]});
        const payload = getExportPayload();
        expect(payload.transactionCount).toBe(2);
    });

    it('zawiera data.transactions', () => {
        const payload = getExportPayload();
        expect(Array.isArray(payload.data.transactions)).toBe(true);
    });

    it('zwraca 0 transakcji gdy appState jest pusty', () => {
        const payload = getExportPayload();
        expect(payload.transactionCount).toBe(0);
    });
});

// ===========================================================================
// settings.js — applyBackupPayload
// ===========================================================================
describe('applyBackupPayload', () => {
    it('rzuca błąd gdy brak transactions', () => {
        expect(() => applyBackupPayload({ data: { loans: [] } })).toThrow('Nieprawidłowy plik');
    });

    it('rzuca błąd gdy payload jest null', () => {
        expect(() => applyBackupPayload(null)).toThrow();
    });

    it('rzuca błąd gdy transactions nie jest tablicą', () => {
        expect(() => applyBackupPayload({ transactions: 'bad' })).toThrow();
    });

    it('akceptuje payload bez wrappera data', () => {
        expect(() => applyBackupPayload({ transactions: [], loans: [] })).not.toThrow();
    });

    it('akceptuje payload z wrapperem data', () => {
        expect(() => applyBackupPayload({ data: { transactions: [], loans: [] } })).not.toThrow();
    });

    it('przywraca transakcje z payload.data', () => {
        const tx = { date: '2024-06-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 55, affectsCash: true };
        applyBackupPayload({ data: { transactions: [tx], loans: [] } });
        expect(_getAppState().transactions.length).toBeGreaterThan(0);
    });

    it('odrzuca śmieciowe transakcje przy imporcie', () => {
        applyBackupPayload({
            data: {
                transactions: [
                    { date: '2024-06-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'A', amount: 10 },
                    { date: 'bad', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'A', amount: 10 }
                ],
                loans: []
            }
        });
        expect(_getAppState().transactions).toHaveLength(1);
    });
});

// ===========================================================================
// settings.js — saveCategoryEditor
// ===========================================================================
describe('saveCategoryEditor', () => {
    it('alert gdy nazwa główna jest pusta', () => {
        let alertMsg = '';
        globalThis.alert = (msg) => { alertMsg = msg; };
        setGroups([{ mainOrig: 'Jedzenie', mainNew: '', subs: [['Biedronka', 'Biedronka']] }]);
        saveCategoryEditor();
        expect(alertMsg).toContain('pusta');
    });

    it('alert gdy nazwa podkategorii jest pusta', () => {
        let alertMsg = '';
        globalThis.alert = (msg) => { alertMsg = msg; };
        setGroups([{ mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['Biedronka', '']] }]);
        saveCategoryEditor();
        expect(alertMsg).toContain('pusta');
    });

    it('alert na duplikaty kategorii głównych', () => {
        let alertMsg = '';
        globalThis.alert = (msg) => { alertMsg = msg; };
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Duplikat', subs: [] },
            { mainOrig: 'Transport', mainNew: 'Duplikat', subs: [] }
        ]);
        saveCategoryEditor();
        expect(alertMsg).toContain('unikalne');
    });

    it('alert na duplikaty podkategorii', () => {
        let alertMsg = '';
        globalThis.alert = (msg) => { alertMsg = msg; };
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['A', 'Duplikat'], ['B', 'Duplikat']] }
        ]);
        saveCategoryEditor();
        expect(alertMsg).toContain('unikalne');
    });

    it('zapisuje zmiany nazwy głównej kategorii', () => {
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Żywność', subs: [['Biedronka', 'Biedronka']] }
        ]);
        saveCategoryEditor();
        const tree = _getCategoryTree();
        expect(tree.expense['Żywność']).toBeDefined();
        expect(tree.expense['Jedzenie']).toBeUndefined();
    });

    it('aktualizuje mainCategory w transakcjach po zmianie nazwy', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 50 }
        ]});
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Żywność', subs: [['Biedronka', 'Biedronka']] }
        ]);
        saveCategoryEditor();
        expect(_getAppState().transactions[0].mainCategory).toBe('Żywność');
    });

    it('aktualizuje subCategory w transakcjach po zmianie nazwy', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 50 }
        ]});
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['Biedronka', 'Lidl']] }
        ]);
        saveCategoryEditor();
        expect(_getAppState().transactions[0].subCategory).toBe('Lidl');
    });

    it('nie zmienia transakcji innego typu', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'income', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 50 }
        ]});
        _setCategoryEditorType('expense');
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Żywność', subs: [['Biedronka', 'Biedronka']] }
        ]);
        saveCategoryEditor();
        // Transakcja income nie powinna być zmieniona przez edytor expense
        expect(_getAppState().transactions[0].mainCategory).toBe('Jedzenie');
    });

    it('aktualizuje formState.selectedMainCategory po zmianie nazwy', () => {
        _getFormState().selectedMainCategory = 'Jedzenie';
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Żywność', subs: [['Biedronka', 'Biedronka']] }
        ]);
        saveCategoryEditor();
        expect(_getFormState().selectedMainCategory).toBe('Żywność');
    });

    it('nie zmienia transakcji gdy nazwa się nie zmieniła', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 50 }
        ]});
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['Biedronka', 'Biedronka']] }
        ]);
        saveCategoryEditor();
        expect(_getAppState().transactions[0].mainCategory).toBe('Jedzenie');
        expect(_getAppState().transactions[0].subCategory).toBe('Biedronka');
    });

    it('zapisuje nową kategorię główną', () => {
        setGroups([
            { mainOrig: '', mainNew: 'Hobby', subs: [] }
        ]);
        saveCategoryEditor();
        expect(_getCategoryTree().expense['Hobby']).toEqual([]);
    });

    it('zapisuje nową podkategorię w istniejącej kategorii', () => {
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['Biedronka', 'Biedronka'], ['', 'Apteka']] }
        ]);
        saveCategoryEditor();
        expect(_getCategoryTree().expense['Jedzenie']).toContain('Apteka');
    });

    it('alert gdy podkategoria ma zarezerwowaną nazwę', () => {
        let alertMsg = '';
        globalThis.alert = (msg) => { alertMsg = msg; };
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['Biedronka', '[Bez podkategorii]']] }
        ]);
        saveCategoryEditor();
        expect(alertMsg).toContain('zarezerowana');
    });

    it('usuwa kategorię główną usuniętą z edytora', () => {
        _setCategoryTree({
            expense: { Jedzenie: ['Biedronka'], Transport: [] },
            income: DEFAULT_CATEGORY_TREE.income
        });
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['Biedronka', 'Biedronka']] }
        ]);
        saveCategoryEditor();
        expect(_getCategoryTree().expense['Transport']).toBeUndefined();
        expect(_getCategoryTree().expense['Jedzenie']).toBeDefined();
    });

    it('usuwa podkategorię usuniętą z edytora', () => {
        _setCategoryTree({
            expense: { Jedzenie: ['Biedronka', 'Lidl'] },
            income: DEFAULT_CATEGORY_TREE.income
        });
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['Biedronka', 'Biedronka']] }
        ]);
        saveCategoryEditor();
        expect(_getCategoryTree().expense['Jedzenie']).toEqual(['Biedronka']);
    });

    it('czyści budżet usuniętej kategorii', () => {
        _setCategoryTree({
            expense: { Jedzenie: ['Biedronka'], Transport: [] },
            income: DEFAULT_CATEGORY_TREE.income
        });
        _setAppState({ ..._getAppState(), categoryBudgets: { Transport: 300, Jedzenie: 800 } });
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['Biedronka', 'Biedronka']] }
        ]);
        saveCategoryEditor();
        expect(_getAppState().categoryBudgets['Transport']).toBeUndefined();
        expect(_getAppState().categoryBudgets['Jedzenie']).toBe(800);
    });

    it('nie zmienia transakcji po usunięciu kategorii z drzewa', () => {
        _setCategoryTree({
            expense: { Jedzenie: ['Biedronka'], Transport: [] },
            income: DEFAULT_CATEGORY_TREE.income
        });
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Transport', subCategory: '[Bez podkategorii]', amount: 20 }
        ]});
        setGroups([
            { mainOrig: 'Jedzenie', mainNew: 'Jedzenie', subs: [['Biedronka', 'Biedronka']] }
        ]);
        saveCategoryEditor();
        expect(_getAppState().transactions[0].mainCategory).toBe('Transport');
    });

    it('alert gdy brak kategorii głównych', () => {
        let alertMsg = '';
        globalThis.alert = (msg) => { alertMsg = msg; };
        setGroups([]);
        saveCategoryEditor();
        expect(alertMsg).toContain('co najmniej jedna');
    });
});

// ===========================================================================
// settings.js — renderBudgetEditor
// ===========================================================================
describe('renderBudgetEditor', () => {
    it('renderuje nazwy kategorii obok ikon', () => {
        _setCategoryTree({
            expense: { Jedzenie: ['Sklep'], Transport: [] },
            income: DEFAULT_CATEGORY_TREE.income
        });
        renderBudgetEditor();
        const html = document.getElementById('settings-budget-list').innerHTML;
        expect(html).toContain('budget-limit-title');
        expect(html).toContain('Jedzenie');
        expect(html).toContain('Transport');
    });
});

// ===========================================================================
// settings.js — saveBudgetEditor
// ===========================================================================
describe('saveBudgetEditor', () => {
    function setInputs(inputs) {
        const listEl = document.getElementById('settings-budget-list');
        listEl.querySelectorAll = () => inputs;
        const prevOverride = querySelectorAllOverride;
        querySelectorAllOverride = (sel) => {
            if (sel === '#settings-budget-list .budget-editor-input') return inputs;
            if (prevOverride) return prevOverride(sel);
            return { forEach: () => {} };
        };
    }

    it('zapisuje limity budżetowe', () => {
        setInputs([
            { dataset: { kind: 'main', cat: 'Jedzenie' }, value: '800' },
            { dataset: { kind: 'main', cat: 'Transport' }, value: '300' }
        ]);
        saveBudgetEditor();
        const budgets = _getAppState().categoryBudgets;
        expect(budgets['Jedzenie']).toBe(800);
        expect(budgets['Transport']).toBe(300);
    });

    it('usuwa limit gdy wartość = 0', () => {
        _setAppState({ ..._getAppState(), categoryBudgets: { Jedzenie: 500 } });
        setInputs([{ dataset: { kind: 'main', cat: 'Jedzenie' }, value: '0' }]);
        saveBudgetEditor();
        expect(_getAppState().categoryBudgets['Jedzenie']).toBeUndefined();
    });

    it('ignoruje ujemne wartości (traktuje jako 0 → usuwa)', () => {
        setInputs([{ dataset: { kind: 'main', cat: 'Transport' }, value: '-50' }]);
        saveBudgetEditor();
        expect(_getAppState().categoryBudgets['Transport']).toBeUndefined();
    });

    it('ignoruje puste inputy', () => {
        setInputs([{ dataset: { kind: 'main', cat: 'Jedzenie' }, value: '' }]);
        saveBudgetEditor();
        expect(_getAppState().categoryBudgets['Jedzenie']).toBeUndefined();
    });

    it('zapisuje limity podkategorii', () => {
        setInputs([
            { dataset: { kind: 'sub', main: 'Jedzenie', sub: 'Sklep' }, value: '400' }
        ]);
        saveBudgetEditor();
        const key = typeof makeSubCategoryBudgetKey === 'function'
            ? makeSubCategoryBudgetKey('Jedzenie', 'Sklep')
            : 'Jedzenie\u0001Sklep';
        expect(_getAppState().subCategoryBudgets[key]).toBe(400);
    });

    it('applyAllBudgetSuggestions uzupełnia tylko kategorie ze średnią > 0', () => {
        const now = new Date();
        const m0 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 10);
        const m1 = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-10`;
        const jedzenieInput = { dataset: { kind: 'main', cat: 'Jedzenie' }, value: '' };
        const transportInput = { dataset: { kind: 'main', cat: 'Transport' }, value: '' };
        const listEl = document.getElementById('settings-budget-list');
        listEl.querySelectorAll = () => [jedzenieInput, transportInput];
        querySelectorAllOverride = (sel) => {
            if (sel === '#settings-budget-list .budget-editor-input') return [jedzenieInput, transportInput];
            return { forEach: () => {} };
        };
        _setAppState({ ..._getAppState(), transactions: [
            { date: m0, type: 'expense', mainCategory: 'Jedzenie', subCategory: 'A', amount: 600 },
            { date: m1, type: 'expense', mainCategory: 'Jedzenie', subCategory: 'A', amount: 600 }
        ]});
        applyAllBudgetSuggestions();
        expect(Number(jedzenieInput.value)).toBe(600);
        expect(transportInput.value).toBe('');
    });

    it('nie nadpisuje budżetów innych kategorii', () => {
        _setAppState({ ..._getAppState(), categoryBudgets: { Dom: 1000 } });
        setInputs([
            { dataset: { kind: 'main', cat: 'Jedzenie' }, value: '500' },
            { dataset: { kind: 'main', cat: 'Dom' }, value: '1000' }
        ]);
        saveBudgetEditor();
        expect(_getAppState().categoryBudgets['Dom']).toBe(1000);
        expect(_getAppState().categoryBudgets['Jedzenie']).toBe(500);
    });
});

// ===========================================================================
// transactions.js — deleteTransaction
// ===========================================================================
describe('deleteTransaction', () => {
    beforeEach(() => {
        globalThis.syncCreditCardOnTransactionDelete = () => {};
        globalThis.syncCashOnTransactionDelete = () => {};
        globalThis.syncAssetOnTransactionDelete = () => {};
    });

    it('usuwa transakcję po confirm=true', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 100 },
            { date: '2024-01-02', type: 'expense', mainCategory: 'Transport', subCategory: 'Paliwo', amount: 200 }
        ]});
        globalThis.confirm = () => true;
        deleteTransaction(0);
        expect(_getAppState().transactions.length).toBe(1);
        expect(_getAppState().transactions[0].mainCategory).toBe('Transport');
    });

    it('nie usuwa transakcji gdy confirm=false', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 100 }
        ]});
        globalThis.confirm = () => false;
        deleteTransaction(0);
        expect(_getAppState().transactions.length).toBe(1);
    });

    it('wywołuje syncCashOnTransactionDelete przy usuwaniu', () => {
        let syncCalled = false;
        globalThis.syncCashOnTransactionDelete = () => { syncCalled = true; };
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 100 }
        ]});
        globalThis.confirm = () => true;
        deleteTransaction(0);
        expect(syncCalled).toBe(true);
    });

    it('wywołuje syncCreditCardOnTransactionDelete przy usuwaniu', () => {
        let syncCalled = false;
        globalThis.syncCreditCardOnTransactionDelete = () => { syncCalled = true; };
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 100 }
        ]});
        globalThis.confirm = () => true;
        deleteTransaction(0);
        expect(syncCalled).toBe(true);
    });
});

// ===========================================================================
// transactions.js — editTransaction (DOM fill)
// ===========================================================================
describe('editTransaction', () => {
    beforeEach(() => {
        globalThis.syncCreditCardOnTransactionDelete = () => {};
        globalThis.syncCashOnTransactionDelete = () => {};
        globalThis.syncAssetOnTransactionDelete = () => {};
        globalThis.populateTransactionAssetSelect = () => {};
        globalThis.onCreditCardPurchaseToggle = () => {};
        globalThis.updateAddFormCashHints = () => {};
        globalThis.setFormMode = () => {};
        globalThis.switchView = () => {};
        globalThis.focusAmountField = () => {};
        globalThis.populateCreditCardSelectors = () => {};
        querySelectorAllOverride = (sel) => {
            if (sel === '.nav-item') return [{ click() {} }, { click() {} }];
            return [];
        };
    });

    it('ustawia wartości formularza na dane transakcji', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-06-15', type: 'expense', mainCategory: 'Dom', subCategory: 'Media', amount: 450, note: 'Rachunek' }
        ]});
        editTransaction(0);
        expect(document.getElementById('tx-amount').value).toBe(450);
        expect(document.getElementById('tx-date').value).toBe('2024-06-15');
        expect(document.getElementById('tx-note').value).toBe('Rachunek');
    });

    it('ustawia formState.selectedMainCategory', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Biedronka', amount: 80 }
        ]});
        editTransaction(0);
        expect(_getFormState().selectedMainCategory).toBe('Jedzenie');
    });

    it('ustawia formState.selectedSubCategory', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Lidl', amount: 80 }
        ]});
        editTransaction(0);
        expect(_getFormState().selectedSubCategory).toBe('Lidl');
    });

    it('ustawia editingTxIndex na poprawny index', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-01', type: 'expense', mainCategory: 'Transport', subCategory: 'Paliwo', amount: 200 },
            { date: '2024-01-02', type: 'expense', mainCategory: 'Dom', subCategory: 'Media', amount: 100 }
        ]});
        editTransaction(1);
        expect(_getFormState().selectedMainCategory).toBe('Dom');
    });
});

// ===========================================================================
// transactions.js — saveTransaction (walidacja)
// ===========================================================================
describe('saveTransaction — walidacja', () => {
    beforeEach(() => {
        globalThis.syncCreditCardOnTransactionSave = () => true;
        globalThis.syncCashOnTransactionSave = () => true;
        globalThis.syncAssetOnTransactionSave = () => true;
        globalThis.addRecentCategory = () => {};
        querySelectorAllOverride = (sel) => {
            if (sel === '.nav-item') return [{ click() {} }, { click() {} }];
            return [];
        };

        document.getElementById('tx-amount').value = '250';
        document.getElementById('tx-date').value = '2024-06-10';
        document.getElementById('tx-note').value = 'Test';
        document.getElementById('tx-recurring').checked = false;

        runInContext(`
            formState.currentType = 'expense';
            formState.selectedMainCategory = 'Jedzenie';
            formState.selectedSubCategory = 'Biedronka';
            editingTxIndex = null;
        `);
    });

    it('alert gdy brak kwoty', () => {
        document.getElementById('tx-amount').value = '';
        saveTransaction();
        expect(document.getElementById('add-form-error').textContent).toContain('Uzupełnij');
    });

    it('alert gdy brak kategorii głównej', () => {
        runInContext('formState.selectedMainCategory = "";');
        saveTransaction();
        expect(document.getElementById('add-form-error').textContent).toContain('Uzupełnij');
    });

    it('alert gdy brak podkategorii', () => {
        runInContext('formState.selectedSubCategory = "";');
        saveTransaction();
        expect(document.getElementById('add-form-error').textContent).toContain('Uzupełnij');
    });

    it('pokazuje błąd inline gdy brak daty', () => {
        document.getElementById('tx-date').value = '';
        saveTransaction();
        expect(document.getElementById('add-form-error').textContent).toContain('Uzupełnij');
    });

    it('zapisuje transakcję z poprawnymi danymi', () => {
        saveTransaction();
        const txs = _getAppState().transactions;
        expect(txs.some((t) => t.mainCategory === 'Jedzenie' && t.amount === 250)).toBe(true);
    });

    it('anuluje zapis gdy syncCashOnTransactionSave zwraca false (rollback)', () => {
        globalThis.syncCashOnTransactionSave = () => false;
        const before = _getAppState().transactions.length;
        saveTransaction();
        expect(_getAppState().transactions.length).toBe(before);
    });
});

// ===========================================================================
// settings.js — showSettingsToast
// ===========================================================================
describe('showSettingsToast', () => {
    it('ustawia textContent toastu', () => {
        showSettingsToast('Test wiadomość');
        expect(document.getElementById('settings-toast').textContent).toBe('Test wiadomość');
    });

    it('usuwa klasę hidden po wywołaniu', () => {
        const toast = document.getElementById('settings-toast');
        toast.classList.add('hidden');
        showSettingsToast('Zapisano');
        expect(toast.classList.contains('hidden')).toBe(false);
        expect(toast.classList.contains('settings-toast--success')).toBe(true);
    });

    it('showAppToast error ustawia wariant błędu', () => {
        const toast = document.getElementById('settings-toast');
        showAppToast('Coś poszło nie tak', 'error');
        expect(toast.classList.contains('settings-toast--error')).toBe(true);
    });
});

// ===========================================================================
// settings.js — setCategoryEditorType
// ===========================================================================
describe('setCategoryEditorType', () => {
    let renderCalled;
    beforeEach(() => {
        renderCalled = false;
        globalThis.renderCategoryEditor = () => { renderCalled = true; };
        _setCategoryEditorType('expense');
    });

    it('zmienia typ na income i wywołuje renderCategoryEditor', () => {
        setCategoryEditorType('income');
        expect(_getCategoryEditorType()).toBe('income');
        expect(renderCalled).toBe(true);
    });

    it('nie wywołuje render gdy typ się nie zmienił', () => {
        _setCategoryEditorType('expense');
        setCategoryEditorType('expense');
        expect(renderCalled).toBe(false);
    });

    it('aktywuje odpowiedni przycisk', () => {
        const incomeBtn = document.getElementById('btn-category-editor-income');
        const expenseBtn = document.getElementById('btn-category-editor-expense');
        setCategoryEditorType('income');
        expect(incomeBtn.classList.contains('active')).toBe(true);
        expect(expenseBtn.classList.contains('active')).toBe(false);
    });
});
