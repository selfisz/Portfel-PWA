/* Reset filtrów widoku (okres, symulacje) po bezczynności — bez dotykania danych i formularza Dodaj. */

function clearEphemeralAnalysisPrefs() {
    try {
        localStorage.removeItem('analysis_period_mode');
        localStorage.removeItem('analysis_compare_preset');
    } catch {
        /* ignore */
    }
}

function resetSurplusAllocatorInput() {
    const inputEl = document.getElementById('reports-surplus-input');
    if (!inputEl) return;
    delete inputEl.dataset.touched;
    delete inputEl.dataset.periodKey;
    inputEl.value = '';
}

function resetEphemeralUiState(options = {}) {
    const silent = options.silent === true;

    clearEphemeralAnalysisPrefs();

    if (typeof resetDashboardPeriod === 'function') {
        resetDashboardPeriod();
    } else {
        const periodSelect = document.getElementById('dashboard-period-select');
        if (periodSelect) periodSelect.value = 'current-month';
        const customDates = document.getElementById('dashboard-custom-dates');
        if (customDates) customDates.style.display = 'none';
        if (typeof updateDashboardPeriodResetVisibility === 'function') updateDashboardPeriodResetVisibility();
    }

    const search = document.getElementById('db-search');
    if (search) search.value = '';

    resetSurplusAllocatorInput();

    if (typeof resetReportsPeriod === 'function') {
        resetReportsPeriod();
    } else if (typeof applyReportsPeriodDefaults === 'function') {
        applyReportsPeriodDefaults();
        if (typeof renderReports === 'function') renderReports();
    }

    if (!silent && typeof showAppToast === 'function') {
        showAppToast('Przywrócono bieżący miesiąc', 'default');
    }
}

function shouldRunEphemeralIdleReset() {
    if (typeof getAppLockLastActivityTs !== 'function' || typeof APP_LOCK_IDLE_MS === 'undefined') return false;
    const last = getAppLockLastActivityTs();
    if (!last) return false;
    return (Date.now() - last) >= APP_LOCK_IDLE_MS;
}

function runUiIdleActions() {
    const idle = shouldRunEphemeralIdleReset();
    const lock = typeof isAppLockEnabled === 'function'
        && isAppLockEnabled()
        && typeof shouldLockDueToIdle === 'function'
        && shouldLockDueToIdle();

    if (idle) resetEphemeralUiState();

    if (lock && typeof activateAppLockState === 'function') {
        activateAppLockState({ force: true });
        return;
    }

    if (idle && typeof touchAppLockActivity === 'function') {
        touchAppLockActivity();
    }
}
