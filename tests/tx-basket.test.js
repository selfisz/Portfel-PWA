import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScriptsInOrder } from './helpers/load.js';

beforeAll(() => {
    globalThis.localStorage = {
        store: {},
        getItem(key) { return this.store[key] ?? null; },
        setItem(key, value) { this.store[key] = String(value); },
        removeItem(key) { delete this.store[key]; },
        clear() { this.store = {}; }
    };
    globalThis.transactionFingerprint = (tx) => [
        tx.date, tx.type, tx.mainCategory, tx.subCategory,
        Number(tx.amount).toFixed(2), tx.note || '', tx.recurringId || ''
    ].join('|');
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d;
    globalThis.escapeHtml = (s) => String(s);
    globalThis.summarizePeriod = (tx) => {
        const income = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return { income, expense, balance: income - expense, savings: 0 };
    };
    globalThis.showAppToast = vi.fn();
    globalThis.confirm = vi.fn(() => true);
    loadScriptsInOrder([
        'js/reports-debt.js',
        'js/tx-basket.js'
    ]);
});

beforeEach(() => {
    localStorage.clear();
    initTxBasket();
});

describe('tx-basket', () => {
    const sampleTx = {
        date: '2026-06-01',
        type: 'expense',
        mainCategory: 'Jedzenie',
        subCategory: 'Sklep',
        amount: 42.5,
        note: 'test'
    };

    it('deduplicates items by fingerprint', () => {
        expect(addTransactionsToBasket([sampleTx])).toBe(1);
        expect(addTransactionsToBasket([sampleTx])).toBe(0);
        expect(getBasketCount()).toBe(1);
    });

    it('clearTxBasket does not touch appState transactions', () => {
        globalThis.appState = { transactions: [{ ...sampleTx }] };
        addTransactionsToBasket([sampleTx]);
        clearTxBasket();
        expect(getBasketCount()).toBe(0);
        expect(appState.transactions).toHaveLength(1);
    });

    it('persists basket in localStorage', () => {
        addTransactionsToBasket([sampleTx]);
        initTxBasket();
        expect(getBasketCount()).toBe(1);
        expect(getBasketTransactions()[0].amount).toBe(42.5);
    });

    it('buildTxBasketPrintBody uses transaction table section', () => {
        addTransactionsToBasket([sampleTx]);
        const html = buildTxBasketPrintBody();
        expect(html).toContain('reports-pdf-table');
        expect(html).toContain('Koszyk');
        expect(html).toContain('42.50');
    });

    it('promptClearTxBasketAfterPrint clears when confirmed', () => {
        addTransactionsToBasket([sampleTx]);
        confirm.mockReturnValueOnce(true);
        promptClearTxBasketAfterPrint();
        expect(getBasketCount()).toBe(0);
    });

    it('promptClearTxBasketAfterPrint keeps basket when declined', () => {
        addTransactionsToBasket([sampleTx]);
        confirm.mockReturnValueOnce(false);
        promptClearTxBasketAfterPrint();
        expect(getBasketCount()).toBe(1);
    });
});
