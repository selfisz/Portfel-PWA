const TODO_LIST_KINDS = {
    shopping: 'shopping',
    payments: 'payments',
    finance: 'finance',
    custom: 'custom'
};

const DEFAULT_TODO_LISTS = [
    { id: 'todo-list-shopping', name: 'Zakupy', kind: 'shopping', sortOrder: 0, builtIn: true, archived: false },
    { id: 'todo-list-payments', name: 'Do zapłaty', kind: 'payments', sortOrder: 1, builtIn: true, archived: false },
    { id: 'todo-list-finance', name: 'Finanse', kind: 'finance', sortOrder: 2, builtIn: true, archived: false }
];

let tasksActiveFilter = 'all';
let tasksShowDone = false;
let tasksNewListFormOpen = false;
let tasksListEditorOpen = false;
let tasksEditingItemId = null;

const DASHBOARD_TASKS_PAGE_SIZE = 5;
let dashboardTasksVisibleCount = DASHBOARD_TASKS_PAGE_SIZE;
let dashboardTasksListSignature = '';

function resetDashboardTasksPagination() {
    dashboardTasksVisibleCount = DASHBOARD_TASKS_PAGE_SIZE;
    dashboardTasksListSignature = '';
}

function showMoreDashboardTasks() {
    dashboardTasksVisibleCount += DASHBOARD_TASKS_PAGE_SIZE;
    renderDashboardTasksPanel();
}

function createTodoId(prefix = 'todo') {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeTodoList(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const name = String(raw.name || '').trim();
    if (!id || !name) return null;
    const kind = Object.values(TODO_LIST_KINDS).includes(raw.kind) ? raw.kind : 'custom';
    return {
        id,
        name,
        kind,
        sortOrder: Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0,
        builtIn: !!raw.builtIn,
        archived: !!raw.archived
    };
}

function normalizeTodoItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const listId = String(raw.listId || '').trim();
    const title = String(raw.title || '').trim();
    if (!id || !listId || !title) return null;
    const item = {
        id,
        listId,
        title,
        done: !!raw.done,
        sortOrder: Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0,
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
        source: raw.source === 'skryba' ? 'skryba' : 'user'
    };
    const dueDate = String(raw.dueDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) item.dueDate = dueDate;
    const amount = typeof raw.amount === 'number' ? raw.amount : parseFloat(raw.amount);
    if (Number.isFinite(amount) && amount > 0) item.amount = amount;
    if (raw.note) item.note = String(raw.note).slice(0, 500);
    if (item.done && raw.completedAt) item.completedAt = raw.completedAt;
    return item;
}

function normalizeTodoListsArray(list) {
    if (!Array.isArray(list)) return [];
    const byId = new Map();
    list.forEach((raw) => {
        const normalized = normalizeTodoList(raw);
        if (normalized) byId.set(normalized.id, normalized);
    });
    return [...byId.values()];
}

function normalizeTodosArray(list) {
    if (!Array.isArray(list)) return [];
    const byId = new Map();
    list.forEach((raw) => {
        const normalized = normalizeTodoItem(raw);
        if (normalized) byId.set(normalized.id, normalized);
    });
    return [...byId.values()];
}

function mergeTodoListsById(...sources) {
    const map = new Map();
    sources.flat().forEach((raw) => {
        const list = normalizeTodoList(raw);
        if (list) map.set(list.id, list);
    });
    return [...map.values()];
}

function mergeTodosById(...sources) {
    const map = new Map();
    sources.flat().forEach((raw) => {
        const item = normalizeTodoItem(raw);
        if (!item) return;
        const existing = map.get(item.id);
        if (!existing || String(item.updatedAt || '') >= String(existing.updatedAt || '')) {
            map.set(item.id, item);
        }
    });
    return [...map.values()];
}

function mergeTodoFieldsIntoFinancePayload(payload, ...sources) {
    const base = payload && typeof payload === 'object' ? payload : {};
    const listSources = sources.map((src) => (Array.isArray(src?.todoLists) ? src.todoLists : []));
    const todoSources = sources.map((src) => (Array.isArray(src?.todos) ? src.todos : []));
    return {
        ...base,
        todoLists: mergeTodoListsById(...listSources),
        todos: mergeTodosById(...todoSources)
    };
}

function ensureTodoListsInitialized() {
    if (!Array.isArray(appState.todoLists)) appState.todoLists = [];
    if (!Array.isArray(appState.todos)) appState.todos = [];

    const existingIds = new Set(appState.todoLists.map((list) => list.id));
    let changed = false;
    DEFAULT_TODO_LISTS.forEach((def) => {
        if (!existingIds.has(def.id)) {
            appState.todoLists.push({ ...def });
            changed = true;
        }
    });

    appState.todoLists = normalizeTodoListsArray(appState.todoLists);
    appState.todos = normalizeTodosArray(appState.todos);
    if (changed && typeof saveState === 'function') saveState({ silentLimits: true });
    return changed;
}

function getVisibleTodoLists() {
    ensureTodoListsInitialized();
    return [...appState.todoLists]
        .filter((list) => !list.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pl'));
}

function getTodoListById(listId) {
    ensureTodoListsInitialized();
    return appState.todoLists.find((list) => list.id === listId && !list.archived) || null;
}

function getTodoListByKind(kind) {
    ensureTodoListsInitialized();
    return appState.todoLists.find((list) => list.kind === kind && !list.archived) || null;
}

function ensureTodoListForKind(kind) {
    ensureTodoListsInitialized();
    const active = getTodoListByKind(kind);
    if (active) return active;
    const def = DEFAULT_TODO_LISTS.find((entry) => entry.kind === kind);
    if (!def) return null;
    const existing = appState.todoLists.find((list) => list.id === def.id);
    if (existing) {
        existing.archived = false;
        if (!existing.name) existing.name = def.name;
        if (typeof saveState === 'function') saveState({ silentLimits: true });
        return existing;
    }
    const list = normalizeTodoList({ ...def });
    if (!list) return null;
    appState.todoLists.push(list);
    if (typeof saveState === 'function') saveState({ silentLimits: true });
    return list;
}

function resolveTasksActiveListId() {
    if (tasksActiveFilter === 'all') return null;
    if (!getTodoListById(tasksActiveFilter)) {
        tasksActiveFilter = 'all';
        return null;
    }
    return tasksActiveFilter;
}

function getQuickAddTargetListId() {
    const active = resolveTasksActiveListId();
    if (active) return active;
    return getTodoListByKind('finance')?.id
        || getVisibleTodoLists()[0]?.id
        || DEFAULT_TODO_LISTS[0].id;
}

function getQuickAddPlaceholder() {
    const listId = getQuickAddTargetListId();
    const list = getTodoListById(listId);
    if (!list) return 'Dodaj zadanie…';
    if (list.kind === 'shopping') return 'Dodaj na listę zakupów…';
    if (list.kind === 'payments') return 'Dodaj płatność…';
    if (list.kind === 'finance') return 'Dodaj zadanie finansowe…';
    return `Dodaj do „${list.name}”…`;
}

function sortTodoItems(items) {
    return [...items].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
        return (a.sortOrder - b.sortOrder) || String(a.createdAt).localeCompare(String(b.createdAt));
    });
}

function getFilteredTodos(options = {}) {
    const includeDone = options.includeDone ?? tasksShowDone;
    const listId = options.listId !== undefined ? options.listId : resolveTasksActiveListId();
    ensureTodoListsInitialized();
    const items = appState.todos.filter((item) => {
        if (!includeDone && item.done) return false;
        if (listId && item.listId !== listId) return false;
        return true;
    });
    return sortTodoItems(items);
}

function getOpenTodosCount() {
    ensureTodoListsInitialized();
    return appState.todos.filter((item) => !item.done).length;
}

function getUrgentTodosCount() {
    ensureTodoListsInitialized();
    const tomorrow = typeof getTomorrowIsoDate === 'function'
        ? getTomorrowIsoDate()
        : null;
    if (!tomorrow) return 0;
    return appState.todos.filter((item) => !item.done && item.dueDate && item.dueDate <= tomorrow).length;
}

function getTasksBadgeCount() {
    const urgent = getUrgentTodosCount();
    return urgent > 0 ? urgent : getOpenTodosCount();
}

function compareDashboardTodoItems(a, b) {
    const today = localIsoDate(new Date());
    const rank = (item) => {
        if (!item.dueDate) return 4;
        if (item.dueDate < today) return 0;
        if (item.dueDate === today) return 1;
        const tomorrow = typeof getTomorrowIsoDate === 'function' ? getTomorrowIsoDate() : '';
        if (item.dueDate === tomorrow) return 2;
        return 3;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return (a.sortOrder - b.sortOrder) || String(a.createdAt).localeCompare(String(b.createdAt));
}

function getDashboardTodoItems(limit = null) {
    ensureTodoListsInitialized();
    const sorted = appState.todos
        .filter((item) => !item.done)
        .sort(compareDashboardTodoItems);
    if (limit == null) return sorted;
    return sorted.slice(0, limit);
}

function getTodoItemsDueWithinDays(days = 7, listKind = null) {
    ensureTodoListsInitialized();
    const today = localIsoDate(new Date());
    const end = new Date();
    end.setDate(end.getDate() + Math.max(0, days));
    const endIso = localIsoDate(end);
    return appState.todos
        .filter((item) => {
            if (item.done || !item.dueDate) return false;
            if (item.dueDate < today || item.dueDate > endIso) return false;
            if (listKind) {
                const list = getTodoListById(item.listId);
                if (!list || list.kind !== listKind) return false;
            }
            return true;
        })
        .sort(compareDashboardTodoItems);
}

function skrybaToolTodoOverview(params = {}) {
    ensureTodoListsInitialized();
    const open = appState.todos.filter((item) => !item.done);
    const tomorrow = typeof getTomorrowIsoDate === 'function' ? getTomorrowIsoDate() : '';
    const today = localIsoDate(new Date());
    const scope = params.scope || null;
    const kind = params.kind || null;

    let filtered = open;
    if (scope === 'week') {
        filtered = getTodoItemsDueWithinDays(7, kind || null);
    } else if (kind) {
        filtered = open.filter((item) => getTodoListById(item.listId)?.kind === kind);
    }

    const urgent = open.filter((item) => item.dueDate && tomorrow && item.dueDate <= tomorrow);
    const dueToday = open.filter((item) => item.dueDate === today);

    return {
        openCount: open.length,
        urgentCount: urgent.length,
        dueTodayCount: dueToday.length,
        scope: scope || 'all',
        kind,
        items: filtered.slice(0, 12).map((item) => ({
            id: item.id,
            title: item.title,
            dueDate: item.dueDate || null,
            amount: Number.isFinite(item.amount) ? item.amount : null,
            listKind: getTodoListById(item.listId)?.kind || null,
            listName: getTodoListById(item.listId)?.name || 'Zadania'
        }))
    };
}

function buildMorningDailyReviewText() {
    const sections = [];

    if (typeof buildActionBoardReviewText === 'function') {
        const boardText = buildActionBoardReviewText();
        if (!/pusta|nie masz pilnych/i.test(boardText)) {
            sections.push(`Tablica (system):\n${boardText}`);
        }
    }

    const urgent = getDashboardTodoItems().filter((item) => {
        if (!item.dueDate) return false;
        const tomorrow = typeof getTomorrowIsoDate === 'function' ? getTomorrowIsoDate() : '';
        return tomorrow && item.dueDate <= tomorrow;
    });

    if (urgent.length) {
        const lines = urgent.slice(0, 8).map((item, index) => {
            const list = getTodoListById(item.listId);
            const meta = formatTodoItemMeta(item);
            return `${index + 1}. ${item.title}${meta ? ` — ${meta}` : ''}${list ? ` (${list.name})` : ''}`;
        });
        sections.push(`Moje zadania (${urgent.length} pilnych):\n${lines.join('\n')}`);
    } else if (getOpenTodosCount() > 0) {
        sections.push(`Masz ${getOpenTodosCount()} otwartych zadań — bez pilnych terminów na dziś i jutro.`);
    }

    if (!sections.length) {
        return 'Poranny przegląd: Tablica pusta i brak pilnych zadań. Miłego dnia!';
    }

    return `Poranny przegląd:\n\n${sections.join('\n\n')}\n\nOtwórz Tablicę w dzwonku lub Zadania w nagłówku.`;
}

function getSkrybaDailyReviewText() {
    if (typeof buildMorningDailyReviewText === 'function') {
        return buildMorningDailyReviewText();
    }
    if (typeof buildActionBoardReviewText === 'function') {
        return buildActionBoardReviewText();
    }
    return 'Brak zadań do przeglądu.';
}

function openTasksFromNotifications() {
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
    if (typeof openTasksView === 'function') openTasksView();
}

function updateNotificationsTasksFooter() {
    const footer = document.getElementById('notifications-tasks-footer');
    if (!footer) return;
    const count = getOpenTodosCount();
    footer.classList.toggle('hidden', count === 0);
}

function collectUserTodoBoardTasks() {
    ensureTodoListsInitialized();
    return appState.todos
        .filter((item) => !item.done)
        .map((item) => {
            const list = getTodoListById(item.listId);
            const bodyParts = [item.title];
            if (Number.isFinite(item.amount) && typeof formatPlnAmount === 'function') {
                bodyParts.push(formatPlnAmount(item.amount));
            }
            let priority = 3;
            let title = list?.name || 'Zadanie';
            if (list?.kind === 'payments') title = 'Płatność do zrobienia';
            if (item.dueDate) {
                const days = typeof daysUntilDate === 'function' ? daysUntilDate(item.dueDate) : null;
                if (days !== null) {
                    if (days < 0) priority = 1;
                    else if (days <= 1) priority = 2;
                    if (typeof formatTxDate === 'function') bodyParts.push(formatTxDate(item.dueDate));
                    const dueLabel = formatTaskDueLabel(item.dueDate);
                    if (dueLabel) bodyParts.push(dueLabel);
                }
            }
            return {
                id: `user-todo|${item.id}`,
                type: 'user_todo',
                priority,
                title,
                body: bodyParts.join(' · '),
                sortAt: item.dueDate || item.createdAt,
                payload: {
                    todoId: item.id,
                    listId: item.listId,
                    listKind: list?.kind || null
                }
            };
        })
        .sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return String(a.sortAt || '').localeCompare(String(b.sortAt || ''));
        });
}

function notifyAfterTodoChange() {
    if (typeof evaluateAllNotifications === 'function') {
        evaluateAllNotifications();
    } else if (typeof updateNotificationsBadge === 'function') {
        updateNotificationsBadge();
    }
    if (typeof refreshActionBoard === 'function') refreshActionBoard();
    updateNotificationsTasksFooter();
}

function openTodoInTasksView(todoId, options = {}) {
    const item = getTodoItemById(todoId);
    if (!item) return false;
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
    const list = getTodoListById(item.listId);
    if (options.payFlow === true && list?.kind === TODO_LIST_KINDS.payments
        && typeof openDashboardTodoPayment === 'function') {
        openDashboardTodoPayment(todoId);
        return true;
    }
    if (typeof openTasksView === 'function') openTasksView(item.listId);
    window.setTimeout(() => {
        if (typeof renderTasksView === 'function') renderTasksView();
        const row = document.querySelector(`[data-todo-id="${todoId}"]`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            row.classList.add('tasks-row--highlight');
            window.setTimeout(() => row.classList.remove('tasks-row--highlight'), 2200);
        }
        if (options.openEditor === true) openTodoItemEditor(todoId);
    }, options.openEditor === true ? 80 : 120);
    return true;
}

function openUserTodoFromActionBoard(todoId) {
    openTodoInTasksView(todoId, { payFlow: true, openEditor: false });
}

function openSkrybaTodoItem(todoId) {
    if (!getTodoItemById(todoId)) return;
    if (typeof closeSkrybaPanel === 'function') closeSkrybaPanel();
    openTodoInTasksView(todoId, { openEditor: true });
}

function formatTaskDueLabel(dueDate) {
    if (!dueDate || typeof daysUntilDate !== 'function') return '';
    const days = daysUntilDate(dueDate);
    if (days === null) return '';
    if (typeof formatDueLabel === 'function') return formatDueLabel(days);
    if (days === 0) return 'dziś';
    if (days === 1) return 'jutro';
    if (days < 0) return `${Math.abs(days)} dni temu`;
    return `za ${days} dni`;
}

function renderDashboardTasksPanel() {
    const section = document.getElementById('dashboard-tasks');
    const list = document.getElementById('dashboard-tasks-list');
    const summaryEl = document.getElementById('dashboard-tasks-summary');
    const seeAllBtn = document.getElementById('dashboard-tasks-see-all');
    const moreBtnExisting = document.getElementById('dashboard-tasks-show-more');
    if (!section || !list) return;

    const allItems = getDashboardTodoItems();
    const openCount = allItems.length;
    if (!openCount) {
        section.classList.add('hidden');
        if (moreBtnExisting) moreBtnExisting.classList.add('hidden');
        if (seeAllBtn) seeAllBtn.classList.add('hidden');
        return;
    }

    if (seeAllBtn) {
        seeAllBtn.classList.toggle('hidden', openCount <= DASHBOARD_TASKS_PAGE_SIZE);
    }

    const signature = `${openCount}|${allItems[0]?.id ?? ''}|${allItems[allItems.length - 1]?.id ?? ''}`;
    if (signature !== dashboardTasksListSignature) {
        dashboardTasksListSignature = signature;
        dashboardTasksVisibleCount = DASHBOARD_TASKS_PAGE_SIZE;
    }

    const items = allItems.slice(0, dashboardTasksVisibleCount);

    section.classList.remove('hidden');
    const urgentCount = getUrgentTodosCount();
    if (summaryEl) {
        if (urgentCount > 0) {
            summaryEl.classList.remove('hidden');
            summaryEl.innerHTML = `<div class="dashboard-installments-summary-grid">
                <span class="label">Z terminem dziś lub wcześniej</span>
                <strong class="expense">${urgentCount}</strong>
            </div>`;
        } else {
            summaryEl.classList.add('hidden');
            summaryEl.innerHTML = '';
        }
    }

    if (!items.length) {
        list.innerHTML = '<p class="upcoming-loans-empty">Brak otwartych zadań.</p>';
        return;
    }

    list.innerHTML = items.map((item) => {
        const listMeta = getTodoListById(item.listId);
        const due = item.dueDate || '';
        const days = due && typeof daysUntilDate === 'function' ? daysUntilDate(due) : null;
        const overdue = days !== null && days < 0;
        const dueLabel = formatTaskDueLabel(due);
        const metaParts = [];
        if (listMeta) metaParts.push(listMeta.name);
        if (Number.isFinite(item.amount) && typeof formatPlnAmount === 'function') {
            metaParts.push(formatPlnAmount(item.amount));
        }
        if (due && typeof formatTxDate === 'function') metaParts.push(formatTxDate(due));
        if (dueLabel) metaParts.push(dueLabel);
        const meta = metaParts.join(' · ');
        const isPayment = listMeta?.kind === TODO_LIST_KINDS.payments;
        const actionBtn = isPayment
            ? `<button type="button" class="dashboard-quick-action-btn" onclick="event.stopPropagation(); openDashboardTodoPayment('${escapeHtml(item.id)}')">Spłać</button>`
            : `<button type="button" class="dashboard-quick-action-btn" onclick="toggleTodoItem('${escapeHtml(item.id)}')" aria-label="Odhacz">✓</button>`;
        return `<div class="dashboard-action-row${overdue ? ' dashboard-action-row--overdue' : ''}">
            <button type="button" class="dashboard-action-info dashboard-action-info--btn" onclick="openDashboardTodoItem('${escapeHtml(item.id)}')">
                <strong class="dashboard-action-name">${escapeHtml(item.title)}</strong>
                ${meta ? `<span class="dashboard-action-meta">${escapeHtml(meta)}</span>` : ''}
            </button>
            ${actionBtn}
        </div>`;
    }).join('');

    const moreBtn = typeof getOrCreateShowMoreButton === 'function'
        ? getOrCreateShowMoreButton('dashboard-tasks-show-more', showMoreDashboardTasks)
        : moreBtnExisting;
    if (typeof updateShowMoreButton === 'function' && moreBtn) {
        updateShowMoreButton(moreBtn, allItems.length, items.length, section, list);
    }
}

function openDashboardTodoItem(todoId) {
    openTodoInTasksView(todoId, { openEditor: true });
}

function openDashboardTodoPayment(todoId) {
    const item = getTodoItemById(todoId);
    if (!item) return;
    const list = getTodoListById(item.listId);
    if (list?.kind !== TODO_LIST_KINDS.payments) return;

    const navItems = document.querySelectorAll('.nav-item');
    if (typeof switchView === 'function') {
        switchView('add', 'Dodaj', navItems[1] || null);
    }

    const amountInput = document.getElementById('tx-amount');
    const noteInput = document.getElementById('tx-note');
    const dateInput = document.getElementById('tx-date');
    if (amountInput && Number.isFinite(item.amount) && item.amount > 0) {
        amountInput.value = String(item.amount);
    }
    if (noteInput) noteInput.value = item.title || '';
    if (dateInput) {
        dateInput.value = item.dueDate || localIsoDate(new Date());
    }
    if (typeof setFormMode === 'function') setFormMode('expense');
    if (typeof updateAddDateChipLabel === 'function') updateAddDateChipLabel();
    if (typeof focusAmountField === 'function') focusAmountField();
}

function dismissNotificationsForTodo(todoId) {
    if (typeof getNotificationInbox !== 'function' || typeof dismissNotification !== 'function') return;
    getNotificationInbox()
        .filter((entry) => entry.payload?.todoId === todoId)
        .forEach((entry) => dismissNotification(entry.id));
}

function evaluateTaskDueReminders() {
    if (typeof upsertNotification !== 'function') return [];
    ensureTodoListsInitialized();
    const today = localIsoDate(new Date());
    const tomorrow = typeof getTomorrowIsoDate === 'function' ? getTomorrowIsoDate() : '';
    const created = [];

    appState.todos.forEach((item) => {
        if (item.done || !item.dueDate) return;
        const days = typeof daysUntilDate === 'function' ? daysUntilDate(item.dueDate) : null;
        if (days === null) return;

        let type;
        let titlePrefix;
        if (days < 0) {
            type = 'task_overdue';
            titlePrefix = 'Zaległe zadanie';
        } else if (days === 0) {
            type = 'task_due_today';
            titlePrefix = 'Dziś termin';
        } else if (days === 1) {
            type = 'task_due_tomorrow';
            titlePrefix = 'Jutro termin';
        } else if (days <= 7) {
            type = 'task_due_soon';
            titlePrefix = 'Zbliża się termin';
        } else {
            return;
        }

        const list = getTodoListById(item.listId);
        const bodyParts = [list?.name || 'Zadania', formatTxDate(item.dueDate)];
        if (Number.isFinite(item.amount)) bodyParts.splice(1, 0, formatPlnAmount(item.amount));
        const digestKey = type === 'task_overdue' ? today : item.dueDate;
        const result = upsertNotification({
            id: `task-due|${item.id}|${digestKey}|${type}`,
            type,
            title: `${titlePrefix}: ${item.title}`,
            body: bodyParts.join(' · '),
            payload: { todoId: item.id, listId: item.listId, dueDate: item.dueDate }
        });
        if (result?.isNew) created.push(result.item);
    });

    return created;
}

function getTodoItemById(id) {
    ensureTodoListsInitialized();
    return appState.todos.find((item) => item.id === id) || null;
}

function findOpenTodosByTitleQuery(query, listKind = null) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    ensureTodoListsInitialized();
    return appState.todos.filter((item) => {
        if (item.done) return false;
        if (listKind) {
            const list = getTodoListById(item.listId);
            if (!list || list.kind !== listKind) return false;
        }
        return item.title.toLowerCase().includes(q);
    });
}

function addTodoItem({ title, listId, dueDate, amount, note, source = 'user' }) {
    const trimmed = String(title || '').trim();
    if (!trimmed) return null;
    ensureTodoListsInitialized();
    const targetList = getTodoListById(listId) || getTodoListById(getQuickAddTargetListId());
    if (!targetList) return null;

    const now = new Date().toISOString();
    const item = normalizeTodoItem({
        id: createTodoId('todo'),
        listId: targetList.id,
        title: trimmed,
        done: false,
        sortOrder: appState.todos.filter((t) => t.listId === targetList.id && !t.done).length,
        createdAt: now,
        updatedAt: now,
        source,
        dueDate,
        amount,
        note
    });
    if (!item) return null;
    appState.todos.push(item);
    if (typeof saveState === 'function') saveState({ silentLimits: true });
    refreshTasksUi();
    return item;
}

function toggleTodoItem(id) {
    const item = getTodoItemById(id);
    if (!item) return false;
    const now = new Date().toISOString();
    item.done = !item.done;
    item.updatedAt = now;
    item.completedAt = item.done ? now : null;
    if (item.done) dismissNotificationsForTodo(id);
    if (typeof saveState === 'function') saveState({ silentLimits: true });
    refreshTasksUi();
    return true;
}

function deleteTodoItem(id) {
    dismissNotificationsForTodo(id);
    const before = appState.todos.length;
    appState.todos = appState.todos.filter((item) => item.id !== id);
    if (appState.todos.length === before) return false;
    if (typeof saveState === 'function') saveState({ silentLimits: true });
    refreshTasksUi();
    return true;
}

function updateTodoItem(id, patch = {}) {
    const index = appState.todos.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const current = appState.todos[index];
    const next = { ...current };
    if (patch.title !== undefined) {
        const title = String(patch.title || '').trim();
        if (!title) return null;
        next.title = title;
    }
    if (patch.listId !== undefined) {
        const list = getTodoListById(patch.listId);
        if (!list) return null;
        next.listId = list.id;
    }
    if (patch.dueDate !== undefined) {
        const dueDate = String(patch.dueDate || '').trim();
        if (dueDate) next.dueDate = dueDate;
        else delete next.dueDate;
    }
    if (patch.amount !== undefined) {
        const raw = patch.amount;
        if (raw === '' || raw === null || raw === undefined) {
            delete next.amount;
        } else {
            const amount = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
            if (Number.isFinite(amount) && amount > 0) next.amount = amount;
            else delete next.amount;
        }
    }
    if (patch.note !== undefined) {
        const note = String(patch.note || '').trim();
        if (note) next.note = note.slice(0, 500);
        else delete next.note;
    }
    next.updatedAt = new Date().toISOString();
    const normalized = normalizeTodoItem(next);
    if (!normalized) return null;
    appState.todos[index] = normalized;
    if (typeof saveState === 'function') saveState({ silentLimits: true });
    refreshTasksUi();
    return normalized;
}

function renameTodoList(listId, name) {
    ensureTodoListsInitialized();
    const list = appState.todoLists.find((entry) => entry.id === listId && !entry.archived);
    if (!list) return false;
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    list.name = trimmed;
    if (typeof saveState === 'function') saveState({ silentLimits: true });
    refreshTasksUi();
    return true;
}

function archiveTodoList(listId) {
    ensureTodoListsInitialized();
    const list = appState.todoLists.find((entry) => entry.id === listId && !entry.archived);
    if (!list) return false;
    list.archived = true;
    appState.todos = appState.todos.filter((item) => item.listId !== listId);
    if (tasksActiveFilter === listId) tasksActiveFilter = 'all';
    tasksListEditorOpen = false;
    if (typeof saveState === 'function') saveState({ silentLimits: true });
    renderTasksView();
    return true;
}

function createTodoList(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    ensureTodoListsInitialized();
    const list = normalizeTodoList({
        id: createTodoId('todo-list'),
        name: trimmed,
        kind: 'custom',
        sortOrder: appState.todoLists.length,
        builtIn: false,
        archived: false
    });
    if (!list) return null;
    appState.todoLists.push(list);
    if (typeof saveState === 'function') saveState({ silentLimits: true });
    tasksActiveFilter = list.id;
    tasksNewListFormOpen = false;
    renderTasksView();
    return list;
}

function setTasksListFilter(filter) {
    tasksActiveFilter = filter === 'all' ? 'all' : String(filter || 'all');
    if (tasksActiveFilter !== 'all' && !getTodoListById(tasksActiveFilter)) {
        tasksActiveFilter = 'all';
    }
    tasksListEditorOpen = false;
    renderTasksView();
}

function toggleTasksShowDone() {
    tasksShowDone = !tasksShowDone;
    renderTasksView();
}

function formatTodoItemMeta(item) {
    const parts = [];
    const list = getTodoListById(item.listId);
    if (tasksActiveFilter === 'all' && list) parts.push(list.name);
    if (item.dueDate && typeof formatTxDate === 'function') parts.push(formatTxDate(item.dueDate));
    if (Number.isFinite(item.amount) && typeof formatPlnAmount === 'function') {
        parts.push(formatPlnAmount(item.amount));
    }
    return parts.join(' · ');
}

function buildTasksSubnavHtml() {
    const lists = getVisibleTodoLists();
    const buttons = [
        `<button type="button" class="analysis-subnav-btn${tasksActiveFilter === 'all' ? ' active' : ''}" onclick="setTasksListFilter('all')">Wszystko</button>`
    ];
    lists.forEach((list) => {
        const active = tasksActiveFilter === list.id ? ' active' : '';
        buttons.push(`<button type="button" class="analysis-subnav-btn${active}" onclick="setTasksListFilter('${escapeHtml(list.id)}')">${escapeHtml(list.name)}</button>`);
    });
    buttons.push(`<button type="button" class="analysis-subnav-btn analysis-subnav-btn--add" onclick="toggleTasksNewListForm()" title="Nowa lista">+</button>`);
    return buttons.join('');
}

function buildTasksItemRowHtml(item) {
    const meta = formatTodoItemMeta(item);
    const checked = item.done ? ' checked' : '';
    const doneClass = item.done ? ' tasks-row--done' : '';
    return `<article class="tasks-row${doneClass}" data-todo-id="${escapeHtml(item.id)}">
        <label class="tasks-row-check">
            <input type="checkbox"${checked} onchange="toggleTodoItem('${escapeHtml(item.id)}')" aria-label="Odhacz">
            <span class="tasks-row-check-ui" aria-hidden="true"></span>
        </label>
        <button type="button" class="tasks-row-body" onclick="openTodoItemEditor('${escapeHtml(item.id)}')" aria-label="Edytuj zadanie">
            <strong class="tasks-row-title">${escapeHtml(item.title)}</strong>
            ${meta ? `<span class="tasks-row-meta">${escapeHtml(meta)}</span>` : ''}
        </button>
        <button type="button" class="tasks-row-edit" title="Edytuj" aria-label="Edytuj" onclick="openTodoItemEditor('${escapeHtml(item.id)}')">✎</button>
        <button type="button" class="tasks-row-delete" title="Usuń" aria-label="Usuń" onclick="deleteTodoItem('${escapeHtml(item.id)}')">×</button>
    </article>`;
}

function renderTasksListActions() {
    const wrap = document.getElementById('tasks-list-actions');
    const panel = document.getElementById('tasks-list-edit-panel');
    const nameInput = document.getElementById('tasks-list-edit-name');
    const listId = resolveTasksActiveListId();
    const list = listId ? getTodoListById(listId) : null;
    if (!wrap) return;
    wrap.classList.toggle('hidden', !list);
    if (!list) {
        tasksListEditorOpen = false;
        panel?.classList.add('hidden');
        return;
    }
    if (nameInput && tasksListEditorOpen) nameInput.value = list.name;
    panel?.classList.toggle('hidden', !tasksListEditorOpen);
    const toggleBtn = document.getElementById('tasks-list-edit-toggle');
    if (toggleBtn) {
        toggleBtn.textContent = tasksListEditorOpen ? 'Zamknij edycję listy' : 'Edytuj nazwę listy';
    }
}

function renderTasksView() {
    const subnav = document.getElementById('tasks-subnav');
    const list = document.getElementById('tasks-items-list');
    const input = document.getElementById('tasks-quick-add-input');
    const newListWrap = document.getElementById('tasks-new-list-form');
    const newListPanel = document.getElementById('tasks-new-list-panel');
    const showDoneBtn = document.getElementById('tasks-toggle-done-btn');
    if (!subnav || !list) return;

    ensureTodoListsInitialized();
    if (tasksActiveFilter !== 'all' && !getTodoListById(tasksActiveFilter)) {
        tasksActiveFilter = 'all';
    }
    subnav.innerHTML = buildTasksSubnavHtml();
    renderTasksListActions();

    const items = getFilteredTodos();
    if (!items.length) {
        const listName = resolveTasksActiveListId()
            ? getTodoListById(resolveTasksActiveListId())?.name
            : 'wszystkich list';
        list.innerHTML = `<p class="tasks-empty">Brak zadań${listName ? ` na ${escapeHtml(listName)}` : ''}.</p>`;
    } else {
        list.innerHTML = items.map(buildTasksItemRowHtml).join('');
    }

    if (input) {
        input.placeholder = getQuickAddPlaceholder();
    }
    if (newListWrap) newListWrap.classList.toggle('hidden', !tasksNewListFormOpen);
    if (newListPanel) newListPanel.classList.toggle('hidden', !tasksNewListFormOpen);
    if (showDoneBtn) {
        showDoneBtn.textContent = tasksShowDone ? 'Ukryj zrobione' : 'Pokaż zrobione';
        showDoneBtn.setAttribute('aria-pressed', tasksShowDone ? 'true' : 'false');
    }
    updateTasksBadge();
}

function refreshTasksUi() {
    const view = document.getElementById('view-tasks');
    if (view?.classList.contains('active')) renderTasksView();
    else updateTasksBadge();
    const dash = document.getElementById('view-dashboard');
    if (dash?.classList.contains('active')) renderDashboardTasksPanel();
    notifyAfterTodoChange();
}

function updateTasksBadge() {
    const badge = document.getElementById('tasks-badge');
    if (!badge) return;
    const count = getTasksBadgeCount();
    const urgent = getUrgentTodosCount();
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('hidden', count === 0);
    badge.classList.toggle('tasks-badge--urgent', urgent > 0);
    const btn = document.getElementById('btn-tasks');
    if (btn) btn.classList.toggle('btn-icon--has-badge', count > 0);
}

function openTasksView(listFilter = null) {
    if (typeof guardAppLockSensitiveAction === 'function' && !guardAppLockSensitiveAction()) return;
    ensureTodoListsInitialized();
    if (listFilter && getTodoListById(listFilter)) {
        tasksActiveFilter = listFilter;
    } else if (tasksActiveFilter !== 'all' && !getTodoListById(tasksActiveFilter)) {
        tasksActiveFilter = 'all';
    }
    if (typeof switchView === 'function') switchView('tasks', 'Zadania', null);
}

function handleTasksQuickAdd(event) {
    event?.preventDefault?.();
    const input = document.getElementById('tasks-quick-add-input');
    if (!input) return;
    const title = input.value.trim();
    if (!title) return;
    addTodoItem({ title, listId: getQuickAddTargetListId(), source: 'user' });
    input.value = '';
    input.focus();
}

function toggleTasksNewListForm() {
    tasksNewListFormOpen = !tasksNewListFormOpen;
    renderTasksView();
    if (tasksNewListFormOpen) {
        window.setTimeout(() => document.getElementById('tasks-new-list-input')?.focus(), 50);
    }
}

function handleTasksNewListSubmit(event) {
    event?.preventDefault?.();
    const input = document.getElementById('tasks-new-list-input');
    if (!input) return;
    const list = createTodoList(input.value);
    if (list) input.value = '';
}

function openTodoItemEditor(id) {
    const item = getTodoItemById(id);
    if (!item) return;
    tasksEditingItemId = id;
    const overlay = document.getElementById('tasks-item-edit-overlay');
    const titleInput = document.getElementById('tasks-edit-title');
    const dueInput = document.getElementById('tasks-edit-due');
    const amountInput = document.getElementById('tasks-edit-amount');
    const noteInput = document.getElementById('tasks-edit-note');
    const dueWrap = document.getElementById('tasks-edit-due-wrap');
    const amountWrap = document.getElementById('tasks-edit-amount-wrap');
    const list = getTodoListById(item.listId);
    const kind = list?.kind || 'custom';
    if (titleInput) titleInput.value = item.title;
    if (dueInput) dueInput.value = item.dueDate || '';
    if (amountInput) amountInput.value = Number.isFinite(item.amount) ? String(item.amount) : '';
    if (noteInput) noteInput.value = item.note || '';
    dueWrap?.classList.toggle('hidden', kind === 'shopping');
    amountWrap?.classList.toggle('hidden', kind !== 'payments');
    overlay?.classList.remove('hidden');
    window.setTimeout(() => titleInput?.focus(), 50);
}

function closeTodoItemEditor() {
    tasksEditingItemId = null;
    document.getElementById('tasks-item-edit-overlay')?.classList.add('hidden');
}

function saveTodoItemEditor(event) {
    event?.preventDefault?.();
    if (!tasksEditingItemId) return;
    const updated = updateTodoItem(tasksEditingItemId, {
        title: document.getElementById('tasks-edit-title')?.value,
        dueDate: document.getElementById('tasks-edit-due')?.value,
        amount: document.getElementById('tasks-edit-amount')?.value,
        note: document.getElementById('tasks-edit-note')?.value
    });
    if (updated) closeTodoItemEditor();
}

function toggleTodoListEditor() {
    if (!resolveTasksActiveListId()) return;
    tasksListEditorOpen = !tasksListEditorOpen;
    renderTasksListActions();
    if (tasksListEditorOpen) {
        window.setTimeout(() => document.getElementById('tasks-list-edit-name')?.focus(), 50);
    }
}

function cancelTodoListEditor() {
    tasksListEditorOpen = false;
    renderTasksListActions();
}

function saveTodoListEditor(event) {
    event?.preventDefault?.();
    const listId = resolveTasksActiveListId();
    if (!listId) return;
    if (renameTodoList(listId, document.getElementById('tasks-list-edit-name')?.value)) {
        tasksListEditorOpen = false;
        renderTasksView();
    }
}

function deleteActiveTodoList() {
    const listId = resolveTasksActiveListId();
    if (!listId) return;
    const list = getTodoListById(listId);
    if (!list) return;
    const ok = typeof confirm === 'function'
        ? confirm(`Usunąć listę „${list.name}” wraz z zadaniami?`)
        : true;
    if (!ok) return;
    archiveTodoList(listId);
}

function initTasks() {
    ensureTodoListsInitialized();
    updateTasksBadge();
}

function parseSkrybaTodoListKind(text) {
    const t = String(text || '').toLowerCase();
    if (/list[aę]\s+zakup|na\s+zakup|do\s+kupienia|zakup\w*|co\s+kupi[cć]/.test(t)) return 'shopping';
    if (/do\s+zapłat|do\s+zaplat|rachunk|płatnoś|platnos|faktur/.test(t)) return 'payments';
    if (/finans|subskrypc|odsetk|konta\s+oszczędno/.test(t)) return 'finance';
    return null;
}

function parseSkrybaTodoDueDateFromText(text, referenceDate = new Date()) {
    const t = String(text || '').toLowerCase();
    if (/\b(?:na\s+)?dzi[sś]\b/.test(t)) return localIsoDate(referenceDate);
    if (/\b(?:na\s+)?jutro\b/.test(t)) {
        const d = new Date(referenceDate);
        d.setDate(d.getDate() + 1);
        return localIsoDate(d);
    }
    const weekdayMap = [
        ['niedziel', 0], ['poniedzia', 1], ['wtork', 2], ['środ', 3], ['srod', 3],
        ['czwart', 4], ['piąt', 5], ['piat', 5], ['sobot', 6]
    ];
    for (const [prefix, targetDay] of weekdayMap) {
        if (new RegExp(`(?:w\\s+|na\\s+)?${prefix}`).test(t)) {
            const d = new Date(referenceDate);
            const diff = ((targetDay - d.getDay()) + 7) % 7 || 7;
            d.setDate(d.getDate() + diff);
            return localIsoDate(d);
        }
    }
    const plDayMonth = t.match(
        /(?:na\s+)?(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|wrze[sś]nia|pa[zź]dziernika|listopada|grudnia)(?:\s+((?:19|20)\d{2}))?/
    );
    if (plDayMonth && typeof parseSkrybaMonthToken === 'function') {
        const day = parseInt(plDayMonth[1], 10);
        const monthIndex = parseSkrybaMonthToken(plDayMonth[2]);
        if (monthIndex !== undefined && day >= 1 && day <= 31) {
            let year = plDayMonth[3] ? parseInt(plDayMonth[3], 10) : referenceDate.getFullYear();
            const candidate = new Date(year, monthIndex, day);
            if (!plDayMonth[3]) {
                const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
                if (candidate < today) year += 1;
            }
            return localIsoDate(new Date(year, monthIndex, day));
        }
    }
    const isoMatch = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoMatch) return isoMatch[1];
    const plMatch = t.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
    if (plMatch) {
        const day = parseInt(plMatch[1], 10);
        const month = parseInt(plMatch[2], 10);
        let year = plMatch[3] ? parseInt(plMatch[3], 10) : referenceDate.getFullYear();
        if (year < 100) year += 2000;
        return localIsoDate(new Date(year, month - 1, day));
    }
    return null;
}

function parseSkrybaTodoAmountFromText(text) {
    const match = String(text || '').match(/(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)(?=\s|,|$|\.)/i);
    if (!match) return null;
    const amount = parseFloat(match[1].replace(',', '.'));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isSkrybaReminderIntent(text) {
    const lower = String(text || '').trim().toLowerCase();
    if (!lower) return false;
    return /(?:ustaw|zaplanuj|zapisz|dodaj)\s+(?:mi\s+)?przypomnien/i.test(lower)
        || /^przypomnij\b/.test(lower);
}

function tryParseSkrybaTodoAdd(text) {
    const t = String(text || '').trim();
    const lower = t.toLowerCase();
    const isListAdd = /(?:^|\s)(?:dodaj|dopisz|wrzu[cć]|wpisz|przypomnij)\s+/i.test(t);
    const isReminder = isSkrybaReminderIntent(t);
    if (!isListAdd && !isReminder) return null;

    const kind = parseSkrybaTodoListKind(t);
    const mentionsList = !!kind || /na\s+list|do\s+list|zadani|do\s+zrobienia|przypomnien/i.test(lower);
    if (!mentionsList && !/przypomnij|przypomnien/i.test(lower)) return null;

    const dueDate = parseSkrybaTodoDueDateFromText(t);
    const amount = parseSkrybaTodoAmountFromText(t);

    let titlePart = t
        .replace(/^(?:ustaw|zaplanuj|zapisz|dodaj|dopisz|wrzu[cć]|wpisz|przypomnij)\s+(?:mi\s+)?/i, '')
        .replace(/^przypomnienie\s+/i, '')
        .replace(/\s+(?:do|na)\s+(?:listy\s+)?(?:zakup\w*|list[aę]\s+zakup\w*|zapłat\w*|zaplat\w*|finans\w*|zada[nń]|rachunk\w*)\s*$/i, '')
        .replace(/\s+na\s+zakupy\s*$/i, '')
        .replace(/\s+na\s+\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)(?:\s+(?:19|20)\d{2})?\b/i, '')
        .replace(/\s+(?:na|w)\s+(?:dzi[sś]|jutro|poniedziałek|poniedzialek|wtorek|środę|srode|czwartek|piątek|piatek|sobotę|sobote|niedzielę|niedziele)\b/i, '')
        .replace(/\s*,\s*\d+(?:[.,]\d{1,2})?\s*(?:zł|zl|pln)\b.*$/i, '')
        .replace(/^\s*o\s+/i, '')
        .replace(/^\s*na\s+/i, '')
        .trim();

    if (/^\d+(?:[.,]\d+)?\s*(?:zł|zl|pln)\b/i.test(titlePart)) return null;
    if (dueDate && /^\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)(?:\s+(?:19|20)\d{2})?$/i.test(titlePart)) {
        titlePart = isReminder ? 'Przypomnienie' : '';
    }
    if (titlePart.length < 2 && isReminder) titlePart = 'Przypomnienie';
    if (titlePart.length < 2) return null;

    const titles = titlePart.split(/\s+i\s+/).map((part) => part.trim()).filter((part) => part.length >= 2);
    if (!titles.length) return null;

    return { kind: kind || (dueDate || amount ? 'payments' : 'shopping'), titles, dueDate, amount };
}

function tryParseSkrybaTodoShow(text) {
    const t = String(text || '').toLowerCase();
    if (!/(?:poka[zż]|co\s+mam|lista|wyświetl|wyswietl|wypisz)/.test(t)) return null;
    const kind = parseSkrybaTodoListKind(text);
    const weekScope = /tydzie[nń]|tygodni|7\s*dni|najbliższ|najblizsz/.test(t);
    if (weekScope && (kind === 'payments' || /płatno|platno|rachunk/.test(t))) {
        return { kind: 'payments', scope: 'week' };
    }
    if (!kind && !/zadani|do\s+zrobienia|kupi[cć]|kupic/.test(t)) return null;
    return { kind: kind || 'shopping', scope: null };
}

function tryParseSkrybaTodoComplete(text) {
    const t = String(text || '').trim();
    const lower = t.toLowerCase();
    if (!/odhacz|zrobione|gotowe|zapłaciłem|zaplacilem|już\s+kupiłem|juz\s+kupilem|kupiłem|kupilem/.test(lower)) return null;

    let query = t
        .replace(/^(?:odhacz|zaznacz(?:\s+jako)?\s+zrobione|już\s+kupiłem|juz\s+kupilem|kupiłem|kupilem|zapłaciłem|zaplacilem|gotowe)\s*/i, '')
        .replace(/\s+(?:na|z)\s+listy?\s+\w+\s*$/i, '')
        .trim();
    if (query.length < 2) return null;
    return {
        query,
        kind: parseSkrybaTodoListKind(t)
    };
}

function buildSkrybaTodoListHtml(items, options = {}) {
    if (!items.length) return '';
    const clickable = options.clickable !== false;
    return `<div class="skryba-todo-list">${items.map((item) => {
        const meta = formatTodoItemMeta(item);
        const inner = `<span class="skryba-todo-title">${escapeHtml(item.title)}</span>${meta ? `<span class="skryba-todo-meta">${escapeHtml(meta)}</span>` : ''}`;
        if (!clickable) {
            return `<div class="skryba-todo-row">${inner}</div>`;
        }
        return `<button type="button" class="skryba-todo-row skryba-todo-row--btn" onclick="openSkrybaTodoItem('${escapeHtml(item.id)}')">${inner}</button>`;
    }).join('')}</div>`;
}

function tryAnswerSkrybaTodoQuery(text) {
    const add = tryParseSkrybaTodoAdd(text);
    if (add) {
        const list = typeof ensureTodoListForKind === 'function'
            ? ensureTodoListForKind(add.kind)
            : getTodoListByKind(add.kind);
        if (!list) return null;
        const created = add.titles
            .map((title) => addTodoItem({
                title,
                listId: list.id,
                dueDate: add.dueDate || undefined,
                amount: add.amount || undefined,
                source: 'skryba'
            }))
            .filter(Boolean);
        if (!created.length) return null;
        const labels = created.map((item) => item.title).join(', ');
        const dateHint = add.dueDate && typeof formatTxDate === 'function'
            ? ` — termin ${formatTxDate(add.dueDate)}`
            : (add.dueDate ? ` — termin ${add.dueDate}` : '');
        return {
            intro: `Dodałem na listę „${list.name}”: ${labels}${dateHint}.`,
            items: getFilteredTodos({ listId: list.id, includeDone: false })
        };
    }

    const show = tryParseSkrybaTodoShow(text);
    if (show) {
        if (show.scope === 'week') {
            const list = getTodoListByKind('payments');
            if (!list) return null;
            const items = getTodoItemsDueWithinDays(7, 'payments');
            return {
                intro: items.length
                    ? `Płatności w najbliższych 7 dniach (${items.length}):`
                    : 'Brak płatności z terminem w najbliższym tygodniu.',
                items
            };
        }
        const list = getTodoListByKind(show.kind);
        if (!list) return null;
        const items = getFilteredTodos({ listId: list.id, includeDone: false });
        return {
            intro: items.length
                ? `Otwarte pozycje na liście „${list.name}” (${items.length}):`
                : `Lista „${list.name}” jest pusta.`,
            items
        };
    }

    const complete = tryParseSkrybaTodoComplete(text);
    if (complete) {
        const matches = findOpenTodosByTitleQuery(complete.query, complete.kind);
        if (!matches.length) {
            return { intro: `Nie znalazłem otwartego zadania pasującego do „${complete.query}”.`, items: [] };
        }
        const item = matches[0];
        toggleTodoItem(item.id);
        return {
            intro: `Odhaczyłem: „${item.title}”.`,
            items: []
        };
    }

    return null;
}

function tryParseLocalMorningReview(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    if (/^(?:poranny przegl[aą]d|codzienny przegl[aą]d|co mam dzi[sś] do zrobienia(?: finansowo)?)$/.test(t)
        || /(?:rozpocznij|zr[oó]b|start).*(?:poranny|codzienny)\s+przegl[aą]d/.test(t)) {
        return {
            tool: 'morning_review',
            params: {},
            reply: getSkrybaDailyReviewText()
        };
    }
    return null;
}

function tryHandleLocalSkrybaTodoQuery(text) {
    if (typeof tryAnswerSkrybaTodoQuery !== 'function') return false;
    const answer = tryAnswerSkrybaTodoQuery(text);
    if (!answer) return false;
    const extraHtml = answer.items?.length ? buildSkrybaTodoListHtml(answer.items) : '';
    if (typeof appendSkrybaMessage === 'function') appendSkrybaMessage('assistant', answer.intro, extraHtml);
    if (typeof skrybaChatHistory !== 'undefined') {
        skrybaChatHistory.push({ role: 'assistant', text: answer.intro });
        if (typeof skrybaPersistActiveThread === 'function') skrybaPersistActiveThread();
    }
    if (typeof appendSkrybaFollowUpChips === 'function' && typeof buildSkrybaFollowUpChips === 'function') {
        const chips = buildSkrybaFollowUpChips({ open_tasks: true });
        if (chips?.length) appendSkrybaFollowUpChips(chips);
    }
    if (typeof updateTasksBadge === 'function') updateTasksBadge();
    return true;
}
