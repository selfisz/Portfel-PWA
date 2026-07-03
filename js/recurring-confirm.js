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
    const list = document.getElementById('recurring-confirm-list');
    if (!overlay || !list) return;

    const pending = getPendingRecurringConfirmations();
    if (!pending.length) {
        overlay.classList.add('hidden');
        if (!document.getElementById('reports-pdf-overlay')?.classList.contains('hidden')) return;
        if (!document.getElementById('assets-pdf-date-overlay')?.classList.contains('hidden')) return;
        if (!document.getElementById('debts-pdf-date-overlay')?.classList.contains('hidden')) return;
        document.body.style.overflow = '';
        return;
    }

    list.innerHTML = pending.map((item) => {
        const tx = item.transaction;
        const preview = typeof formatAssistantTransactionPreview === 'function'
            ? formatAssistantTransactionPreview(tx)
            : `${tx.amount} zł`;
        const monthLabel = formatRecurringMonthLabel(item.monthKey);
        return `<div class="recurring-confirm-item">
            <div class="recurring-confirm-item-body">
                <strong>${escapeHtml(monthLabel)}</strong>
                <span>${escapeHtml(preview)}</span>
            </div>
            <div class="recurring-confirm-item-actions">
                <button type="button" class="btn-submit btn-submit--form" onclick="confirmPendingRecurring('${escapeHtml(item.id)}')">Dodaj</button>
                <button type="button" class="btn-cancel btn-cancel--form" onclick="skipPendingRecurring('${escapeHtml(item.id)}')">Pomiń</button>
            </div>
        </div>`;
    }).join('');

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
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
