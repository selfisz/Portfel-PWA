function estimateJsonBytes(value) {
    try {
        const json = JSON.stringify(value);
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(json).length;
        }
        return json.length;
    } catch {
        return 0;
    }
}

function sortTransactionsByDateDesc(transactions) {
    return [...transactions].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function normalizeTransaction(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const amount = typeof raw.amount === 'number'
        ? raw.amount
        : parseFloat(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const type = raw.type === 'income' ? 'income' : 'expense';
    const mainCategory = String(raw.mainCategory || '').trim();
    const subCategory = String(raw.subCategory || '').trim() || '[Bez podkategorii]';
    const date = String(raw.date || '').trim();
    if (!mainCategory || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

    const tx = {
        amount,
        type,
        mainCategory,
        subCategory,
        date,
        note: typeof raw.note === 'string' ? raw.note : ''
    };
    if (raw.recurringId) tx.recurringId = String(raw.recurringId);
    if (raw.creditCardId) tx.creditCardId = String(raw.creditCardId);
    if (raw.cashMovementId) tx.cashMovementId = String(raw.cashMovementId);
    if (raw.linkedAssetId) tx.linkedAssetId = String(raw.linkedAssetId);
    if (raw.affectsCash === false) tx.affectsCash = false;
    else if (raw.affectsCash === true) tx.affectsCash = true;
    return tx;
}

function normalizeTransactionsArray(list) {
    if (!Array.isArray(list)) return [];
    const byKey = new Map();
    list.forEach((raw) => {
        const tx = normalizeTransaction(raw);
        if (!tx) return;
        const key = typeof transactionFingerprint === 'function'
            ? transactionFingerprint(tx)
            : `${tx.date}|${tx.amount}|${tx.mainCategory}`;
        byKey.set(key, tx);
    });
    return sortTransactionsByDateDesc([...byKey.values()]);
}

function getArchivedTransactions() {
    try {
        const raw = JSON.parse(localStorage.getItem(ARCHIVED_TRANSACTIONS_KEY) || '[]');
        return normalizeTransactionsArray(Array.isArray(raw) ? raw : []);
    } catch {
        return [];
    }
}

function setArchivedTransactions(transactions) {
    const normalized = normalizeTransactionsArray(transactions);
    localStorage.setItem(ARCHIVED_TRANSACTIONS_KEY, JSON.stringify(normalized));
    return normalized;
}

function mergeArchivedTransactions(...lists) {
    return normalizeTransactionsArray(lists.flat());
}

function archiveTransactionOverflow(activeTransactions) {
    const normalized = normalizeTransactionsArray(activeTransactions);
    if (normalized.length <= MAX_ACTIVE_TRANSACTIONS) {
        return { active: normalized, archivedAdded: 0 };
    }

    const keep = normalized.slice(0, MAX_ACTIVE_TRANSACTIONS);
    const overflow = normalized.slice(MAX_ACTIVE_TRANSACTIONS);
    const mergedArchive = mergeArchivedTransactions(getArchivedTransactions(), overflow);
    setArchivedTransactions(mergedArchive);
    return { active: keep, archivedAdded: overflow.length };
}

function pruneCashMovementsList(movements) {
    if (!Array.isArray(movements)) return [];
    const sorted = [...movements]
        .filter((m) => m && typeof m === 'object' && m.id)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return sorted.slice(0, MAX_CASH_MOVEMENTS);
}

function getActiveTransactionCount() {
    return Array.isArray(appState?.transactions) ? appState.transactions.length : 0;
}

function getTotalTransactionCount() {
    const archived = getArchivedTransactions();
    const merged = mergeArchivedTransactions(appState?.transactions || [], archived);
    return merged.length;
}

function getMergedTransactions() {
    return mergeArchivedTransactions(appState?.transactions || [], getArchivedTransactions());
}

function enforceAppStateLimits(options = {}) {
    const result = {
        archivedAdded: 0,
        droppedInvalid: 0,
        cashTrimmed: 0,
        payloadBytes: 0,
        nearLimit: false,
        overLimit: false
    };

    const beforeCount = Array.isArray(appState.transactions) ? appState.transactions.length : 0;
    const normalized = normalizeTransactionsArray(appState.transactions);
    result.droppedInvalid = Math.max(0, beforeCount - normalized.length);

    const { active, archivedAdded } = archiveTransactionOverflow(normalized);
    appState.transactions = active;
    result.archivedAdded = archivedAdded;

    const cashBefore = Array.isArray(appState.cashMovements) ? appState.cashMovements.length : 0;
    appState.cashMovements = pruneCashMovementsList(appState.cashMovements);
    result.cashTrimmed = Math.max(0, cashBefore - appState.cashMovements.length);

    let payload = typeof getPersistedState === 'function' ? getPersistedState(appState) : appState;
    let bytes = estimateJsonBytes(payload);
    let shrinkGuard = 0;
    while (bytes > MAX_FIRESTORE_PAYLOAD_BYTES && appState.transactions.length > 500 && shrinkGuard < 20) {
        shrinkGuard += 1;
        const batch = Math.min(250, appState.transactions.length - 500);
        const sorted = sortTransactionsByDateDesc(appState.transactions);
        const overflow = sorted.slice(-batch);
        appState.transactions = sorted.slice(0, sorted.length - batch);
        setArchivedTransactions(mergeArchivedTransactions(getArchivedTransactions(), overflow));
        result.archivedAdded += overflow.length;
        payload = getPersistedState(appState);
        bytes = estimateJsonBytes(payload);
    }

    result.payloadBytes = bytes;
    result.nearLimit = appState.transactions.length >= Math.floor(MAX_ACTIVE_TRANSACTIONS * TX_ARCHIVE_WARN_RATIO);
    result.overLimit = bytes > MAX_FIRESTORE_PAYLOAD_BYTES;

    if (!options.silent && result.archivedAdded > 0 && typeof showAppToast === 'function') {
        showAppToast(
            `${result.archivedAdded} starszych transakcji przeniesiono do archiwum lokalnego (nadal w eksporcie JSON).`,
            'default'
        );
    }

    return result;
}

function restoreArchivedTransactionsFromBackup(archivedList) {
    if (!Array.isArray(archivedList) || !archivedList.length) return 0;
    const merged = mergeArchivedTransactions(getArchivedTransactions(), archivedList);
    setArchivedTransactions(merged);
    return merged.length;
}

function getStorageUsageSummary() {
    const active = getActiveTransactionCount();
    const archived = getArchivedTransactions().length;
    const payload = typeof getPersistedState === 'function' ? getPersistedState(appState) : {};
    const bytes = estimateJsonBytes(payload);
    const kb = Math.round(bytes / 1024);
    return {
        active,
        archived,
        total: active + archived,
        maxActive: MAX_ACTIVE_TRANSACTIONS,
        payloadKb: kb,
        maxPayloadKb: Math.round(MAX_FIRESTORE_PAYLOAD_BYTES / 1024),
        nearLimit: active >= Math.floor(MAX_ACTIVE_TRANSACTIONS * TX_ARCHIVE_WARN_RATIO)
    };
}

function refreshStorageUsageUI() {
    const el = document.getElementById('storage-usage-info');
    if (!el) return;
    const s = getStorageUsageSummary();
    const warn = s.nearLimit ? ' · zbliżasz się do limitu aktywnych' : '';
    el.textContent = `Aktywne: ${s.active}/${s.maxActive} · archiwum: ${s.archived} · sync ~${s.payloadKb} KB / ${s.maxPayloadKb} KB${warn}`;
}
