function normalizePendingRecurringConfirmation(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const monthKey = raw.monthKey || '';
    const recurringId = raw.recurringId || '';
    if (!monthKey || !recurringId || !raw.transaction) return null;
    return {
        id: raw.id || `prec_${recurringId}_${monthKey}`,
        recurringId,
        monthKey,
        transaction: raw.transaction
    };
}

function getPendingRecurringConfirmations() {
    return (appState.pendingRecurringConfirmations || [])
        .map(normalizePendingRecurringConfirmation)
        .filter(Boolean);
}

function getSkippedRecurringMonths(recurringId) {
    const list = appState.skippedRecurringMonths?.[recurringId];
    return Array.isArray(list) ? list : [];
}

function markRecurringMonthSkipped(recurringId, monthKey) {
    if (!appState.skippedRecurringMonths || typeof appState.skippedRecurringMonths !== 'object') {
        appState.skippedRecurringMonths = {};
    }
    const current = getSkippedRecurringMonths(recurringId);
    if (!current.includes(monthKey)) current.push(monthKey);
    appState.skippedRecurringMonths[recurringId] = current;
}

function removePendingRecurringConfirmation(id) {
    appState.pendingRecurringConfirmations = getPendingRecurringConfirmations()
        .filter((item) => item.id !== id);
}

function formatRecurringMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return monthKey;
    return new Date(year, month - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
}

function renderRecurringConfirmOverlay() {
    const overlay = document.getElementById('recurring-confirm-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (document.getElementById('reports-pdf-overlay')?.classList.contains('hidden')
        && document.getElementById('assets-pdf-date-overlay')?.classList.contains('hidden')
        && document.getElementById('debts-pdf-date-overlay')?.classList.contains('hidden')) {
        document.body.style.overflow = document.body.classList.contains('notifications-open')
            || document.body.classList.contains('settings-open')
            || document.body.classList.contains('skryba-open')
            ? 'hidden'
            : '';
    }
    if (typeof refreshActionBoard === 'function') refreshActionBoard();
}

function closeRecurringConfirmOverlay() {
    const overlay = document.getElementById('recurring-confirm-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    if (document.getElementById('reports-pdf-overlay')?.classList.contains('hidden')
        && document.getElementById('assets-pdf-date-overlay')?.classList.contains('hidden')
        && document.getElementById('debts-pdf-date-overlay')?.classList.contains('hidden')) {
        document.body.style.overflow = '';
    }
}

function confirmPendingRecurring(id) {
    const item = getPendingRecurringConfirmations().find((entry) => entry.id === id);
    if (!item) return;

    const tx = { ...item.transaction };
    delete tx.cashMovementId;
    const result = typeof commitTransactionData === 'function'
        ? commitTransactionData(tx, { skipBudgetConfirm: true })
        : null;

    removePendingRecurringConfirmation(id);
    saveState();

    if (!result?.ok) {
        if (typeof showAppToast === 'function') {
            showAppToast(result?.error || 'Nie udało się dodać transakcji.', 'error');
        }
    } else if (typeof showAppToast === 'function') {
        showAppToast('Dodano transakcję cykliczną');
    }

    renderRecurringConfirmOverlay();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
}

function skipPendingRecurring(id) {
    const item = getPendingRecurringConfirmations().find((entry) => entry.id === id);
    if (!item) return;
    markRecurringMonthSkipped(item.recurringId, item.monthKey);
    removePendingRecurringConfirmation(id);
    saveState();
    renderRecurringConfirmOverlay();
}

function confirmAllPendingRecurring() {
    const ids = getPendingRecurringConfirmations().map((item) => item.id);
    ids.forEach((id) => confirmPendingRecurring(id));
}

function skipAllPendingRecurring() {
    getPendingRecurringConfirmations().forEach((item) => {
        markRecurringMonthSkipped(item.recurringId, item.monthKey);
    });
    appState.pendingRecurringConfirmations = [];
    saveState();
    renderRecurringConfirmOverlay();
}
