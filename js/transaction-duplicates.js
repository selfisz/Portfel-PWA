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
        .filter((t) => t.date >= startDate && t.date <= endDate)
        .map((tx, index) => ({ tx, index }));
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

function closeDuplicateConfirmOverlay(result = false) {
    const overlay = document.getElementById('duplicate-tx-overlay');
    if (overlay) overlay.classList.add('hidden');
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
