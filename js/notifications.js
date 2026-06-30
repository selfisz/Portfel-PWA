function getDefaultNotificationPrefs() {
    return {
        enabled: false,
        budgetAlerts: true,
        loanReminders: true,
        cardReminders: true,
        spendingPaceAlerts: true,
        recurringMissingAlerts: true,
        insightAlerts: true
    };
}

function getNotificationPrefs() {
    try {
        const raw = JSON.parse(localStorage.getItem(NOTIFICATION_PREFS_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return getDefaultNotificationPrefs();
        return { ...getDefaultNotificationPrefs(), ...raw };
    } catch {
        return getDefaultNotificationPrefs();
    }
}

function saveNotificationPrefs(prefs) {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify({ ...getDefaultNotificationPrefs(), ...prefs }));
}

function getNotificationInbox() {
    try {
        const raw = JSON.parse(localStorage.getItem(NOTIFICATION_INBOX_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function saveNotificationInbox(inbox) {
    localStorage.setItem(NOTIFICATION_INBOX_KEY, JSON.stringify(inbox));
}

function addDaysToIsoDate(isoDate, days) {
    if (!isoDate) return '';
    const d = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    return localIsoDate(d);
}

function getTomorrowIsoDate() {
    return addDaysToIsoDate(localIsoDate(new Date()), 1);
}

function getCurrentMonthKey() {
    return localIsoDate(new Date()).slice(0, 7);
}

function isNotificationSnoozed(item, todayStr = localIsoDate(new Date())) {
    return !!(item.snoozedUntil && item.snoozedUntil > todayStr);
}

function isNotificationDismissedThisMonth(item, monthKey = getCurrentMonthKey()) {
    return !!(item.dismissed && item.dismissedYm === monthKey);
}

function isNotificationVisible(item, todayStr = localIsoDate(new Date())) {
    if (!item || item.dismissedPermanently) return false;
    if (isNotificationSnoozed(item, todayStr)) return false;
    if (item.dismissed && item.dismissedYm === todayStr.slice(0, 7)) return false;
    if (typeof isNotificationResolved === 'function' && isNotificationResolved(item)) return false;
    return true;
}

function getUnreadNotificationCount() {
    return getNotificationInbox().filter((item) => isNotificationVisible(item) && !item.read).length;
}

function upsertNotification(proposal) {
    if (!proposal?.id) return null;
    const inbox = getNotificationInbox();
    const idx = inbox.findIndex((n) => n.id === proposal.id);
    const now = new Date().toISOString();
    const currentYm = getCurrentMonthKey();

    if (idx >= 0) {
        const existing = inbox[idx];
        let dismissed = existing.dismissed;
        let dismissedYm = existing.dismissedYm;
        let dismissedPermanently = existing.dismissedPermanently;
        if (dismissed && dismissedYm && dismissedYm < currentYm) {
            dismissed = false;
            dismissedYm = null;
        }
        inbox[idx] = {
            ...existing,
            ...proposal,
            read: existing.read,
            dismissed,
            dismissedYm,
            dismissedPermanently,
            snoozedUntil: existing.snoozedUntil,
            updatedAt: now
        };
        delete inbox[idx].refreshRead;
        saveNotificationInbox(inbox);
        return { item: inbox[idx], isNew: false };
    }

    const created = {
        read: false,
        dismissed: false,
        dismissedYm: null,
        dismissedPermanently: false,
        snoozedUntil: null,
        createdAt: now,
        updatedAt: now,
        ...proposal
    };
    delete created.refreshRead;
    inbox.unshift(created);
    saveNotificationInbox(inbox.slice(0, 200));
    return { item: created, isNew: true };
}

function getNotificationById(id) {
    return getNotificationInbox().find((n) => n.id === id) || null;
}

function dismissNotification(id) {
    const inbox = getNotificationInbox();
    const item = inbox.find((n) => n.id === id);
    if (!item) return;
    item.dismissed = true;
    item.dismissedYm = getCurrentMonthKey();
    item.read = true;
    if (typeof isNotificationResolved === 'function' && isNotificationResolved(item)) {
        item.dismissedPermanently = true;
    }
    saveNotificationInbox(inbox);
    updateNotificationsBadge();
    renderNotificationsPanel();
}

function snoozeNotification(id) {
    const inbox = getNotificationInbox();
    const item = inbox.find((n) => n.id === id);
    if (!item) return;
    item.snoozedUntil = getTomorrowIsoDate();
    item.read = true;
    saveNotificationInbox(inbox);
    updateNotificationsBadge();
    renderNotificationsPanel();
}

function markNotificationRead(id) {
    const inbox = getNotificationInbox();
    const item = inbox.find((n) => n.id === id);
    if (!item) return;
    item.read = true;
    saveNotificationInbox(inbox);
    updateNotificationsBadge();
    renderNotificationsPanel();
}

function markAllNotificationsRead() {
    const inbox = getNotificationInbox();
    let changed = false;
    inbox.forEach((item) => {
        if (isNotificationVisible(item) && !item.read) {
            item.read = true;
            changed = true;
        }
    });
    if (changed) saveNotificationInbox(inbox);
    updateNotificationsBadge();
    renderNotificationsPanel();
}

function formatNotificationRelativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const diffMin = Math.round((Date.now() - then) / 60000);
    if (diffMin < 1) return 'przed chwilą';
    if (diffMin < 60) return `${diffMin} min temu`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH} godz. temu`;
    const diffD = Math.round(diffH / 24);
    if (diffD === 1) return 'wczoraj';
    if (diffD < 7) return `${diffD} dni temu`;
    return formatTxDate(iso.slice(0, 10));
}

function updateNotificationsBadge() {
    const badge = document.getElementById('notifications-badge');
    if (!badge) return;
    const count = getUnreadNotificationCount();
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('hidden', count === 0);
    const btn = document.getElementById('btn-notifications');
    if (btn) btn.classList.toggle('btn-icon--has-badge', count > 0);
}

function renderNotificationsPanel() {
    const list = document.getElementById('notifications-list');
    if (!list) return;
    const items = getNotificationInbox().filter((item) => isNotificationVisible(item));
    if (!items.length) {
        list.innerHTML = '<p class="notifications-empty">Brak powiadomień</p>';
        return;
    }
    list.innerHTML = items.map((item) => {
        const unreadClass = item.read ? '' : ' notification-row--unread';
        return `<article class="notification-row${unreadClass}" data-id="${escapeHtml(item.id)}">
            <button type="button" class="notification-row-main" onclick="openNotificationTarget('${escapeHtml(item.id)}')">
                <strong class="notification-row-title">${escapeHtml(item.title)}</strong>
                <span class="notification-row-body">${escapeHtml(item.body)}</span>
                <span class="notification-row-time">${escapeHtml(formatNotificationRelativeTime(item.updatedAt || item.createdAt))}</span>
            </button>
            <div class="notification-row-actions">
                <button type="button" class="notification-action-btn" title="Przypomnij jutro" aria-label="Przypomnij jutro" onclick="event.stopPropagation(); snoozeNotification('${escapeHtml(item.id)}')">↻</button>
                <button type="button" class="notification-action-btn notification-action-btn--dismiss" title="Odrzuć" aria-label="Odrzuć" onclick="event.stopPropagation(); dismissNotification('${escapeHtml(item.id)}')">×</button>
            </div>
        </article>`;
    }).join('');
}

function openNotificationsPanel() {
    const panel = document.getElementById('notifications-overlay');
    if (!panel) return;
    panel.classList.remove('hidden');
    document.body.classList.add('notifications-open');
    renderNotificationsPanel();
    const btn = document.getElementById('btn-notifications');
    if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeNotificationsPanel() {
    document.getElementById('notifications-overlay')?.classList.add('hidden');
    document.body.classList.remove('notifications-open');
    const btn = document.getElementById('btn-notifications');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleNotificationsPanel() {
    const panel = document.getElementById('notifications-overlay');
    if (!panel) return;
    if (panel.classList.contains('hidden')) openNotificationsPanel();
    else closeNotificationsPanel();
}

function openNotificationTarget(id) {
    const item = getNotificationById(id);
    if (!item) return;
    markNotificationRead(id);
    closeNotificationsPanel();
    navigateFromNotification(item);
}

function navigateFromNotification(item) {
    const payload = item.payload || {};
    const loansNav = document.querySelector('.nav-item[onclick*="\'loans\'"]');

    if (payload.loanId && typeof openLoanDetails === 'function') {
        if (typeof switchView === 'function') switchView('loans', 'Długi', loansNav);
        openLoanDetails(payload.loanId);
        return;
    }
    if (payload.cardId && typeof openCreditCardDetails === 'function') {
        if (typeof switchView === 'function') switchView('loans', 'Długi', loansNav);
        openCreditCardDetails(payload.cardId);
        return;
    }
    if (item.type === 'budget_warn' || item.type === 'budget_over' || item.type === 'budget_pace') {
        const reportsNav = document.querySelector('.nav-item[onclick*="\'reports\'"]');
        if (typeof switchView === 'function') switchView('reports', 'Raporty', reportsNav);
        if (typeof setAnalysisSection === 'function') setAnalysisSection('overview');
        if (typeof expandReportsBudgetFromNotification === 'function') {
            expandReportsBudgetFromNotification(item.payload || {});
        }
        requestAnimationFrame(() => {
            document.getElementById('reports-budget-overview-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        return;
    }
    if (item.type === 'recurring_missing') {
        const reportsNav = document.querySelector('.nav-item[onclick*="\'reports\'"]');
        if (typeof switchView === 'function') switchView('reports', 'Raporty', reportsNav);
        return;
    }
    if (item.type === 'spending_anomaly') {
        const reportsNav = document.querySelector('.nav-item[onclick*="\'reports\'"]');
        if (typeof switchView === 'function') switchView('reports', 'Raporty', reportsNav);
        return;
    }
    if (item.type === 'ikze_limit') {
        if (typeof openIkzeLimitPanel === 'function') openIkzeLimitPanel();
        return;
    }
    if (item.type === 'savings_goal') {
        const reportsNav = document.querySelector('.nav-item[onclick*="\'reports\'"]');
        if (typeof switchView === 'function') switchView('reports', 'Raporty', reportsNav);
        return;
    }
    if (item.type === 'card_monthly_check') {
        if (typeof switchView === 'function') switchView('loans', 'Długi', loansNav);
        const cardId = payload.cardId || payload.cardIds?.[0];
        if (cardId && typeof openCreditCardDetails === 'function') openCreditCardDetails(cardId);
    }
}

function maybeShowSystemNotifications(newItems) {
    const prefs = getNotificationPrefs();
    if (!prefs.enabled || !newItems?.length) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;

    const reg = navigator.serviceWorker?.controller;
    if (!reg) return;
    newItems.filter((item) => !item.read).forEach((item) => {
        reg.postMessage({
            type: 'SHOW_NOTIFICATION',
            notification: {
                id: item.id,
                title: item.title,
                body: item.body
            }
        });
    });
}

function evaluateAllNotifications() {
    const prefs = getNotificationPrefs();
    if (!prefs.enabled) {
        updateNotificationsBadge();
        return [];
    }
    const created = [];
    if (prefs.budgetAlerts && typeof evaluateBudgetAlerts === 'function') {
        created.push(...evaluateBudgetAlerts());
    }
    if (prefs.loanReminders && typeof evaluateLoanReminders === 'function') {
        created.push(...evaluateLoanReminders());
    }
    if (prefs.cardReminders && typeof evaluateCardReminders === 'function') {
        created.push(...evaluateCardReminders());
    }
    if (prefs.spendingPaceAlerts && typeof evaluateSpendingPaceAlerts === 'function') {
        created.push(...evaluateSpendingPaceAlerts());
    }
    if (prefs.recurringMissingAlerts && typeof evaluateMissingRecurringAlerts === 'function') {
        created.push(...evaluateMissingRecurringAlerts());
    }
    if (prefs.insightAlerts && typeof evaluateSpendingInsightAlerts === 'function') {
        created.push(...evaluateSpendingInsightAlerts());
    }
    updateNotificationsBadge();
    const panel = document.getElementById('notifications-overlay');
    if (panel && !panel.classList.contains('hidden')) renderNotificationsPanel();
    maybeShowSystemNotifications(created);
    return created;
}

function handleServiceWorkerNotificationMessage(event) {
    const data = event.data;
    if (!data?.type || !data.id) return;
    if (data.type === 'NOTIFICATION_OPENED') openNotificationTarget(data.id);
    if (data.type === 'NOTIFICATION_DISMISS') dismissNotification(data.id);
    if (data.type === 'NOTIFICATION_SNOOZE') snoozeNotification(data.id);
}

async function setNotificationsEnabled(enabled) {
    const prefs = getNotificationPrefs();
    prefs.enabled = !!enabled;
    if (prefs.enabled && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }
    saveNotificationPrefs(prefs);
    if (prefs.enabled) evaluateAllNotifications();
    else updateNotificationsBadge();
    return prefs;
}

function bindNotificationPrefToggle(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
        const prefs = getNotificationPrefs();
        prefs[key] = el.checked;
        saveNotificationPrefs(prefs);
        if (prefs.enabled) evaluateAllNotifications();
    });
}

function syncNotificationSettingsUI() {
    const prefs = getNotificationPrefs();
    const master = document.getElementById('notif-pref-enabled');
    const budget = document.getElementById('notif-pref-budget');
    const loan = document.getElementById('notif-pref-loan');
    const card = document.getElementById('notif-pref-card');
    const pace = document.getElementById('notif-pref-pace');
    const recurring = document.getElementById('notif-pref-recurring');
    const insight = document.getElementById('notif-pref-insight');
    const status = document.getElementById('notif-permission-status');
    if (master) master.checked = prefs.enabled;
    if (budget) budget.checked = prefs.budgetAlerts;
    if (loan) loan.checked = prefs.loanReminders;
    if (card) card.checked = prefs.cardReminders;
    if (pace) pace.checked = prefs.spendingPaceAlerts;
    if (recurring) recurring.checked = prefs.recurringMissingAlerts;
    if (insight) insight.checked = prefs.insightAlerts;
    const sub = document.getElementById('notif-pref-subtoggles');
    if (sub) sub.classList.toggle('hidden', !prefs.enabled);
    if (status) {
        if (!('Notification' in window)) {
            status.textContent = 'Przeglądarka nie obsługuje powiadomień systemowych — działa panel w aplikacji.';
        } else if (Notification.permission === 'granted') {
            status.textContent = 'Powiadomienia systemowe włączone.';
        } else if (Notification.permission === 'denied') {
            status.textContent = 'Powiadomienia zablokowane w przeglądarce — dostępny jest panel w aplikacji.';
        } else {
            status.textContent = 'Po włączeniu zostaniesz poproszony o zgodę na powiadomienia systemowe.';
        }
    }
}

async function onNotificationMasterToggle() {
    const master = document.getElementById('notif-pref-enabled');
    await setNotificationsEnabled(!!master?.checked);
    syncNotificationSettingsUI();
}

function initNotifications() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerNotificationMessage);
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') evaluateAllNotifications();
    });
    bindNotificationPrefToggle('notif-pref-budget', 'budgetAlerts');
    bindNotificationPrefToggle('notif-pref-loan', 'loanReminders');
    bindNotificationPrefToggle('notif-pref-card', 'cardReminders');
    bindNotificationPrefToggle('notif-pref-pace', 'spendingPaceAlerts');
    bindNotificationPrefToggle('notif-pref-recurring', 'recurringMissingAlerts');
    bindNotificationPrefToggle('notif-pref-insight', 'insightAlerts');
    syncNotificationSettingsUI();
    updateNotificationsBadge();
    evaluateAllNotifications();
}

function notifyAfterFinanceChange() {
    if (!getNotificationPrefs().enabled) {
        updateNotificationsBadge();
        return;
    }
    evaluateAllNotifications();
}
