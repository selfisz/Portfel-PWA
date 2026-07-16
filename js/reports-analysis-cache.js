const REPORTS_ANALYSIS_SECTIONS = ['overview', 'expenses', 'assets', 'debts', 'advanced'];

let reportsContextCacheKey = '';
const reportsRenderedSections = {};

function getReportsContextCacheKey(ctx) {
    if (!ctx) return '';
    const parts = [ctx.mode, ctx.period, ctx.label];
    if (ctx.rangeStart) parts.push(ctx.rangeStart, ctx.rangeEnd);
    if (ctx.periodA) {
        parts.push(ctx.periodA.start, ctx.periodA.end, ctx.periodB.start, ctx.periodB.end);
    }
    return parts.join('|');
}

function getReportsDataFingerprint(ctx) {
    const tx = ctx?.periodTx || [];
    let txTag = tx.length;
    for (const t of tx) {
        txTag += Math.round((Number(t?.amount) || 0) * 100);
        txTag += String(t?.id || '').length * 17;
        txTag += String(t?.category || '').length * 31;
        txTag += String(t?.subCategory || '').length * 13;
    }

    const parts = [txTag];
    if (typeof getLoanSummaryTotal === 'function') {
        parts.push(Math.round(getLoanSummaryTotal() * 100));
    }
    if (typeof getCreditCardDebtTotal === 'function') {
        parts.push(Math.round(getCreditCardDebtTotal() * 100));
    }
    if (typeof getPortfolioValuePln === 'function') {
        parts.push(Math.round(getPortfolioValuePln() * 100));
    }
    if (typeof appState !== 'undefined') {
        parts.push((appState.assets || []).length);
        parts.push((appState.assetSnapshots || []).length);
    }
    return parts.join(':');
}

function getReportsUiStateKey() {
    const parts = [];
    parts.push(typeof isLightTheme === 'function' && isLightTheme() ? 'th:light' : 'th:dark');
    if (typeof reportsViewType !== 'undefined') parts.push(`vt:${reportsViewType}`);
    if (typeof reportsRankLevel !== 'undefined') parts.push(`rl:${reportsRankLevel}`);
    const excluded = typeof appState !== 'undefined' && appState.reportPrefs?.excludedDebtInstallments;
    if (Array.isArray(excluded) && excluded.length) {
        parts.push(`dex:${[...excluded].sort().join(',')}`);
    }
    return parts.join('|');
}

function getReportsRenderCacheKey(ctx) {
    const uiKey = getReportsUiStateKey();
    return `${getReportsContextCacheKey(ctx)}|${getReportsDataFingerprint(ctx)}|${uiKey}`;
}

function getReportsSectionRenderKey(section, ctx) {
    return `${section}|${getReportsRenderCacheKey(ctx)}`;
}

function isReportsSectionCached(section, ctx) {
    return reportsRenderedSections[section] === getReportsSectionRenderKey(section, ctx);
}

function markReportsSectionCached(section, ctx) {
    reportsRenderedSections[section] = getReportsSectionRenderKey(section, ctx);
}

function clearReportsRenderedSections(sections = REPORTS_ANALYSIS_SECTIONS) {
    sections.forEach((section) => {
        delete reportsRenderedSections[section];
    });
}

function invalidateReportsThemeCache() {
    reportsContextCacheKey = '';
    clearReportsRenderedSections();
}

function invalidateReportsContextCacheIfChanged(ctx) {
    const ctxKey = getReportsRenderCacheKey(ctx);
    if (reportsContextCacheKey === ctxKey) return false;
    reportsContextCacheKey = ctxKey;
    clearReportsRenderedSections();
    return true;
}
