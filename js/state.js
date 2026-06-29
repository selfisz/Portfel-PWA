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
    reportPrefs: {},
    deletedAssetIds: []
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
let dashboardChartInstance = null;
let reportsChartInstance = null;
let reportsTrendChartInstance = null;
let reportsYoyChartInstance = null;
let reportsDowChartInstance = null;
let reportsDebtChartInstance = null;
let reportsDebtTrendChartInstance = null;
let reportsDebtSplitChartInstance = null;
let reportsDebtsTabChartInstance = null;
let reportsDebtsTabSplitInstance = null;
let reportsDebtPeakChartInstance = null;
let reportsAssetAllocationChartInstance = null;
let reportsAssetsTabAllocationInstance = null;
let reportsCashTrendChartInstance = null;
let reportsAssetsTabCashTrendInstance = null;
let reportsNetWorthTrendChartInstance = null;
let reportsAllocationTrendChartInstance = null;
let reportsDiversificationChartInstance = null;
let reportsViewType = 'expense';
let reportsRankLevel = 'main';
let reportsCalendarYear = null;
let reportsCalendarMonth = null;
let reportsDebtCalendarYear = null;
let reportsDebtCalendarMonth = null;
let reportsLastPeriod = null;
let cloudSyncUnlocked = false;
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
        reportPrefs: data.reportPrefs && typeof data.reportPrefs === 'object'
            ? data.reportPrefs
            : {},
        deletedAssetIds: Array.isArray(data.deletedAssetIds) ? data.deletedAssetIds : []
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
    const memoryTx = Array.isArray(appState?.transactions) ? appState.transactions : [];
    return unionTransactions(localTx, remoteTx, memoryTx);
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
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }
    const backupRaw = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (!backupRaw) return null;
    try {
        const payload = JSON.parse(backupRaw);
        return payload?.data || payload;
    } catch {
        return null;
    }
}

function setSyncStatus(mode, txCount) {
    const statusEl = document.getElementById('sync-status');
    if (!statusEl) return;
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
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        return raw === null ? null : raw;
    } catch {
        return null;
    }
}

function syncFromRemoteData(remoteData) {
    const localRawBeforeSync = readLocalRawBeforeSync();
    const localTxCount = getTransactionCount(localRawBeforeSync ?? appState);
    const remoteTxCount = getTransactionCount(remoteData);

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
        )
    };

    applyRemoteAppState(mergedRemote, localLoans, localCreditCards);
    if (typeof repairMissingCashMovementsFromTransactions === 'function') {
        repairMissingCashMovementsFromTransactions();
    }
    checkAndProcessRecurringTransactions();

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
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

async function tryFetchCloudViaRest() {
    if (typeof fetchAppStateRest !== 'function') return null;
    try {
        const fetchPromise = fetchAppStateRest();
        const data = typeof withFirestoreTimeout === 'function'
            ? await withFirestoreTimeout(fetchPromise, 12000)
            : await fetchPromise;
        if (data?.transactions?.length) {
            return syncFromRemoteData(data);
        }
    } catch (err) {
        console.warn('tryFetchCloudViaRest', err);
    }
    return null;
}

async function autoRecoverFromCloudBackupIfNeeded() {
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
    return hadUiFields;
}

function normalizeAppState(raw) {
    return applyRemoteAppState(raw);
}

function initData() {
    let localRaw = readStoredAppStateRaw();

    if (localRaw) {
        if (!localStorage.getItem(STORAGE_KEY)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(localRaw)));
        }
        applyRemoteAppState(localRaw);
        applyMigrations();
        checkAndProcessRecurringTransactions();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
        } catch (err) {
            console.error('initData localStorage', err);
        }
        refreshCurrentView();
    }

    cloudSyncUnlocked = getTransactionCount(appState) >= 100;
    setSyncStatus('');

    const settleSyncIndicator = () => {
        const count = getTransactionCount(appState);
        const statusEl = document.getElementById('sync-status');
        if (!statusEl || statusEl.className) return;
        if (count > 0) setSyncStatus('online', count);
        else setSyncStatus('offline', 0);
    };

    let syncTimeout = window.setTimeout(settleSyncIndicator, 12000);

    const clearSyncTimeout = () => {
        window.clearTimeout(syncTimeout);
        syncTimeout = null;
    };

    tryFetchCloudViaRest().then((count) => {
        if (count !== null) clearSyncTimeout();
        else if (getTransactionCount(appState) < 100) {
            autoRecoverFromCloudBackupIfNeeded().then((recovered) => {
                if (recovered) clearSyncTimeout();
            });
        }
    });

    stateRef.onSnapshot((docSnap) => {
        clearSyncTimeout();
        if (docSnap.exists) {
            syncFromRemoteData(docSnap.data());
            return;
        }
        cloudSyncUnlocked = true;
        const count = getTransactionCount(appState);
        if (count > 0) saveState({ forceCloud: true });
        else setSyncStatus('online', 0);
    }, (error) => {
        console.error('Błąd synchronizacji', error);
        tryFetchCloudViaRest()
            .then((count) => {
                if (count === null && getTransactionCount(appState) < 100) {
                    return autoRecoverFromCloudBackupIfNeeded();
                }
                return count !== null;
            })
            .finally(() => {
                clearSyncTimeout();
                settleSyncIndicator();
            });
    });
}

function saveState(options = {}) {
    if (typeof enforceAppStateLimits === 'function') {
        enforceAppStateLimits({ silent: options.silentLimits === true });
    }
    const payload = getPersistedState(appState);
    const payloadBytes = typeof estimateJsonBytes === 'function' ? estimateJsonBytes(payload) : 0;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.error('localStorage.setItem', err);
        setSyncStatus('offline', payload.transactions.length);
        if (typeof showAppToast === 'function') {
            showAppToast('Brak miejsca w pamięci przeglądarki — wyeksportuj kopię JSON.', 'error');
        }
        return;
    }
    if (typeof refreshStorageUsageUI === 'function') refreshStorageUsageUI();
    if (payloadBytes > MAX_FIRESTORE_PAYLOAD_BYTES) {
        setSyncStatus('offline', payload.transactions.length);
        if (typeof showAppToast === 'function') {
            showAppToast('Zapis do chmury wstrzymany — baza jest zbyt duża. Wyeksportuj kopię JSON.', 'error');
        }
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
    const dash = document.getElementById('view-dashboard');
    const reports = document.getElementById('view-reports');
    const investments = document.getElementById('view-investments');
    const loans = document.getElementById('view-loans');
    if (dash?.classList.contains('active')) renderDashboard();
    if (reports?.classList.contains('active')) renderReports();
    if (investments?.classList.contains('active')) renderInvestments();
    if (loans?.classList.contains('active')) renderLoans();
}

function checkAndProcessRecurringTransactions() {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const recurringTxs = appState.transactions.filter(t => t.recurringId);
    const uniqueRecurringGroups = [...new Set(recurringTxs.map(t => t.recurringId))];

    let changesMade = false;
    uniqueRecurringGroups.forEach(recId => {
        const history = recurringTxs.filter(t => t.recurringId === recId);
        const alreadyAddedThisMonth = history.some(t => t.date.startsWith(currentMonthStr));
        if (!alreadyAddedThisMonth) {
            // Klonujemy najnowsze wystąpienie (nie pierwsze) żeby zachować aktualne dane
            const latestTx = history.reduce((newest, t) =>
                t.date > newest.date ? t : newest
            , history[0]);
            const clonedTx = { ...latestTx };
            clonedTx.date = `${currentMonthStr}-01`;
            appState.transactions.unshift(clonedTx);
            changesMade = true;
        }
    });
    if (changesMade) saveState();
    if (changesMade && typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
}
