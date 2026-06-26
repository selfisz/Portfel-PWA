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
    if (reportsPeriodMode === 'compare') return;
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
    document.getElementById('analysis-tab-grid')?.classList.toggle('hidden', isCompare);
    document.getElementById('analysis-sections-body')?.classList.toggle('hidden', isCompare);
    document.getElementById('analysis-compare-report')?.classList.toggle('hidden', !isCompare);

    const rangeEl = document.getElementById('analysis-compare-banner-range');
    if (rangeEl && isCompare && ctx.periodA && ctx.periodB) {
        rangeEl.textContent = `${formatTxDate(ctx.periodA.start)} – ${formatTxDate(ctx.periodA.end)} vs ${formatTxDate(ctx.periodB.start)} – ${formatTxDate(ctx.periodB.end)}`;
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
    hint.textContent = `Okres A: ${formatTxDate(a.start)} – ${formatTxDate(a.end)}`;
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
            summaryEl.textContent = `${formatTxDate(ctx.periodA.start)} – ${formatTxDate(ctx.periodA.end)} vs ${formatTxDate(ctx.periodB.start)} – ${formatTxDate(ctx.periodB.end)}`;
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
    if (reportsPeriodMode === 'compare') return;
    analysisSection = section;
    try { localStorage.setItem(ANALYSIS_SECTION_KEY, section); } catch { /* ignore */ }

    ANALYSIS_SECTIONS.forEach((id) => {
        document.getElementById(`analysis-section-${id}`)?.classList.toggle('hidden', id !== section);
        document.getElementById(`btn-analysis-${id}`)?.classList.toggle('active', id === section);
    });

    if (reportsLastCtx) {
        renderAnalysisSectionContent(section, reportsLastCtx, reportsLastSavingsRate);
    }
    resizeAnalysisSectionCharts(section);
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
    return appState.transactions.filter((t) => t.date >= start && t.date <= end);
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
        return {
            mode: 'compare',
            period: 'compare',
            label: 'Porównanie okresów',
            periodTx: periodA,
            periodA: { start: aStart, end: aEnd, tx: periodA },
            periodB: { start: bStart, end: bEnd, tx: periodB }
        };
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

function buildCompareDailyStatsHtml(ctx, summaryA, summaryB) {
    const daysA = getPeriodInclusiveDays(ctx.periodA.start, ctx.periodA.end);
    const daysB = getPeriodInclusiveDays(ctx.periodB.start, ctx.periodB.end);
    const dailyExpenseA = summaryA.expense / daysA;
    const dailyExpenseB = summaryB.expense / daysB;
    const dailyIncomeA = summaryA.income / daysA;
    const dailyIncomeB = summaryB.income / daysB;
    return `<div class="compare-daily-grid">
        <div class="compare-daily-item">
            <span class="label">Śr. dzienna wydatków</span>
            <strong class="expense">${formatPlnAmount(dailyExpenseA)}</strong>
            <span class="compare-daily-vs">→</span>
            <strong class="expense">${formatPlnAmount(dailyExpenseB)}</strong>
            <em>${formatCompareDelta(dailyExpenseB, dailyExpenseA)}</em>
        </div>
        <div class="compare-daily-item">
            <span class="label">Śr. dzienna wpływów</span>
            <strong class="income">${formatPlnAmount(dailyIncomeA)}</strong>
            <span class="compare-daily-vs">→</span>
            <strong class="income">${formatPlnAmount(dailyIncomeB)}</strong>
            <em>${formatCompareDelta(dailyIncomeB, dailyIncomeA)}</em>
        </div>
        <p class="reports-hint compare-days-hint">Okres A: ${daysA} dni · Okres B: ${daysB} dni</p>
    </div>`;
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
        <h2 class="compare-report-heading">Wydatki</h2>
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
        return `<h3 class="compare-subtitle">Majątek i zobowiązania</h3>
            <p class="reports-hint">Brak snapshotów majątku dla wybranych okresów. Odwiedź zakładkę Majątek — snapshoty zapisują się automatycznie co miesiąc.</p>`;
    }

    const debtDeltaLabel = wealth.deltaDebt <= 0 ? 'Spadek zobowiązań' : 'Wzrost zobowiązań';
    const debtDeltaClass = wealth.deltaDebt <= 0 ? 'income' : 'expense';

    return `<h2 class="compare-report-heading">Majątek i zobowiązania</h2>
        <p class="reports-hint compare-wealth-intro">Stan na koniec każdego okresu porównania.</p>
        <div class="compare-wealth-delta-grid">
            <div class="compare-wealth-delta compare-wealth-delta--assets">
                <span class="label">Zmiana majątku</span>
                <strong class="${wealth.deltaAssets >= 0 ? 'income' : 'expense'}">${formatCompareSignedDelta(wealth.deltaAssets)}</strong>
                <span class="compare-wealth-range">${formatPlnAmount(wealth.a.assets)} → ${formatPlnAmount(wealth.b.assets)}</span>
            </div>
            <div class="compare-wealth-delta compare-wealth-delta--debt">
                <span class="label">${debtDeltaLabel}</span>
                <strong class="${debtDeltaClass}">${formatCompareSignedDelta(Math.abs(wealth.deltaDebt))}</strong>
                <span class="compare-wealth-range">${formatPlnAmount(wealth.a.debt)} → ${formatPlnAmount(wealth.b.debt)}</span>
            </div>
            <div class="compare-wealth-delta compare-wealth-delta--net">
                <span class="label">Zmiana net worth</span>
                <strong class="${wealth.deltaNetWorth >= 0 ? 'income' : 'expense'}">${formatCompareSignedDelta(wealth.deltaNetWorth)}</strong>
                <span class="compare-wealth-range">${formatPlnAmount(wealth.a.netWorth)} → ${formatPlnAmount(wealth.b.netWorth)}</span>
            </div>
        </div>
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
            labels: ['Majątek', 'Zobowiązania', 'Net worth'],
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

    reportsCompareChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [
                {
                    label: 'Okres A',
                    data: categories.map((name) => mapA[name] || 0),
                    backgroundColor: theme.prevYearColor,
                    borderRadius: 4,
                    maxBarThickness: 28
                },
                {
                    label: 'Okres B',
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

function renderReportsCompare(ctx) {
    const body = document.getElementById('analysis-compare-report-body');
    if (!body) return;
    const visible = ctx.mode === 'compare';
    if (!visible) {
        body.innerHTML = '';
        destroyReportsCompareCharts();
        return;
    }

    const a = summarizePeriod(ctx.periodA.tx);
    const b = summarizePeriod(ctx.periodB.tx);
    const movers = buildCompareCategoryMovers(ctx.periodA.tx, ctx.periodB.tx);

    body.innerHTML = `
        ${buildCompareTocHtml()}
        <div class="card compare-report-section" id="compare-section-summary">
            <h2 class="compare-report-heading">Podsumowanie</h2>
            <div class="compare-grid">
                <div class="compare-col">
                    <div class="compare-col-label">Okres A</div>
                    <div class="compare-dates">${formatTxDate(ctx.periodA.start)} – ${formatTxDate(ctx.periodA.end)}</div>
                    <div class="compare-stat"><span>Wpływy</span><strong class="income">${formatPlnAmount(a.income)}</strong></div>
                    <div class="compare-stat"><span>Wydatki</span><strong class="expense">${formatPlnAmount(a.expense)}</strong></div>
                    <div class="compare-stat"><span>Bilans</span><strong>${formatPlnAmount(a.balance)}</strong></div>
                    <div class="compare-stat"><span>Oszczędności</span><strong>${a.savings}%</strong></div>
                </div>
                <div class="compare-col">
                    <div class="compare-col-label">Okres B</div>
                    <div class="compare-dates">${formatTxDate(ctx.periodB.start)} – ${formatTxDate(ctx.periodB.end)}</div>
                    <div class="compare-stat"><span>Wpływy</span><strong class="income">${formatPlnAmount(b.income)}</strong><em>${formatComparePct(b.income, a.income)}</em></div>
                    <div class="compare-stat"><span>Wydatki</span><strong class="expense">${formatPlnAmount(b.expense)}</strong><em>${formatComparePct(b.expense, a.expense)}</em></div>
                    <div class="compare-stat"><span>Bilans</span><strong>${formatPlnAmount(b.balance)}</strong><em>${formatComparePct(b.balance, a.balance)}</em></div>
                    <div class="compare-stat"><span>Oszczędności</span><strong>${b.savings}%</strong><em>${formatComparePct(b.savings, a.savings)}</em></div>
                </div>
            </div>
            ${buildCompareDailyStatsHtml(ctx, a, b)}
        </div>
        <div class="card compare-report-section" id="compare-section-wealth">
            ${buildCompareWealthHtml(ctx)}
        </div>
        <div class="card compare-report-section" id="compare-section-categories">
            ${buildCompareCategoryMoversHtml(movers)}
            <div class="compare-chart-wrap">
                <h3 class="compare-subtitle">Wydatki wg kategorii</h3>
                <canvas id="reportsCompareChart" aria-label="Wykres porównania wydatków wg kategorii"></canvas>
            </div>
        </div>
        <div class="card compare-report-section" id="compare-section-transactions">
            ${buildCompareTransactionInsightsHtml(ctx)}
        </div>
        <div class="card compare-report-section" id="compare-section-debts">
            ${buildDebtCompareHtml(ctx)}
        </div>`;

    renderReportsCompareWealthChart(ctx);
    renderReportsCompareChart(ctx);
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
        ? ` class="compare-tx-body compare-tx-clickable" role="button" tabindex="0" onclick="editTransaction(${idx})" onkeydown="if (event.key === 'Enter') editTransaction(${idx})"`
        : ' class="compare-tx-body"';
    return `<span${clickAttrs}>
        <span class="compare-tx-title">${escapeHtml(title)}</span>
        <span class="compare-tx-meta">${formatTxDate(t.date)} · ${escapeHtml(t.mainCategory)}</span>
        <strong class="compare-tx-amount ${t.type === 'income' ? 'income' : 'expense'}">${formatPlnAmount(t.amount)}</strong>
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
            ? ` class="compare-top-tx-row compare-tx-clickable" role="button" tabindex="0" onclick="editTransaction(${idx})" onkeydown="if (event.key === 'Enter') editTransaction(${idx})"`
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

function buildCompareTocHtml() {
    const items = [
        { id: 'compare-section-summary', label: 'Podsumowanie' },
        { id: 'compare-section-wealth', label: 'Majątek' },
        { id: 'compare-section-categories', label: 'Kategorie' },
        { id: 'compare-section-transactions', label: 'Transakcje' },
        { id: 'compare-section-debts', label: 'Długi' }
    ];
    return `<nav class="compare-report-toc" aria-label="Spis treści raportu">
        ${items.map((item) => `<a class="compare-report-toc-link" href="#${item.id}">${item.label}</a>`).join('')}
    </nav>`;
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

function buildCompareTransactionInsightsHtml(ctx) {
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
    const minExpenseA = getExtremeTransaction(txA, 'expense', 'min', true);
    const minExpenseB = getExtremeTransaction(txB, 'expense', 'min', true);
    const repeating = buildCompareRepeatingExpenses(txA, txB);

    const statsHtml = `
        <div class="compare-tx-stats-grid">
            <div class="compare-tx-stat">
                <span class="label">Mediana wydatku</span>
                <div class="compare-tx-stat-values">
                    <span>A: <strong>${medianA !== null ? formatPlnAmount(medianA) : '—'}</strong></span>
                    <span>B: <strong>${medianB !== null ? formatPlnAmount(medianB) : '—'}</strong></span>
                </div>
            </div>
            <div class="compare-tx-stat">
                <span class="label">Dni bez wydatków</span>
                <div class="compare-tx-stat-values">
                    <span>A: <strong>${zeroDaysA.zero}</strong> / ${zeroDaysA.total}</span>
                    <span>B: <strong>${zeroDaysB.zero}</strong> / ${zeroDaysB.total}</span>
                </div>
            </div>
        </div>
        <p class="reports-hint compare-tx-stats-hint">Mediana liczona z pojedynczych wydatków (bez spłat długów).</p>`;

    const extremesHtml = `
        <h3 class="compare-subtitle">Ekstremy</h3>
        <div class="compare-tx-grid">
            <div class="compare-tx-item">
                <span class="compare-tx-label">Najwyższy wpływ</span>
                <div class="compare-tx-period"><span>A</span>${formatCompareTxHighlight(topIncomeAExt)}</div>
                <div class="compare-tx-period"><span>B</span>${formatCompareTxHighlight(topIncomeBExt)}</div>
            </div>
            <div class="compare-tx-item">
                <span class="compare-tx-label">Największy wydatek</span>
                <div class="compare-tx-period"><span>A</span>${formatCompareTxHighlight(maxExpenseA)}</div>
                <div class="compare-tx-period"><span>B</span>${formatCompareTxHighlight(maxExpenseB)}</div>
            </div>
            <div class="compare-tx-item">
                <span class="compare-tx-label">Najmniejszy wydatek</span>
                <div class="compare-tx-period"><span>A</span>${formatCompareTxHighlight(minExpenseA)}</div>
                <div class="compare-tx-period"><span>B</span>${formatCompareTxHighlight(minExpenseB)}</div>
            </div>
        </div>`;

    const topListsHtml = `
        <div class="compare-top-tx-grid">
            <div class="compare-top-tx-col">
                <h3 class="compare-subtitle">Top 5 wpływów</h3>
                <div class="compare-top-tx-block">
                    <span class="compare-top-tx-block-label">Okres A</span>
                    ${buildCompareTopTxListHtml(topIncomeA, 'Brak wpływów w okresie A.')}
                </div>
                <div class="compare-top-tx-block">
                    <span class="compare-top-tx-block-label">Okres B</span>
                    ${buildCompareTopTxListHtml(topIncomeB, 'Brak wpływów w okresie B.')}
                </div>
            </div>
            <div class="compare-top-tx-col">
                <h3 class="compare-subtitle">Top 5 wydatków</h3>
                <div class="compare-top-tx-block">
                    <span class="compare-top-tx-block-label">Okres A</span>
                    ${buildCompareTopTxListHtml(topExpenseA, 'Brak wydatków w okresie A.')}
                </div>
                <div class="compare-top-tx-block">
                    <span class="compare-top-tx-block-label">Okres B</span>
                    ${buildCompareTopTxListHtml(topExpenseB, 'Brak wydatków w okresie B.')}
                </div>
            </div>
        </div>`;

    const exclusiveHtml = (onlyB.length || onlyA.length)
        ? `<div class="compare-tx-exclusive">
            <h3 class="compare-subtitle">Nowe i znikające pozycje</h3>
            <p class="reports-hint">Kategorie/pozycje wydatków obecne tylko w jednym okresie.</p>
            ${onlyB.length ? `<div class="compare-tx-exclusive-block">
                <span class="compare-tx-exclusive-label">Tylko w okresie B</span>
                ${onlyB.slice(0, 6).map((row) => `<div class="compare-tx-exclusive-row">
                    <span>${escapeHtml(row.label)}</span>
                    <strong class="expense">${formatPlnAmount(row.total)}</strong>
                    <em>${row.count}×</em>
                </div>`).join('')}
            </div>` : ''}
            ${onlyA.length ? `<div class="compare-tx-exclusive-block">
                <span class="compare-tx-exclusive-label">Tylko w okresie A</span>
                ${onlyA.slice(0, 6).map((row) => `<div class="compare-tx-exclusive-row">
                    <span>${escapeHtml(row.label)}</span>
                    <strong class="expense">${formatPlnAmount(row.total)}</strong>
                    <em>${row.count}×</em>
                </div>`).join('')}
            </div>` : ''}
        </div>`
        : '';

    const repeatingHtml = repeating.length
        ? `<div class="compare-tx-repeating">
            <h3 class="compare-subtitle">Powtarzające się wydatki</h3>
            <p class="reports-hint">Te same kategorie/pozycje w obu okresach (bez spłat długów).</p>
            ${repeating.map((row) => {
                const sign = row.diff >= 0 ? '+' : '−';
                return `<div class="compare-tx-repeat-row">
                    <div class="compare-tx-repeat-name">${escapeHtml(row.label)}</div>
                    <div class="compare-tx-repeat-stats">
                        <span>A: <strong>${formatPlnAmount(row.totalA)}</strong> (${row.countA}×)</span>
                        <span>B: <strong>${formatPlnAmount(row.totalB)}</strong> (${row.countB}×)</span>
                        <em>${sign}${formatPlnAmount(Math.abs(row.diff))}</em>
                    </div>
                </div>`;
            }).join('')}
        </div>`
        : '';

    return `<h2 class="compare-report-heading">Transakcje</h2>
        ${statsHtml}
        ${extremesHtml}
        ${topListsHtml}
        ${exclusiveHtml}
        ${repeatingHtml}
        <p class="reports-hint compare-tx-footnote">Kliknij transakcję, aby ją otworzyć.</p>`;
}

function buildDebtCompareDetailRow(name, amountA, amountB, deltaFn) {
    return `<div class="debt-compare-card">
        <div class="debt-compare-card-name">${name}</div>
        <div class="debt-compare-card-stats">
            <div><span class="label">Okres A</span><strong>${formatPlnAmount(amountA)}</strong></div>
            <div><span class="label">Okres B</span><strong>${formatPlnAmount(amountB)}</strong></div>
            <div><span class="label">Zmiana</span><em>${deltaFn(amountB, amountA)}</em></div>
        </div>
    </div>`;
}

function buildDebtCompareHtml(ctx) {
    const debtA = getDebtPaymentsForBounds(ctx.periodA.start, ctx.periodA.end, ctx.periodA.tx);
    const debtB = getDebtPaymentsForBounds(ctx.periodB.start, ctx.periodB.end, ctx.periodB.tx);
    const delta = (curr, prev) => {
        if (!prev) return curr > 0 ? '+100%' : '0%';
        const pct = Math.round(((curr - prev) / prev) * 100);
        return `${pct >= 0 ? '+' : ''}${pct}%`;
    };

    const loanRows = getActiveLoans().map((loan) => {
        const name = escapeHtml(getLoanDisplayName(loan));
        const a = ctx.periodA.tx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .reduce((s, t) => s + t.amount, 0);
        const b = ctx.periodB.tx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .reduce((s, t) => s + t.amount, 0);
        if (!a && !b) return '';
        return buildDebtCompareDetailRow(name, a, b, delta);
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
        return buildDebtCompareDetailRow(`${name} (karta)`, a, b, delta);
    }).filter(Boolean).join('');

    const detailRows = loanRows + cardRows;
    const detailBlock = detailRows
        ? `<div class="debt-compare-details">${detailRows}</div>`
        : '';

    return `<div class="debt-compare-section">
        <h2 class="compare-report-heading">Długi</h2>
        <h3 class="analysis-subsection-label">Spłaty długów</h3>
        <div class="compare-grid compare-grid--debt">
            <div class="compare-col">
                <div class="compare-stat"><span>Razem spłaty</span><strong class="expense">${formatPlnAmount(debtA.total)}</strong></div>
                <div class="compare-stat"><span>Raty kredytów</span><strong>${formatPlnAmount(debtA.loanPayments)}</strong></div>
                <div class="compare-stat"><span>Spłaty kart</span><strong>${formatPlnAmount(debtA.cardRepayments)}</strong></div>
            </div>
            <div class="compare-col">
                <div class="compare-stat"><span>Razem spłaty</span><strong class="expense">${formatPlnAmount(debtB.total)}</strong><em>${delta(debtB.total, debtA.total)}</em></div>
                <div class="compare-stat"><span>Raty kredytów</span><strong>${formatPlnAmount(debtB.loanPayments)}</strong><em>${delta(debtB.loanPayments, debtA.loanPayments)}</em></div>
                <div class="compare-stat"><span>Spłaty kart</span><strong>${formatPlnAmount(debtB.cardRepayments)}</strong><em>${delta(debtB.cardRepayments, debtA.cardRepayments)}</em></div>
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
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        return `<div class="reports-top-item">
            <span class="reports-top-rank">${i + 1}</span>
            ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, 'expense')}
            <div class="reports-top-text">
                <span class="reports-top-name">${escapeHtml(title)}</span>
                <span class="reports-top-meta">${formatTxDate(t.date)} · ${escapeHtml(t.mainCategory)}</span>
            </div>
            <div class="reports-top-col">
                <span class="reports-top-amount expense">${formatPlnAmount(t.amount)}</span>
            </div>
        </div>`;
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

    const now = new Date();
    const monthStart = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    const monthExpenses = appState.transactions
        .filter((t) => t.type === 'expense' && t.date >= monthStart && t.date <= localIsoDate(now))
        .reduce((s, t) => s + t.amount, 0);

    const dailyAvg = dayOfMonth > 0 ? monthExpenses / dayOfMonth : 0;
    const forecast = dailyAvg * daysInMonth;
    const remaining = forecast - monthExpenses;

    el.innerHTML = `
        <div class="forecast-stats">
            <div class="forecast-stat">
                <span class="forecast-label">Wydano do dziś</span>
                <strong class="forecast-value expense">${formatPlnAmount(monthExpenses)}</strong>
            </div>
            <div class="forecast-stat">
                <span class="forecast-label">Prognoza na miesiąc</span>
                <strong class="forecast-value">${formatPlnAmount(forecast)}</strong>
            </div>
            <div class="forecast-stat">
                <span class="forecast-label">Szac. do końca mies.</span>
                <strong class="forecast-value">${formatPlnAmount(remaining)}</strong>
            </div>
        </div>
        <p class="reports-hint">Na podstawie średniej dziennej z ${dayOfMonth} dni.</p>`;
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
    if (typeof renderReportsStructureChart === 'function') renderReportsStructureChart(ctx);
    if (typeof renderReportsMonthChart === 'function') renderReportsMonthChart(ctx);
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromOverviewCtx(ctx);
    renderReportsDailyAvg(chartPeriod, ctx.periodTx, chartRangeStart, chartRangeEnd);
    renderReportsSavingsGoal(savingsRate);
}

function renderExpensesSection(ctx) {
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
}

function renderAdvancedSection(ctx) {
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromOverviewCtx(ctx);
    renderReportsTrendChart(chartPeriod, ctx.periodTx, chartRangeStart, chartRangeEnd);
    renderReportsYoYChart(chartPeriod, ctx.periodTx, ctx);
    renderReportsDowChart(ctx.periodTx);
    renderReportsFlow(ctx);
    renderReportsYearReview(ctx);
    if (typeof renderReportsAllocationTrendChart === 'function') renderReportsAllocationTrendChart();
    if (typeof renderReportsDiversificationChart === 'function') renderReportsDiversificationChart(ctx);
    if (typeof renderReportsIkzeLimit === 'function') renderReportsIkzeLimit();
    if (typeof renderReportsMortgageVsRetirement === 'function') renderReportsMortgageVsRetirement();
}

function renderDebtsAnalysisSection(ctx) {
    renderReportsDebtsSection(ctx);
    renderReportsDebtTrendChart(ctx);
    if (typeof renderDebtPeakChart === 'function') renderDebtPeakChart();
}

function renderAnalysisSectionContent(section, ctx, savingsRate, options = {}) {
    if (!ctx || !section) return;
    const force = Boolean(options.force || options.forExport);
    const sectionKey = `${section}|${getReportsContextCacheKey(ctx)}`;
    if (!force && reportsRenderedSections[section] === sectionKey) return;

    setAnalysisSectionLoading(section, true);
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
}

function renderAllAnalysisSectionsForExport(ctx, savingsRate) {
    ANALYSIS_SECTIONS.forEach((section) => {
        renderAnalysisSectionContent(section, ctx, savingsRate, { forExport: true });
    });
}

function invalidateAnalysisRenderCache(ctx) {
    const ctxKey = getReportsContextCacheKey(ctx);
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
    updateReportsForecastVisibility(ctx);

    if (ctx.mode !== 'compare') {
        renderAnalysisSectionContent(analysisSection, ctx, savingsRate, { force: true });
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
