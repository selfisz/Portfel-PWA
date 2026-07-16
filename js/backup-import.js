const MAX_BACKUP_IMPORT_BYTES = 12_000_000;

function isSafeObjectKey(key) {
    return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function sanitizeStringArray(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item) => String(item ?? '').trim())
        .filter(Boolean);
}

function sanitizeCategoryTree(raw) {
    const base = JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    ['income', 'expense'].forEach((side) => {
        const branch = raw[side];
        if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return;
        Object.keys(branch).forEach((main) => {
            if (!isSafeObjectKey(main)) return;
            const name = String(main).trim();
            if (!name) return;
            base[side][name] = sanitizeStringArray(branch[main]);
        });
    });
    return base;
}

function sanitizeNumericRecord(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    Object.keys(raw).forEach((key) => {
        if (!isSafeObjectKey(key)) return;
        const val = parseFloat(raw[key]);
        if (Number.isFinite(val) && val >= 0) out[key] = val;
    });
    return out;
}

function sanitizeReportPrefs(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    Object.keys(raw).forEach((key) => {
        if (!isSafeObjectKey(key)) return;
        const val = raw[key];
        if (val === null || val === undefined) return;
        if (typeof val === 'boolean') {
            out[key] = val;
            return;
        }
        if (typeof val === 'number' && Number.isFinite(val)) {
            out[key] = val;
            return;
        }
        if (typeof val === 'string') {
            out[key] = val;
            return;
        }
        if (Array.isArray(val)) {
            out[key] = sanitizeStringArray(val);
        }
    });
    return out;
}

function dedupeNormalized(list, getId) {
    const map = new Map();
    list.forEach((item) => {
        const id = getId(item);
        if (!id) return;
        map.set(id, item);
    });
    return [...map.values()];
}

function sanitizeTransactionsList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeTransactionsArray === 'function') {
        const normalized = normalizeTransactionsArray(input);
        report.droppedTransactions += Math.max(0, input.length - normalized.length);
        return normalized;
    }
    const fallback = input.filter((tx) => tx && typeof tx === 'object' && tx.date && tx.mainCategory);
    report.droppedTransactions += Math.max(0, input.length - fallback.length);
    return fallback;
}

function sanitizeLoansList(raw, legacyLoan, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeLoansArray === 'function') {
        return normalizeLoansArray(input, legacyLoan);
    }
    report.droppedLoans += input.filter((l) => !l || typeof l !== 'object').length;
    return input.filter((l) => l && typeof l === 'object');
}

function sanitizeCreditCardsList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeCreditCard !== 'function') {
        report.droppedCreditCards += input.filter((c) => !c || typeof c !== 'object').length;
        return input.filter((c) => c && typeof c === 'object');
    }
    const normalized = input
        .map((c) => normalizeCreditCard(c))
        .filter((c) => c && c.id);
    report.droppedCreditCards += Math.max(0, input.length - normalized.length);
    return dedupeNormalized(normalized, (c) => c.id);
}

function sanitizeCreditCardMovementsList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeCreditCardMovement !== 'function') {
        report.droppedCreditCardMovements += input.length;
        return [];
    }
    const normalized = input.map(normalizeCreditCardMovement).filter(Boolean);
    report.droppedCreditCardMovements += Math.max(0, input.length - normalized.length);
    return dedupeNormalized(normalized, (m) => m.id);
}

function sanitizeAssetsList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeAsset !== 'function') {
        report.droppedAssets += input.filter((a) => !a || typeof a !== 'object').length;
        return input.filter((a) => a && typeof a === 'object');
    }
    const normalized = input
        .map((a) => normalizeAsset(a))
        .filter((a) => a && a.id);
    report.droppedAssets += Math.max(0, input.length - normalized.length);
    return dedupeNormalized(normalized, (a) => a.id);
}

function sanitizeCashMovementsList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeCashMovement !== 'function') {
        report.droppedCashMovements += input.length;
        return [];
    }
    const normalized = input.map(normalizeCashMovement).filter(Boolean);
    report.droppedCashMovements += Math.max(0, input.length - normalized.length);
    const list = dedupeNormalized(normalized, (m) => m.id);
    if (typeof pruneCashMovementsList === 'function') {
        const pruned = pruneCashMovementsList(list);
        report.trimmedCashMovements += Math.max(0, list.length - pruned.length);
        return pruned;
    }
    return list;
}

function sanitizeAssetSnapshotsList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeAssetSnapshot !== 'function') {
        report.droppedAssetSnapshots += input.length;
        return [];
    }
    const normalized = input.map(normalizeAssetSnapshot).filter(Boolean);
    report.droppedAssetSnapshots += Math.max(0, input.length - normalized.length);
    const cap = typeof MAX_ASSET_SNAPSHOTS === 'number' ? MAX_ASSET_SNAPSHOTS : 36;
    if (normalized.length > cap) {
        report.trimmedAssetSnapshots += normalized.length - cap;
        return normalized.slice(-cap);
    }
    return normalized;
}

function sanitizeAssetValueHistoryList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeAssetValueHistoryEntry !== 'function') {
        report.droppedAssetValueHistory += input.length;
        return [];
    }
    const normalized = input.map(normalizeAssetValueHistoryEntry).filter(Boolean);
    report.droppedAssetValueHistory += Math.max(0, input.length - normalized.length);
    const cap = typeof MAX_ASSET_VALUE_HISTORY === 'number' ? MAX_ASSET_VALUE_HISTORY : 500;
    if (normalized.length > cap) {
        report.trimmedAssetValueHistory += normalized.length - cap;
        return normalized.slice(-cap);
    }
    return normalized;
}

function sanitizeCategoryRulesList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof mergeCategoryRulesById === 'function') {
        const normalized = mergeCategoryRulesById(input);
        report.droppedCategoryRules += Math.max(0, input.length - normalized.length);
        return normalized;
    }
    if (typeof normalizeCategoryRule === 'function') {
        const normalized = input.map(normalizeCategoryRule).filter(Boolean);
        report.droppedCategoryRules += Math.max(0, input.length - normalized.length);
        return dedupeNormalized(normalized, (rule) => rule.id);
    }
    return input;
}

function sanitizeTodoListsList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeTodoListsArray === 'function') {
        const normalized = normalizeTodoListsArray(input);
        report.droppedTodoLists += Math.max(0, input.length - normalized.length);
        return normalized;
    }
    return [];
}

function sanitizeTodosList(raw, report) {
    const input = Array.isArray(raw) ? raw : [];
    if (typeof normalizeTodosArray === 'function') {
        const normalized = normalizeTodosArray(input);
        report.droppedTodos += Math.max(0, input.length - normalized.length);
        return normalized;
    }
    return [];
}

function createBackupImportReport() {
    return {
        droppedTransactions: 0,
        droppedLoans: 0,
        droppedCreditCards: 0,
        droppedCreditCardMovements: 0,
        droppedAssets: 0,
        droppedCashMovements: 0,
        droppedAssetSnapshots: 0,
        droppedAssetValueHistory: 0,
        droppedCategoryRules: 0,
        droppedTodoLists: 0,
        droppedTodos: 0,
        trimmedCashMovements: 0,
        trimmedAssetSnapshots: 0,
        trimmedAssetValueHistory: 0
    };
}

function formatBackupImportReport(report) {
    if (!report) return '';
    const parts = [];
    if (report.droppedTransactions) parts.push(`${report.droppedTransactions} transakcji pominięto`);
    if (report.droppedLoans) parts.push(`${report.droppedLoans} kredytów pominięto`);
    if (report.droppedCreditCards) parts.push(`${report.droppedCreditCards} kart pominięto`);
    if (report.droppedAssets) parts.push(`${report.droppedAssets} aktywów pominięto`);
    if (report.droppedCategoryRules) parts.push(`${report.droppedCategoryRules} reguł pominięto`);
    if (report.droppedTodoLists) parts.push(`${report.droppedTodoLists} list zadań pominięto`);
    if (report.droppedTodos) parts.push(`${report.droppedTodos} zadań pominięto`);
    if (report.droppedCashMovements) parts.push(`${report.droppedCashMovements} ruchów gotówki pominięto`);
    const trimmed = report.trimmedCashMovements + report.trimmedAssetSnapshots + report.trimmedAssetValueHistory;
    if (trimmed) parts.push(`${trimmed} wpisów przycięto do limitu`);
    return parts.length ? parts.join(', ') : '';
}

function validateBackupPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Nieprawidłowy plik kopii zapasowej.');
    }

    const bytes = typeof estimateJsonBytes === 'function'
        ? estimateJsonBytes(payload)
        : JSON.stringify(payload).length;
    if (bytes > MAX_BACKUP_IMPORT_BYTES) {
        throw new Error('Plik kopii jest zbyt duży — maksymalnie ok. 12 MB.');
    }

    const data = payload.data ?? payload;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Nieprawidłowy plik kopii zapasowej.');
    }
    if (!Array.isArray(data.transactions)) {
        throw new Error('Nieprawidłowy plik kopii zapasowej — brak listy transakcji.');
    }

    const report = createBackupImportReport();
    const archivedRaw = payload.archivedTransactions ?? data.archivedTransactions;
    const archivedTransactions = sanitizeTransactionsList(
        Array.isArray(archivedRaw) ? archivedRaw : [],
        report
    );

    const sanitized = {
        transactions: sanitizeTransactionsList(data.transactions, report),
        loans: sanitizeLoansList(data.loans, data.loan, report),
        creditCards: sanitizeCreditCardsList(data.creditCards, report),
        creditCardMovements: sanitizeCreditCardMovementsList(data.creditCardMovements, report),
        assets: sanitizeAssetsList(data.assets, report),
        cashMovements: sanitizeCashMovementsList(data.cashMovements, report),
        assetSnapshots: sanitizeAssetSnapshotsList(data.assetSnapshots, report),
        assetValueHistory: sanitizeAssetValueHistoryList(data.assetValueHistory, report),
        categoryTree: sanitizeCategoryTree(data.categoryTree),
        categoryIcons: typeof sanitizeCategoryIcons === 'function'
            ? sanitizeCategoryIcons(data.categoryIcons)
            : { expense: { mains: {}, subs: {} }, income: { mains: {}, subs: {} } },
        categoryBudgets: sanitizeNumericRecord(data.categoryBudgets),
        subCategoryBudgets: sanitizeNumericRecord(data.subCategoryBudgets),
        reportPrefs: sanitizeReportPrefs(data.reportPrefs),
        categoryRules: sanitizeCategoryRulesList(data.categoryRules, report),
        pendingRecurringConfirmations: Array.isArray(data.pendingRecurringConfirmations)
            ? data.pendingRecurringConfirmations
            : [],
        skippedRecurringMonths: data.skippedRecurringMonths && typeof data.skippedRecurringMonths === 'object'
            ? data.skippedRecurringMonths
            : {},
        deletedAssetIds: sanitizeStringArray(data.deletedAssetIds),
        todoLists: sanitizeTodoListsList(data.todoLists, report),
        todos: sanitizeTodosList(data.todos, report)
    };

    return {
        data: sanitized,
        archivedTransactions,
        report,
        transactionCount: sanitized.transactions.length + archivedTransactions.length
    };
}
