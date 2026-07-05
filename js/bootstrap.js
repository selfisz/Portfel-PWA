function bootstrapApp() {
    if (bootstrapApp._done) return;
    bootstrapApp._done = true;

    const txDate = document.getElementById('tx-date');
    if (txDate) txDate.value = localIsoDate(new Date());
    renderMainCategoriesForm();
    if (typeof initAddFormUi === 'function') initAddFormUi();
    initOnboarding();
    initPanelHeaders();
    initOverlayCloseIcons();
    initAppActionDelegation();
    if (typeof initCategoryRulesEditor === 'function') initCategoryRulesEditor();
    initData();
    if (typeof initSyncLifecycleListeners === 'function') initSyncLifecycleListeners();
    scheduleMarketPriceRefresh();
    initNotifications();
    if (typeof initTasks === 'function') initTasks();
    if (typeof initSkrybaVoice === 'function') initSkrybaVoice();
    if (typeof initMonthClose === 'function') initMonthClose();
    checkModuleSplitThreshold();
    if (typeof applyAppLaunchShortcut === 'function') applyAppLaunchShortcut();
}
