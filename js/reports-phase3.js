/* Raporty — faza 3 (A–F) */

const ANALYSIS_SECTION_KEY = 'analysis_section';
const ANALYSIS_PERIOD_KEY = 'analysis_period_mode';
let analysisSection = 'overview';
let reportsPeriodMode = 'month';
let analysisUiInitialized = false;

const ANALYSIS_SECTIONS = ['overview', 'expenses', 'assets', 'debts', 'advanced'];
const ANALYSIS_SECTION_ALIASES = {
    calendar: 'expenses',
    charts: 'advanced',
    details: 'expenses'
};
const PERIOD_MODES = ['year', 'month', 'range', 'compare'];
const COMPARE_PRESETS = ['mom', 'yoy', 'same-month', 'custom'];
const ANALYSIS_COMPARE_PRESET_KEY = 'analysis_compare_preset';
let reportsComparePreset = 'mom';
let reportsCompareChartInstance = null;
let reportsCompareWealthChartInstance = null;
let reportsPeriodModeBeforeCompare = null;

let reportsLastCtx = null;
let reportsLastSavingsRate = 0;
let reportsContextCacheKey = '';
const reportsRenderedSections = {};

function normalizeAnalysisSection(section) {
    if (ANALYSIS_SECTIONS.includes(section)) return section;
    return ANALYSIS_SECTION_ALIASES[section] || 'overview';
}

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

function getReportsRenderCacheKey(ctx) {
    return `${getReportsContextCacheKey(ctx)}|${getReportsDataFingerprint(ctx)}`;
}

function setAnalysisSectionLoading(section, loading) {
    document.getElementById(`analysis-section-${section}`)
        ?.classList.toggle('analysis-section--loading', loading);
}

function shiftArrayIndex(items, current, delta) {
    const idx = items.indexOf(current);
    if (idx < 0) return items[0];
    return items[(idx + delta + items.length) % items.length];
}

function attachHorizontalSwipe(el, { onSwipeLeft, onSwipeRight, threshold = 56, dominance = 1.35, ignoreSelector = 'input, select, textarea, a, canvas, .cal-cell' }) {
    if (!el || el.dataset.swipeBound === '1') return;
    el.dataset.swipeBound = '1';
    let startX = 0;
    let startY = 0;
    let tracking = false;

    el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        if (ignoreSelector && e.target.closest(ignoreSelector)) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) < threshold) return;
        if (Math.abs(dx) < Math.abs(dy) * dominance) return;
        el.classList.add('analysis-swipe-flash');
        setTimeout(() => el.classList.remove('analysis-swipe-flash'), 180);
        if (dx < 0) onSwipeLeft?.();
        else onSwipeRight?.();
    }, { passive: true });
}

function shiftAnalysisSection(delta) {
    setAnalysisSection(shiftArrayIndex(ANALYSIS_SECTIONS, analysisSection, delta));
}

function shiftReportsPeriodMode(delta) {
    setReportsPeriodMode(shiftArrayIndex(PERIOD_MODES, reportsPeriodMode, delta));
}

let reportsPeriodMainExpanded = false;
let reportsPeriodSpecialExpanded = false;

function exitCompareMode() {
    const restore = reportsPeriodModeBeforeCompare || 'month';
    reportsPeriodModeBeforeCompare = null;
    collapseReportsPeriodSpecial();
    setReportsPeriodMode(restore);
}

function updateAnalysisCompareChrome(ctx) {
    const isCompare = ctx?.mode === 'compare';
    document.getElementById('analysis-compare-banner')?.classList.toggle('hidden', !isCompare);
    document.getElementById('analysis-sections-body')?.classList.toggle('is-compare', isCompare);
    ANALYSIS_SECTIONS.forEach((section) => {
        const slot = document.getElementById(`analysis-compare-${section}`);
        if (!slot) return;
        slot.hidden = !isCompare;
        slot.setAttribute('aria-hidden', isCompare ? 'false' : 'true');
    });

    const rangeEl = document.getElementById('analysis-compare-banner-range');
    if (rangeEl && isCompare && ctx.periodA && ctx.periodB) {
        rangeEl.textContent = ctx.compareBanner || getComparePeriodLabels(ctx).banner;
    } else if (rangeEl) {
        rangeEl.textContent = '';
    }

    document.getElementById('reports-period-main-block')?.classList.toggle('hidden', isCompare);
}

function collapseReportsPeriodSpecial() {
    reportsPeriodSpecialExpanded = false;
    document.getElementById('reports-period-special-panel')?.classList.add('hidden');
    document.querySelector('#reports-period-special-block .loans-hero-summary-toggle')
        ?.setAttribute('aria-expanded', 'false');
}

function confirmReportsSpecialPeriod() {
    if (reportsPeriodMode === 'compare') {
        syncCompareDatesFromPreset();
        const aStart = document.getElementById('reports-compare-a-start')?.value;
        const aEnd = document.getElementById('reports-compare-a-end')?.value;
        const bStart = document.getElementById('reports-compare-b-start')?.value;
        const bEnd = document.getElementById('reports-compare-b-end')?.value;
        if (!aStart || !aEnd || !bStart || !bEnd) return;
    } else if (reportsPeriodMode === 'range') {
        const start = document.getElementById('reports-range-start')?.value;
        const end = document.getElementById('reports-range-end')?.value;
        if (!start || !end) return;
    } else {
        return;
    }
    renderReports();
    collapseReportsPeriodSpecial();
}

function isReportsSpecialPeriodComplete() {
    if (reportsPeriodMode === 'compare') {
        syncCompareDatesFromPreset();
        return Boolean(
            document.getElementById('reports-compare-a-start')?.value
            && document.getElementById('reports-compare-a-end')?.value
            && document.getElementById('reports-compare-b-start')?.value
            && document.getElementById('reports-compare-b-end')?.value
        );
    }
    if (reportsPeriodMode === 'range') {
        return Boolean(
            document.getElementById('reports-range-start')?.value
            && document.getElementById('reports-range-end')?.value
        );
    }
    return false;
}

function collapseReportsPeriodPanels() {
    reportsPeriodMainExpanded = false;
    reportsPeriodSpecialExpanded = false;
    document.getElementById('reports-period-main-panel')?.classList.add('hidden');
    document.getElementById('reports-period-special-panel')?.classList.add('hidden');
    document.querySelector('#reports-period-main-block .loans-hero-summary-toggle')
        ?.setAttribute('aria-expanded', 'false');
    document.querySelector('#reports-period-special-block .loans-hero-summary-toggle')
        ?.setAttribute('aria-expanded', 'false');
}

function isReportsPeriodDefault() {
    if (reportsPeriodMode === 'compare') return false;
    if (reportsPeriodMode !== 'month') return false;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return getReportsMonthValue() === currentMonth;
}

function updateReportsPeriodResetVisibility() {
    document.getElementById('reports-period-reset')
        ?.classList.toggle('hidden', isReportsPeriodDefault());
}

function resetReportsPeriod() {
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const yearSelect = document.getElementById('reports-year-select');
    if (yearSelect) yearSelect.value = currentYear;
    applyReportsPeriodDefaults();
    collapseReportsPeriodPanels();
    setReportsPeriodMode('month');
}

function toggleReportsPeriodMain() {
    reportsPeriodMainExpanded = !reportsPeriodMainExpanded;
    const panel = document.getElementById('reports-period-main-panel');
    const toggle = document.querySelector('#reports-period-main-block .loans-hero-summary-toggle');
    if (panel) panel.classList.toggle('hidden', !reportsPeriodMainExpanded);
    if (toggle) toggle.setAttribute('aria-expanded', reportsPeriodMainExpanded ? 'true' : 'false');
}

function toggleReportsPeriodSpecial() {
    reportsPeriodSpecialExpanded = !reportsPeriodSpecialExpanded;
    const panel = document.getElementById('reports-period-special-panel');
    const toggle = document.querySelector('#reports-period-special-block .loans-hero-summary-toggle');
    if (panel) panel.classList.toggle('hidden', !reportsPeriodSpecialExpanded);
    if (toggle) toggle.setAttribute('aria-expanded', reportsPeriodSpecialExpanded ? 'true' : 'false');
}

function expandReportsPeriodSpecial() {
    if (reportsPeriodSpecialExpanded) return;
    reportsPeriodSpecialExpanded = true;
    document.getElementById('reports-period-special-panel')?.classList.remove('hidden');
    document.querySelector('#reports-period-special-block .loans-hero-summary-toggle')
        ?.setAttribute('aria-expanded', 'true');
}

const ANALYSIS_MONTH_SHORT = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

function initAnalysisSwipe() {
    attachHorizontalSwipe(document.getElementById('analysis-sections-body'), {
        onSwipeLeft: () => shiftAnalysisSection(1),
        onSwipeRight: () => shiftAnalysisSection(-1)
    });
}

function getAnalysisContextYear() {
    if (reportsPeriodMode === 'month') {
        return parseInt(getReportsMonthValue().slice(0, 4), 10);
    }
    if (reportsPeriodMode === 'year') {
        const val = document.getElementById('reports-year-select')?.value;
        if (val && val !== 'all') return parseInt(val, 10);
    }
    return new Date().getFullYear();
}

function renderAnalysisYearChips() {
    const el = document.getElementById('reports-year-chips');
    if (!el) return;
    const years = getTransactionYears();
    const yearSelect = document.getElementById('reports-year-select');
    const currentVal = yearSelect?.value || String(new Date().getFullYear());
    const parts = [
        `<button type="button" class="toggle-btn loans-chip${reportsPeriodMode === 'year' && currentVal === 'all' ? ' active' : ''}" onclick="selectReportsYear('all')">Całość</button>`
    ];
    years.forEach((year) => {
        const value = String(year);
        const active = reportsPeriodMode === 'year' && currentVal === value;
        parts.push(`<button type="button" class="toggle-btn loans-chip${active ? ' active' : ''}" onclick="selectReportsYear('${value}')">${value}</button>`);
    });
    el.innerHTML = parts.join('');
}

function renderAnalysisMonthChips() {
    const el = document.getElementById('reports-month-chips');
    if (!el) return;
    const contextYear = getAnalysisContextYear();
    const monthValue = getReportsMonthValue();
    el.innerHTML = ANALYSIS_MONTH_SHORT.map((label, monthIndex) => {
        const value = `${contextYear}-${String(monthIndex + 1).padStart(2, '0')}`;
        const active = reportsPeriodMode === 'month' && monthValue === value;
        return `<button type="button" class="toggle-btn loans-chip analysis-period-month-chip${active ? ' active' : ''}" onclick="selectReportsMonthChip(${contextYear}, ${monthIndex})">${label}</button>`;
    }).join('');
}

function selectReportsYear(year) {
    const yearSelect = document.getElementById('reports-year-select');
    if (yearSelect) yearSelect.value = year;
    setReportsPeriodMode('year');
}

function selectReportsMonthChip(year, monthIndex) {
    const monthValue = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const monthInput = document.getElementById('reports-period-month');
    if (monthInput) monthInput.value = monthValue;
    const { year: y, monthIndex: mi } = getMonthBoundsFromValue(monthValue);
    reportsCalendarYear = y;
    reportsCalendarMonth = mi;
    setReportsPeriodMode('month');
}

function selectReportsSpecialMode(mode) {
    expandReportsPeriodSpecial();
    setReportsPeriodMode(mode);
    if (mode === 'compare') updateComparePresetUI();
}

function selectComparePreset(preset) {
    if (!COMPARE_PRESETS.includes(preset)) return;
    reportsComparePreset = preset;
    try { localStorage.setItem(ANALYSIS_COMPARE_PRESET_KEY, preset); } catch { /* ignore */ }
    updateComparePresetUI();
    if (preset === 'same-month') updateSameMonthCompareHint();
}

function updateSameMonthCompareHint() {
    const hint = document.getElementById('reports-compare-same-month-hint');
    const monthVal = document.getElementById('reports-compare-same-month')?.value;
    if (!hint || !monthVal) return;
    const [year, month] = monthVal.split('-').map(Number);
    const prevMonthVal = `${year - 1}-${String(month).padStart(2, '0')}`;
    const a = getMonthBoundsFromValue(prevMonthVal);
    const b = getMonthBoundsFromValue(monthVal);
    hint.textContent = `${formatComparePeriodLabel(a.start, a.end)} vs ${formatComparePeriodLabel(b.start, b.end)}`;
}

function populateCompareYearSelects() {
    const years = getTransactionYears();
    const now = new Date().getFullYear();
    ['reports-compare-a-year', 'reports-compare-b-year'].forEach((id, index) => {
        const el = document.getElementById(id);
        if (!el) return;
        const previous = el.value;
        el.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');
        if (previous && years.includes(parseInt(previous, 10))) {
            el.value = previous;
        } else {
            el.value = String(index === 0 ? now - 1 : now);
        }
    });
}

function updateComparePresetUI() {
    COMPARE_PRESETS.forEach((preset) => {
        const btnId = preset === 'same-month' ? 'btn-compare-preset-same-month' : `btn-compare-preset-${preset}`;
        document.getElementById(btnId)?.classList.toggle('active', reportsComparePreset === preset);
    });
    document.getElementById('compare-preset-mom-wrap')?.classList.toggle('hidden', reportsComparePreset !== 'mom');
    document.getElementById('compare-preset-yoy-wrap')?.classList.toggle('hidden', reportsComparePreset !== 'yoy');
    document.getElementById('compare-preset-same-month-wrap')?.classList.toggle('hidden', reportsComparePreset !== 'same-month');
    document.getElementById('compare-preset-custom-wrap')?.classList.toggle('hidden', reportsComparePreset !== 'custom');
    if (reportsComparePreset === 'yoy') populateCompareYearSelects();
    if (reportsComparePreset === 'same-month') updateSameMonthCompareHint();
}

function syncCompareDatesFromPreset() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    if (reportsComparePreset === 'mom') {
        const aMonth = document.getElementById('reports-compare-a-month')?.value;
        const bMonth = document.getElementById('reports-compare-b-month')?.value;
        if (!aMonth || !bMonth) return;
        const a = getMonthBoundsFromValue(aMonth);
        const b = getMonthBoundsFromValue(bMonth);
        set('reports-compare-a-start', a.start);
        set('reports-compare-a-end', a.end);
        set('reports-compare-b-start', b.start);
        set('reports-compare-b-end', b.end);
        return;
    }

    if (reportsComparePreset === 'yoy') {
        const aYear = document.getElementById('reports-compare-a-year')?.value;
        const bYear = document.getElementById('reports-compare-b-year')?.value;
        if (!aYear || !bYear) return;
        set('reports-compare-a-start', `${aYear}-01-01`);
        set('reports-compare-a-end', `${aYear}-12-31`);
        set('reports-compare-b-start', `${bYear}-01-01`);
        set('reports-compare-b-end', `${bYear}-12-31`);
        return;
    }

    if (reportsComparePreset === 'same-month') {
        const bMonth = document.getElementById('reports-compare-same-month')?.value;
        if (!bMonth) return;
        const [year, month] = bMonth.split('-').map(Number);
        const aMonth = `${year - 1}-${String(month).padStart(2, '0')}`;
        const a = getMonthBoundsFromValue(aMonth);
        const b = getMonthBoundsFromValue(bMonth);
        set('reports-compare-a-start', a.start);
        set('reports-compare-a-end', a.end);
        set('reports-compare-b-start', b.start);
        set('reports-compare-b-end', b.end);
    }
}

function updateReportsPeriodFields(mode = reportsPeriodMode) {
    document.getElementById('reports-period-range-wrap')?.classList.toggle('hidden', mode !== 'range');
    document.getElementById('reports-period-compare-wrap')?.classList.toggle('hidden', mode !== 'compare');
    document.getElementById('reports-period-special-confirm')?.classList.toggle('hidden', mode !== 'range' && mode !== 'compare');
    document.getElementById('btn-reports-range-mode')?.classList.toggle('active', mode === 'range');
    document.getElementById('btn-reports-compare-mode')?.classList.toggle('active', mode === 'compare');
}

function updateReportsPeriodUI(ctx) {
    populateReportsYearSelect();
    renderAnalysisYearChips();
    renderAnalysisMonthChips();
    updateReportsPeriodFields();

    if (ctx?.mode === 'compare') updateComparePresetUI();

    const displayEl = document.getElementById('reports-period-display');
    const summaryEl = document.getElementById('reports-period-summary');
    if (ctx && displayEl) {
        displayEl.textContent = ctx.mode === 'compare' ? 'Porównanie okresów' : ctx.label;
    }
    if (summaryEl && ctx) {
        if (ctx.mode === 'compare' && ctx.periodA && ctx.periodB) {
            summaryEl.textContent = ctx.compareBanner || getComparePeriodLabels(ctx).banner;
        } else {
            summaryEl.textContent = `Wyświetlane dane: ${ctx.label}`;
        }
    }
    updateReportsPeriodResetVisibility();
}

function getReportsMonthValue() {
    const el = document.getElementById('reports-period-month');
    if (el?.value) return el.value;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthBoundsFromValue(monthValue) {
    const [year, month] = monthValue.split('-').map(Number);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = localIsoDate(new Date(year, month, 0));
    return { start, end, year, monthIndex: month - 1 };
}

function formatMonthLabel(monthValue) {
    const [y, m] = monthValue.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function isFullMonthRange(start, end) {
    if (!start || !end || start.slice(0, 7) !== end.slice(0, 7)) return false;
    const [year, month] = start.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = localIsoDate(new Date(year, month, 0));
    return start === monthStart && end === monthEnd;
}

function isFullYearRange(start, end) {
    if (!start || !end || start.slice(0, 4) !== end.slice(0, 4)) return false;
    const year = start.slice(0, 4);
    return start === `${year}-01-01` && end === `${year}-12-31`;
}

function formatComparePeriodLabel(start, end) {
    if (!start || !end) return '—';
    if (isFullYearRange(start, end)) return start.slice(0, 4);
    if (isFullMonthRange(start, end)) return formatMonthLabel(start.slice(0, 7));
    if (start === end) {
        return new Date(`${start}T12:00:00`).toLocaleDateString('pl-PL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    const startDate = new Date(`${start}T12:00:00`);
    const endDate = new Date(`${end}T12:00:00`);

    if (start.slice(0, 7) === end.slice(0, 7)) {
        const endParts = endDate.toLocaleDateString('pl-PL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).split(' ');
        return `${startDate.getDate()}–${endParts[0]} ${endParts[1]} ${endParts[2]}`;
    }

    if (start.slice(0, 4) === end.slice(0, 4)) {
        const startPart = startDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
        const endPart = endDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
        return `${startPart} – ${endPart}`;
    }

    const startPart = startDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
    const endPart = endDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startPart} – ${endPart}`;
}

function getComparePeriodLabels(ctx) {
    const labelA = ctx?.periodA?.label || formatComparePeriodLabel(ctx?.periodA?.start, ctx?.periodA?.end);
    const labelB = ctx?.periodB?.label || formatComparePeriodLabel(ctx?.periodB?.start, ctx?.periodB?.end);
    return { labelA, labelB, banner: `${labelA} vs ${labelB}` };
}

function attachComparePeriodLabels(ctx) {
    if (!ctx?.periodA || !ctx?.periodB) return ctx;
    ctx.periodA.label = formatComparePeriodLabel(ctx.periodA.start, ctx.periodA.end);
    ctx.periodB.label = formatComparePeriodLabel(ctx.periodB.start, ctx.periodB.end);
    ctx.compareBanner = `${ctx.periodA.label} vs ${ctx.periodB.label}`;
    return ctx;
}

function onReportsMonthChange() {
    const { year, monthIndex } = getMonthBoundsFromValue(getReportsMonthValue());
    reportsCalendarYear = year;
    reportsCalendarMonth = monthIndex;
    renderReports();
}

function syncReportsCalendarFromContext(ctx) {
    if (!ctx) return;
    if (ctx.mode === 'month' && ctx.rangeStart) {
        const { year, monthIndex } = getMonthBoundsFromValue(ctx.rangeStart.slice(0, 7));
        reportsCalendarYear = year;
        reportsCalendarMonth = monthIndex;
        reportsLastPeriod = `month:${ctx.rangeStart.slice(0, 7)}`;
        return;
    }
    if (ctx.mode === 'year') {
        syncReportsCalendarToPeriod(ctx.period);
        return;
    }
    if (ctx.mode === 'range' && ctx.rangeStart) {
        syncReportsCalendarToPeriod(ctx.rangeStart.slice(0, 4));
    }
}

function setAnalysisSection(section) {
    section = normalizeAnalysisSection(section);
    if (!ANALYSIS_SECTIONS.includes(section)) return;
    analysisSection = section;
    if (reportsPeriodMode !== 'compare') {
        try { localStorage.setItem(ANALYSIS_SECTION_KEY, section); } catch { /* ignore */ }
    }

    ANALYSIS_SECTIONS.forEach((id) => {
        document.getElementById(`analysis-section-${id}`)?.classList.toggle('hidden', id !== section);
        document.getElementById(`btn-analysis-${id}`)?.classList.toggle('active', id === section);
    });

    if (reportsPeriodMode === 'compare') {
        resizeCompareSectionCharts(section);
    } else if (reportsLastCtx) {
        if (section === 'overview' && typeof updateReportsDaySummaryVisibility === 'function') {
            updateReportsDaySummaryVisibility(reportsLastCtx);
        }
        if (section === 'expenses' && typeof updateReportsMonthSummaryVisibility === 'function') {
            updateReportsMonthSummaryVisibility(reportsLastCtx);
        }
        renderAnalysisSectionContent(section, reportsLastCtx, reportsLastSavingsRate);
    }
    resizeAnalysisSectionCharts(section);
}

function resizeCompareSectionCharts(section) {
    requestAnimationFrame(() => {
        if (section === 'expenses') reportsCompareChartInstance?.resize();
        if (section === 'assets') reportsCompareWealthChartInstance?.resize();
    });
}

function resizeAnalysisSectionCharts(section) {
    const chartsBySection = {
        overview: [reportsChartInstance, reportsStructureChartInstance],
        expenses: [],
        assets: [
            reportsAssetsTabAllocationInstance,
            reportsAssetsTabCashTrendInstance,
            reportsNetWorthTrendChartInstance
        ],
        debts: [
            reportsDebtsTabChartInstance,
            reportsDebtsTabSplitInstance,
            reportsDebtTrendChartInstance,
            reportsDebtPeakChartInstance
        ],
        advanced: [
            reportsTrendChartInstance,
            reportsYoyChartInstance,
            reportsDowChartInstance,
            reportsAllocationTrendChartInstance,
            reportsDiversificationChartInstance
        ]
    };
    requestAnimationFrame(() => {
        (chartsBySection[section] || []).forEach((chart) => chart?.resize());
    });
}

function initAnalysisUI() {
    if (analysisUiInitialized) return;
    const view = document.getElementById('view-reports');
    if (!view?.id || view.id !== 'view-reports') return;
    analysisUiInitialized = true;
    initReportsPeriodDefaults();
    initAnalysisPeriodMode();
    initAnalysisSection();
    initAnalysisSwipe();
}

function ensureAnalysisUIInit() {
    initAnalysisUI();
}

function initAnalysisSection() {
    try {
        const saved = localStorage.getItem(ANALYSIS_SECTION_KEY);
        if (saved) analysisSection = normalizeAnalysisSection(saved);
    } catch { /* ignore */ }
    setAnalysisSection(analysisSection);
}

let debtsOverpayLoanId = null;
let debtsOverpayKind = 'monthly';
let debtsOverpayAmount = 0;
let reportsCalendarView = 'month';
let calendarDayDate = null;
let calendarDayFilter = 'all';
let reportsMonthChartMeta = { period: null, labels: [], ctx: null };

function getTransactionsInRange(start, end) {
    if (!start || !end) return [];
    const source = typeof getReportsTransactionSource === 'function'
        ? getReportsTransactionSource()
        : (appState?.transactions || []);
    return source.filter((t) => t.date >= start && t.date <= end);
}

function applyReportsPeriodDefaults() {
    const now = new Date();
    const monthStart = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const prevStart = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const prevEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));
    const monthInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    set('reports-range-start', monthStart);
    set('reports-range-end', monthEnd);
    set('reports-compare-a-start', prevStart);
    set('reports-compare-a-end', prevEnd);
    set('reports-compare-b-start', monthStart);
    set('reports-compare-b-end', monthEnd);
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    set('reports-compare-a-month', prevMonth);
    set('reports-compare-b-month', curMonth);
    set('reports-compare-same-month', curMonth);
    set('reports-period-month', monthInput);
}

function initReportsPeriodDefaults() {
    const now = new Date();
    const monthStart = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const prevStart = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const prevEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));

    const setIfEmpty = (id, val) => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = val;
    };
    setIfEmpty('reports-range-start', monthStart);
    setIfEmpty('reports-range-end', monthEnd);
    setIfEmpty('reports-compare-a-start', prevStart);
    setIfEmpty('reports-compare-a-end', prevEnd);
    setIfEmpty('reports-compare-b-start', monthStart);
    setIfEmpty('reports-compare-b-end', monthEnd);
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    setIfEmpty('reports-compare-a-month', prevMonth);
    setIfEmpty('reports-compare-b-month', curMonth);
    setIfEmpty('reports-compare-same-month', curMonth);
    const monthInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setIfEmpty('reports-period-month', monthInput);
}

function initAnalysisPeriodMode() {
    try {
        const saved = localStorage.getItem(ANALYSIS_PERIOD_KEY);
        if (saved && PERIOD_MODES.includes(saved)) reportsPeriodMode = saved;
    } catch { /* ignore */ }
    try {
        const savedPreset = localStorage.getItem(ANALYSIS_COMPARE_PRESET_KEY);
        if (savedPreset && COMPARE_PRESETS.includes(savedPreset)) reportsComparePreset = savedPreset;
    } catch { /* ignore */ }
    if (reportsPeriodMode === 'range' || reportsPeriodMode === 'compare') {
        expandReportsPeriodSpecial();
    }
    setReportsPeriodMode(reportsPeriodMode, true);
    updateComparePresetUI();
}

function setReportsPeriodMode(mode, skipRender = false) {
    if (mode === 'compare' && reportsPeriodMode !== 'compare') {
        reportsPeriodModeBeforeCompare = PERIOD_MODES.includes(reportsPeriodMode)
            && reportsPeriodMode !== 'compare'
            && reportsPeriodMode !== 'range'
            ? reportsPeriodMode
            : 'month';
    }
    if (mode !== 'compare') {
        reportsPeriodModeBeforeCompare = null;
    }
    reportsPeriodMode = mode;
    try { localStorage.setItem(ANALYSIS_PERIOD_KEY, mode); } catch { /* ignore */ }
    updateReportsPeriodFields(mode);
    if (mode === 'month') {
        const { year, monthIndex } = getMonthBoundsFromValue(getReportsMonthValue());
        reportsCalendarYear = year;
        reportsCalendarMonth = monthIndex;
    }
    updateReportsPeriodResetVisibility();
    if (!skipRender) renderReports();
}

function getReportsPeriodContext() {
    initReportsPeriodDefaults();

    if (reportsPeriodMode === 'range') {
        const start = document.getElementById('reports-range-start')?.value || '1970-01-01';
        const end = document.getElementById('reports-range-end')?.value || '2099-12-31';
        const periodTx = getTransactionsInRange(start, end);
        return {
            mode: 'range',
            period: 'range',
            label: `${formatTxDate(start)} – ${formatTxDate(end)}`,
            periodTx,
            rangeStart: start,
            rangeEnd: end
        };
    }

    if (reportsPeriodMode === 'compare') {
        syncCompareDatesFromPreset();
        const aStart = document.getElementById('reports-compare-a-start')?.value;
        const aEnd = document.getElementById('reports-compare-a-end')?.value;
        const bStart = document.getElementById('reports-compare-b-start')?.value;
        const bEnd = document.getElementById('reports-compare-b-end')?.value;
        const periodA = getTransactionsInRange(aStart, aEnd);
        const periodB = getTransactionsInRange(bStart, bEnd);
        return attachComparePeriodLabels({
            mode: 'compare',
            period: 'compare',
            label: 'Porównanie okresów',
            periodTx: periodA,
            periodA: { start: aStart, end: aEnd, tx: periodA },
            periodB: { start: bStart, end: bEnd, tx: periodB }
        });
    }

    if (reportsPeriodMode === 'month') {
        const monthValue = getReportsMonthValue();
        const { start, end } = getMonthBoundsFromValue(monthValue);
        const periodTx = getTransactionsInRange(start, end);
        return {
            mode: 'month',
            period: 'month',
            label: formatMonthLabel(monthValue),
            periodTx,
            rangeStart: start,
            rangeEnd: end,
            monthValue
        };
    }

    const period = document.getElementById('reports-year-select')?.value || String(new Date().getFullYear());
    return {
        mode: 'year',
        period,
        label: period === 'all' ? 'Całość' : period,
        periodTx: getTransactionsForReportsPeriod(period),
        rangeStart: null,
        rangeEnd: null
    };
}

function summarizePeriod(tx) {
    const income = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;
    const savings = income > 0 ? Math.round((balance / income) * 100) : 0;
    return { income, expense, balance, savings };
}

function getPeriodInclusiveDays(start, end) {
    if (!start || !end) return 1;
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(`${end}T12:00:00`);
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

function getCategoryExpenseMap(tx) {
    const map = {};
    tx.filter((t) => t.type === 'expense').forEach((t) => {
        map[t.mainCategory] = (map[t.mainCategory] || 0) + t.amount;
    });
    return map;
}

function buildCompareCategoryMovers(txA, txB, limit = 5) {
    const mapA = getCategoryExpenseMap(txA);
    const mapB = getCategoryExpenseMap(txB);
    const names = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
    return [...names]
        .map((name) => {
            const a = mapA[name] || 0;
            const b = mapB[name] || 0;
            const diff = b - a;
            const pct = a > 0 ? Math.round((diff / a) * 100) : (b > 0 ? 100 : 0);
            return { name, a, b, diff, pct, absDiff: Math.abs(diff) };
        })
        .filter((row) => row.a || row.b)
        .sort((left, right) => right.absDiff - left.absDiff)
        .slice(0, limit);
}

function formatCompareDelta(curr, prev) {
    const diff = curr - prev;
    const pct = prev ? Math.round((diff / prev) * 100) : (curr > 0 ? 100 : 0);
    const sign = diff >= 0 ? '+' : '−';
    return `${sign}${formatPlnAmount(Math.abs(diff))} (${pct >= 0 ? '+' : ''}${pct}%)`;
}

function formatComparePct(curr, prev) {
    if (!prev) return curr > 0 ? '+100%' : '0%';
    const pct = Math.round(((curr - prev) / prev) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function buildComparePctEm(curr, prev) {
    return `<em class="compare-stat-pct">${formatComparePct(curr, prev)}</em>`;
}

function buildCompareStatRow(label, amount, options = {}) {
    const { kind = '', pct = '', raw = false } = options;
    const kindClass = kind ? ` ${kind}` : '';
    const display = raw ? amount : formatPlnAmount(amount);
    const pctCell = pct || '<em class="compare-stat-pct"></em>';
    return `<div class="compare-stat">
        <span class="compare-stat-label">${label}</span>
        <strong class="compare-stat-amt${kindClass}">${display}</strong>
        ${pctCell}
    </div>`;
}

function buildComparePeriodStack(labelA, labelB, firstHtml, secondHtml, extraClass = '') {
    return `<div class="compare-stack${extraClass ? ` ${extraClass}` : ''}">
        <div class="compare-col">
            <div class="compare-col-label">${escapeHtml(labelA)}</div>
            ${firstHtml}
        </div>
        <div class="compare-col">
            <div class="compare-col-label">${escapeHtml(labelB)}</div>
            ${secondHtml}
        </div>
    </div>`;
}

/** @deprecated alias — używaj buildComparePeriodStack */
function buildComparePeriodGrid(labelA, labelB, firstHtml, secondHtml, extraClass = '') {
    return buildComparePeriodStack(labelA, labelB, firstHtml, secondHtml, extraClass);
}

function buildCompareCategoryMoversHtml(movers) {
    if (!movers.length) {
        return '<p class="reports-hint">Brak wydatków do porównania kategorii.</p>';
    }
    const rows = movers.map((row) => {
        const dir = row.diff > 0 ? 'up' : row.diff < 0 ? 'down' : 'flat';
        const sign = row.diff > 0 ? '+' : row.diff < 0 ? '−' : '';
        const arrow = row.diff > 0 ? '↑' : row.diff < 0 ? '↓' : '→';
        return `<div class="compare-mover-row compare-mover-row--${dir}">
            <span class="compare-mover-name">${escapeHtml(row.name)}</span>
            <span class="compare-mover-delta">${arrow} ${sign}${formatPlnAmount(Math.abs(row.diff))}</span>
            <span class="compare-mover-pct">${row.pct >= 0 ? '+' : ''}${row.pct}%</span>
        </div>`;
    }).join('');
    return `<div class="compare-movers-section">
        <h3 class="compare-subtitle">Największe zmiany kategorii</h3>
        ${rows}
    </div>`;
}

function destroyReportsCompareCharts() {
    if (reportsCompareChartInstance) {
        reportsCompareChartInstance.destroy();
        reportsCompareChartInstance = null;
    }
    if (reportsCompareWealthChartInstance) {
        reportsCompareWealthChartInstance.destroy();
        reportsCompareWealthChartInstance = null;
    }
}

function formatCompareSignedDelta(value) {
    const sign = value >= 0 ? '+' : '−';
    return `${sign}${formatPlnAmount(Math.abs(value))}`;
}

function buildCompareWealthHtml(ctx) {
    if (typeof buildCompareWealthSummary !== 'function') return '';
    const wealth = buildCompareWealthSummary(ctx.periodA.end, ctx.periodB.end);
    if (!wealth) {
        return `<p class="reports-hint">Brak snapshotów majątku dla wybranych okresów. Odwiedź zakładkę Majątek — snapshoty zapisują się automatycznie co miesiąc.</p>`;
    }

    const { labelA, labelB } = getComparePeriodLabels(ctx);
    const debtDeltaLabel = wealth.deltaDebt <= 0 ? 'Spadek zobowiązań' : 'Wzrost zobowiązań';
    const debtDeltaClass = wealth.deltaDebt <= 0 ? 'income' : 'expense';
    const netDeltaClass = wealth.deltaNetWorth >= 0 ? 'income' : 'expense';

    const periodStats = (side, ref = null) => {
        const w = side === 'a' ? wealth.a : wealth.b;
        const pct = (curr, prev) => (ref ? buildComparePctEm(curr, prev) : '');
        const r = ref ? wealth.a : null;
        return `
            ${buildCompareStatRow('Majątek', w.assets, { pct: r ? pct(w.assets, r.assets) : '' })}
            ${buildCompareStatRow('Zobowiązania', w.debt, { kind: 'expense', pct: r ? pct(w.debt, r.debt) : '' })}
            ${buildCompareStatRow('Kredyty', w.loanDebt, { kind: 'expense', pct: r ? pct(w.loanDebt, r.loanDebt) : '' })}
            ${buildCompareStatRow('Karty', w.cardDebt, { kind: 'expense', pct: r ? pct(w.cardDebt, r.cardDebt) : '' })}
            ${buildCompareStatRow(NET_WORTH_LABEL, w.netWorth, { pct: r ? pct(w.netWorth, r.netWorth) : '' })}`;
    };

    return `<p class="reports-hint compare-wealth-intro">Stan na koniec każdego okresu porównania.</p>
        <div class="compare-wealth-summary">
            <div class="compare-wealth-summary-item">
                <span class="label">Zmiana majątku</span>
                <strong class="${wealth.deltaAssets >= 0 ? 'income' : 'expense'}">${formatCompareSignedDelta(wealth.deltaAssets)}</strong>
            </div>
            <div class="compare-wealth-summary-item">
                <span class="label">${debtDeltaLabel}</span>
                <strong class="${debtDeltaClass}">${formatCompareSignedDelta(Math.abs(wealth.deltaDebt))}</strong>
            </div>
            <div class="compare-wealth-summary-item">
                <span class="label">Zmiana ${NET_WORTH_LABEL.toLowerCase()}</span>
                <strong class="${netDeltaClass}">${formatCompareSignedDelta(wealth.deltaNetWorth)}</strong>
            </div>
        </div>
        ${buildComparePeriodStack(labelA, labelB, periodStats('a'), periodStats('b', true), 'compare-stack--wealth')}
        <div class="compare-chart-wrap compare-wealth-chart-wrap">
            <canvas id="reportsCompareWealthChart" aria-label="Wykres zmian majątku i zobowiązań"></canvas>
        </div>
        ${!wealth.hasBoth ? '<p class="reports-hint">Część danych oszacowana z najbliższego snapshotu lub bieżącego stanu.</p>' : ''}`;
}

function renderReportsCompareWealthChart(ctx) {
    const canvas = document.getElementById('reportsCompareWealthChart');
    if (!canvas || typeof Chart === 'undefined' || typeof buildCompareWealthSummary !== 'function') return;

    const wealth = buildCompareWealthSummary(ctx.periodA.end, ctx.periodB.end);
    if (reportsCompareWealthChartInstance) {
        reportsCompareWealthChartInstance.destroy();
        reportsCompareWealthChartInstance = null;
    }
    if (!wealth) return;

    const theme = getReportsChartTheme();
    const deltas = [wealth.deltaAssets, -wealth.deltaDebt, wealth.deltaNetWorth];
    const colors = [
        wealth.deltaAssets >= 0 ? theme.incomeColor : theme.expenseColor,
        wealth.deltaDebt <= 0 ? theme.incomeColor : theme.expenseColor,
        wealth.deltaNetWorth >= 0 ? theme.incomeColor : theme.expenseColor
    ];

    const options = getReportsChartOptions(theme);
    options.aspectRatio = 1.85;
    options.plugins.legend.display = false;
    options.scales.x.grid.display = false;

    reportsCompareWealthChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Majątek', 'Zobowiązania', NET_WORTH_LABEL],
            datasets: [{
                label: 'Zmiana A → B',
                data: deltas,
                backgroundColor: colors,
                borderRadius: 6,
                maxBarThickness: 44
            }]
        },
        options
    });
}

function renderReportsCompareChart(ctx) {
    const canvas = document.getElementById('reportsCompareChart');
    if (!canvas || typeof Chart === 'undefined' || typeof getReportsChartTheme !== 'function') return;

    const mapA = getCategoryExpenseMap(ctx.periodA.tx);
    const mapB = getCategoryExpenseMap(ctx.periodB.tx);
    const categories = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])]
        .map((name) => ({ name, max: Math.max(mapA[name] || 0, mapB[name] || 0) }))
        .sort((left, right) => right.max - left.max)
        .slice(0, 8)
        .map((entry) => entry.name);

    if (reportsCompareChartInstance) {
        reportsCompareChartInstance.destroy();
        reportsCompareChartInstance = null;
    }

    if (!categories.length) return;

    const theme = getReportsChartTheme();
    const options = getReportsChartOptions(theme);
    options.aspectRatio = 1.55;
    options.plugins.legend.position = 'bottom';

    const { labelA, labelB } = getComparePeriodLabels(ctx);

    reportsCompareChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [
                {
                    label: labelA,
                    data: categories.map((name) => mapA[name] || 0),
                    backgroundColor: theme.prevYearColor,
                    borderRadius: 4,
                    maxBarThickness: 28
                },
                {
                    label: labelB,
                    data: categories.map((name) => mapB[name] || 0),
                    backgroundColor: theme.expenseColor,
                    borderRadius: 4,
                    maxBarThickness: 28
                }
            ]
        },
        options
    });
}

function setCompareSlotHtml(section, html) {
    const slot = document.getElementById(`analysis-compare-${section}`);
    if (slot) slot.innerHTML = html;
}

function clearCompareSlots() {
    ANALYSIS_SECTIONS.forEach((section) => setCompareSlotHtml(section, ''));
}

function buildCompareDetailRow(label, valA, valB, kind = 'amount') {
    const isPct = kind === 'pct';
    const fmt = (v) => (isPct ? `${v}%` : formatPlnAmount(v));
    const pct = formatComparePct(valB, valA);
    const valueClass = kind === 'income' ? 'income' : kind === 'expense' ? 'expense' : '';
    return `<div class="compare-detail-row">
        <span class="compare-detail-metric">${label}</span>
        <span class="compare-detail-val">${fmt(valA)}</span>
        <span class="compare-detail-val compare-detail-val--b ${valueClass}">${fmt(valB)}<em>${pct}</em></span>
    </div>`;
}

function buildCompareOverviewHtml(ctx, summaryA, summaryB) {
    const a = summaryA;
    const b = summaryB;
    const { labelA, labelB } = getComparePeriodLabels(ctx);
    const daysA = getPeriodInclusiveDays(ctx.periodA.start, ctx.periodA.end);
    const daysB = getPeriodInclusiveDays(ctx.periodB.start, ctx.periodB.end);
    const dailyExpenseA = a.expense / daysA;
    const dailyExpenseB = b.expense / daysB;
    const dailyIncomeA = a.income / daysA;
    const dailyIncomeB = b.income / daysB;

    const balanceDiff = b.balance - a.balance;
    const balanceDiffSign = balanceDiff >= 0 ? '+' : '−';
    const balanceDiffClass = balanceDiff >= 0 ? 'income' : 'expense';

    const stat = (label, val, kind = '', raw = false) => buildCompareStatRow(label, val, { kind, raw });
    const statPct = (label, val, ref, kind = '', asPercent = false) => {
        const display = asPercent ? `${val}%` : val;
        return buildCompareStatRow(label, display, {
            kind,
            raw: asPercent,
            pct: buildComparePctEm(val, ref)
        });
    };

    return `<div class="card compare-overview-card">
            <div class="compare-overview-header">
                <h2 class="compare-overview-delta ${balanceDiffClass}">${balanceDiffSign}${formatPlnAmount(Math.abs(balanceDiff))}</h2>
                <p class="compare-overview-delta-label">zmiana bilansu · ${escapeHtml(labelA)} vs ${escapeHtml(labelB)}</p>
            </div>
            <div class="compare-stack compare-stack--overview">
                <div class="compare-col">
                    <div class="compare-col-label">${escapeHtml(labelA)}</div>
                    ${stat('Bilans', a.balance)}
                    ${stat('Wpływy', a.income, 'income')}
                    ${stat('Wydatki', a.expense, 'expense')}
                    ${stat('Oszcz.', `${a.savings}%`, '', true)}
                    ${stat('Wyd./dzień', dailyExpenseA, 'expense')}
                    ${stat('Wpł./dzień', dailyIncomeA, 'income')}
                </div>
                <div class="compare-col">
                    <div class="compare-col-label">${escapeHtml(labelB)}</div>
                    ${statPct('Bilans', b.balance, a.balance)}
                    ${statPct('Wpływy', b.income, a.income, 'income')}
                    ${statPct('Wydatki', b.expense, a.expense, 'expense')}
                    ${statPct('Oszcz.', b.savings, a.savings, '', true)}
                    ${statPct('Wyd./dzień', dailyExpenseB, dailyExpenseA, 'expense')}
                    ${statPct('Wpł./dzień', dailyIncomeB, dailyIncomeA, 'income')}
                </div>
            </div>
            <p class="reports-hint compare-days-hint">${escapeHtml(labelA)}: ${daysA} dni · ${escapeHtml(labelB)}: ${daysB} dni</p>
        </div>`;
}

function buildCompareExpensesHtml(ctx, movers) {
    return `<div class="card dashboard-panel">
            ${buildCompareCategoryMoversHtml(movers)}
        </div>
        <div class="card chart-card dashboard-panel">
            <h2 class="dashboard-section-title">Wydatki wg kategorii</h2>
            <div class="compare-chart-wrap">
                <canvas id="reportsCompareChart" aria-label="Wykres porównania wydatków wg kategorii"></canvas>
            </div>
        </div>
        <div class="card dashboard-panel">
            <h2 class="dashboard-section-title">Transakcje</h2>
            ${buildCompareTransactionInsightsHtml(ctx)}
        </div>`;
}

function buildCompareAssetsHtml(ctx) {
    const wealthInner = buildCompareWealthHtml(ctx);
    if (!wealthInner.trim()) return '';
    return `<div class="card dashboard-panel">
            <h2 class="dashboard-section-title">Majątek i zobowiązania</h2>
            ${wealthInner}
        </div>`;
}

function buildCompareDebtsTabHtml(ctx) {
    return `<div class="card dashboard-panel debts-panel-card">
            ${buildDebtCompareHtml(ctx)}
        </div>`;
}

function buildCompareIkzeSectionHtml(ctx) {
    if (typeof buildCompareIkzeSummary !== 'function') return '';
    const summary = buildCompareIkzeSummary(ctx.periodA, ctx.periodB);
    if (!summary) return '';

    const hasIkzeAssets = (appState.assets || []).some(
        (a) => !a.archived && a.type === 'retirement' && a.retirementKind === 'IKZE'
    );
    const hasData = hasIkzeAssets
        || summary.contribA > 0
        || summary.contribB > 0
        || summary.retirementA > 0
        || summary.retirementB > 0
        || summary.ytdA > 0
        || summary.ytdB > 0;

    if (!hasData) {
        return `<div class="card dashboard-panel compare-advanced-card">
            <h2 class="dashboard-section-title">IKZE i emerytura</h2>
            <p class="reports-hint">Brak wpłat IKZE ani aktywów emerytalnych w wybranych okresach. Powiąż transakcję z kontem IKZE w formularzu dodawania.</p>
        </div>`;
    }

    const { labelA, labelB } = getComparePeriodLabels(ctx);
    const limitPctA = summary.limit > 0 ? Math.min(100, Math.round((summary.ytdA / summary.limit) * 100)) : 0;
    const limitPctB = summary.limit > 0 ? Math.min(100, Math.round((summary.ytdB / summary.limit) * 100)) : 0;
    const limitLabelA = `${formatPlnAmount(summary.ytdA)} / ${formatPlnAmount(summary.limit)} (${limitPctA}%)`;
    const limitLabelB = `${formatPlnAmount(summary.ytdB)} / ${formatPlnAmount(summary.limit)} (${limitPctB}%)`;

    const colA = `
        ${buildCompareStatRow('Wpłaty IKZE', summary.contribA)}
        ${buildCompareStatRow('Wpłaty emerytura', summary.retirementA)}
        ${buildCompareStatRow(`Limit IKZE ${summary.yearA}`, limitLabelA, { raw: true })}`;
    const colB = `
        ${buildCompareStatRow('Wpłaty IKZE', summary.contribB, { pct: buildComparePctEm(summary.contribB, summary.contribA) })}
        ${buildCompareStatRow('Wpłaty emerytura', summary.retirementB, { pct: buildComparePctEm(summary.retirementB, summary.retirementA) })}
        ${buildCompareStatRow(`Limit IKZE ${summary.yearB}`, limitLabelB, {
            raw: true,
            pct: buildComparePctEm(summary.ytdB, summary.ytdA)
        })}`;

    const manualHint = (summary.manualA || summary.manualB)
        ? '<p class="reports-hint compare-ikze-hint">Limit IKZE: wpłaty roczne wpisane ręcznie w ustawieniach (nie suma transakcji).</p>'
        : '<p class="reports-hint compare-ikze-hint">Limit IKZE liczony od początku roku kalendarzowego do końca każdego okresu.</p>';

    return `<div class="card dashboard-panel compare-advanced-card">
            <h2 class="dashboard-section-title">IKZE i emerytura</h2>
            <p class="reports-hint compare-ikze-intro">Wpłaty w wybranym okresie oraz wykorzystanie rocznego limitu IKZE.</p>
            ${buildComparePeriodStack(labelA, labelB, colA, colB, 'compare-stack--ikze')}
            ${manualHint}
        </div>`;
}

function buildCompareDiversificationSectionHtml(ctx) {
    if (typeof buildCompareDiversificationSummary !== 'function') return '';
    const summary = buildCompareDiversificationSummary(ctx.periodA.end, ctx.periodB.end);
    if (!summary) {
        return `<div class="card dashboard-panel compare-advanced-card">
            <h2 class="dashboard-section-title">Dywersyfikacja majątku</h2>
            <p class="reports-hint">Brak snapshotów majątku dla wybranych okresów. Odwiedź zakładkę Majątek — snapshoty zapisują się automatycznie co miesiąc.</p>
        </div>`;
    }

    const { labelA, labelB } = getComparePeriodLabels(ctx);
    const rowHtml = (side, ref = null) => summary.rows.map((row) => {
        const amount = side === 'a' ? row.amountA : row.amountB;
        const pct = side === 'a' ? row.pctA : row.pctB;
        const refAmount = ref ? ref.amountA : null;
        return buildCompareStatRow(`${row.label} (${pct}%)`, amount, {
            pct: refAmount !== null ? buildComparePctEm(amount, refAmount) : ''
        });
    }).join('');

    const totalRow = (side, refTotal = null) => {
        const total = side === 'a' ? summary.totalA : summary.totalB;
        return buildCompareStatRow('Razem aktywa', total, {
            pct: refTotal !== null ? buildComparePctEm(total, refTotal) : ''
        });
    };

    return `<div class="card dashboard-panel compare-advanced-card">
            <h2 class="dashboard-section-title">Dywersyfikacja majątku</h2>
            <p class="reports-hint compare-diversification-intro">Struktura aktywów na koniec każdego okresu (wg typu).</p>
            ${buildComparePeriodStack(
                labelA,
                labelB,
                totalRow('a') + rowHtml('a'),
                totalRow('b', summary.totalA) + rowHtml('b', summary),
                'compare-stack--diversification'
            )}
            ${!summary.hasBoth ? '<p class="reports-hint">Część danych oszacowana z najbliższego snapshotu lub bieżącego stanu.</p>' : ''}
        </div>`;
}

function buildCompareAdvancedHtml(ctx) {
    const ikzeHtml = buildCompareIkzeSectionHtml(ctx);
    const diversificationHtml = buildCompareDiversificationSectionHtml(ctx);
    return `${ikzeHtml}${diversificationHtml}`;
}

function renderReportsCompare(ctx) {
    const isCompare = ctx.mode === 'compare';
    if (!isCompare) {
        clearCompareSlots();
        destroyReportsCompareCharts();
        return;
    }

    const summaryA = summarizePeriod(ctx.periodA.tx);
    const summaryB = summarizePeriod(ctx.periodB.tx);
    const movers = buildCompareCategoryMovers(ctx.periodA.tx, ctx.periodB.tx);

    setCompareSlotHtml('overview', buildCompareOverviewHtml(ctx, summaryA, summaryB));
    setCompareSlotHtml('expenses', buildCompareExpensesHtml(ctx, movers));
    setCompareSlotHtml('assets', buildCompareAssetsHtml(ctx));
    setCompareSlotHtml('debts', buildCompareDebtsTabHtml(ctx));
    setCompareSlotHtml('advanced', buildCompareAdvancedHtml(ctx));

    renderReportsCompareWealthChart(ctx);
    renderReportsCompareChart(ctx);
    resizeCompareSectionCharts(analysisSection);
}

function getDebtPaymentsForBounds(start, end, txList) {
    const loanPayments = txList
        .filter((t) => t.type === 'expense' && isLoanOrDebtPayment(t))
        .reduce((s, t) => s + t.amount, 0);
    const cardRepayments = sumCardRepaymentsInRange(start, end);
    return { loanPayments, cardRepayments, total: loanPayments + cardRepayments };
}

function getTransactionEditIndex(t) {
    if (!t || !Array.isArray(appState.transactions)) return -1;
    return appState.transactions.indexOf(t);
}

function formatCompareTxHighlight(t, clickable = true) {
    if (!t) return '<span class="compare-tx-empty">—</span>';
    const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
    const idx = clickable ? getTransactionEditIndex(t) : -1;
    const clickAttrs = idx >= 0
        ? ` class="compare-tx-body compare-tx-clickable" role="button" tabindex="0" onclick="openTransactionDetails(${idx})" onkeydown="if (event.key === 'Enter') openTransactionDetails(${idx})"`
        : ' class="compare-tx-body"';
    return `<span${clickAttrs}>
        <span class="compare-tx-title">${escapeHtml(title)}</span>
        <span class="compare-tx-line">
            <span class="compare-tx-meta">${formatTxDate(t.date)}</span>
            <strong class="compare-tx-amount ${t.type === 'income' ? 'income' : 'expense'}">${formatPlnAmount(t.amount)}</strong>
        </span>
    </span>`;
}

function getTopTransactions(txList, type, limit = 5, excludeDebt = false) {
    let filtered = txList.filter((t) => t.type === type);
    if (excludeDebt && type === 'expense') {
        filtered = filtered.filter((t) => !isLoanOrDebtPayment(t));
    }
    return filtered.sort((left, right) => right.amount - left.amount).slice(0, limit);
}

function getExpenseAmountMedian(txList, excludeDebt = true) {
    const amounts = txList
        .filter((t) => t.type === 'expense')
        .filter((t) => !excludeDebt || !isLoanOrDebtPayment(t))
        .map((t) => t.amount)
        .sort((left, right) => left - right);
    if (!amounts.length) return null;
    const mid = Math.floor(amounts.length / 2);
    return amounts.length % 2 === 1
        ? amounts[mid]
        : (amounts[mid - 1] + amounts[mid]) / 2;
}

function countZeroExpenseDays(start, end, txList) {
    if (!start || !end) return { zero: 0, total: 0 };
    const total = getPeriodInclusiveDays(start, end);
    const expenseDays = new Set(
        txList
            .filter((t) => t.type === 'expense' && !isLoanOrDebtPayment(t))
            .map((t) => t.date)
    );
    let zero = 0;
    const cur = new Date(`${start}T12:00:00`);
    const endDate = new Date(`${end}T12:00:00`);
    while (cur <= endDate) {
        const iso = localIsoDate(cur);
        if (!expenseDays.has(iso)) zero += 1;
        cur.setDate(cur.getDate() + 1);
    }
    return { zero, total, withExpense: expenseDays.size };
}

function getCompareExclusiveExpenseGroups(mapA, mapB) {
    const onlyA = Object.keys(mapA)
        .filter((key) => !mapB[key])
        .map((key) => ({ ...mapA[key], side: 'A' }))
        .sort((left, right) => right.total - left.total);
    const onlyB = Object.keys(mapB)
        .filter((key) => !mapA[key])
        .map((key) => ({ ...mapB[key], side: 'B' }))
        .sort((left, right) => right.total - left.total);
    return { onlyA, onlyB };
}

function buildCompareTopTxListHtml(items, emptyLabel) {
    if (!items.length) {
        return `<p class="reports-hint">${emptyLabel}</p>`;
    }
    return items.map((t, i) => {
        const idx = getTransactionEditIndex(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const clickAttrs = idx >= 0
            ? ` class="compare-top-tx-row compare-tx-clickable" role="button" tabindex="0" onclick="openTransactionDetails(${idx})" onkeydown="if (event.key === 'Enter') openTransactionDetails(${idx})"`
            : ' class="compare-top-tx-row"';
        return `<div${clickAttrs}>
            <span class="compare-top-tx-rank">${i + 1}</span>
            <div class="compare-top-tx-text">
                <span class="compare-top-tx-title">${escapeHtml(title)}</span>
                <span class="compare-top-tx-meta">${formatTxDate(t.date)}</span>
            </div>
            <strong class="compare-top-tx-amount ${t.type === 'income' ? 'income' : 'expense'}">${formatPlnAmount(t.amount)}</strong>
        </div>`;
    }).join('');
}

function getExtremeTransaction(txList, type, mode = 'max', excludeDebt = false) {
    let filtered = txList.filter((t) => t.type === type);
    if (excludeDebt && type === 'expense') {
        filtered = filtered.filter((t) => !isLoanOrDebtPayment(t));
    }
    if (!filtered.length) return null;
    return filtered.reduce((best, t) => {
        if (!best) return t;
        if (mode === 'min') return t.amount < best.amount ? t : best;
        return t.amount > best.amount ? t : best;
    }, null);
}

function getExpenseGroupTotals(txList) {
    const map = {};
    txList
        .filter((t) => t.type === 'expense' && !isLoanOrDebtPayment(t))
        .forEach((t) => {
            const key = getRecurringGroupKey(t);
            const label = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
            if (!map[key]) map[key] = { key, label, mainCategory: t.mainCategory, total: 0, count: 0 };
            map[key].total += t.amount;
            map[key].count += 1;
        });
    return map;
}

function buildCompareRepeatingExpenses(txA, txB, limit = 6) {
    const mapA = getExpenseGroupTotals(txA);
    const mapB = getExpenseGroupTotals(txB);
    return Object.keys(mapA)
        .filter((key) => mapB[key])
        .map((key) => ({
            label: mapA[key].label,
            mainCategory: mapA[key].mainCategory,
            totalA: mapA[key].total,
            totalB: mapB[key].total,
            countA: mapA[key].count,
            countB: mapB[key].count,
            diff: mapB[key].total - mapA[key].total
        }))
        .sort((left, right) => Math.max(right.totalA, right.totalB) - Math.max(left.totalA, left.totalB))
        .slice(0, limit);
}

function buildCompareFixedVariableSummary(mapA, mapB) {
    const totalA = Object.values(mapA).reduce((sum, group) => sum + group.total, 0);
    const totalB = Object.values(mapB).reduce((sum, group) => sum + group.total, 0);
    let fixedA = 0;
    let fixedB = 0;
    Object.keys(mapA).forEach((key) => {
        if (!mapB[key]) return;
        fixedA += mapA[key].total;
        fixedB += mapB[key].total;
    });
    const variableA = totalA - fixedA;
    const variableB = totalB - fixedB;
    const sharePct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
    return {
        totalA,
        totalB,
        fixedA,
        fixedB,
        variableA,
        variableB,
        fixedPctA: sharePct(fixedA, totalA),
        fixedPctB: sharePct(fixedB, totalB),
        variablePctA: sharePct(variableA, totalA),
        variablePctB: sharePct(variableB, totalB)
    };
}

function buildCompareFixedVariableColHtml(summary, side) {
    const isB = side === 'B';
    const total = isB ? summary.totalB : summary.totalA;
    const fixed = isB ? summary.fixedB : summary.fixedA;
    const variable = isB ? summary.variableB : summary.variableA;
    const fixedPct = isB ? summary.fixedPctB : summary.fixedPctA;
    const variablePct = isB ? summary.variablePctB : summary.variablePctA;
    const refFixed = isB ? summary.fixedA : null;
    const refVariable = isB ? summary.variableA : null;
    return `
        ${buildCompareStatRow('Wydatki razem', total, { kind: 'expense' })}
        ${buildCompareStatRow(`Stałe (${fixedPct}%)`, fixed, {
            kind: 'expense',
            pct: refFixed !== null ? buildComparePctEm(fixed, refFixed) : ''
        })}
        ${buildCompareStatRow(`Zmienne (${variablePct}%)`, variable, {
            kind: 'expense',
            pct: refVariable !== null ? buildComparePctEm(variable, refVariable) : ''
        })}`;
}

function buildCompareExtremeBlock(label, tx) {
    return `<div class="compare-extreme-block">
        <span class="compare-extreme-label">${label}</span>
        ${formatCompareTxHighlight(tx)}
    </div>`;
}

function buildCompareExclusiveListHtml(items, emptyLabel) {
    if (!items.length) {
        return `<p class="reports-hint compare-exclusive-empty">${emptyLabel}</p>`;
    }
    return items.slice(0, 6).map((row) => `<div class="compare-mini-row">
        <span class="compare-mini-row-name">${escapeHtml(row.label)}</span>
        <strong class="compare-mini-row-amt expense">${formatPlnAmount(row.total)}</strong>
        <em class="compare-mini-row-extra">${row.count}×</em>
    </div>`).join('');
}

function buildCompareRepeatingColHtml(rows, side) {
    if (!rows.length) {
        return '<p class="reports-hint compare-exclusive-empty">Brak powtarzających się pozycji.</p>';
    }
    return rows.map((row) => {
        const total = side === 'A' ? row.totalA : row.totalB;
        const count = side === 'A' ? row.countA : row.countB;
        const pct = side === 'B' ? buildComparePctEm(row.totalB, row.totalA) : '';
        return `<div class="compare-mini-row">
            <span class="compare-mini-row-name">${escapeHtml(row.label)}</span>
            <strong class="compare-mini-row-amt expense">${formatPlnAmount(total)}</strong>
            <span class="compare-mini-row-tail">${pct}<em class="compare-mini-row-extra">${count}×</em></span>
        </div>`;
    }).join('');
}

function buildCompareTransactionInsightsHtml(ctx) {
    const { labelA, labelB } = getComparePeriodLabels(ctx);
    const txA = ctx.periodA.tx;
    const txB = ctx.periodB.tx;
    const mapA = getExpenseGroupTotals(txA);
    const mapB = getExpenseGroupTotals(txB);
    const { onlyA, onlyB } = getCompareExclusiveExpenseGroups(mapA, mapB);
    const topIncomeA = getTopTransactions(txA, 'income', 5);
    const topIncomeB = getTopTransactions(txB, 'income', 5);
    const topExpenseA = getTopTransactions(txA, 'expense', 5, true);
    const topExpenseB = getTopTransactions(txB, 'expense', 5, true);
    const medianA = getExpenseAmountMedian(txA);
    const medianB = getExpenseAmountMedian(txB);
    const zeroDaysA = countZeroExpenseDays(ctx.periodA.start, ctx.periodA.end, txA);
    const zeroDaysB = countZeroExpenseDays(ctx.periodB.start, ctx.periodB.end, txB);
    const topIncomeAExt = getExtremeTransaction(txA, 'income', 'max');
    const topIncomeBExt = getExtremeTransaction(txB, 'income', 'max');
    const maxExpenseA = getExtremeTransaction(txA, 'expense', 'max', true);
    const maxExpenseB = getExtremeTransaction(txB, 'expense', 'max', true);
    const repeating = buildCompareRepeatingExpenses(txA, txB);
    const fixedVariable = buildCompareFixedVariableSummary(mapA, mapB);

    const statsHtml = buildComparePeriodGrid(
        labelA,
        labelB,
        `<div class="compare-tx-stat-stack">
            ${buildCompareStatRow('Mediana', medianA !== null ? medianA : '—', { raw: medianA === null })}
            ${buildCompareStatRow('Bez wydatków', `${zeroDaysA.zero}/${zeroDaysA.total}`, { raw: true })}
        </div>`,
        `<div class="compare-tx-stat-stack">
            ${buildCompareStatRow('Mediana', medianB !== null ? medianB : '—', {
                raw: medianB === null,
                pct: medianA !== null && medianB !== null ? buildComparePctEm(medianB, medianA) : ''
            })}
            ${buildCompareStatRow('Bez wydatków', `${zeroDaysB.zero}/${zeroDaysB.total}`, {
                raw: true,
                pct: buildComparePctEm(zeroDaysB.zero, zeroDaysA.zero)
            })}
        </div>`,
        'compare-stack--stats'
    ) + `<p class="reports-hint compare-tx-stats-hint">Mediana liczona z pojedynczych wydatków (bez spłat długów).</p>`;

    const extremesLeft = `
        ${buildCompareExtremeBlock('Najwyższy wpływ', topIncomeAExt)}
        ${buildCompareExtremeBlock('Największy wydatek', maxExpenseA)}`;
    const extremesRight = `
        ${buildCompareExtremeBlock('Najwyższy wpływ', topIncomeBExt)}
        ${buildCompareExtremeBlock('Największy wydatek', maxExpenseB)}`;

    const extremesHtml = `<h3 class="compare-subtitle">Ekstremy</h3>
        ${buildComparePeriodStack(labelA, labelB, extremesLeft, extremesRight, 'compare-stack--extremes')}`;

    const topListsHtml = `
        <h3 class="compare-subtitle">Top 5 wpływów</h3>
        ${buildComparePeriodStack(
            labelA,
            labelB,
            buildCompareTopTxListHtml(topIncomeA, `Brak wpływów (${labelA}).`),
            buildCompareTopTxListHtml(topIncomeB, `Brak wpływów (${labelB}).`),
            'compare-stack--top-tx'
        )}
        <h3 class="compare-subtitle">Top 5 wydatków</h3>
        ${buildComparePeriodStack(
            labelA,
            labelB,
            buildCompareTopTxListHtml(topExpenseA, `Brak wydatków (${labelA}).`),
            buildCompareTopTxListHtml(topExpenseB, `Brak wydatków (${labelB}).`),
            'compare-stack--top-tx'
        )}`;

    const exclusiveHtml = `<div class="compare-tx-exclusive">
            <h3 class="compare-subtitle">Nowe i znikające pozycje</h3>
            <p class="reports-hint">Kategorie/pozycje wydatków obecne tylko w jednym okresie.</p>
            ${buildComparePeriodStack(
                labelA,
                labelB,
                `<span class="compare-tx-exclusive-label">Tylko w tym okresie</span>${buildCompareExclusiveListHtml(onlyA, `Brak unikalnych pozycji (${labelA}).`)}`,
                `<span class="compare-tx-exclusive-label">Tylko w tym okresie</span>${buildCompareExclusiveListHtml(onlyB, `Brak unikalnych pozycji (${labelB}).`)}`,
                'compare-stack--exclusive'
            )}
        </div>`;

    const fixedVariableHtml = (fixedVariable.totalA > 0 || fixedVariable.totalB > 0)
        ? `<div class="compare-tx-fixed-variable">
            <h3 class="compare-subtitle">Stałe vs zmienne</h3>
            <p class="reports-hint">Stałe = pozycje wydatków obecne w obu okresach. Zmienne = reszta (bez spłat długów).</p>
            ${buildComparePeriodStack(
                labelA,
                labelB,
                buildCompareFixedVariableColHtml(fixedVariable, 'A'),
                buildCompareFixedVariableColHtml(fixedVariable, 'B'),
                'compare-stack--fixed-variable'
            )}
            ${repeating.length ? `
            <h4 class="compare-subtitle compare-subtitle--nested">Skład stałych wydatków</h4>
            <p class="reports-hint">Największe pozycje wspólne dla obu okresów.</p>
            ${buildComparePeriodStack(
                labelA,
                labelB,
                buildCompareRepeatingColHtml(repeating, 'A'),
                buildCompareRepeatingColHtml(repeating, 'B'),
                'compare-stack--repeating'
            )}` : ''}
        </div>`
        : '';

    return `${statsHtml}
        ${extremesHtml}
        ${topListsHtml}
        ${exclusiveHtml}
        ${fixedVariableHtml}
        <p class="reports-hint compare-tx-footnote">Kliknij transakcję, aby ją otworzyć.</p>`;
}

function buildDebtCompareDetailRow(name, amountA, amountB, labelA, labelB) {
    return `<div class="debt-compare-card">
        <div class="debt-compare-card-name">${name}</div>
        ${buildComparePeriodStack(
            labelA,
            labelB,
            buildCompareStatRow('Spłaty', amountA, { kind: 'expense' }),
            buildCompareStatRow('Spłaty', amountB, { kind: 'expense', pct: buildComparePctEm(amountB, amountA) }),
            'compare-stack--debt-detail'
        )}
    </div>`;
}

function buildDebtCompareHtml(ctx) {
    const { labelA, labelB } = getComparePeriodLabels(ctx);
    const debtA = getDebtPaymentsForBounds(ctx.periodA.start, ctx.periodA.end, ctx.periodA.tx);
    const debtB = getDebtPaymentsForBounds(ctx.periodB.start, ctx.periodB.end, ctx.periodB.tx);
    const deltaPct = (curr, prev) => buildComparePctEm(curr, prev);

    const loanRows = getActiveLoans().map((loan) => {
        const name = escapeHtml(getLoanDisplayName(loan));
        const a = ctx.periodA.tx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .reduce((s, t) => s + t.amount, 0);
        const b = ctx.periodB.tx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .reduce((s, t) => s + t.amount, 0);
        if (!a && !b) return '';
        return buildDebtCompareDetailRow(name, a, b, labelA, labelB);
    }).filter(Boolean).join('');

    const cardRows = getActiveCreditCards().map((card) => {
        const name = escapeHtml(card.name);
        const a = getCreditCardMovementsInRange(ctx.periodA.start, ctx.periodA.end)
            .filter((m) => m.cardId === card.id && m.type === 'repayment')
            .reduce((s, m) => s + m.amount, 0);
        const b = getCreditCardMovementsInRange(ctx.periodB.start, ctx.periodB.end)
            .filter((m) => m.cardId === card.id && m.type === 'repayment')
            .reduce((s, m) => s + m.amount, 0);
        if (!a && !b) return '';
        return buildDebtCompareDetailRow(`${name} (karta)`, a, b, labelA, labelB);
    }).filter(Boolean).join('');

    const detailRows = loanRows + cardRows;
    const detailBlock = detailRows
        ? `<div class="debt-compare-details">${detailRows}</div>`
        : '';

    return `<div class="debt-compare-section">
        <h3 class="analysis-subsection-label">Spłaty długów</h3>
        <div class="compare-stack compare-stack--debt">
            <div class="compare-col">
                <div class="compare-col-label">${escapeHtml(labelA)}</div>
                ${buildCompareStatRow('Razem spłaty', debtA.total, { kind: 'expense' })}
                ${buildCompareStatRow('Raty kredytów', debtA.loanPayments)}
                ${buildCompareStatRow('Spłaty kart', debtA.cardRepayments)}
            </div>
            <div class="compare-col">
                <div class="compare-col-label">${escapeHtml(labelB)}</div>
                ${buildCompareStatRow('Razem spłaty', debtB.total, { kind: 'expense', pct: deltaPct(debtB.total, debtA.total) })}
                ${buildCompareStatRow('Raty kredytów', debtB.loanPayments, { pct: deltaPct(debtB.loanPayments, debtA.loanPayments) })}
                ${buildCompareStatRow('Spłaty kart', debtB.cardRepayments, { pct: deltaPct(debtB.cardRepayments, debtA.cardRepayments) })}
            </div>
        </div>
        ${detailBlock}
    </div>`;
}

function renderReportsFlow(ctx) {
    const el = document.getElementById('reports-flow-chart');
    if (!el) return;

    const { income, expense, balance } = summarizePeriod(ctx.periodTx);
    if (!income && !expense) {
        el.innerHTML = '<div class="empty-state"><p>Brak danych</p></div>';
        return;
    }

    const catSums = {};
    ctx.periodTx.filter((t) => t.type === 'expense').forEach((t) => {
        catSums[t.mainCategory] = (catSums[t.mainCategory] || 0) + t.amount;
    });
    const topCats = Object.entries(catSums).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxCat = Math.max(...topCats.map(([, amt]) => amt), 1);

    el.innerHTML = `
        <div class="flow-total flow-total--income">
            <span>Wpływy</span>
            <strong>${formatPlnAmount(income)}</strong>
        </div>
        <div class="flow-lines">
            ${topCats.map(([name, amt]) => `<div class="flow-line">
                <div class="flow-line-head">
                    <span class="flow-line-name">${escapeHtml(name)}</span>
                    <span class="flow-line-amt">−${formatPlnAmount(amt)}</span>
                </div>
                <div class="flow-line-bar" aria-hidden="true"><i style="width:${Math.round((amt / maxCat) * 100)}%"></i></div>
            </div>`).join('')}
        </div>
        <div class="flow-total flow-total--balance ${balance >= 0 ? 'positive' : 'negative'}">
            <span>Bilans</span>
            <strong>${balance >= 0 ? '+' : ''}${formatPlnAmount(balance)}</strong>
        </div>`;
}

function isLoanOrDebtPayment(t) {
    if (t.type !== 'expense') return false;
    if (t.mainCategory === 'Długi') return true;
    const hay = `${t.mainCategory} ${t.subCategory} ${t.note || ''}`.toLowerCase();
    return /kredyt|hipotec|\brata\b|raty|spłat|splat|nadpłat|nadplat|lokat|pekao|hipotek/.test(hay);
}

function getRecurringGroupKey(t) {
    const sub = t.subCategory === '[Bez podkategorii]' ? '' : t.subCategory;
    return `${t.mainCategory}|${sub}`;
}

const RECURRING_KEYWORDS = /czynsz|\brata\b|raty|subskrypc|netflix|spotify|ubezpieczen|telefon|internet|najem|leasing|kredyt|hipotec|lokat|opłat|oplat|muzyk|youtube|disney|hbo|audiobook|kablówk|kablowk|delegac|abonament/i;

function getExpenseGroupKey(t, rankLevel) {
    if (rankLevel === 'sub') return getRecurringGroupKey(t);
    return t.mainCategory;
}

function getSixMonthsAgoDate() {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return localIsoDate(d);
}

function detectRecurringExpenses(rankLevel = 'main') {
    const cutoff = getSixMonthsAgoDate();
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 60);
    const recentCutoffStr = localIsoDate(recentCutoff);
    const now = new Date();
    const fourMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const byKey = {};
    appState.transactions
        .filter((t) => t.type === 'expense' && t.date >= cutoff)
        .forEach((t) => {
            const key = getExpenseGroupKey(t, rankLevel);
            if (!byKey[key]) byKey[key] = [];
            byKey[key].push(t);
        });

    const results = [];
    Object.entries(byKey).forEach(([key, txs]) => {
        const monthlyTotals = {};
        txs.forEach((t) => {
            const m = t.date.substring(0, 7);
            monthlyTotals[m] = (monthlyTotals[m] || 0) + t.amount;
        });
        const monthsWithSpending = Object.keys(monthlyTotals);
        if (monthsWithSpending.length < 2) return;

        const activeRecent = monthsWithSpending.filter((m) => {
            const [y, mo] = m.split('-').map(Number);
            return new Date(y, mo - 1, 1) >= fourMonthsAgo;
        });
        if (activeRecent.length < 2) return;

        const latest = [...txs].sort((a, b) => b.date.localeCompare(a.date))[0];
        if (latest.date < recentCutoffStr) return;

        const amounts = activeRecent.map((m) => monthlyTotals[m]).sort((a, b) => a - b);
        const median = amounts[Math.floor(amounts.length / 2)];
        const tolerance = Math.max(median * 0.3, 50);
        const stableRatio = amounts.filter((a) => Math.abs(a - median) <= tolerance).length / amounts.length;

        const subRaw = rankLevel === 'sub' ? key.split('|')[1] : '';
        const mainCategory = rankLevel === 'sub' ? key.split('|')[0] : key;
        const subCategory = rankLevel === 'sub' ? (subRaw || '[Bez podkategorii]') : '[Bez podkategorii]';
        const labelText = `${mainCategory} ${subRaw} ${txs.map((t) => t.note || '').join(' ')}`.toLowerCase();
        const hasKeyword = RECURRING_KEYWORDS.test(labelText);
        const minMonths = hasKeyword ? 2 : 3;
        if (activeRecent.length < minMonths || stableRatio < 0.6) return;

        const avgMonthly = Math.round(
            activeRecent.reduce((s, m) => s + monthlyTotals[m], 0) / activeRecent.length
        );

        results.push({
            key,
            amount: avgMonthly,
            avgMonthly,
            mainCategory,
            subCategory,
            source: 'detected',
            months: activeRecent.length,
            lastDate: latest.date,
            hasKeyword
        });
    });
    return results;
}

function getManualRecurringEntries(rankLevel = 'main') {
    const byId = {};
    appState.transactions.forEach((t) => {
        if (!t.recurringId || t.type !== 'expense') return;
        const prev = byId[t.recurringId];
        if (!prev || t.date >= prev.lastDate) {
            byId[t.recurringId] = {
                amount: t.amount,
                mainCategory: t.mainCategory,
                subCategory: t.subCategory,
                source: 'manual',
                months: null,
                lastDate: t.date
            };
        }
    });

    const entries = Object.values(byId);
    if (rankLevel === 'sub') {
        return entries.map((e) => ({
            ...e,
            key: getRecurringGroupKey(e)
        }));
    }

    const merged = {};
    entries.forEach((e) => {
        const k = e.mainCategory;
        if (!merged[k]) {
            merged[k] = { ...e, key: k, subCategory: '[Bez podkategorii]' };
        } else {
            merged[k].amount += e.amount;
            if (e.lastDate > merged[k].lastDate) merged[k].lastDate = e.lastDate;
        }
    });
    return Object.values(merged);
}

function getAllRecurringEntries(rankLevel = 'main') {
    const manual = getManualRecurringEntries(rankLevel);
    const manualKeys = new Set(manual.map((m) => m.key));
    const detected = detectRecurringExpenses(rankLevel).filter((d) => !manualKeys.has(d.key));
    return [...manual, ...detected].sort((a, b) => b.amount - a.amount);
}

function renderDetectedRecurringList() {
    const list = document.getElementById('reports-recurring-list');
    if (!list) return;

    const rankLevel = typeof reportsRankLevel !== 'undefined' ? reportsRankLevel : 'main';
    if (typeof syncReportsRankToggles === 'function') syncReportsRankToggles();

    const entries = getAllRecurringEntries(rankLevel);
    if (!entries.length) {
        list.innerHTML = '<div class="empty-state"><p>Brak aktywnych wydatków cyklicznych w ostatnich miesiącach</p></div>';
        return;
    }

    const monthlyTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
    list.innerHTML = entries.map((entry) => {
        const showSub = rankLevel === 'sub' && entry.subCategory !== '[Bez podkategorii]';
        const title = showSub ? entry.subCategory : entry.mainCategory;
        const metaLine = showSub ? escapeHtml(entry.mainCategory) : '';
        const badge = entry.source === 'manual'
            ? '<span class="recurring-badge recurring-badge--manual">Oznaczone ręcznie</span>'
            : `<span class="recurring-badge recurring-badge--detected">Wykryte · ${entry.months} mies.</span>`;
        const lastLine = entry.lastDate ? `ostatnio ${formatTxDate(entry.lastDate)}` : '';
        return `<div class="reports-recurring-item">
            ${renderCategoryIcon(entry.mainCategory, 'list', showSub ? entry.subCategory : null, 'expense')}
            <div class="reports-top-text">
                <span class="reports-top-name">${escapeHtml(title)}</span>
                <span class="reports-top-meta">${metaLine}${metaLine && lastLine ? ' · ' : ''}${lastLine} ${badge}</span>
            </div>
            <span class="reports-recurring-amount">${formatPlnAmount(entry.amount)}/mies.</span>
        </div>`;
    }).join('') + `<div class="reports-recurring-total">Szacunkowa suma: <strong>${formatPlnAmount(monthlyTotal)}</strong>/mies.</div>`;
}

function renderReportsOutliers(ctx) {
    const list = document.getElementById('reports-outliers-list');
    if (!list) return;

    const outliers = ctx.periodTx
        .filter((t) => t.type === 'expense' && !isLoanOrDebtPayment(t))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);

    if (!outliers.length) {
        list.innerHTML = '<div class="empty-state"><p>Brak nietypowych wydatków w tym okresie</p></div>';
        return;
    }

    list.innerHTML = outliers.map((t, i) => {
        const globalIndex = appState.transactions.indexOf(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const clickAttrs = globalIndex >= 0
            ? ` type="button" onclick="openTransactionDetails(${globalIndex})"`
            : ' type="button" disabled';
        return `<button class="reports-top-item"${clickAttrs}>
            <span class="reports-top-rank">${i + 1}</span>
            ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, 'expense')}
            <div class="reports-top-text">
                <span class="reports-top-name">${escapeHtml(title)}</span>
                <span class="reports-top-meta">${formatTxDate(t.date)} · ${escapeHtml(t.mainCategory)}</span>
            </div>
            <div class="reports-top-col">
                <span class="reports-top-amount expense">${formatPlnAmount(t.amount)}</span>
            </div>
        </button>`;
    }).join('');
}

function getCategoryMonthlyTotals(mainCategory, subCategory, rankLevel, monthsBack = 3) {
    const now = new Date();
    const totals = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const end = localIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        const sum = appState.transactions
            .filter((t) => {
                if (t.type !== 'expense' || t.mainCategory !== mainCategory || t.date < start || t.date > end) return false;
                if (rankLevel === 'sub' && subCategory) {
                    const sub = t.subCategory === '[Bez podkategorii]' ? null : t.subCategory;
                    return sub === subCategory;
                }
                return true;
            })
            .reduce((s, t) => s + t.amount, 0);
        totals.push(sum);
    }
    return totals;
}

function buildTrendEntries(rankLevel) {
    const keys = {};
    appState.transactions
        .filter((t) => t.type === 'expense')
        .forEach((t) => {
            if (rankLevel === 'sub') {
                const sub = t.subCategory === '[Bez podkategorii]' ? null : t.subCategory;
                const key = sub ? `${t.mainCategory}|${sub}` : t.mainCategory;
                if (!keys[key]) {
                    keys[key] = { mainCategory: t.mainCategory, subCategory: sub, label: sub || t.mainCategory };
                }
            } else if (!keys[t.mainCategory]) {
                keys[t.mainCategory] = { mainCategory: t.mainCategory, subCategory: null, label: t.mainCategory };
            }
        });
    return Object.values(keys);
}

function renderReportsCategoryTrends() {
    const list = document.getElementById('reports-trends-list');
    if (!list) return;

    const rankLevel = typeof reportsRankLevel !== 'undefined' ? reportsRankLevel : 'main';
    if (typeof syncReportsRankToggles === 'function') syncReportsRankToggles();

    const entries = buildTrendEntries(rankLevel).map((entry) => {
        const totals = getCategoryMonthlyTotals(entry.mainCategory, entry.subCategory, rankLevel, 3);
        const trend = totals[2] - totals[0];
        const rising = totals[0] < totals[1] && totals[1] < totals[2];
        const falling = totals[0] > totals[1] && totals[1] > totals[2];
        return { ...entry, totals, trend, rising, falling };
    }).filter((e) => e.totals.some((v) => v > 0))
        .sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend))
        .slice(0, 8);

    if (!entries.length) {
        list.innerHTML = '<div class="empty-state"><p>Za mało danych (min. 2 miesiące)</p></div>';
        return;
    }

    list.innerHTML = entries.map((e) => {
        const arrow = e.rising ? '↑ rośnie' : (e.falling ? '↓ spada' : '→ stabilnie');
        const arrowClass = e.rising ? 'trend-up' : (e.falling ? 'trend-down' : 'trend-flat');
        const meta = rankLevel === 'sub' && e.subCategory ? escapeHtml(e.mainCategory) + ' · ' : '';
        return `<div class="trend-row">
            ${renderCategoryIcon(e.mainCategory, 'list', e.subCategory, 'expense')}
            <div class="trend-text">
                <span class="reports-top-name">${escapeHtml(e.label)}</span>
                <span class="reports-top-meta">${meta}${e.totals.map((v) => formatCompactPln(v)).join(' → ')} zł</span>
            </div>
            <span class="trend-badge ${arrowClass}">${arrow}</span>
        </div>`;
    }).join('');
}

function renderReportsForecast(ctx) {
    const el = document.getElementById('reports-forecast');
    if (!el) return;

    const totals = typeof getReportsMonthForecastTotals === 'function'
        ? getReportsMonthForecastTotals(new Date())
        : null;

    if (!totals) return;

    const hint = totals.usesFixedRecurring
        ? `Średnia zmiennych wydatków z ${totals.dayOfMonth} dni · stałe opłaty ok. ${formatPlnAmount(totals.fixedExpenseTotal)}/mies.${
            totals.fixedExpenseRemaining > 0
                ? ` (jeszcze do zapłaty: ${formatPlnAmount(totals.fixedExpenseRemaining)})`
                : ''
        }`
        : `Na podstawie średniej dziennej z ${totals.dayOfMonth} dni.`;

    el.innerHTML = `
        <div class="forecast-stats">
            <div class="forecast-stat">
                <span class="forecast-label">Wydano do dziś</span>
                <strong class="forecast-value expense">${formatPlnAmount(totals.monthExpenses)}</strong>
            </div>
            <div class="forecast-stat">
                <span class="forecast-label">Prognoza na miesiąc</span>
                <strong class="forecast-value">${formatPlnAmount(totals.forecast)}</strong>
            </div>
            <div class="forecast-stat">
                <span class="forecast-label">Szac. do końca mies.</span>
                <strong class="forecast-value">${formatPlnAmount(totals.remaining)}</strong>
            </div>
        </div>
        <p class="reports-hint">${hint}</p>`;
}

function isReportsCurrentMonthPeriod(ctx) {
    if (!ctx || ctx.mode !== 'month' || !ctx.rangeStart || !ctx.rangeEnd) return false;
    const now = new Date();
    const currentStart = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const currentEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return ctx.rangeStart === currentStart && ctx.rangeEnd === currentEnd;
}

function updateReportsForecastVisibility(ctx) {
    const card = document.getElementById('reports-forecast-card');
    if (!card) return;
    const show = ctx?.mode !== 'compare' && isReportsCurrentMonthPeriod(ctx);
    card.classList.toggle('hidden', !show);
    if (show) renderReportsForecast(ctx);
}

function getPreviousPeriodBoundsForMom(ctx) {
    if (ctx.mode === 'month' && ctx.rangeStart) {
        const ref = new Date(`${ctx.rangeStart}T12:00:00`);
        const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
        return {
            start: localIsoDate(prev),
            end: localIsoDate(new Date(prev.getFullYear(), prev.getMonth() + 1, 0)),
            label: 'poprzedni miesiąc'
        };
    }
    if (ctx.mode === 'year' && ctx.period && ctx.period !== 'all') {
        const year = parseInt(ctx.period, 10);
        return {
            start: `${year - 1}-01-01`,
            end: `${year - 1}-12-31`,
            label: String(year - 1)
        };
    }
    return null;
}

function renderReportsMomSummary(ctx) {
    const el = document.getElementById('reports-mom-summary');
    if (!el) return;
    if (ctx.mode === 'compare') {
        el.classList.add('hidden');
        return;
    }

    const prevBounds = getPreviousPeriodBoundsForMom(ctx);
    if (!prevBounds) {
        el.classList.add('hidden');
        return;
    }

    const prevTx = getTransactionsInRange(prevBounds.start, prevBounds.end);
    const current = summarizePeriod(ctx.periodTx);
    const prev = summarizePeriod(prevTx);
    const deltaPct = (curr, prevVal) => {
        if (!prevVal) return curr > 0 ? '+100%' : '0%';
        const pct = Math.round(((curr - prevVal) / prevVal) * 100);
        return `${pct >= 0 ? '+' : ''}${pct}%`;
    };

    el.innerHTML = `<span class="reports-mom-label">vs ${prevBounds.label}:</span>
        <span class="reports-mom-item expense">wydatki <strong>${deltaPct(current.expense, prev.expense)}</strong></span>
        <span class="reports-mom-item income">wpływy <strong>${deltaPct(current.income, prev.income)}</strong></span>
        <span class="reports-mom-item">oszczędności <strong>${deltaPct(current.savings, prev.savings)}</strong></span>`;
    el.classList.remove('hidden');
}

function getChartParamsFromOverviewCtx(ctx) {
    let chartPeriod = ctx.period;
    let chartRangeStart = ctx.rangeStart;
    let chartRangeEnd = ctx.rangeEnd;
    if (ctx.mode === 'month') {
        chartPeriod = 'month';
    } else if (ctx.period === 'compare' && ctx.periodA) {
        chartPeriod = 'range';
        chartRangeStart = ctx.periodA.start;
        chartRangeEnd = ctx.periodA.end;
    }
    return { chartPeriod, chartRangeStart, chartRangeEnd };
}

function renderOverviewSection(ctx, savingsRate) {
    if (typeof updateReportsDaySummaryVisibility === 'function') {
        updateReportsDaySummaryVisibility(ctx);
    } else if (typeof renderReportsDaySummary === 'function') {
        renderReportsDaySummary(ctx);
    }
    if (typeof renderReportsStructureChart === 'function') renderReportsStructureChart(ctx);
    if (typeof renderReportsMonthChart === 'function') renderReportsMonthChart(ctx);
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromOverviewCtx(ctx);
    renderReportsDailyAvg(chartPeriod, ctx.periodTx, chartRangeStart, chartRangeEnd);
    renderReportsSavingsGoal(savingsRate);
}

function renderExpensesSection(ctx) {
    if (typeof updateReportsMonthSummaryVisibility === 'function') {
        updateReportsMonthSummaryVisibility(ctx);
    } else if (typeof renderReportsMonthSummary === 'function') {
        renderReportsMonthSummary(ctx);
    }
    const { chartPeriod, chartRangeStart } = getChartParamsFromOverviewCtx(ctx);
    if (typeof syncReportsCalendarFromContext === 'function') {
        syncReportsCalendarFromContext(ctx);
    } else {
        syncReportsCalendarToPeriod(chartPeriod === 'range' ? chartRangeStart?.slice(0, 4) : ctx.period);
    }
    if (typeof renderReportsCalendarView === 'function') {
        renderReportsCalendarView();
    } else if (typeof renderReportsCalendar === 'function') {
        renderReportsCalendar();
    }
    renderReportsTopCategories(ctx.periodTx);
    renderReportsOutliers(ctx);
    renderReportsCategoryTrends();
    renderDetectedRecurringList();
    if (typeof renderSubscriptionCenter === 'function') renderSubscriptionCenter();
}

function renderAdvancedSection(ctx) {
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromOverviewCtx(ctx);
    renderReportsTrendChart(chartPeriod, ctx.periodTx, chartRangeStart, chartRangeEnd);
    renderReportsYoYChart(chartPeriod, ctx.periodTx, ctx);
    renderReportsDowChart(ctx.periodTx);
    renderReportsFlow(ctx);
    renderReportsYearReview(ctx);
    if (typeof renderReportsAllocationTrendChart === 'function') renderReportsAllocationTrendChart();
    if (typeof renderSurplusAllocator === 'function') renderSurplusAllocator(ctx);
    if (typeof renderReportsDiversificationChart === 'function') renderReportsDiversificationChart(ctx);
    if (typeof renderReportsIkzeLimit === 'function') renderReportsIkzeLimit();
    if (typeof renderReportsMortgageVsRetirement === 'function') renderReportsMortgageVsRetirement();
}

function renderDebtsAnalysisSection(ctx) {
    renderReportsDebtsSection(ctx);
    renderReportsDebtTrendChart(ctx);
    if (typeof renderDebtPeakChart === 'function') renderDebtPeakChart();
    if (typeof updateReportsDebtsSectionVisibility === 'function') updateReportsDebtsSectionVisibility(ctx);
}

function renderAnalysisSectionContent(section, ctx, savingsRate, options = {}) {
    if (!ctx || !section) return;
    const force = Boolean(options.force || options.forExport);
    const sectionKey = `${section}|${getReportsRenderCacheKey(ctx)}`;
    if (!force && reportsRenderedSections[section] === sectionKey) return;

    setAnalysisSectionLoading(section, true);

    const finishRender = () => {
        try {
            switch (section) {
                case 'overview':
                    renderOverviewSection(ctx, savingsRate);
                    break;
                case 'expenses':
                    renderExpensesSection(ctx);
                    break;
                case 'assets':
                    renderReportsAssetsSection(ctx);
                    break;
                case 'debts':
                    renderDebtsAnalysisSection(ctx);
                    break;
                case 'advanced':
                    renderAdvancedSection(ctx);
                    break;
                default:
                    break;
            }
            reportsRenderedSections[section] = sectionKey;
        } finally {
            setAnalysisSectionLoading(section, false);
        }
    };

    if (force) {
        finishRender();
        return;
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(finishRender);
    });
}

function renderAllAnalysisSectionsForExport(ctx, savingsRate) {
    ANALYSIS_SECTIONS.forEach((section) => {
        renderAnalysisSectionContent(section, ctx, savingsRate, { forExport: true });
    });
}

function scheduleAnalysisSectionPrefetch(ctx, savingsRate) {
    const idx = ANALYSIS_SECTIONS.indexOf(analysisSection);
    if (idx < 0) return;
    const cacheKey = getReportsRenderCacheKey(ctx);
    const run = typeof requestIdleCallback === 'function'
        ? (fn) => requestIdleCallback(fn, { timeout: 2500 })
        : (fn) => setTimeout(fn, 120);

    [-1, 1].forEach((delta) => {
        const neighbor = ANALYSIS_SECTIONS[idx + delta];
        if (!neighbor) return;
        run(() => {
            if (!reportsLastCtx || getReportsRenderCacheKey(reportsLastCtx) !== cacheKey) return;
            renderAnalysisSectionContent(neighbor, ctx, savingsRate);
        });
    });
}

function invalidateAnalysisRenderCache(ctx) {
    const ctxKey = getReportsRenderCacheKey(ctx);
    if (reportsContextCacheKey !== ctxKey) {
        reportsContextCacheKey = ctxKey;
        ANALYSIS_SECTIONS.forEach((section) => {
            delete reportsRenderedSections[section];
        });
        if (typeof resetReportsAssetAllocationDrill === 'function') resetReportsAssetAllocationDrill(true);
        if (typeof resetReportsDebtSplitDrill === 'function') resetReportsDebtSplitDrill(true);
        if (typeof resetReportsDiversificationDrill === 'function') resetReportsDiversificationDrill(true);
        if (typeof reportsStructureMainCategory !== 'undefined') {
            reportsStructureMainCategory = null;
            reportsStructureSubCategory = null;
        }
        if (typeof resetReportsStructureViewFilters === 'function') resetReportsStructureViewFilters();
    }
}


function exportReportsPdf() {
    const ctx = getReportsPeriodContext();
    const savingsRate = summarizePeriod(ctx.periodTx).savings;
    renderAllAnalysisSectionsForExport(ctx, savingsRate);
    const html = buildReportsPrintHtml(ctx, savingsRate);
    const win = window.open('', '_blank');
    if (!win) {
        alert('Zezwól na wyskakujące okna, aby wyeksportować PDF.');
        return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
}

function renderPhase3Reports(ctx, savingsRate) {
    reportsLastCtx = ctx;
    reportsLastSavingsRate = savingsRate;
    invalidateAnalysisRenderCache(ctx);

    updateReportsPeriodUI(ctx);
    updateAnalysisCompareChrome(ctx);
    renderReportsCompare(ctx);
    renderReportsMomSummary(ctx);
    updateReportsDaySummaryVisibility(ctx);
    updateReportsMonthSummaryVisibility(ctx);
    updateReportsForecastVisibility(ctx);

    if (ctx.mode !== 'compare') {
        renderAnalysisSectionContent(analysisSection, ctx, savingsRate);
        scheduleAnalysisSectionPrefetch(ctx, savingsRate);
    } else {
        resizeCompareSectionCharts(analysisSection);
    }

    const printEl = document.getElementById('reports-print-meta');
    if (printEl) {
        const s = summarizePeriod(ctx.periodTx);
        printEl.dataset.label = ctx.label;
        printEl.dataset.income = formatPlnAmount(s.income);
        printEl.dataset.expense = formatPlnAmount(s.expense);
        printEl.dataset.balance = formatPlnAmount(s.balance);
        printEl.dataset.savings = `${savingsRate}%`;
    }
}

document.addEventListener('DOMContentLoaded', initAnalysisUI);
if (document.readyState !== 'loading') initAnalysisUI();
