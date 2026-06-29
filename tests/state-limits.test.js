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

    loadScript('js/constants.js');
    loadScript('js/portfolio.js');
    loadScript('js/state-limits.js');

    runInContext(`
        appState = { transactions: [], cashMovements: [], loans: [], creditCards: [], assets: [] };
        function transactionFingerprint(tx) {
            return [tx.date, tx.type, tx.mainCategory, tx.amount].join('|');
        }
        function getPersistedState(raw) {
            return {
                transactions: raw.transactions || [],
                cashMovements: raw.cashMovements || [],
                loans: [],
                creditCards: [],
                assets: [],
                categoryTree: {},
                categoryBudgets: {},
                reportPrefs: {},
                deletedAssetIds: []
            };
        }
    `);
});

beforeEach(() => {
    localStorage.clear();
    runInContext(`appState = { transactions: [], cashMovements: [], assets: [], loans: [], creditCards: [] };`);
});

function makeTx(i) {
    const day = String((i % 28) + 1).padStart(2, '0');
    const month = String((i % 12) + 1).padStart(2, '0');
    return {
        type: 'expense',
        amount: 10 + i,
        mainCategory: 'Dom',
        subCategory: 'Test',
        date: `2020-${month}-${day}`
    };
}

describe('normalizeTransaction', () => {
    it('odrzuca NaN i brak kategorii', () => {
        expect(normalizeTransaction({ amount: 'x', type: 'expense', mainCategory: 'A', subCategory: 'B', date: '2024-01-01' })).toBeNull();
        expect(normalizeTransaction({ amount: 10, type: 'expense', mainCategory: '', subCategory: 'B', date: '2024-01-01' })).toBeNull();
    });

    it('akceptuje poprawną transakcję', () => {
        const tx = normalizeTransaction({
            amount: 12.5,
            type: 'expense',
            mainCategory: 'Dom',
            subCategory: 'Czynsz',
            date: '2024-06-01'
        });
        expect(tx.amount).toBe(12.5);
    });
});

describe('archiveTransactionOverflow', () => {
    it('przenosi nadmiar do archiwum lokalnego', () => {
        const txs = Array.from({ length: MAX_ACTIVE_TRANSACTIONS + 5 }, (_, i) => makeTx(i));
        const { active, archivedAdded } = archiveTransactionOverflow(txs);
        expect(active).toHaveLength(MAX_ACTIVE_TRANSACTIONS);
        expect(archivedAdded).toBe(5);
        expect(getArchivedTransactions()).toHaveLength(5);
    });
});

describe('enforceAppStateLimits', () => {
    it('przycina aktywne transakcje i zachowuje najnowsze', () => {
        const txs = Array.from({ length: MAX_ACTIVE_TRANSACTIONS + 3 }, (_, i) => makeTx(i));
        runInContext(`appState = { transactions: ${JSON.stringify(txs)}, cashMovements: [], assets: [], loans: [], creditCards: [] };`);
        const result = enforceAppStateLimits({ silent: true });
        expect(result.archivedAdded).toBe(3);
        expect(getActiveTransactionCount()).toBe(MAX_ACTIVE_TRANSACTIONS);
    });
});

describe('getMergedTransactions', () => {
    it('łączy aktywne z archiwum bez duplikatów', () => {
        runInContext(`
            appState.transactions = [{
                type: 'expense', amount: 100, mainCategory: 'Dom', subCategory: 'A', date: '2025-01-01'
            }];
        `);
        setArchivedTransactions([{
            type: 'expense', amount: 50, mainCategory: 'Transport', subCategory: 'B', date: '2019-01-01'
        }]);
        expect(getMergedTransactions()).toHaveLength(2);
    });
});
