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
let reportsStructureChartInstance = null;
let reportsCompareChartInstance = null;
let reportsCompareWealthChartInstance = null;

function destroyChart(chart) {
    if (chart && typeof chart.destroy === 'function') chart.destroy();
}

function clearChartInstance(chart) {
    destroyChart(chart);
    return null;
}
