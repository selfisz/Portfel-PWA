function getTransactionSearchSource() {
    return typeof getMergedTransactions === 'function'
        ? getMergedTransactions()
        : (appState?.transactions || []);
}

function filterTransactionItems(items, params = {}) {
    if (!Array.isArray(items)) return [];
    let filtered = items;

    const typeFilter = params.type === 'income' || params.type === 'expense' ? params.type : null;
    if (typeFilter) filtered = filtered.filter((t) => t.type === typeFilter);

    if (params.startDate) filtered = filtered.filter((t) => t.date >= params.startDate);
    if (params.endDate) filtered = filtered.filter((t) => t.date <= params.endDate);

    const daysBack = Number.isFinite(params.daysBack) ? params.daysBack : null;
    if (daysBack) {
        const minDate = typeof localIsoDate === 'function'
            ? localIsoDate(new Date(Date.now() - daysBack * 86400000))
            : '';
        if (minDate) filtered = filtered.filter((t) => t.date >= minDate);
    }

    if (typeof filterItemsByFuzzyCategoryField === 'function') {
        filtered = filterItemsByFuzzyCategoryField(filtered, 'mainCategory', params.mainCategory);
        filtered = filterItemsByFuzzyCategoryField(filtered, 'subCategory', params.subCategory);
    }

    if (params.query) {
        const query = String(params.query).toLowerCase().trim();
        if (query && typeof transactionMatchesFuzzyQuery === 'function') {
            filtered = filtered.filter((t) => transactionMatchesFuzzyQuery(t, query));
        }
    }

    if (Number.isFinite(params.minAmount)) {
        filtered = filtered.filter((t) => (Number(t.amount) || 0) > params.minAmount);
    }
    if (Number.isFinite(params.maxAmount)) {
        filtered = filtered.filter((t) => (Number(t.amount) || 0) < params.maxAmount);
    }

    if (params.missingSubCategory && typeof isTransactionMissingSubCategory === 'function') {
        filtered = filtered.filter((t) => isTransactionMissingSubCategory(t));
    }

    return filtered;
}

function isTransactionMissingSubCategory(tx) {
    if (!tx) return false;
    if (tx.subCategory === '[Bez podkategorii]') return true;
    if (tx.mainCategory === 'Różne') return true;
    return false;
}

function searchTransactionItems(params = {}, options = {}) {
    const items = filterTransactionItems(getTransactionSearchSource(), params);
    const limit = Number.isFinite(options.limit) ? options.limit : null;
    return limit ? items.slice(0, limit) : items;
}

function findActiveTransactionIndex(tx) {
    if (!tx) return -1;
    const txs = typeof appState !== 'undefined' ? appState.transactions || [] : [];
    let idx = txs.indexOf(tx);
    if (idx >= 0) return idx;
    if (typeof transactionFingerprint === 'function') {
        const fp = transactionFingerprint(tx);
        if (fp) {
            idx = txs.findIndex((t) => transactionFingerprint(t) === fp);
            if (idx >= 0) return idx;
        }
    }
    return txs.findIndex((t) => (
        t.date === tx.date
        && Number(t.amount) === Number(tx.amount)
        && (t.type || 'expense') === (tx.type || 'expense')
        && t.mainCategory === tx.mainCategory
        && t.subCategory === tx.subCategory
        && (t.note || '') === (tx.note || '')
    ));
}

function getAssistantTransactionsSource() {
    return getTransactionSearchSource();
}

function getSkrybaTransactionsSource() {
    return getTransactionSearchSource();
}

function runAssistantSearch(search) {
    return searchTransactionItems(search || {}, { limit: 100 });
}

function skrybaGetFilteredTransactionItems(params = {}) {
    return searchTransactionItems(params);
}

function findAssistantTransactionIndex(tx) {
    return findActiveTransactionIndex(tx);
}
