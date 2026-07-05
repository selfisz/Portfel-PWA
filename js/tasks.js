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
    return getTodoListById(tasksActiveFilter) ? tasksActiveFilter : 'all';
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
    if (typeof saveState === 'function') saveState({ silentLimits: true });
    refreshTasksUi();
    return true;
}

function deleteTodoItem(id) {
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
}

function updateTasksBadge() {
    const badge = document.getElementById('tasks-badge');
    if (!badge) return;
    const count = getOpenTodosCount();
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('hidden', count === 0);
    const btn = document.getElementById('btn-tasks');
    if (btn) btn.classList.toggle('btn-icon--has-badge', count > 0);
}

function openTasksView(listFilter = null) {
    if (typeof guardAppLockSensitiveAction === 'function' && !guardAppLockSensitiveAction()) return;
    if (listFilter) tasksActiveFilter = listFilter;
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

function tryParseSkrybaTodoAdd(text) {
    const t = String(text || '').trim();
    const lower = t.toLowerCase();
    if (!/(?:^|\s)(?:dodaj|dopisz|wrzu[cć]|wpisz)\s+/i.test(t)) return null;

    const kind = parseSkrybaTodoListKind(t);
    const mentionsList = !!kind || /na\s+list|do\s+list|zadani|do\s+zrobienia/.test(lower);
    if (!mentionsList) return null;

    let titlePart = t
        .replace(/^(?:dodaj|dopisz|wrzu[cć]|wpisz)\s+/i, '')
        .replace(/\s+(?:do|na)\s+(?:listy\s+)?(?:zakup\w*|list[aę]\s+zakup\w*|zapłat\w*|zaplat\w*|finans\w*|zada[nń]|rachunk\w*)\s*$/i, '')
        .replace(/\s+na\s+zakupy\s*$/i, '')
        .trim();

    if (/^\d+(?:[.,]\d+)?\s*(?:zł|zl|pln)?\b/i.test(titlePart)) return null;
    if (titlePart.length < 2) return null;

    const titles = titlePart.split(/\s+i\s+/).map((part) => part.trim()).filter((part) => part.length >= 2);
    if (!titles.length) return null;
    return { kind: kind || 'shopping', titles };
}

function tryParseSkrybaTodoShow(text) {
    const t = String(text || '').toLowerCase();
    if (!/(?:poka[zż]|co\s+mam|lista|wyświetl|wyswietl|wypisz)/.test(t)) return null;
    const kind = parseSkrybaTodoListKind(text);
    if (!kind && !/zadani|do\s+zrobienia|kupi[cć]|kupic/.test(t)) return null;
    return { kind: kind || 'shopping' };
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

function buildSkrybaTodoListHtml(items) {
    if (!items.length) return '';
    return `<div class="skryba-todo-list">${items.map((item) => {
        const meta = formatTodoItemMeta(item);
        return `<div class="skryba-todo-row">
            <span class="skryba-todo-title">${escapeHtml(item.title)}</span>
            ${meta ? `<span class="skryba-todo-meta">${escapeHtml(meta)}</span>` : ''}
        </div>`;
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
            .map((title) => addTodoItem({ title, listId: list.id, source: 'skryba' }))
            .filter(Boolean);
        if (!created.length) return null;
        const labels = created.map((item) => item.title).join(', ');
        return {
            intro: `Dodałem na listę „${list.name}”: ${labels}.`,
            items: getFilteredTodos({ listId: list.id, includeDone: false })
        };
    }

    const show = tryParseSkrybaTodoShow(text);
    if (show) {
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
