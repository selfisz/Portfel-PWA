let categoryTree = DEFAULT_CATEGORY_TREE;
let categoryEditorType = 'expense';

let appState = {
    transactions: [],
    loan: { totalAmount: 500000.00, currentCapitalLeft: 412500.00, interestRate: 6.75 },
    investments: [{ ticker: 'VWCE.DE', name: 'Vanguard FTSE All-World', quantity: 45, purchasePrice: 104.20, currentPriceManual: 118.50, currency: 'EUR' }],
    categoryBudgets: {}
};

let formState = {
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
let reportsViewType = 'expense';
let reportsRankLevel = 'main';
let reportsCalendarYear = null;
let reportsCalendarMonth = null;
let reportsLastPeriod = null;
function getPersistedState(raw = appState) {
    const data = raw ?? appState ?? {};
    return {
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
        loan: data.loan || { totalAmount: 500000.00, currentCapitalLeft: 412500.00, interestRate: 6.75 },
        investments: Array.isArray(data.investments) ? data.investments : [],
        categoryTree: data.categoryTree && typeof data.categoryTree === 'object'
            ? data.categoryTree
            : JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)),
        categoryBudgets: data.categoryBudgets && typeof data.categoryBudgets === 'object'
            ? data.categoryBudgets
            : {}
    };
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

function normalizeAppState(raw) {
    const hadUiFields = !!(raw && ('currentType' in raw || 'selectedMainCategory' in raw || 'selectedSubCategory' in raw));
    appState = getPersistedState(raw);
    categoryTree = appState.categoryTree;
    return hadUiFields;
}
function initData() {
    if (localStorage.getItem(STORAGE_KEY)) {
        const hadUiFields = normalizeAppState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
        const hadMigration = migrateCategoryData();
        if (hadUiFields) localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
        if (hadMigration) saveState();
        checkAndProcessRecurringTransactions();
        refreshCurrentView();
    }

    stateRef.onSnapshot((docSnap) => {
        const statusEl = document.getElementById('sync-status');
        if (docSnap.exists) {
            const hadUiFields = normalizeAppState(docSnap.data());
            const hadMigration = migrateCategoryData();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
            if (hadUiFields || hadMigration) saveState();
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
