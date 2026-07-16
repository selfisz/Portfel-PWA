const DUPLICATE_AMOUNT_TOLERANCE = 0.01;

function duplicateSubCategory(sub) {
    return sub || '[Bez podkategorii]';
}

function isSameDuplicateTransaction(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.date !== b.date) return false;
    if (Math.abs((a.amount || 0) - (b.amount || 0)) > DUPLICATE_AMOUNT_TOLERANCE) return false;
    if (a.mainCategory !== b.mainCategory) return false;
    if (duplicateSubCategory(a.subCategory) !== duplicateSubCategory(b.subCategory)) return false;
    return true;
}

function findDuplicateCandidates(tx, excludeIndex = null) {
    if (!tx?.date || !tx?.type) return [];
    const source = typeof getMergedTransactions === 'function'
        ? getMergedTransactions()
        : (appState.transactions || []);
    return source
        .map((other, idx) => ({ other, idx }))
        .filter(({ other, idx }) => {
            if (excludeIndex !== null && idx === excludeIndex) return false;
            return isSameDuplicateTransaction(tx, other);
        })
        .map(({ other, idx }) => ({ tx: other, index: idx }));
}

function findDuplicatePairsInRange(startDate, endDate) {
    const txs = (appState.transactions || [])
        .map((tx, index) => ({ tx, index }))
        .filter(({ tx }) => tx.date >= startDate && tx.date <= endDate);
    const pairs = [];
    const seen = new Set();

    for (let i = 0; i < txs.length; i += 1) {
        for (let j = i + 1; j < txs.length; j += 1) {
            if (!isSameDuplicateTransaction(txs[i].tx, txs[j].tx)) continue;
            const key = [txs[i].index, txs[j].index].sort((a, b) => a - b).join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push({ a: txs[i], b: txs[j] });
        }
    }
    return pairs;
}

function formatDuplicateTransactionLine(tx) {
    const cat = typeof formatTransactionCategoryLabel === 'function'
        ? formatTransactionCategoryLabel(tx)
        : tx.mainCategory;
    const sign = tx.type === 'expense' ? '−' : '+';
    const note = tx.note ? ` · ${tx.note}` : '';
    return `${formatTxDate(tx.date)} — ${cat} · ${sign}${formatPlnAmount(tx.amount)}${note}`;
}

let duplicateConfirmResolver = null;
let duplicateReviewContext = null;

const DUPLICATE_CONFIRM_ACTIONS_HTML = `
        <button type="button" class="btn-cancel btn-cancel--form" onclick="resolveDuplicateConfirm('cancel')">Nie dodawaj</button>
        <button type="button" class="btn-submit btn-submit--form" onclick="resolveDuplicateConfirm('keep')">Zostaw obie</button>`;

function resetDuplicateOverlayToConfirmMode() {
    duplicateReviewContext = null;
    const title = document.getElementById('duplicate-tx-title');
    const actions = document.querySelector('#duplicate-tx-overlay .duplicate-tx-actions');
    if (title) title.textContent = 'Wykryto duplikat';
    if (actions) {
        actions.classList.remove('duplicate-tx-actions--review');
        actions.innerHTML = DUPLICATE_CONFIRM_ACTIONS_HTML;
    }
}

function closeDuplicateReviewOverlay() {
    const overlay = document.getElementById('duplicate-tx-overlay');
    if (overlay) overlay.classList.add('hidden');
    resetDuplicateOverlayToConfirmMode();
}

function duplicateReviewEdit(index) {
    closeDuplicateReviewOverlay();
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
    const dashNav = document.querySelector('.nav-item[data-nav-view="dashboard"]')
        || document.querySelector('.nav-item[onclick*="\'dashboard\'"]');
    if (typeof switchView === 'function') switchView('dashboard', 'Pulpit', dashNav);
    if (typeof openTransactionDetails === 'function') openTransactionDetails(index);
    window.setTimeout(() => {
        if (typeof editTransaction === 'function') editTransaction(index);
    }, 80);
}

function duplicateReviewDelete(index) {
    const ctx = duplicateReviewContext;
    if (!ctx) return;
    if (!deleteTransactionAtIndex(index)) return;
    if (typeof saveState === 'function') saveState();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
    if (ctx.taskId && typeof dismissActionBoardTask === 'function') {
        dismissActionBoardTask(ctx.taskId);
    }
    closeDuplicateReviewOverlay();
    if (typeof refreshActionBoard === 'function') refreshActionBoard();
    if (typeof showAppToast === 'function') showAppToast('Usunięto transakcję');
}

function duplicateReviewDismissNotDuplicate() {
    const taskId = duplicateReviewContext?.taskId;
    closeDuplicateReviewOverlay();
    if (taskId && typeof dismissActionBoardTask === 'function') {
        dismissActionBoardTask(taskId);
    }
    if (typeof refreshActionBoard === 'function') refreshActionBoard();
}

function openDuplicatePairReview(indexA, indexB, options = {}) {
    const txA = appState.transactions[indexA];
    const txB = appState.transactions[indexB];
    const overlay = document.getElementById('duplicate-tx-overlay');
    const body = document.getElementById('duplicate-tx-body');
    const title = document.getElementById('duplicate-tx-title');
    const actions = document.querySelector('#duplicate-tx-overlay .duplicate-tx-actions');
    if (!txA || !txB || !overlay || !body || !actions) return;

    duplicateReviewContext = {
        indexA,
        indexB,
        taskId: options.taskId || null
    };

    if (title) title.textContent = 'Podejrzany duplikat';
    const renderRow = (tx, index) => (
        typeof buildTransactionRowHtml === 'function'
            ? buildTransactionRowHtml(tx, { globalIndex: index, clickMode: 'duplicateReview' })
            : `<p>${escapeHtml(formatDuplicateTransactionLine(tx))}</p>`
    );

    body.innerHTML = `
        <p class="reports-hint">Te transakcje wyglądają na duplikat. Kliknij wiersz, aby edytować, albo usuń jedną z nich.</p>
        <div class="duplicate-tx-pair">
            <div class="duplicate-tx-pair-group">
                <span class="section-label">Transakcja 1</span>
                ${renderRow(txA, indexA)}
            </div>
            <div class="duplicate-tx-pair-group">
                <span class="section-label">Transakcja 2</span>
                ${renderRow(txB, indexB)}
            </div>
        </div>`;

    actions.classList.add('duplicate-tx-actions--review');
    actions.innerHTML = `
        <button type="button" class="btn-outline btn-sm" onclick="duplicateReviewEdit(${indexA})">Edytuj 1</button>
        <button type="button" class="btn-outline btn-sm" onclick="duplicateReviewEdit(${indexB})">Edytuj 2</button>
        <button type="button" class="btn-outline btn-sm" onclick="duplicateReviewDelete(${indexA})">Usuń 1</button>
        <button type="button" class="btn-outline btn-sm" onclick="duplicateReviewDelete(${indexB})">Usuń 2</button>
        <button type="button" class="btn-cancel btn-cancel--form" onclick="duplicateReviewDismissNotDuplicate()">To nie duplikat</button>
        <button type="button" class="btn-submit btn-submit--form" onclick="closeDuplicateReviewOverlay()">Zamknij</button>`;

    overlay.classList.remove('hidden');
    if (options.closeNotifications && typeof closeNotificationsPanel === 'function') {
        closeNotificationsPanel();
    }
}

function closeDuplicateConfirmOverlay(result = false) {
    const overlay = document.getElementById('duplicate-tx-overlay');
    if (overlay) overlay.classList.add('hidden');
    resetDuplicateOverlayToConfirmMode();
    if (duplicateConfirmResolver) {
        const resolve = duplicateConfirmResolver;
        duplicateConfirmResolver = null;
        resolve(result);
    }
}

function resolveDuplicateConfirm(action) {
    if (action === 'keep') {
        closeDuplicateConfirmOverlay(true);
        return;
    }
    if (action === 'cancel') {
        closeDuplicateConfirmOverlay(false);
        return;
    }
    closeDuplicateConfirmOverlay(false);
}

function showDuplicateConfirmDialog(tx, candidates) {
    const overlay = document.getElementById('duplicate-tx-overlay');
    const body = document.getElementById('duplicate-tx-body');
    if (!overlay || !body) return Promise.resolve(true);

    resetDuplicateOverlayToConfirmMode();

    const lines = candidates.slice(0, 3).map(({ tx: other }) => formatDuplicateTransactionLine(other));
    const more = candidates.length > 3 ? `<p class="reports-hint">…i ${candidates.length - 3} podobnych.</p>` : '';
    body.innerHTML = `
        <p>Wykryto duplikat — taka transakcja już jest w bazie:</p>
        <p class="duplicate-tx-new"><strong>${escapeHtml(formatDuplicateTransactionLine(tx))}</strong></p>
        <ul class="duplicate-tx-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        ${more}`;

    overlay.classList.remove('hidden');
    return new Promise((resolve) => {
        duplicateConfirmResolver = resolve;
    });
}

function confirmNoDuplicateBeforeSave(tx, excludeIndex = null) {
    const candidates = findDuplicateCandidates(tx, excludeIndex);
    if (!candidates.length) return Promise.resolve(true);
    return showDuplicateConfirmDialog(tx, candidates);
}

function deleteTransactionAtIndex(index) {
    if (index < 0 || index >= appState.transactions.length) return false;
    if (typeof deleteTransaction === 'function') {
        deleteTransaction(index);
        return true;
    }
    return false;
}

function dismissDuplicatePair(pair) {
    void pair;
}
