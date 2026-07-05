let welcomeModeActive = false;
let welcomePreferDashboardOnExit = true;
let welcomeRestrictedOnAddForm = false;

const WELCOME_TILE_TARGETS = {
    add: { view: 'add', title: 'Dodaj', navIndex: 1 },
    tasks: { special: 'tasks' },
    payments: { view: 'loans', title: 'Długi', navIndex: 4 },
    reports: { view: 'reports', title: 'Analiza', navIndex: 2 }
};

function isWelcomeMode() {
    return welcomeModeActive;
}

function shouldWelcomeGatewayOpenDashboard() {
    return welcomePreferDashboardOnExit;
}

function setWelcomePreferDashboardOnExit(value) {
    welcomePreferDashboardOnExit = !!value;
}

function getWelcomeGatewayView() {
    if (shouldWelcomeGatewayOpenDashboard()) return 'dashboard';
    if (typeof getActiveViewId === 'function') return getActiveViewId() || 'dashboard';
    return 'dashboard';
}

function getWelcomeGreetingName() {
    const user = typeof getCurrentAuthUser === 'function' ? getCurrentAuthUser() : null;
    if (user?.displayName) return user.displayName.trim().split(/\s+/)[0];
    const email = typeof getUserAuthEmail === 'function' ? getUserAuthEmail(user) : '';
    if (email) return email.split('@')[0];
    return null;
}

function getWelcomePeriodTotals() {
    if (typeof getDashboardDates !== 'function') {
        return { totalIncomes: 0, totalExpenses: 0, netBalance: 0 };
    }
    const { startDate, endDate } = getDashboardDates();
    const forecastMode = typeof isDashboardForecastPeriod === 'function' && isDashboardForecastPeriod();
    let totalIncomes;
    let totalExpenses;
    if (forecastMode && typeof getDashboardForecastTotals === 'function') {
        const forecast = getDashboardForecastTotals();
        totalIncomes = forecast.income;
        totalExpenses = forecast.expense;
    } else {
        const dateFilteredTx = appState.transactions.filter((t) => t.date >= startDate && t.date <= endDate);
        totalIncomes = dateFilteredTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        totalExpenses = dateFilteredTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    }
    return {
        totalIncomes,
        totalExpenses,
        netBalance: totalIncomes - totalExpenses
    };
}

function getWelcomePaymentsCount() {
    let count = 0;
    if (typeof getDashboardDates === 'function' && typeof collectDebtInstallmentRows === 'function') {
        const { startDate, endDate } = getDashboardDates();
        count += collectDebtInstallmentRows({ startDate, endDate }).filter((row) => {
            const scheduled = row.scheduledAmount ?? row.amount ?? 0;
            const paid = row.paidAmount ?? 0;
            return scheduled > paid;
        }).length;
    }
    if (typeof getActiveCreditCards === 'function') {
        count += getActiveCreditCards().filter((card) => (card.currentBalance || 0) > 0).length;
    }
    if (typeof getDashboardTodoItems === 'function' && typeof getTodoListById === 'function') {
        count += getDashboardTodoItems().filter((item) => {
            const list = getTodoListById(item.listId);
            return list?.kind === TODO_LIST_KINDS.payments;
        }).length;
    }
    return count;
}

function getWelcomeTasksTileLabel() {
    const openCount = typeof getDashboardTodoItems === 'function' ? getDashboardTodoItems().length : 0;
    if (!openCount) return 'Brak zadań';
    const urgent = typeof getUrgentTodosCount === 'function' ? getUrgentTodosCount() : 0;
    if (urgent > 0) {
        const word = urgent === 1 ? 'pilne' : 'pilnych';
        return `${urgent} ${word}`;
    }
    const word = openCount === 1 ? 'zadanie' : (openCount < 5 ? 'zadania' : 'zadań');
    return `${openCount} ${word}`;
}

function getWelcomeBudgetTileLabel() {
    const { totalIncomes, totalExpenses } = getWelcomePeriodTotals();
    if (totalIncomes <= 0) {
        return totalExpenses > 0 ? 'Wydatki bez wpływów' : 'Brak danych';
    }
    const pct = Math.min(100, Math.round((totalExpenses / totalIncomes) * 100));
    return `${pct}% budżetu`;
}

function getWelcomePaymentsTileLabel() {
    const count = getWelcomePaymentsCount();
    if (!count) return 'Wszystko opłacone';
    const word = count === 1 ? 'pozycja' : (count < 5 ? 'pozycje' : 'pozycji');
    return `${count} ${word}`;
}

function closePanelsForWelcome() {
    if (typeof closeSkrybaPanel === 'function') closeSkrybaPanel();
    if (typeof closeSettings === 'function') closeSettings();
    if (typeof closeNotificationsPanel === 'function') closeNotificationsPanel();
}

function isWelcomeRestrictedGateway() {
    return typeof isAppLockRestricted === 'function'
        && isAppLockRestricted()
        && isWelcomeMode();
}

function renderWelcomeDashboard() {
    const greetingEl = document.getElementById('welcome-greeting');
    const infoEl = document.getElementById('welcome-info');
    const periodEl = document.getElementById('welcome-period');
    const balanceEl = document.getElementById('welcome-balance');
    const pinLink = document.getElementById('btn-welcome-enable-pin');
    const openFullBtn = document.getElementById('btn-welcome-open-full');
    const card = document.getElementById('welcome-dashboard-card');
    if (!greetingEl || !balanceEl) return;

    const restrictedGateway = isWelcomeRestrictedGateway();
    card?.classList.toggle('welcome-dashboard-card--locked', restrictedGateway);

    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Dzień dobry' : (hour < 18 ? 'Cześć' : 'Dobry wieczór');
    const name = getWelcomeGreetingName();
    greetingEl.textContent = name ? `${salutation}, ${name}` : salutation;

    const lockEnabled = typeof isAppLockEnabled === 'function' && isAppLockEnabled();
    if (infoEl) {
        if (restrictedGateway) {
            infoEl.textContent = 'Aplikacja zablokowana — możesz dodać transakcję lub odblokować pełny dostęp.';
        } else if (lockEnabled) {
            infoEl.textContent = 'Odblokowano — wybierz, co chcesz zrobić.';
        } else {
            infoEl.textContent = 'Twoje dane finansowe są na tym urządzeniu. Włącz PIN w ustawieniach, aby chronić dostęp.';
        }
    }
    if (openFullBtn) {
        openFullBtn.textContent = restrictedGateway ? 'Odblokuj aplikację' : 'Otwórz pełną aplikację';
    }
    if (pinLink) {
        pinLink.classList.toggle('hidden', lockEnabled || restrictedGateway);
    }

    const { netBalance } = getWelcomePeriodTotals();
    if (periodEl && typeof formatDashboardPeriodLabel === 'function') {
        periodEl.textContent = formatDashboardPeriodLabel();
    }
    balanceEl.textContent = `${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)} zł`;
    balanceEl.style.color = netBalance >= 0 ? '#6ee7b7' : '#fca5a5';

    const tasksMeta = document.getElementById('welcome-tile-tasks-meta');
    const paymentsMeta = document.getElementById('welcome-tile-payments-meta');
    const reportsMeta = document.getElementById('welcome-tile-reports-meta');
    if (tasksMeta) tasksMeta.textContent = getWelcomeTasksTileLabel();
    if (paymentsMeta) paymentsMeta.textContent = getWelcomePaymentsTileLabel();
    if (reportsMeta) reportsMeta.textContent = getWelcomeBudgetTileLabel();
}

function resolveWelcomeNavItem(navIndex) {
    if (navIndex == null) return null;
    return document.querySelectorAll('.nav-item')[navIndex] || null;
}

function exitWelcomeModeToView(target) {
    const cfg = WELCOME_TILE_TARGETS[target];
    if (!cfg) return false;

    const restricted = typeof isAppLockRestricted === 'function' && isAppLockRestricted();
    if (restricted && target !== 'add') {
        if (typeof requestAppLockUnlockPrompt === 'function') requestAppLockUnlockPrompt();
        return false;
    }

    if (restricted && target === 'add') {
        welcomeRestrictedOnAddForm = true;
        welcomeModeActive = false;
        document.body.classList.remove('welcome-mode');
        document.getElementById('welcome-dashboard')?.classList.add('hidden');
        const nav = document.querySelector('.nav-item[data-nav-view="add"]');
        if (typeof switchView === 'function') {
            switchView('add', 'Dodaj', nav || null, { bypassAppLock: true, bypassWelcome: true });
        }
        return true;
    }

    if (cfg.special === 'tasks') {
        exitWelcomeMode({ silent: true });
        if (typeof openTasksView === 'function') openTasksView();
        return true;
    }
    exitWelcomeMode({
        view: cfg.view,
        title: cfg.title,
        navItem: resolveWelcomeNavItem(cfg.navIndex)
    });
    return true;
}

function enterWelcomeMode(options = {}) {
    if (typeof appLockOverlayVisible !== 'undefined' && appLockOverlayVisible) return;
    if (document.body.classList.contains('auth-locked')) return;

    const restricted = typeof isAppLockRestricted === 'function' && isAppLockRestricted();
    if (restricted && options.reason !== 'locked') return;
    if (!restricted && options.reason === 'locked') return;

    if (options.reason === 'home') {
        setWelcomePreferDashboardOnExit(false);
    } else if (options.reason === 'startup') {
        setWelcomePreferDashboardOnExit(true);
    }

    welcomeRestrictedOnAddForm = false;
    closePanelsForWelcome();
    welcomeModeActive = true;
    document.body.classList.add('welcome-mode');
    document.getElementById('welcome-dashboard')?.classList.remove('hidden');
    renderWelcomeDashboard();
}

function exitWelcomeMode(options = {}) {
    const silent = options.silent === true;
    welcomeModeActive = false;
    document.body.classList.remove('welcome-mode');
    document.getElementById('welcome-dashboard')?.classList.add('hidden');
    document.getElementById('welcome-dashboard-card')?.classList.remove('welcome-dashboard-card--locked');

    if (silent) return;

    if (typeof touchAppLockActivity === 'function') touchAppLockActivity();

    let view = options.view;
    let title = options.title;
    let navItem = options.navItem ?? null;

    if (!view && options.openFull) {
        view = getWelcomeGatewayView();
        const shortcuts = typeof APP_VIEW_SHORTCUTS !== 'undefined' ? APP_VIEW_SHORTCUTS : null;
        if (shortcuts?.[view]) {
            title = shortcuts[view].title;
            navItem = resolveWelcomeNavItem(shortcuts[view].navIndex);
        } else if (view === 'tasks') {
            title = 'Zadania';
        } else if (view === 'dashboard') {
            title = 'Pulpit';
            navItem = resolveWelcomeNavItem(0);
        }
    }

    if (!view) return;

    if (view === 'tasks' && typeof openTasksView === 'function') {
        openTasksView();
        return;
    }

    if (typeof switchView === 'function') {
        switchView(view, title || view, navItem, { bypassWelcome: true });
    }
}

function maybeEnterWelcomeOnStartup() {
    if (typeof isAppLockRestricted === 'function' && isAppLockRestricted()) return;
    if (typeof appLockOverlayVisible !== 'undefined' && appLockOverlayVisible) return;
    if (typeof wasAppLaunchShortcutApplied === 'function' && wasAppLaunchShortcutApplied()) return;
    setWelcomePreferDashboardOnExit(true);
    enterWelcomeMode({ reason: 'startup' });
}

function onWelcomeTileClick(target) {
    exitWelcomeModeToView(target);
}

function onWelcomeOpenFullClick() {
    if (typeof isAppLockRestricted === 'function' && isAppLockRestricted()) {
        if (typeof requestAppLockUnlockPrompt === 'function') requestAppLockUnlockPrompt();
        return;
    }
    exitWelcomeMode({ openFull: true });
}

function onWelcomeEnablePinClick() {
    exitWelcomeMode({ openFull: true });
    if (typeof openSettings === 'function') openSettings('account');
}

function onHeaderHomeClick() {
    if (typeof isWelcomeMode === 'function' && isWelcomeMode()) return;
    if (typeof appLockOverlayVisible !== 'undefined' && appLockOverlayVisible) return;
    if (typeof isAppLockRestricted === 'function' && isAppLockRestricted()) {
        enterWelcomeMode({ reason: 'locked' });
        return;
    }
    enterWelcomeMode({ reason: 'home' });
}

function maybeReturnToWelcomeRestrictedGateway() {
    if (typeof isAppLockRestricted !== 'function' || !isAppLockRestricted()) return;
    if (typeof appLockOverlayVisible !== 'undefined' && appLockOverlayVisible) return;
    if (welcomeRestrictedOnAddForm) return;
    if (typeof enterWelcomeMode === 'function') enterWelcomeMode({ reason: 'locked' });
}

function resetWelcomeRestrictedOnAddForm() {
    welcomeRestrictedOnAddForm = false;
}

function initWelcomeDashboard() {
    if (initWelcomeDashboard._done) return;
    initWelcomeDashboard._done = true;

    document.getElementById('btn-welcome-open-full')?.addEventListener('click', onWelcomeOpenFullClick);
    document.getElementById('btn-welcome-enable-pin')?.addEventListener('click', onWelcomeEnablePinClick);

    document.querySelectorAll('[data-welcome-target]').forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            onWelcomeTileClick(btn.getAttribute('data-welcome-target'));
        });
    });

    const homeBtn = document.getElementById('btn-header-home');
    if (homeBtn && !homeBtn.dataset.bound) {
        homeBtn.dataset.bound = '1';
        homeBtn.addEventListener('click', onHeaderHomeClick);
    }
}
