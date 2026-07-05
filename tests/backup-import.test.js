import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    loadScript('js/constants.js');
    loadScript('js/loan-details.js');
    loadScript('js/portfolio.js');
    loadScript('js/state-limits.js');
    loadScript('js/assets.js');
    loadScript('js/cash.js');
    loadScript('js/credit-cards.js');
    loadScript('js/asset-analytics.js');
    loadScript('js/category-rules.js');
    loadScript('js/tasks.js');
    loadScript('js/backup-import.js');
});

function validPayload(overrides = {}) {
    return {
        version: 2,
        exportedAt: '2026-01-01T00:00:00.000Z',
        data: {
            transactions: [],
            loans: [],
            creditCards: [],
            assets: [],
            cashMovements: [],
            ...overrides
        }
    };
}

describe('validateBackupPayload', () => {
    it('rzuca błąd dla null i braku transactions', () => {
        expect(() => validateBackupPayload(null)).toThrow('Nieprawidłowy plik');
        expect(() => validateBackupPayload({ data: { loans: [] } })).toThrow('brak listy transakcji');
    });

    it('akceptuje pustą listę transakcji', () => {
        const result = validateBackupPayload(validPayload());
        expect(result.data.transactions).toEqual([]);
        expect(result.transactionCount).toBe(0);
    });

    it('odrzuca niepoprawne transakcje i normalizuje poprawne', () => {
        const result = validateBackupPayload(validPayload({
            transactions: [
                { type: 'expense', amount: 12.5, mainCategory: 'Dom', subCategory: 'Czynsz', date: '2024-06-01' },
                { type: 'expense', amount: 'x', mainCategory: 'Dom', subCategory: 'X', date: '2024-06-02' },
                { type: 'expense', amount: 5, mainCategory: '', subCategory: 'X', date: '2024-06-03' }
            ]
        }));
        expect(result.data.transactions).toHaveLength(1);
        expect(result.data.transactions[0].amount).toBe(12.5);
        expect(result.report.droppedTransactions).toBe(2);
    });

    it('sanityzuje archiwum i aktywne transakcje', () => {
        const tx = { type: 'income', amount: 100, mainCategory: 'Wynagrodzenie', subCategory: 'Podstawa', date: '2019-01-01' };
        const result = validateBackupPayload({
            version: 2,
            archivedTransactions: [tx],
            data: { transactions: [tx], loans: [] }
        });
        expect(result.archivedTransactions).toHaveLength(1);
        expect(result.transactionCount).toBe(2);
    });

    it('ignoruje niebezpieczne klucze w categoryBudgets', () => {
        const result = validateBackupPayload(validPayload({
            categoryBudgets: {
                Dom: 1000,
                __proto__: { polluted: true }
            }
        }));
        expect(result.data.categoryBudgets.Dom).toBe(1000);
        expect(Object.prototype.hasOwnProperty.call(result.data.categoryBudgets, '__proto__')).toBe(false);
    });

    it('normalizuje karty i odrzuca ruch bez kwoty', () => {
        const result = validateBackupPayload(validPayload({
            creditCards: [{ id: 'card-1', name: 'mBank', limit: 5000, currentBalance: 100 }],
            creditCardMovements: [
                { id: 'ccm-1', cardId: 'card-1', type: 'repayment', amount: 50, date: '2024-01-01' },
                { id: 'ccm-2', cardId: 'card-1', type: 'repayment', amount: 0, date: '2024-01-02' }
            ]
        }));
        expect(result.data.creditCards).toHaveLength(1);
        expect(result.data.creditCardMovements).toHaveLength(1);
        expect(result.report.droppedCreditCardMovements).toBe(1);
    });

    it('formatBackupImportReport opisuje pominięte wpisy', () => {
        const text = formatBackupImportReport({
            droppedTransactions: 3,
            droppedLoans: 0,
            droppedCreditCards: 0,
            droppedCreditCardMovements: 0,
            droppedAssets: 0,
            droppedCashMovements: 0,
            droppedAssetSnapshots: 0,
            droppedAssetValueHistory: 0,
            droppedCategoryRules: 0,
            droppedTodoLists: 0,
            droppedTodos: 0,
            trimmedCashMovements: 0,
            trimmedAssetSnapshots: 0,
            trimmedAssetValueHistory: 0
        });
        expect(text).toContain('3 transakcji pominięto');
    });

    it('przywraca reguły kategorii i zadania z kopii', () => {
        const result = validateBackupPayload(validPayload({
            categoryRules: [
                { id: 'rule-1', pattern: 'biedronka', type: 'expense', mainCategory: 'Jedzenie', subCategory: 'Zakupy' },
                { id: 'rule-bad', pattern: '', type: 'expense', mainCategory: 'Dom', subCategory: 'X' }
            ],
            todoLists: [
                { id: 'todo-list-shopping', name: 'Zakupy', kind: 'shopping', sortOrder: 0, builtIn: true, archived: false },
                { id: 'todo-list-custom', name: 'Moje', kind: 'custom', sortOrder: 4, builtIn: false, archived: false }
            ],
            todos: [
                {
                    id: 'todo-1',
                    listId: 'todo-list-custom',
                    title: 'Kup mleko',
                    done: false,
                    sortOrder: 0,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z'
                },
                { id: 'todo-bad', listId: '', title: '', done: false }
            ]
        }));
        expect(result.data.categoryRules).toHaveLength(1);
        expect(result.data.categoryRules[0].pattern).toBe('biedronka');
        expect(result.report.droppedCategoryRules).toBe(1);
        expect(result.data.todoLists).toHaveLength(2);
        expect(result.data.todos).toHaveLength(1);
        expect(result.data.todos[0].title).toBe('Kup mleko');
        expect(result.report.droppedTodos).toBe(1);
    });
});
