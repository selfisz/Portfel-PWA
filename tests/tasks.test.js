import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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
    loadScript('js/skryba-dates.js');
    loadScript('js/state.js');
    loadScript('js/tasks.js');

    globalThis.escapeHtml = (s) => String(s);
    globalThis.formatTxDate = (d) => d;
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.getTomorrowIsoDate = () => '2026-07-06';
    globalThis.localIsoDate = (d) => {
        if (!(d instanceof Date)) return String(d);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    globalThis.daysUntilDate = (iso) => {
        const today = new Date('2026-07-05T12:00:00');
        const target = new Date(`${iso}T12:00:00`);
        return Math.round((target - today) / 86400000);
    };
    globalThis.saveState = () => {};
});

beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-05T10:00:00'));
    appState.transactions = [];
    appState.loans = [];
    appState.creditCards = [];
    appState.creditCardMovements = [];
    appState.assets = [];
    appState.cashMovements = [];
    appState.assetSnapshots = [];
    appState.assetValueHistory = [];
    appState.categoryBudgets = {};
    appState.subCategoryBudgets = {};
    appState.categoryIcons = { expense: { mains: {}, subs: {} }, income: { mains: {}, subs: {} } };
    appState.reportPrefs = {};
    appState.categoryRules = [];
    appState.pendingRecurringConfirmations = [];
    appState.skippedRecurringMonths = {};
    appState.deletedAssetIds = [];
    appState.todoLists = [];
    appState.todos = [];
});

describe('moduł zadań', () => {
    it('inicjalizuje domyślne listy', () => {
        ensureTodoListsInitialized();
        expect(appState.todoLists).toHaveLength(4);
        expect(getTodoListByKind('shopping')?.name).toBe('Zakupy');
        expect(getTodoListByKind('reminders')?.name).toBe('Przypomnienia');
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
        expect(merged.todoLists.length).toBeGreaterThanOrEqual(4);
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

    it('priorytetyzuje pilne zadania na pulpicie', () => {
        const shopping = getTodoListByKind('shopping');
        const payments = getTodoListByKind('payments');
        addTodoItem({ title: 'Później', listId: shopping.id, dueDate: '2026-07-20' });
        addTodoItem({ title: 'Dziś', listId: payments.id, dueDate: '2026-07-05' });
        addTodoItem({ title: 'Bez terminu', listId: shopping.id });
        const items = getDashboardTodoItems(3);
        expect(items[0].title).toBe('Dziś');
        expect(getUrgentTodosCount()).toBe(1);
        expect(getTasksBadgeCount()).toBe(1);
    });

    it('tworzy powiadomienie o terminie zadania', () => {
        const created = [];
        globalThis.upsertNotification = (proposal) => {
            created.push(proposal);
            return { isNew: true, item: proposal };
        };
        const list = getTodoListByKind('payments');
        addTodoItem({ title: 'Czynsz', listId: list.id, dueDate: '2026-07-05', amount: 2500 });
        evaluateTaskDueReminders();
        const matches = created.filter((entry) => entry.title.includes('Czynsz'));
        expect(matches).toHaveLength(1);
        expect(matches[0].type).toBe('task_due_today');
    });

    it('parsuje ustaw przypomnienie z datą słowną', () => {
        const parsed = tryParseSkrybaTodoAdd('ustaw przypomnienie na 20 lipca');
        expect(parsed?.titles).toEqual(['Przypomnienie']);
        expect(parsed?.dueDate).toBe('2026-07-20');
        expect(parsed?.kind).toBe('reminders');
    });

    it('kieruje przypomnij bez listy na Przypomnienia, nie na Zakupy', () => {
        const parsed = tryParseSkrybaTodoAdd('przypomnij o wizycie u lekarza');
        expect(parsed?.kind).toBe('reminders');
        expect(parsed?.titles[0]).toMatch(/lekarz/i);
        const list = getTodoListByKind('reminders');
        const answer = tryAnswerSkrybaTodoQuery('dodaj przypomnienie o ubezpieczeniu');
        expect(answer?.items[0]?.listId).toBe(list.id);
    });

    it('przejmuje własną listę Przypomnienia jako wbudowaną', () => {
        appState.todoLists.push({
            id: 'todo-list-custom-rem',
            name: 'Przypomnienia',
            kind: 'custom',
            sortOrder: 9,
            builtIn: false,
            archived: false
        });
        appState.todos.push({
            id: 'todo-rem-1',
            listId: 'todo-list-custom-rem',
            title: 'Test',
            done: false,
            sortOrder: 0,
            createdAt: '2026-07-05T10:00:00.000Z',
            updatedAt: '2026-07-05T10:00:00.000Z'
        });
        ensureTodoListsInitialized();
        const list = getTodoListByKind('reminders');
        expect(list?.id).toBe('todo-list-reminders');
        expect(getTodoItemById('todo-rem-1')?.listId).toBe('todo-list-reminders');
        expect(appState.todoLists.filter((entry) => entry.name === 'Przypomnienia')).toHaveLength(1);
    });

    it('dodaje przypomnienie przez Skrybę', () => {
        const answer = tryAnswerSkrybaTodoQuery('ustaw przypomnienie na 20 lipca o czynszu');
        expect(answer?.intro).toMatch(/czynsz/i);
        expect(answer?.items.some((item) => /czynsz/i.test(item.title))).toBe(true);
        expect(answer?.items[0]?.dueDate).toBe('2026-07-20');
    });

    it('parsuje ustaw przypomnienie bez tytułu', () => {
        const answer = tryAnswerSkrybaTodoQuery('ustaw przypomnienie na 20 lipca');
        expect(answer?.intro).toMatch(/Przypomnienie/);
        expect(answer?.items[0]?.dueDate).toBe('2026-07-20');
    });

    it('parsuje termin i kwotę w dodawaniu przez Skrybę', () => {
        const parsed = tryParseSkrybaTodoAdd('przypomnij o prądzie w piątek, 200 zł do zapłaty');
        expect(parsed?.kind).toBe('payments');
        expect(parsed?.titles[0]).toMatch(/prąd/i);
        expect(parsed?.amount).toBe(200);
        expect(parsed?.dueDate).toBe('2026-07-10');
    });

    it('pokazuje płatności na tydzień', () => {
        const list = getTodoListByKind('payments');
        addTodoItem({ title: 'Czynsz', listId: list.id, dueDate: '2026-07-08', amount: 2500 });
        addTodoItem({ title: 'Internet', listId: list.id, dueDate: '2026-07-20' });
        const show = tryParseSkrybaTodoShow('pokaż płatności na tydzień');
        expect(show?.scope).toBe('week');
        const answer = tryAnswerSkrybaTodoQuery('pokaż płatności na tydzień');
        expect(answer?.items).toHaveLength(1);
        expect(answer.items[0].title).toBe('Czynsz');
    });

    it('buduje poranny przegląd z zadaniami', () => {
        const payments = getTodoListByKind('payments');
        addTodoItem({ title: 'Czynsz', listId: payments.id, dueDate: '2026-07-05' });
        const text = buildMorningDailyReviewText();
        expect(text).toContain('Moje zadania');
        expect(text).toContain('Czynsz');
    });

    it('zwraca przegląd zadań dla Skryby', () => {
        const payments = getTodoListByKind('payments');
        addTodoItem({ title: 'Prąd', listId: payments.id, dueDate: '2026-07-05', amount: 200 });
        const overview = skrybaToolTodoOverview({ kind: 'payments' });
        expect(overview.items).toHaveLength(1);
        expect(overview.urgentCount).toBe(1);
        expect(overview.items[0].title).toBe('Prąd');
    });

    it('pokazuje otwarte zadania na tablicy', () => {
        ensureTodoListsInitialized();
        const shopping = getTodoListByKind('shopping');
        addTodoItem({ title: 'Mleko', listId: shopping.id });
        const board = collectUserTodoBoardTasks();
        expect(board).toHaveLength(1);
        expect(board[0].type).toBe('user_todo');
        expect(board[0].title).toBe('Zakupy');
    });

    it('nie chowa zadań przy nieaktualnym filtrze listy', () => {
        ensureTodoListsInitialized();
        tasksActiveFilter = 'todo-list-usunieta';
        const shopping = getTodoListByKind('shopping');
        addTodoItem({ title: 'Chleb', listId: shopping.id, dueDate: '2026-07-05' });
        expect(getFilteredTodos()).toHaveLength(1);
        expect(tasksActiveFilter).toBe('today');
    });

    it('buduje tekst eksportu listy zakupów', () => {
        const shopping = getTodoListByKind('shopping');
        tasksActiveFilter = shopping.id;
        addTodoItem({ title: 'Mleko', listId: shopping.id });
        addTodoItem({ title: 'Chleb', listId: shopping.id });
        const text = buildShoppingListExportText(shopping.id);
        expect(text).toContain('Zakupy');
        expect(text).toContain('- Mleko');
        expect(text).toContain('- Chleb');
    });

    it('pokazuje eksport tylko na zakładce Zakupy', () => {
        const shopping = getTodoListByKind('shopping');
        const payments = getTodoListByKind('payments');
        tasksActiveFilter = shopping.id;
        expect(getActiveShoppingList()?.id).toBe(shopping.id);
        tasksActiveFilter = payments.id;
        expect(getActiveShoppingList()).toBeNull();
        tasksActiveFilter = 'all';
        expect(getActiveShoppingList()).toBeNull();
    });

    it('usuwa dopisek from finance z tytułu zadania', () => {
        expect(stripTodoListHintFromTitle('test from finance')).toBe('test');
        expect(stripTodoListHintFromTitle('czynsz na finanse')).toBe('czynsz');
        expect(stripTodoListHintFromTitle('mleko')).toBe('mleko');
    });

    it('parsuje dodanie bez dopisku from finance', () => {
        const parsed = tryParseSkrybaTodoAdd('przypomnij test from finance');
        expect(parsed?.titles).toEqual(['test']);
        expect(parsed?.kind).toBe('reminders');
    });

    it('czyści istniejące zadania z dopiskiem from finance', () => {
        const list = getTodoListByKind('finance');
        appState.todos.push({
            id: 'todo-from-finance',
            listId: list.id,
            title: 'test from finance',
            done: false,
            sortOrder: 0,
            createdAt: '2026-07-05T10:00:00.000Z',
            updatedAt: '2026-07-05T10:00:00.000Z'
        });
        ensureTodoListsInitialized();
        expect(getTodoItemById('todo-from-finance')?.title).toBe('test');
    });

    it('nie pokazuje from finance w powiadomieniu o terminie', () => {
        const created = [];
        globalThis.upsertNotification = (proposal) => {
            created.push(proposal);
            return { isNew: true, item: proposal };
        };
        const list = getTodoListByKind('reminders');
        addTodoItem({ title: 'test from finance', listId: list.id, dueDate: '2026-07-05' });
        evaluateTaskDueReminders();
        expect(created[0]?.title).toBe('Dziś termin: test');
    });
});
