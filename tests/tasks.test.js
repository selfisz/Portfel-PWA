import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.localStorage = {
        _data: {},
        getItem(k) { return this._data[k] ?? null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; },
        clear() { this._data = {}; }
    };

    globalThis.document = {
        getElementById: () => null,
        addEventListener: () => {}
    };

    loadScript('js/constants.js');
    loadScript('js/format.js');
    loadScript('js/state.js');
    loadScript('js/tasks.js');

    globalThis.escapeHtml = (s) => String(s);
    globalThis.formatTxDate = (d) => d;
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.saveState = () => {};
});

beforeEach(() => {
    globalThis.appState = {
        transactions: [],
        loans: [],
        creditCards: [],
        creditCardMovements: [],
        assets: [],
        cashMovements: [],
        assetSnapshots: [],
        assetValueHistory: [],
        categoryBudgets: {},
        subCategoryBudgets: {},
        categoryIcons: { expense: { mains: {}, subs: {} }, income: { mains: {}, subs: {} } },
        reportPrefs: {},
        categoryRules: [],
        pendingRecurringConfirmations: [],
        skippedRecurringMonths: {},
        deletedAssetIds: [],
        todoLists: [],
        todos: []
    };
});

describe('moduł zadań', () => {
    it('inicjalizuje domyślne listy', () => {
        ensureTodoListsInitialized();
        expect(appState.todoLists).toHaveLength(3);
        expect(getTodoListByKind('shopping')?.name).toBe('Zakupy');
    });

    it('dodaje i odhacza zadanie', () => {
        const list = getTodoListByKind('shopping');
        const item = addTodoItem({ title: 'Mleko', listId: list.id });
        expect(item.title).toBe('Mleko');
        expect(getOpenTodosCount()).toBe(1);
        toggleTodoItem(item.id);
        expect(getOpenTodosCount()).toBe(0);
    });

    it('parsuje dodanie przez Skrybę', () => {
        const parsed = tryParseSkrybaTodoAdd('dodaj mleko i chleb na zakupy');
        expect(parsed?.kind).toBe('shopping');
        expect(parsed?.titles).toEqual(['mleko', 'chleb']);
    });

    it('odpowiada na listę zakupów w Skrybie', () => {
        addTodoItem({ title: 'Masło', listId: getTodoListByKind('shopping').id, source: 'user' });
        const answer = tryAnswerSkrybaTodoQuery('pokaż listę zakupów');
        expect(answer?.items).toHaveLength(1);
        expect(answer?.items[0].title).toBe('Masło');
    });

    it('scala lokalne zadania z pustym stanem z chmury', () => {
        const list = getTodoListByKind('shopping');
        const localTodo = normalizeTodoItem({
            id: 'todo-test-1',
            listId: list.id,
            title: 'Jajka',
            done: false,
            createdAt: '2026-07-05T10:00:00.000Z',
            updatedAt: '2026-07-05T10:00:00.000Z'
        });
        const merged = mergeTodoFieldsIntoFinancePayload(
            { todoLists: [], todos: [] },
            { todoLists: getVisibleTodoLists(), todos: [localTodo] }
        );
        expect(merged.todos.some((t) => t.title === 'Jajka')).toBe(true);
        expect(merged.todoLists.length).toBeGreaterThanOrEqual(3);
    });

    it('edytuje zadanie i zmienia nazwę listy', () => {
        const list = getTodoListByKind('shopping');
        const item = addTodoItem({ title: 'Ser', listId: list.id });
        updateTodoItem(item.id, { title: 'Ser żółty' });
        expect(getTodoItemById(item.id).title).toBe('Ser żółty');
        renameTodoList(list.id, 'Sklep');
        expect(getTodoListById(list.id).name).toBe('Sklep');
    });

    it('usuwa wbudowaną listę i przywraca ją dla Skryby', () => {
        const list = getTodoListByKind('shopping');
        expect(archiveTodoList(list.id)).toBe(true);
        expect(getTodoListByKind('shopping')).toBeNull();
        const restored = ensureTodoListForKind('shopping');
        expect(restored?.archived).toBe(false);
        expect(getTodoListByKind('shopping')?.id).toBe(list.id);
    });
});
