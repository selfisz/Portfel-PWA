import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };

    globalThis.document = {
        getElementById: () => null,
        addEventListener: () => {},
        querySelector: () => null
    };

    loadScript('js/constants.js');
    loadScript('js/format.js');
    loadScript('js/transaction-duplicates.js');
    loadScript('js/recurring-confirm.js');
    loadScript('js/notifications.js');
    loadScript('js/action-board.js');

    globalThis.escapeHtml = (s) => String(s);
    globalThis.formatTxDate = (d) => d;
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTransactionCategoryLabel = (tx) => tx.mainCategory;
    globalThis.formatAssistantTransactionPreview = (tx) => `${tx.amount} zł`;
    globalThis.formatRecurringMonthLabel = (k) => k;
    globalThis.localIsoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
    globalThis.getCurrentMonthKey = () => '2026-07';
});

beforeEach(() => {
    localStorage.clear();
    globalThis.appState = {
        transactions: [],
        pendingRecurringConfirmations: [],
        skippedRecurringMonths: {}
    };
});

describe('collectActionBoardTasks', () => {
    it('zbiera cykliczną, brak kategorii i duplikat z priorytetami', () => {
        appState.pendingRecurringConfirmations = [{
            id: 'prec_r1_2026-07',
            recurringId: 'r1',
            monthKey: '2026-07',
            transaction: { type: 'expense', amount: 49, date: '2026-07-01', mainCategory: 'Subskrypcje', subCategory: 'Filmy' }
        }];
        appState.transactions = [
            { type: 'expense', date: '2026-07-02', amount: 80, mainCategory: 'Różne', subCategory: '[Bez podkategorii]' },
            { type: 'expense', date: '2026-07-03', amount: 10, mainCategory: 'Różne', subCategory: '[Bez podkategorii]' },
            { type: 'expense', date: '2026-07-04', amount: 25, mainCategory: 'Jedzenie', subCategory: 'X' },
            { type: 'expense', date: '2026-07-04', amount: 25, mainCategory: 'Jedzenie', subCategory: 'X' }
        ];

        const tasks = collectActionBoardTasks();
        expect(tasks.some((t) => t.type === 'recurring_confirm' && t.priority === 2)).toBe(true);
        expect(tasks.some((t) => t.type === 'uncategorized' && t.priority === 2)).toBe(true);
        expect(tasks.some((t) => t.type === 'uncategorized' && t.priority === 3)).toBe(true);
        expect(tasks.some((t) => t.type === 'duplicate' && t.priority === 3)).toBe(true);
    });

    it('licznik badge pomija P3', () => {
        appState.transactions = [
            { type: 'expense', date: '2026-07-02', amount: 10, mainCategory: 'Różne', subCategory: '[Bez podkategorii]' },
            { type: 'expense', date: '2026-07-03', amount: 80, mainCategory: 'Różne', subCategory: '[Bez podkategorii]' }
        ];
        expect(getActionBoardBadgeCount()).toBe(1);
    });

    it('snooze ukrywa zadanie do jutra', () => {
        appState.transactions = [
            { type: 'expense', date: '2026-07-02', amount: 80, mainCategory: 'Różne', subCategory: '[Bez podkategorii]' }
        ];
        const id = collectActionBoardTasks()[0].id;
        snoozeActionBoardTask(id);
        expect(collectActionBoardTasks().length).toBe(0);
    });
});

describe('buildActionBoardReviewText', () => {
    it('informuje o braku pilnych zadań gdy są tylko P3', () => {
        appState.transactions = [
            { type: 'expense', date: '2026-07-02', amount: 5, mainCategory: 'Różne', subCategory: '[Bez podkategorii]' }
        ];
        const text = buildActionBoardReviewText();
        expect(text).toMatch(/pilnych zadań/i);
    });
});
