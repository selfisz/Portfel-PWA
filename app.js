const firebaseConfig = {
    apiKey: "AIzaSyAfvk2_lfsaf5QZkH_MVk-kWbG8GFvjSeI",
    authDomain: "portfel-pwa.firebaseapp.com",
    projectId: "portfel-pwa",
    storageBucket: "portfel-pwa.firebasestorage.app",
    messagingSenderId: "370658952228",
    appId: "1:370658952228:web:b5fedfe155ea1918e584b1",
    measurementId: "G-MF61T2VZ2K"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const stateRef = db.collection('finances').doc('my_state');
const cloudBackupRef = db.collection('finances').doc('cloud_backup');
const STORAGE_KEY = 'app_finance_state';
const THEME_KEY = 'theme_preference';
const LOCAL_BACKUP_KEY = 'finanse_local_backup';
const MODULE_SPLIT_LINE_THRESHOLD = 900;
const MODULE_SPLIT_BANNER_KEY = 'module_split_banner_dismissed_at';

db.enablePersistence().catch(err => console.error("Firebase persistence error:", err));

const categoryTree = {
    expense: {
        "Dom": ["Czynsz", "Meble", "Remont", "Formalności", "Smart home", "Konserwacja", "Inne"],
        "Długi": ["Kredyt Pekao SA", "Karta kredytowa", "Spłata", "Raty", "Odroczenia płatności"],
        "Osobista": ["Randki", "Fryzjer", "Kosmetyki", "Zdrowie", "Sport", "Ubrania"],
        "Przyjemności": ["Wycieczki", "Gierki", "Zakupy", "Rozrywka", "Wyjścia"],
        "Zakupy": ["Zakupy", "Alko", "Zakupy na dowóz"],
        "Samochód": ["Paliwo", "Serwisowanie", "Opłaty", "Inne"],
        "Rachunki/opłaty": ["Elektryczność", "Woda/ogrzewanie", "Internet", "Telefon komórkowy", "Kablówka", "Podatki", "Ubezpieczenia", "Inne"],
        "Subskrypcje": ["Muzyka", "Filmy", "Aplikacje", "Audiobooki", "Książki", "Seriale", "YouTube"],
        "Jedzenie na mieście": ["Restauracje", "Dowóz", "Catering/Pudełka"],
        "Różne": ["Praca", "Różne"],
        "Edukacja": ["Studia", "Edukacja"],
        "Prezenty": [],
        "Komunikacja": []
    },
    income: {
        "Wynagrodzenie": ["Podstawa", "Prowizja", "Nagroda", "Delegacja", "Socjal"],
        "Inne": []
    }
};

let appState = {
    currentType: 'expense',
    selectedMainCategory: '',
    selectedSubCategory: '',
    transactions: [],
    loan: { totalAmount: 500000.00, currentCapitalLeft: 412500.00, interestRate: 6.75 },
    investments: [{ ticker: 'VWCE.DE', name: 'Vanguard FTSE All-World', quantity: 45, purchasePrice: 104.20, currentPriceManual: 118.50, currency: 'EUR' }]
};

let editingTxIndex = null;
let activeChartCategory = null;
let dashboardChartInstance = null;

const categoryColorsLight = {
    'Zakupy': '#c0264a', 'Dom': '#6d28d9', 'Osobista': '#be185d', 'Przyjemności': '#c2410c',
    'Samochód': '#0369a1', 'Rachunki/opłaty': '#4338ca', 'Subskrypcje': '#4f46e5',
    'Jedzenie na mieście': '#a16207', 'Różne': '#334155', 'Edukacja': '#0f766e',
    'Prezenty': '#b91c1c', 'Komunikacja': '#1d4ed8', 'Długi': '#9a3412',
    'Wynagrodzenie': '#15803d', 'Inne': '#475569'
};

const categoryColorsDark = {
    'Zakupy': '#93c5fd', 'Dom': '#c4b5fd', 'Osobista': '#f9a8d4', 'Przyjemności': '#fdba74',
    'Samochód': '#67e8f9', 'Rachunki/opłaty': '#a5b4fc', 'Subskrypcje': '#a5b4fc',
    'Jedzenie na mieście': '#fcd34d', 'Różne': '#94a3b8', 'Edukacja': '#5eead4',
    'Prezenty': '#fca5a5', 'Komunikacja': '#7dd3fc', 'Długi': '#fdba74',
    'Wynagrodzenie': '#6ee7b7', 'Inne': '#9ca3af'
};

const chartCategoryColorsLight = {
    'Zakupy': '#C81E1E', 'Dom': '#6B21A8', 'Osobista': '#BE185D', 'Przyjemności': '#C2410C',
    'Samochód': '#0369A1', 'Rachunki/opłaty': '#1D4ED8', 'Subskrypcje': '#5B21B6',
    'Jedzenie na mieście': '#A16207', 'Różne': '#475569', 'Edukacja': '#0F766E',
    'Prezenty': '#9F1239', 'Komunikacja': '#0E7490', 'Długi': '#92400E',
    'Wynagrodzenie': '#15803D', 'Inne': '#57534E'
};

const chartCategoryColorsDark = {
    'Zakupy': '#FF6B6B', 'Dom': '#C084FC', 'Osobista': '#F472B6', 'Przyjemności': '#FB923C',
    'Samochód': '#38BDF8', 'Rachunki/opłaty': '#60A5FA', 'Subskrypcje': '#A78BFA',
    'Jedzenie na mieście': '#FDE047', 'Różne': '#CBD5E1', 'Edukacja': '#2DD4BF',
    'Prezenty': '#FB7185', 'Komunikacja': '#22D3EE', 'Długi': '#FBBF24',
    'Wynagrodzenie': '#4ADE80', 'Inne': '#A8A29E'
};

function isLightTheme() {
    const forced = document.documentElement.getAttribute('data-theme');
    if (forced === 'light') return true;
    if (forced === 'dark') return false;
    return !window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getThemeCssVar(name, lightFallback, darkFallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (value) return value;
    return isLightTheme() ? lightFallback : darkFallback;
}

function getCategoryColor(category) {
    const palette = isLightTheme() ? categoryColorsLight : categoryColorsDark;
    return palette[category] || (isLightTheme() ? '#5b4fe8' : '#93c5fd');
}

function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h);
}

function generateDistinctHslColors(count, seed) {
    const light = isLightTheme();
    const colors = [];
    const goldenAngle = 137.508;
    const baseHue = hashString(seed) % 360;
    for (let i = 0; i < count; i++) {
        const hue = (baseHue + i * goldenAngle) % 360;
        colors.push(`hsl(${Math.round(hue)}, ${light ? 78 : 72}%, ${light ? 38 : 56}%)`);
    }
    return colors;
}

function getChartBorderColor() {
    return isLightTheme() ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 10, 12, 0.9)';
}

function getChartSliceColors(labels) {
    const chartMap = isLightTheme() ? chartCategoryColorsLight : chartCategoryColorsDark;
    if (!activeChartCategory) {
        const fallback = generateDistinctHslColors(labels.length, labels.join('|'));
        return labels.map((label, i) => chartMap[label] || fallback[i]);
    }
    return generateDistinctHslColors(labels.length, `${activeChartCategory}|${labels.join('|')}`);
}

const ONBOARDING_SLIDES = [
    { title: 'Witaj w Finanse', text: 'Twój osobisty portfel — prosty, elegancki i zawsze pod ręką.' },
    { title: 'Synchronizacja live', text: 'Dane trafiają do chmury i są dostępne na telefonie oraz komputerze.' },
    { title: 'Kategorie po Twojemu', text: 'Uporządkowane kategorie z Money Pro — dostosowane pod Ciebie.' }
];

function hapticFeedback() {
    if (navigator.vibrate) navigator.vibrate(12);
}

function formatDateGroup(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Dzisiaj';
    if (d.toDateString() === yesterday.toDateString()) return 'Wczoraj';
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function initOnboarding() {
    if (localStorage.getItem('onboarding_done')) return;
    const overlay = document.getElementById('onboarding');
    let step = 0;
    const titleEl = document.getElementById('onboarding-title');
    const textEl = document.getElementById('onboarding-text');
    const dots = document.querySelectorAll('#onboarding-dots span');
    const btnNext = document.getElementById('onboarding-next');
    const btnSkip = document.getElementById('onboarding-skip');

    function showStep(i) {
        titleEl.textContent = ONBOARDING_SLIDES[i].title;
        textEl.textContent = ONBOARDING_SLIDES[i].text;
        dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        btnNext.textContent = i === ONBOARDING_SLIDES.length - 1 ? 'Zaczynamy' : 'Dalej';
    }

    function close() {
        overlay.classList.add('hidden');
        localStorage.setItem('onboarding_done', '1');
    }

    overlay.classList.remove('hidden');
    showStep(0);
    btnSkip.onclick = close;
    btnNext.onclick = () => {
        step++;
        if (step >= ONBOARDING_SLIDES.length) close();
        else showStep(step);
    };
}

function attachSwipeDelete(row, index) {
    let startX = 0;
    let currentX = 0;
    let swiped = false;
    row.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; swiped = false; }, { passive: true });
    row.addEventListener('touchmove', (e) => {
        currentX = e.touches[0].clientX - startX;
        if (currentX < -20) {
            row.classList.add('swiping');
            row.style.transform = `translateX(${Math.max(currentX, -80)}px)`;
        }
    }, { passive: true });
    row.addEventListener('touchend', () => {
        if (currentX < -60) {
            swiped = true;
            deleteTransaction(index);
        }
        row.classList.remove('swiping');
        row.style.transform = '';
        startX = currentX = 0;
    });
    row.addEventListener('click', () => {
        if (swiped) { swiped = false; return; }
        editTransaction(index);
    });
}

function getBasePath() {
    const parts = location.pathname.split('/').filter(Boolean);
    const repoIndex = parts.indexOf('Portfel-PWA');
    if (repoIndex >= 0) {
        return '/' + parts.slice(0, repoIndex + 1).join('/');
    }
    return '';
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const base = getBasePath();
    const swUrl = `${base}/sw.js`;
    const scope = base ? `${base}/` : '/';
    navigator.serviceWorker.register(swUrl, { scope }).catch(err => console.error('SW registration failed:', err));
}

function dismissModuleSplitBanner() {
    localStorage.setItem(MODULE_SPLIT_BANNER_KEY, String(Date.now()));
    document.getElementById('module-split-banner').classList.add('hidden');
}

function showModuleSplitAlert(lineCount) {
    const thresholdEl = document.getElementById('module-split-threshold');
    const linesEl = document.getElementById('module-split-lines');
    const notice = document.getElementById('module-split-notice');
    const banner = document.getElementById('module-split-banner');
    const bannerText = document.getElementById('module-split-banner-text');

    if (thresholdEl) thresholdEl.textContent = String(MODULE_SPLIT_LINE_THRESHOLD);
    if (linesEl) linesEl.textContent = String(lineCount);
    if (notice) notice.classList.remove('hidden');
    if (bannerText) {
        bannerText.textContent = `app.js ma ${lineCount} linii (próg: ${MODULE_SPLIT_LINE_THRESHOLD}). Czas podzielić kod na moduły w folderze js/.`;
    }

    console.warn(`[Finanse] app.js: ${lineCount} linii — próg ${MODULE_SPLIT_LINE_THRESHOLD}. Rozważ podział na moduły js/.`);

    const dismissedAt = Number(localStorage.getItem(MODULE_SPLIT_BANNER_KEY) || 0);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    if (banner && (!dismissedAt || Date.now() - dismissedAt > weekMs)) {
        banner.classList.remove('hidden');
    }
}

async function checkModuleSplitThreshold() {
    try {
        const res = await fetch(`${getBasePath()}/app.js`, { cache: 'no-store' });
        if (!res.ok) return;
        const lineCount = (await res.text()).split('\n').length;
        if (lineCount >= MODULE_SPLIT_LINE_THRESHOLD) {
            showModuleSplitAlert(lineCount);
        }
    } catch {
        /* offline lub cache — pomijamy */
    }
}

function initData() {
    if (localStorage.getItem(STORAGE_KEY)) {
        appState = JSON.parse(localStorage.getItem(STORAGE_KEY));
        checkAndProcessRecurringTransactions();
        refreshCurrentView();
    }

    stateRef.onSnapshot((docSnap) => {
        const statusEl = document.getElementById('sync-status');
        if (docSnap.exists) {
            appState = docSnap.data();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    stateRef.set(appState).then(() => {
        document.getElementById('sync-status').className = 'online';
    }).catch(err => {
        console.log("Zapisano offline. Zsynchronizuje się później.", err);
        document.getElementById('sync-status').className = 'offline';
    });
}

function refreshCurrentView() {
    if (document.getElementById('view-dashboard').classList.contains('active')) renderDashboard();
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

function switchView(viewId, title, element) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    document.getElementById('view-title').innerText = title;
    if (element) element.classList.add('active');

    if (viewId === 'dashboard') renderDashboard();
    if (viewId === 'investments') renderInvestments();
    if (viewId === 'loans') renderLoans();

    if (viewId === 'add' && editingTxIndex === null) {
        document.getElementById('form-header').innerText = 'Nowa Transakcja';
        document.getElementById('btn-cancel-edit').style.display = 'none';
        document.getElementById('recurring-wrapper').style.display = 'flex';
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-note').value = '';
        document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('tx-recurring').checked = false;
        setTransactionType('expense');
    }
}

function setTransactionType(type) {
    appState.currentType = type;
    document.getElementById('btn-expense').classList.toggle('active', type === 'expense');
    document.getElementById('btn-income').classList.toggle('active', type === 'income');
    appState.selectedMainCategory = '';
    appState.selectedSubCategory = '';
    document.getElementById('sub-category-wrapper').style.display = 'none';
    renderMainCategoriesForm();
}

function renderMainCategoriesForm() {
    const grid = document.getElementById('main-category-grid');
    grid.innerHTML = '';
    Object.keys(categoryTree[appState.currentType]).forEach(cat => {
        const item = document.createElement('div');
        item.className = 'grid-item';
        item.innerText = cat;
        if (appState.selectedMainCategory === cat) item.classList.add('selected');
        item.onclick = () => selectMainCategoryForm(cat, item);
        grid.appendChild(item);
    });
    if (appState.selectedMainCategory) renderSubCategoriesForm(appState.selectedMainCategory);
}

function selectMainCategoryForm(cat, element) {
    document.querySelectorAll('#main-category-grid .grid-item').forEach(i => i.classList.remove('selected'));
    if (element) element.classList.add('selected');
    appState.selectedMainCategory = cat;
    renderSubCategoriesForm(cat);
}

function renderSubCategoriesForm(cat) {
    const subs = categoryTree[appState.currentType][cat];
    const subWrapper = document.getElementById('sub-category-wrapper');
    const subGrid = document.getElementById('sub-category-grid');
    if (subs.length === 0) {
        subWrapper.style.display = 'none';
        appState.selectedSubCategory = '[Bez podkategorii]';
    } else {
        subGrid.innerHTML = '';
        subs.forEach(sub => {
            const item = document.createElement('div');
            item.className = 'grid-item';
            item.innerText = sub;
            if (appState.selectedSubCategory === sub) item.classList.add('selected');
            item.onclick = () => {
                document.querySelectorAll('#sub-category-grid .grid-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                appState.selectedSubCategory = sub;
            };
            subGrid.appendChild(item);
        });
        subWrapper.style.display = 'block';
    }
}

function saveTransaction() {
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value;
    const note = document.getElementById('tx-note').value;
    const isRecurring = document.getElementById('tx-recurring').checked;

    if (!amount || !appState.selectedMainCategory || !appState.selectedSubCategory || !date) {
        return alert('Uzupełnij kwotę i kategorie.');
    }

    const txData = {
        amount,
        type: appState.currentType,
        mainCategory: appState.selectedMainCategory,
        subCategory: appState.selectedSubCategory,
        date,
        note
    };

    if (editingTxIndex !== null) {
        if (appState.transactions[editingTxIndex].recurringId) {
            txData.recurringId = appState.transactions[editingTxIndex].recurringId;
        }
        appState.transactions[editingTxIndex] = txData;
        editingTxIndex = null;
    } else {
        if (isRecurring) txData.recurringId = 'rec_' + Date.now();
        appState.transactions.unshift(txData);
    }
    appState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    saveState();
    hapticFeedback();
    switchView('dashboard', 'Kokpit', document.querySelectorAll('.nav-item')[0]);
}

function editTransaction(index) {
    const tx = appState.transactions[index];
    editingTxIndex = index;
    document.getElementById('form-header').innerText = 'Edytuj Transakcję';
    document.getElementById('btn-cancel-edit').style.display = 'block';
    document.getElementById('recurring-wrapper').style.display = 'none';
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-note').value = tx.note || '';
    appState.selectedMainCategory = tx.mainCategory;
    appState.selectedSubCategory = tx.subCategory;
    setTransactionType(tx.type);
    switchView('add', 'Edytuj', document.querySelectorAll('.nav-item')[1]);
}

function deleteTransaction(index) {
    if (confirm('Na pewno usunąć?')) {
        appState.transactions.splice(index, 1);
        saveState();
        renderDashboard();
    }
}

function cancelEdit() {
    editingTxIndex = null;
    switchView('dashboard', 'Kokpit', document.querySelectorAll('.nav-item')[0]);
}

function handleDashboardPeriodChange() {
    const period = document.getElementById('dashboard-period-select').value;
    document.getElementById('dashboard-custom-dates').style.display = period === 'custom' ? 'flex' : 'none';
    renderDashboard();
}

function getDashboardDates() {
    const period = document.getElementById('dashboard-period-select').value;
    let startDate, endDate;
    const now = new Date();
    if (period === 'current-month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (period === 'previous-month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    } else if (period === 'current-year') {
        startDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
    } else {
        startDate = document.getElementById('db-start-date').value || '1970-01-01';
        endDate = document.getElementById('db-end-date').value || '2099-12-31';
    }
    return { startDate, endDate };
}

function resetDashboardChart() {
    activeChartCategory = null;
    renderDashboard();
}

function renderDashboard() {
    const { startDate, endDate } = getDashboardDates();
    const searchQuery = document.getElementById('db-search').value.toLowerCase().trim();
    const dateFilteredTx = appState.transactions.filter(t => t.date >= startDate && t.date <= endDate);

    const totalIncomes = dateFilteredTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = dateFilteredTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netBalance = totalIncomes - totalExpenses;

    document.getElementById('db-total-incomes').innerText = `${totalIncomes.toFixed(2)} zł`;
    document.getElementById('db-total-expenses').innerText = `${totalExpenses.toFixed(2)} zł`;
    const netEl = document.getElementById('db-net-balance');
    netEl.innerText = `${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)} zł`;
    netEl.style.color = netBalance >= 0 ? '#6ee7b7' : '#fca5a5';

    const fillEl = document.getElementById('budget-progress-fill');
    if (totalIncomes > 0) {
        const pct = Math.min((totalExpenses / totalIncomes) * 100, 100);
        fillEl.style.width = `${pct}%`;
        fillEl.style.background = pct >= 100 ? 'var(--danger)' : 'var(--accent)';
    } else {
        fillEl.style.width = totalExpenses > 0 ? '100%' : '0%';
        fillEl.style.background = 'var(--danger)';
    }

    let displayTx = dateFilteredTx;
    if (searchQuery) {
        displayTx = displayTx.filter(t =>
            t.mainCategory.toLowerCase().includes(searchQuery) ||
            t.subCategory.toLowerCase().includes(searchQuery) ||
            (t.note && t.note.toLowerCase().includes(searchQuery)) ||
            t.amount.toString().includes(searchQuery)
        );
    }

    const expensesForChart = displayTx.filter(t => t.type === 'expense');
    const catSums = {};
    document.getElementById('btn-reset-chart').style.display = activeChartCategory ? 'block' : 'none';
    document.getElementById('chart-title').innerText = activeChartCategory ? `Struktura: ${activeChartCategory}` : 'Struktura wydatków';

    if (!activeChartCategory) {
        expensesForChart.forEach(t => { catSums[t.mainCategory] = (catSums[t.mainCategory] || 0) + t.amount; });
    } else {
        const drilledExpenses = expensesForChart.filter(t => t.mainCategory === activeChartCategory);
        drilledExpenses.forEach(t => {
            const label = t.subCategory === '[Bez podkategorii]' ? 'Ogólne' : t.subCategory;
            catSums[label] = (catSums[label] || 0) + t.amount;
        });
        displayTx = displayTx.filter(t => t.mainCategory === activeChartCategory);
    }

    const ctxDash = document.getElementById('dashboardChart').getContext('2d');
    if (dashboardChartInstance) dashboardChartInstance.destroy();

    if (Object.keys(catSums).length > 0) {
        const chartLabels = Object.keys(catSums);
        const sliceColors = getChartSliceColors(chartLabels);
        const borderColor = getChartBorderColor();
        const legendTextColor = getThemeCssVar('--text', '#0f172a', '#f5f5f5');

        dashboardChartInstance = new Chart(ctxDash, {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: Object.values(catSums),
                    backgroundColor: sliceColors,
                    borderColor: borderColor,
                    borderWidth: 3,
                    borderRadius: 5,
                    spacing: 2,
                    hoverOffset: 10,
                    hoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                cutout: '58%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            boxWidth: 14,
                            boxHeight: 10,
                            padding: 14,
                            font: { size: 12, weight: '600', family: 'DM Sans' },
                            color: legendTextColor,
                            generateLabels(chart) {
                                const ds = chart.data.datasets[0];
                                return chart.data.labels.map((label, i) => ({
                                    text: label,
                                    fillStyle: ds.backgroundColor[i],
                                    strokeStyle: borderColor,
                                    lineWidth: 2,
                                    fontColor: legendTextColor,
                                    color: legendTextColor,
                                    hidden: !chart.getDataVisibility(i),
                                    index: i,
                                    pointStyle: 'rectRounded'
                                }));
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: isLightTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(0, 0, 0, 0.88)',
                        titleFont: { family: 'DM Sans', weight: '700' },
                        bodyFont: { family: 'DM Sans', weight: '600' },
                        padding: 12,
                        cornerRadius: 10
                    }
                },
                onClick: (event, elements, chart) => {
                    if (elements[0] && !activeChartCategory) {
                        activeChartCategory = chart.data.labels[elements[0].index];
                        renderDashboard();
                    }
                }
            }
        });
    }

    const list = document.getElementById('recent-transactions-list');
    list.innerHTML = '';

    if (displayTx.length === 0) {
        list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg><p>Brak transakcji w tym okresie</p></div>`;
        return;
    }

    let lastGroup = '';
    displayTx.forEach(t => {
        const group = formatDateGroup(t.date);
        if (group !== lastGroup) {
            const label = document.createElement('div');
            label.className = 'tx-group-label';
            label.textContent = group;
            list.appendChild(label);
            lastGroup = group;
        }

        const globalIndex = appState.transactions.indexOf(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const isRec = t.recurringId ? '<span class="tx-badge">&#10227;</span>' : '';
        const color = getCategoryColor(t.mainCategory);
        const row = document.createElement('div');
        row.className = 'tx-row';
        row.innerHTML = `
            <div class="tx-dot" style="background:${color}"></div>
            <div class="tx-info">
                <div class="tx-title">${title}${isRec}</div>
                <div class="tx-meta">${t.mainCategory}</div>
                ${t.note ? `<div class="tx-note">${t.note}</div>` : ''}
            </div>
            <div class="tx-amount-col">
                <div class="tx-amount ${t.type}">${t.type === 'expense' ? '-' : '+'}${t.amount.toFixed(2)} zł</div>
            </div>
            <div class="tx-swipe-hint">Usuń</div>`;
        attachSwipeDelete(row, globalIndex);
        list.appendChild(row);
    });
}

function renderInvestments() {
    const list = document.getElementById('assets-list');
    const select = document.getElementById('update-asset-select');
    list.innerHTML = '';
    select.innerHTML = '';
    let totalValuePLN = 0;
    const FIXED_EUR_PLN = 4.32;
    appState.investments.forEach((asset, idx) => {
        const currentVal = asset.quantity * asset.currentPriceManual;
        const costVal = asset.quantity * asset.purchasePrice;
        const profitPct = ((currentVal - costVal) / costVal) * 100;
        totalValuePLN += asset.currency === 'EUR' ? currentVal * FIXED_EUR_PLN : currentVal;
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `<div class="tx-info"><div style="font-weight:700; font-size:0.95rem;">${asset.ticker}</div><div style="font-size:0.75rem; color:var(--text-muted);">${asset.name}</div><div style="font-size:0.75rem; color:var(--text-muted);">${asset.quantity} szt. • Średnia: ${asset.purchasePrice.toFixed(2)} ${asset.currency}</div></div><div style="text-align:right;"><div style="font-weight:700; font-size:0.95rem;">${currentVal.toFixed(2)} ${asset.currency}</div><div style="font-size:0.8rem; font-weight:700; color:${profitPct >= 0 ? 'var(--success)' : 'var(--danger)'}">${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%</div></div>`;
        list.appendChild(row);
        const opt = document.createElement('option');
        opt.value = idx;
        opt.innerText = asset.ticker;
        select.appendChild(opt);
    });
    document.getElementById('portfolio-value').innerText = `${totalValuePLN.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN`;
}

function updateAssetPriceManual() {
    const idx = document.getElementById('update-asset-select').value;
    const newPrice = parseFloat(document.getElementById('update-asset-price').value);
    if (!newPrice || newPrice <= 0) return;
    appState.investments[idx].currentPriceManual = newPrice;
    saveState();
    document.getElementById('update-asset-price').value = '';
    renderInvestments();
}

function renderLoans() {
    const loan = appState.loan;
    document.getElementById('loan-left').innerText = `${loan.currentCapitalLeft.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł`;
    document.getElementById('loan-rate').innerText = `${loan.interestRate}%`;
    const paidPct = ((loan.totalAmount - loan.currentCapitalLeft) / loan.totalAmount) * 100;
    document.getElementById('loan-progress-fill').style.width = `${paidPct}%`;
}

function addLoanOverpayment() {
    const amount = parseFloat(document.getElementById('loan-overpayment-amount').value);
    if (!amount || amount <= 0) return;
    appState.loan.currentCapitalLeft -= amount;
    appState.transactions.unshift({
        amount,
        type: 'expense',
        mainCategory: 'Długi',
        subCategory: 'Kredyt Pekao SA',
        date: new Date().toISOString().split('T')[0],
        note: 'Dodatkowa nadpłata kapitału'
    });
    saveState();
    document.getElementById('loan-overpayment-amount').value = '';
    renderLoans();
}

function getExportPayload() {
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactionCount: appState.transactions.length,
        data: JSON.parse(JSON.stringify(appState))
    };
}

function applyBackupPayload(payload) {
    const data = payload.data || payload;
    if (!data || !Array.isArray(data.transactions)) {
        throw new Error('Nieprawidłowy plik kopii zapasowej.');
    }
    appState = data;
    saveState();
    refreshCurrentView();
}

function showSettingsToast(message) {
    const toast = document.getElementById('settings-toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2800);
}

function setTheme(mode) {
    localStorage.setItem(THEME_KEY, mode);
    const html = document.documentElement;
    if (mode === 'auto') {
        html.removeAttribute('data-theme');
    } else {
        html.setAttribute('data-theme', mode);
    }
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === mode);
    });
    updateThemeColorMeta();
    refreshCurrentView();
}

function updateThemeColorMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const forced = document.documentElement.getAttribute('data-theme');
    const isDark = forced === 'dark' || (!forced && window.matchMedia('(prefers-color-scheme: dark)').matches);
    meta.content = isDark ? '#0a0a0a' : '#e4eaf4';
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'auto';
    setTheme(saved);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') updateThemeColorMeta();
    });
}

async function refreshBackupInfo() {
    const infoEl = document.getElementById('backup-cloud-info');
    try {
        const snap = await cloudBackupRef.get();
        if (snap.exists && snap.data().exportedAt) {
            const date = new Date(snap.data().exportedAt).toLocaleString('pl-PL');
            const count = snap.data().transactionCount || snap.data().data?.transactions?.length || '?';
            infoEl.textContent = `Ostatnia kopia w chmurze: ${date} (${count} transakcji)`;
        } else {
            infoEl.textContent = 'Kopia w chmurze: brak zapisanej kopii';
        }
    } catch {
        infoEl.textContent = 'Kopia w chmurze: niedostępna (sprawdź połączenie)';
    }
    const localRaw = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (localRaw) {
        try {
            const local = JSON.parse(localRaw);
            infoEl.textContent += `\nKopia lokalna: ${new Date(local.exportedAt).toLocaleString('pl-PL')}`;
        } catch { /* ignore */ }
    }
}

function openSettings() {
    document.getElementById('settings-overlay').classList.remove('hidden');
    const saved = localStorage.getItem(THEME_KEY) || 'auto';
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === saved);
    });
    refreshBackupInfo();
}

function closeSettings() {
    document.getElementById('settings-overlay').classList.add('hidden');
}

async function backupToCloud() {
    try {
        const payload = getExportPayload();
        await cloudBackupRef.set(payload);
        showSettingsToast('Kopia wysłana do chmury');
        refreshBackupInfo();
        hapticFeedback();
    } catch (err) {
        alert('Nie udało się wysłać kopii do chmury. Opublikuj zaktualizowane reguły Firestore (cloud_backup).');
        console.error(err);
    }
}

function backupToPhone() {
    const payload = getExportPayload();
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(payload));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finanse-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showSettingsToast('Kopia zapisana na telefonie');
    hapticFeedback();
}

async function restoreFromCloud() {
    try {
        const snap = await cloudBackupRef.get();
        if (!snap.exists) return alert('Brak kopii zapasowej w chmurze.');
        const payload = snap.data();
        const count = payload.transactionCount || payload.data?.transactions?.length || 0;
        if (!confirm(`Przywrócić kopię z chmury (${count} transakcji)? Obecne dane zostaną zastąpione.`)) return;
        applyBackupPayload(payload);
        showSettingsToast('Przywrócono kopię z chmury');
        refreshBackupInfo();
        hapticFeedback();
    } catch (err) {
        alert('Nie udało się pobrać kopii z chmury.');
        console.error(err);
    }
}

function restoreFromPhoneFile() {
    document.getElementById('backup-file-input').click();
}

function handleBackupFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const payload = JSON.parse(reader.result);
            const count = payload.transactionCount || payload.data?.transactions?.length || 0;
            if (!confirm(`Przywrócić kopię z pliku (${count} transakcji)? Obecne dane zostaną zastąpione.`)) return;
            applyBackupPayload(payload);
            localStorage.setItem(LOCAL_BACKUP_KEY, reader.result);
            showSettingsToast('Przywrócono kopię z pliku');
            refreshBackupInfo();
            hapticFeedback();
        } catch (err) {
            alert('Nieprawidłowy plik kopii zapasowej.');
            console.error(err);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
renderMainCategoriesForm();
initTheme();
initOnboarding();
initData();
registerServiceWorker();
checkModuleSplitThreshold();
