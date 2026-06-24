let categoryTree = DEFAULT_CATEGORY_TREE;
let categoryEditorType = 'expense';

let appState = {
    transactions: [],
    loans: [],
    creditCards: [],
    creditCardMovements: [],
    assets: [],
    cashMovements: [],
    categoryBudgets: {}
};

let formState = {
    formMode: 'expense',
    currentType: 'expense',
    selectedMainCategory: '',
    selectedSubCategory: ''
};

let editingTxIndex = null;
let activeChartCategory = null;
let chartViewType = 'expense';
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
let reportsViewType = 'expense';
let reportsRankLevel = 'main';
let reportsCalendarYear = null;
let reportsCalendarMonth = null;
let reportsLastPeriod = null;
function getPersistedState(raw = appState) {
    const data = raw ?? appState ?? {};
    const persisted = {
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
        loans: normalizeLoansArray(data.loans, data.loan),
        creditCards: Array.isArray(data.creditCards) ? data.creditCards : [],
        creditCardMovements: Array.isArray(data.creditCardMovements) ? data.creditCardMovements : [],
        assets: Array.isArray(data.assets) ? data.assets : [],
        cashMovements: Array.isArray(data.cashMovements) ? data.cashMovements : [],
        categoryTree: data.categoryTree && typeof data.categoryTree === 'object'
            ? data.categoryTree
            : JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)),
        categoryBudgets: data.categoryBudgets && typeof data.categoryBudgets === 'object'
            ? data.categoryBudgets
            : {}
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
    return hadUiFields;
}

function normalizeAppState(raw) {
    return applyRemoteAppState(raw);
}

function initData() {
    if (localStorage.getItem(STORAGE_KEY)) {
        const localRaw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        const hadUiFields = applyRemoteAppState(localRaw);
        const hadMigration = migrateCategoryData() || migrateLoanCategoryTree();
        const hadLoanMigration = runLoanMigrations();
        const hadCardMigration = runCreditCardMigrations();
        const hadAssetMigration = typeof runAssetMigrations === 'function' ? runAssetMigrations() : false;
        const hadCashMigration = typeof runCashMigrations === 'function' ? runCashMigrations() : false;
        if (hadUiFields) localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
        if (hadMigration || hadLoanMigration || hadCardMigration || hadAssetMigration || hadCashMigration) saveState();
        checkAndProcessRecurringTransactions();
        refreshCurrentView();
    }

    stateRef.onSnapshot((docSnap) => {
        const statusEl = document.getElementById('sync-status');
        if (docSnap.exists) {
            let localLoans = [];
            let localCreditCards = [];
            try {
                const localRaw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
                localLoans = getLoansFromPersistedRaw(localRaw);
                localCreditCards = Array.isArray(localRaw?.creditCards) ? localRaw.creditCards : [];
            } catch { /* ignore */ }

            const hadUiFields = applyRemoteAppState(docSnap.data(), localLoans, localCreditCards);
            const hadMigration = migrateCategoryData() || migrateLoanCategoryTree();
            const hadLoanMigration = runLoanMigrations();
            const hadCardMigration = runCreditCardMigrations();
            const hadAssetMigration = typeof runAssetMigrations === 'function' ? runAssetMigrations() : false;
            const hadCashMigration = typeof runCashMigrations === 'function' ? runCashMigrations() : false;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
            if (hadUiFields || hadMigration || hadLoanMigration || hadCardMigration || hadAssetMigration || hadCashMigration) saveState();
            statusEl.className = 'online';
            refreshCurrentView();
        } else {
            saveState();
        }
    }, (error) => {
        console.error("Błąd synchronizacji", error);
        document.getElementById('sync-status').className = 'offline';
    });
}

function saveState() {
    const payload = getPersistedState(appState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    stateRef.set(payload).then(() => {
        document.getElementById('sync-status').className = 'online';
    }).catch(err => {
        console.log("Zapisano offline. Zsynchronizuje się później.", err);
        document.getElementById('sync-status').className = 'offline';
    });
}

function refreshCurrentView() {
    if (document.getElementById('view-dashboard').classList.contains('active')) renderDashboard();
    if (document.getElementById('view-reports').classList.contains('active')) renderReports();
    if (document.getElementById('view-investments').classList.contains('active')) renderInvestments();
    if (document.getElementById('view-loans').classList.contains('active')) renderLoans();
}

function checkAndProcessRecurringTransactions() {
    const currentMonthStr = new Date().toISOString().substring(0, 7);
    const recurringTxs = appState.transactions.filter(t => t.recurringId);
    const uniqueRecurringGroups = [...new Set(recurringTxs.map(t => t.recurringId))];

    let changesMade = false;
    uniqueRecurringGroups.forEach(recId => {
        const history = recurringTxs.filter(t => t.recurringId === recId);
        const alreadyAddedThisMonth = history.some(t => t.date.startsWith(currentMonthStr));
        if (!alreadyAddedThisMonth) {
            const clonedTx = { ...history[0] };
            clonedTx.date = `${currentMonthStr}-01`;
            appState.transactions.unshift(clonedTx);
            changesMade = true;
        }
    });
    if (changesMade) saveState();
}
