const APP_VIEW_SHORTCUTS = {
    dashboard: { title: 'Pulpit', navIndex: 0 },
    add: { title: 'Dodaj', navIndex: 1 },
    reports: { title: 'Analiza', navIndex: 2 },
    investments: { title: 'Aktywa', navIndex: 3 },
    loans: { title: 'Długi', navIndex: 4 }
};

function getAppLaunchView() {
    const view = new URLSearchParams(window.location.search).get('view')?.trim().toLowerCase();
    return view && APP_VIEW_SHORTCUTS[view] ? view : null;
}

function getAppLaunchAddType() {
    const type = new URLSearchParams(window.location.search).get('type')?.trim().toLowerCase();
    return type === 'income' || type === 'expense' ? type : null;
}

function clearAppLaunchParams() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('view') && !url.searchParams.has('type')) return;
    url.searchParams.delete('view');
    url.searchParams.delete('type');
    const next = `${url.pathname}${url.search}${url.hash}`;
    history.replaceState(null, '', next);
}

function applyAppLaunchShortcut() {
    const view = getAppLaunchView();
    if (!view || typeof switchView !== 'function') return false;

    if (typeof isAppLockRestricted === 'function' && isAppLockRestricted() && view !== 'add') {
        if (typeof requestAppLockUnlockPrompt === 'function') requestAppLockUnlockPrompt();
        clearAppLaunchParams();
        return false;
    }

    const addType = view === 'add' ? getAppLaunchAddType() : null;
    const cfg = APP_VIEW_SHORTCUTS[view];
    const nav = document.querySelectorAll('.nav-item')[cfg.navIndex];

    clearAppLaunchParams();
    switchView(view, cfg.title, nav || null);

    if (addType && typeof setFormMode === 'function') {
        setFormMode(addType);
    }

    return true;
}
