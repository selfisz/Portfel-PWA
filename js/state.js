let categoryTree = DEFAULT_CATEGORY_TREE;
let categoryEditorType = 'expense';

let appState = {
    transactions: [],
    loans: [],
    creditCards: [],
    creditCardMovements: [],
    assets: [],
    cashMovements: [],
    assetSnapshots: [],
    assetValueHistory: [],
    categoryBudgets: {},
    subCategoryBudgets: {},
    categoryIcons: {
        expense: { mains: {}, subs: {} },
        income: { mains: {}, subs: {} }
    },
    reportPrefs: {},
    categoryRules: [],
    pendingRecurringConfirmations: [],
    skippedRecurringMonths: {},
    deletedAssetIds: [],
    todoLists: [],
    todos: []
};

let formState = {
    formMode: 'expense',
    currentType: 'expense',
    selectedMainCategory: '',
    selectedSubCategory: ''
};

let editingTxIndex = null;
let postEditReturnAssetId = null;
let activeChartCategory = null;
let activeChartSubCategory = null;
let chartViewType = 'expense';
let chartHiddenMainCategories = {};
let chartHiddenSubCategories = {};
let chartViewFilterExpanded = false;
let reportsViewType = 'expense';
let reportsRankLevel = 'main';
let reportsCalendarYear = null;
let reportsCalendarMonth = null;
let reportsDebtCalendarYear = null;
let reportsDebtCalendarMonth = null;
let reportsLastPeriod = null;
let cloudSyncUnlocked = false;
let preferRemoteFinanceState = false;
let demoFinanceHydratedFromServer = false;

function isDemoFinanceSession() {
    if (typeof isDemoFinanceUid !== 'function') return false;
    const uid = getAccountUidFromStorage()
        || (typeof getCurrentAuthUser === 'function' ? getCurrentAuthUser()?.uid : null);
    return isDemoFinanceUid(uid);
}

function isDemoFinanceCloudWriteAllowed() {
    return !isDemoFinanceSession() || demoFinanceHydratedFromServer;
}

function shouldSkipLocalFinanceBootstrap() {
    return shouldPreferRemoteFinanceState() || isDemoFinanceSession();
}

function markPreferRemoteFinanceState() {
    preferRemoteFinanceState = true;
}

function shouldPreferRemoteFinanceState() {
    return preferRemoteFinanceState;
}

function clearPreferRemoteFinanceState() {
    preferRemoteFinanceState = false;
}

function clearFinanceSessionMarker() {
    try {
        sessionStorage.removeItem(FINANCE_SESSION_UID_KEY);
    } catch {
        /* ignore */
    }
}

function clearAccountScopedFinanceCache() {
    try {
        localStorage.removeItem(getFinanceStorageKey());
        localStorage.removeItem(getLocalBackupStorageKey());
        localStorage.removeItem(getPendingCloudSyncStorageKey());
    } catch {
        /* ignore */
    }
}

function beginFinanceSessionForUid(uid) {
    if (!uid) return;
    try {
        const prev = sessionStorage.getItem(FINANCE_SESSION_UID_KEY);
        if (prev !== uid) {
            markPreferRemoteFinanceState();
            sessionStorage.setItem(FINANCE_SESSION_UID_KEY, uid);
        }
        if (typeof isDemoFinanceUid === 'function' && isDemoFinanceUid(uid)) {
            demoFinanceHydratedFromServer = false;
            markPreferRemoteFinanceState();
            clearAccountScopedFinanceCache();
        }
    } catch {
        markPreferRemoteFinanceState();
    }
}

function hasFinancePortfolio(data) {
    if (!data || typeof data !== 'object') return false;
    return (Array.isArray(data.loans) && data.loans.length > 0)
        || (Array.isArray(data.creditCards) && data.creditCards.length > 0)
        || (Array.isArray(data.assets) && data.assets.length > 0);
}

function isDemoScopedFinanceId(id, prefix) {
    return String(id || '').startsWith(prefix);
}

function stripForeignDemoFinancePayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (!isDemoFinanceSession()) return payload;
    return {
        ...payload,
        loans: (payload.loans || []).filter((loan) => isDemoScopedFinanceId(loan?.id, 'loan-demo-')),
        creditCards: (payload.creditCards || []).filter((card) => isDemoScopedFinanceId(card?.id, 'card-demo-')),
        assets: (payload.assets || []).filter((asset) => isDemoScopedFinanceId(asset?.id, 'asset-demo-')),
        creditCardMovements: (payload.creditCardMovements || []).filter((move) => (
            isDemoScopedFinanceId(move?.cardId, 'card-demo-')
        ))
    };
}

function finalizeFinanceRemoteApply(remoteData) {
    const localRaw = readLocalRawBeforeSync();
    const localPersisted = localRaw ? getPersistedState(localRaw) : getPersistedState(appState);
    const memoryPersisted = getPersistedState(appState);
    const remotePersisted = getPersistedState(remoteData);
    let payload = stripForeignDemoFinancePayload(getPersistedState(remoteData));
    if (typeof mergeTodoFieldsIntoFinancePayload === 'function') {
        payload = mergeTodoFieldsIntoFinancePayload(payload, remotePersisted, localPersisted, memoryPersisted);
    }
    if (typeof mergeCategoryRulesIntoFinancePayload === 'function') {
        payload = mergeCategoryRulesIntoFinancePayload(payload, remotePersisted, localPersisted, memoryPersisted);
    }
    applyRemoteAppState(payload);
    if (typeof repairMissingCashMovementsFromTransactions === 'function') {
        repairMissingCashMovementsFromTransactions();
    }
    checkAndProcessRecurringTransactions();
    try {
        localStorage.setItem(getFinanceStorageKey(), JSON.stringify(getPersistedState(appState)));
    } catch (err) {
        console.error('finalizeFinanceRemoteApply localStorage', err);
    }
    cloudSyncUnlocked = true;
    if (isDemoFinanceSession()) {
        demoFinanceHydratedFromServer = true;
    }
    clearPreferRemoteFinanceState();
    const finalCount = getTransactionCount(appState);
    setSyncStatus('online', finalCount);
    try {
        refreshCurrentView();
    } catch (err) {
        console.error('refreshCurrentView', err);
    }
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
    return finalCount;
}

async function hydrateDemoFinanceFromServer() {
    if (!isDemoFinanceSession() || !stateRef || typeof stateRef.get !== 'function') return false;
    if (demoFinanceHydratedFromServer) return true;
    try {
        const snap = await stateRef.get({ source: 'server' });
        if (!snap.exists) return false;
        finalizeFinanceRemoteApply(snap.data());
        return true;
    } catch (err) {
        console.warn('hydrateDemoFinanceFromServer', err);
        return false;
    }
}
function getPersistedState(raw = appState) {
    const data = raw ?? appState ?? {};
    const transactions = typeof normalizeTransactionsArray === 'function'
        ? normalizeTransactionsArray(data.transactions)
        : (Array.isArray(data.transactions) ? data.transactions : []);
    const cashMovements = typeof pruneCashMovementsList === 'function'
        ? pruneCashMovementsList(data.cashMovements)
        : (Array.isArray(data.cashMovements) ? data.cashMovements : []);
    const persisted = {
        transactions,
        loans: normalizeLoansArray(data.loans, data.loan),
        creditCards: Array.isArray(data.creditCards) ? data.creditCards : [],
        creditCardMovements: Array.isArray(data.creditCardMovements) ? data.creditCardMovements : [],
        assets: Array.isArray(data.assets) ? data.assets : [],
        cashMovements,
        assetSnapshots: Array.isArray(data.assetSnapshots) ? data.assetSnapshots : [],
        assetValueHistory: Array.isArray(data.assetValueHistory) ? data.assetValueHistory : [],
        categoryTree: data.categoryTree && typeof data.categoryTree === 'object'
            ? data.categoryTree
            : JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)),
        categoryBudgets: data.categoryBudgets && typeof data.categoryBudgets === 'object'
            ? data.categoryBudgets
            : {},
        subCategoryBudgets: data.subCategoryBudgets && typeof data.subCategoryBudgets === 'object'
            ? data.subCategoryBudgets
            : {},
        categoryIcons: typeof sanitizeCategoryIcons === 'function'
            ? sanitizeCategoryIcons(data.categoryIcons)
            : {
                expense: { mains: {}, subs: {} },
                income: { mains: {}, subs: {} }
            },
        reportPrefs: data.reportPrefs && typeof data.reportPrefs === 'object'
            ? data.reportPrefs
            : {},
        categoryRules: Array.isArray(data.categoryRules) ? data.categoryRules : [],
        pendingRecurringConfirmations: Array.isArray(data.pendingRecurringConfirmations)
            ? data.pendingRecurringConfirmations
            : [],
        skippedRecurringMonths: data.skippedRecurringMonths && typeof data.skippedRecurringMonths === 'object'
            ? data.skippedRecurringMonths
            : {},
        deletedAssetIds: Array.isArray(data.deletedAssetIds) ? data.deletedAssetIds : [],
        todoLists: typeof normalizeTodoListsArray === 'function'
            ? normalizeTodoListsArray(data.todoLists)
            : (Array.isArray(data.todoLists) ? data.todoLists : []),
        todos: typeof normalizeTodosArray === 'function'
            ? normalizeTodosArray(data.todos)
            : (Array.isArray(data.todos) ? data.todos : [])
    };
    return persisted;
}

function migrateLoansArray() {
    if (Array.isArray(appState.loans) && appState.loans.length) {
        appState.loans = appState.loans.map(normalizeLoan).filter((l) => !isLegacyTestLoan(l));
        delete appState.loan;
        return false;
    }
    if (appState.loan && typeof appState.loan === 'object') {
        if (isLegacyTestLoan(appState.loan)) {
            delete appState.loan;
            appState.loans = [];
            return true;
        }
        appState.loans = normalizeLoansArray(null, appState.loan);
        delete appState.loan;
        return true;
    }
    appState.loans = [];
    delete appState.loan;
    return true;
}

function migrateLoanCategoryTree() {
    const subs = categoryTree?.expense?.Długi;
    if (!Array.isArray(subs)) return false;
    let changed = false;
    if (!subs.includes('Kredyt hipoteczny')) {
        categoryTree.expense.Długi = ['Kredyt hipoteczny', ...categoryTree.expense.Długi];
        changed = true;
    }
    if (!categoryTree.expense.Długi.includes('Meble')) {
        categoryTree.expense.Długi = [...categoryTree.expense.Długi, 'Meble'];
        changed = true;
    }
    if (!categoryTree.expense.Długi.includes('Remont')) {
        categoryTree.expense.Długi = [...categoryTree.expense.Długi, 'Remont'];
        changed = true;
    }
    if (changed) appState.categoryTree = categoryTree;
    return changed;
}

function migrateCategoryData() {
    let changed = false;
    appState.transactions.forEach((tx) => {
        if (tx.mainCategory === 'Komunikacja') {
            tx.mainCategory = 'Transport';
            changed = true;
        }
    });
    if (activeChartCategory === 'Komunikacja') {
        activeChartCategory = 'Transport';
        changed = true;
    }
    try {
        const recents = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY) || '[]');
        const migrated = recents.map((entry) => {
            if (entry.mainCategory === 'Komunikacja') {
                changed = true;
                return { ...entry, mainCategory: 'Transport' };
            }
            return entry;
        });
        if (changed) localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(migrated));
    } catch { /* ignore */ }
    return changed;
}

function getTransactionCount(raw) {
    return getPersistedState(raw).transactions.length;
}

function transactionFingerprint(tx) {
    if (!tx || typeof tx !== 'object') return '';
    return [
        tx.date || '',
        tx.type || '',
        tx.mainCategory || '',
        tx.subCategory || '',
        Number(tx.amount || 0).toFixed(2),
        tx.note || '',
        tx.recurringId || ''
    ].join('|');
}

function unionTransactions(...lists) {
    const byKey = new Map();
    lists.flat().forEach((tx) => {
        const key = transactionFingerprint(tx);
        if (!key) return;
        byKey.set(key, tx);
    });
    return Array.from(byKey.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function mergeRemoteTransactions(localRaw, remoteRaw) {
    const localTx = localRaw ? getPersistedState(localRaw).transactions : [];
    const remoteTx = remoteRaw ? getPersistedState(remoteRaw).transactions : [];
    return unionTransactions(localTx, remoteTx);
}

function mergeAssetsById(...assetLists) {
    const map = new Map();
    assetLists.flat().forEach((raw) => {
        if (!raw || typeof raw !== 'object' || !raw.id) return;
        const asset = typeof normalizeAsset === 'function' ? normalizeAsset(raw) : raw;
        map.set(asset.id, asset);
    });
    const deletedSet = new Set(Array.isArray(appState.deletedAssetIds) ? appState.deletedAssetIds : []);
    deletedSet.forEach((id) => map.delete(id));
    return [...map.values()];
}

function mergeCashMovementsById(...movementLists) {
    const map = new Map();
    movementLists.flat().forEach((raw) => {
        if (!raw || typeof raw !== 'object' || !raw.id) return;
        map.set(raw.id, raw);
    });
    return [...map.values()];
}

function applyMigrations() {
    const hadCategory = migrateCategoryData() || migrateLoanCategoryTree();
    if (getTransactionCount(appState) >= 50) {
        return hadCategory;
    }
    const hadLoanMigration = runLoanMigrations();
    const hadCardMigration = runCreditCardMigrations();
    const hadAssetMigration = typeof runAssetMigrations === 'function' ? runAssetMigrations() : false;
    const hadCashMigration = typeof runCashMigrations === 'function' ? runCashMigrations() : false;
    const hadAnalyticsMigration = typeof runAssetAnalyticsMigrations === 'function' ? runAssetAnalyticsMigrations() : false;
    return hadCategory || hadLoanMigration || hadCardMigration || hadAssetMigration || hadCashMigration || hadAnalyticsMigration;
}

function readStoredAppStateRaw() {
    const key = getFinanceStorageKey();
    if (!key) return null;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

function resetAppStateForAccountSwitch() {
    appState = {
        transactions: [],
        loans: [],
        creditCards: [],
        creditCardMovements: [],
        assets: [],
        cashMovements: [],
        assetSnapshots: [],
        assetValueHistory: [],
        categoryBudgets: {},
        subCategoryBudgets: {},
        categoryIcons: {
            expense: { mains: {}, subs: {} },
            income: { mains: {}, subs: {} }
        },
        reportPrefs: {},
        categoryRules: [],
        pendingRecurringConfirmations: [],
        skippedRecurringMonths: {},
        deletedAssetIds: [],
        todoLists: [],
        todos: []
    };
    categoryTree = typeof DEFAULT_CATEGORY_TREE !== 'undefined'
        ? JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE))
        : categoryTree;
    cloudSyncUnlocked = false;
    demoFinanceHydratedFromServer = false;
    if (typeof stopCloudSync === 'function') stopCloudSync();
    if (typeof clearPendingCloudSync === 'function') clearPendingCloudSync();
}

function setSyncStatus(mode, txCount) {
    const statusEl = document.getElementById('sync-status');
    if (!statusEl) return;
    if (mode === 'online' && typeof hasPendingCloudSync === 'function' && hasPendingCloudSync()) {
        mode = 'pending';
    }
    statusEl.className = mode || '';
    const countHint = typeof txCount === 'number' ? ` (${txCount} transakcji)` : '';
    const titles = {
        '': 'Synchronizacja z chmurą…',
        online: `Zsynchronizowano z chmurą${countHint}`,
        offline: 'Tryb offline — dane zapisane lokalnie. Dotknij kropki, aby ponowić synchronizację.',
        pending: `Oczekuje na synchronizację${countHint} — dane zapisane lokalnie. Dotknij, aby ponowić.`
    };
    statusEl.title = titles[mode] || titles[''];
    statusEl.setAttribute('aria-label', statusEl.title);
}

function readLocalRawBeforeSync() {
    try {
        const raw = JSON.parse(localStorage.getItem(getFinanceStorageKey()) || 'null');
        return raw === null ? null : raw;
    } catch {
        return null;
    }
}

function syncFromRemoteData(remoteData, options = {}) {
    const fromCache = options.fromCache === true;

    if (isDemoFinanceSession()) {
        if (fromCache) return getTransactionCount(appState);
        if (!remoteData || typeof remoteData !== 'object') return getTransactionCount(appState);
        return finalizeFinanceRemoteApply(remoteData);
    }

    const remoteAuthoritative = shouldPreferRemoteFinanceState();
    const localRawBeforeSync = remoteAuthoritative ? null : readLocalRawBeforeSync();
    const localTxCount = getTransactionCount(localRawBeforeSync ?? appState);
    const remoteTxCount = getTransactionCount(remoteData);

    if (remoteAuthoritative && (remoteTxCount > 0 || hasFinancePortfolio(remoteData))) {
        return finalizeFinanceRemoteApply(remoteData);
    }

    if (remoteTxCount === 0 && localTxCount > 0) {
        cloudSyncUnlocked = true;
        setSyncStatus('online', localTxCount);
        return localTxCount;
    }

    const localLoans = getLoansFromPersistedRaw(localRawBeforeSync);
    const localCreditCards = Array.isArray(localRawBeforeSync?.creditCards) ? localRawBeforeSync.creditCards : [];
    const localPersisted = localRawBeforeSync
        ? getPersistedState(localRawBeforeSync)
        : getPersistedState(appState);
    const memoryPersisted = getPersistedState(appState);
    const mergedTransactions = mergeRemoteTransactions(localRawBeforeSync, remoteData);
    const remotePersisted = getPersistedState({ ...remoteData, transactions: mergedTransactions });
    const mergedRemote = {
        ...remoteData,
        transactions: mergedTransactions,
        assets: mergeAssetsById(remotePersisted.assets, localPersisted.assets, memoryPersisted.assets),
        cashMovements: mergeCashMovementsById(
            remotePersisted.cashMovements,
            localPersisted.cashMovements,
            memoryPersisted.cashMovements
        ),
        todoLists: typeof mergeTodoListsById === 'function'
            ? mergeTodoListsById(remotePersisted.todoLists, localPersisted.todoLists, memoryPersisted.todoLists)
            : (localPersisted.todoLists?.length ? localPersisted.todoLists : memoryPersisted.todoLists),
        todos: typeof mergeTodosById === 'function'
            ? mergeTodosById(remotePersisted.todos, localPersisted.todos, memoryPersisted.todos)
            : (localPersisted.todos?.length ? localPersisted.todos : memoryPersisted.todos),
        categoryRules: typeof mergeCategoryRulesById === 'function'
            ? mergeCategoryRulesById(remotePersisted.categoryRules, localPersisted.categoryRules, memoryPersisted.categoryRules)
            : (localPersisted.categoryRules?.length ? localPersisted.categoryRules : memoryPersisted.categoryRules)
    };

    applyRemoteAppState(mergedRemote, localLoans, localCreditCards);
    if (typeof repairMissingCashMovementsFromTransactions === 'function') {
        repairMissingCashMovementsFromTransactions();
    }
    checkAndProcessRecurringTransactions();

    try {
        localStorage.setItem(getFinanceStorageKey(), JSON.stringify(getPersistedState(appState)));
    } catch (err) {
        console.error('syncFromRemoteData localStorage', err);
    }

    cloudSyncUnlocked = true;
    const finalCount = getTransactionCount(appState);
    setSyncStatus('online', finalCount);
    try {
        refreshCurrentView();
    } catch (err) {
        console.error('refreshCurrentView', err);
    }
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
    return finalCount;
}

async function autoRecoverFromCloudBackupIfNeeded() {
    if (isDemoFinanceSession()) return false;
    if (getTransactionCount(appState) >= 100) return false;
    try {
        const payload = typeof getCloudBackupPayload === 'function'
            ? await getCloudBackupPayload()
            : null;
        if (!payload) return false;

        const backupCount = payload.transactionCount || getTransactionCount(payload.data || payload);
        if (backupCount <= getTransactionCount(appState)) return false;

        applyBackupPayload(payload);
        if (typeof showSettingsToast === 'function') {
            showSettingsToast(`Przywrócono ${backupCount} transakcji z kopii w chmurze`);
        }
        return true;
    } catch (err) {
        console.error('autoRecoverFromCloudBackupIfNeeded', err);
        return false;
    }
}

function applyRemoteAppState(raw, extraLoanSources = [], extraCreditCardSources = []) {
    const hadUiFields = !!(raw && ('currentType' in raw || 'selectedMainCategory' in raw || 'selectedSubCategory' in raw));
    const base = getPersistedState(raw);
    appState = {
        ...base,
        loans: mergeLoansById(base.loans, ...extraLoanSources),
        creditCards: mergeCreditCardsById(base.creditCards, ...extraCreditCardSources)
    };
    if (Array.isArray(raw?.investments) && raw.investments.length) {
        appState.investments = raw.investments;
    }
    migrateLoansArray();
    categoryTree = appState.categoryTree;
    if (typeof reconcileAllCashAssets === 'function') {
        reconcileAllCashAssets();
    }
    if (typeof enforceAppStateLimits === 'function') {
        enforceAppStateLimits({ silent: true });
    }
    if (typeof ensureTodoListsInitialized === 'function') ensureTodoListsInitialized();
    return hadUiFields;
}

function normalizeAppState(raw) {
    return applyRemoteAppState(raw);
}

function loadLocalFinanceState() {
    if (isDemoFinanceSession() || shouldSkipLocalFinanceBootstrap()) return false;
    const localRaw = readStoredAppStateRaw();
    if (!localRaw) return false;

    applyRemoteAppState(localRaw);
    applyMigrations();
    checkAndProcessRecurringTransactions();
    try {
        localStorage.setItem(getFinanceStorageKey(), JSON.stringify(getPersistedState(appState)));
    } catch (err) {
        console.error('loadLocalFinanceState', err);
    }
    refreshCurrentView();
    return true;
}

function initData() {
    if (!stateRef || typeof stateRef.onSnapshot !== 'function') {
        if (!shouldSkipLocalFinanceBootstrap() && loadLocalFinanceState()) {
            setSyncStatus('offline', getTransactionCount(appState));
        }
        if (typeof initOfflineListeners === 'function') initOfflineListeners();
        return;
    }

    if (!shouldSkipLocalFinanceBootstrap() && loadLocalFinanceState()) {
        /* local snapshot loaded — cloud sync continues below */
    }

    cloudSyncUnlocked = true;
    setSyncStatus('');

    window.setTimeout(() => {
        if (typeof maybeRunAutoCloudBackup === 'function') maybeRunAutoCloudBackup();
    }, 4000);

    if (typeof startCloudSnapshotSync === 'function') startCloudSnapshotSync();

    if (typeof initOfflineListeners === 'function') initOfflineListeners();
}

function saveState(options = {}) {
    if (typeof enforceAppStateLimits === 'function') {
        enforceAppStateLimits({ silent: options.silentLimits === true });
    }
    const payload = stripForeignDemoFinancePayload(getPersistedState(appState));
    const payloadBytes = typeof estimateJsonBytes === 'function' ? estimateJsonBytes(payload) : 0;
    try {
        localStorage.setItem(getFinanceStorageKey(), JSON.stringify(payload));
    } catch (err) {
        console.error('localStorage.setItem', err);
        setSyncStatus('offline', payload.transactions.length);
        if (typeof showAppToast === 'function') {
            showAppToast('Brak miejsca w pamięci przeglądarki — wyeksportuj kopię JSON.', 'error');
        }
        return;
    }
    if (typeof refreshStorageUsageUI === 'function') refreshStorageUsageUI();
    if (!isDemoFinanceCloudWriteAllowed()) {
        setSyncStatus('offline', payload.transactions.length);
        return;
    }
    if (payloadBytes > MAX_FIRESTORE_PAYLOAD_BYTES) {
        setSyncStatus('offline', payload.transactions.length);
        if (typeof showAppToast === 'function') {
            showAppToast('Zapis do chmury wstrzymany — baza jest zbyt duża. Wyeksportuj kopię JSON.', 'error');
        }
        return;
    }
    if (!stateRef || typeof stateRef.set !== 'function') {
        setSyncStatus('offline', payload.transactions.length);
        return;
    }
    if (typeof queueCloudSync === 'function') {
        queueCloudSync({ payload, forceCloud: options.forceCloud === true });
        return;
    }
    if (!cloudSyncUnlocked && !options.forceCloud && payload.transactions.length < 50) return;
    stateRef.set(payload).then(() => {
        setSyncStatus('online', payload.transactions.length);
    }).catch(err => {
        console.log("Zapisano offline. Zsynchronizuje się później.", err);
        setSyncStatus('offline', payload.transactions.length);
    });
}

function refreshCurrentView() {
    if (typeof isWelcomeMode === 'function' && isWelcomeMode() && typeof renderWelcomeDashboard === 'function') {
        renderWelcomeDashboard();
        return;
    }
    const dash = document.getElementById('view-dashboard');
    const reports = document.getElementById('view-reports');
    const investments = document.getElementById('view-investments');
    const loans = document.getElementById('view-loans');
    if (dash?.classList?.contains('active')) renderDashboard();
    if (reports?.classList?.contains('active')) renderReports();
    if (investments?.classList?.contains('active') && typeof renderAssets === 'function') renderAssets();
    if (loans?.classList?.contains('active')) renderLoans();
    if (document.getElementById('view-tasks')?.classList?.contains('active') && typeof renderTasksView === 'function') {
        renderTasksView();
    }
}

function checkAndProcessRecurringTransactions() {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (!Array.isArray(appState.pendingRecurringConfirmations)) {
        appState.pendingRecurringConfirmations = [];
    }
    if (!appState.skippedRecurringMonths || typeof appState.skippedRecurringMonths !== 'object') {
        appState.skippedRecurringMonths = {};
    }

    const recurringTxs = appState.transactions.filter((t) => t.recurringId);
    const uniqueRecurringGroups = [...new Set(recurringTxs.map((t) => t.recurringId))];
    let changesMade = false;

    uniqueRecurringGroups.forEach((recId) => {
        const history = recurringTxs.filter((t) => t.recurringId === recId);
        const alreadyAddedThisMonth = history.some((t) => t.date.startsWith(currentMonthStr));
        const skipped = typeof getSkippedRecurringMonths === 'function'
            ? getSkippedRecurringMonths(recId).includes(currentMonthStr)
            : (appState.skippedRecurringMonths?.[recId] || []).includes(currentMonthStr);
        const alreadyPending = appState.pendingRecurringConfirmations.some(
            (item) => item.recurringId === recId && item.monthKey === currentMonthStr
        );
        if (alreadyAddedThisMonth || skipped || alreadyPending) return;

        const latestTx = history.reduce((newest, t) => (
            t.date > newest.date ? t : newest
        ), history[0]);
        const clonedTx = { ...latestTx };
        clonedTx.date = `${currentMonthStr}-01`;
        delete clonedTx.cashMovementId;
        appState.pendingRecurringConfirmations.push({
            id: `prec_${recId}_${currentMonthStr}`,
            recurringId: recId,
            monthKey: currentMonthStr,
            transaction: clonedTx
        });
        changesMade = true;
    });

    appState.pendingRecurringConfirmations = (appState.pendingRecurringConfirmations || [])
        .map((item) => (typeof normalizePendingRecurringConfirmation === 'function'
            ? normalizePendingRecurringConfirmation(item)
            : item))
        .filter(Boolean)
        .filter((item) => {
            const added = recurringTxs.some(
                (t) => t.recurringId === item.recurringId && t.date.startsWith(item.monthKey)
            );
            const skipped = typeof getSkippedRecurringMonths === 'function'
                ? getSkippedRecurringMonths(item.recurringId).includes(item.monthKey)
                : (appState.skippedRecurringMonths?.[item.recurringId] || []).includes(item.monthKey);
            return !added && !skipped;
        });

    if (changesMade) saveState();
    if (typeof renderRecurringConfirmOverlay === 'function') renderRecurringConfirmOverlay();
    return changesMade;
}
