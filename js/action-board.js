const ACTION_BOARD_PRIORITY_LABELS = {
    1: 'Krytyczne',
    2: 'Ważne',
    3: 'Do przejrzenia'
};

function readActionBoardDismissed() {
    try {
        const raw = JSON.parse(localStorage.getItem(ACTION_BOARD_DISMISSED_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

function writeActionBoardDismissed(map) {
    localStorage.setItem(ACTION_BOARD_DISMISSED_KEY, JSON.stringify(map || {}));
}

function isActionBoardTaskSnoozed(entry, todayStr = localIsoDate(new Date())) {
    return !!(entry?.snoozedUntil && entry.snoozedUntil > todayStr);
}

function isActionBoardTaskDismissed(taskId, todayStr = localIsoDate(new Date())) {
    const entry = readActionBoardDismissed()[taskId];
    if (!entry) return false;
    if (entry.permanent) return true;
    return isActionBoardTaskSnoozed(entry, todayStr);
}

function snoozeActionBoardTask(taskId) {
    const map = readActionBoardDismissed();
    map[taskId] = {
        snoozedUntil: typeof getTomorrowIsoDate === 'function'
            ? getTomorrowIsoDate()
            : addDaysToIsoDate(localIsoDate(new Date()), 1)
    };
    writeActionBoardDismissed(map);
    refreshActionBoard();
}

function dismissActionBoardTask(taskId, permanent = true) {
    const map = readActionBoardDismissed();
    map[taskId] = { permanent: !!permanent };
    writeActionBoardDismissed(map);
    refreshActionBoard();
}

function clearActionBoardTaskState(taskId) {
    const map = readActionBoardDismissed();
    if (!map[taskId]) return;
    delete map[taskId];
    writeActionBoardDismissed(map);
}

function isUncategorizedTransaction(tx) {
    return typeof isTransactionMissingSubCategory === 'function'
        ? isTransactionMissingSubCategory(tx)
        : (!tx ? false : (tx.subCategory === '[Bez podkategorii]' || tx.mainCategory === 'Różne'));
}

function getUncategorizedPriority(amount) {
    const min = typeof ACTION_BOARD_UNCATEGORIZED_MIN_PLN === 'number'
        ? ACTION_BOARD_UNCATEGORIZED_MIN_PLN
        : 50;
    return (Number(amount) || 0) >= min ? 2 : 3;
}

function buildDuplicatePairKey(indexA, indexB) {
    return [indexA, indexB].sort((a, b) => a - b).join('|');
}

function collectUncategorizedBoardTasks() {
    const monthKey = typeof getCurrentMonthKey === 'function'
        ? getCurrentMonthKey()
        : localIsoDate(new Date()).slice(0, 7);
    return (appState.transactions || [])
        .map((tx, index) => ({ tx, index }))
        .filter(({ tx }) => tx.date?.startsWith(monthKey) && isUncategorizedTransaction(tx))
        .map(({ tx, index }) => {
            const cat = typeof formatTransactionCategoryLabel === 'function'
                ? formatTransactionCategoryLabel(tx)
                : (tx.mainCategory || '—');
            const sign = tx.type === 'expense' ? '−' : '+';
            const note = tx.note ? ` · ${tx.note}` : '';
            return {
                id: `uncategorized|${index}`,
                type: 'uncategorized',
                priority: getUncategorizedPriority(tx.amount),
                title: 'Brak kategorii',
                body: `${formatTxDate(tx.date)} — ${cat} · ${sign}${formatPlnAmount(tx.amount)}${note}`,
                sortAt: tx.date,
                payload: { index }
            };
        });
}

function collectDuplicateBoardTasks() {
    if (typeof findDuplicatePairsInRange !== 'function') return [];
    const end = localIsoDate(new Date());
    const lookback = typeof ACTION_BOARD_DUPLICATE_LOOKBACK_DAYS === 'number'
        ? ACTION_BOARD_DUPLICATE_LOOKBACK_DAYS
        : 60;
    const start = addDaysToIsoDate(end, -lookback);
    return findDuplicatePairsInRange(start, end).map((pair) => {
        const pairKey = buildDuplicatePairKey(pair.a.index, pair.b.index);
        const lineA = typeof formatDuplicateTransactionLine === 'function'
            ? formatDuplicateTransactionLine(pair.a.tx)
            : `${pair.a.tx.date} — ${pair.a.tx.amount} zł`;
        const lineB = typeof formatDuplicateTransactionLine === 'function'
            ? formatDuplicateTransactionLine(pair.b.tx)
            : `${pair.b.tx.date} — ${pair.b.tx.amount} zł`;
        return {
            id: `duplicate|${pairKey}`,
            type: 'duplicate',
            priority: 3,
            title: 'Podejrzany duplikat',
            body: `${lineA} ↔ ${lineB}`,
            sortAt: pair.a.tx.date,
            payload: {
                pairKey,
                indexA: pair.a.index,
                indexB: pair.b.index
            }
        };
    });
}

function collectRecurringConfirmBoardTasks() {
    if (typeof getPendingRecurringConfirmations !== 'function') return [];
    return getPendingRecurringConfirmations().map((item) => {
        const tx = item.transaction;
        const preview = typeof formatAssistantTransactionPreview === 'function'
            ? formatAssistantTransactionPreview(tx)
            : `${tx.amount} zł`;
        const monthLabel = typeof formatRecurringMonthLabel === 'function'
            ? formatRecurringMonthLabel(item.monthKey)
            : item.monthKey;
        return {
            id: `recurring|${item.id}`,
            type: 'recurring_confirm',
            priority: 2,
            title: 'Cykliczna do potwierdzenia',
            body: `${monthLabel} — ${preview}`,
            sortAt: item.monthKey,
            payload: { recurringConfirmId: item.id }
        };
    });
}

function collectActionBoardTasks() {
    const todayStr = localIsoDate(new Date());
    const userTodos = typeof collectUserTodoBoardTasks === 'function'
        ? collectUserTodoBoardTasks()
        : [];
    return [
        ...collectRecurringConfirmBoardTasks(),
        ...collectUncategorizedBoardTasks(),
        ...collectDuplicateBoardTasks(),
        ...userTodos
    ]
        .filter((task) => !isActionBoardTaskDismissed(task.id, todayStr))
        .sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return String(b.sortAt || '').localeCompare(String(a.sortAt || ''));
        });
}

function getVisibleActionBoardTasks() {
    return collectActionBoardTasks();
}

function getActionBoardBadgeCount() {
    return getVisibleActionBoardTasks().filter((task) => task.priority <= 2).length;
}

function getActionBoardTabCount() {
    return getVisibleActionBoardTasks().length;
}

function isActionBoardClearForToday() {
    return getActionBoardBadgeCount() === 0;
}

function groupActionBoardTasks(tasks) {
    const groups = { 1: [], 2: [], 3: [] };
    tasks.forEach((task) => {
        const key = task.priority <= 3 ? task.priority : 3;
        groups[key].push(task);
    });
    return groups;
}

function renderActionBoardTaskActions(task) {
    const id = escapeHtml(task.id);
    if (task.type === 'recurring_confirm') {
        const rid = escapeHtml(task.payload.recurringConfirmId);
        return `<div class="action-board-row-actions">
            <button type="button" class="btn-submit btn-submit--form btn-sm" onclick="actionBoardConfirmRecurring('${rid}')">Dodaj</button>
            <button type="button" class="btn-cancel btn-cancel--form btn-sm" onclick="actionBoardSkipRecurring('${rid}')">Pomiń</button>
        </div>`;
    }
    if (task.type === 'uncategorized') {
        return `<div class="action-board-row-actions">
            <button type="button" class="action-board-action-btn" title="Przypomnij jutro" onclick="snoozeActionBoardTask('${id}')">↻</button>
            <button type="button" class="action-board-action-btn action-board-action-btn--dismiss" title="Odrzuć" onclick="dismissActionBoardTask('${id}')">×</button>
        </div>`;
    }
    if (task.type === 'duplicate') {
        const idxA = task.payload.indexA;
        const idxB = task.payload.indexB;
        return `<div class="action-board-row-actions action-board-row-actions--wrap">
            <button type="button" class="btn-outline btn-sm" onclick="actionBoardDeleteDuplicate(${idxA})">Usuń 1.</button>
            <button type="button" class="btn-outline btn-sm" onclick="actionBoardDeleteDuplicate(${idxB})">Usuń 2.</button>
            <button type="button" class="action-board-action-btn action-board-action-btn--dismiss" title="To nie duplikat" onclick="dismissActionBoardTask('${id}')">×</button>
        </div>`;
    }
    if (task.type === 'user_todo') {
        return `<div class="action-board-row-actions">
            <button type="button" class="action-board-action-btn" title="Przypomnij jutro" onclick="snoozeActionBoardTask('${id}')">↻</button>
            <button type="button" class="action-board-action-btn action-board-action-btn--dismiss" title="Odrzuć" onclick="dismissActionBoardTask('${id}')">×</button>
        </div>`;
    }
    return '';
}

function renderActionBoardSection(priority, tasks) {
    if (!tasks.length) return '';
    const label = ACTION_BOARD_PRIORITY_LABELS[priority] || 'Inne';
    return `<section class="action-board-section" aria-label="${escapeHtml(label)}">
        <h3 class="action-board-section-title action-board-section-title--p${priority}">${escapeHtml(label)} <span class="action-board-section-count">(${tasks.length})</span></h3>
        <div class="action-board-section-list">
            ${tasks.map((task) => {
                const id = escapeHtml(task.id);
                let bodyClass = 'action-board-row-body';
                let bodyAttrs = '';
                if (task.type === 'duplicate') {
                    bodyClass += ' action-board-row-body--clickable';
                    bodyAttrs = ` onclick="actionBoardOpenDuplicate('${id}', ${task.payload.indexA}, ${task.payload.indexB})" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); actionBoardOpenDuplicate('${id}', ${task.payload.indexA}, ${task.payload.indexB}); }" role="button" tabindex="0"`;
                } else if (task.type === 'user_todo') {
                    const todoId = escapeHtml(task.payload.todoId);
                    bodyClass += ' action-board-row-body--clickable';
                    bodyAttrs = ` onclick="actionBoardOpenUserTodo('${todoId}')" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); actionBoardOpenUserTodo('${todoId}'); }" role="button" tabindex="0" aria-label="Otwórz zadanie w liście"`;
                } else if (task.type === 'uncategorized') {
                    const idx = task.payload.index;
                    bodyClass += ' action-board-row-body--clickable';
                    bodyAttrs = ` onclick="actionBoardOpenUncategorized(${idx})" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); actionBoardOpenUncategorized(${idx}); }" role="button" tabindex="0" aria-label="Otwórz szczegóły transakcji"`;
                }
                return `
                <article class="action-board-row action-board-row--p${task.priority}" data-task-id="${id}">
                    <div class="${bodyClass.trim()}"${bodyAttrs}>
                        <strong class="action-board-row-title">${escapeHtml(task.title)}</strong>
                        <span class="action-board-row-text">${escapeHtml(task.body)}</span>
                    </div>
                    ${renderActionBoardTaskActions(task)}
                </article>`;
            }).join('')}
        </div>
    </section>`;
}

function renderActionBoardPanel() {
    const list = document.getElementById('action-board-list');
    const footer = document.getElementById('action-board-footer');
    if (!list) return;

    const tasks = getVisibleActionBoardTasks();
    const groups = groupActionBoardTasks(tasks);
    const urgentCount = tasks.filter((t) => t.priority <= 2).length;
    const reviewOnly = tasks.filter((t) => t.priority >= 3);

    if (!tasks.length) {
        list.innerHTML = '<p class="notifications-empty">Tablica pusta — świetna robota.</p>';
        if (footer) footer.classList.add('hidden');
    } else if (!urgentCount && reviewOnly.length) {
        list.innerHTML = `<p class="action-board-done-hint">Na dziś gotowe. Zostały drobne rzeczy do przejrzenia, gdy masz chwilę.</p>
            ${renderActionBoardSection(3, reviewOnly)}`;
        if (footer) footer.classList.add('hidden');
    } else {
        const html = [1, 2, 3]
            .map((p) => renderActionBoardSection(p, groups[p]))
            .filter(Boolean)
            .join('');
        list.innerHTML = html || '<p class="notifications-empty">Tablica pusta — świetna robota.</p>';
        if (footer) {
            footer.classList.toggle('hidden', urgentCount === 0);
        }
    }

    updateActionBoardTabBadge();
}

function updateActionBoardTabBadge() {
    const badge = document.getElementById('action-board-tab-badge');
    if (!badge) return;
    const count = getActionBoardTabCount();
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('hidden', count === 0);
}

function refreshActionBoard() {
    renderActionBoardPanel();
    if (typeof updateNotificationsBadge === 'function') updateNotificationsBadge();
    const panel = document.getElementById('notifications-overlay');
    if (panel && !panel.classList.contains('hidden')
        && typeof getNotificationsPanelTab === 'function'
        && getNotificationsPanelTab() === 'board') {
        renderActionBoardPanel();
    }
}

function actionBoardConfirmRecurring(id) {
    if (typeof confirmPendingRecurring === 'function') confirmPendingRecurring(id);
    refreshActionBoard();
}

function actionBoardSkipRecurring(id) {
    if (typeof skipPendingRecurring === 'function') skipPendingRecurring(id);
    refreshActionBoard();
}

function actionBoardOpenUncategorized(index) {
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
    if (typeof openTransactionDetails === 'function') openTransactionDetails(index);
}

/** @deprecated użyj actionBoardOpenUncategorized */
function actionBoardEditUncategorized(index) {
    actionBoardOpenUncategorized(index);
}

function actionBoardDeleteDuplicate(index) {
    if (typeof deleteTransactionAtIndex === 'function' && deleteTransactionAtIndex(index)) {
        if (typeof saveState === 'function') saveState();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
        refreshActionBoard();
        if (typeof showAppToast === 'function') showAppToast('Usunięto transakcję');
    }
}

function actionBoardOpenDuplicate(taskId, indexA, indexB) {
    if (typeof openDuplicatePairReview !== 'function') return;
    openDuplicatePairReview(indexA, indexB, { taskId, closeNotifications: true });
}

function actionBoardOpenUserTodo(todoId) {
    if (typeof openTodoInTasksView === 'function') {
        openTodoInTasksView(todoId);
        return;
    }
    if (typeof openUserTodoFromActionBoard === 'function') {
        openUserTodoFromActionBoard(todoId);
    }
}

function buildActionBoardReviewText() {
    const tasks = getVisibleActionBoardTasks();
    const urgent = tasks.filter((t) => t.priority <= 2);
    const review = tasks.filter((t) => t.priority >= 3);

    if (!urgent.length && !review.length) {
        return 'Tablica jest pusta — na dziś nie masz zadań do domknięcia.';
    }
    if (!urgent.length) {
        return `Na dziś nie masz pilnych zadań (P1/P2). Zostało ${review.length} drobn${review.length === 1 ? 'a rzecz' : 'ych rzeczy'} w sekcji „Do przejrzenia” — otwórz Tablicę w dzwonku, gdy będziesz miał chwilę.`;
    }

    const lines = urgent.map((task, i) => {
        const label = ACTION_BOARD_PRIORITY_LABELS[task.priority] || '';
        return `${i + 1}. [${label}] ${task.title}: ${task.body}`;
    });
    let text = `Przegląd tablicy — ${urgent.length} ${urgent.length === 1 ? 'zadanie' : 'zadania'} do domknięcia:\n\n${lines.join('\n')}`;
    if (review.length) {
        text += `\n\nDodatkowo ${review.length} w sekcji „Do przejrzenia” (duplikaty, drobne kategorie).`;
    }
    text += '\n\nUżyj przycisków na Tablicy albo poproś o pomoc z konkretną pozycją.';
    return text;
}

function startSkrybaActionBoardReview() {
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
    if (typeof openSkrybaPanel !== 'function') {
        if (typeof showAppToast === 'function') showAppToast('Włącz Skrybę w Ustawienia → Asystent AI', 'default');
        return;
    }
    openSkrybaPanel();
    const reply = typeof getSkrybaDailyReviewText === 'function'
        ? getSkrybaDailyReviewText()
        : buildActionBoardReviewText();
    if (typeof appendSkrybaMessage === 'function') appendSkrybaMessage('assistant', reply);
    if (typeof skrybaChatHistory !== 'undefined') {
        skrybaChatHistory.push({ role: 'assistant', text: reply });
    }
    if (typeof skrybaPersistActiveThread === 'function') skrybaPersistActiveThread();
}

function tryParseLocalActionBoardReview(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    if (!/^(codzienny przegl[aą]d|przegl[aą]d tablicy|co mam (na )?dzi[sś] do zrobienia|pom[oó][żz] z tablic[aą])$/.test(t)
        && !/(?:rozpocznij|zr[oó]b|start).*(?:przegl[aą]d|tablic)/.test(t)) {
        return null;
    }
    return {
        tool: 'action_board_review',
        params: {},
        reply: typeof getSkrybaDailyReviewText === 'function'
            ? getSkrybaDailyReviewText()
            : buildActionBoardReviewText()
    };
}
