import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    loadScript('js/constants.js');
    loadScript('js/format.js');
    loadScript('js/portfolio.js');
    loadScript('js/notifications.js');
    loadScript('js/budget-ui.js');

    globalThis.renderCategoryIcon = () => '<span class="cat-icon"></span>';
    globalThis.localIsoDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
});

beforeEach(() => {
    globalThis.appState = {
        transactions: [],
        categoryBudgets: {},
        subCategoryBudgets: {},
        reportPrefs: {}
    };
});

describe('getCategorySpentInMonth', () => {
    it('sumuje wydatki w miesiącu kalendarzowym', () => {
        appState.transactions = [
            { type: 'expense', mainCategory: 'Jedzenie', amount: 100, date: '2026-06-01' },
            { type: 'expense', mainCategory: 'Jedzenie', amount: 50, date: '2026-06-30' },
            { type: 'expense', mainCategory: 'Jedzenie', amount: 200, date: '2026-05-31' },
            { type: 'income', mainCategory: 'Jedzenie', amount: 999, date: '2026-06-15' }
        ];
        expect(getCategorySpentInMonth('Jedzenie', '2026-06')).toBe(150);
    });

    it('wlicza zakupy kartą kredytową', () => {
        appState.transactions = [
            { type: 'expense', mainCategory: 'Zakupy', amount: 300, date: '2026-06-10', creditCardId: 'c1', affectsCash: false },
            { type: 'expense', mainCategory: 'Zakupy', amount: 100, date: '2026-06-12', affectsCash: true }
        ];
        expect(getCategorySpentInMonth('Zakupy', '2026-06')).toBe(400);
    });

    it('nie wlicza zaplanowanego wydatku z kolejnego miesiąca do bieżącego', () => {
        appState.categoryBudgets = { Jedzenie: 1000 };
        appState.transactions = [
            { type: 'expense', mainCategory: 'Jedzenie', amount: 200, date: '2026-07-05', subCategory: 'Sklep' }
        ];
        expect(getCategorySpentInMonth('Jedzenie', '2026-06')).toBe(0);
        expect(getCategorySpentInMonth('Jedzenie', '2026-07')).toBe(200);
    });
});

describe('getSubCategorySpentInMonth', () => {
    it('liczy tylko wybraną podkategorię', () => {
        appState.transactions = [
            { type: 'expense', mainCategory: 'Dom', subCategory: 'Remont', amount: 100, date: '2026-06-05' },
            { type: 'expense', mainCategory: 'Dom', subCategory: 'Czynsz', amount: 50, date: '2026-06-06' }
        ];
        expect(getSubCategorySpentInMonth('Dom', 'Remont', '2026-06')).toBe(100);
    });
});

describe('getCategoryBudgetStatus', () => {
    it('zwraca null bez limitu', () => {
        expect(getCategoryBudgetStatus('Dom', '2026-06')).toBeNull();
    });

    it('liczy procent i stan', () => {
        appState.categoryBudgets = { Transport: 1000 };
        appState.transactions = [
            { type: 'expense', mainCategory: 'Transport', amount: 850, date: '2026-06-10' }
        ];
        const status = getCategoryBudgetStatus('Transport', '2026-06');
        expect(status.pct).toBe(85);
        expect(status.state).toBe('warn');
    });
});

describe('getAllCategoryBudgetStatuses', () => {
    it('sortuje przekroczone na górę i obejmuje podkategorie', () => {
        appState.categoryBudgets = { A: 100 };
        appState.subCategoryBudgets = { [`B\u0001Sub`]: 100 };
        appState.transactions = [
            { type: 'expense', mainCategory: 'A', amount: 50, date: '2026-06-01' },
            { type: 'expense', mainCategory: 'B', subCategory: 'Sub', amount: 120, date: '2026-06-01' }
        ];
        const statuses = getAllCategoryBudgetStatuses('2026-06');
        expect(statuses[0].label).toContain('B');
        expect(statuses[0].state).toBe('over');
    });
});

describe('projectBudgetSpentAfterTx', () => {
    it('uwzględnia edycję w tej samej kategorii', () => {
        appState.transactions = [
            { type: 'expense', mainCategory: 'Dom', amount: 400, date: '2026-06-05' }
        ];
        const previousTx = { type: 'expense', mainCategory: 'Dom', amount: 400, date: '2026-06-05' };
        const draft = { type: 'expense', mainCategory: 'Dom', amount: 600, date: '2026-06-05' };
        expect(projectBudgetSpentAfterTx(draft, previousTx, '2026-06', 'main')).toBe(600);
    });
});

describe('confirmTransactionBudgetIfNeeded', () => {
    it('wymaga potwierdzenia przy przekroczeniu limitu', () => {
        appState.categoryBudgets = { Jedzenie: 1000 };
        appState.transactions = [
            { type: 'expense', mainCategory: 'Jedzenie', amount: 900, date: '2026-06-10' }
        ];
        globalThis.confirm = () => false;
        const tx = {
            type: 'expense',
            mainCategory: 'Jedzenie',
            amount: 200,
            date: '2026-06-11'
        };
        expect(confirmTransactionBudgetIfNeeded(tx, null)).toBe(false);

        globalThis.confirm = () => true;
        expect(confirmTransactionBudgetIfNeeded(tx, null)).toBe(true);
    });

    it('pomija confirm gdy wyłączony w ustawieniach', () => {
        appState.reportPrefs.budgetConfirmOnOver = false;
        appState.categoryBudgets = { Jedzenie: 1000 };
        appState.transactions = [
            { type: 'expense', mainCategory: 'Jedzenie', amount: 900, date: '2026-06-10' }
        ];
        globalThis.confirm = () => false;
        const tx = {
            type: 'expense',
            mainCategory: 'Jedzenie',
            amount: 200,
            date: '2026-06-11'
        };
        expect(confirmTransactionBudgetIfNeeded(tx, null)).toBe(true);
    });
});
