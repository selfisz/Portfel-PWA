/**
 * Centrum — wyłącznie warstwa UI / nawigacji.
 * Dzwonek: powiadomienia + tablica (jak przed prototypem).
 * Centrum: Skryba, zadania, koszyk + ustawienia i blokada w stopce.
 */
let hubPanelTab = 'tasks';

function updateHubBadge() {
    const badge = document.getElementById('hub-badge');
    const tasksTabBadge = document.getElementById('hub-tasks-tab-badge');
    const tasksCount = typeof getTasksBadgeCount === 'function' ? getTasksBadgeCount() : 0;
    const basketCount = typeof getBasketCount === 'function' ? getBasketCount() : 0;
    const total = tasksCount + basketCount;

    if (badge) {
        badge.textContent = total > 9 ? '9+' : String(total);
        badge.classList.toggle('hidden', total === 0);
    }
    const hubBtn = document.getElementById('btn-hub-centrum');
    if (hubBtn) hubBtn.classList.toggle('btn-icon--has-badge', total > 0);

    if (tasksTabBadge) {
        tasksTabBadge.textContent = tasksCount > 9 ? '9+' : String(tasksCount);
        tasksTabBadge.classList.toggle('hidden', tasksCount === 0);
    }
}

function syncHubSkrybaTabVisibility() {
    const tabBtn = document.getElementById('btn-hub-tab-skryba');
    const enabled = typeof isAssistantEnabled === 'function' && isAssistantEnabled();
    if (tabBtn) tabBtn.classList.toggle('hidden', !enabled);
    if (!enabled && hubPanelTab === 'skryba') setHubPanelTab('tasks');
}

function syncHubLockFooterVisibility() {
    const btn = document.getElementById('btn-hub-lock');
    if (!btn) return;
    const enabled = typeof isAppLockEnabled === 'function' && isAppLockEnabled();
    btn.classList.toggle('hidden', !enabled);
}

function renderHubTasksPreview() {
    const host = document.getElementById('hub-tasks-preview');
    if (!host) return;
    const items = typeof getDashboardTodoItems === 'function' ? getDashboardTodoItems(6) : [];
    if (!items.length) {
        host.innerHTML = '<p class="hub-empty-hint">Brak otwartych zadań — dodaj pierwsze w pełnej liście.</p>';
        return;
    }
    host.innerHTML = items.map((item) => {
        const meta = typeof formatTodoItemMeta === 'function' ? formatTodoItemMeta(item) : '';
        return `<button type="button" class="hub-task-preview-row" onclick="hubOpenTodoItem('${escapeHtml(item.id)}')">
            <strong class="hub-task-preview-title">${escapeHtml(item.title)}</strong>
            ${meta ? `<span class="hub-task-preview-meta">${escapeHtml(meta)}</span>` : ''}
        </button>`;
    }).join('');
}

function hubSkrybaSendSuggestion(text) {
    hubOpenSkryba();
    window.setTimeout(() => {
        if (typeof skrybaSendSuggestion === 'function') skrybaSendSuggestion(text);
    }, 120);
}

function renderHubSkrybaLauncher() {
    const host = document.getElementById('hub-skryba-launcher');
    if (!host) return;
    const body = typeof buildSkrybaWelcomeBody === 'function'
        ? buildSkrybaWelcomeBody()
        : 'Skryba pomoże dodać wydatek, sprawdzić budżet lub ustawić przypomnienie.';
    const chips = [
        'Poranny przegląd',
        'Podsumowanie miesiąca',
        'Płatności na tydzień',
        'Co mam na liście zakupów?'
    ];
    const chipsHtml = `<div class="skryba-chip-row">${chips.map((chip) => (
        `<button type="button" class="skryba-chip" data-text="${escapeHtml(chip)}" onclick="hubSkrybaSendSuggestion(this.dataset.text)">${escapeHtml(chip)}</button>`
    )).join('')}</div>`;
    host.innerHTML = `
        <p class="hub-skryba-intro">${escapeHtml(body)}</p>
        ${chipsHtml}
        <button type="button" class="btn-submit btn-submit--form hub-skryba-open-btn" onclick="hubOpenSkryba()">Otwórz Skrybę</button>`;
}

function setHubPanelTab(tab) {
    let next = tab === 'skryba' || tab === 'basket' ? tab : 'tasks';
    if (next === 'skryba' && typeof isAssistantEnabled === 'function' && !isAssistantEnabled()) {
        next = 'tasks';
    }
    hubPanelTab = next;

    const panels = {
        skryba: document.getElementById('hub-tab-skryba'),
        tasks: document.getElementById('hub-tab-tasks'),
        basket: document.getElementById('hub-tab-basket')
    };
    const buttons = {
        skryba: document.getElementById('btn-hub-tab-skryba'),
        tasks: document.getElementById('btn-hub-tab-tasks'),
        basket: document.getElementById('btn-hub-tab-basket')
    };

    Object.keys(panels).forEach((key) => {
        panels[key]?.classList.toggle('hidden', key !== hubPanelTab);
        buttons[key]?.classList.toggle('active', key === hubPanelTab);
    });

    if (hubPanelTab === 'basket' && typeof renderTxBasketPanel === 'function') {
        renderTxBasketPanel();
    } else if (hubPanelTab === 'tasks') {
        renderHubTasksPreview();
    } else if (hubPanelTab === 'skryba') {
        renderHubSkrybaLauncher();
    }
}

function openHubPanel(tab = hubPanelTab) {
    if (typeof guardAppLockSensitiveAction === 'function' && !guardAppLockSensitiveAction()) return;
    const overlay = document.getElementById('hub-overlay');
    if (!overlay) return;
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
    if (typeof closeSettings === 'function') closeSettings();
    overlay.classList.remove('hidden');
    document.body.classList.add('hub-open');
    syncHubSkrybaTabVisibility();
    syncHubLockFooterVisibility();
    setHubPanelTab(tab);
    const btn = document.getElementById('btn-hub-centrum');
    if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeHubPanel() {
    document.getElementById('hub-overlay')?.classList.add('hidden');
    document.body.classList.remove('hub-open');
    const btn = document.getElementById('btn-hub-centrum');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleHubPanel() {
    const overlay = document.getElementById('hub-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('hidden')) openHubPanel();
    else closeHubPanel();
}

function hubOpenSkryba() {
    closeHubPanel();
    if (typeof openSkrybaPanel === 'function') openSkrybaPanel();
}

function hubOpenTasks() {
    closeHubPanel();
    if (typeof openTasksView === 'function') openTasksView();
}

function hubOpenTodoItem(todoId) {
    closeHubPanel();
    if (typeof openTodoInTasksView === 'function') openTodoInTasksView(todoId);
    else if (typeof openTasksView === 'function') openTasksView();
}

function hubOpenSettings() {
    closeHubPanel();
    if (typeof openSettings === 'function') openSettings();
}

function hubLockApp() {
    closeHubPanel();
    if (typeof lockAppNow === 'function') lockAppNow();
}

function patchHubUiIntegrations() {
    if (typeof updateNotificationsBadge === 'function' && !updateNotificationsBadge._hubPatched) {
        const original = updateNotificationsBadge;
        updateNotificationsBadge = function hubPatchedUpdateNotificationsBadge() {
            const badge = document.getElementById('notifications-badge');
            const btn = document.getElementById('btn-notifications');
            const unread = typeof getUnreadNotificationCount === 'function' ? getUnreadNotificationCount() : 0;
            const boardCount = typeof getActionBoardTabCount === 'function'
                ? getActionBoardTabCount()
                : (typeof getActionBoardBadgeCount === 'function' ? getActionBoardBadgeCount() : 0);
            const count = unread + boardCount;
            if (badge) {
                badge.textContent = count > 9 ? '9+' : String(count);
                badge.classList.toggle('hidden', count === 0);
            }
            if (btn) btn.classList.toggle('btn-icon--has-badge', count > 0);
            updateHubBadge();
        };
        updateNotificationsBadge._hubPatched = true;
    }

    if (typeof setNotificationsPanelTab === 'function' && !setNotificationsPanelTab._hubPatched) {
        const original = setNotificationsPanelTab;
        setNotificationsPanelTab = function hubPatchedSetNotificationsPanelTab(tab) {
            if (tab === 'basket') {
                openHubPanel('basket');
                return;
            }
            return original(tab);
        };
        setNotificationsPanelTab._hubPatched = true;
    }

    if (typeof updateTasksBadge === 'function' && !updateTasksBadge._hubPatched) {
        const original = updateTasksBadge;
        updateTasksBadge = function hubPatchedUpdateTasksBadge() {
            original();
            updateHubBadge();
        };
        updateTasksBadge._hubPatched = true;
    }

    if (typeof updateTxBasketBadge === 'function' && !updateTxBasketBadge._hubPatched) {
        const original = updateTxBasketBadge;
        updateTxBasketBadge = function hubPatchedUpdateTxBasketBadge() {
            original();
            updateHubBadge();
        };
        updateTxBasketBadge._hubPatched = true;
    }

    if (typeof refreshActionBoard === 'function' && !refreshActionBoard._hubPatched) {
        const original = refreshActionBoard;
        refreshActionBoard = function hubPatchedRefreshActionBoard() {
            original();
            if (typeof updateNotificationsBadge === 'function') updateNotificationsBadge();
        };
        refreshActionBoard._hubPatched = true;
    }

    if (typeof syncSkrybaHeaderVisibility === 'function' && !syncSkrybaHeaderVisibility._hubPatched) {
        const original = syncSkrybaHeaderVisibility;
        syncSkrybaHeaderVisibility = function hubPatchedSyncSkrybaHeaderVisibility() {
            original();
            syncHubSkrybaTabVisibility();
        };
        syncSkrybaHeaderVisibility._hubPatched = true;
    }

    if (typeof updateAppLockHeaderButton === 'function' && !updateAppLockHeaderButton._hubPatched) {
        const original = updateAppLockHeaderButton;
        updateAppLockHeaderButton = function hubPatchedUpdateAppLockHeaderButton() {
            original();
            syncHubLockFooterVisibility();
        };
        updateAppLockHeaderButton._hubPatched = true;
    }

    if (typeof openTasksFromNotifications === 'function' && !openTasksFromNotifications._hubPatched) {
        const original = openTasksFromNotifications;
        openTasksFromNotifications = function hubPatchedOpenTasksFromNotifications() {
            if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
            openHubPanel('tasks');
        };
        openTasksFromNotifications._hubPatched = true;
    }

    if (typeof openNotificationsPanel === 'function' && !openNotificationsPanel._hubPatched) {
        const original = openNotificationsPanel;
        openNotificationsPanel = function hubPatchedOpenNotificationsPanel() {
            closeHubPanel();
            return original();
        };
        openNotificationsPanel._hubPatched = true;
    }

    if (typeof openSettings === 'function' && !openSettings._hubPatched) {
        const original = openSettings;
        openSettings = function hubPatchedOpenSettings(...args) {
            closeHubPanel();
            return original(...args);
        };
        openSettings._hubPatched = true;
    }

    if (typeof openHubPanel === 'function' && typeof toggleNotificationsPanel === 'function'
        && !toggleNotificationsPanel._hubPatched) {
        const originalToggle = toggleNotificationsPanel;
        toggleNotificationsPanel = function hubPatchedToggleNotificationsPanel() {
            closeHubPanel();
            return originalToggle();
        };
        toggleNotificationsPanel._hubPatched = true;
    }
}

function initHubUi() {
    if (initHubUi._done) return;
    initHubUi._done = true;

    document.body.classList.add('hub-nav-enabled');

    if (typeof mountPanelHeader === 'function' && typeof createPanelHeader === 'function') {
        mountPanelHeader('panel-header-hub', createPanelHeader('Centrum', { onClose: closeHubPanel }));
    }

    patchHubUiIntegrations();
    syncHubSkrybaTabVisibility();
    syncHubLockFooterVisibility();
    updateHubBadge();
    if (typeof updateNotificationsBadge === 'function') updateNotificationsBadge();
}
