import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScriptsInOrder } from './helpers/load.js';

beforeAll(() => {
    globalThis.appState = { transactions: [] };
    globalThis.getMergedTransactions = () => globalThis.appState.transactions;
    globalThis.localIsoDate = (d) => d.toISOString().slice(0, 10);
    globalThis.transactionFingerprint = (tx) => [
        tx.date, tx.type, tx.mainCategory, tx.subCategory,
        Number(tx.amount).toFixed(2), tx.note || ''
    ].join('|');
    loadScriptsInOrder(['js/search-utils.js', 'js/transaction-search.js']);
});

beforeEach(() => {
    globalThis.appState.transactions = [
        {
            date: '2026-06-01',
            type: 'expense',
            amount: 50,
            mainCategory: 'Przyjemności',
            subCategory: 'Gierki',
            note: 'Steam'
        },
        {
            date: '2026-06-02',
            type: 'expense',
            amount: 120,
            mainCategory: 'Zakupy',
            subCategory: '[Bez podkategorii]',
            note: 'Biedronka'
        }
    ];
});

describe('searchTransactionItems', () => {
    it('filtruje po kategorii i okresie', () => {
        const items = searchTransactionItems({
            mainCategory: 'Przyjemności',
            startDate: '2026-06-01',
            endDate: '2026-06-30',
            type: 'expense'
        });
        expect(items).toHaveLength(1);
        expect(items[0].subCategory).toBe('Gierki');
    });

    it('filtruje po zapytaniu tekstowym', () => {
        const items = searchTransactionItems({ query: 'biedronka', type: 'expense' });
        expect(items).toHaveLength(1);
        expect(items[0].mainCategory).toBe('Zakupy');
    });
});

describe('findActiveTransactionIndex', () => {
    it('znajduje indeks po fingerprintie kopii obiektu', () => {
        const copy = { ...globalThis.appState.transactions[0] };
        expect(findActiveTransactionIndex(copy)).toBe(0);
    });
});
