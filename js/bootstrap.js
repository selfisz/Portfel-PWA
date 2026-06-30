function bootstrapApp() {
    if (bootstrapApp._done) return;
    bootstrapApp._done = true;

    const txDate = document.getElementById('tx-date');
    if (txDate) txDate.value = localIsoDate(new Date());
    renderMainCategoriesForm();
    initOnboarding();
    initPanelHeaders();
    initOverlayCloseIcons();
    initData();
    initCloudSyncListeners();
    scheduleMarketPriceRefresh();
    initNotifications();
    checkModuleSplitThreshold();
}
